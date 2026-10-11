import './env.js';
import { listMarketProspects, upsertMarketProspects } from './marketDb.js';
import { classifyOsmTags } from './osmScan.js';
import type { MarketProspect } from './marketTypes.js';

let offset = 0;
let updated = 0;
const changed: Record<string, number> = {};
while (true) {
  const page = listMarketProspects({ includeExcluded: true, limit: 250, offset });
  if (!page.items.length) break;
  const now = new Date().toISOString();
  const records: MarketProspect[] = page.items.map((prospect) => {
    const classification = classifyOsmTags(prospect.raw);
    if (classification.category !== prospect.category || classification.targetStatus !== prospect.targetStatus) {
      const key = `${prospect.category} -> ${classification.category}`;
      changed[key] = (changed[key] ?? 0) + 1;
    }
    return {
      ...prospect,
      category: classification.category,
      subcategory: classification.subcategory,
      targetStatus: classification.targetStatus,
      updatedAt: now,
    };
  });
  upsertMarketProspects(records);
  updated += records.length;
  offset += page.items.length;
  if (offset >= page.total) break;
}

console.log(JSON.stringify({ updated, changed }, null, 2));
