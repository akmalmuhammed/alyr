import nodemailer from 'nodemailer';
import {
  createOutreachAction,
  getMarketProspect,
  getOutreachAction,
  isDestinationSuppressed,
  updateOutreachStatus,
} from './marketDb.js';
import type {
  MarketProspect,
  OutreachAction,
  OutreachChannel,
  PermissionStatus,
} from './marketTypes.js';

export type OutreachMode = 'disabled' | 'live';

export interface OutreachRuntimeConfig {
  mode: OutreachMode;
  smtpConfigured: boolean;
  whatsappConfigured: boolean;
}

function outreachMode(): OutreachMode {
  return process.env.OUTREACH_MODE?.trim().toLowerCase() === 'live' ? 'live' : 'disabled';
}

export function getOutreachRuntimeConfig(): OutreachRuntimeConfig {
  return {
    mode: outreachMode(),
    smtpConfigured: Boolean(
      process.env.SMTP_HOST?.trim()
      && process.env.SMTP_PORT?.trim()
      && process.env.SMTP_FROM?.trim(),
    ),
    whatsappConfigured: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN?.trim()
      && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(),
    ),
  };
}

export function permissionAllowsChannel(status: PermissionStatus, channel: OutreachChannel): boolean {
  if (channel === 'task') return status !== 'opted-out';
  if (channel === 'whatsapp') return status === 'opted-in';
  return status === 'opted-in' || status === 'approved-business-contact';
}

function validateDestination(channel: OutreachChannel, destination: string): string {
  const value = destination.trim();
  if (channel === 'task') return value;
  if (channel === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('A valid email destination is required.');
    return value.toLowerCase();
  }
  const phone = value.replace(/\D/g, '');
  if (phone.length < 8 || phone.length > 15) throw new Error('A valid international WhatsApp number is required.');
  return phone;
}

function firstDestination(prospect: MarketProspect, channel: OutreachChannel): string {
  if (channel === 'email') return prospect.emails[0] ?? '';
  if (channel === 'whatsapp') return prospect.phones[0] ?? '';
  return '';
}

function draftCopy(prospect: MarketProspect, channel: OutreachChannel): { subject: string; body: string; rationale: string } {
  const opportunity = prospect.signals.find((signal) => signal.state === 'opportunity')?.label
    ?? 'a more connected customer and operating workflow';
  const subject = `A focused digital opportunity for ${prospect.name}`;
  const body = channel === 'task'
    ? `Research ${prospect.name}, confirm the right decision-maker and outreach permission, then prepare a tailored ALYR transformation brief. Current evidence points to ${opportunity.toLowerCase()}.`
    : `Hello ${prospect.name} team,\n\nI am reaching out from ALYR Digital Transformation. Based on a review of your public business presence, we identified a practical opportunity around ${opportunity.toLowerCase()}.\n\nALYR helps Qatar businesses improve the complete operating journey: customer acquisition, websites and portals, CRM, workflow automation, AI-assisted service, cybersecurity, data and ongoing digital growth.\n\nIf this is relevant, may we share a short, no-obligation transformation snapshot prepared for ${prospect.name}?\n\nRegards,\nALYR Digital Transformation\n\nTo stop receiving messages from ALYR, reply STOP or use the unsubscribe option provided.`;
  return {
    subject,
    body,
    rationale: `Drafted from public-source category and website evidence. Human review must confirm relevance, destination, permission and local legal requirements before approval.`,
  };
}

export function createDefaultOutreachDraft(input: {
  prospectId: string;
  channel: OutreachChannel;
  destination?: string;
  subject?: string;
  body?: string;
  rationale?: string;
  createdBy?: string;
  templateName?: string;
  templateLanguage?: string;
}): OutreachAction {
  const prospect = getMarketProspect(input.prospectId);
  if (!prospect) throw new Error('Prospect not found.');
  const copy = draftCopy(prospect, input.channel);
  const destination = validateDestination(input.channel, input.destination ?? firstDestination(prospect, input.channel));
  if (input.channel !== 'task' && !destination) throw new Error(`No ${input.channel} destination is available for this prospect.`);
  return createOutreachAction({
    prospectId: prospect.id,
    channel: input.channel,
    destination,
    subject: input.subject?.trim() || copy.subject,
    body: input.body?.trim() || copy.body,
    rationale: input.rationale?.trim() || copy.rationale,
    createdBy: input.createdBy?.trim() || 'ALYR workspace',
    templateName: input.templateName?.trim(),
    templateLanguage: input.templateLanguage?.trim() || 'en',
  });
}

