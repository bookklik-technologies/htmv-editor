import type { EditorAssets, EditorCommand, EditorEvent, EditorFrameState, EditorOutputTarget, EditorProject, EditorProjectInput, HeadlessEditorController, HeadlessEditorOptions, TargetExportResult, VideoExportOptions, VideoExportResult } from './types.js';
import { clone, createProject, migrateProject, validateProject } from './project.js';
import { DocumentStore, SelectionModel } from './state.js';
import { toComposition } from './composition.js';
import { readArchive, writeArchive } from './archive.js';
import { PreviewEngine } from './engine.js';

export { createProject, validateProject, migrateProject } from './project.js';
export { applyCommand } from './commands.js';
export { parseSubtitles, subtitleBlob } from './captions.js';
export { toComposition } from './composition.js';
export { readArchive, writeArchive } from './archive.js';
export type * from './types.js';

export function createHeadlessEditor(options: HeadlessEditorOptions = {}): HeadlessEditorController {
  return new HeadlessEditor(options);
}

class HeadlessEditor implements HeadlessEditorController {
  readonly ready: Promise<void>;
  private store: DocumentStore;
  private assets: EditorAssets;
  private selection = new SelectionModel();
  private engine: PreviewEngine | null = null;
  private previewRevision = -1;
  private frame = 0;
  private closed = false;
  private pending = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private lifetime = new AbortController();
  private cleanups = new Set<() => Promise<void>>();
  private destruction: Promise<void> | null = null;

  constructor(private options: HeadlessEditorOptions) {
    this.store = new DocumentStore(options.project ?? createProject());
    this.assets = { ...(options.assets ?? {}) };
    validateProject(this.store.project, this.assets);
    if (options.canvas) {
      this.engine = new PreviewEngine(options.canvas, (frame, playing) => {
        this.frame = frame;
        this.emit({ type: 'playback', frame, playing });
      }, error => this.emit({ type: 'diagnostic', severity: 'error', operation: 'preview', message: String(error) }));
    }
    this.ready = this.engine ? this.refreshPreview() : Promise.resolve();
  }

