import type { EditorAppearance, EditorAppearanceState } from './types.js';

const fallback = new Map<string, EditorAppearance>();
const subscribers = new Map<string, Set<(value: EditorAppearance) => void>>();
const valid = (value: unknown): value is EditorAppearance => value === 'system' || value === 'light' || value === 'dark';

/** Instance-scoped presentation state. Never writes project storage or document history. */
export class AppearanceController {
  private readonly key: string;
  private readonly system: MediaQueryList;
  private readonly listeners: Set<(value: EditorAppearance) => void>;
  private preference: EditorAppearance;
  private closed = false;
  private resolved: 'light' | 'dark';
  private readonly abort = new AbortController();
  constructor(private root: HTMLElement, namespace: string, initial: EditorAppearance | undefined, private onChange: (state: EditorAppearanceState) => void) {
    if (initial !== undefined && !valid(initial)) throw new TypeError('Invalid editor appearance.');
    this.key = `htmv-editor:appearance:${encodeURIComponent(namespace)}`;
    this.system = window.matchMedia('(prefers-color-scheme: dark)');
    let stored: unknown;
    try { stored = window.localStorage.getItem(this.key); } catch { /* Embedded/private storage may be unavailable. */ }
    this.preference = initial ?? fallback.get(this.key) ?? (valid(stored) ? stored : 'system');
    this.resolved = this.resolve();
    this.apply(false);
    this.listeners = subscribers.get(this.key) ?? new Set();
    subscribers.set(this.key, this.listeners); this.listeners.add(this.receive);
    this.system.addEventListener('change', this.systemChanged, { signal: this.abort.signal });
    window.addEventListener('storage', this.storageChanged, { signal: this.abort.signal });
  }
  get state(): EditorAppearanceState { return { preference: this.preference, resolved: this.resolved }; }
  set(value: EditorAppearance): void {
    if (this.closed) throw new Error('Editor is destroyed.');
    if (!valid(value)) throw new TypeError('Invalid editor appearance.');
    try { window.localStorage.setItem(this.key, value); fallback.delete(this.key); }
    catch { fallback.set(this.key, value); }
    for (const receive of [...this.listeners]) receive(value);
  }
  destroy(): void {
    if (this.closed) return; this.closed = true; this.abort.abort(); this.listeners.delete(this.receive);
    if (!this.listeners.size) subscribers.delete(this.key);
  }
  private resolve(): 'light' | 'dark' { return this.preference === 'system' ? this.system.matches ? 'dark' : 'light' : this.preference; }
  private apply(notify: boolean): void {
    this.resolved = this.resolve(); this.root.dataset.appearance = this.resolved; this.root.dataset.appearancePreference = this.preference;
    if (notify) this.onChange(this.state);
  }
  private receive = (value: EditorAppearance): void => {
    if (this.closed || this.preference === value && this.resolved === this.resolve()) return;
    this.preference = value; this.apply(true);
  };
  private systemChanged = (): void => { if (!this.closed && this.preference === 'system' && this.resolved !== this.resolve()) this.apply(true); };
  private storageChanged = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== this.key) return;
    // Ignore sessionStorage events and malformed external values.
    try { if (event.storageArea && event.storageArea !== window.localStorage) return; } catch { return; }
    const value = event.newValue === null ? 'system' : event.newValue;
    if (!valid(value)) return;
    fallback.delete(this.key); for (const receive of [...this.listeners]) receive(value);
  };
}
