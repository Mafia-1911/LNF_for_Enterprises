import { describe, expect, it } from 'vitest';
import { cronPeriodSeconds } from './index';

describe('cronPeriodSeconds', () => {
  it('reads the period of the cron expressions our jobs use', () => {
    expect(cronPeriodSeconds('*/15 * * * *')).toBe(900);
    expect(cronPeriodSeconds('10 * * * *')).toBe(3600);
    expect(cronPeriodSeconds('30 0 * * *')).toBe(86_400);
    expect(cronPeriodSeconds(' 0  3 * * * ')).toBe(86_400);
  });

  it('treats any fixed hour as daily and falls back to hourly for anything else', () => {
    expect(cronPeriodSeconds('0 9 * * 1')).toBe(86_400);
    expect(cronPeriodSeconds('*/5 9 * * *')).toBe(3600);
    expect(cronPeriodSeconds('')).toBe(3600);
  });
});
