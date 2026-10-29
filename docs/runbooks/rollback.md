# Rolling back production, and rehearsing it

Written 30 Oct 2026 (ALY-269). Going forward is [release.md](release.md). The public site's
rollback (Cloudflare) is in [site-deploy.md](site-deploy.md), "Roll back".

**Not rehearsed yet.** The commands below were checked against Google's documentation and the
installed `gcloud` help, and `infra/gcp/rollback.sh` against a stand-in `gcloud`. Nobody has
run any of it against production. The rehearsal below is how that changes.

## How it works

Every `deploy-gcp` run makes one new revision of `alyr-api` and one of `alyr-web`, and moves
the worker pool to a new revision. Cloud Run keeps the earlier ones (12 were kept on 28 Oct).
Going back is a **traffic split**: send 100% of a service's traffic to an earlier revision. It
takes seconds, rebuilds nothing, and brings back that revision's image **and** its settings
(environment variables, secrets, scaling), which the image swap in docs/hosting.md does not.
Google's page on it: "Rollbacks, gradual rollouts, and traffic migration" in the Cloud Run
documentation.

| Part | What it is | Go back | Return to the newest |
|---|---|---|---|
| `alyr-api`, `alyr-web` | Cloud Run services | `gcloud run services update-traffic NAME --to-revisions REVISION=100` | `… update-traffic NAME --to-latest` |
| `alyr-worker` | Cloud Run worker pool | `gcloud run worker-pools update-instance-split NAME --to-revisions=REVISION=100` | `… update-instance-split NAME --to-latest` |

**A service stays pinned after a rollback.** Google: "all subsequent deployments use that
traffic split pattern going forward". A later deploy would build a new revision that gets no
traffic. `deploy-gcp` therefore sends all three back to "latest" right after it rolls out, before
its health check. Between a rollback and the next deploy, production runs the old revision on
purpose.

The script `infra/gcp/rollback.sh` wraps those commands so nobody types a revision name from
memory during an incident. It reads freely, and changes only after it printed the command and
you typed `yes`.

```bash
infra/gcp/rollback.sh status                       # what serves now
infra/gcp/rollback.sh revisions alyr-api           # newest first, with the image
infra/gcp/rollback.sh to alyr-api alyr-api-00011-abc
infra/gcp/rollback.sh forward alyr-api             # or no name: all three
infra/gcp/rollback.sh check                        # the health checks deploy-gcp runs
```

## Going back (production is wrong now)

1. **Find the good revisions.** The last `deploy-gcp` run's summary lists "Serving before this
   run": those are the revisions to go back to. Or `rollback.sh revisions alyr-api` (and
   `alyr-web`, `alyr-worker`) and take the one built from the last good release. A revision
   made by an environment change has the same image as its neighbour: pick by time and image,
   not by position.
2. **Check the migrations** (next section) before you go back past one.
3. **Go back, web app first** (the lowest risk), then the API, then the worker:

   ```bash
   infra/gcp/rollback.sh to alyr-web    <web revision>
   infra/gcp/rollback.sh to alyr-api    <api revision>
   infra/gcp/rollback.sh to alyr-worker <worker revision>
   infra/gcp/rollback.sh check
   ```

4. **Look at it:** `https://app.alyr.qa/login`, and `/health/worker` has to turn green within
   two minutes (the worker checks in every 30 seconds).
5. **Say so:** put in `docs/status.md` what is live (versions and revisions) and why. If
   customers were affected, follow [incident-response.md](incident-response.md).
6. **Fix forward.** Merge the fix, cut the next version ([release.md](release.md)). That
   deploy moves traffic back to "latest" by itself. Doing it by hand: `rollback.sh forward`.

### Going back across a migration

`deploy-gcp` runs the migrations **before** it rolls out the new code, and a rollback never
undoes one. The old code then runs on the new schema. That is fine when the migration only
added (a table, a nullable column, an index) and breaks when it removed, renamed or tightened
something the old code uses.

Before going back past a release, read what it migrated:
`git diff <old tag>..<new tag> --stat -- apps/api/migrations` and open the new files. If one
drops, renames, retypes or makes a column required, **do not go back**: fix forward, or, if
data was damaged, restore from a backup or a point-in-time clone (docs/hosting.md, "Backups on
Google"). Write migrations so that going back stays possible: add first, switch the code, remove
in a later release.

## Rehearsal (once before the first real client, and after the deploy path changes)

About 20 minutes, in a quiet hour. There is no staging, so this moves production traffic
twice; with a healthy older revision it is invisible to visitors. Needs two releases that
differ, so run it after the second `deploy-gcp` release. A rehearsal between two revisions with
the same image only proves the commands.

Write the times down as you go.

1. `rollback.sh status`, then `rollback.sh revisions alyr-web` and the same for `alyr-api` and
   `alyr-worker`. Note the newest revision of each and the one before it that has a **different
   image**. Read the migrations between the two releases (section above); if any is not
   additive, stop and pick another pair, or wait for the next release.
2. **Web app.** `rollback.sh to alyr-web <older>`. Open `https://app.alyr.qa/login`.
   `rollback.sh status` shows 100% on the older revision. Then `rollback.sh forward alyr-web`:
   100% on "latest" again, the login page still opens.
3. **API.** `rollback.sh to alyr-api <older>`, then `rollback.sh check`: `/health/ready` and
   `/health/worker` answer. Send a WhatsApp message to ALYR's test number and see it answered.
   `rollback.sh forward alyr-api`, then `check` again.
4. **Worker.** `rollback.sh to alyr-worker <older>`. Wait up to two minutes, `check` shows
   `/health/worker` healthy, and the test message still gets an answer. Watch that exactly one
   worker instance runs (`rollback.sh revisions alyr-worker` and the console), not two.
   `rollback.sh forward alyr-worker`.
5. **Deploy after a rollback.** Roll the web app back once more and leave it there. Run a
   normal `deploy-gcp` release (any commit that is allowed to ship). Its summary must show the
   web app on the **new** revision, and `rollback.sh status` must show "latest" at 100%. That
   proves the "send traffic to latest" step in the workflow.
6. **Record it** in `docs/status.md` and in the go-live checklist: date, the revisions used,
   how long each step took, and anything that surprised you.

It passes when every `to` and `forward` took effect within a minute, the health checks stayed
green, a message was answered at each step, and step 5 left the newest release serving.

What the rehearsal is also for: nobody has yet shown that the deploy account
(`roles/run.developer`) may change the worker pool's instance split. Step 5 runs that command
from GitHub; if it is refused, the deploy fails after the rollout and the log says which
permission is missing.

## Not covered here

- **Data.** A bad write, a deleted table: restore from a backup or a point-in-time clone
  (docs/hosting.md; CLD-5 asks for a rehearsed recovery runbook).
- **The edge Worker `alyr-edge`** (app.alyr.qa, api.alyr.qa): published from the laptop with
  `wrangler`; its previous deployments are under Workers & Pages → alyr-edge → Deployments.
- **The public site:** [site-deploy.md](site-deploy.md), "Roll back".
