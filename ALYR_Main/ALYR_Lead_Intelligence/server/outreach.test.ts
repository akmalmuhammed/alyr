import { describe, expect, it } from 'vitest';
import { permissionAllowsChannel } from './outreach';

describe('outreach permission gates', () => {
  it('requires explicit opt-in for WhatsApp', () => {
    expect(permissionAllowsChannel('opted-in', 'whatsapp')).toBe(true);
    expect(permissionAllowsChannel('approved-business-contact', 'whatsapp')).toBe(false);
    expect(permissionAllowsChannel('unknown', 'whatsapp')).toBe(false);
    expect(permissionAllowsChannel('opted-out', 'whatsapp')).toBe(false);
  });

  it('allows email only after a recorded permission decision', () => {
    expect(permissionAllowsChannel('opted-in', 'email')).toBe(true);
    expect(permissionAllowsChannel('approved-business-contact', 'email')).toBe(true);
    expect(permissionAllowsChannel('unknown', 'email')).toBe(false);
    expect(permissionAllowsChannel('opted-out', 'email')).toBe(false);
  });

  it('still blocks internal tasks for opted-out prospects', () => {
    expect(permissionAllowsChannel('unknown', 'task')).toBe(true);
    expect(permissionAllowsChannel('opted-out', 'task')).toBe(false);
  });
});
