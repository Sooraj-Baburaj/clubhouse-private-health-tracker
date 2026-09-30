import { localDateOf, localTimeOf, startOfLocalDay } from '@clubhouse/domain';
import type { Container } from '../container';

export interface MemberClock {
  now: Date;
  today: string;
  localTime: string;
  dayStart: Date;
  tz: string;
}

export function memberClock(c: Container, tz: string): MemberClock {
  const now = c.clock.now();
  const today = localDateOf(now, tz);
  return { now, today, localTime: localTimeOf(now, tz), dayStart: startOfLocalDay(today, tz), tz };
}
