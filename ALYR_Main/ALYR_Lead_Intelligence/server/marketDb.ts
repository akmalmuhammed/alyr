import './env.js';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { WebsiteEnrichment, WebsiteSignal } from './types.js';
import type {
  MarketProspect,
  MarketSummary,
  OutreachAction,
  OutreachChannel,
  OutreachStatus,
  PermissionStatus,
  ProspectListResult,
  ScanRun,
  VerificationStatus,
} from './marketTypes.js';

const databasePath = path.resolve(process.env.ALYR_MARKET_DB || './data/alyr-market.sqlite');
mkdirSync(path.dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS market_prospects (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    name TEXT NOT NULL,
    name_ar TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    subcategory TEXT NOT NULL,
    target_status TEXT NOT NULL,
    location TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    latitude REAL,
    longitude REAL,
    website TEXT NOT NULL DEFAULT '',
    emails_json TEXT NOT NULL DEFAULT '[]',
    phones_json TEXT NOT NULL DEFAULT '[]',
    social_json TEXT NOT NULL DEFAULT '[]',
    source_url TEXT NOT NULL,
    source_license TEXT NOT NULL,
    verification_status TEXT NOT NULL,
    fit_score INTEGER NOT NULL DEFAULT 0,
    signals_json TEXT NOT NULL DEFAULT '[]',
    permission_status TEXT NOT NULL DEFAULT 'unknown',
    permission_evidence TEXT NOT NULL DEFAULT '',
    suppressed INTEGER NOT NULL DEFAULT 0,
    suppression_reason TEXT NOT NULL DEFAULT '',
    observed_at TEXT NOT NULL,
    verified_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    raw_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_market_category ON market_prospects(category);
  CREATE INDEX IF NOT EXISTS idx_market_location ON market_prospects(location);
  CREATE INDEX IF NOT EXISTS idx_market_fit ON market_prospects(fit_score DESC);
  CREATE INDEX IF NOT EXISTS idx_market_verification ON market_prospects(verification_status);
  CREATE INDEX IF NOT EXISTS idx_market_target ON market_prospects(target_status);

  CREATE TABLE IF NOT EXISTS scan_runs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    scope TEXT NOT NULL,
    discovered INTEGER NOT NULL DEFAULT 0,
    imported INTEGER NOT NULL DEFAULT 0,
    eligible INTEGER NOT NULL DEFAULT 0,
    with_website INTEGER NOT NULL DEFAULT 0,
    with_contact INTEGER NOT NULL DEFAULT 0,
    verified INTEGER NOT NULL DEFAULT 0,
    errors INTEGER NOT NULL DEFAULT 0,
    message TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS outreach_actions (
    id TEXT PRIMARY KEY,
    prospect_id TEXT NOT NULL REFERENCES market_prospects(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    destination TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    rationale TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    permission_snapshot TEXT NOT NULL,
    created_by TEXT NOT NULL,
    approval_note TEXT NOT NULL DEFAULT '',
    approved_by TEXT NOT NULL DEFAULT '',
    approved_at TEXT,
    executed_at TEXT,
    provider_id TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    template_name TEXT NOT NULL DEFAULT '',
    template_language TEXT NOT NULL DEFAULT 'en',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach_actions(status);
  CREATE INDEX IF NOT EXISTS idx_outreach_prospect ON outreach_actions(prospect_id);

  CREATE TABLE IF NOT EXISTS outreach_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id TEXT NOT NULL REFERENCES outreach_actions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    actor TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS suppression_list (
    channel TEXT NOT NULL,
    destination TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(channel, destination)
  );
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

function rowToProspect(row: Row): MarketProspect {
  return {
    id: String(row.id),
    source: row.source as MarketProspect['source'],
    sourceId: String(row.source_id),
    name: String(row.name),
    nameAr: String(row.name_ar ?? ''),
    category: String(row.category),
    subcategory: String(row.subcategory),
    targetStatus: row.target_status as MarketProspect['targetStatus'],
    location: String(row.location),
    address: String(row.address ?? ''),
    latitude: row.latitude == null ? undefined : Number(row.latitude),
    longitude: row.longitude == null ? undefined : Number(row.longitude),
    website: String(row.website ?? ''),
    emails: parseJson<string[]>(row.emails_json, []),
    phones: parseJson<string[]>(row.phones_json, []),
    socialLinks: parseJson<string[]>(row.social_json, []),
    sourceUrl: String(row.source_url),
    sourceLicense: String(row.source_license),
    verificationStatus: row.verification_status as VerificationStatus,
    fitScore: Number(row.fit_score ?? 0),
    signals: parseJson<WebsiteSignal[]>(row.signals_json, []),
    permissionStatus: row.permission_status as PermissionStatus,
    permissionEvidence: String(row.permission_evidence ?? ''),
    suppressed: Boolean(row.suppressed),
    suppressionReason: String(row.suppression_reason ?? ''),
    observedAt: String(row.observed_at),
    verifiedAt: row.verified_at ? String(row.verified_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    raw: parseJson<Record<string, string>>(row.raw_json, {}),
  };
}

function rowToScan(row: Row): ScanRun {
  return {
    id: String(row.id),
    source: row.source as ScanRun['source'],
    status: row.status as ScanRun['status'],
    scope: String(row.scope),
    discovered: Number(row.discovered),
    imported: Number(row.imported),
    eligible: Number(row.eligible),
    withWebsite: Number(row.with_website),
    withContact: Number(row.with_contact),
    verified: Number(row.verified),
    errors: Number(row.errors),
    message: String(row.message ?? ''),
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
  };
}

function rowToAction(row: Row): OutreachAction {
  return {
    id: String(row.id),
    prospectId: String(row.prospect_id),
    prospectName: String(row.prospect_name ?? ''),
    channel: row.channel as OutreachChannel,
    destination: String(row.destination ?? ''),
    subject: String(row.subject ?? ''),
    body: String(row.body),
    rationale: String(row.rationale ?? ''),
    status: row.status as OutreachStatus,
    permissionSnapshot: row.permission_snapshot as PermissionStatus,
    createdBy: String(row.created_by),
    approvalNote: String(row.approval_note ?? ''),
    approvedBy: String(row.approved_by ?? ''),
    approvedAt: row.approved_at ? String(row.approved_at) : undefined,
    executedAt: row.executed_at ? String(row.executed_at) : undefined,
    providerId: String(row.provider_id ?? ''),
    error: String(row.error ?? ''),
    templateName: String(row.template_name ?? ''),
    templateLanguage: String(row.template_language ?? 'en'),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const prospectUpsert = database.prepare(`
  INSERT INTO market_prospects (
    id, source, source_id, name, name_ar, category, subcategory, target_status,
    location, address, latitude, longitude, website, emails_json, phones_json,
    social_json, source_url, source_license, verification_status, fit_score,
    signals_json, permission_status, permission_evidence, suppressed,
    suppression_reason, observed_at, verified_at, created_at, updated_at, raw_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    source = excluded.source,
    source_id = excluded.source_id,
    name = CASE WHEN market_prospects.verification_status = 'website-verified' THEN market_prospects.name ELSE excluded.name END,
    name_ar = excluded.name_ar,
    category = excluded.category,
    subcategory = excluded.subcategory,
    target_status = excluded.target_status,
    location = excluded.location,
    address = excluded.address,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    website = CASE WHEN market_prospects.verification_status = 'website-verified' THEN market_prospects.website ELSE excluded.website END,
    emails_json = CASE WHEN market_prospects.verification_status = 'website-verified' THEN market_prospects.emails_json ELSE excluded.emails_json END,
    phones_json = CASE WHEN market_prospects.verification_status = 'website-verified' THEN market_prospects.phones_json ELSE excluded.phones_json END,
    social_json = CASE WHEN market_prospects.verification_status = 'website-verified' THEN market_prospects.social_json ELSE excluded.social_json END,
    source_url = excluded.source_url,
    source_license = excluded.source_license,
    verification_status = CASE WHEN market_prospects.verification_status = 'website-verified' THEN market_prospects.verification_status ELSE excluded.verification_status END,
    fit_score = CASE WHEN market_prospects.verification_status = 'website-verified' THEN market_prospects.fit_score ELSE excluded.fit_score END,
    signals_json = CASE WHEN market_prospects.verification_status = 'website-verified' THEN market_prospects.signals_json ELSE excluded.signals_json END,
    observed_at = excluded.observed_at,
    updated_at = excluded.updated_at,
    raw_json = excluded.raw_json
`);

export function upsertMarketProspects(prospects: MarketProspect[]): { imported: number; eligible: number; withWebsite: number; withContact: number } {
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const prospect of prospects) {
      prospectUpsert.run(
        prospect.id,
        prospect.source,
        prospect.sourceId,
        prospect.name,
        prospect.nameAr,
        prospect.category,
        prospect.subcategory,
        prospect.targetStatus,
        prospect.location,
        prospect.address,
        prospect.latitude ?? null,
        prospect.longitude ?? null,
        prospect.website,
        JSON.stringify(prospect.emails),
        JSON.stringify(prospect.phones),
        JSON.stringify(prospect.socialLinks),
        prospect.sourceUrl,
        prospect.sourceLicense,
        prospect.verificationStatus,
        prospect.fitScore,
        JSON.stringify(prospect.signals),
        prospect.permissionStatus,
        prospect.permissionEvidence,
        prospect.suppressed ? 1 : 0,
        prospect.suppressionReason,
        prospect.observedAt,
        prospect.verifiedAt ?? null,
        prospect.createdAt,
        prospect.updatedAt,
        JSON.stringify(prospect.raw),
      );
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return {
    imported: prospects.length,
    eligible: prospects.filter((item) => item.targetStatus === 'candidate').length,
    withWebsite: prospects.filter((item) => Boolean(item.website)).length,
    withContact: prospects.filter((item) => item.emails.length > 0 || item.phones.length > 0).length,
  };
}

export function createScanRun(source: ScanRun['source'], scope: string): ScanRun {
  const now = new Date().toISOString();
  const run: ScanRun = {
    id: randomUUID(), source, status: 'running', scope, discovered: 0, imported: 0,
    eligible: 0, withWebsite: 0, withContact: 0, verified: 0, errors: 0,
    message: 'Scan started.', startedAt: now,
  };
  database.prepare(`INSERT INTO scan_runs (id, source, status, scope, started_at, message) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(run.id, run.source, run.status, run.scope, run.startedAt, run.message);
  return run;
}

export function completeScanRun(id: string, values: Partial<Omit<ScanRun, 'id' | 'source' | 'scope' | 'startedAt'>>): ScanRun | undefined {
  const current = getScanRun(id);
  if (!current) return undefined;
  const next = { ...current, ...values };
  database.prepare(`
    UPDATE scan_runs SET status = ?, discovered = ?, imported = ?, eligible = ?,
    with_website = ?, with_contact = ?, verified = ?, errors = ?, message = ?, completed_at = ?
    WHERE id = ?
  `).run(
    next.status, next.discovered, next.imported, next.eligible, next.withWebsite,
    next.withContact, next.verified, next.errors, next.message,
    next.status === 'running' ? null : (next.completedAt ?? new Date().toISOString()), id,
  );
  return getScanRun(id);
}

export function getScanRun(id: string): ScanRun | undefined {
  const row = database.prepare('SELECT * FROM scan_runs WHERE id = ?').get(id) as Row | undefined;
  return row ? rowToScan(row) : undefined;
}

export function getLatestScan(): ScanRun | undefined {
  const row = database.prepare('SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT 1').get() as Row | undefined;
  return row ? rowToScan(row) : undefined;
}

export function refreshLatestScanVerificationStats(): ScanRun | undefined {
  const latest = getLatestScan();
  if (!latest) return undefined;
  const counts = database.prepare(`
    SELECT
      SUM(CASE WHEN verification_status = 'website-verified' THEN 1 ELSE 0 END) AS verified,
      SUM(CASE WHEN verification_status = 'verification-error' THEN 1 ELSE 0 END) AS errors,
      SUM(CASE WHEN verification_status = 'website-queued' AND target_status != 'excluded-noncommercial' THEN 1 ELSE 0 END) AS queued
    FROM market_prospects
  `).get() as Row;
  const verified = Number(counts.verified ?? 0);
  const errors = Number(counts.errors ?? 0);
  const queued = Number(counts.queued ?? 0);
  database.prepare('UPDATE scan_runs SET verified = ?, errors = ?, message = ? WHERE id = ?')
    .run(
      verified,
      errors,
      queued === 0
        ? `Qatar scan completed; eligible website queue completed with ${verified} verified and ${errors} documented errors.`
        : `Qatar scan completed; ${queued} eligible websites remain queued for verification.`,
      latest.id,
    );
  return getScanRun(latest.id);
}

export function getMarketProspect(id: string): MarketProspect | undefined {
  const row = database.prepare('SELECT * FROM market_prospects WHERE id = ?').get(id) as Row | undefined;
  return row ? rowToProspect(row) : undefined;
}

export function listMarketProspects(input: {
  search?: string;
  category?: string;
  location?: string;
  verification?: VerificationStatus;
  permission?: PermissionStatus;
  targetStatus?: MarketProspect['targetStatus'];
  minScore?: number;
  withContact?: boolean;
  includeExcluded?: boolean;
  limit?: number;
  offset?: number;
}): ProspectListResult {
  const where: string[] = [];
  const parameters: Array<string | number> = [];
  if (!input.includeExcluded) where.push("target_status != 'excluded-noncommercial'");
  if (input.search) {
    where.push('(name LIKE ? OR name_ar LIKE ? OR category LIKE ? OR location LIKE ? OR emails_json LIKE ? OR phones_json LIKE ?)');
    const pattern = `%${input.search}%`;
    parameters.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }
  if (input.category) { where.push('category = ?'); parameters.push(input.category); }
  if (input.location) { where.push('location = ?'); parameters.push(input.location); }
  if (input.verification) { where.push('verification_status = ?'); parameters.push(input.verification); }
  if (input.permission) { where.push('permission_status = ?'); parameters.push(input.permission); }
  if (input.targetStatus) { where.push('target_status = ?'); parameters.push(input.targetStatus); }
  if (input.minScore != null) { where.push('fit_score >= ?'); parameters.push(input.minScore); }
  if (input.withContact) where.push("(emails_json != '[]' OR phones_json != '[]')");
  const predicate = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = database.prepare(`SELECT COUNT(*) AS count FROM market_prospects ${predicate}`).get(...parameters) as Row;
  const limit = Math.min(250, Math.max(1, input.limit ?? 40));
  const offset = Math.max(0, input.offset ?? 0);
  const rows = database.prepare(`
    SELECT * FROM market_prospects ${predicate}
    ORDER BY suppressed ASC, fit_score DESC, name COLLATE NOCASE ASC
    LIMIT ? OFFSET ?
  `).all(...parameters, limit, offset) as Row[];
  return { items: rows.map(rowToProspect), total: Number(totalRow.count), limit, offset };
}

export function getMarketSummary(): MarketSummary {
  const counts = database.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN target_status = 'candidate' THEN 1 ELSE 0 END) AS candidates,
      SUM(CASE WHEN website != '' THEN 1 ELSE 0 END) AS with_website,
      SUM(CASE WHEN emails_json != '[]' THEN 1 ELSE 0 END) AS with_email,
      SUM(CASE WHEN phones_json != '[]' THEN 1 ELSE 0 END) AS with_phone,
      SUM(CASE WHEN verification_status = 'website-verified' THEN 1 ELSE 0 END) AS website_verified,
      SUM(CASE WHEN verification_status = 'website-queued' AND target_status != 'excluded-noncommercial' THEN 1 ELSE 0 END) AS website_queued,
      SUM(CASE WHEN verification_status = 'verification-error' THEN 1 ELSE 0 END) AS verification_errors,
      SUM(CASE WHEN permission_status IN ('opted-in', 'approved-business-contact') AND suppressed = 0 THEN 1 ELSE 0 END) AS outreach_ready,
      SUM(CASE WHEN suppressed = 1 THEN 1 ELSE 0 END) AS suppressed
    FROM market_prospects
  `).get() as Row;
  const categories = database.prepare(`
    SELECT category AS label, COUNT(*) AS count FROM market_prospects
    WHERE target_status != 'excluded-noncommercial' GROUP BY category ORDER BY count DESC LIMIT 12
  `).all() as Row[];
  const locations = database.prepare(`
    SELECT location AS label, COUNT(*) AS count FROM market_prospects
    WHERE target_status != 'excluded-noncommercial' GROUP BY location ORDER BY count DESC LIMIT 12
  `).all() as Row[];
  const actionCounts = database.prepare(`SELECT status, COUNT(*) AS count FROM outreach_actions GROUP BY status ORDER BY count DESC`).all() as Row[];
  const actionDelivery = database.prepare(`
    SELECT
      SUM(CASE WHEN channel = 'task' AND status = 'sent' THEN 1 ELSE 0 END) AS internal_tasks_released,
      SUM(CASE WHEN channel IN ('email', 'whatsapp') AND status = 'sent' THEN 1 ELSE 0 END) AS external_messages_sent
    FROM outreach_actions
  `).get() as Row;
  return {
    total: Number(counts.total ?? 0),
    candidates: Number(counts.candidates ?? 0),
    withWebsite: Number(counts.with_website ?? 0),
    withEmail: Number(counts.with_email ?? 0),
    withPhone: Number(counts.with_phone ?? 0),
    websiteVerified: Number(counts.website_verified ?? 0),
    websiteQueued: Number(counts.website_queued ?? 0),
    verificationErrors: Number(counts.verification_errors ?? 0),
    outreachReady: Number(counts.outreach_ready ?? 0),
    suppressed: Number(counts.suppressed ?? 0),
    internalTasksReleased: Number(actionDelivery.internal_tasks_released ?? 0),
    externalMessagesSent: Number(actionDelivery.external_messages_sent ?? 0),
    categories: categories.map((row) => ({ label: String(row.label), count: Number(row.count) })),
    locations: locations.map((row) => ({ label: String(row.label), count: Number(row.count) })),
    latestScan: getLatestScan(),
    actionCounts: actionCounts.map((row) => ({ status: row.status as OutreachStatus, count: Number(row.count) })),
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function updateProspectFromEnrichment(id: string, enrichment: WebsiteEnrichment): MarketProspect | undefined {
  const current = getMarketProspect(id);
  if (!current) return undefined;
  const now = new Date().toISOString();
  const emails = unique([...current.emails, ...enrichment.emails]);
  const phones = unique([...current.phones, ...enrichment.phones]);
  const socials = unique([...current.socialLinks, ...enrichment.socialLinks, ...enrichment.whatsappLinks]);
  database.prepare(`
    UPDATE market_prospects SET name = ?, website = ?, emails_json = ?, phones_json = ?,
      social_json = ?, verification_status = 'website-verified', fit_score = ?, signals_json = ?,
      verified_at = ?, updated_at = ? WHERE id = ?
  `).run(
    enrichment.businessName || current.name,
    enrichment.sourceUrl,
    JSON.stringify(emails),
    JSON.stringify(phones),
    JSON.stringify(socials),
    enrichment.fitScore,
    JSON.stringify(enrichment.signals),
    enrichment.observedAt || now,
    now,
    id,
  );
  return getMarketProspect(id);
}

export function reuseVerifiedWebsiteEvidence(id: string, website: string): MarketProspect | undefined {
  const current = getMarketProspect(id);
  if (!current || !website) return undefined;
  const sourceRow = database.prepare(`
    SELECT * FROM market_prospects
    WHERE id != ? AND website = ? AND verification_status = 'website-verified'
    ORDER BY verified_at DESC LIMIT 1
  `).get(id, website) as Row | undefined;
  if (!sourceRow) return undefined;
  const source = rowToProspect(sourceRow);
  const now = new Date().toISOString();
  database.prepare(`
    UPDATE market_prospects SET emails_json = ?, phones_json = ?, social_json = ?,
      verification_status = 'website-verified', fit_score = ?, signals_json = ?,
      verified_at = ?, updated_at = ? WHERE id = ?
  `).run(
    JSON.stringify(unique([...current.emails, ...source.emails])),
    JSON.stringify(unique([...current.phones, ...source.phones])),
    JSON.stringify(unique([...current.socialLinks, ...source.socialLinks])),
    source.fitScore,
    JSON.stringify(source.signals),
    source.verifiedAt ?? now,
    now,
    id,
  );
  return getMarketProspect(id);
}

export function markProspectVerification(id: string, status: VerificationStatus, message = ''): MarketProspect | undefined {
  const current = getMarketProspect(id);
  if (!current) return undefined;
  const signals = status === 'verification-error'
    ? [...current.signals.filter((signal) => signal.key !== 'verification-error'), { key: 'verification-error', label: 'Website verification needs review', state: 'unknown' as const, evidence: message, weight: 0 }]
    : current.signals;
  database.prepare('UPDATE market_prospects SET verification_status = ?, signals_json = ?, updated_at = ? WHERE id = ?')
    .run(status, JSON.stringify(signals), new Date().toISOString(), id);
  return getMarketProspect(id);
}

export function setProspectPermission(id: string, status: PermissionStatus, evidence: string): MarketProspect | undefined {
  const current = getMarketProspect(id);
  if (!current) return undefined;
  const optedOut = status === 'opted-out';
  database.prepare(`UPDATE market_prospects SET permission_status = ?, permission_evidence = ?, suppressed = ?, suppression_reason = ?, updated_at = ? WHERE id = ?`)
    .run(status, evidence, optedOut ? 1 : current.suppressed ? 1 : 0, optedOut ? (evidence || 'Consent withdrawn.') : current.suppressionReason, new Date().toISOString(), id);
  if (optedOut) addProspectToSuppression(current, evidence || 'Consent withdrawn.');
  return getMarketProspect(id);
}

function addProspectToSuppression(prospect: MarketProspect, reason: string): void {
  const statement = database.prepare('INSERT OR REPLACE INTO suppression_list (channel, destination, reason, created_at) VALUES (?, ?, ?, ?)');
  const now = new Date().toISOString();
  prospect.emails.forEach((email) => statement.run('email', email.toLowerCase(), reason, now));
  prospect.phones.forEach((phone) => statement.run('whatsapp', phone.replace(/\D/g, ''), reason, now));
}

export function suppressProspect(id: string, reason: string): MarketProspect | undefined {
  const current = getMarketProspect(id);
  if (!current) return undefined;
  addProspectToSuppression(current, reason);
  database.prepare(`UPDATE market_prospects SET suppressed = 1, suppression_reason = ?, permission_status = 'opted-out', updated_at = ? WHERE id = ?`)
    .run(reason, new Date().toISOString(), id);
  return getMarketProspect(id);
}

export function isDestinationSuppressed(channel: OutreachChannel, destination: string): boolean {
  const normalized = channel === 'email' ? destination.toLowerCase() : destination.replace(/\D/g, '');
  return Boolean(database.prepare('SELECT 1 FROM suppression_list WHERE channel = ? AND destination = ?').get(channel, normalized));
}

export function createOutreachAction(input: {
  prospectId: string;
  channel: OutreachChannel;
  destination: string;
  subject?: string;
  body: string;
  rationale?: string;
  createdBy: string;
  templateName?: string;
  templateLanguage?: string;
}): OutreachAction {
  const prospect = getMarketProspect(input.prospectId);
  if (!prospect) throw new Error('Prospect not found.');
  if (prospect.suppressed || prospect.permissionStatus === 'opted-out' || isDestinationSuppressed(input.channel, input.destination)) {
    throw new Error('This prospect or destination is suppressed.');
  }
  const now = new Date().toISOString();
  const id = randomUUID();
  const status: OutreachStatus = 'pending-approval';
  database.prepare(`
    INSERT INTO outreach_actions (
      id, prospect_id, channel, destination, subject, body, rationale, status,
      permission_snapshot, created_by, template_name, template_language, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.prospectId, input.channel, input.destination, input.subject ?? '', input.body,
    input.rationale ?? '', status, prospect.permissionStatus, input.createdBy,
    input.templateName ?? '', input.templateLanguage ?? 'en', now, now,
  );
  addOutreachEvent(id, 'draft-created', 'Draft queued for human review.', input.createdBy);
  return getOutreachAction(id)!;
}

export function getOutreachAction(id: string): OutreachAction | undefined {
  const row = database.prepare(`
    SELECT a.*, p.name AS prospect_name FROM outreach_actions a
    JOIN market_prospects p ON p.id = a.prospect_id WHERE a.id = ?
  `).get(id) as Row | undefined;
  return row ? rowToAction(row) : undefined;
}

export function listOutreachActions(input: { status?: OutreachStatus; limit?: number; offset?: number } = {}): { items: OutreachAction[]; total: number } {
  const where = input.status ? 'WHERE a.status = ?' : '';
  const parameters = input.status ? [input.status] : [];
  const total = database.prepare(`SELECT COUNT(*) AS count FROM outreach_actions a ${where}`).get(...parameters) as Row;
  const limit = Math.min(100, Math.max(1, input.limit ?? 50));
  const offset = Math.max(0, input.offset ?? 0);
  const rows = database.prepare(`
    SELECT a.*, p.name AS prospect_name FROM outreach_actions a
    JOIN market_prospects p ON p.id = a.prospect_id ${where}
    ORDER BY a.created_at DESC LIMIT ? OFFSET ?
  `).all(...parameters, limit, offset) as Row[];
  return { items: rows.map(rowToAction), total: Number(total.count) };
}

export function updateOutreachStatus(id: string, status: OutreachStatus, input: {
  actor: string;
  note?: string;
  providerId?: string;
  error?: string;
}): OutreachAction | undefined {
  const action = getOutreachAction(id);
  if (!action) return undefined;
  const now = new Date().toISOString();
  const approved = status === 'approved';
  const executed = status === 'sent' || status === 'failed';
  database.prepare(`
    UPDATE outreach_actions SET status = ?, approval_note = ?, approved_by = ?,
      approved_at = ?, executed_at = ?, provider_id = ?, error = ?, updated_at = ? WHERE id = ?
  `).run(
    status,
    input.note ?? action.approvalNote,
    approved ? input.actor : action.approvedBy,
    approved ? now : (action.approvedAt ?? null),
    executed ? now : (action.executedAt ?? null),
    input.providerId ?? action.providerId,
    input.error ?? action.error,
    now,
    id,
  );
  addOutreachEvent(id, `status-${status}`, input.note ?? '', input.actor);
  return getOutreachAction(id);
}

export function addOutreachEvent(actionId: string, eventType: string, detail: string, actor: string): void {
  database.prepare('INSERT INTO outreach_events (action_id, event_type, detail, actor, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(actionId, eventType, detail, actor, new Date().toISOString());
}

export function resetInterruptedScans(): void {
  database.prepare(`UPDATE scan_runs SET status = 'interrupted', message = 'Server restarted before the scan completed.', completed_at = ? WHERE status = 'running'`)
    .run(new Date().toISOString());
}

export function marketDatabasePath(): string {
  return databasePath;
}
