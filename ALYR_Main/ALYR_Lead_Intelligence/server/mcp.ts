import './env.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  getMarketProspect,
  getMarketSummary,
  listMarketProspects,
  listOutreachActions,
  suppressProspect,
} from './marketDb.js';
import { verifyMarketProspect } from './marketVerification.js';
import { createDefaultOutreachDraft, executeApprovedOutreachAction, getOutreachRuntimeConfig } from './outreach.js';
import { listLeads } from './store.js';
import {
  getCommandDashboard,
  recordOperationalEvent,
  upsertClientAccount,
  upsertDeliveryProject,
  upsertProspectContact,
} from './operationsDb.js';

const server = new McpServer({
  name: 'alyr-qatar-market-intelligence',
  version: '0.2.0',
});

function result(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

server.registerTool('alyr_market_summary', {
  title: 'Read ALYR Qatar market summary',
  description: 'Returns counts, categories, locations, verification progress, outreach queue state and non-secret provider readiness from the local ALYR system.',
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async () => result({
  ...getMarketSummary(),
  runtime: {
    outreach: getOutreachRuntimeConfig(),
    googlePlacesConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim()),
    approvalRequired: true,
    permissionRecordScope: 'commercial-and-review-eligible-prospects',
    localOnly: true,
  },
}));

server.registerTool('alyr_command_dashboard', {
  title: 'Read ALYR Growth OS command picture',
  description: 'Returns the owner-facing operating picture across Qatar market potential, category traction, priority accounts, outreach controls, client accounts, delivery projects, sources and recent events.',
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async () => result(getCommandDashboard(await listLeads(), {
  googleConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim()),
  hermesReady: true,
})));

server.registerTool('alyr_list_prospects', {
  title: 'Search ALYR prospects',
  description: 'Searches the locally saved Qatar business dataset. Results are research candidates, not proof of outreach permission.',
  inputSchema: {
    search: z.string().max(140).optional(),
    category: z.string().max(100).optional(),
    location: z.string().max(100).optional(),
    verification: z.enum(['source-verified', 'website-queued', 'website-verified', 'no-website', 'verification-error']).optional(),
    permission: z.enum(['unknown', 'opted-in', 'approved-business-contact', 'opted-out']).optional(),
    targetStatus: z.enum(['candidate', 'needs-review']).optional(),
    minScore: z.number().int().min(0).max(100).optional(),
    withContact: z.boolean().optional(),
    limit: z.number().int().min(1).max(25).default(10),
    offset: z.number().int().min(0).default(0),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async (input) => result(listMarketProspects(input)));

server.registerTool('alyr_get_prospect', {
  title: 'Read one ALYR prospect',
  description: 'Returns source provenance, public contact evidence, fit signals, verification state, permission state and suppression state.',
  inputSchema: { prospectId: z.string().min(5).max(200) },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async ({ prospectId }) => {
  const prospect = getMarketProspect(prospectId);
  if (!prospect) throw new Error('Prospect not found.');
  return result(prospect);
});

server.registerTool('alyr_verify_website', {
  title: 'Verify one prospect website',
  description: 'Runs the guarded ALYR website verifier for one saved prospect and stores public contact and transformation evidence.',
  inputSchema: { prospectId: z.string().min(5).max(200) },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
}, async ({ prospectId }) => result(await verifyMarketProspect(prospectId)));

server.registerTool('alyr_create_outreach_draft', {
  title: 'Create an outreach draft',
  description: 'Creates a draft for human review. It does not approve or send anything. Email and WhatsApp drafts remain blocked until permission evidence is recorded in the ALYR workspace.',
  inputSchema: {
    prospectId: z.string().min(5).max(200),
    channel: z.enum(['email', 'whatsapp', 'task']),
    destination: z.string().max(320).optional(),
    subject: z.string().max(240).optional(),
    body: z.string().max(8000).optional(),
    rationale: z.string().max(2000).optional(),
    templateName: z.string().max(160).optional(),
    templateLanguage: z.string().max(20).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async (input) => result(createDefaultOutreachDraft({ ...input, createdBy: 'Hermes agent' })));

server.registerTool('alyr_list_outreach_queue', {
  title: 'Read the human-controlled outreach queue',
  description: 'Returns outreach drafts and their approval/execution states. Hermes cannot approve its own messages.',
  inputSchema: {
    status: z.enum(['pending-approval', 'approved', 'executing', 'sent', 'failed', 'rejected', 'blocked']).optional(),
    limit: z.number().int().min(1).max(50).default(20),
    offset: z.number().int().min(0).default(0),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async (input) => result(listOutreachActions(input)));

server.registerTool('alyr_execute_approved_action', {
  title: 'Execute an already approved action',
  description: 'Executes only a separately human-approved action and rechecks live permission and suppression state. External sends also require OUTREACH_MODE=live and configured providers.',
  inputSchema: { actionId: z.string().uuid() },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
}, async ({ actionId }) => result(await executeApprovedOutreachAction(actionId, 'Hermes dispatcher')));

server.registerTool('alyr_record_operational_event', {
  title: 'Record an idempotent Growth OS event',
  description: 'Records an observed Hermes event for analytics and traceability. It does not send outreach, approve an action or change a government/external system. Reuse the same dedupe key when retrying.',
  inputSchema: {
    dedupeKey: z.string().min(8).max(320),
    type: z.enum([
      'prospect.qualified', 'contact.identified', 'outreach.sent', 'outreach.replied',
      'meeting.booked', 'proposal.sent', 'account.won', 'account.lost', 'account.updated',
      'project.started', 'project.updated', 'project.risk', 'project.completed',
      'agent.recommendation', 'source.synced',
    ]),
    entityType: z.enum(['prospect', 'contact', 'account', 'project', 'agent', 'source']),
    entityId: z.string().max(200).default(''),
    category: z.string().max(120).default(''),
    accountName: z.string().max(200).default(''),
    summary: z.string().min(3).max(2000),
    valueQar: z.number().min(0).optional(),
    payload: z.record(z.string(), z.unknown()).default({}),
    occurredAt: z.string().datetime().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async (input) => result(recordOperationalEvent({
  ...input,
  source: 'hermes',
  occurredAt: input.occurredAt ?? new Date().toISOString(),
})));

server.registerTool('alyr_upsert_prospect_contact', {
  title: 'Upsert a source-attributed prospect contact',
  description: 'Adds or updates a public business contact linked to a saved prospect. A source URL and confidence score preserve provenance; this does not grant outreach permission.',
  inputSchema: {
    id: z.string().uuid().optional(),
    prospectId: z.string().min(5).max(200),
    name: z.string().max(200).default(''),
    role: z.string().max(160).default(''),
    email: z.string().email().or(z.literal('')).default(''),
    phone: z.string().max(80).default(''),
    linkedinUrl: z.string().url().or(z.literal('')).default(''),
    sourceUrl: z.string().url(),
    confidence: z.number().int().min(0).max(100),
    verifiedAt: z.string().datetime().optional(),
    eventDedupeKey: z.string().min(8).max(320),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async ({ eventDedupeKey, ...input }) => {
  const contact = upsertProspectContact(input);
  recordOperationalEvent({
    type: 'contact.identified', source: 'hermes', entityType: 'contact', entityId: contact.id,
    category: '', accountName: '', summary: `${contact.name || contact.role || 'A public business contact'} was linked to prospect ${contact.prospectId}.`,
    payload: { prospectId: contact.prospectId, role: contact.role, confidence: contact.confidence, sourceUrl: contact.sourceUrl },
    occurredAt: contact.updatedAt, dedupeKey: eventDedupeKey,
  });
  return result(contact);
});

server.registerTool('alyr_upsert_client_account', {
  title: 'Upsert an ALYR client account',
  description: 'Creates or updates a client account after a real commercial state change. Use sourceProspectId to preserve the discovery-to-client lineage.',
  inputSchema: {
    id: z.string().uuid().optional(),
    sourceProspectId: z.string().max(200).default(''),
    name: z.string().min(2).max(200),
    category: z.string().max(120).default(''),
    owner: z.string().max(120).default('Unassigned'),
    status: z.enum(['onboarding', 'active', 'paused', 'completed', 'at-risk', 'archived']).default('onboarding'),
    health: z.enum(['strong', 'on-track', 'attention', 'at-risk']).default('on-track'),
    engagementModel: z.string().max(200).default(''),
    valueQar: z.number().min(0).optional(),
    onboardedAt: z.string().datetime().optional(),
    nextAction: z.string().max(500).default(''),
    nextActionDueAt: z.string().datetime().optional(),
    summary: z.string().max(2000).default(''),
    eventDedupeKey: z.string().min(8).max(320),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async ({ eventDedupeKey, ...input }) => {
  const account = upsertClientAccount(input);
  recordOperationalEvent({
    type: 'account.updated', source: 'hermes', entityType: 'account', entityId: account.id,
    category: account.category, accountName: account.name, summary: `${account.name} account is ${account.status} with ${account.health} health.`,
    valueQar: account.valueQar, payload: { status: account.status, health: account.health, nextAction: account.nextAction },
    occurredAt: account.updatedAt, dedupeKey: eventDedupeKey,
  });
  return result(account);
});

server.registerTool('alyr_upsert_delivery_project', {
  title: 'Upsert an ALYR transformation project',
  description: 'Creates or updates a governed project record with outcome phase, health, workstreams and blockers. Reuse the event dedupe key for retries.',
  inputSchema: {
    id: z.string().uuid().optional(),
    accountId: z.string().max(200).default(''),
    name: z.string().min(2).max(200),
    phase: z.enum(['discovery', 'strategy', 'design', 'build', 'activate', 'optimize', 'complete']).default('discovery'),
    progress: z.number().int().min(0).max(100).default(0),
    health: z.enum(['strong', 'on-track', 'attention', 'at-risk']).default('on-track'),
    owner: z.string().max(120).default('Unassigned'),
    nextMilestone: z.string().max(500).default(''),
    dueAt: z.string().datetime().optional(),
    summary: z.string().max(2000).default(''),
    workstreams: z.array(z.object({
      name: z.string().min(2).max(160),
      state: z.enum(['not-started', 'in-progress', 'blocked', 'complete']),
      progress: z.number().int().min(0).max(100),
    })).max(24).default([]),
    blockers: z.array(z.string().min(2).max(500)).max(24).default([]),
    eventDedupeKey: z.string().min(8).max(320),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async ({ eventDedupeKey, ...input }) => {
  const project = upsertDeliveryProject(input);
  const type = project.phase === 'complete'
    ? 'project.completed'
    : project.health === 'at-risk'
      ? 'project.risk'
      : input.id ? 'project.updated' : 'project.started';
  recordOperationalEvent({
    type, source: 'hermes', entityType: 'project', entityId: project.id,
    category: '', accountName: project.accountName, summary: `${project.name} is ${project.progress}% through ${project.phase}.`,
    payload: { phase: project.phase, progress: project.progress, health: project.health, blockers: project.blockers },
    occurredAt: project.updatedAt, dedupeKey: eventDedupeKey,
  });
  return result(project);
});

server.registerTool('alyr_suppress_prospect', {
  title: 'Suppress a prospect',
  description: 'Records an opt-out/suppression and prevents future ALYR outreach to known destinations. Use immediately when a stop request is received.',
  inputSchema: {
    prospectId: z.string().min(5).max(200),
    reason: z.string().min(4).max(1000),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
}, async ({ prospectId, reason }) => {
  const prospect = suppressProspect(prospectId, reason);
  if (!prospect) throw new Error('Prospect not found.');
  return result(prospect);
});

await server.connect(new StdioServerTransport());
