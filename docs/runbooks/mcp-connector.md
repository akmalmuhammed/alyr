# The MCP connector: switch it on, check it, stop it

For the connector in `specs/067-mcp-connector/spec.md` (D-170, ALY-286): an owner's own Claude or ChatGPT calls ALYR. Written so a tired person can follow it. Nothing here needs a code change.

## What is where

- **The code** is part of the API (`apps/api/src/alyr/modules/mcp/`, routes in `routes/mcp.py`, `routes/mcp_oauth.py`, `routes/mcp_manage.py`), the same Cloud Run service as everything else.
- **The address** an app uses is `https://mcp.alyr.qa/mcp`. It is the same API behind the edge Worker; `ALYR_MCP_PUBLIC_URL` must say exactly that (no trailing slash needed, https).
- **Three switches**, from the widest to the narrowest:
  1. `ALYR_MCP_ENABLED` (the whole installation; unset means off in production),
  2. a business's own opt-in and pause (`mcp_settings`, from the workspace API `/api/mcp`),
  3. each connection (a permission, `mcp_grants`), which an owner or admin can end.
- **The record**: every call is a row on the activity record with channel `mcp` (the business's own activity, `/api/mcp/activity`).

## Switch it on (the founder, after the lawyer and the Cloud Run and DNS steps)

Not done yet, and not for the first pull request to do. In order:

1. The go-live lane makes `mcp.alyr.qa` reach the API: a DNS record on the alyr.qa zone and a route for that hostname in the edge Worker (`infra/cloudflare/edge`, the same way `api.alyr.qa` is routed). Check from outside: `curl https://mcp.alyr.qa/.well-known/oauth-authorization-server` answers 404 while it is off.
2. The migration `0130_mcp_connector.sql` is applied by the release as always. It changes nothing for a business: every table is empty and the connector is off.
3. Set on the API service: `ALYR_MCP_PUBLIC_URL=https://mcp.alyr.qa` and then `ALYR_MCP_ENABLED=true`. (`ALYR_MCP_TEST_TOOLS` stays unset: the two test tools exist only for tests.) The worker needs neither; the alert rules it already runs read the connector's counts.
4. Check: the two metadata documents answer 200 with `issuer` and `resource` equal to `https://mcp.alyr.qa` and `https://mcp.alyr.qa/mcp`; `POST https://mcp.alyr.qa/mcp` without a token answers 401 with a `WWW-Authenticate` header naming `resource_metadata`.
5. Add the connector in a Claude or ChatGPT account of your own on the fictional demo business, owner role, and ask for `hello`. The first real client run has not been done (see the pull request's "not checked").

## Stop everything now

`gcloud.cmd run services update alyr-api --region me-central1 --update-env-vars ALYR_MCP_ENABLED=false` (a new revision starts in a minute; every path answers 404 and every token is dead until it is switched back on). Nothing is deleted. To bring it back, set it to `true`.

## Stop one business

The owner or an admin, on the workspace screen **Connections, Connected apps** (`/app/connect-ai`: Pause all apps, End, End all connections; the entry shows only where the connector is on for the server), or the workspace API `POST /api/mcp/pause` (every call of that business is refused at once, nothing is revoked; `POST /api/mcp/resume` undoes it), `POST /api/mcp/switch-off` (the opt-in is withdrawn; an owner must confirm again), `POST /api/mcp/grants/revoke-all`.

From the back office or the database, as the database owner, when nobody in the business can:

```sql
update mcp_settings set paused_at = now(), paused_by = 'ALYR' where tenant_id = '<business id>';
update mcp_grants set revoked_at = now(), revoked_by = 'ALYR', revoked_why = 'ended_by_alyr'
  where tenant_id = '<business id>' and revoked_at is null;
```

## Stop one person

Remove them from the team: their tokens stop at the next call and a refresh ends the permission. Or end their permissions: `DELETE /api/mcp/grants/<id>` (an owner or admin), or the app's own revoke.

## What an alert means

Both reach the founder's phone with counts only (D-073); look in the business's activity record, channel `mcp`.

- **A connected app is changing a lot** (`mcp_write_burst`): 25 or more confirmed changes by one business in ten minutes. The daily cap (50 changes, 20 sends by default) already bounds it. Pause the business, read the record, ask the owner.
- **An app was connected from a new place** (`mcp_new_place`): a person who had connected before did it from an address none of their earlier connections came from. If the owner did not do it, end the connection and pause the business.

## What is not built yet

The real tools (ALY-290, ALY-291, ALY-327), an email or message to the owner when a daily cap is reached, the security review and red team (ALY-296, the gate before any real business turns it on), and the lawyer's answer (ALY-51).
