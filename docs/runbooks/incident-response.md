# Incident response

For when something is broken or someone may have seen data they should not. Written to be
followed by one tired person. Keep notes as you go: times, what you saw, what you did.
Production is Google Cloud in Doha (project `alyr-prod`, region `me-central1`, D-060) behind
Cloudflare. How it is laid out: `docs/hosting.md`.

| | |
|---|---|
| **On call** | **FOUNDER TO FILL IN: name, phone, and the hours ALYR promises clients (for example "answered 08:00 to 22:00 Doha time, every day")** |
| Second person | None yet. Until there is one, a missed alert waits for the on-call person |
| Alerts reach | Email `akmal@alyr.qa` today. The phone is added with `infra/gcp/monitoring.sh` (steps in `infra/gcp/README.md`); until it is, nothing wakes anyone at night |

## 0. The commands

Sign in once: `gcloud auth login akmal@alyr.qa`. Every command below is meant to be copied;
set these once so they stay short:

```bash
gcloud config set project alyr-prod
gcloud config set run/region me-central1
```

On Windows run them in Git Bash after `source infra/gcp/gcloud.sh`, and type `gcloud_run` where
this page says `gcloud`.

Where to look first:

| What | Where |
|---|---|
| Is it up? | `curl -s https://api.alyr.qa/health/ready` (database), `https://api.alyr.qa/health/worker` (worker alive), `https://app.alyr.qa/login` |
| Alerts open now | `infra/gcp/monitoring.sh status`, or Monitoring > Alerting in the console |
| Logs | Logs Explorer, project `alyr-prod`, storage `alyr-doha`. From a terminal: `gcloud logging read '<filter>' --bucket=alyr-doha --location=me-central1 --view=_AllLogs --freshness=1h` |
| Revisions | `gcloud run revisions list --service alyr-api` (same for `alyr-web`) |

## 1. First ten minutes, every incident
1. **Is customer data exposed or is money affected?** If yes, it is a Severity 1: stop other work.
2. **Stop the harm before finding the cause.** Turn the thing off rather than debug it live
   (section 2). Everything there can be undone.
3. **Write one line in Linear** (label `Incident`): what, since when, who is affected.

| Severity | Examples | Respond |
|---|---|---|
| 1 | Data from one shop visible to another; a secret leaked; payments marked paid wrongly | Now, until contained |
| 2 | WhatsApp replies stop; sign-in broken; site down | Within the hour |
| 3 | One feature wrong for one shop | Next working day |

## 2. Stop the harm

Pick the smallest switch that stops it. Each one has its undo next to it.

| To stop | Do | Undo |
|---|---|---|
| Everything the public can reach on the API, including Meta's webhook (Google answers 403 before ALYR's code runs) | `gcloud run services remove-iam-policy-binding alyr-api --member=allUsers --role=roles/run.invoker` | `gcloud run services add-iam-policy-binding alyr-api --member=allUsers --role=roles/run.invoker` |
| The workspace and every customer page | The same two commands on `alyr-web` | The same |
| Sending, reminders and the weekly report (the worker; the queue keeps waiting in the database) | `gcloud run worker-pools update alyr-worker --instances=0` | `gcloud run worker-pools update alyr-worker --instances=1` |
| Meta's events only, when the webhook itself is the problem (a flood, a forged sender) | Meta for Developers > app `alyr` (1071845795713841) > WhatsApp > Configuration > Webhook fields > Manage: switch `messages` off | `infra/gcp/setup.sh meta-webhook 1071845795713841` |
| A bad public-site publish | `docs/runbooks/site-deploy.md`, "Roll back" | |

Things that trip people:
- **Scaling `alyr-api` or `alyr-web` to zero does not stop them.** The next request starts a new
  copy. Removing `allUsers` does.
- **While `allUsers` is removed, do not run `infra/gcp/setup.sh apps`.** It adds it back. The GitHub
  deploy (`deploy-gcp`) does not.
- With the API closed, Meta's deliveries fail and Meta retries them for a while, so customers'
  messages are usually answered late, not lost. With `messages` switched off at Meta, assume
  messages sent in that time are lost: Meta does not promise to deliver them after you
  subscribe again. Prefer closing the API unless the webhook is the harm.
- The old `scripts/demo.sh down` and the tunnel belong to the laptop demo. They do nothing for production.

## 3. A bad deploy: roll back by splitting traffic

Cloud Run keeps every revision, and the environment and secrets go back with it, so this is
faster and safer than rebuilding an old image.

