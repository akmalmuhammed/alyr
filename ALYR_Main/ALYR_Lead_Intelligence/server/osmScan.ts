import { completeScanRun, createScanRun, upsertMarketProspects } from './marketDb.js';
import type { MarketProspect, ScanRun, TargetStatus } from './marketTypes.js';
import type { WebsiteSignal } from './types.js';

const DEFAULT_OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const MAX_RESPONSE_BYTES = 100 * 1024 * 1024;

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

interface OsmResponse {
  elements?: OsmElement[];
}

export interface CategoryResult {
  category: string;
  subcategory: string;
  targetStatus: TargetStatus;
}

const NONCOMMERCIAL_AMENITIES = new Set([
  'bench', 'bicycle_parking', 'clock', 'drinking_water', 'fountain', 'grave_yard',
  'parking', 'parking_entrance', 'post_box', 'prison', 'recycling', 'shelter',
  'telephone', 'toilets', 'waste_basket', 'waste_disposal',
]);

const CIVIC_AMENITIES = new Set([
  'courthouse', 'embassy', 'fire_station', 'place_of_worship', 'police', 'ranger_station',
  'social_centre', 'townhall',
]);

export function classifyOsmTags(tags: Record<string, string>): CategoryResult {
  const amenity = tags.amenity?.toLowerCase();
  const shop = tags.shop?.toLowerCase();
  const office = tags.office?.toLowerCase();
  const tourism = tags.tourism?.toLowerCase();
  const leisure = tags.leisure?.toLowerCase();

  if (shop) {
    if (/travel_agency|travel_agent|ticket/.test(shop)) return { category: 'Travel & Tourism', subcategory: shop, targetStatus: 'candidate' };
    if (/laundry|dry_cleaning/.test(shop)) return { category: 'Domestic & Care Services', subcategory: shop, targetStatus: 'candidate' };
    if (/beauty|hairdresser|cosmetics|massage|perfumery/.test(shop)) return { category: 'Beauty & Wellness', subcategory: shop, targetStatus: 'candidate' };
    if (/car|tyres|motorcycle|vehicle|fuel/.test(shop)) return { category: 'Automotive & Mobility', subcategory: shop, targetStatus: 'candidate' };
    if (/furniture|interior|kitchen|bathroom|carpet|lighting|hardware|doityourself/.test(shop)) return { category: 'Home & Interiors', subcategory: shop, targetStatus: 'candidate' };
    if (/supermarket|convenience|bakery|butcher|greengrocer|seafood|deli|beverages/.test(shop)) return { category: 'Food Retail', subcategory: shop, targetStatus: 'candidate' };
    if (/computer|mobile_phone|electronics|appliance/.test(shop)) return { category: 'Technology Retail', subcategory: shop, targetStatus: 'candidate' };
    return { category: 'Retail & E-commerce', subcategory: shop, targetStatus: 'candidate' };
  }

  if (office) {
    if (/travel_agent|tourism/.test(office)) return { category: 'Travel & Tourism', subcategory: office, targetStatus: 'candidate' };
    if (/visa|immigration|notary|translator|administrative/.test(office)) return { category: 'Document & Government Services', subcategory: office, targetStatus: 'candidate' };
    if (/employment_agency|recruitment|human_resources/.test(office)) return { category: 'Employment & Recruitment', subcategory: office, targetStatus: 'candidate' };
    if (/estate_agent|property/.test(office)) return { category: 'Real Estate', subcategory: office, targetStatus: 'candidate' };
    if (/logistics|transport|courier|freight/.test(office)) return { category: 'Logistics & Transport', subcategory: office, targetStatus: 'candidate' };
    if (/government|diplomatic/.test(office)) return { category: 'Government & Civic', subcategory: office, targetStatus: 'excluded-noncommercial' };
    if (/association|ngo|charity|foundation/.test(office)) return { category: 'Associations & Nonprofits', subcategory: office, targetStatus: 'needs-review' };
    return { category: 'Professional & Business Services', subcategory: office, targetStatus: 'candidate' };
  }

  if (amenity) {
    if (NONCOMMERCIAL_AMENITIES.has(amenity)) return { category: 'Infrastructure', subcategory: amenity, targetStatus: 'excluded-noncommercial' };
    if (CIVIC_AMENITIES.has(amenity)) return { category: 'Government & Community', subcategory: amenity, targetStatus: 'excluded-noncommercial' };
    if (/restaurant|cafe|fast_food|food_court|ice_cream|bar/.test(amenity)) return { category: 'Food & Beverage', subcategory: amenity, targetStatus: 'candidate' };
    if (/clinic|hospital|doctors|dentist|pharmacy|veterinary/.test(amenity)) return { category: 'Healthcare', subcategory: amenity, targetStatus: 'candidate' };
    if (/school|college|university|kindergarten|language_school|music_school|driving_school|training/.test(amenity)) return { category: 'Education & Training', subcategory: amenity, targetStatus: 'candidate' };
    if (/bank|bureau_de_change|money_transfer/.test(amenity)) return { category: 'Financial Services', subcategory: amenity, targetStatus: 'candidate' };
    if (/car_rental|car_wash|vehicle_inspection|taxi/.test(amenity)) return { category: 'Automotive & Mobility', subcategory: amenity, targetStatus: 'candidate' };
    if (/childcare|social_facility|nursing_home/.test(amenity)) return { category: 'Domestic & Care Services', subcategory: amenity, targetStatus: 'candidate' };
    if (/cinema|theatre|events_venue|conference_centre|exhibition_centre/.test(amenity)) return { category: 'Events & Entertainment', subcategory: amenity, targetStatus: 'candidate' };
    return { category: 'Local Services', subcategory: amenity, targetStatus: 'needs-review' };
  }

  if (tourism) {
    if (/hotel|guest_house|hostel|apartment|motel|resort|chalet/.test(tourism)) return { category: 'Hospitality', subcategory: tourism, targetStatus: 'candidate' };
    if (/museum|gallery|attraction|theme_park|information/.test(tourism)) return { category: 'Tourism & Culture', subcategory: tourism, targetStatus: 'needs-review' };
    return { category: 'Travel & Tourism', subcategory: tourism, targetStatus: 'needs-review' };
  }

  if (tags.healthcare) return { category: 'Healthcare', subcategory: tags.healthcare, targetStatus: 'candidate' };
  if (tags.craft) return { category: 'Trades & Specialist Services', subcategory: tags.craft, targetStatus: 'candidate' };
  if (tags.industrial || tags.man_made === 'works') return { category: 'Manufacturing & Industrial', subcategory: tags.industrial || tags.man_made, targetStatus: 'candidate' };
  if (leisure) {
    if (/fitness_centre|sports_centre|sports_hall|dance|bowling_alley|water_park/.test(leisure)) return { category: 'Fitness & Leisure', subcategory: leisure, targetStatus: 'candidate' };
    if (/park|playground|nature_reserve|garden/.test(leisure)) return { category: 'Public Leisure', subcategory: leisure, targetStatus: 'excluded-noncommercial' };
    return { category: 'Fitness & Leisure', subcategory: leisure, targetStatus: 'needs-review' };
  }
  if (/commercial|retail|office|hotel/.test(tags.building ?? '')) return { category: 'Commercial Property', subcategory: tags.building, targetStatus: 'needs-review' };
  return { category: 'Unclassified', subcategory: 'unknown', targetStatus: 'needs-review' };
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function splitValues(value?: string): string[] {
  return value ? unique(value.split(/[;,|]/g)) : [];
}

function normalizeWebsite(value?: string): string {
  if (!value) return '';
  try {
    const candidate = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function normalizeEmails(tags: Record<string, string>): string[] {
  return unique([
    ...splitValues(tags.email),
    ...splitValues(tags['contact:email']),
  ]).map((value) => value.toLowerCase()).filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function normalizePhones(tags: Record<string, string>): string[] {
  return unique([
    ...splitValues(tags.phone),
    ...splitValues(tags['contact:phone']),
    ...splitValues(tags.mobile),
    ...splitValues(tags['contact:mobile']),
  ]).filter((value) => value.replace(/\D/g, '').length >= 7);
}

function normalizeSocials(tags: Record<string, string>): string[] {
  return unique([
    tags.facebook, tags['contact:facebook'], tags.instagram, tags['contact:instagram'],
    tags.linkedin, tags['contact:linkedin'], tags.twitter, tags['contact:twitter'],
    tags.youtube, tags['contact:youtube'], tags.whatsapp, tags['contact:whatsapp'],
  ]);
}

const LOCATION_NAMES: Record<string, string> = {
  'الدوحة': 'Doha', doha: 'Doha',
  'الريان': 'Al Rayyan', rayyan: 'Al Rayyan', 'al rayyan': 'Al Rayyan',
  'لوسيل': 'Lusail', lusail: 'Lusail',
  'الوكرة': 'Al Wakrah', wakrah: 'Al Wakrah', 'al wakrah': 'Al Wakrah',
  'أم صلال': 'Umm Salal', 'umm salal': 'Umm Salal',
  'الخور': 'Al Khor', 'al khor': 'Al Khor',
  'الشمال': 'Al Shamal', 'al shamal': 'Al Shamal',
  'الضعاين': 'Al Daayen', daayen: 'Al Daayen', 'al daayen': 'Al Daayen',
};

function resolveLocation(tags: Record<string, string>): string {
  const values = unique([tags['addr:city'], tags['addr:district'], tags['addr:suburb'], tags['addr:place'], tags['is_in:city']]);
  if (!values.length) return 'Qatar';
  const value = values[0];
  return LOCATION_NAMES[value.toLowerCase()] ?? LOCATION_NAMES[value] ?? value;
}

function resolveAddress(tags: Record<string, string>, location: string): string {
  return unique([
    tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'], tags['addr:district'],
    tags['addr:city'], tags['addr:postcode'], location === 'Qatar' ? undefined : location,
  ]).join(', ');
}

function initialSignals(input: {
  website: string;
  emails: string[];
  phones: string[];
  socials: string[];
  category: string;
  targetStatus: TargetStatus;
}): { fitScore: number; signals: WebsiteSignal[] } {
  const signals: WebsiteSignal[] = [];
  let fitScore = input.targetStatus === 'candidate' ? 45 : input.targetStatus === 'needs-review' ? 28 : 5;
  if (input.website) {
    signals.push({ key: 'source-website', label: 'Website listed in open source', state: 'strength', evidence: 'A website URL is present in the OpenStreetMap record and still requires website verification.', weight: 3 });
    fitScore += 4;
  } else {
    signals.push({ key: 'source-no-website', label: 'Website not present in source record', state: 'unknown', evidence: 'The open-data record has no website URL; this is a research signal, not proof that no website exists.', weight: 14 });
    fitScore += 18;
  }
  if (input.phones.length && !input.website) {
    signals.push({ key: 'source-phone-led', label: 'Phone-led public contact', state: 'opportunity', evidence: 'A public phone is listed while no website URL is present in the source record.', weight: 10 });
    fitScore += 10;
  }
  if (input.socials.length && !input.website) {
    signals.push({ key: 'source-social-led', label: 'Social-led public presence', state: 'opportunity', evidence: 'A social profile is listed while no website URL is present in the source record.', weight: 8 });
    fitScore += 8;
  }
  if (input.emails.length || input.phones.length) fitScore += 8;
  if (/Travel|Hospitality|Retail|Food|Beauty|Domestic|Professional|Real Estate|Automotive|Logistics/.test(input.category)) fitScore += 8;
  return { fitScore: Math.min(95, fitScore), signals };
}

export function osmElementToProspect(element: OsmElement, observedAt = new Date().toISOString()): MarketProspect | undefined {
  const tags = element.tags ?? {};
  const name = tags['name:en']?.trim() || tags.name?.trim() || tags.brand?.trim() || tags.operator?.trim();
  if (!name) return undefined;
  const category = classifyOsmTags(tags);
  const website = normalizeWebsite(tags.website || tags['contact:website'] || tags.url || tags['contact:url']);
  const emails = normalizeEmails(tags);
  const phones = normalizePhones(tags);
  const socialLinks = normalizeSocials(tags);
  const location = resolveLocation(tags);
  const intelligence = initialSignals({ website, emails, phones, socials: socialLinks, category: category.category, targetStatus: category.targetStatus });
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  const sourceId = `${element.type}/${element.id}`;
  return {
    id: `osm:${element.type}:${element.id}`,
    source: 'openstreetmap',
    sourceId,
    name,
    nameAr: tags['name:ar']?.trim() || '',
    category: category.category,
    subcategory: category.subcategory,
    targetStatus: category.targetStatus,
    location,
    address: resolveAddress(tags, location),
    latitude,
    longitude,
    website,
    emails,
    phones,
    socialLinks,
    sourceUrl: `https://www.openstreetmap.org/${sourceId}`,
    sourceLicense: 'OpenStreetMap contributors · ODbL 1.0',
    verificationStatus: website ? 'website-queued' : 'no-website',
    fitScore: intelligence.fitScore,
    signals: intelligence.signals,
    permissionStatus: 'unknown',
    permissionEvidence: '',
    suppressed: false,
    suppressionReason: '',
    observedAt,
    createdAt: observedAt,
    updatedAt: observedAt,
    raw: tags,
  };
}

export function qatarOverpassQuery(): string {
  return `[out:json][timeout:240];
area["ISO3166-1"="QA"]["boundary"="administrative"]->.qa;
(
  nwr["name"]["shop"](area.qa);
  nwr["name"]["office"](area.qa);
  nwr["name"]["amenity"](area.qa);
  nwr["name"]["tourism"](area.qa);
  nwr["name"]["craft"](area.qa);
  nwr["name"]["healthcare"](area.qa);
  nwr["name"]["leisure"](area.qa);
  nwr["name"]["industrial"](area.qa);
  nwr["name"]["man_made"="works"](area.qa);
  nwr["name"]["building"~"commercial|retail|office|hotel"](area.qa);
);
out center tags;`;
}

async function fetchQatarOsmElements(): Promise<OsmElement[]> {
  const endpoint = process.env.OVERPASS_API_URL?.trim() || DEFAULT_OVERPASS_ENDPOINT;
  const body = new URLSearchParams({ data: qatarOverpassQuery() }).toString();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': process.env.OSM_USER_AGENT?.trim() || 'ALYR-Prospect-Engine/0.2 (responsible Qatar market research)',
      Accept: 'application/json',
    },
    body,
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`OpenStreetMap Overpass returned HTTP ${response.status}.`);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_RESPONSE_BYTES) throw new Error('The Qatar open-data response exceeded the configured safe size.');
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('The Qatar open-data response exceeded the configured safe size.');
  const payload = JSON.parse(text) as OsmResponse;
  return payload.elements ?? [];
}

let activeScan: Promise<ScanRun> | undefined;

export function runQatarOpenDataScan(): Promise<ScanRun> {
  if (activeScan) return activeScan;
  activeScan = (async () => {
    const run = createScanRun('openstreetmap', 'Named commercial and service POIs across the State of Qatar');
    try {
      const elements = await fetchQatarOsmElements();
      const observedAt = new Date().toISOString();
      const prospects = elements.map((element) => osmElementToProspect(element, observedAt)).filter((item): item is MarketProspect => Boolean(item));
      const deduplicated = [...new Map(prospects.map((item) => [item.id, item])).values()];
      const stats = upsertMarketProspects(deduplicated);
      return completeScanRun(run.id, {
        status: 'completed',
        discovered: elements.length,
        imported: stats.imported,
        eligible: stats.eligible,
        withWebsite: stats.withWebsite,
        withContact: stats.withContact,
        message: 'Qatar open-data scan completed. Website checks remain resumable and separately rate-limited.',
        completedAt: new Date().toISOString(),
      })!;
    } catch (error) {
      completeScanRun(run.id, {
        status: 'failed',
        errors: 1,
        message: error instanceof Error ? error.message : 'Qatar scan failed.',
        completedAt: new Date().toISOString(),
      });
      throw error;
    } finally {
      activeScan = undefined;
    }
  })();
  return activeScan;
}
