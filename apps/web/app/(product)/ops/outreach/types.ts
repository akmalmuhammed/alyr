// The shapes the outreach screens read from `/api/admin/outreach` (specs/065, ALY-311). The API's
// answers in `routes/admin_outreach.py` (ALY-310) are the authority; these follow them. The API also
// sends fields the screens do not read (simulated, stage_reason, published_emails, pages, source_ref,
// basis_problem, warnings, kind, erased); they are left out here.
// Times are ISO 8601 strings in UTC. No secret ever appears in any of these.

// ── words the engine uses ───────────────────────────────────────────────────────────────────

export type Stage =
  | "new" | "researching" | "researched" | "drafting" | "in_review" | "approved" | "sending" | "done"
  | "needs_human" | "disqualified" | "rejected" | "replied" | "bounced" | "opted_out";

/** The country lane from `outreach/policy.py`. */
export type Lane = "allowed" | "consent_only" | "blocked";

/** Why ALYR may write to this contact at all (recorded per prospect). */
export type Basis =
  | "published_business_contact" | "existing_relationship" | "referral" | "opt_in" | "inbound"
  | "legitimate_interest" | "conspicuous_publication";

/** Autonomy per sequence: 0 draft only, 1 approve every message, 2 approve the first, 3 narrow autopilot. */
export type Level = 0 | 1 | 2 | 3;

/** The email verifier's answer; null when nobody verified the address (typed or imported by hand). */
export type Verifier = "valid" | "accept_all" | "invalid" | "disposable" | "unknown" | null;

export type ProspectSource = "manual" | "import" | "discovery" | "places" | "overture";
/** "published": found on the business's own site; "overture": listed in the Overture places data. */
export type EmailSource = "manual" | "import" | "finder" | "published" | "overture";
export type Language = "en" | "ar";
export type DraftStatus = "in_review" | "approved" | "rejected" | "superseded" | "sent";
export type ReplyLabel =
  | "interested" | "question" | "not_now" | "not_interested" | "wrong_person" | "referral" | "opt_out" | "other";
/** "places" and "page_reader" are optional; "engine" is the engine's own settings (legal line, offer,
 *  booking link, unsubscribe secret and address). */
export type ServiceKey =
  | "model" | "discovery" | "places" | "email_finder" | "page_reader" | "smtp" | "imap" | "engine";

// ── the brief and the drafts ────────────────────────────────────────────────────────────────

/** One claim of the Researcher's brief. Kept only when `quote` was found on the stored page. */
export type Claim = {
  id: string;            // the claim id the Composer cites, unique within the prospect ("c1")
  text: string;
  url: string;
  quote: string;         // the exact words from that page
  kept: boolean;
  dropped_reason: string | null; // why code dropped it ("quote not found on the page"), null when kept
};

/** One sentence of a draft and the claims it rests on (empty: a greeting, the opt-out line). */
export type Sentence = { text: string; claim_ids: string[] };

/** One finding of the critic or the lint. `key` names the rule ("no_link", "under_150_words",
 *  "uncited_fact", "subject_length", "opt_out_line", "legal_line", "plain", "true_to_offer"...). */
export type Finding = { key: string; ok: boolean; note: string };
export type CheckResult = { ok: boolean; findings: Finding[] };

export type Draft = {
  id: string;
  prospect_id: string;
  kind: "sequence" | "booking_reply";  // booking_reply: the Concierge's answer to a clear "yes"
  step: 1 | 2 | 3;                      // 1 for a booking reply too
  version: number;
  subject: string;
  body: string;
  language: Language;
  sentences: Sentence[];
  critic: CheckResult | null;           // null until the critic has run, and always on follow-ups (only step 1 is criticised)
  lint: CheckResult;
  body_hash: string;                    // what an approval is bound to
  status: DraftStatus;
  created_by: string;                   // "model", or who edited it
  created_at: string;
  wait_working_days: number | null;     // follow-ups: working days after the step before (3, then 7)
};

