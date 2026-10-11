export type DiscoverySource = 'google' | 'demo';

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

export type LeadStatus = 'new' | 'qualified' | 'contacted' | 'meeting' | 'proposal' | 'won' | 'not-now';

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
