import type { LeadRecord, WebsiteSignal } from './types.js';

export type OperationalEventSource =
  | 'hermes'
  | 'google-maps'
  | 'openstreetmap'
  | 'website-verifier'
  | 'manual'
  | 'crm'
  | 'import'
  | 'system';

export type OperationalEntityType = 'prospect' | 'contact' | 'account' | 'project' | 'agent' | 'source';

export type OperationalEventType =
  | 'prospect.qualified'
  | 'contact.identified'
  | 'outreach.sent'
  | 'outreach.replied'
  | 'meeting.booked'
  | 'proposal.sent'
  | 'account.won'
  | 'account.lost'
  | 'account.updated'
  | 'project.started'
  | 'project.updated'
  | 'project.risk'
  | 'project.completed'
  | 'agent.recommendation'
  | 'source.synced';

export interface OperationalEvent {
  id: string;
  type: OperationalEventType;
  source: OperationalEventSource;
  entityType: OperationalEntityType;
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

export interface OperationalEventInput extends Omit<OperationalEvent, 'id' | 'createdAt' | 'dedupeKey'> {
  id?: string;
  dedupeKey?: string;
}

export type AccountStatus = 'onboarding' | 'active' | 'paused' | 'completed' | 'at-risk' | 'archived';
export type HealthState = 'strong' | 'on-track' | 'attention' | 'at-risk';

export interface ClientAccount {
  id: string;
  sourceProspectId: string;
  name: string;
  category: string;
  owner: string;
  status: AccountStatus;
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

export interface ClientAccountInput extends Omit<ClientAccount, 'id' | 'createdAt' | 'updatedAt'> {
  id?: string;
}

export type ProjectPhase = 'discovery' | 'strategy' | 'design' | 'build' | 'activate' | 'optimize' | 'complete';

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

export interface DeliveryProjectInput extends Omit<DeliveryProject, 'id' | 'accountName' | 'createdAt' | 'updatedAt'> {
  id?: string;
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

export interface ProspectContactInput extends Omit<ProspectContact, 'id' | 'createdAt' | 'updatedAt'> {
  id?: string;
}

export interface CommandKpis {
  marketCandidates: number;
  verifiedProspects: number;
  contactableProspects: number;
  activePipeline: number;
  onboardedClients: number;
  activeProjects: number;
  pendingApprovals: number;
}

export interface FunnelStage {
  key: 'market' | 'verified' | 'pipeline' | 'contacted' | 'meeting' | 'proposal' | 'client';
  label: string;
  count: number;
  detail: string;
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

export type ProspectReadiness = 'research' | 'evidence-ready' | 'contact-found' | 'permissioned' | 'action-queued';

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
  readiness: ProspectReadiness;
  contactName: string;
  contactRole: string;
  contactConfidence: number;
  latestOutreachStatus: string;
  opportunitySignals: WebsiteSignal[];
  recommendedOffer: string;
  openingAngle: string;
  nextMove: string;
}

export interface DecisionSignal {
  id: string;
  priority: 'now' | 'next' | 'watch';
  title: string;
  detail: string;
  actionLabel: string;
  targetView: 'market' | 'pipeline' | 'intelligence' | 'hermes' | 'delivery' | 'sources';
}

export interface SourcePulse {
  id: string;
  name: string;
  status: 'connected' | 'healthy' | 'attention' | 'idle' | 'offline';
  records: number;
  lastSync?: string;
  note: string;
}

export interface CommandDashboard {
  generatedAt: string;
  kpis: CommandKpis;
  funnel: FunnelStage[];
  categories: CategoryInsight[];
  priorityProspects: PriorityProspect[];
  accounts: ClientAccount[];
  projects: DeliveryProject[];
  signals: DecisionSignal[];
  sources: SourcePulse[];
  recentEvents: OperationalEvent[];
  pipelineLeads: LeadRecord[];
}

export interface CommandRuntime {
  googleConfigured: boolean;
  hermesReady: boolean;
}