```bash
gcloud run revisions list --service alyr-api            # newest first; note the last good one
gcloud run services update-traffic alyr-api --to-revisions=<good revision>=100
gcloud run services update-traffic alyr-web --to-revisions=<good revision>=100   # if the web app was deployed too
curl -s https://api.alyr.qa/health/ready                # check
```

- To try the new one on a few visitors first: `--to-revisions=<good>=90,<new>=10`.
- **The worker has no traffic.** It runs the image it was deployed with. Roll it back by naming the
  old image (the API revision shows it: `gcloud run revisions describe <good revision>
  --format='value(spec.containers[0].image)'`):
  `gcloud run worker-pools update alyr-worker --image=<that image>`.
- **Migrations only go forward.** If the bad deploy ran one, ask whether the old code still works
  with the new tables before rolling back. If not, fix forward, or restore (section 4).
- Traffic stays pinned to the revision you chose: later deploys are not served until you run
  `gcloud run services update-traffic alyr-api --to-latest`. Do that once the fix is out.
- If the edge Worker `alyr-edge` is what broke (both addresses wrong at once, run.app addresses fine):
  `wrangler rollback` in `infra/cloudflare/edge`, as `site-deploy.md` does for the site.

## 4. The database is down, wrong or lost

Cloud SQL `alyr-db` is one instance in one zone, with no standby (CLD-5). Backups: nightly, 14
kept, and point-in-time recovery for 7 days; plus a nightly export in `gs://alyr-prod-db-exports`
kept 35 days.

1. **Down, but data fine** (`/health/ready` is 503, alert "API cannot reach the database"):
   check Cloud SQL > `alyr-db` for maintenance or an operation in progress
   (`gcloud sql operations list --instance alyr-db --limit 5`). A restart is
   `gcloud sql instances restart alyr-db` (about a minute; the apps reconnect by themselves).
2. **Data wrong or lost** (a bad migration, a bad import, someone deleted rows): restore to a
   moment before it happened. **A restore makes a new instance with a new private address, so
   both database secrets must be rewritten and the API and worker restarted.** The full steps,
   with the timings measured on 30 Oct 2026, are in `docs/runbooks/restore-rehearsal.md`:

   ```bash
   infra/gcp/restore.sh clone alyr-db-restored 2026-10-30T09:15:00Z   # UTC, a moment before the damage
   infra/gcp/restore.sh check alyr-db-restored                        # counts only, nothing shown
   infra/gcp/restore.sh repoint alyr-db-restored                      # both secrets, then the API and worker
   ```

3. Close the API first (section 2) if the damage is still spreading, and say so to merchants (section 7).

## 5. A secret leaked
(A key or token in git, chat, a screenshot, a log, a public place.)
1. **Revoke it first**, then replace it (`docs/runbooks/secret-rotation.md`; on Google a new value
   goes in with `infra/gcp/setup.sh set-secret <name>`, which also restarts the API and the
   worker). Removing it from git history does not help: assume anything pushed or pasted has been copied.
2. Check the provider's logs for use you do not recognise (Resend emails, Meta messages,
   Cloudflare audit log, Google's audit log: Logs Explorer, `logName:"cloudaudit.googleapis.com"`).
3. Note it in the incident issue, with the time it leaked and the time it was revoked.

## 6. A shop may have seen another shop's data (a breach)
The first three steps are the same whatever the size. Do them in this order.
1. **Contain.** Close the affected screen or route: roll back the deploy (section 3) or close the
   API (section 2). Do not delete anything, logs included.
2. **Keep the evidence.** Application logs live 30 days in `alyr-doha`. Copy the window around the
   incident out of the log bucket before it ages out, to a file only the founder can read, never to the repository:
   `gcloud logging read '<filter>' --bucket=alyr-doha --location=me-central1 --view=_AllLogs --freshness=7d > incident.log`.
   Note the revision that was live (`gcloud run revisions list`).
3. **Find the scope:** which shops, which records, from when to when. The activity record in the database,
   the API logs, and the revision timeline answer it. Write the answer down as counts and shop names,
   not copies of the data.
4. **Tell the affected shops without delay**, in plain words: what happened, what data, what we did,
   what they should do (section 7 has the wording). A shop is the one that holds the relationship
   with its own customers, and may owe its customers a notice too.
