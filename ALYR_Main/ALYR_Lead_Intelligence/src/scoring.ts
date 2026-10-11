import type { LeadRecord, WebsiteSignal } from './types';

export function scoreBand(score: number): { label: string; className: string } {
  if (score >= 80) return { label: 'Priority', className: 'priority' };
  if (score >= 65) return { label: 'Strong fit', className: 'strong' };
  if (score >= 45) return { label: 'Develop', className: 'develop' };
  return { label: 'Monitor', className: 'monitor' };
}

export function topOpportunitySignals(leads: LeadRecord[]): Array<{ key: string; label: string; count: number }> {
  const counts = new Map<string, { label: string; count: number }>();
  leads.flatMap((lead) => lead.signals).filter((signal) => signal.state === 'opportunity').forEach((signal) => {
    const current = counts.get(signal.key) ?? { label: signal.label, count: 0 };
    current.count += 1;
    counts.set(signal.key, current);
  });
  return [...counts.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

export function averageScore(leads: LeadRecord[]): number {
  return leads.length ? Math.round(leads.reduce((sum, lead) => sum + lead.fitScore, 0) / leads.length) : 0;
}

export function opportunityCount(signals: WebsiteSignal[]): number {
  return signals.filter((signal) => signal.state === 'opportunity').length;
}

function escapeCsv(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function leadsToCsv(leads: LeadRecord[]): string {
  const headers = ['Verified business', 'Category', 'Location', 'Website', 'Emails', 'Phones', 'ALYR fit', 'Status', 'Owner', 'Source', 'Place ID', 'Notes'];
  const rows = leads.map((lead) => [
    lead.verifiedName,
    lead.category,
    lead.location,
    lead.website,
    lead.emails.join(' | '),
    lead.phones.join(' | '),
    lead.fitScore,
    lead.status,
    lead.owner,
    lead.sourceUrl,
    lead.placeId ?? '',
    lead.notes,
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
}
