import { describe, expect, it } from 'vitest';
import { classifyOsmTags, osmElementToProspect } from './osmScan.js';

describe('Qatar open-data classification', () => {
  it('classifies common transformation target sectors', () => {
    expect(classifyOsmTags({ office: 'travel_agent' }).category).toBe('Travel & Tourism');
    expect(classifyOsmTags({ shop: 'travel_agency' }).category).toBe('Travel & Tourism');
    expect(classifyOsmTags({ office: 'visa' }).category).toBe('Document & Government Services');
    expect(classifyOsmTags({ shop: 'laundry' }).category).toBe('Domestic & Care Services');
    expect(classifyOsmTags({ amenity: 'clinic' }).category).toBe('Healthcare');
    expect(classifyOsmTags({ shop: 'furniture' }).category).toBe('Home & Interiors');
    expect(classifyOsmTags({ amenity: 'restaurant' }).category).toBe('Food & Beverage');
  });

  it('excludes obviously noncommercial infrastructure from target counts', () => {
    expect(classifyOsmTags({ amenity: 'parking' }).targetStatus).toBe('excluded-noncommercial');
    expect(classifyOsmTags({ amenity: 'place_of_worship' }).targetStatus).toBe('excluded-noncommercial');
  });

  it('normalizes source provenance and contact fields', () => {
    const prospect = osmElementToProspect({
      type: 'node',
      id: 123,
      lat: 25.28,
      lon: 51.52,
      tags: {
        name: 'Example Services',
        office: 'company',
        website: 'example.qa',
        email: 'INFO@EXAMPLE.QA',
        phone: '+974 4400 0000',
        'addr:city': 'Doha',
      },
    }, '2026-07-16T00:00:00.000Z');
    expect(prospect).toMatchObject({
      id: 'osm:node:123',
      category: 'Professional & Business Services',
      website: 'https://example.qa/',
      emails: ['info@example.qa'],
      location: 'Doha',
      verificationStatus: 'website-queued',
    });
  });
});
