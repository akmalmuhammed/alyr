export type ViewKey = 'command' | 'discover' | 'market' | 'pipeline' | 'intelligence' | 'delivery' | 'hermes' | 'campaigns' | 'policy';
export type DiscoverySource = 'google' | 'demo';
export type LeadStatus = 'new' | 'qualified' | 'contacted' | 'meeting' | 'proposal' | 'won' | 'not-now';

export interface AppConfig {
  discoveryMode: DiscoverySource;
  googleConfigured: boolean;
  batchQueryLimit: number;
  persistencePolicy: string;
  policies: {
    googlePlaces: string;
    googleTerms: string;
    googlePrivacy: string;
    openStreetMap: string;
    qatarDirectMarketing: string;
    whatsappBusiness: string;
  };
  qatarScan: {
    enabled: boolean;
    source: string;
    database: string;
  };
  hermes: {
    mcpReady: boolean;
    humanApprovalRequired: boolean;
    externalOutreach: {
      mode: 'disabled' | 'live';
      smtpConfigured: boolean;
      whatsappConfigured: boolean;
    };
  };
}

export interface PlaceSummary {
  placeId: string;
  name: string;
  address: string;
  primaryType: string;
  typeLabel: string;
  types: string[];
  businessStatus: string;
  googleMapsUri?: string;
  source: DiscoverySource;
}

export interface PlaceDetails extends PlaceSummary {
  phone?: string;
  internationalPhone?: string;
  website?: string;
  rating?: number;
  userRatingCount?: number;
  openingHours?: string[];
}

export interface WebsiteSignal {
  key: string;
  label: string;
  state: 'opportunity' | 'strength' | 'unknown';
  evidence: string;
  weight: number;
}

export interface WebsiteEnrichment {
  businessName: string;
  sourceUrl: string;
  crawledUrls: string[];
  emails: string[];
  phones: string[];
  socialLinks: string[];
  whatsappLinks: string[];
  contactPage?: string;
  languages: string[];
  technologies: string[];
  signals: WebsiteSignal[];
  fitScore: number;
  observedAt: string;
  robotsAllowed: boolean;
  isDemo?: boolean;
}

export interface LeadRecord {
  id: string;
  placeId?: string;
  verifiedName: string;
  website: string;
  category: string;
  location: string;
  emails: string[];
  phones: string[];
  socialLinks: string[];
  sourceUrl: string;
  sourceType: 'website' | 'manual' | 'licensed-import';
  status: LeadStatus;
  owner: string;
  notes: string;
  signals: WebsiteSignal[];
  fitScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResponse {
  results: PlaceSummary[];
  source: DiscoverySource;
  queryCount: number;
  uniqueCount?: number;
  nextPageToken?: string;
}

export interface CampaignRecord {
  id: string;
  mode: 'single' | 'batch';
  query: string;
  categories: string[];
  locations: string[];
  queryCount: number;
  resultCount: number;
  source: DiscoverySource;
  createdAt: string;
}

export type VerificationStatus = 'source-verified' | 'website-queued' | 'website-verified' | 'no-website' | 'verification-error';
export type PermissionStatus = 'unknown' | 'opted-in' | 'approved-business-contact' | 'opted-out';
export type OutreachChannel = 'email' | 'whatsapp' | 'task';
export type OutreachStatus = 'draft' | 'pending-approval' | 'approved' | 'executing' | 'sent' | 'failed' | 'rejected' | 'blocked';

export interface MarketProspect {
  id: string;
  source: 'openstreetmap' | 'licensed-import' | 'manual';
  sourceId: string;
  name: string;
  nameAr: string;
  category: string;
  subcategory: string;
  targetStatus: 'candidate' | 'needs-review' | 'excluded-noncommercial';
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
  source: 'openstreetmap' | 'licensed-import' | 'manual';
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

export type HealthState = 'strong' | 'on-track' | 'attention' | 'at-risk';
export type ProjectPhase = 'discovery' | 'strategy' | 'design' | 'build' | 'activate' | 'optimize' | 'complete';

export interface ClientAccount {
  id: string;
  sourceProspectId: string;
  name: string;
  category: string;
  owner: string;
  status: 'onboarding' | 'active' | 'paused' | 'completed' | 'at-risk' | 'archived';
  health: HealthState;
  engagementModel: string;
  valueQar?: number;
  onboardedAt?: string;
  nextAction: string;
  nextActionDueAt?: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryProject {
  id: string;
  accountId: string;
  accountName: string;
  name: string;
  phase: ProjectPhase;
  progress: number;
  health: HealthState;
  owner: string;
  nextMilestone: string;
  dueAt?: string;
  summary: string;
  workstreams: Array<{ name: string; state: 'not-started' | 'in-progress' | 'blocked' | 'complete'; progress: number }>;
  blockers: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProspectContact {
  id: string;
  prospectId: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  sourceUrl: string;
  confidence: number;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperationalEvent {
  id: string;
  type: string;
  source: string;
  entityType: string;
  entityId: string;
  category: string;
  accountName: string;
  summary: string;
  valueQar?: number;
  payload: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
  dedupeKey: string;
}

export interface CategoryInsight {
  category: string;
  marketCount: number;
  websites: number;
  verified: number;
  contactable: number;
  averageFit: number;
  pipeline: number;
  actioned: number;
  replies: number;
  meetings: number;
  proposals: number;
  clients: number;
  potentialScore: number;
  tractionScore: number;
  recommendedOffer: string;
  nextMove: string;
}

export interface PriorityProspect {
  id: string;
  name: string;
  category: string;
  location: string;
  website: string;
  email: string;
  phone: string;
  fitScore: number;
  priorityScore: number;
  verificationStatus: string;
  permissionStatus: string;
  readiness: 'research' | 'evidence-ready' | 'contact-found' | 'permissioned' | 'action-queued';
  contactName: string;
  contactRole: string;
  contactConfidence: number;
  latestOutreachStatus: string;
  opportunitySignals: WebsiteSignal[];
  recommendedOffer: string;
  openingAngle: string;
  nextMove: string;
}

export interface CommandDashboard {
  generatedAt: string;
  kpis: {
    marketCandidates: number;
    verifiedProspects: number;
    contactableProspects: number;
    activePipeline: number;
    onboardedClients: number;
    activeProjects: number;
    pendingApprovals: number;
  };
  funnel: Array<{ key: string; label: string; count: number; detail: string }>;
  categories: CategoryInsight[];
  priorityProspects: PriorityProspect[];
  accounts: ClientAccount[];
  projects: DeliveryProject[];
  signals: Array<{
    id: string;
    priority: 'now' | 'next' | 'watch';
    title: string;
    detail: string;
    actionLabel: string;
    targetView: 'market' | 'pipeline' | 'intelligence' | 'hermes' | 'delivery' | 'sources';
  }>;
  sources: Array<{
    id: string;
    name: string;
    status: 'connected' | 'healthy' | 'attention' | 'idle' | 'offline';
    records: number;
    lastSync?: string;
    note: string;
  }>;
  recentEvents: OperationalEvent[];
  pipelineLeads: LeadRecord[];
}
