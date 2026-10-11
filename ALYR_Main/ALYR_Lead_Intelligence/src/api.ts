import type {
  AppConfig,
  ClientAccount,
  CommandDashboard,
  DeliveryProject,
  LeadRecord,
  LeadStatus,
  MarketProspect,
  MarketSummary,
  OutreachAction,
  OutreachChannel,
  OutreachStatus,
  OperationalEvent,
  PermissionStatus,
  PlaceDetails,
  ProspectListResult,
  ProspectContact,
  ScanRun,
  SearchResponse,
  VerificationStatus,
  WebsiteEnrichment,
} from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(payload.error || `Request failed with HTTP ${response.status}.`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  config: () => request<AppConfig>('/api/config'),
  search: (input: { query: string; category: string; location: string; pageToken?: string }) =>
    request<SearchResponse>('/api/discovery/search', { method: 'POST', body: JSON.stringify(input) }),
  batchSearch: (input: { query: string; categories: string[]; locations: string[] }) =>
    request<SearchResponse>('/api/discovery/batch', { method: 'POST', body: JSON.stringify(input) }),
  placeDetails: (placeId: string) =>
    request<PlaceDetails>('/api/places/details', { method: 'POST', body: JSON.stringify({ placeId }) }),
  enrichWebsite: (url: string) =>
    request<WebsiteEnrichment>('/api/enrichment/website', { method: 'POST', body: JSON.stringify({ url }) }),
  listLeads: async () => (await request<{ leads: LeadRecord[] }>('/api/leads')).leads,
  createLead: (lead: Omit<LeadRecord, 'id' | 'createdAt' | 'updatedAt'>) =>
    request<LeadRecord>('/api/leads', { method: 'POST', body: JSON.stringify(lead) }),
  updateLead: (id: string, patch: Partial<Pick<LeadRecord, 'status' | 'owner' | 'notes'>>) =>
    request<LeadRecord>(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  setStatus: (id: string, status: LeadStatus) =>
    request<LeadRecord>(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteLead: (id: string) => request<void>(`/api/leads/${id}`, { method: 'DELETE' }),
  marketSummary: () => request<MarketSummary>('/api/market/summary'),
  listMarketProspects: (input: {
    search?: string;
    category?: string;
    location?: string;
    verification?: VerificationStatus;
    minScore?: number;
    withContact?: boolean;
    limit?: number;
    offset?: number;
  } = {}) => {
    const query = new URLSearchParams();
    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined && value !== '') query.set(key, String(value));
    });
    return request<ProspectListResult>(`/api/market/prospects?${query.toString()}`);
  },
  getMarketProspect: (id: string) => request<MarketProspect>(`/api/market/prospects/${encodeURIComponent(id)}`),
  runQatarScan: () => request<ScanRun>('/api/market/scan', { method: 'POST', body: '{}' }),
  verifyMarketProspect: (id: string) => request<MarketProspect>(`/api/market/prospects/${encodeURIComponent(id)}/verify`, { method: 'POST', body: '{}' }),
  verifyMarketBatch: (limit = 20) => request<{ attempted: number; verified: number; failed: number; remaining: number }>(
    '/api/market/verify-batch',
    { method: 'POST', body: JSON.stringify({ limit, delayMs: 750 }) },
  ),
  setMarketPermission: (id: string, status: PermissionStatus, evidence: string) => request<MarketProspect>(
    `/api/market/prospects/${encodeURIComponent(id)}/permission`,
    { method: 'PATCH', body: JSON.stringify({ status, evidence }) },
  ),
  suppressMarketProspect: (id: string, reason: string) => request<MarketProspect>(
    `/api/market/prospects/${encodeURIComponent(id)}/suppress`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  ),
  listOutreachActions: (status?: OutreachStatus) => request<{ items: OutreachAction[]; total: number }>(
    `/api/outreach/actions${status ? `?status=${encodeURIComponent(status)}` : ''}`,
  ),
  createOutreachDraft: (input: {
    prospectId: string;
    channel: OutreachChannel;
    destination?: string;
    subject?: string;
    body?: string;
    templateName?: string;
    templateLanguage?: string;
  }) => request<OutreachAction>('/api/outreach/drafts', { method: 'POST', body: JSON.stringify(input) }),
  approveOutreachAction: (id: string, actor: string, note: string) => request<OutreachAction>(
    `/api/outreach/actions/${encodeURIComponent(id)}/approve`,
    { method: 'POST', body: JSON.stringify({ actor, note }) },
  ),
  rejectOutreachAction: (id: string, actor: string, note: string) => request<OutreachAction>(
    `/api/outreach/actions/${encodeURIComponent(id)}/reject`,
    { method: 'POST', body: JSON.stringify({ actor, note }) },
  ),
  executeOutreachAction: (id: string, actor: string) => request<OutreachAction>(
    `/api/outreach/actions/${encodeURIComponent(id)}/execute`,
    { method: 'POST', body: JSON.stringify({ actor, note: '' }) },
  ),
  commandDashboard: () => request<CommandDashboard>('/api/dashboard/command'),
  listOperationalEvents: (limit = 30) => request<{ items: OperationalEvent[] }>(`/api/operations/events?limit=${limit}`),
  recordOperationalEvent: (event: Omit<OperationalEvent, 'id' | 'createdAt' | 'dedupeKey'> & { dedupeKey?: string }) =>
    request<OperationalEvent>('/api/operations/events', { method: 'POST', body: JSON.stringify(event) }),
  listClientAccounts: () => request<{ items: ClientAccount[] }>('/api/operations/accounts'),
  upsertClientAccount: (account: Omit<ClientAccount, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) =>
    request<ClientAccount>('/api/operations/accounts', { method: 'POST', body: JSON.stringify(account) }),
  listDeliveryProjects: () => request<{ items: DeliveryProject[] }>('/api/operations/projects'),
  upsertDeliveryProject: (project: Omit<DeliveryProject, 'id' | 'accountName' | 'createdAt' | 'updatedAt'> & { id?: string }) =>
    request<DeliveryProject>('/api/operations/projects', { method: 'POST', body: JSON.stringify(project) }),
  listProspectContacts: (prospectId?: string) => request<{ items: ProspectContact[] }>(
    `/api/operations/contacts${prospectId ? `?prospectId=${encodeURIComponent(prospectId)}` : ''}`,
  ),
  upsertProspectContact: (contact: Omit<ProspectContact, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) =>
    request<ProspectContact>('/api/operations/contacts', { method: 'POST', body: JSON.stringify(contact) }),
};
