import type { WebsiteSignal } from './types.js';

export type ProspectSource = 'openstreetmap' | 'licensed-import' | 'manual';
export type TargetStatus = 'candidate' | 'needs-review' | 'excluded-noncommercial';
export type VerificationStatus = 'source-verified' | 'website-queued' | 'website-verified' | 'no-website' | 'verification-error';
export type PermissionStatus = 'unknown' | 'opted-in' | 'approved-business-contact' | 'opted-out';
export type OutreachChannel = 'email' | 'whatsapp' | 'task';
export type OutreachStatus = 'draft' | 'pending-approval' | 'approved' | 'executing' | 'sent' | 'failed' | 'rejected' | 'blocked';

export interface MarketProspect {
  id: string;
  source: ProspectSource;
  sourceId: string;
  name: string;
  nameAr: string;
  category: string;
  subcategory: string;
  targetStatus: TargetStatus;
  location: string;
  address: string;
  latitude?: number;
  longitude?: number;
  website: string;
  emails: string[];
  phones: string[];
  socialLinks: string[];
  sourceUrl: string;
  sourceLicense: string;
  verificationStatus: VerificationStatus;
  fitScore: number;
  signals: WebsiteSignal[];
  permissionStatus: PermissionStatus;
  permissionEvidence: string;
  suppressed: boolean;
  suppressionReason: string;
  observedAt: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
  raw: Record<string, string>;
}

export interface ScanRun {
  id: string;
  source: ProspectSource;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'interrupted';
  scope: string;
  discovered: number;
  imported: number;
  eligible: number;
  withWebsite: number;
  withContact: number;
  verified: number;
  errors: number;
  message: string;
  startedAt: string;
  completedAt?: string;
}

export interface MarketSummary {
  total: number;
  candidates: number;
  withWebsite: number;
  withEmail: number;
  withPhone: number;
  websiteVerified: number;
  websiteQueued: number;
  verificationErrors: number;
  outreachReady: number;
  suppressed: number;
  internalTasksReleased: number;
  externalMessagesSent: number;
  categories: Array<{ label: string; count: number }>;
  locations: Array<{ label: string; count: number }>;
  latestScan?: ScanRun;
  actionCounts: Array<{ status: OutreachStatus; count: number }>;
}

export interface ProspectListResult {
  items: MarketProspect[];
  total: number;
  limit: number;
  offset: number;
}

export interface OutreachAction {
  id: string;
  prospectId: string;
  prospectName: string;
  channel: OutreachChannel;
  destination: string;
  subject: string;
  body: string;
  rationale: string;
  status: OutreachStatus;
  permissionSnapshot: PermissionStatus;
  createdBy: string;
  approvalNote: string;
  approvedBy: string;
  approvedAt?: string;
  executedAt?: string;
  providerId: string;
  error: string;
  templateName: string;
  templateLanguage: string;
  createdAt: string;
  updatedAt: string;
}
