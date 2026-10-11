import './env.js';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { getMarketSummary, marketDatabasePath } from './marketDb.js';
import type { LeadRecord, WebsiteSignal } from './types.js';
import type {
  CategoryInsight,
  ClientAccount,
  ClientAccountInput,
  CommandDashboard,
  CommandRuntime,
  DecisionSignal,
  DeliveryProject,
  DeliveryProjectInput,
  OperationalEvent,
  OperationalEventInput,
  PriorityProspect,
  ProjectPhase,
  ProspectContact,
  ProspectContactInput,
  SourcePulse,
} from './operationsTypes.js';

const database = new DatabaseSync(marketDatabasePath());
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS operational_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    source TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    account_name TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL,
    value_qar REAL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    dedupe_key TEXT NOT NULL UNIQUE
  );

  CREATE INDEX IF NOT EXISTS idx_operational_event_type ON operational_events(event_type);
  CREATE INDEX IF NOT EXISTS idx_operational_event_entity ON operational_events(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_operational_event_category ON operational_events(category);
  CREATE INDEX IF NOT EXISTS idx_operational_event_occurred ON operational_events(occurred_at DESC);

  CREATE TABLE IF NOT EXISTS client_accounts (
    id TEXT PRIMARY KEY,
    source_prospect_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    owner TEXT NOT NULL DEFAULT 'Unassigned',
    status TEXT NOT NULL DEFAULT 'onboarding',
    health TEXT NOT NULL DEFAULT 'on-track',
    engagement_model TEXT NOT NULL DEFAULT '',
    value_qar REAL,
    onboarded_at TEXT,
    next_action TEXT NOT NULL DEFAULT '',
    next_action_due_at TEXT,
    summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_client_source_prospect
    ON client_accounts(source_prospect_id) WHERE source_prospect_id != '';
  CREATE INDEX IF NOT EXISTS idx_client_status ON client_accounts(status);

  CREATE TABLE IF NOT EXISTS delivery_projects (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    phase TEXT NOT NULL DEFAULT 'discovery',
    progress INTEGER NOT NULL DEFAULT 0,
    health TEXT NOT NULL DEFAULT 'on-track',
    owner TEXT NOT NULL DEFAULT 'Unassigned',
    next_milestone TEXT NOT NULL DEFAULT '',
    due_at TEXT,
    summary TEXT NOT NULL DEFAULT '',
    workstreams_json TEXT NOT NULL DEFAULT '[]',
    blockers_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_project_account ON delivery_projects(account_id);
  CREATE INDEX IF NOT EXISTS idx_project_phase ON delivery_projects(phase);

  CREATE TABLE IF NOT EXISTS prospect_contacts (
    id TEXT PRIMARY KEY,
    prospect_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    linkedin_url TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL,
    confidence INTEGER NOT NULL DEFAULT 0,
    verified_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_contact_prospect ON prospect_contacts(prospect_id);
  CREATE INDEX IF NOT EXISTS idx_contact_confidence ON prospect_contacts(confidence DESC);
`);

type Row = Record<string, unknown>;

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function rowToEvent(row: Row): OperationalEvent {
  return {
    id: String(row.id),
    type: row.event_type as OperationalEvent['type'],
    source: row.source as OperationalEvent['source'],
    entityType: row.entity_type as OperationalEvent['entityType'],
    entityId: String(row.entity_id ?? ''),
    category: String(row.category ?? ''),
    accountName: String(row.account_name ?? ''),
    summary: String(row.summary),
    valueQar: row.value_qar == null ? undefined : Number(row.value_qar),
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    occurredAt: String(row.occurred_at),
    createdAt: String(row.created_at),
    dedupeKey: String(row.dedupe_key),
  };
}

function rowToAccount(row: Row): ClientAccount {
  return {
    id: String(row.id),
    sourceProspectId: String(row.source_prospect_id ?? ''),
    name: String(row.name),
    category: String(row.category ?? ''),
    owner: String(row.owner ?? 'Unassigned'),
    status: row.status as ClientAccount['status'],
    health: row.health as ClientAccount['health'],
    engagementModel: String(row.engagement_model ?? ''),
    valueQar: row.value_qar == null ? undefined : Number(row.value_qar),
    onboardedAt: row.onboarded_at ? String(row.onboarded_at) : undefined,
    nextAction: String(row.next_action ?? ''),
    nextActionDueAt: row.next_action_due_at ? String(row.next_action_due_at) : undefined,
    summary: String(row.summary ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToProject(row: Row): DeliveryProject {
  return {
    id: String(row.id),
    accountId: String(row.account_id ?? ''),
    accountName: String(row.account_name ?? 'Internal'),
    name: String(row.name),
    phase: row.phase as ProjectPhase,
    progress: Number(row.progress ?? 0),
    health: row.health as DeliveryProject['health'],
    owner: String(row.owner ?? 'Unassigned'),
    nextMilestone: String(row.next_milestone ?? ''),
    dueAt: row.due_at ? String(row.due_at) : undefined,
    summary: String(row.summary ?? ''),
    workstreams: parseJson<DeliveryProject['workstreams']>(row.workstreams_json, []),
    blockers: parseJson<string[]>(row.blockers_json, []),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToContact(row: Row): ProspectContact {
  return {
    id: String(row.id),
    prospectId: String(row.prospect_id),
    name: String(row.name ?? ''),
    role: String(row.role ?? ''),
    email: String(row.email ?? ''),
    phone: String(row.phone ?? ''),
    linkedinUrl: String(row.linkedin_url ?? ''),
    sourceUrl: String(row.source_url),
    confidence: Number(row.confidence ?? 0),
    verifiedAt: row.verified_at ? String(row.verified_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function eventDedupeKey(input: OperationalEventInput): string {
  if (input.dedupeKey) return input.dedupeKey;
  const fingerprint = createHash('sha256').update(JSON.stringify({
    type: input.type,
    source: input.source,
    entityType: input.entityType,
    entityId: input.entityId,
    category: input.category,
    summary: input.summary,
    occurredAt: input.occurredAt,
    payload: input.payload,
  })).digest('hex').slice(0, 24);
  return `${input.source}:${input.type}:${input.entityId || input.accountName || 'unbound'}:${fingerprint}`;
}

export function recordOperationalEvent(input: OperationalEventInput): OperationalEvent {
  const now = new Date().toISOString();
  const dedupeKey = eventDedupeKey(input);
  database.prepare(`
    INSERT OR IGNORE INTO operational_events (
      id, event_type, source, entity_type, entity_id, category, account_name,
      summary, value_qar, payload_json, occurred_at, created_at, dedupe_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id ?? randomUUID(), input.type, input.source, input.entityType, input.entityId,
    input.category, input.accountName, input.summary, input.valueQar ?? null,
    JSON.stringify(input.payload), input.occurredAt, now, dedupeKey,
  );
  const row = database.prepare('SELECT * FROM operational_events WHERE dedupe_key = ?').get(dedupeKey) as Row;
  return rowToEvent(row);
}

export function listOperationalEvents(limit = 30): OperationalEvent[] {
  const safeLimit = Math.min(250, Math.max(1, limit));
  const rows = database.prepare('SELECT * FROM operational_events ORDER BY occurred_at DESC, created_at DESC LIMIT ?').all(safeLimit) as Row[];
  return rows.map(rowToEvent);
}

export function upsertClientAccount(input: ClientAccountInput): ClientAccount {
  const existing = !input.id && input.sourceProspectId
    ? database.prepare('SELECT id FROM client_accounts WHERE source_prospect_id = ?').get(input.sourceProspectId) as Row | undefined
    : undefined;
  const id = input.id ?? (existing ? String(existing.id) : randomUUID());
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO client_accounts (
      id, source_prospect_id, name, category, owner, status, health, engagement_model,
      value_qar, onboarded_at, next_action, next_action_due_at, summary, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source_prospect_id = excluded.source_prospect_id,
      name = excluded.name,
      category = excluded.category,
      owner = excluded.owner,
      status = excluded.status,
      health = excluded.health,
      engagement_model = excluded.engagement_model,
      value_qar = excluded.value_qar,
      onboarded_at = excluded.onboarded_at,
      next_action = excluded.next_action,
      next_action_due_at = excluded.next_action_due_at,
      summary = excluded.summary,
      updated_at = excluded.updated_at
  `).run(
    id, input.sourceProspectId, input.name, input.category, input.owner, input.status,
    input.health, input.engagementModel, input.valueQar ?? null, input.onboardedAt ?? null,
    input.nextAction, input.nextActionDueAt ?? null, input.summary, now, now,
  );
  return rowToAccount(database.prepare('SELECT * FROM client_accounts WHERE id = ?').get(id) as Row);
}

export function listClientAccounts(): ClientAccount[] {
  const rows = database.prepare(`
    SELECT * FROM client_accounts
    WHERE status != 'archived'
    ORDER BY CASE health WHEN 'at-risk' THEN 0 WHEN 'attention' THEN 1 WHEN 'on-track' THEN 2 ELSE 3 END,
      updated_at DESC
  `).all() as Row[];
  return rows.map(rowToAccount);
}

export function upsertDeliveryProject(input: DeliveryProjectInput): DeliveryProject {
  const id = input.id ?? randomUUID();
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO delivery_projects (
      id, account_id, name, phase, progress, health, owner, next_milestone,
      due_at, summary, workstreams_json, blockers_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      account_id = excluded.account_id,
      name = excluded.name,
      phase = excluded.phase,
      progress = excluded.progress,
      health = excluded.health,
      owner = excluded.owner,
      next_milestone = excluded.next_milestone,
      due_at = excluded.due_at,
      summary = excluded.summary,
      workstreams_json = excluded.workstreams_json,
      blockers_json = excluded.blockers_json,
      updated_at = excluded.updated_at
  `).run(
    id, input.accountId, input.name, input.phase, clamp(input.progress), input.health,
    input.owner, input.nextMilestone, input.dueAt ?? null, input.summary,
    JSON.stringify(input.workstreams), JSON.stringify(input.blockers), now, now,
  );
  const row = database.prepare(`
    SELECT p.*, COALESCE(a.name, 'Internal') AS account_name
    FROM delivery_projects p LEFT JOIN client_accounts a ON a.id = p.account_id WHERE p.id = ?
  `).get(id) as Row;
  return rowToProject(row);
}

export function listDeliveryProjects(): DeliveryProject[] {
  const rows = database.prepare(`
    SELECT p.*, COALESCE(a.name, 'Internal') AS account_name
    FROM delivery_projects p LEFT JOIN client_accounts a ON a.id = p.account_id
    ORDER BY CASE p.health WHEN 'at-risk' THEN 0 WHEN 'attention' THEN 1 WHEN 'on-track' THEN 2 ELSE 3 END,
      p.updated_at DESC
  `).all() as Row[];
  return rows.map(rowToProject);
}

export function upsertProspectContact(input: ProspectContactInput): ProspectContact {
  let id = input.id;
  if (!id) {
    const match = database.prepare(`
      SELECT id FROM prospect_contacts
      WHERE prospect_id = ? AND (
        (? != '' AND LOWER(email) = LOWER(?)) OR
        (? != '' AND phone = ?) OR
        (? != '' AND LOWER(name) = LOWER(?))
      ) LIMIT 1
    `).get(
      input.prospectId, input.email, input.email, input.phone, input.phone, input.name, input.name,
    ) as Row | undefined;
    id = match ? String(match.id) : randomUUID();
  }
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO prospect_contacts (
      id, prospect_id, name, role, email, phone, linkedin_url, source_url,
      confidence, verified_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      prospect_id = excluded.prospect_id,
      name = excluded.name,
      role = excluded.role,
      email = excluded.email,
      phone = excluded.phone,
      linkedin_url = excluded.linkedin_url,
      source_url = excluded.source_url,
      confidence = excluded.confidence,
      verified_at = excluded.verified_at,
      updated_at = excluded.updated_at
  `).run(
    id, input.prospectId, input.name, input.role, input.email, input.phone,
    input.linkedinUrl, input.sourceUrl, clamp(input.confidence), input.verifiedAt ?? null, now, now,
  );
  return rowToContact(database.prepare('SELECT * FROM prospect_contacts WHERE id = ?').get(id) as Row);
}

export function listProspectContacts(prospectId?: string): ProspectContact[] {
  const rows = prospectId
    ? database.prepare('SELECT * FROM prospect_contacts WHERE prospect_id = ? ORDER BY confidence DESC, updated_at DESC').all(prospectId) as Row[]
    : database.prepare('SELECT * FROM prospect_contacts ORDER BY updated_at DESC LIMIT 250').all() as Row[];
  return rows.map(rowToContact);
}

function categoryOffer(category: string, signals: WebsiteSignal[] = []): string {
  const evidence = signals.map((signal) => `${signal.key} ${signal.label}`).join(' ').toLowerCase();
  if (evidence.includes('booking')) return 'Conversion website + booking workflow';
  if (evidence.includes('whatsapp')) return 'WhatsApp-to-CRM sales system';
  if (evidence.includes('single-language') || evidence.includes('language')) return 'Bilingual customer journey + content system';
  if (evidence.includes('analytics')) return 'Measurement, attribution + CRM foundation';
  if (evidence.includes('privacy') || evidence.includes('security')) return 'Trust, privacy + secure digital foundation';
  const rules: Array<[RegExp, string]> = [
    [/travel|tourism|hospitality/i, 'Direct booking + customer portal'],
    [/food|restaurant|cafe/i, 'Conversion website + loyalty workflow'],
    [/retail|e-commerce|food retail/i, 'Commerce, CRM + retention system'],
    [/automotive|mobility/i, 'Service booking + customer lifecycle CRM'],
    [/professional|business|document|government/i, 'Digital intake + case workflow automation'],
    [/beauty|wellness/i, 'Scheduling + repeat-customer automation'],
    [/health/i, 'Secure intake + service workflow'],
    [/education|training/i, 'Enrollment journey + learner operations'],
    [/home|interior|construction/i, 'Quote-to-project workflow + client portal'],
    [/domestic|care|local services/i, 'Verified service booking + operations dashboard'],
  ];
  return rules.find(([pattern]) => pattern.test(category))?.[1] ?? 'Transformation audit + 90-day digital operating system';
}

function leadWeight(status: LeadRecord['status']): number {
  return ({ new: 2, qualified: 6, contacted: 12, meeting: 20, proposal: 28, won: 38, 'not-now': 0 })[status];
}

export function getCommandDashboard(leads: LeadRecord[], runtime: CommandRuntime): CommandDashboard {
  const market = getMarketSummary();
  const accounts = listClientAccounts();
  const projects = listDeliveryProjects();
  const recentEvents = listOperationalEvents(12);
  const allEvents = listOperationalEvents(250);

  const contactableRow = database.prepare(`
    SELECT COUNT(*) AS count FROM market_prospects
    WHERE target_status = 'candidate' AND suppressed = 0 AND (emails_json != '[]' OR phones_json != '[]')
  `).get() as Row;
  const outreachRows = database.prepare(`
    SELECT status, COUNT(*) AS count, COUNT(DISTINCT prospect_id) AS prospects
    FROM outreach_actions GROUP BY status
  `).all() as Row[];
  const actionedRows = database.prepare(`
    SELECT DISTINCT prospect_id FROM outreach_actions
    WHERE status NOT IN ('rejected', 'blocked', 'failed')
  `).all() as Row[];
  const actionedIds = new Set(actionedRows.map((row) => String(row.prospect_id)));
  const pendingApprovals = Number(outreachRows.find((row) => row.status === 'pending-approval')?.count ?? 0);
  const sentIds = new Set((database.prepare(`SELECT DISTINCT prospect_id FROM outreach_actions WHERE status = 'sent'`).all() as Row[]).map((row) => String(row.prospect_id)));

  const activeLeadIds = new Set(leads.filter((lead) => !['won', 'not-now'].includes(lead.status)).map((lead) => lead.placeId || lead.id));
  actionedIds.forEach((id) => activeLeadIds.add(id));
  const contactedIds = new Set<string>(sentIds);
  leads.filter((lead) => ['contacted', 'meeting', 'proposal', 'won'].includes(lead.status)).forEach((lead) => contactedIds.add(lead.placeId || lead.id));
  allEvents.filter((event) => ['outreach.sent', 'outreach.replied'].includes(event.type)).forEach((event) => contactedIds.add(event.entityId || event.id));

  const meetingIds = new Set<string>();
  leads.filter((lead) => ['meeting', 'proposal', 'won'].includes(lead.status)).forEach((lead) => meetingIds.add(lead.placeId || lead.id));
  allEvents.filter((event) => event.type === 'meeting.booked').forEach((event) => meetingIds.add(event.entityId || event.id));
  const proposalIds = new Set<string>();
  leads.filter((lead) => ['proposal', 'won'].includes(lead.status)).forEach((lead) => proposalIds.add(lead.placeId || lead.id));
  allEvents.filter((event) => event.type === 'proposal.sent').forEach((event) => proposalIds.add(event.entityId || event.id));
  const wonIds = new Set(accounts.filter((account) => account.status !== 'archived').map((account) => account.id));
  leads.filter((lead) => lead.status === 'won').forEach((lead) => wonIds.add(lead.placeId || lead.id));
  allEvents.filter((event) => event.type === 'account.won').forEach((event) => wonIds.add(event.entityId || event.id));

  const categoryRows = database.prepare(`
    WITH action_rollup AS (
      SELECT prospect_id,
        SUM(CASE WHEN status NOT IN ('rejected', 'blocked', 'failed') THEN 1 ELSE 0 END) AS action_count,
        MAX(CASE WHEN status = 'pending-approval' THEN 1 ELSE 0 END) AS pending_approval,
        MAX(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent
      FROM outreach_actions GROUP BY prospect_id
    )
    SELECT p.category,
      COUNT(*) AS market_count,
      SUM(CASE WHEN p.website != '' THEN 1 ELSE 0 END) AS websites,
      SUM(CASE WHEN p.verification_status = 'website-verified' THEN 1 ELSE 0 END) AS verified,
      SUM(CASE WHEN p.emails_json != '[]' OR p.phones_json != '[]' THEN 1 ELSE 0 END) AS contactable,
      COALESCE(ROUND(AVG(CASE WHEN p.fit_score > 0 THEN p.fit_score END)), 0) AS average_fit,
      SUM(CASE WHEN COALESCE(a.action_count, 0) > 0 THEN 1 ELSE 0 END) AS actioned,
      SUM(COALESCE(a.pending_approval, 0)) AS pending_approval,
      SUM(COALESCE(a.sent, 0)) AS sent
    FROM market_prospects p
    LEFT JOIN action_rollup a ON a.prospect_id = p.id
    WHERE p.target_status != 'excluded-noncommercial' AND p.suppressed = 0
    GROUP BY p.category
    ORDER BY market_count DESC
  `).all() as Row[];

  const eventCategoryRows = database.prepare(`
    SELECT category, event_type, COUNT(DISTINCT CASE WHEN entity_id != '' THEN entity_id ELSE id END) AS count
    FROM operational_events WHERE category != '' GROUP BY category, event_type
  `).all() as Row[];
  const eventCategory = new Map<string, Map<string, number>>();
  eventCategoryRows.forEach((row) => {
    const category = String(row.category);
    const bucket = eventCategory.get(category) ?? new Map<string, number>();
    bucket.set(String(row.event_type), Number(row.count));
    eventCategory.set(category, bucket);
  });
  const leadCategory = new Map<string, { count: number; weight: number; meetings: number; proposals: number; clients: number }>();
  leads.forEach((lead) => {
    const category = lead.category || 'Uncategorized';
    const bucket = leadCategory.get(category) ?? { count: 0, weight: 0, meetings: 0, proposals: 0, clients: 0 };
    bucket.count += 1;
    bucket.weight += leadWeight(lead.status);
    if (['meeting', 'proposal', 'won'].includes(lead.status)) bucket.meetings += 1;
    if (['proposal', 'won'].includes(lead.status)) bucket.proposals += 1;
    if (lead.status === 'won') bucket.clients += 1;
    leadCategory.set(category, bucket);
  });
  const accountCategory = new Map<string, number>();
  accounts.forEach((account) => accountCategory.set(account.category, (accountCategory.get(account.category) ?? 0) + 1));
  const maxMarket = Math.max(1, ...categoryRows.map((row) => Number(row.market_count)));

  const categories: CategoryInsight[] = categoryRows.map((row) => {
    const category = String(row.category);
    const marketCount = Number(row.market_count);
    const websites = Number(row.websites);
    const verified = Number(row.verified);
    const contactable = Number(row.contactable);
    const averageFit = Number(row.average_fit);
    const actioned = Number(row.actioned);
    const eventCounts = eventCategory.get(category) ?? new Map<string, number>();
    const leadCounts = leadCategory.get(category) ?? { count: 0, weight: 0, meetings: 0, proposals: 0, clients: 0 };
    const replies = eventCounts.get('outreach.replied') ?? 0;
    const meetings = Math.max(leadCounts.meetings, eventCounts.get('meeting.booked') ?? 0);
    const proposals = Math.max(leadCounts.proposals, eventCounts.get('proposal.sent') ?? 0);
    const clients = Math.max(leadCounts.clients, accountCategory.get(category) ?? 0, eventCounts.get('account.won') ?? 0);
    const marketScale = Math.sqrt(marketCount / maxMarket) * 45;
    const websiteGap = (1 - websites / Math.max(1, marketCount)) * 30;
    const fitComponent = (averageFit / 100) * 25;
    const potentialScore = clamp(marketScale + websiteGap + fitComponent);
    const tractionScore = clamp(leadCounts.weight + actioned * 3 + replies * 14 + meetings * 18 + proposals * 22 + clients * 32);
    const nextMove = clients > 0
      ? 'Turn delivery evidence into a category campaign'
      : proposals > 0
        ? 'Resolve proposal decision and commercial blockers'
        : meetings > 0
          ? 'Prepare a problem-specific working session'
          : replies > 0
            ? 'Qualify the response and book the next step'
            : actioned > 0
              ? 'Review outreach quality and contact evidence'
              : verified > 0
                ? 'Build a ten-account evidence-led micro-campaign'
                : 'Verify the highest-fit accounts first';
    return {
      category, marketCount, websites, verified, contactable, averageFit,
      pipeline: leadCounts.count, actioned, replies, meetings, proposals, clients,
      potentialScore, tractionScore, recommendedOffer: categoryOffer(category), nextMove,
    };
  }).sort((left, right) => (right.potentialScore + right.tractionScore) - (left.potentialScore + left.tractionScore));
  const categoryPriority = new Map(categories.map((category) => [
    category.category,
    category.potentialScore * .08 + category.tractionScore * .15,
  ]));

  const prospectRows = database.prepare(`
    SELECT p.*,
      (SELECT status FROM outreach_actions oa WHERE oa.prospect_id = p.id ORDER BY oa.created_at DESC LIMIT 1) AS latest_outreach_status,
      (SELECT name FROM prospect_contacts pc WHERE pc.prospect_id = p.id ORDER BY pc.confidence DESC, pc.updated_at DESC LIMIT 1) AS contact_name,
      (SELECT role FROM prospect_contacts pc WHERE pc.prospect_id = p.id ORDER BY pc.confidence DESC, pc.updated_at DESC LIMIT 1) AS contact_role,
      (SELECT confidence FROM prospect_contacts pc WHERE pc.prospect_id = p.id ORDER BY pc.confidence DESC, pc.updated_at DESC LIMIT 1) AS contact_confidence
    FROM market_prospects p
    WHERE p.target_status = 'candidate' AND p.suppressed = 0
      AND (p.verification_status = 'website-verified' OR p.emails_json != '[]' OR p.phones_json != '[]')
    ORDER BY p.fit_score DESC, p.updated_at DESC LIMIT 30
  `).all() as Row[];

  const priorityProspects: PriorityProspect[] = prospectRows.map((row) => {
    const signals = parseJson<WebsiteSignal[]>(row.signals_json, []);
    const opportunities = signals.filter((signal) => signal.state === 'opportunity');
    const emails = parseJson<string[]>(row.emails_json, []);
    const phones = parseJson<string[]>(row.phones_json, []);
    const latestOutreachStatus = String(row.latest_outreach_status ?? '');
    const permission = String(row.permission_status ?? 'unknown');
    const contactName = String(row.contact_name ?? '');
    const hasContact = Boolean(contactName || emails[0] || phones[0]);
    const activeAction = ['draft', 'pending-approval', 'approved', 'executing', 'sent'].includes(latestOutreachStatus);
    const actionOutcomeAdjustment = latestOutreachStatus === 'rejected'
      ? -6
      : latestOutreachStatus === 'blocked'
        ? -5
        : latestOutreachStatus === 'failed'
          ? -3
          : 0;
    const readiness: PriorityProspect['readiness'] = activeAction
      ? 'action-queued'
      : ['opted-in', 'approved-business-contact'].includes(permission)
        ? 'permissioned'
        : hasContact
          ? 'contact-found'
          : row.verification_status === 'website-verified'
            ? 'evidence-ready'
            : 'research';
    const priorityScore = clamp(
      Number(row.fit_score) * .6 + Math.min(12, opportunities.length * 4) + (emails[0] || phones[0] ? 8 : 0) +
      (row.verification_status === 'website-verified' ? 8 : 0) + (contactName ? 7 : 0) +
      (['opted-in', 'approved-business-contact'].includes(permission) ? 10 : 0) + (activeAction ? 5 : 0) +
      (categoryPriority.get(String(row.category)) ?? 0) + actionOutcomeAdjustment,
    );
    const nextMove = latestOutreachStatus === 'pending-approval'
      ? 'Approve, revise or reject the Hermes draft'
      : latestOutreachStatus === 'approved'
        ? 'Execute the separately approved action'
        : latestOutreachStatus === 'sent'
          ? 'Monitor for response and schedule follow-up'
          : ['rejected', 'blocked', 'failed'].includes(latestOutreachStatus)
            ? 'Review the prior action outcome before another approach'
          : !contactName
            ? 'Identify the decision-maker and source evidence'
            : permission === 'unknown'
              ? 'Confirm the permitted contact basis'
              : 'Draft a problem-specific first approach';
    return {
      id: String(row.id),
      name: String(row.name),
      category: String(row.category),
      location: String(row.location),
      website: String(row.website ?? ''),
      email: emails[0] ?? '',
      phone: phones[0] ?? '',
      fitScore: Number(row.fit_score ?? 0),
      priorityScore,
      verificationStatus: String(row.verification_status),
      permissionStatus: permission,
      readiness,
      contactName,
      contactRole: String(row.contact_role ?? ''),
      contactConfidence: Number(row.contact_confidence ?? 0),
      latestOutreachStatus,
      opportunitySignals: opportunities.slice(0, 3),
      recommendedOffer: categoryOffer(String(row.category), opportunities),
      openingAngle: opportunities[0]?.evidence || 'Start with a short evidence-led transformation audit, then validate the commercial priority with the owner.',
      nextMove,
    };
  }).sort((left, right) => right.priorityScore - left.priorityScore).slice(0, 9);

  const activeProjects = projects.filter((project) => project.phase !== 'complete').length;
  const activeAccounts = accounts.filter((account) => !['archived', 'completed'].includes(account.status)).length;
  const topPotential = [...categories].sort((a, b) => b.potentialScore - a.potentialScore)[0];
  const topTraction = [...categories].sort((a, b) => b.tractionScore - a.tractionScore)[0];
  const signals: DecisionSignal[] = [];
  if (pendingApprovals > 0) signals.push({
    id: 'approval-queue', priority: 'now', title: `${pendingApprovals} Hermes drafts need a human decision`,
    detail: 'No external action is sent until an authorized reviewer approves it.', actionLabel: 'Review queue', targetView: 'hermes',
  });
  if (topTraction?.tractionScore > 0) signals.push({
    id: 'traction-category', priority: 'now', title: `${topTraction.category} has the strongest current traction`,
    detail: `${topTraction.pipeline} pipeline record(s), ${topTraction.actioned} actioned account(s), traction score ${topTraction.tractionScore}.`,
    actionLabel: 'Inspect traction', targetView: 'intelligence',
  });
  if (topPotential) signals.push({
    id: 'potential-category', priority: 'next', title: `${topPotential.category} is the largest focus opportunity`,
    detail: `${topPotential.marketCount.toLocaleString('en-QA')} candidates with ${topPotential.verified} verified websites. Recommended offer: ${topPotential.recommendedOffer}.`,
    actionLabel: 'Open market lens', targetView: 'market',
  });
  if (market.verificationErrors > 0) signals.push({
    id: 'verification-errors', priority: 'watch', title: `${market.verificationErrors} website checks need review`,
    detail: 'Treat these as a data-quality backlog, not failed prospects.', actionLabel: 'Review sources', targetView: 'sources',
  });
  if (accounts.length === 0) signals.push({
    id: 'account-foundation', priority: 'next', title: 'The client-delivery layer is ready for the first onboarding',
    detail: 'No client account has been recorded yet. Hermes or a human can upsert the first account and project without changing this dashboard.',
    actionLabel: 'Open delivery', targetView: 'delivery',
  });

  const latestHermes = database.prepare(`SELECT MAX(occurred_at) AS value FROM operational_events WHERE source = 'hermes'`).get() as Row;
  const sources: SourcePulse[] = [
    {
      id: 'qatar-market', name: 'Qatar market scan',
      status: market.latestScan?.status === 'completed' ? 'healthy' : market.latestScan ? 'attention' : 'idle',
      records: market.total, lastSync: market.latestScan?.completedAt,
      note: 'OpenStreetMap / ODbL national research layer',
    },
    {
      id: 'website-verifier', name: 'Website evidence',
      status: market.verificationErrors > market.websiteVerified ? 'attention' : 'healthy',
      records: market.websiteVerified, lastSync: market.latestScan?.completedAt,
      note: `${market.verificationErrors} records require review`,
    },
    {
      id: 'google-maps', name: 'Google Maps discovery',
      status: runtime.googleConfigured ? 'connected' : 'idle', records: 0,
      note: runtime.googleConfigured ? 'Live user-initiated search available' : 'API key not configured; no silent scraping',
    },
    {
      id: 'hermes', name: 'Hermes event spine',
      status: runtime.hermesReady ? 'connected' : 'offline', records: allEvents.filter((event) => event.source === 'hermes').length,
      lastSync: latestHermes.value ? String(latestHermes.value) : undefined,
      note: 'Idempotent observations, contacts, accounts and projects',
    },
    {
      id: 'approval', name: 'Human approval control',
      status: pendingApprovals > 0 ? 'attention' : 'healthy', records: pendingApprovals,
      note: 'External outreach remains approval-gated',
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    kpis: {
      marketCandidates: market.candidates,
      verifiedProspects: market.websiteVerified,
      contactableProspects: Number(contactableRow.count ?? 0),
      activePipeline: activeLeadIds.size,
      onboardedClients: activeAccounts,
      activeProjects,
      pendingApprovals,
    },
    funnel: [
      { key: 'market', label: 'Market candidates', count: market.candidates, detail: 'Eligible Qatar commercial records' },
      { key: 'verified', label: 'Evidence verified', count: market.websiteVerified, detail: 'Public website evidence checked' },
      { key: 'pipeline', label: 'Active pipeline', count: activeLeadIds.size, detail: 'Qualified records or active actions' },
      { key: 'contacted', label: 'Contacted', count: contactedIds.size, detail: 'Sent action or contacted pipeline state' },
      { key: 'meeting', label: 'Meetings', count: meetingIds.size, detail: 'Booked or progressed to meeting' },
      { key: 'proposal', label: 'Proposals', count: proposalIds.size, detail: 'Commercial proposal sent' },
      { key: 'client', label: 'Clients', count: wonIds.size, detail: 'Won or onboarded accounts' },
    ],
    categories,
    priorityProspects,
    accounts,
    projects,
    signals: signals.slice(0, 5),
    sources,
    recentEvents,
    pipelineLeads: leads,
  };
}
