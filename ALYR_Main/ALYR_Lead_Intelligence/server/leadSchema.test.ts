import { describe, expect, it } from 'vitest';
import { leadPatchSchema, leadSchema } from './leadSchema.js';

describe('lead validation', () => {
  it('does not introduce create defaults into a partial update', () => {
    expect(leadPatchSchema.parse({ status: 'qualified' })).toEqual({ status: 'qualified' });
  });

  it('still applies safe defaults when creating a lead', () => {
    const record = leadSchema.parse({ verifiedName: 'Example Business' });
    expect(record).toMatchObject({
      verifiedName: 'Example Business',
      website: '',
      status: 'new',
      owner: 'Unassigned',
      fitScore: 0,
    });
  });
});
