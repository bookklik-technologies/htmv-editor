/** One frame-scheduled pointer transaction. Only its final value commits to history. */
export class PointerTransaction<T> {
  private raf = 0;
  private latest: PointerEvent | null = null;
  private current: T | null = null;
  private origin: PointerEvent | null = null;
  samples: number[] = [];
  moved = false;
  get active(): boolean { return this.origin !== null; }
  begin(event: PointerEvent, privateValue: T, privateRoot: HTMLElement, preview: (event: PointerEvent, origin: PointerEvent, value: T) => void): void {
    this.cancel(); this.origin = event; this.current = privateValue; this.root = privateRoot; this.preview = preview; this.moved = false; privateRoot.setPointerCapture(event.pointerId);
  }
  private root: HTMLElement | null = null;
  private preview: ((event: PointerEvent, origin: PointerEvent, value: T) => void) | null = null;
  move(event: PointerEvent): void { if (!this.origin) return; this.latest = event; if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.paint(); }); }
  private paint(): void { if (!this.latest || !this.origin || !this.current || !this.preview) return; const e = this.latest; this.latest = null; if (Math.abs(e.clientX - this.origin.clientX) + Math.abs(e.clientY - this.origin.clientY) < 3 && !this.moved) return; this.moved = true; this.preview(e, this.origin, this.current); this.samples.push(Math.max(0, performance.now() - e.timeStamp)); if (this.samples.length > 500) this.samples.shift(); }
  end(event: PointerEvent): T | null { if (!this.origin) return null; this.latest = event; cancelAnimationFrame(this.raf); this.raf = 0; this.paint(); const value = this.current; this.release(); return value; }
  cancel(): void { cancelAnimationFrame(this.raf); this.raf = 0; this.release(); }
  private release(): void { if (this.root && this.origin && this.root.hasPointerCapture(this.origin.pointerId)) this.root.releasePointerCapture(this.origin.pointerId); this.origin = null; this.latest = null; this.current = null; this.preview = null; this.root = null; }
}
