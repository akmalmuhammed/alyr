import './env.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { searchDemo, getDemoDetails } from './demo.js';
import { enrichWebsite } from './enrichment.js';
import { getGooglePlaceDetails, searchGooglePlaces } from './googlePlaces.js';
import { leadPatchSchema, leadSchema } from './leadSchema.js';
import { createLead, deleteLead, listLeads, updateLead } from './store.js';
import type { PlaceSummary } from './types.js';
import {
  getMarketProspect,
  getMarketSummary,
  listMarketProspects,
  listOutreachActions,
  marketDatabasePath,
  resetInterruptedScans,
  setProspectPermission,
  suppressProspect,
} from './marketDb.js';
import { runQatarOpenDataScan } from './osmScan.js';
import { verifyMarketBatch, verifyMarketProspect } from './marketVerification.js';
import {
  approveOutreachAction,
  createDefaultOutreachDraft,
  executeApprovedOutreachAction,
  getOutreachRuntimeConfig,
  rejectOutreachAction,
} from './outreach.js';
import {
  getCommandDashboard,
  listClientAccounts,
  listDeliveryProjects,
  listOperationalEvents,
  listProspectContacts,
  recordOperationalEvent,
  upsertClientAccount,
  upsertDeliveryProject,
  upsertProspectContact,
} from './operationsDb.js';

try {
  process.loadEnvFile?.('.env');
} catch {
  // A missing .env file is expected in demo mode.
}

const app = express();
const port = Number(process.env.PORT || 8787);
const googleKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
const isGoogleConfigured = Boolean(googleKey);
resetInterruptedScans();

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '160kb' }));
app.use('/api', rateLimit({
  windowMs: 60_000,
  limit: 90,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
}));

const searchSchema = z.object({
  query: z.string().trim().max(120).default(''),
  category: z.string().trim().max(80).default(''),
  location: z.string().trim().max(100).default('Doha, Qatar'),
  pageToken: z.string().trim().max(1000).optional(),
});

const batchSchema = z.object({
  query: z.string().trim().max(120).default(''),
  categories: z.array(z.string().trim().min(1).max(80)).min(1).max(4),
  locations: z.array(z.string().trim().min(1).max(100)).min(1).max(3),
}).superRefine((value, context) => {
  if (value.categories.length * value.locations.length > 8) {
    context.addIssue({ code: 'custom', message: 'A batch campaign is limited to eight user-initiated search combinations.' });
  }
});

