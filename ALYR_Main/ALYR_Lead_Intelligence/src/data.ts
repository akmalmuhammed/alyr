import type { LeadStatus, ViewKey } from './types';

export const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ key: ViewKey; label: string; note: string; icon: string }>;
}> = [
  {
    label: 'Decide',
    items: [
      { key: 'command', label: 'Command', note: 'Owner decision layer', icon: 'dashboard' },
      { key: 'pipeline', label: 'Pipeline', note: 'Relationship motion', icon: 'workflow' },
      { key: 'delivery', label: 'Delivery', note: 'Outcome portfolio', icon: 'strategy' },
    ],
  },
  {
    label: 'Grow',
    items: [
      { key: 'market', label: 'Prospects', note: 'Qatar opportunity universe', icon: 'data' },
      { key: 'intelligence', label: 'Intelligence', note: 'Category signals', icon: 'growth' },
      { key: 'hermes', label: 'Hermes', note: 'Governed agent action', icon: 'automation' },
    ],
  },
  {
    label: 'System',
    items: [
      { key: 'discover', label: 'Discover', note: 'Live market search', icon: 'search' },
      { key: 'campaigns', label: 'Source runs', note: 'Search history', icon: 'calendar' },
      { key: 'policy', label: 'Governance', note: 'Sources and controls', icon: 'security' },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

export const CATEGORIES = [
  'Travel & Tourism',
  'Domestic Services',
  'Business Services',
  'Hospitality',
  'Healthcare',
  'Education',
  'Real Estate',
  'Logistics',
  'Retail & Interiors',
  'Restaurants',
];

export const LOCATIONS = [
  'Doha',
  'Lusail',
  'Al Rayyan',
  'Al Wakrah',
  'Umm Salal',
  'The Pearl-Qatar',
  'All Qatar',
];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  qualified: 'Qualified',
  contacted: 'Contacted',
  meeting: 'Meeting',
  proposal: 'Proposal',
  won: 'Won',
  'not-now': 'Not now',
};

export const STATUS_ORDER: LeadStatus[] = ['new', 'qualified', 'contacted', 'meeting', 'proposal', 'won', 'not-now'];

export const VIEW_TITLES: Record<ViewKey, { eyebrow: string; title: string }> = {
  command: { eyebrow: 'Decision intelligence', title: 'Growth Command' },
  discover: { eyebrow: 'Market intelligence', title: 'Prospect Engine' },
  market: { eyebrow: 'Qatar opportunity universe', title: 'Prospect Intelligence' },
  pipeline: { eyebrow: 'Revenue motion', title: 'Relationship Pipeline' },
  intelligence: { eyebrow: 'Market patterns', title: 'Category Intelligence' },
  delivery: { eyebrow: 'Transformation outcomes', title: 'Delivery Portfolio' },
  hermes: { eyebrow: 'Governed agent operations', title: 'Hermes Action Queue' },
  campaigns: { eyebrow: 'Discovery control', title: 'Source Runs' },
  policy: { eyebrow: 'Governance', title: 'Data & Outreach Policy' },
};
