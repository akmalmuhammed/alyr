import './env.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getMarketSummary, listMarketProspects, marketDatabasePath } from './marketDb.js';
import type { MarketProspect } from './marketTypes.js';

const outputDirectory = path.resolve(process.env.ALYR_MARKET_EXPORT_DIR || './data/exports');
mkdirSync(outputDirectory, { recursive: true });

function allProspects(includeExcluded: boolean): MarketProspect[] {
  const items: MarketProspect[] = [];
  let offset = 0;
  while (true) {
    const page = listMarketProspects({ includeExcluded, limit: 250, offset });
    items.push(...page.items);
    offset += page.items.length;
    if (!page.items.length || offset >= page.total) break;
  }
  return items;
}

function escapeCsv(value: unknown): string {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const columns: Array<{ label: string; read: (prospect: MarketProspect) => unknown }> = [
  { label: 'id', read: (item) => item.id },
  { label: 'name', read: (item) => item.name },
  { label: 'name_ar', read: (item) => item.nameAr },
  { label: 'category', read: (item) => item.category },
  { label: 'subcategory', read: (item) => item.subcategory },
  { label: 'target_status', read: (item) => item.targetStatus },
  { label: 'location', read: (item) => item.location },
  { label: 'address', read: (item) => item.address },
  { label: 'website', read: (item) => item.website },
  { label: 'public_emails', read: (item) => item.emails },
  { label: 'public_phones', read: (item) => item.phones },
  { label: 'public_social_links', read: (item) => item.socialLinks },
  { label: 'verification_status', read: (item) => item.verificationStatus },
  { label: 'fit_score', read: (item) => item.fitScore },
  { label: 'permission_status', read: (item) => item.permissionStatus },
  { label: 'suppressed', read: (item) => item.suppressed },
  { label: 'source_url', read: (item) => item.sourceUrl },
  { label: 'source_license', read: (item) => item.sourceLicense },
  { label: 'observed_at', read: (item) => item.observedAt },
  { label: 'verified_at', read: (item) => item.verifiedAt ?? '' },
];

function writeCsv(filename: string, prospects: MarketProspect[]): string {
  const csv = [
    columns.map((column) => escapeCsv(column.label)).join(','),
    ...prospects.map((prospect) => columns.map((column) => escapeCsv(column.read(prospect))).join(',')),
  ].join('\r\n');
  const target = path.join(outputDirectory, filename);
  writeFileSync(target, `\uFEFF${csv}\r\n`, 'utf8');
  return target;
}

const all = allProspects(true);
const eligible = all.filter((item) => item.targetStatus !== 'excluded-noncommercial');
const allCsv = writeCsv('qatar-market-all.csv', all);
const prospectCsv = writeCsv('qatar-commercial-prospects.csv', eligible);
const summaryPath = path.join(outputDirectory, 'qatar-market-summary.json');
writeFileSync(summaryPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  database: marketDatabasePath(),
  source: 'OpenStreetMap contributors',
  license: 'ODbL 1.0 — https://www.openstreetmap.org/copyright',
  scope: 'Named commercial and service POIs across Qatar. Coverage is broad but not exhaustive or an official registry.',
  verification: 'Source-listed eligible websites were independently checked with guarded HTTP/robots controls. Contact availability is not outreach permission.',
  summary: getMarketSummary(),
  files: { allCsv, prospectCsv },
}, null, 2), 'utf8');

console.log(JSON.stringify({ all: all.length, eligible: eligible.length, allCsv, prospectCsv, summaryPath }, null, 2));
