import type { Clock } from '../../src/shared/time/clock.js';

export interface MutableClock {
  clock: Clock;
  set(date: Date): void;
  advance(ms: number): void;
}

export function mutableClock(initial: Date): MutableClock {
  let current = initial;
  return {
    clock: { now: () => current },
    set(date: Date) {
      current = date;
    },
    advance(ms: number) {
      current = new Date(current.getTime() + ms);
    },
  };
}