const websiteSchema = z.object({ url: z.string().trim().min(4).max(2048) });
const placeDetailsSchema = z.object({ placeId: z.string().trim().min(3).max(500) });
const marketQuerySchema = z.object({
  search: z.string().trim().max(140).optional(),
  category: z.string().trim().max(100).optional(),
  location: z.string().trim().max(100).optional(),
  verification: z.enum(['source-verified', 'website-queued', 'website-verified', 'no-website', 'verification-error']).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  withContact: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  includeExcluded: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
const marketIdSchema = z.string().trim().min(5).max(200);
const permissionSchema = z.object({
  status: z.enum(['unknown', 'opted-in', 'approved-business-contact', 'opted-out']),
  evidence: z.string().trim().max(1000).default(''),
}).superRefine((value, context) => {
  if (value.status !== 'unknown' && value.evidence.length < 8) {
    context.addIssue({ code: 'custom', path: ['evidence'], message: 'Record meaningful permission evidence, source and date.' });
  }
});
const suppressionSchema = z.object({ reason: z.string().trim().min(4).max(1000) });
const verifyBatchSchema = z.object({
  limit: z.number().int().min(1).max(250).default(20),
  delayMs: z.number().int().min(250).max(5000).default(750),
  concurrency: z.number().int().min(1).max(4).default(3),
});
const outreachDraftSchema = z.object({
  prospectId: marketIdSchema,
  channel: z.enum(['email', 'whatsapp', 'task']),
  destination: z.string().trim().max(320).optional(),
  subject: z.string().trim().max(240).optional(),
  body: z.string().trim().max(8000).optional(),
  rationale: z.string().trim().max(2000).optional(),
  createdBy: z.string().trim().max(120).optional(),
  templateName: z.string().trim().max(160).optional(),
  templateLanguage: z.string().trim().max(20).optional(),
});
const actionQuerySchema = z.object({
  status: z.enum(['draft', 'pending-approval', 'approved', 'executing', 'sent', 'failed', 'rejected', 'blocked']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
const approvalSchema = z.object({
  actor: z.string().trim().min(2).max(120),
  note: z.string().trim().max(1000).default(''),
});

const operationalEventSchema = z.object({
  id: z.string().uuid().optional(),
  dedupeKey: z.string().trim().min(8).max(320).optional(),
  type: z.enum([
    'prospect.qualified', 'contact.identified', 'outreach.sent', 'outreach.replied',
    'meeting.booked', 'proposal.sent', 'account.won', 'account.lost', 'account.updated',
    'project.started', 'project.updated', 'project.risk', 'project.completed',
    'agent.recommendation', 'source.synced',
  ]),
  source: z.enum(['hermes', 'google-maps', 'openstreetmap', 'website-verifier', 'manual', 'crm', 'import', 'system']),
  entityType: z.enum(['prospect', 'contact', 'account', 'project', 'agent', 'source']),
  entityId: z.string().trim().max(200).default(''),
  category: z.string().trim().max(120).default(''),
  accountName: z.string().trim().max(200).default(''),
  summary: z.string().trim().min(3).max(2000),
  valueQar: z.number().finite().min(0).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  occurredAt: z.string().datetime().optional(),
});

const accountSchema = z.object({
  id: z.string().uuid().optional(),
  sourceProspectId: z.string().trim().max(200).default(''),
  name: z.string().trim().min(2).max(200),
  category: z.string().trim().max(120).default(''),
  owner: z.string().trim().max(120).default('Unassigned'),
  status: z.enum(['onboarding', 'active', 'paused', 'completed', 'at-risk', 'archived']).default('onboarding'),
  health: z.enum(['strong', 'on-track', 'attention', 'at-risk']).default('on-track'),
  engagementModel: z.string().trim().max(200).default(''),
  valueQar: z.number().finite().min(0).optional(),
  onboardedAt: z.string().datetime().optional(),
  nextAction: z.string().trim().max(500).default(''),
  nextActionDueAt: z.string().datetime().optional(),
  summary: z.string().trim().max(2000).default(''),
});

const workstreamSchema = z.object({
  name: z.string().trim().min(2).max(160),
  state: z.enum(['not-started', 'in-progress', 'blocked', 'complete']),
  progress: z.number().int().min(0).max(100),
});

const projectSchema = z.object({
  id: z.string().uuid().optional(),
  accountId: z.string().trim().max(200).default(''),
  name: z.string().trim().min(2).max(200),
  phase: z.enum(['discovery', 'strategy', 'design', 'build', 'activate', 'optimize', 'complete']).default('discovery'),
  progress: z.number().int().min(0).max(100).default(0),
  health: z.enum(['strong', 'on-track', 'attention', 'at-risk']).default('on-track'),
  owner: z.string().trim().max(120).default('Unassigned'),
  nextMilestone: z.string().trim().max(500).default(''),
  dueAt: z.string().datetime().optional(),
  summary: z.string().trim().max(2000).default(''),
  workstreams: z.array(workstreamSchema).max(24).default([]),
  blockers: z.array(z.string().trim().min(2).max(500)).max(24).default([]),
});

const contactSchema = z.object({
  id: z.string().uuid().optional(),
  prospectId: marketIdSchema,
  name: z.string().trim().max(200).default(''),
  role: z.string().trim().max(160).default(''),
  email: z.string().trim().email().or(z.literal('')).default(''),
  phone: z.string().trim().max(80).default(''),
  linkedinUrl: z.string().trim().url().or(z.literal('')).default(''),
  sourceUrl: z.string().trim().url().or(z.literal('')).default(''),
  confidence: z.number().int().min(0).max(100).default(0),
  verifiedAt: z.string().datetime().optional(),
}).superRefine((value, context) => {
  if (!value.name && !value.email && !value.phone) {
    context.addIssue({ code: 'custom', message: 'A contact needs a name, email or phone.' });
  }
});

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'ALYR Prospect Engine', time: new Date().toISOString() });
});

app.get('/api/config', (_request, response) => {
  response.json({
    discoveryMode: isGoogleConfigured ? 'google' : 'demo',
    googleConfigured: isGoogleConfigured,
    batchQueryLimit: 8,
    persistencePolicy: 'Google Place IDs plus ALYR/user-owned or independently website-verified data only.',
    policies: {
      googlePlaces: 'https://developers.google.com/maps/documentation/places/web-service/policies',
      googleTerms: 'https://cloud.google.com/maps-platform/terms',
      googlePrivacy: 'https://policies.google.com/privacy',
      openStreetMap: 'https://www.openstreetmap.org/copyright',
      qatarDirectMarketing: 'https://assurance.ncsa.gov.qa/sites/default/files/library/2022-12/Electronic%20Communications%20for%20Direct%20Marketing%20-%20Guideline%20for%20Regulated%20Entities.pdf',
      whatsappBusiness: 'https://www.whatsapp.com/legal/business-policy/',
    },
    qatarScan: {
      enabled: true,
      source: 'OpenStreetMap / ODbL',
      database: marketDatabasePath(),
    },
    hermes: {
      mcpReady: true,
      humanApprovalRequired: true,
      externalOutreach: getOutreachRuntimeConfig(),
    },
  });
});

app.post('/api/discovery/search', async (request, response, next) => {
  try {
    const input = searchSchema.parse(request.body);
    if (isGoogleConfigured && googleKey) {
      const result = await searchGooglePlaces(input, googleKey);
      response.json({ ...result, source: 'google', queryCount: 1 });
      return;
    }
    response.json({ results: searchDemo(input.query, input.location, input.category), source: 'demo', queryCount: 1 });
  } catch (error) {
    next(error);
  }
});

app.post('/api/discovery/batch', async (request, response, next) => {
  try {
    const input = batchSchema.parse(request.body);
    const deduplicated = new Map<string, PlaceSummary>();
    let queryCount = 0;

    for (const location of input.locations) {
      for (const category of input.categories) {
        queryCount += 1;
        const result = isGoogleConfigured && googleKey
          ? (await searchGooglePlaces({ query: input.query, category, location }, googleKey)).results
          : searchDemo(input.query, location, category);
        result.forEach((place) => deduplicated.set(place.placeId, place));
      }
    }

    response.json({
      results: [...deduplicated.values()],
      source: isGoogleConfigured ? 'google' : 'demo',
      queryCount,
      uniqueCount: deduplicated.size,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/places/details', async (request, response, next) => {
  try {
    const { placeId } = placeDetailsSchema.parse(request.body);
    const demo = getDemoDetails(placeId);
    if (demo) {
      response.json(demo);
      return;
    }
    if (!googleKey) {
      response.status(409).json({ error: 'Live Google Place details require GOOGLE_MAPS_API_KEY.' });
      return;
    }
    response.json(await getGooglePlaceDetails(placeId, googleKey));
  } catch (error) {
    next(error);
  }
});

app.post('/api/enrichment/website', async (request, response, next) => {
  try {
    const { url } = websiteSchema.parse(request.body);
    response.json(await enrichWebsite(url));
  } catch (error) {
    next(error);
  }
});

app.get('/api/leads', async (_request, response, next) => {
  try {
    response.json({ leads: await listLeads() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/leads', async (request, response, next) => {
  try {
    const input = leadSchema.parse(request.body);
    const lead = await createLead(input);
    recordOperationalEvent({
      type: 'prospect.qualified',
      source: 'manual',
      entityType: 'prospect',
      entityId: lead.id,
      category: lead.category,
      accountName: lead.verifiedName,
      summary: `${lead.verifiedName} entered the verified pipeline.`,
      payload: { status: lead.status, fitScore: lead.fitScore, website: lead.website },
      occurredAt: lead.createdAt,
      dedupeKey: `pipeline:${lead.id}:created`,
    });
    response.status(201).json(lead);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/leads/:id', async (request, response, next) => {
  try {
    const id = z.string().uuid().parse(request.params.id);
    const patch = leadPatchSchema.parse(request.body);
    const record = await updateLead(id, patch);
    if (!record) {
      response.status(404).json({ error: 'Lead not found.' });
      return;
    }
    if (patch.status) {
      const eventType = ({
        new: 'prospect.qualified',
        qualified: 'prospect.qualified',
        contacted: 'outreach.sent',
        meeting: 'meeting.booked',
        proposal: 'proposal.sent',
        won: 'account.won',
        'not-now': 'account.lost',
      } as const)[patch.status];
      recordOperationalEvent({
        type: eventType,
        source: 'manual',
        entityType: 'prospect',
        entityId: record.id,
        category: record.category,
        accountName: record.verifiedName,
        summary: `${record.verifiedName} moved to ${patch.status.replace('-', ' ')}.`,
        payload: { status: patch.status, owner: record.owner },
        occurredAt: record.updatedAt,
        dedupeKey: `pipeline:${record.id}:${patch.status}:${record.updatedAt}`,
      });
      if (patch.status === 'won') {
        upsertClientAccount({
          sourceProspectId: record.id,
          name: record.verifiedName,
          category: record.category,
          owner: record.owner,
          status: 'onboarding',
          health: 'on-track',
          engagementModel: 'To be confirmed',
          onboardedAt: record.updatedAt,
          nextAction: 'Confirm transformation scope and kickoff owner',
          summary: record.notes || 'Converted from the verified prospect pipeline.',
        });
      }
    }
    response.json(record);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/leads/:id', async (request, response, next) => {
  try {
    const id = z.string().uuid().parse(request.params.id);
    if (!(await deleteLead(id))) {
      response.status(404).json({ error: 'Lead not found.' });
      return;
    }
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/market/summary', (_request, response, next) => {
  try {
    response.json(getMarketSummary());
  } catch (error) {
    next(error);
  }
});

app.get('/api/market/prospects', (request, response, next) => {
  try {
    response.json(listMarketProspects(marketQuerySchema.parse(request.query)));
  } catch (error) {
    next(error);
  }
});

app.get('/api/market/prospects/:id', (request, response, next) => {
  try {
    const prospect = getMarketProspect(marketIdSchema.parse(request.params.id));
    if (!prospect) {
      response.status(404).json({ error: 'Prospect not found.' });
      return;
    }
    response.json(prospect);
  } catch (error) {
    next(error);
  }
});

app.post('/api/market/scan', async (_request, response, next) => {
  try {
    response.json(await runQatarOpenDataScan());
  } catch (error) {
    next(error);
  }
});

app.post('/api/market/prospects/:id/verify', async (request, response, next) => {
  try {
    response.json(await verifyMarketProspect(marketIdSchema.parse(request.params.id)));
  } catch (error) {
    next(error);
  }
});

app.post('/api/market/verify-batch', async (request, response, next) => {
  try {
    response.json(await verifyMarketBatch(verifyBatchSchema.parse(request.body ?? {})));
  } catch (error) {
    next(error);
  }
});

app.patch('/api/market/prospects/:id/permission', (request, response, next) => {
  try {
    const id = marketIdSchema.parse(request.params.id);
    const input = permissionSchema.parse(request.body);
    const prospect = setProspectPermission(id, input.status, input.evidence);
    if (!prospect) {
      response.status(404).json({ error: 'Prospect not found.' });
      return;
    }
    response.json(prospect);
  } catch (error) {
    next(error);
  }
});

app.post('/api/market/prospects/:id/suppress', (request, response, next) => {
  try {
    const prospect = suppressProspect(marketIdSchema.parse(request.params.id), suppressionSchema.parse(request.body).reason);
    if (!prospect) {
      response.status(404).json({ error: 'Prospect not found.' });
      return;
    }
    response.json(prospect);
  } catch (error) {
    next(error);
  }
});

app.get('/api/outreach/actions', (request, response, next) => {
  try {
    response.json(listOutreachActions(actionQuerySchema.parse(request.query)));
  } catch (error) {
    next(error);
  }
});

app.post('/api/outreach/drafts', (request, response, next) => {
  try {
    response.status(201).json(createDefaultOutreachDraft(outreachDraftSchema.parse(request.body)));
  } catch (error) {
    next(error);
  }
});

app.post('/api/outreach/actions/:id/approve', (request, response) => {
  try {
    const input = approvalSchema.parse(request.body);
    response.json(approveOutreachAction(z.string().uuid().parse(request.params.id), input.actor, input.note));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Approval failed.';
    response.status(error instanceof ZodError ? 400 : 409).json({ error: message });
  }
});

app.post('/api/outreach/actions/:id/reject', (request, response) => {
  try {
    const input = approvalSchema.parse(request.body);
    response.json(rejectOutreachAction(z.string().uuid().parse(request.params.id), input.actor, input.note));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Rejection failed.';
    response.status(error instanceof ZodError ? 400 : 409).json({ error: message });
  }
});

app.post('/api/outreach/actions/:id/execute', async (request, response) => {
  try {
    const input = approvalSchema.parse(request.body);
    response.json(await executeApprovedOutreachAction(z.string().uuid().parse(request.params.id), input.actor));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Execution failed.';
    response.status(error instanceof ZodError ? 400 : 409).json({ error: message });
  }
});

app.get('/api/dashboard/command', async (_request, response, next) => {
  try {
    response.json(getCommandDashboard(await listLeads(), {
      googleConfigured: isGoogleConfigured,
      hermesReady: true,
    }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/operations/events', (request, response, next) => {
  try {
    const limit = z.coerce.number().int().min(1).max(250).default(30).parse(request.query.limit);
    response.json({ items: listOperationalEvents(limit) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/operations/events', (request, response, next) => {
  try {
    const input = operationalEventSchema.parse(request.body);
    response.status(201).json(recordOperationalEvent({
      ...input,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
    }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/operations/accounts', (_request, response, next) => {
  try {
    response.json({ items: listClientAccounts() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/operations/accounts', (request, response, next) => {
  try {
    const input = accountSchema.parse(request.body);
    const account = upsertClientAccount(input);
    recordOperationalEvent({
      type: 'account.updated', source: 'manual', entityType: 'account', entityId: account.id,
      category: account.category, accountName: account.name,
      summary: `${account.name} account was ${input.id ? 'updated' : 'created'}.`,
      valueQar: account.valueQar, payload: { status: account.status, health: account.health },
      occurredAt: account.updatedAt, dedupeKey: `account:${account.id}:${account.updatedAt}`,
    });
    response.status(input.id ? 200 : 201).json(account);
  } catch (error) {
    next(error);
  }
});

app.get('/api/operations/projects', (_request, response, next) => {
  try {
    response.json({ items: listDeliveryProjects() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/operations/projects', (request, response, next) => {
  try {
    const input = projectSchema.parse(request.body);
    const project = upsertDeliveryProject(input);
    recordOperationalEvent({
      type: input.id ? (project.health === 'at-risk' ? 'project.risk' : 'project.updated') : 'project.started',
      source: 'manual', entityType: 'project', entityId: project.id, category: '',
      accountName: project.accountName, summary: `${project.name} is ${project.progress}% through ${project.phase}.`,
      payload: { phase: project.phase, progress: project.progress, health: project.health },
      occurredAt: project.updatedAt, dedupeKey: `project:${project.id}:${project.updatedAt}`,
    });
    response.status(input.id ? 200 : 201).json(project);
  } catch (error) {
    next(error);
  }
});

app.get('/api/operations/contacts', (request, response, next) => {
  try {
    const prospectId = request.query.prospectId
      ? marketIdSchema.parse(request.query.prospectId)
      : undefined;
    response.json({ items: listProspectContacts(prospectId) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/operations/contacts', (request, response, next) => {
  try {
    const input = contactSchema.parse(request.body);
    const contact = upsertProspectContact(input);
    recordOperationalEvent({
      type: 'contact.identified', source: 'manual', entityType: 'contact', entityId: contact.id,
      category: '', accountName: '', summary: `${contact.name || contact.role || 'A public contact'} was linked to a prospect.`,
      payload: { prospectId: contact.prospectId, role: contact.role, confidence: contact.confidence },
      occurredAt: contact.updatedAt, dedupeKey: `contact:${contact.id}:${contact.updatedAt}`,
    });
    response.status(input.id ? 200 : 201).json(contact);
  } catch (error) {
    next(error);
  }
});

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const distribution = path.resolve(currentDirectory, '../dist');
app.use(express.static(distribution, { fallthrough: true, maxAge: '1h' }));
app.use((request, response, next) => {
  if (request.method === 'GET' && request.accepts('html')) {
    response.sendFile(path.join(distribution, 'index.html'), (error) => error ? next(error) : undefined);
    return;
  }
  next();
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    response.status(400).json({ error: 'The request was invalid.', issues: error.issues });
    return;
  }
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  console.error(error);
  response.status(500).json({ error: message });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`ALYR Prospect Engine API listening on http://127.0.0.1:${port} (${isGoogleConfigured ? 'Google Places' : 'demo'} mode)`);
});
