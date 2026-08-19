import { describe, it, expect } from 'vitest';
import { systemClock, fixedClock } from '../../../src/shared/time/clock.js';

describe('testing-strategy.md §14: injectable clock', () => {
  it('systemClock returns the real current time', () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    const after = Date.now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });

  it('fixedClock always returns the same instant', () => {
    const instant = new Date('2026-01-01T00:00:00Z');
    const clock = fixedClock(instant);

    expect(clock.now()).toEqual(instant);
    expect(clock.now()).toEqual(instant);
  });
});
