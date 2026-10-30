# Rules on the alyr.qa zone

Rule definitions for the zone itself (not a Worker). The numbers, the reasons, the undo steps and what is waiting are
in `docs/runbooks/cloudflare-edge.md`; check the live state with `scripts/check-edge.sh`.

| File | State | Phase |
|---|---|---|
| `response-header-rules.json` | **Live** since 30 Oct 2026 (three rules: security headers on `api` and `media`, `x-powered-by` removed on `app`) | `http_response_headers_transform` |
| `rate-limit-rule.json` | **Live** since 30 Oct 2026 (applied in the dashboard session after the founder's yes). Block only, because the Free plan has no log or challenge mode. Undo: delete the rule in Security, Security rules, or PUT `{"rules":[]}` to this phase's entrypoint (runbook, step 9) | `http_ratelimit` |

They were applied in the business account's dashboard session, not with a token. To apply or restore one by script, the
founder makes a token for the zone `alyr.qa` only (scopes: runbook, section 4, item 6), and then, for example:

```
curl -X PUT -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  --data @infra/cloudflare/zone/response-header-rules.json \
  "https://api.cloudflare.com/client/v4/zones/<zone id>/rulesets/phases/http_response_headers_transform/entrypoint"
```

A PUT to a phase's entrypoint replaces every rule in that phase, so read the live ones first
(`GET` on the same address) and keep any rule that is not in the file. The zone has one entrypoint per phase and no
other custom rules (30 Oct 2026). Never put the token in a file here.
