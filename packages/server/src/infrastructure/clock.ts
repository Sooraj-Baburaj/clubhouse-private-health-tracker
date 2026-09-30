import type { Clock } from '../application/ports';

export class SystemClock implements Clock {
  now() {
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private t: Date) {}
  now() {
    return new Date(this.t.getTime());
  }
  set(t: Date) {
    this.t = t;
  }
  advance(ms: number) {
    this.t = new Date(this.t.getTime() + ms);
  }
}