// ── prospects ───────────────────────────────────────────────────────────────────────────────

/** A row of the prospects list. */
export type ProspectRow = {
  id: string;
  company: string;
  website: string;
  domain: string;
  country: string;                      // ISO 3166-1 alpha-2, upper case
  lane: Lane;
  business_type: string;
  source: ProspectSource;
  stage: Stage;
  paused: boolean;
  contact_first_name: string;
  contact_role: string;
  email_verifier: Verifier;
  basis: Basis | null;
  level: Level;                         // effective: the lower of the sequence's and the country's cap
  fit_score: number | null;             // 0 to 100
  updated_at: string;
};

export type Approval = { id: string; draft_id: string; body_hash: string; by: string; at: string };

export type Send = {
  id: string;
  draft_id: string;
  step: 1 | 2 | 3;
  sent_at: string;
  message_id: string;
  status: "sent" | "bounced";
};

/** An intent the gateway has not sent yet, and where it stands. */
export type Intent = {
  id: string;
  step: 1 | 2 | 3;
  draft_id: string;
  run_at: string;
  status: "queued" | "sent" | "held" | "blocked" | "rescheduled" | "dropped";
  last_check: number | null;            // 1 to 11, the gateway check that decided last
  last_result: string;
};

export type OutreachEvent = {
  at: string;
  kind: string;                         // "stage", "research", "draft", "approval", "send", "reply",
                                        // "refusal", "pause", "resume", "disqualify", "opt_out", "bounce"
  actor: "staff" | "engine";            // never an address: the timeline holds none
  detail: Record<string, unknown>;      // never an email address or a phone number
};

export type ProspectDetail = ProspectRow & {
  source_url: string;
  contact_last_name: string;
  contact_email: string;                // staff only; shown on the detail, never in a list
  email_source: EmailSource | null;
  basis_note: string;
  language: Language;
  fit_reason: string;
  notes: string;
  paused_reason: string;
  claims: Claim[];                      // kept and dropped
  drafts: Draft[];                      // every version, newest first
  approvals: Approval[];
  intents: Intent[];
  sends: Send[];
  replies: Reply[];
  events: OutreachEvent[];              // newest first
};

/** POST /prospects. `basis` is required; the API refuses one the country does not allow. */
export type NewProspect = {
  company: string; website: string; country: string;
  contact_first_name: string; contact_last_name: string; contact_role: string; contact_email: string;
  basis: Basis; basis_note: string; language: Language; notes: string;
};

/** POST /prospects/import answers: what was added and each refused row (1 is the first data row). */
/** POST /prospects/import takes `{ csv }` or `{ geojson, release, country }` (GeoJSON sent as `csv` is
 *  detected too). */
export type ImportResult = {
  added: number; ids: string[]; skipped: { row: number; reason: string }[]; source: ProspectSource;
};

/** POST /discover answers. */
export type DiscoverResult = { queued: boolean; job_id: string };

// ── review ──────────────────────────────────────────────────────────────────────────────────

/** GET /review: drafts waiting, oldest first, each with what the founder needs to judge it. */
export type ReviewItem = {
  draft: Draft;                         // the first message (or a booking reply)
  follow_ups: Draft[];                  // steps 2 and 3 waiting with it, in order
  prospect: Pick<ProspectDetail,
    "id" | "company" | "website" | "domain" | "country" | "lane" | "business_type" | "contact_first_name" |
    "contact_role" | "email_verifier" | "basis" | "basis_note" | "level" | "fit_score" | "fit_reason" | "language">;
  claims: Claim[];                      // the kept claims of the brief (what a sentence may cite)
  dropped_claims: number;
  waiting_since: string;
};
export type Review = { items: ReviewItem[] };

/** POST /drafts/{id}/approve answers 200 with the drafts it approved; a stale hash is a 409 whose
 *  detail is `{ code: "stale_hash", message }`. */