  get canUndo(): boolean { return this.store.canUndo; }
  get canRedo(): boolean { return this.store.canRedo; }
  private assertOpen(): void { if (this.closed) throw new Error('Headless editor is destroyed.'); }
  private assertEditable(): void {
    this.assertOpen();
    if (this.pending) throw new Error('Wait for the pending headless editor operation before editing.');
  }
  private emit(event: EditorEvent): void {
    if (this.closed) return;
    try { this.options.onEvent?.(event); }
    catch (error) { console.error('HTMV Editor event handler failed', error); }
  }
  private enqueue<Value>(operation: () => Promise<Value>): Promise<Value> {
    this.assertOpen();
    this.pending++;
    const task = this.chain.then(() => { this.assertOpen(); return operation(); });
    const settled = task.finally(() => { this.pending--; });
    this.chain = settled.catch(() => undefined);
    return settled;
  }
  private renderer(): PreviewEngine {
    this.assertOpen();
    if (!this.engine) throw new Error('Supply a browser canvas to createHeadlessEditor to use rendering or playback.');
    return this.engine;
  }
  private clampFrame(frame: number): number {
    if (!Number.isFinite(frame)) throw new TypeError('Frame must be finite.');
    return Math.min(this.store.project.duration - 1, Math.max(0, Math.round(frame)));
  }
  private changed(): void {
    this.engine?.pause();
    this.engine?.invalidatePending();
    this.previewRevision = -1;
    this.frame = this.clampFrame(this.frame);
    this.selection.prune(this.store.project);
    const clipIds = [...this.selection.ids];
    this.emit({ type: 'change', project: this.getProject() });
    this.emit({ type: 'selection', clipId: clipIds[0] ?? null, clipIds });
  }
  getProject(): EditorProject { this.assertOpen(); return clone(this.store.project); }
  getAssets(): EditorAssets { this.assertOpen(); return { ...this.assets }; }
  getSelection(): string[] { this.assertOpen(); return [...this.selection.ids]; }
  setSelection(ids: string[]): void {
    this.assertOpen();
    this.selection.set(ids, this.store.project);
    const clipIds = this.getSelection();
    this.emit({ type: 'selection', clipId: clipIds[0] ?? null, clipIds });
  }
  updateProject(update: (draft: EditorProject) => void): void {
    this.assertEditable();
    if (this.store.update(draft => {
      const result = update(draft) as unknown;
      if (result && typeof (result as { then?: unknown }).then === 'function') {
        void Promise.resolve(result).catch(() => undefined);
        throw new Error('Document update callbacks must be synchronous.');
      }
      validateProject(draft, this.assets);
    }, this.assets)) this.changed();
  }
  dispatch(command: EditorCommand): void {
    this.assertEditable();
    const result = this.store.command(command, this.assets);
    if (result.changed) {
      if (result.ids.length) this.selection.set(result.ids, this.store.project);
      this.changed();
    }
  }
  undo(): void { this.assertEditable(); if (this.store.undo()) this.changed(); }
  redo(): void { this.assertEditable(); if (this.store.redo()) this.changed(); }
  toComposition(): string { this.assertOpen(); return toComposition(this.store.project); }
  loadProject(project: EditorProjectInput, assets: EditorAssets = {}): Promise<void> {
    const next = migrateProject(project), blobs = { ...assets };
    validateProject(next, blobs);
    return this.enqueue(async () => { this.replace(next, blobs); });
  }
  private replace(project: EditorProject, assets: EditorAssets): void {
    this.store.replace(project);
    this.assets = assets;
    this.selection.set([], project);
    this.frame = 0;
    this.changed();
  }
  saveArchive(): Promise<Blob> {
    return this.enqueue(() => writeArchive({ project: this.store.project, assets: this.assets }, this.lifetime.signal));
  }
  openArchive(file: Blob): Promise<void> {
    return this.enqueue(async () => {
      const bundle = await readArchive(file, this.lifetime.signal);
      this.assertOpen();
      this.replace(bundle.project, bundle.assets);
    });
  }
  private async preparePreview(): Promise<void> {
    const engine = this.renderer();
    if (this.previewRevision === this.store.revision) return;
    if (!await engine.replace(this.store.project, this.assets, this.frame)) throw new Error('Preview could not be prepared. Check diagnostic events.');
    this.previewRevision = this.store.revision;
  }
  refreshPreview(): Promise<void> { return this.enqueue(() => this.preparePreview()); }
  inspectFrame(frame = this.frame): EditorFrameState {
    const engine = this.renderer();
    if (this.previewRevision !== this.store.revision) throw new Error('Await refreshPreview() after editing before inspecting frames.');
    return engine.inspectFrame(this.clampFrame(frame));
  }
  play(): Promise<void> { return this.enqueue(async () => { await this.preparePreview(); await this.renderer().play(); }); }
  pause(): void { this.renderer().pause(); }
  seek(frame: number): Promise<void> {
    const next = this.clampFrame(frame);
    return this.enqueue(async () => {
      this.frame = next;
      await this.preparePreview();
      await this.renderer().seek(next);
    });
  }
  exportStill(frame = this.frame): Promise<Blob> {
    const next = this.clampFrame(frame);
    return this.enqueue(() => this.renderer().still(this.store.project, this.assets, next, this.lifetime.signal));
  }
  preflightExport(options: VideoExportOptions = {}) {
    const settings = { ...options, signal: AbortSignal.any([this.lifetime.signal, ...(options.signal ? [options.signal] : [])]) };
    return this.enqueue(() => this.renderer().preflight(this.store.project, this.assets, settings));
  }
  exportToTarget(target: EditorOutputTarget, options: VideoExportOptions = {}): Promise<TargetExportResult> {
    const settings = { ...options, signal: AbortSignal.any([this.lifetime.signal, ...(options.signal ? [options.signal] : [])]) };
    return this.enqueue(async () => {
      const result = await this.renderer().exportTarget(this.store.project, this.assets, target, settings,
        (phase, completedFrames, totalFrames) => this.emit({ type: 'export', phase, completedFrames, totalFrames }));
      if (result.kind !== 'opfs') return result;
      const cleanup = async () => { await result.cleanup(); this.cleanups.delete(cleanup); };
      this.cleanups.add(cleanup);
      return { ...result, cleanup };
    });
  }
  async exportVideo(options: VideoExportOptions = {}): Promise<VideoExportResult> {
    const result = await this.exportToTarget({ kind: 'memory' }, options);
    if (result.kind !== 'blob') throw new Error('Expected a Blob export.');
    return { blob: result.blob, extension: result.extension, manifest: result.manifest };
  }
  destroy(): Promise<void> {
    if (this.destruction) return this.destruction;
    this.closed = true;
    this.lifetime.abort();
    this.engine?.pause();
    this.engine?.invalidatePending();
    this.destruction = (async () => {
      await this.chain;
      try { await this.engine?.destroy(); }
      finally {
        const results = await Promise.allSettled([...this.cleanups].map(cleanup => cleanup()));
        this.store.clearHistory();
        this.assets = {};
        this.options = {};
        const failures = results.filter(result => result.status === 'rejected');
        if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Temporary output cleanup failed.');
      }
    })();
    return this.destruction;
  }
}
