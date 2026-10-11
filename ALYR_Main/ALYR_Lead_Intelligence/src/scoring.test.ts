import { describe, expect, it } from 'vitest';
import { averageScore, leadsToCsv, opportunityCount, scoreBand, topOpportunitySignals } from './scoring';
import type { LeadRecord, WebsiteSignal } from './types';

const opportunity: WebsiteSignal = {
  key: 'no-booking',
  label: 'No self-service action found',
  state: 'opportunity',
  evidence: 'No online booking path was observed.',
  weight: 14,
};

function lead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: 'lead-1',
    verifiedName: 'Northstar, Travel',
    website: 'https://northstar.example',
    category: 'Travel agency',
    location: 'Doha',
    emails: ['hello@northstar.example'],
    phones: ['+974 4400 0000'],
    socialLinks: [],
    sourceUrl: 'https://northstar.example',
    sourceType: 'website',
    status: 'new',
    owner: 'Unassigned',
    notes: 'Needs "booking" workflow',
    signals: [opportunity],
    fitScore: 82,
    createdAt: '2026-07-16T10:00:00.000Z',
    updatedAt: '2026-07-16T10:00:00.000Z',
    ...overrides,
  };
}

describe('lead intelligence scoring', () => {
  it('maps fit scores to stable bands', () => {
    expect(scoreBand(80).label).toBe('Priority');
    expect(scoreBand(65).label).toBe('Strong fit');
    expect(scoreBand(45).label).toBe('Develop');
    expect(scoreBand(44).label).toBe('Monitor');
  });

  it('aggregates opportunity signals and averages scores', () => {
    const records = [lead(), lead({ id: 'lead-2', fitScore: 60 })];
    expect(averageScore(records)).toBe(71);
    expect(topOpportunitySignals(records)[0]).toMatchObject({ key: 'no-booking', count: 2 });
    expect(opportunityCount(records[0].signals)).toBe(1);
  });

  it('exports independently verified fields as valid CSV', () => {
    const csv = leadsToCsv([lead()]);
    expect(csv).toContain('Verified business,Category');
    expect(csv).toContain('"Northstar, Travel"');
    expect(csv).toContain('"Needs ""booking"" workflow"');
  });
});
