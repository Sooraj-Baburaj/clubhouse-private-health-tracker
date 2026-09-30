import { describe, expect, it } from 'vitest';
import { rolloverTargetDate } from '../../src/application/jobs/rollover';
import { platformFrom } from '../../src/application/pushDevices';

describe('rolloverTargetDate', () => {
  it('waits until 03:00 local before rolling over yesterday', () => {
    // 02:59 IST on 2 Oct → the last settled day is still 30 Sep.
    expect(rolloverTargetDate(new Date('2026-10-01T21:29:00Z'), 'Asia/Kolkata')).toBe('2026-09-30');
    // 03:00 IST on 2 Oct → 1 Oct has settled.
    expect(rolloverTargetDate(new Date('2026-10-01T21:30:00Z'), 'Asia/Kolkata')).toBe('2026-10-01');
  });
  it('uses the member timezone', () => {
    expect(rolloverTargetDate(new Date('2026-10-02T08:00:00Z'), 'America/New_York')).toBe('2026-10-01');
  });
});

describe('platformFrom', () => {
  it('prefers the client hint', () => expect(platformFrom('whatever', 'Pixel · Chrome')).toBe('Pixel · Chrome'));
  it('derives a label from the user agent', () => {
    expect(platformFrom('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('iPhone · Safari');
    expect(platformFrom('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36')).toBe('Android · Chrome');
  });
});
