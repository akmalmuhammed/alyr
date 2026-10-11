import { z } from 'zod';

const signalSchema = z.object({
  key: z.string().max(80),
  label: z.string().max(140),
  state: z.enum(['opportunity', 'strength', 'unknown']),
  evidence: z.string().max(500),
  weight: z.number().min(-30).max(30),
});

export const leadStatusSchema = z.enum(['new', 'qualified', 'contacted', 'meeting', 'proposal', 'won', 'not-now']);

const leadFields = {
  placeId: z.string().trim().max(500).optional(),
  verifiedName: z.string().trim().min(1).max(180),
  website: z.string().trim().max(2048),
  category: z.string().trim().max(80),
  location: z.string().trim().max(100),
  emails: z.array(z.string().trim().max(320)).max(12),
  phones: z.array(z.string().trim().max(80)).max(12),
  socialLinks: z.array(z.string().trim().max(2048)).max(12),
  sourceUrl: z.string().trim().max(2048),
  sourceType: z.enum(['website', 'manual', 'licensed-import']),
  status: leadStatusSchema,
  owner: z.string().trim().max(100),
  notes: z.string().trim().max(5000),
  signals: z.array(signalSchema).max(30),
  fitScore: z.number().int().min(0).max(100),
};

export const leadSchema = z.object({
  ...leadFields,
  website: leadFields.website.default(''),
  category: leadFields.category.default(''),
  location: leadFields.location.default(''),
  emails: leadFields.emails.default([]),
  phones: leadFields.phones.default([]),
  socialLinks: leadFields.socialLinks.default([]),
  sourceUrl: leadFields.sourceUrl.default(''),
  sourceType: leadFields.sourceType.default('website'),
  status: leadFields.status.default('new'),
  owner: leadFields.owner.default('Unassigned'),
  notes: leadFields.notes.default(''),
  signals: leadFields.signals.default([]),
  fitScore: leadFields.fitScore.default(0),
});

// Patch fields intentionally have no defaults. A status-only update must never
// erase the independently verified website, contact, signal, or score evidence.
export const leadPatchSchema = z.object(leadFields).partial();