export type ApproveResult = { approved: string[] };

// ── replies ─────────────────────────────────────────────────────────────────────────────────

export type Reply = {
  id: string;
  prospect_id: string;
  company: string;
  contact_first_name: string;
  step: 1 | 2 | 3 | null;               // which send it answered, when matched
  received_at: string;
  subject: string;
  body: string;                         // quoted history removed, cut to 20,000 characters
  label: ReplyLabel | null;             // null: not labelled (the Reader failed or was not reached)
  other_labels: ReplyLabel[];           // more than one label sends it to the founder
  confidence: number | null;            // 0 to 1
  waiting_because: "low_confidence" | "several_labels" | "interested" | "question" | "other" | null;
  booking_draft_id: string | null;      // the Concierge's draft, waiting in Review
  handled_by: string;
  handled_at: string | null;
  note: string;
};
export type Replies = { replies: Reply[] };

// ── overview, settings, connections, activity ──────────────────────────────────────────────

export type KillSwitch = {
  on: boolean;
  reason: string;
  by: string;                           // a staff email, or "gateway" when a honeytoken tripped it
  at: string | null;
};

/** Today's sends against the caps; the mailbox cap follows its ramp week (10, 20, 30, then 40). */
export type Today = { sent: number; global_cap: number; mailbox_cap: number; ramp_week: number; queued: number };

export type Overview = {
  enabled: boolean;                     // ALYR_OUTREACH is exactly "on"
  kill_switch: KillSwitch;
  stages: Partial<Record<Stage, number>>;
  review_waiting: number;
  replies_waiting: number;
  today: Today;
  queues: { queued: number; held: number; rescheduled: number };
  mailbox: { from_address: string; paused: boolean; paused_reason: string } | null;
  connections: { key: ServiceKey; configured: boolean; ok: boolean | null }[];
};

/** A row of the country policy as `outreach/policy.py` holds it. Optional in GET /settings; when the
 *  API sends it, the screens use it instead of their own copy (outreachLogic.ts POLICY). */
export type CountryPolicy = {
  country: string; lane: Lane; bases: Basis[]; cap: Level; time_zone: string;
  working_days: string; hours: string; free_mail_refused: boolean; note?: string;
};

export type Settings = {
  kill_switch: KillSwitch;
  global_daily_cap: number;
  default_level: Level;
  honeytokens: string[];
  booking_url: string;                  // the override; "" when the setting's own value is used
  booking_url_default: string;          // ALYR_OUTREACH_BOOKING_URL, for reading only
  updated_by: string;
  updated_at: string | null;
  policy?: CountryPolicy[];
};
/** PUT /settings. */
export type SettingsChange = Pick<Settings, "global_daily_cap" | "default_level" | "honeytokens" | "booking_url">;

export type ConnectionTest = { ok: boolean; message: string; at: string; by: string };
export type Connection = {
  key: ServiceKey;
  provider: string;                     // "Anthropic", "Exa", "Hunter", the SMTP or IMAP host's name
  configured: boolean;                  // every setting it needs is present
  settings: { name: string; present: boolean }[]; // names only, never a value
  last_test: ConnectionTest | null;
  simulated?: boolean;                  // true where every provider is its simulator (ALYR_ENV=local)
};
export type Connections = { connections: Connection[] };

export type ActivityKind = "send" | "reply" | "refusal" | "opt_out" | "bounce";
export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  at: string;
  prospect_id: string | null;           // null once the prospect is erased
  company: string;
  step: 1 | 2 | 3 | null;
  check: number | null;                 // refusals: the gateway check that refused, 1 to 11
  outcome: string;                      // refusals: "held", "blocked", "rescheduled", "dropped", "waiting", "paused"
  detail: string;                       // plain words, never an address
};
export type Activity = { items: ActivityItem[]; today: Today; counts: Partial<Record<ActivityKind, number>> };
