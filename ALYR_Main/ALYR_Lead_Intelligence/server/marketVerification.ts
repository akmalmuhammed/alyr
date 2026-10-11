import { enrichWebsite } from './enrichment.js';
import {
  getMarketProspect,
  listMarketProspects,
  markProspectVerification,
  refreshLatestScanVerificationStats,
  reuseVerifiedWebsiteEvidence,
  updateProspectFromEnrichment,
} from './marketDb.js';
import type { MarketProspect } from './marketTypes.js';

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function verifyMarketProspect(id: string): Promise<MarketProspect> {
  const prospect = getMarketProspect(id);
  if (!prospect) throw new Error('Prospect not found.');
  if (!prospect.website) {
    const unchanged = markProspectVerification(id, 'no-website');
    if (!unchanged) throw new Error('Prospect disappeared during verification.');
    return unchanged;
  }
  const reused = reuseVerifiedWebsiteEvidence(id, prospect.website);
  if (reused) return reused;
  markProspectVerification(id, 'website-queued');
  try {
    const enrichment = await enrichWebsite(prospect.website);
    const updated = updateProspectFromEnrichment(id, enrichment);
    if (!updated) throw new Error('Prospect disappeared during verification.');
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Website verification failed.';
    markProspectVerification(id, 'verification-error', message);
    throw new Error(message);
  }
}

function websiteHostname(website: string): string {
  try {
    return new URL(website).hostname.toLowerCase();
  } catch {
    return website.toLowerCase();
  }
}

export async function verifyMarketBatch(input: { limit?: number; delayMs?: number; concurrency?: number } = {}): Promise<{
  attempted: number;
  verified: number;
  failed: number;
  remaining: number;
  results: Array<{ id: string; name: string; status: 'verified' | 'failed'; error?: string }>;
}> {
  const limit = Math.min(250, Math.max(1, input.limit ?? 20));
  const delayMs = Math.min(5_000, Math.max(250, input.delayMs ?? 750));
  const concurrency = Math.min(4, Math.max(1, input.concurrency ?? 3));
  const queue = listMarketProspects({ verification: 'website-queued', includeExcluded: false, limit, offset: 0 }).items;
  const results: Array<{ id: string; name: string; status: 'verified' | 'failed'; error?: string }> = [];
  const domainGroups = new Map<string, MarketProspect[]>();
  for (const prospect of queue) {
    const hostname = websiteHostname(prospect.website);
    domainGroups.set(hostname, [...(domainGroups.get(hostname) ?? []), prospect]);
  }
  const groups = [...domainGroups.values()];
  let nextGroup = 0;
  async function worker(): Promise<void> {
    while (nextGroup < groups.length) {
      const group = groups[nextGroup];
      nextGroup += 1;
      for (const prospect of group) {
        const startedAt = Date.now();
        try {
          await verifyMarketProspect(prospect.id);
          results.push({ id: prospect.id, name: prospect.name, status: 'verified' });
        } catch (error) {
          results.push({ id: prospect.id, name: prospect.name, status: 'failed', error: error instanceof Error ? error.message : 'Verification failed.' });
        }
        // Cached/shared evidence is a local database operation. Rate-limit only network work.
        if (Date.now() - startedAt > 150) await wait(delayMs);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, groups.length) }, () => worker()));
  const remaining = listMarketProspects({ verification: 'website-queued', includeExcluded: false, limit: 1, offset: 0 }).total;
  refreshLatestScanVerificationStats();
  return {
    attempted: queue.length,
    verified: results.filter((item) => item.status === 'verified').length,
    failed: results.filter((item) => item.status === 'failed').length,
    remaining,
    results,
  };
}
