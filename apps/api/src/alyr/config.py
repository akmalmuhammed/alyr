from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ALYR_", env_file=".env", extra="ignore")

    # Fails safe: anything that is not explicitly "local" gets sign-in, Secure cookies, no
    # simulator and no stand-in payments. Local tooling (scripts/api-in-docker.sh, tests,
    # CI) sets ALYR_ENV=local on purpose (ALY-114).
    env: str = "production"

    # The app connects as a role that cannot bypass Row-Level Security.
    database_url: str = "postgresql://alyr_app:alyr_app_local@localhost:5432/alyr"
    # Migrations and demo-tenant setup connect as the owner.
    migration_url: str = "postgresql://alyr:alyr_local@localhost:5432/alyr"
    redis_url: str = "redis://localhost:6379/0"
    # The read-only role the nightly backup signs in as (scripts/backup). Only migrations
    # use this setting, to create the role; the app never connects with it. Empty: no
    # backup role is created.
    backup_url: str = ""

    # Run queued jobs inside the API process after each request. Convenient locally
    # and in tests. In production set this to false and run `python -m alyr.worker`.
    jobs_inline: bool = True
    # First retry delay; it doubles on each further attempt.
    jobs_backoff_seconds: float = 5.0
    # How many jobs one process runs at once (a customer's own jobs still one at a time, in
    # order; ALY-276). Each running job may hold two database connections at a moment, so
    # keep it at most half the pool (10 per process).
    jobs_concurrency: int = 5
    # /health/worker answers 503 when the worker has not checked in for this long.
    worker_stale_seconds: int = 120

    # The database connection budget (D-132). Cloud SQL's db-g1-small allows 50 connections, 3 for
    # its own use. A Cloud Run rollout runs the old and the new revision side by side: up to 6 API
    # instances and 2 workers. 6 x 4 + 2 x 8 = 40, leaving room for the migration job, a person's
    # psql and the nightly export. Raise these only together with the database's connection limit.
    db_pool_max: int = 4
    db_pool_max_worker: int = 8
    # How long a request waits for a free connection before it is answered 503 with Retry-After,
    # and how many may wait at once (more are refused at once). Better a quick "busy" than a
    # page that hangs until its caller gives up.
    db_acquire_timeout_seconds: float = 3.0
    db_max_waiting: int = 24
    # PostgreSQL stops a statement that runs longer than this (milliseconds) and a transaction that
    # sits idle longer than the second one. The worker, which makes the weekly reports and draws
    # PDFs, is allowed longer. 0 means no limit.
    db_statement_timeout_ms: int = 15_000
    db_statement_timeout_ms_worker: int = 120_000
    db_idle_in_transaction_ms: int = 60_000
    # More requests than this in progress in one API process are answered 503 with Retry-After
    # at once (core/admission.ShedWhenBusy). Cloud Run is set to send more than this at a time
    # (docs/runbooks/capacity.md), so it is this process that says "busy", not a queue that
    # holds a request until it times out. 0 means no limit.
    max_in_flight: int = 60

    # How long the workspace's answers are kept and shared between tabs (core/pollcache.py, D-131).
    # Unset: 3 seconds in production, off on a developer machine (a test that changes the
    # database under it would read an old answer). 0 switches it off everywhere.
    poll_cache_seconds: float | None = None

    # Local only: let the workspace be used without signing in, as the demo shop.
    # Ignored everywhere except env "local".
    demo_open: bool = True

    # Self-serve sign-up at /start (D-031). Unset: open on a local machine, closed
    # everywhere else until the founder decides to open it.
    signup_open: bool | None = None

    # Where the visitor's address is read from, for the rate limits (ALY-116). Empty: the address
    # the connection came from. A header the visitor can write must never be trusted by
    # accident, so nothing is read from one until this names it. On Google Cloud set
    # "x-alyr-client-ip" together with `client_ip_keys` below (ALY-265).
    client_ip_header: str = ""
    # How many proxies of ours add to a list header such as x-forwarded-for: the address is read
    # that many places from the right, where a visitor cannot have written it. Only used when
    # `client_ip_keys` is empty.
    client_ip_proxies: int = 1
    # Keys that vouch for the address in `client_ip_header` (ALY-265). The edge Worker signs the
    # address it writes (HMAC-SHA256, in the header named like this one plus "-sig") with one of
    # these; the API believes the address only with a signature that matches, and counts every
    # other request in one shared bucket. Comma separated so a key can be replaced without a gap
    # (the edge signs with the first; the API accepts all). Secret. Empty: the header is believed
    # as it stands, which is only safe where nothing but our own proxy can reach the API.
    client_ip_keys: str = ""
    # Prices and the promise are set in the back office, not here (D-032).

    # Local only: read the ALYR Agent as if it were this moment (ISO 8601, with an offset),
    # to look at the samples on a weekday (ALY-99). Ignored everywhere except env "local".
    agent_clock: str = ""

    # Where payment links point. The web app serves /pay/...
    public_web_url: str = "http://localhost:3100"
    # The stand-in payment page, which moves no money, plays a shop's payment provider on a
    # developer machine only (env "local", ALY-114). False switches it off there too, to see
    # what a shop with no payment account of its own gets (ALY-271). It can never switch it on.
    stand_in_payments: bool = True
    # Where the signed-in workspace is served, for the links at the end of an owner's
    # answers in WhatsApp (D-065). Empty until it is hosted: today's public web address is
    # the laptop tunnel, which serves customer pages only, so a workspace link would 404.
    workspace_url: str = ""

    # Other web addresses a signed-in browser may post from, comma separated (ALY-118). The
    # address in `public_web_url` is always allowed; add the console's (ops.alyr.qa) or a
    # workers.dev address of the portal while that is where people sign in.
    allowed_origins: str = ""

    # Signs the order links sent to one customer (HMAC-SHA256, core/links.py, ALY-112). Only
    # a local machine may leave it empty (a built-in development value is used); anywhere
    # else the API refuses to start and refuses to make or read a link without it. At least
    # 32 characters, random, never in git. Changing it ends every link already sent.
    link_secret: str = ""
    # How long an order link works. A customer who opens an older one is told how to get a
    # new one (they ask for one in their chat, as they did for the first).
    link_days: int = 60
    # How long the link to an issued document works (ALY-139). A receipt is something people
    # look for months later, so its link lives longer than an order link; an older link is
    # answered with a page that says so, and the shop sends the document again.
    document_link_days: int = 90

    # Seals the keys shops paste from their payment provider (AES-256-GCM, core/payment_keys.py,
    # ALY-17): 32 random bytes, base64. Only a local machine may leave it empty (a built-in
    # development key is used); anywhere else connecting a payment account is refused until it
    # is set. Never in git. Changing it makes every connected account's keys unreadable: the
    # shops connect again.
    payment_keys_key: str = ""

    meta_app_secret: str = ""
    meta_verify_token: str = ""
    meta_access_token: str = ""
    meta_phone_number_id: str = ""
    meta_waba_id: str = ""
    meta_graph_version: str = "v21.0"
    # The Meta app's ID. Only `templates_sync` needs it, to upload the sample image a
    # template with an image header is reviewed with (Resumable Upload API).
    meta_app_id: str = ""
    # Whether ALYR may submit a message template to Meta for a shop (specs/061, D-146). Off: the
    # back office shows what would be submitted and reads what Meta has, and nothing is sent.
    # Submitting is a Meta-facing action the founder approves; switching this on is that approval.
    template_submit: bool = False
    # Embedded Signup (ALY-39, spec 063, D-148): a business connects its own WhatsApp account
    # through Meta's pop-up, from its sign-up screen. OFF until the founder has done what
    # docs/runbooks/embedded-signup.md lists in Meta (Tech Provider approval, App Review, the
    # configuration) and says so. `meta_es_config_id` is the Facebook Login for Business
    # configuration's ID (not a secret; the browser needs it); the app's ID and secret are the ones
    # above. `channel_keys_key` seals each shop's own token (core/channel_keys.py): 32 random
    # bytes, base64, in Secret Manager, never in git; without it nothing is stored and the feature
    # offers nothing.
    embedded_signup: bool = False
    meta_es_config_id: str = ""
    channel_keys_key: str = ""
    # How often the worker reads every attached number's health from Meta, in minutes (spec 062,
    # D-147): quality rating, status, messaging limit. Reads only. 0 reads nothing (Meta's notices
    # still arrive); the worker then only makes each severity again every hour.
    line_poll_minutes: int = 360

    # The weekly report card (ALY-99). Off: outside the 24-hour window the report goes as
    # the text-only `weekly_report` template, and REPORT brings the card. On (once Meta
    # has approved `weekly_report_card` in both languages): the card goes as the
    # template's image header. Inside the window the card goes either way.
    report_card_template: bool = False

    # The three document templates (`document_receipt`, `document_invoice`,
    # `document_credit_note`) are written and not yet submitted to Meta, so a document cannot be
    # sent outside the customer's 24-hour window. Off: such a send is recorded as "not
    # delivered: template not approved" at once, and falls back to email or the hosted link,
    # instead of failing at Meta six times. Switch it on only after Meta approves all three in
    # both languages (the founder does that; ALY-139, ALY-142). Inside the window a document
    # always goes as the PDF itself, whatever this says.
    document_templates_approved: bool = False

    # Webhooks (ALY-142): send to a shop's address on this machine (http, localhost, a private
    # address). Only read when ALYR_ENV is "local", for tests and for a developer's own
    # receiver; in any other environment the guard in `connect/ssrf.py` always applies.
    webhook_allow_local: bool = False

    # Email ALYR sends (sign-in codes) goes through Resend (D-029). Empty key: no email
    # is sent, and on a local machine the sign-in page shows the code instead.
    email_api_key: str = ""
    email_from: str = "ALYR <no-reply@alyr.qa>"
    email_reply_to: str = "hello@alyr.qa"

    # Alerts to a person's phone and inbox (ALY-121, spec 034, D-073). Both empty: alerts are only
    # logged. The ntfy topic is a secret: anyone who knows it can read and send alerts. An alert
    # holds counts and ages only, never a name, a number or a message.
    alert_ntfy_topic: str = ""
    alert_ntfy_url: str = "https://ntfy.sh"
    alert_email: str = ""

    # Product photos (D-039, ALY-103). With the account ID and both keys set, photos go to
    # Cloudflare R2 and are served from `media_base_url`. With any of the three missing
    # they go to local disk under `media_local_dir` and the API serves them itself, so a
    # developer machine, a test run and a half-configured server all keep working.
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = "alyr-media"
    media_base_url: str = "https://media.alyr.qa"
    media_local_dir: str = ".media"
    # Outside a developer machine, photos on local disk are refused at start-up
    # (`storage.check_store`): a cloud container's disk is wiped on every restart and is not
    # shared between copies. Only a single server whose `media_local_dir` is a kept volume
    # may switch this on (the rehearsal in docker-compose.prod.yml does).
    media_allow_local: bool = False

    # What one upload may be. The web page shrinks a photo before sending it, so these
    # only stop a damaged or hostile file. A 12-megapixel phone photo is about 4 MB.
    media_max_upload_bytes: int = 15 * 1024 * 1024
    media_max_pixels: int = 40_000_000

    # The Catalog is on (ALY-113, D-039). With this on, a business created from now on starts
    # with its type's own catalog (ALY-107, `presets_catalog.py`: the `catalog` module, the
    # type's starting values and categories, and a few sample items), and the three types that
    # exist only for the Catalog are offered; travel and documents have none. Set it to false
    # (`ALYR_CATALOG_FOR_NEW_SHOPS=false`) and a new business is created exactly as it was
    # before the Catalog. It decides for businesses created from now on; the shops that
    # already existed got the module from migration 0032, and the back office can switch it
    # off for any one shop.
    catalog_for_new_shops: bool = True

    # The ways ALYR can connect a business's WhatsApp today (ALY-217, D-050), by key from
    # `core/whatsapp_setup.py`, comma separated: new_number, move_number, own_account. Empty
    # until Meta approves ALYR as a Tech Provider (ALY-52); until then a business that has
    # everything ready shows "waiting for Meta", and ALYR says so honestly.
    whatsapp_ways_open: str = ""

    # How a client pays ALYR by bank transfer (ALY-212, D-051): the account name, bank and
    # IBAN, shown to the owner beside the amount and their reference. Not a secret. Empty
    # until ALYR's company account is open; the owner is then told ALYR sends the details.
    bank_transfer_details: str = ""

    # A client pays ALYR by card through Paddle (ALY-180, D-074). "paddle": every client is
    # offered a card payment at go-live, unless the back office switches it off for one.
    # Empty: no client is, whatever the back office says. It is only offered while the three
    # Paddle values below are set. Paddle charges in US dollars (core/paddle.py).
    card_billing: str = ""
    # "sandbox" (sandbox-api.paddle.com, test cards) or "live" (api.paddle.com). Live waits
    # for Paddle's approval of the website and for the customer agreement (ALY-98).
    paddle_environment: str = "sandbox"
    # The server API key, and the secret of the notification destination that signs
    # webhooks. Both secrets: Secret Manager in production, never in git.
    paddle_api_key: str = ""
    paddle_webhook_secret: str = ""
    # The client-side token Paddle.js opens the checkout with (starts with test_ or live_).
    # Paddle makes it to be shown in a web page: not a secret.
    paddle_client_token: str = ""

    # A client whose next period is not paid (ALY-218, D-082): everything keeps working for
    # this many days after the due date, with reminders to the owner. Then, while
    # `billing_pause_sending` is on, ALYR pauses its automatic replies and templates for the
    # client's businesses until they pay. Nothing is deleted and the workspace stays open.
    billing_grace_days: int = 14
    billing_pause_sending: bool = True

    # The weekly report is due at 9:00 on Sunday, as the site says. This spreads it over that many
    # minutes after nine, by shop (a fixed share for each shop, from its ID), so a hundred reports
    # are not made in the same minute. 0, the default, keeps every shop at nine exactly: fifty
    # reports and five messages a second measured 3.8 s at the 95th percentile for a reply, with
    # the worker keeping places for customers (D-132); turn this on at about a hundred shops, and
    # change what the site says first ("at 9:00" becomes "on Sunday morning").
    report_spread_minutes: int = 0

    # Deleting a stopped client's data (spec 042, D-116). The privacy notice promises it 60 days
    # after the client's cancellation takes effect. `erase_stopped_clients` is the switch: OFF,
    # the daily job (`python -m alyr.erase_job`) only reports what it would delete and changes
    # nothing. The founder turns it on (infra/gcp/erase.sh enable) once the lawyer has read the
    # keep-list (ALY-51). `erase_after_days` is never read below 31, so the 30 days the notice
    # gives a business to download its copy are always over first. `erase_max_per_run` is how
    # many businesses one run may erase: a mistake in the dates cannot empty the database in a
    # night, and the rest wait for the next run.
    erase_stopped_clients: bool = False
    erase_after_days: int = 60
    erase_max_per_run: int = 3

    # Per shop, to start (D-039; our estimate). A cap stops new items or photos with a
    # clear message and never deletes anything.
    catalog_max_items: int = 1000
    catalog_max_photos: int = 3000

    # Importing a spreadsheet (ALY-108): the largest sheet, and the largest zip of photos
    # that goes with it. Both are read into memory, so they are bounded; a sheet of 500
    # items is about 100 KB.
    catalog_import_max_bytes: int = 5 * 1024 * 1024
    catalog_import_max_zip_bytes: int = 40 * 1024 * 1024

    # R2's free tier is 10 GB-month of storage (checked 17 Oct 2026). Gigabytes here are
    # decimal, which is the smaller reading, so the alert comes early rather than late.
    media_free_bytes: int = 10_000_000_000
    media_alert_percent: int = 80


@lru_cache
def get_settings() -> Settings:
    return Settings()


def poll_cache_seconds(settings: Settings) -> float:
    if settings.poll_cache_seconds is not None:
        return settings.poll_cache_seconds
    return 0.0 if settings.env == "local" else 3.0
