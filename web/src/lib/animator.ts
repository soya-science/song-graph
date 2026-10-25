/**
 * Shared, mutable point positions that ease from one layout to the next.
 * Every scene component calls tick() once per frame; the first call does the work.
 */
export class LayoutAnimator {
  readonly current: Float32Array;
  private from: Float32Array;
  to: Float32Array;
  private start = 0;
  private animating = false;
  private lastTick = -1;
  /** Incremented every time `current` changes. */
  version = 0;

  constructor(initial: Float32Array, readonly duration = 0.9) {
    this.current = Float32Array.from(initial);
    this.from = Float32Array.from(initial);
    this.to = initial;
  }

  setTarget(to: Float32Array, now: number) {
    this.from.set(this.current);
    this.to = to;
    this.start = now;
    this.animating = true;
  }

  tick(now: number) {
    if (now === this.lastTick || !this.animating) return;
    this.lastTick = now;
    const t = Math.min(1, (now - this.start) / this.duration);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // ease-in-out cubic
    const { current, from, to } = this;
    for (let i = 0; i < current.length; i++) current[i] = from[i] + (to[i] - from[i]) * e;
    if (t >= 1) this.animating = false;
    this.version++;
  }
}