5. **The regulator.** Qatar's Law No. 13 of 2016 asks for a breach that may seriously harm people to be
   notified to the affected people and to the authority. As of 30 Oct 2026 no one has confirmed
   for ALYR *which* authority and *what deadline* (sources disagree; the lawyer's answer is ALY-51).
   Get legal advice the same day, before writing to anyone, and keep the facts ready: what, who, when, what we did.

   | Filled in after ALY-51 | |
   |---|---|
   | Authority and how to reach it | **FOUNDER AND LAWYER TO FILL IN** |
   | Deadline from discovery | **FOUNDER AND LAWYER TO FILL IN** |
   | Who signs the notice | **FOUNDER TO FILL IN** |

6. Rotate anything the attacker could have read (section 5) and write the review (section 8).

## 7. Tell the merchants

Send the same day, from `hello@alyr.qa`, to each affected shop's owner. A shop that is not affected
gets a shorter note only if the outage was visible to its customers. Fill the brackets; never
include another shop's name, a customer's number or a message's text.

> **Subject:** [What happened] on [date]: what we know and what we are doing
>
> Hello [owner's name],
>
> On [date] at [time, Doha], [one sentence: what stopped working or what went wrong, for example
> "WhatsApp replies from ALYR stopped for 2 hours"]. It affected [your shop / all shops].
>
> **What it meant for you:** [for example "customers who wrote between 14:00 and 16:00 got no reply; their
> messages are in your inbox and you can answer them now" / "no data was seen by anyone outside ALYR"].
> **What data was involved:** [none / the kind, the number of records, the period].
> **What we have done:** [fixed at / switched off / restored to / changed all keys].
> **What you need to do:** [nothing / answer these customers / change your password].
>
> We will write again by [time] with the full explanation. You can reach [on-call name] on
> [phone or WhatsApp] [hours].
>
> ALYR

Arabic version, to be read by a native speaker before its first use:

> **الموضوع:** [ما حدث] بتاريخ [التاريخ]: ما نعرفه وما نفعله
>
> مرحباً [اسم المالك]،
>
> في [التاريخ] الساعة [الوقت بتوقيت الدوحة] [جملة واحدة: ما الذي توقف أو ما الذي حدث، مثل: "توقفت ردود واتساب من ALYR لمدة ساعتين"]. وقد أثّر ذلك على [متجرك / جميع المتاجر].
>
> **ما معنى ذلك لك:** [مثل: "عملاء راسلوا بين 14:00 و16:00 لم يتلقوا رداً، ورسائلهم في صندوق الوارد ويمكنك الرد عليها الآن" / "لم يطّلع أي طرف خارج ALYR على أي بيانات"].
> **البيانات المعنية:** [لا شيء / نوعها وعدد السجلات والفترة].
> **ما فعلناه:** [أصلحنا في / أوقفنا / استعدنا إلى / غيّرنا جميع المفاتيح].
> **ما المطلوب منك:** [لا شيء / الرد على هؤلاء العملاء / تغيير كلمة المرور].
>
> سنكتب إليك مرة أخرى قبل [الوقت] بالشرح الكامل. يمكنك التواصل مع [اسم المناوب] على [الهاتف أو واتساب] [الساعات].
>
> ALYR

Do not post on social media or tell the press before the shops have been told.

## 8. WhatsApp stopped replying
1. `curl -s https://api.alyr.qa/health/ready` and `/health/worker`. 503 on `ready`: the database (section 4).
   503 on `worker`: the worker stopped checking in; look at `gcloud run worker-pools describe alyr-worker`
   and its logs, then restart it with `gcloud run worker-pools update alyr-worker --update-env-vars=ALYR_SECRETS_AT=$(date -u +%Y%m%dT%H%M%SZ)`.
2. Failed jobs: back office > delivery problems, or `GET /api/jobs/failed` for one shop. Many failures at once
   usually mean Meta's token expired (`infra/gcp/setup.sh set-secret meta-access-token`) or a template was paused.
3. Messages arriving? Meta app dashboard > WhatsApp > Configuration: the callback must be
   `https://api.alyr.qa/webhooks/whatsapp` with `messages` on. The alert "No WhatsApp message received"
   (when `docs/runbooks/monitoring.md` is in place) and the uptime check on `api.alyr.qa` watch this.
4. Meta's status page and the app's quality rating.

## 9. Afterwards (within a week, for Severity 1 and 2)
Write `docs/audit/incident-<date>.md`: timeline, cause, why our checks missed it, and the
issue numbers of the fixes. No blame; the point is the missing guard. If an alert did not fire or
did not reach a phone, that is a fix too (`infra/gcp/monitoring.sh`).