function ensureActionCanProceed(action: OutreachAction): MarketProspect {
  const prospect = getMarketProspect(action.prospectId);
  if (!prospect) throw new Error('The prospect no longer exists.');
  if (prospect.suppressed || prospect.permissionStatus === 'opted-out') throw new Error('The prospect is suppressed or opted out.');
  if (isDestinationSuppressed(action.channel, action.destination)) throw new Error('The destination is on the suppression list.');
  if (!permissionAllowsChannel(prospect.permissionStatus, action.channel)) {
    const requirement = action.channel === 'whatsapp'
      ? 'recorded WhatsApp opt-in'
      : action.channel === 'email'
        ? 'recorded opt-in or a counsel-approved business-contact basis'
        : 'a non-opted-out prospect';
    throw new Error(`Approval blocked: ${action.channel} requires ${requirement}.`);
  }
  if (action.channel === 'whatsapp' && !action.templateName) {
    throw new Error('WhatsApp-initiated outreach requires an approved template name.');
  }
  return prospect;
}

export function approveOutreachAction(id: string, actor: string, note: string): OutreachAction {
  const action = getOutreachAction(id);
  if (!action) throw new Error('Outreach action not found.');
  if (action.status !== 'pending-approval') throw new Error('Only pending actions can be approved.');
  ensureActionCanProceed(action);
  const approved = updateOutreachStatus(id, 'approved', {
    actor: actor.trim() || 'ALYR human reviewer',
    note: note.trim() || 'Destination, relevance, permission and message reviewed.',
  });
  if (!approved) throw new Error('Outreach action disappeared during approval.');
  return approved;
}

export function rejectOutreachAction(id: string, actor: string, note: string): OutreachAction {
  const action = getOutreachAction(id);
  if (!action) throw new Error('Outreach action not found.');
  if (!['pending-approval', 'approved'].includes(action.status)) throw new Error('This action can no longer be rejected.');
  const rejected = updateOutreachStatus(id, 'rejected', {
    actor: actor.trim() || 'ALYR human reviewer',
    note: note.trim() || 'Rejected during human review.',
  });
  if (!rejected) throw new Error('Outreach action disappeared during rejection.');
  return rejected;
}

async function sendEmail(action: OutreachAction): Promise<string> {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? 0);
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !port || !from) throw new Error('SMTP is not configured.');
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE?.trim().toLowerCase() === 'true',
    auth: user && pass ? { user, pass } : undefined,
  });
  const result = await transporter.sendMail({
    from,
    to: action.destination,
    subject: action.subject,
    text: action.body,
    replyTo: process.env.SMTP_REPLY_TO?.trim() || undefined,
  });
  return result.messageId;
}

async function sendWhatsAppTemplate(action: OutreachAction): Promise<string> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION?.trim() || 'v23.0';
  if (!accessToken || !phoneNumberId) throw new Error('WhatsApp Cloud API is not configured.');
  const response = await fetch(`https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: action.destination,
      type: 'template',
      template: {
        name: action.templateName,
        language: { code: action.templateLanguage || 'en' },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json() as { messages?: Array<{ id?: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || `WhatsApp returned HTTP ${response.status}.`);
  const providerId = payload.messages?.[0]?.id;
  if (!providerId) throw new Error('WhatsApp did not return a message identifier.');
  return providerId;
}

export async function executeApprovedOutreachAction(id: string, actor = 'ALYR dispatcher'): Promise<OutreachAction> {
  const action = getOutreachAction(id);
  if (!action) throw new Error('Outreach action not found.');
  if (action.status !== 'approved') throw new Error('Only a human-approved action can be executed.');
  ensureActionCanProceed(action);
  const config = getOutreachRuntimeConfig();
  if (action.channel !== 'task' && config.mode !== 'live') {
    throw new Error('External outreach is disabled. Set OUTREACH_MODE=live only after compliance and provider setup are complete.');
  }
  updateOutreachStatus(id, 'executing', { actor, note: 'Permission and suppression gates rechecked immediately before execution.' });
  try {
    const providerId = action.channel === 'email'
      ? await sendEmail(action)
      : action.channel === 'whatsapp'
        ? await sendWhatsAppTemplate(action)
        : `internal-task:${id}`;
    const sent = updateOutreachStatus(id, 'sent', { actor, providerId, note: action.channel === 'task' ? 'Internal follow-up task released.' : 'Provider accepted the message.' });
    if (!sent) throw new Error('Outreach action disappeared after execution.');
    return sent;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Outreach execution failed.';
    updateOutreachStatus(id, 'failed', { actor, error: message, note: message });
    throw new Error(message);
  }
}
