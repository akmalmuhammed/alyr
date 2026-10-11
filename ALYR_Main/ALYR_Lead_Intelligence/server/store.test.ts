import { describe, expect, it } from 'vitest';
import { sameLeadIdentity } from './store.js';

describe('lead deduplication identity', () => {
  it('matches the same Google Place ID', () => {
    expect(sameLeadIdentity(
      { placeId: 'ChIJ123', website: '', sourceUrl: '' },
      { placeId: 'ChIJ123', website: '', sourceUrl: '' },
    )).toBe(true);
  });

  it('normalizes website tracking parameters and trailing slashes', () => {
    expect(sameLeadIdentity(
      { website: 'https://example.com/?utm_source=test', sourceUrl: '' },
      { website: 'https://EXAMPLE.com', sourceUrl: '' },
    )).toBe(true);
  });

  it('keeps unrelated businesses separate', () => {
    expect(sameLeadIdentity(
      { placeId: 'one', website: 'https://one.example', sourceUrl: '' },
      { placeId: 'two', website: 'https://two.example', sourceUrl: '' },
    )).toBe(false);
  });
});
