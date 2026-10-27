import type { EditorAppearance, EditorAppearanceState, EditorAssets, EditorClip, EditorCommand, EditorController, EditorEvent, EditorFrameNode, EditorFrameState, EditorOptions, EditorOutputTarget, EditorProject, EditorProjectInput, EditorTemplate, EditorTrack, MotionKeyframe, MotionProperty, ProjectBundle, ShapeClip, TargetExportResult, VideoExportOptions, VideoExportResult, VisualClip } from './types.js';
import { clone, createProject, describeTime, endFrame, hasMedia, hasSound, isText, isVisual, LIMITS, migrateProject, trackAccepts, uid, validateProject } from './project.js';
import { PreviewEngine } from './engine.js';
import { inspectFile, MediaCache } from './media.js';
import { readArchive, writeArchive } from './archive.js';
import { ProjectStorage, StorageConflictError } from './storage.js';
import { DocumentStore, SelectionModel } from './state.js';
import { AppearanceController } from './appearance.js';
import { applyCommand } from './commands.js';
import { builtinProject, BUILTIN_TEMPLATES as builtinTemplates, freshProject, isBuiltinTemplate } from './templates.js';
import { makeCaption, parseSubtitles, subtitleBlob } from './captions.js';
import { TimelineView } from './timeline.js';
import { PointerTransaction } from './interaction.js';
import { inspectorHTML, motionProperties, propertyValue, sidebarHTML, type Panel } from './panels.js';
import { button, bytes, esc, field, icon, selectField, workspaceHTML } from './ui.js';

const message = (error: unknown): string => { const e = error as { diagnostics?: { code: string; message: string }[]; message?: string }; return e?.diagnostics?.map(d => `${d.code}: ${d.message}`).join('\n') || e?.message || String(error); };
let clipboard: { project: EditorProject; assets: EditorAssets; ids: string[]; owner: symbol } | null = null;
let copiedKey: MotionKeyframe | null = null;
interface Drag {
  kind: 'move' | 'left' | 'right' | 'scrub' | 'position' | 'resize' | 'rotate' | 'pan' | 'panel' | 'key';
  x: number; y: number; clips: EditorClip[]; preview: EditorClip[]; delta: number; valid: boolean;
  trackId?: string; panel?: string; initial?: number; size?: number; keyId?: string; property?: MotionProperty; corner?: number;
  nodes?: EditorFrameNode[]; changes?: Record<string, unknown>[];
}
export function createEditor(container: HTMLElement, options: EditorOptions = {}): EditorController { if (!(container instanceof HTMLElement)) throw new TypeError('createEditor requires an HTML container.'); return new Editor(container, options); }

class Editor implements EditorController {
  readonly ready: Promise<void>;
  private store: DocumentStore;
  private selection = new SelectionModel();
  private assets: EditorAssets;
  private root: HTMLDivElement;
  private engine: PreviewEngine;
  private storage: ProjectStorage;
  private appearance: AppearanceController;
  private media: MediaCache;
  private timeline: TimelineView;
  private pointer = new PointerTransaction<Drag>();
  private lifetime = new AbortController();
  private jobs = new Set<Promise<unknown>>();
  private operation = 0;
  private operationAbort: AbortController | null = null;
  private exportAbort: AbortController | null = null;
  private exportTask: Promise<TargetExportResult> | null = null;
  private compileTimer: ReturnType<typeof setTimeout> | undefined;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private saveChain: Promise<void> = Promise.resolve();
  private savedDocument: EditorProject | null = null;
  private archivedDocument: EditorProject | null = null;
  private conflict = false;
  private pendingSwitch: (() => Promise<void>) | null = null;
  private frame = 0;
  private previewRevision = -1;
  private playing = false;
  private busy = false;
  private closed = false;
  private destruction: Promise<void> | null = null;
  private panel: Panel = 'layers';
  private animated = false;
  private autoKey = false;
  private motionProperty: MotionProperty = 'x';
  private keyId: string | null = null;
  private expanded = new Set<string>();
  private selectedTrack: string | null = null;
  private placement = 'new';
  private snapping = true;
  private panMode = false;
  private canvasZoom = 1;
  private pan = { x: 0, y: 0 };
  private dialog: HTMLDialogElement | null = null;
  private templates: EditorTemplate[] = builtinTemplates;
  private replacement: string | null = null;
  private urls = new Set<string>();
  private cleanups = new Set<() => Promise<void>>();
  private deferred = new Set<ReturnType<typeof setTimeout>>();
  private resizeObserver: ResizeObserver;
  private cachedPreflight: { extension?: string; options: VideoExportOptions } | null = null;
  private departureAccepted = false;
  private restoringFocus = false;
  private identity = Symbol('editor');
  private announcedSelection = '[]';
  private committingInspector = false;
  private inspectorNeedsRefresh = false;
  private clickingInspector = false;
  get project(): EditorProject { return this.store.project; }
  private get dirty(): boolean { return this.savedDocument !== this.project; }
  get hasUnsavedChanges(): boolean { return this.dirty && this.archivedDocument !== this.project; }

  constructor(container: HTMLElement, private options: EditorOptions) {
    if (options.appearance !== undefined && !['system', 'light', 'dark'].includes(options.appearance)) throw new TypeError('Invalid editor appearance.');
    this.store = new DocumentStore(options.project ?? createProject()); this.assets = { ...(options.assets ?? {}) }; validateProject(this.project, this.assets, true);
    this.root = document.createElement('div'); this.root.className = 'htmv-editor'; this.root.tabIndex = 0; this.root.setAttribute('aria-label', 'HTMV Editor'); this.root.innerHTML = workspaceHTML(); container.append(this.root);
    this.storage = new ProjectStorage(options.storageKey ?? 'default', id => { if (!this.closed && id === this.project.id) { this.conflict = true; this.saveStatus('conflict', 'Changed in another tab · Save a copy or reopen'); } });
    this.engine = new PreviewEngine(this.ref<HTMLCanvasElement>('screen').querySelector('canvas')!, (frame, playing) => { this.frame = frame; this.playing = playing; this.updateFrame(); this.emit({ type: 'playback', frame, playing }); }, e => this.diagnostic(e, 'preview'), (peak, clipped) => this.audioLevel(peak, clipped));
    this.media = new MediaCache(); this.media.onReady(() => { if (!this.closed && !this.pointer.active) { if (this.panel === 'media') this.renderPanel(); this.renderTimeline(); } });
    this.timeline = new TimelineView(this.ref('timeline-scroll'), this.ref('timeline'), this.media, this.lifetime.signal, () => this.requestVisibleMedia());
    this.bind(); this.resizeObserver = new ResizeObserver(() => this.fitCanvas()); this.resizeObserver.observe(this.ref('stage'));
    this.appearance = new AppearanceController(this.root, options.storageKey ?? 'default', options.appearance, state => this.updateAppearance(state));
    this.updateAppearance(this.appearance.state); this.render(); this.ready = this.trackJob(this.initialize());
  }
  getAppearance(): EditorAppearance { return this.appearance.state.preference; }
  setAppearance(value: EditorAppearance): void { if (this.closed) throw new Error('Editor is destroyed.'); this.appearance.set(value); }
  private updateAppearance(state: EditorAppearanceState): void {
    const button = this.ref<HTMLButtonElement>('appearance-button');
    button.innerHTML = icon(state.preference) + '<span>Appearance</span>'; button.title = 'Appearance: ' + state.preference + ' (' + state.resolved + ')';
    for (const radio of this.root.querySelectorAll<HTMLInputElement>('[data-appearance-choice]')) radio.checked = radio.value === state.preference;
    this.emit({ type: 'appearance', ...state });
  }
  private closeAppearance(restoreFocus = false): void {
    const menu = this.ref('appearance-menu'); if (menu.hidden) return; menu.hidden = true; this.ref('appearance-button').setAttribute('aria-expanded', 'false');
    if (restoreFocus) this.ref('appearance-button').focus();
  }
  private ref<T extends HTMLElement = HTMLElement>(name: string): T { return this.root.querySelector<T>(`[data-ref="${name}"]`)!; }
  private emit(event: EditorEvent): void { try { this.options.onEvent?.(event); } catch (e) { console.error('HTMV Editor event handler failed', e); } }
  private status(text: string, severity: 'error' | null = null): void { const out = this.ref('status'); out.classList.toggle('he-status-error', severity === 'error'); out.setAttribute('aria-live', severity === 'error' ? 'assertive' : 'polite'); out.textContent = text; }
  private diagnostic(error: unknown, operation?: string): void { if (this.closed || (error as Error)?.name === 'AbortError') return; const text = message(error); this.status(text, 'error'); if (this.dialog) { let output = this.dialog.querySelector<HTMLElement>('[data-dialog-error]'); if (!output) { output = document.createElement('p'); output.dataset.dialogError = ''; output.className = 'he-error'; output.setAttribute('role', 'alert'); this.dialog.querySelector('.he-dialog-body')!.prepend(output); } output.textContent = text; } this.emit({ type: 'diagnostic', severity: 'error', message: text, code: (error as { code?: string })?.code, operation }); }
  private saveStatus(status: Extract<EditorEvent, { type: 'save' }>['status'], text: string): void { this.ref('save').textContent = text; this.ref('save').title = text; this.ref('save').dataset.status = status; this.emit({ type: 'save', status, message: text }); }
  private async initialize(): Promise<void> {
    if (this.options.autosave !== false) try {
      if (!this.options.project) { const saved = await this.storage.list(); if (saved[0] && !this.closed) { const bundle = await this.storage.load(saved[0].key); if (!this.closed && !this.store.revision) { this.store.replace(bundle.project); this.assets = bundle.assets; this.savedDocument = this.project; } } }
      if (!this.closed && !this.savedDocument) await this.flushSave();
    } catch (e) { this.diagnostic(e, 'storage'); this.saveStatus('error', `Save failed · ${message(e)}`); }
    else this.saveStatus('disabled', 'Autosave disabled');
    if (this.closed) return; if (this.savedDocument === this.project) this.saveStatus('saved', 'All changes saved'); this.render(); this.refreshTemplates(); await this.compile(); this.status(this.project.clips.length ? 'Ready. Your local project is open.' : 'Ready. Add a layer or explore a template.');
  }
  private trackJob<T>(task: Promise<T>): Promise<T> { this.jobs.add(task); void task.finally(() => this.jobs.delete(task)).catch(() => {}); return task; }
  private run(task: Promise<unknown>): void { void this.trackJob(task).catch(e => this.diagnostic(e)); }
  private assertEditable(): void { if (this.closed) throw new Error('Editor is destroyed.'); if (this.busy || this.exportAbort) throw new Error('Finish or cancel the active operation before editing.'); }
  private async compile(): Promise<void> {
    clearTimeout(this.compileTimer); const revision = this.store.revision, project = this.project;
    this.ref('preview-state').textContent = 'Updating preview…';
    try { if (await this.engine.replace(project, this.currentAssets(), this.frame)) { if (revision !== this.store.revision || this.closed) return; this.previewRevision = revision; this.ref('preview-state').textContent = ''; this.renderOverlay(); if (!this.inspectorHasInputFocus()) this.renderInspector(); this.ref('empty').hidden = !!project.clips.length; } }
    catch (error) { if (revision === this.store.revision && !this.closed) this.ref('preview-state').textContent = this.engine.hasPreview ? 'Showing last available preview' : 'Preview unavailable'; this.diagnostic(error, 'compile'); }
  }
  private changed(): void {
    this.pause(); this.engine.invalidatePending(); this.previewRevision = -1; this.frame = Math.min(this.frame, this.project.duration - 1); this.engine.setDesiredFrame(this.frame); this.selection.prune(this.project); this.keyId = null;
    const retained = this.store.retainedAssetIds(); this.media.retain(retained); for (const id of Object.keys(this.assets)) if (!retained.has(id)) { delete this.assets[id]; this.media.invalidate(id); }
    this.render(); this.emit({ type: 'change', project: this.getProject() }); this.announceSelection(); clearTimeout(this.compileTimer); this.compileTimer = setTimeout(() => this.run(this.compile()), 100);
    clearTimeout(this.saveTimer); if (this.options.autosave !== false) { this.saveStatus(this.conflict ? 'conflict' : 'saving', this.conflict ? 'Tab conflict · Save a copy' : 'Unsaved changes…'); if (!this.conflict) this.saveTimer = setTimeout(() => this.run(this.flushSave()), 500); }
  }
  getProject(): EditorProject { return clone(this.project); }
  private currentAssets(): EditorAssets { return Object.fromEntries(this.project.assets.filter(a => this.assets[a.id]).map(a => [a.id, this.assets[a.id]])); }
  getAssets(): EditorAssets { return { ...this.currentAssets() }; }
  updateProject(update: (draft: EditorProject) => void): void { this.assertEditable(); const active = document.activeElement as HTMLElement | null; if (!(active?.dataset?.field && this.root.contains(active) && !active.closest('dialog'))) this.store.endGroup(); if (this.store.update(update, this.assets)) this.changed(); }
  dispatch(command: EditorCommand): void { this.assertEditable(); this.store.endGroup(); const result = this.store.command(command, this.assets); if (result.changed) { if (command.type === 'duplicate' || command.type === 'split') this.selection.set(result.ids, this.project); this.changed(); } }
  undo(): void { this.assertEditable(); if (this.store.undo()) this.changed(); }
  redo(): void { this.assertEditable(); if (this.store.redo()) this.changed(); }
  getSelection(): string[] { return [...this.selection.ids]; }
  setSelection(ids: string[]): void { this.selection.set(ids, this.project); this.keyId = null; this.timeline.select(this.selection.ids); this.renderPanel(); this.renderInspector(); this.renderOverlay(); this.announceSelection(); }
  private announceSelection(): void { const clipIds = this.getSelection(), serialized = JSON.stringify(clipIds); if (serialized !== this.announcedSelection) { this.announcedSelection = serialized; this.emit({ type: 'selection', clipId: this.selection.first, clipIds }); } }
  inspectFrame(frame = this.frame): EditorFrameState { if (this.previewRevision !== this.store.revision) return { frame, revisionHash: '', nodes: [] }; return this.engine.inspectFrame(Math.min(this.project.duration - 1, Math.max(0, Math.round(frame)))); }
  async play(): Promise<void> { this.assertEditable(); if (this.previewRevision !== this.store.revision) await this.compile(); if (this.previewRevision !== this.store.revision) throw new Error('Current edits could not be compiled. Resolve the diagnostic before playing this project.'); await this.engine.play(); }
  pause(): void { this.engine.pause(); this.playing = false; this.audioLevel(0, 0); }
  async seek(frame: number): Promise<void> { if (this.closed) return; if (this.exportAbort) throw new Error('Seeking is locked during export.'); this.frame = Math.min(this.project.duration - 1, Math.max(0, Math.round(frame))); this.engine.setDesiredFrame(this.frame); this.updateFrame(); await this.engine.seek(this.frame); if (!this.playing && !this.pointer.active) { this.renderOverlay(); if (!this.inspectorHasInputFocus()) this.renderInspector(); } }
  async flushSave(): Promise<void> {
    clearTimeout(this.saveTimer); if (this.options.autosave === false || !this.dirty) return;
    const task = this.saveChain.catch(() => {}).then(async () => {
      if (!this.dirty) return; if (this.conflict) throw new StorageConflictError();
      const project = this.project, assets = this.currentAssets(); this.saveStatus('saving', 'Saving locally…');
      try { await this.storage.save(project, assets); this.savedDocument = project; if (this.project === project) { this.saveStatus('saved', 'All changes saved'); const out = this.ref('status'); if (out.classList.contains('he-status-error')) this.status('All changes saved'); } }
      catch (e) { if (e instanceof StorageConflictError) this.conflict = true; this.saveStatus(this.conflict ? 'conflict' : 'error', `Save failed · ${message(e)}`); throw e; }
    }); this.saveChain = task; await task;
  }
  private async ensureSaved(discard = false): Promise<void> { if (discard || this.departureAccepted || !this.hasUnsavedChanges) return; if (this.options.autosave === false) throw new Error('Download the current project or explicitly discard its changes before switching.'); await this.flushSave(); if (this.hasUnsavedChanges) throw new Error('New edits are still unsaved. Try switching again.'); }
  private async switchUI(action: (token: number) => Promise<void>, discard = false): Promise<void> {
    this.assertEditable();
    const token = ++this.operation;
    try { await this.ensureSaved(discard); if (this.closed || token !== this.operation) return; await action(token); }
    catch (e) { if (token !== this.operation || this.closed) return; if (!this.hasUnsavedChanges) throw e; this.pendingSwitch = () => this.switchUI(action, true); this.showDialog('Keep your work safe', `<p>The active project is still open, including its undo history.</p><p class="he-error">${esc(message(e))}</p><div class="he-dialog-actions">${button('retry-switch', 'Retry saving')}${button('copy-switch', 'Save a copy')}${button('download-switch', 'Download & continue', 'download')}${button('discard-switch', 'Discard & continue')}${button('close-dialog', 'Keep editing')}</div>`); }
  }
  private replace(bundle: ProjectBundle): void {
    this.archivedDocument = null;
    this.operationAbort?.abort(); this.engine.invalidatePending(); this.pause(); this.store.replace(bundle.project); this.assets = { ...bundle.assets }; this.savedDocument = null; this.conflict = false; this.frame = 0; this.selection.set([], this.project); this.selectedTrack = null; this.expanded.clear(); this.previewRevision = -1; this.changed();
  }
  loadProject(project: EditorProjectInput, assets: EditorAssets, options: { discardUnsaved?: boolean } = {}): Promise<void> { return this.trackJob(this.loadProjectNow(project, assets, options)); }
  private async loadProjectNow(project: EditorProjectInput, assets: EditorAssets, options: { discardUnsaved?: boolean }): Promise<void> { this.assertEditable(); const token = ++this.operation, next = migrateProject(project); validateProject(next, assets, true); await this.ensureSaved(options.discardUnsaved); if (this.closed || token !== this.operation) return; await this.storage.adopt(next).catch(() => {}); this.replace({ project: next, assets }); await this.compile(); }
  async saveArchive(): Promise<Blob> { if (this.closed) throw new Error('Editor is destroyed.'); return this.trackJob(writeArchive({ project: this.getProject(), assets: this.getAssets() }, this.lifetime.signal)); }
  openArchive(file: Blob, options: { discardUnsaved?: boolean } = {}): Promise<void> { return this.trackJob(this.openArchiveNow(file, options)); }
  private async openArchiveNow(file: Blob, options: { discardUnsaved?: boolean }): Promise<void> {
    this.assertEditable(); const token = ++this.operation; this.operationAbort?.abort(); const abort = this.operationAbort = new AbortController(); this.busy = true; this.setBusy();
    try { const bundle = await readArchive(file, abort.signal); await this.ensureSaved(options.discardUnsaved); abort.signal.throwIfAborted(); if (token !== this.operation || this.closed) return; this.busy = false; await this.storage.adopt(bundle.project).catch(() => {}); this.replace(bundle); await this.compile(); }
    finally { if (token === this.operation) { this.busy = false; this.operationAbort = null; this.setBusy(); } }
  }
  importFiles(files: Iterable<File>): Promise<void> { return this.trackJob(this.importFilesNow(files)); }
  private async importFilesNow(files: Iterable<File>): Promise<void> {
    this.assertEditable(); const list = [...files]; if (!list.length) return; const token = ++this.operation, abort = this.operationAbort = new AbortController(); this.busy = true; this.setBusy(); const staged: { asset: EditorProject['assets'][number]; file: File }[] = [];
    try {
      let plannedBytes = this.project.assets.reduce((n, a) => n + a.size, 0);
      for (const file of list) { this.status(`Inspecting ${file.name}…`); try { if (plannedBytes + file.size > LIMITS.totalBytes || this.project.assets.length + staged.length >= LIMITS.entries - 1) throw new Error('Import exceeds the project media budget (512 MiB or 2,047 assets). Remove unused assets or import fewer files.'); const asset = await inspectFile(file, abort.signal); staged.push({ asset, file }); plannedBytes += file.size; } catch (e) { abort.signal.throwIfAborted(); this.diagnostic(e, 'import'); } }
      abort.signal.throwIfAborted(); if (this.closed || token !== this.operation) return;
      for (const { asset, file } of staged) this.assets[asset.id] = file;
      this.busy = false; try { if (staged.length) this.updateProject(p => p.assets.push(...staged.map(x => x.asset))); } catch (e) { for (const { asset } of staged) if (!this.project.assets.some(a => a.id === asset.id)) delete this.assets[asset.id]; throw e; } this.panel = 'media'; this.renderPanel(); this.status(`Imported ${staged.length} of ${list.length} files. Select a file to insert it at the playhead.`);
    } finally { if (token === this.operation) { this.busy = false; this.operationAbort = null; this.setBusy(); } }
  }
  listTemplates(): Promise<EditorTemplate[]> { if (this.closed) return Promise.reject(new Error('Editor is destroyed.')); return this.trackJob(this.storage.listTemplates().then(items => [...builtinTemplates, ...items])); }
  private refreshTemplates(): void { void this.listTemplates().then(items => { this.templates = items; if (this.panel === 'templates' && !this.closed) this.renderPanel(); }).catch(e => this.diagnostic(e, 'templates')); }
  async saveTemplate(name: string): Promise<void> { this.assertEditable(); await this.trackJob(this.storage.saveTemplate({ project: this.getProject(), assets: this.getAssets() }, name)); if (!this.closed) this.refreshTemplates(); }
  loadTemplate(id: string, options: { discardUnsaved?: boolean } = {}): Promise<void> { return this.trackJob(this.loadTemplateNow(id, options)); }
  private async loadTemplateNow(id: string, options: { discardUnsaved?: boolean }): Promise<void> { this.assertEditable(); const token = ++this.operation, bundle = isBuiltinTemplate(id) ? { project: builtinProject(id), assets: {} } : await this.storage.loadTemplate(id); if (this.closed || token !== this.operation) return; await this.loadProject(freshProject(bundle.project), bundle.assets, options); }
  importSubtitles(file: Blob, _format?: 'srt' | 'vtt'): Promise<void> { return this.trackJob(this.importSubtitlesNow(file)); }
  private async importSubtitlesNow(file: Blob): Promise<void> { this.assertEditable(); if (file.size > 8 * 1024 * 1024) throw new Error('Subtitle metadata exceeds 8 MiB.'); const token = this.operation; const cues = parseSubtitles(await file.text(), this.project.fps); this.assertEditable(); if (token !== this.operation) return; this.updateProject(p => { const track = p.tracks.find(t => t.kind === 'caption' && !t.locked) ?? { id: uid('track'), name: 'Captions', kind: 'caption' as const }; if (!p.tracks.includes(track)) p.tracks.unshift(track); p.clips.push(...cues.map(cue => makeCaption(p, track.id, cue.start, cue.end - cue.start, cue.text))); p.duration = Math.max(p.duration, endFrame(p)); }); this.panel = 'captions'; this.renderPanel(); }
  exportSubtitles(format: 'srt' | 'vtt' = 'srt'): Blob { return subtitleBlob(this.project, format); }
  async exportStill(frame = this.frame): Promise<Blob> { this.assertEditable(); return this.trackJob(this.engine.still(this.getProject(), this.getAssets(), frame, this.lifetime.signal)); }
  async preflightExport(options: VideoExportOptions = {}) { if (this.closed) throw new Error('Editor is destroyed.'); return this.trackJob(this.engine.preflight(this.getProject(), this.getAssets(), { ...options, signal: options.signal ? AbortSignal.any([options.signal, this.lifetime.signal]) : this.lifetime.signal })); }
  async exportVideo(options: VideoExportOptions = {}): Promise<VideoExportResult> { const result = await this.exportToTarget({ kind: 'memory' }, options); if (result.kind !== 'blob') throw new Error('Expected Blob export.'); return result; }
  async exportToTarget(target: EditorOutputTarget, options: VideoExportOptions = {}): Promise<TargetExportResult> {
    this.assertEditable(); this.pause(); this.exportAbort = new AbortController(); const abort = this.exportAbort, cancel = () => abort.abort(); options.signal?.addEventListener('abort', cancel, { once: true }); if (options.signal?.aborted) abort.abort(); this.setBusy();
    const task = this.engine.exportTarget(this.getProject(), this.getAssets(), target, { ...options, signal: abort.signal }, (phase, completedFrames, totalFrames) => { this.emit({ type: 'export', phase, completedFrames, totalFrames }); this.status(`${phase} · ${completedFrames} / ${totalFrames} frames`); const progress = this.dialog?.querySelector<HTMLProgressElement>('progress'); if (progress) { progress.max = totalFrames || 1; progress.value = completedFrames; } }); this.exportTask = task;
    try { const result = await task; if (result.kind === 'opfs') this.cleanups.add(result.cleanup); return result; }
    catch (error) { if (abort.signal.aborted || (error as Error).name === 'AbortError') { this.status('Export cancelled. You can continue editing.'); this.emit({ type: 'export', phase: 'cancelled', completedFrames: 0, totalFrames: options.range ? options.range.toExclusive - options.range.from : this.project.duration }); } throw error; }
    finally { options.signal?.removeEventListener('abort', cancel); this.exportAbort = null; this.exportTask = null; this.setBusy(); }
  }
  getPerformanceMetrics(): { samples: number; pointerFeedbackP95Ms: number } { const sorted = [...this.pointer.samples].sort((a, b) => a - b); return { samples: sorted.length, pointerFeedbackP95Ms: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] ?? 0 }; }
  async destroy(): Promise<void> { if (this.destruction) return this.destruction; this.destruction = this.destroyNow(); return this.destruction; }
  private async destroyNow(): Promise<void> {
    this.closed = true; this.appearance.destroy(); this.operation++; this.operationAbort?.abort(); this.exportAbort?.abort(); this.lifetime.abort(); this.pointer.cancel(); this.resizeObserver.disconnect(); clearTimeout(this.compileTimer); clearTimeout(this.saveTimer); this.closeDialog();
    if (clipboard?.owner === this.identity) clipboard = null;
    try { await this.flushSave(); } catch { /* Save event already exposes failure; document is never replaced during destruction. */ }
    await Promise.allSettled([...this.jobs, ...(this.exportTask ? [this.exportTask] : [])]); await this.media.destroy(); await this.engine.destroy(); await Promise.allSettled([...this.cleanups].map(cleanup => cleanup())); this.cleanups.clear(); this.storage.close(); for (const timer of this.deferred) clearTimeout(timer); this.deferred.clear(); for (const url of this.urls) URL.revokeObjectURL(url); this.urls.clear(); this.assets = {}; this.store.clearHistory(); this.archivedDocument = null; this.root.remove();
  }
  private selectedClips(): EditorClip[] { return this.project.clips.filter(c => this.selection.ids.has(c.id)); }
  private render(): void {
    const name = this.ref<HTMLInputElement>('project-name'); if (document.activeElement !== name) name.value = this.project.name;
    this.ref('format').textContent = `${this.project.width} × ${this.project.height} · ${this.project.fps} fps`;
    this.ref('screen').style.aspectRatio = `${this.project.width} / ${this.project.height}`;
    this.ref('empty').hidden = !!this.project.clips.length; this.renderPanel(); this.renderInspector(); this.renderTimeline(); this.updateFrame(); this.fitCanvas(); this.setBusy();
    this.root.querySelector<HTMLButtonElement>('[data-action="undo"]')!.disabled = !this.store.canUndo;
    this.root.querySelector<HTMLButtonElement>('[data-action="redo"]')!.disabled = !this.store.canRedo;
  }
  private renderPanel(): void {
    this.ref('panel-title').textContent = this.panel[0].toUpperCase() + this.panel.slice(1);
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-panel]')) { const active = b.dataset.panel === this.panel; b.classList.toggle('is-active', active); b.setAttribute('aria-pressed', String(active)); }
    const scroll = this.ref('panel').scrollTop;
    this.ref('panel').innerHTML = sidebarHTML(this.panel, this.project, this.selection.ids, this.assets, this.media, this.ref<HTMLInputElement>('search').value, this.templates, this.placement); this.ref('panel').scrollTop = scroll;
    this.highlightTrack();
    this.requestVisibleMedia();
  }
  private requestVisibleMedia(): void { const ids = new Set<string>(); for (const el of this.root.querySelectorAll<HTMLElement>('.he-asset, [data-clip]')) { const r = el.getBoundingClientRect(), viewport = (el.closest('.he-browser-body,.he-timeline-scroll') as HTMLElement | null)?.getBoundingClientRect(); if (!viewport || r.bottom < viewport.top || r.top > viewport.bottom || r.right < viewport.left || r.left > viewport.right) continue; const c = el.dataset.clip && this.project.clips.find(c => c.id === el.dataset.clip); if (c && hasMedia(c)) ids.add(c.assetId); else if (el.dataset.asset) ids.add(el.dataset.asset); if (ids.size >= 64) break; } for (const id of ids) { const asset = this.project.assets.find(a => a.id === id); if (asset && this.assets[id]) this.media.request(asset, this.assets[id]); } }
  private renderTimeline(): void { this.timeline.render(this.project, this.selection.ids, this.frame, this.expanded); this.highlightTrack(); this.requestVisibleMedia(); }
  private highlightTrack(): void { for (const el of this.root.querySelectorAll<HTMLElement>('[data-action="select-track"]')) { el.classList.toggle('is-active', el.dataset.track === this.selectedTrack); el.setAttribute('aria-pressed', String(el.dataset.track === this.selectedTrack)); } }
  private inspectorHasInputFocus(): boolean { return !!this.ref('inspector').querySelector('input:focus,select:focus,textarea:focus'); }
  private renderInspector(force = false): void {
    // A blur/change occurs before the clicked control's click. Keep that control alive.
    if (!force && (this.committingInspector || this.clickingInspector)) { this.inspectorNeedsRefresh = true; return; }
    this.inspectorNeedsRefresh = false;
    const el = this.ref('inspector'), scroll = el.scrollTop, clips = this.selectedClips(), active = document.activeElement as HTMLInputElement | null, focused = active && el.contains(active) ? active.dataset.field : null; let caret: number | null = null; try { caret = active?.selectionStart ?? null; } catch {} if (clips[0] && !motionProperties(clips[0]).includes(this.motionProperty)) this.motionProperty = motionProperties(clips[0])[0];
    this.ref('selection-count').textContent = clips.length ? `${clips.length} selected` : '';
    for (const [action, active] of [['inspector-properties', !this.animated], ['inspector-animation', this.animated]] as const) { const button = this.root.querySelector(`[data-action="${action}"]`); button?.classList.toggle('is-active', active); button?.setAttribute('aria-pressed', String(active)); }
    const node = this.previewRevision === this.store.revision ? this.inspectFrame().nodes.find(n => n.id === clips[0]?.id) : undefined;
    if (this.animated && clips[0] && this.keyId === null) this.keyId = clips[0].animations?.find(ch => ch.property === this.motionProperty)?.keyframes.find(k => k.frame === this.frame - clips[0].start + (clips[0].animationOffset ?? 0))?.id ?? null;
    this.restoringFocus = true; el.innerHTML = inspectorHTML(this.project, clips, this.frame, this.animated, this.autoKey, this.motionProperty, this.keyId, node); el.scrollTop = scroll;
    if (focused) { const replacement = el.querySelector<HTMLInputElement>(`[data-field="${focused}"]`); replacement?.focus({ preventScroll: true }); if (caret !== null) try { replacement?.setSelectionRange(caret, caret); } catch {} }
    this.restoringFocus = false;
  }
  private updateFrame(): void {
    this.timeline.setFrame(this.frame); this.ref('time').textContent = describeTime(this.frame, this.project.fps); this.ref('duration').textContent = `/ ${describeTime(this.project.duration, this.project.fps)}`; this.ref('frame-label').textContent = `FRAME ${this.frame} / ${this.project.duration - 1}`;
    const play = this.root.querySelector('[data-action="play"]')!; play.innerHTML = `${icon(this.playing ? 'pause' : 'play')}<span>${this.playing ? 'Pause' : 'Play'}</span>`; play.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
    if (this.playing) this.ref('overlay').replaceChildren(); else this.renderOverlay();
  }
  private fitCanvas(): void {
    this.root.classList.toggle('he-short', this.root.clientHeight < 680);
    const stage = this.ref('stage'), screen = this.ref('screen'), w = Math.max(80, stage.clientWidth - 32), h = Math.max(60, stage.clientHeight - 32), scale = Math.min(w / this.project.width, h / this.project.height);
    screen.style.width = `${this.project.width * scale}px`; screen.style.height = `${this.project.height * scale}px`; screen.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.canvasZoom})`; this.renderOverlay();
    const zoom = this.ref<HTMLSelectElement>('canvas-zoom'), exact = zoom.querySelector<HTMLOptionElement>(`option[value="${this.canvasZoom}"]`);
    if (exact) zoom.value = String(this.canvasZoom); else { const custom = zoom.querySelector<HTMLOptionElement>('option[value="custom"]')!; custom.textContent = `${Math.round(this.canvasZoom * 100)}%`; zoom.value = 'custom'; }
  }
  private renderOverlay(nodes?: EditorFrameNode[]): void {
    const overlay = this.ref('overlay'); if (this.playing || this.previewRevision !== this.store.revision && !nodes) { overlay.replaceChildren(); return; }
    const selected = (nodes ?? this.inspectFrame().nodes).filter(n => this.selection.ids.has(n.id) && n.corners?.length === 4 && !this.project.tracks.find(t => t.id === this.project.clips.find(c => c.id === n.id)?.trackId)?.locked);
    const rect = this.ref('screen').getBoundingClientRect(), sx = rect.width / this.project.width, sy = rect.height / this.project.height;
    overlay.innerHTML = `<svg viewBox="0 0 ${this.project.width} ${this.project.height}" preserveAspectRatio="none">${selected.map(n => `<polygon points="${n.corners.map(p => `${p.x},${p.y}`).join(' ')}"/>`).join('')}</svg>` + selected.map(n => { const pts = n.corners; const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2; return pts.map((p, i) => `<button class="he-handle" data-handle="${i}" data-handle-clip="${n.id}" style="left:${p.x / this.project.width * 100}%;top:${p.y / this.project.height * 100}%" aria-label="Resize ${esc(this.project.clips.find(c => c.id === n.id)?.name)} corner ${i + 1}"></button>`).join('') + `<button class="he-rotate-handle" data-handle="rotate" data-handle-clip="${n.id}" style="left:${cx / this.project.width * 100}%;top:calc(${cy / this.project.height * 100}% - ${24 / this.canvasZoom}px)" aria-label="Rotate layer">${icon('rotate')}</button>`; }).join('');
    overlay.style.setProperty('--handle-size', `${8 / this.canvasZoom}px`); void sx; void sy;
  }
  private audioLevel(peak: number, clipped: number): void { const meter = this.ref('audio-level'); meter.classList.toggle('he-clipping', clipped > 0 || peak > 1); meter.querySelector('i')!.style.width = `${Math.min(1, peak) * 55}px`; meter.querySelector('small')!.textContent = peak > 0 ? `${(20 * Math.log10(peak)).toFixed(1)} dB${clipped ? ' CLIP' : ''}` : '−∞ dB'; }
  private setBusy(): void { this.root.classList.toggle('he-busy', this.busy || !!this.exportAbort); for (const field of this.dialog?.querySelectorAll<HTMLInputElement | HTMLButtonElement>('[name^="export-"],[data-action="start-export"],[data-action="preflight"]') ?? []) field.disabled = !!this.exportAbort; let cancel = this.root.querySelector<HTMLButtonElement>('.he-cancel-operation'); if (this.busy || this.exportAbort) { if (!cancel) { cancel = document.createElement('button'); cancel.className = 'he-cancel-operation'; cancel.dataset.action = 'cancel-operation'; cancel.textContent = 'Cancel operation'; this.root.append(cancel); } } else cancel?.remove(); }
  private bind(): void {
    const signal = this.lifetime.signal;
    document.addEventListener('pointerdown', e => { if (!(e.target as HTMLElement).closest('.he-appearance') || !this.root.contains(e.target as Node)) this.closeAppearance(); }, { signal, capture: true });
    this.root.addEventListener('focusout', e => { if ((e.target as HTMLElement).closest('.he-appearance') && !(e.relatedTarget instanceof Node && this.root.querySelector('.he-appearance')!.contains(e.relatedTarget))) this.closeAppearance(); }, { signal });
    this.ref('panel').addEventListener('scroll', () => this.requestVisibleMedia(), { signal, passive: true });
    this.root.addEventListener('focusin', e => { const el = e.target as HTMLElement; if (!this.restoringFocus && el.dataset.field && !el.closest('dialog')) this.store.beginGroup(`${this.getSelection().join(',')}/${el.dataset.field}`); }, { signal });
    this.root.addEventListener('focusout', () => { if (!this.restoringFocus) this.store.endGroup(); }, { signal });
    this.root.addEventListener('click', e => { this.clickingInspector = false; const target = e.target as HTMLElement; if (this.pointer.moved && target.closest('[data-clip]')) { this.pointer.moved = false; return; } const action = target.closest<HTMLElement>('[data-action]'); if (action) { e.preventDefault(); this.run(this.action(action.dataset.action!, action).finally(() => { if (!this.closed && this.inspectorNeedsRefresh && !this.ref('inspector').querySelector('input:focus,select:focus,textarea:focus')) this.renderInspector(); })); return; } const selected = target.closest<HTMLElement>('[data-select]'); if (selected) { const m = e as MouseEvent; if (m.ctrlKey || m.metaKey || m.shiftKey) { this.selection.toggle(selected.dataset.select!, this.project); this.setSelection(this.getSelection()); } else this.setSelection([selected.dataset.select!]); if (this.panel === 'captions') this.run(this.seek(this.project.clips.find(c => c.id === selected.dataset.select)!.start)); } }, { signal });
    this.root.addEventListener('change', e => { const target = e.target as HTMLInputElement; this.committingInspector = !!target.dataset.field && !target.closest('dialog'); let task: Promise<void>; try { task = this.change(target); } finally { this.committingInspector = false; } this.run(task.catch(error => { if (target.dataset.field && !target.closest('dialog')) this.renderInspector(); if (target.matches('[data-project="name"]')) target.value = this.project.name; throw error; })); }, { signal });
    this.root.addEventListener('input', e => { const el = e.target as HTMLInputElement; if (el === this.ref('search')) this.renderPanel(); if (el === this.ref('zoom')) { this.timeline.zoom = Number(el.value); this.renderTimeline(); } }, { signal });
    this.root.addEventListener('keydown', e => this.keydown(e), { signal });
    this.root.addEventListener('pointerdown', e => this.pointerDown(e), { signal });
    this.root.addEventListener('pointermove', e => this.pointer.move(e), { signal });
    this.root.addEventListener('pointerup', e => { try { this.pointerEnd(e); } catch (error) { this.diagnostic(error, 'edit'); this.renderTimeline(); this.renderOverlay(); } }, { signal });
    this.root.addEventListener('pointercancel', () => { this.pointer.cancel(); this.renderTimeline(); this.renderOverlay(); this.ref('guides').replaceChildren(); }, { signal });
    this.root.addEventListener('dragstart', e => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-asset]'); if (el) e.dataTransfer?.setData('application/x-htmv-asset', el.dataset.asset!); }, { signal });
    this.root.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files') || e.dataTransfer?.types.includes('application/x-htmv-asset')) e.preventDefault(); }, { signal });
    this.root.addEventListener('drop', e => { e.preventDefault(); if (this.busy || this.exportAbort) return; if (e.dataTransfer?.files.length) this.run(this.importFiles(e.dataTransfer.files)); else { const asset = e.dataTransfer?.getData('application/x-htmv-asset'); if (asset) { const lane = (e.target as HTMLElement).closest<HTMLElement>('[data-lane]'); try { this.insertAsset(asset, lane?.dataset.lane, lane ? this.timeline.frameAt(e.clientX) : this.frame); } catch (error) { this.diagnostic(error); } } } }, { signal });
    this.ref('stage').addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); this.canvasZoom = Math.min(5, Math.max(.25, this.canvasZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); this.fitCanvas(); }, { passive: false, signal });
    this.ref('save').addEventListener('click', () => { this.run(this.recoveryDialog()); }, { signal });
  }
  private async change(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): Promise<void> {
    if (el.dataset.appearanceChoice) { this.setAppearance(el.value as EditorAppearance); return; }
    if (el === this.ref('file')) { const input = el as HTMLInputElement; const files = [...input.files ?? []]; input.value = ''; await this.importFiles(files); return; }
    if (el === this.ref('archive')) { const input = el as HTMLInputElement, file = input.files?.[0]; input.value = ''; if (file) await this.switchUI(async () => { await this.openArchive(file); }); return; }
    if (el === this.ref('subtitles')) { const input = el as HTMLInputElement, file = input.files?.[0]; input.value = ''; if (file) await this.importSubtitles(file); return; }
    if (el === this.ref('replacement')) { const input = el as HTMLInputElement, file = input.files?.[0], id = this.replacement; input.value = ''; if (file && id) await this.replaceAsset(id, file); return; }
    if (el.matches('[data-project="name"]')) { this.updateProject(p => { p.name = el.value; }); return; }
    if (el.dataset.ref === 'placement') { this.placement = el.value; return; }
    if (el.dataset.ref === 'canvas-zoom') { if (el.value === 'custom') return; this.canvasZoom = Number(el.value); this.fitCanvas(); return; }
    if (el.matches('[data-auto-key]')) { this.autoKey = (el as HTMLInputElement).checked; return; }
    if (!el.dataset.field || el.closest('dialog')) return;
    const name = el.dataset.field; if (name === 'motion-property') { this.motionProperty = el.value as MotionProperty; this.keyId = null; this.renderInspector(true); return; }
    if (name.startsWith('key-')) { this.editKey(name, el.value); return; }
    const value = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el instanceof HTMLInputElement && el.type === 'number' ? Number(el.value) : el.value;
    this.patchSelection({ [name]: value });
  }
  private patchSelection(changes: Record<string, unknown>): void {
    this.assertEditable(); const ids = this.getSelection(); if (!ids.length) return; const changed = this.store.update(p => { for (const id of ids) { const c = p.clips.find(c => c.id === id)!; for (const [name, value] of Object.entries(changes)) {
      if (name === 'start') { applyCommand(p, { type: 'move', ids: [id], delta: Number(value) - c.start }); continue; }
      if (name === 'duration') { applyCommand(p, { type: 'trim', id, edge: 'right', delta: Number(value) - c.duration }); continue; }
      const prop = name === 'fill' ? 'background' : name as MotionProperty;
      if (motionProperties(c).includes(prop) && (this.autoKey || c.animations?.some(ch => ch.property === prop))) applyCommand(p, { type: 'keyframe', id, property: prop, frame: this.frame - c.start, value: value as number | string });
      else applyCommand(p, { type: 'patch', ids: [id], changes: { [name]: value } });
    } } }, this.assets); if (changed) this.changed();
  }
  private async action(action: string, el: HTMLElement): Promise<void> {
    this.dialog?.querySelector('[data-dialog-error]')?.remove();
    const ids = this.getSelection(), c = this.selectedClips()[0], t = this.project.tracks.find(t => t.id === el.dataset.track);
    if (action === 'cancel-operation') { this.operation++; this.operationAbort?.abort(); this.operationAbort = null; this.busy = false; this.exportAbort?.abort(); this.setBusy(); this.status('Operation cancelled.'); return; }
    if (action === 'close-dialog') { this.pendingSwitch = null; this.closeDialog(); return; }
    if (action === 'panel') { this.panel = el.dataset.panel as Panel; this.ref<HTMLInputElement>('search').value = ''; this.renderPanel(); return; }
    if (action === 'show-templates') { this.panel = 'templates'; this.renderPanel(); return; }
    if (action === 'inspector-properties' || action === 'inspector-animation') { this.animated = action === 'inspector-animation'; this.renderInspector(); return; }
    if (action === 'pan') { this.panMode = !this.panMode; el.classList.toggle('is-active', this.panMode); return; }
    if (action === 'fit') { this.pan = { x: 0, y: 0 }; this.canvasZoom = 1; this.ref<HTMLSelectElement>('canvas-zoom').value = '1'; this.fitCanvas(); return; }
    if (action === 'snapping') { this.snapping = !this.snapping; el.classList.toggle('is-active', this.snapping); el.setAttribute('aria-pressed', String(this.snapping)); return; }
    if (action === 'import') { this.ref<HTMLInputElement>('file').click(); return; }
    if (action === 'open-archive') { this.ref<HTMLInputElement>('archive').click(); return; }
    if (action === 'play') { if (this.playing) this.pause(); else await this.play(); return; }
    if (action === 'previous' || action === 'next') { this.pause(); await this.seek(this.frame + (action === 'next' ? 1 : -1)); return; }
    if (action === 'seek-marker') { this.pause(); await this.seek(Number(el.dataset.frame)); return; }
    if (action === 'undo') return this.undo(); if (action === 'redo') return this.redo();
    if (action === 'split') return this.dispatch({ type: 'split', ids, frame: this.frame });
    if (action === 'duplicate') return this.dispatch({ type: 'duplicate', ids });
    if (action === 'delete') return this.dispatch({ type: 'remove', ids });
    if (action === 'group' || action === 'ungroup') return this.dispatch({ type: action, ids });
    if (action === 'align') return this.dispatch({ type: 'align', ids, mode: el.dataset.align as Extract<EditorCommand, { type: 'align' }>['mode'] });
    if (action === 'preset') { this.dispatch({ type: 'preset', ids, preset: el.dataset.preset as 'fade' }); for (const id of ids) this.expanded.add(id); this.animated = true; this.renderInspector(); this.renderTimeline(); return; }
    if (action === 'toggle-keys') { for (const id of ids) if (this.expanded.has(id)) this.expanded.delete(id); else this.expanded.add(id); this.renderTimeline(); return; }
    if (action === 'add-text' || action.startsWith('add-rectangle') || action === 'add-ellipse' || action === 'add-line' || action === 'add-shape' || action === 'add-caption') { this.insertNew(action === 'add-text' ? 'text' : action === 'add-caption' ? 'caption' : 'shape', action === 'add-ellipse' ? 'ellipse' : action === 'add-line' ? 'line' : 'rectangle'); return; }
    if (action === 'add-track' || action === 'add-audio-track') { this.updateProject(p => { const track: EditorTrack = { id: uid('track'), name: action === 'add-track' ? 'New layer' : 'Audio', kind: action === 'add-track' ? 'visual' : 'audio' }; p.tracks.unshift(track); this.selectedTrack = track.id; }); return; }
    if (action === 'insert-asset') { this.insertAsset(el.dataset.asset!); return; }
    if (action === 'replace-asset') { this.replacement = el.dataset.asset!; this.ref<HTMLInputElement>('replacement').click(); return; }
    if (action === 'remove-unused') { this.updateProject(p => { p.assets = p.assets.filter(a => p.clips.some(c => hasMedia(c) && c.assetId === a.id || isText(c) && c.fontFamily === a.family)); }); return; }
    if (action === 'asset-info') { const a = this.project.assets.find(a => a.id === el.dataset.asset)!; this.showDialog(a.name, `<dl>${Object.entries(a).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`); return; }
    if (action === 'toggle-hidden' || action === 'toggle-lock' || action === 'toggle-muted' || action === 'toggle-solo') { const key = { 'toggle-hidden': 'hidden', 'toggle-lock': 'locked', 'toggle-muted': 'muted', 'toggle-solo': 'solo' }[action] as 'hidden'; if (t) this.updateProject(p => { const track = p.tracks.find(x => x.id === t.id)!; track[key] = !track[key]; }); return; }
    if (action === 'track-menu' && t) { this.trackDialog(t); return; }
    if (action === 'select-track' && t) { this.selectedTrack = t.id; this.highlightTrack(); this.status(`Selected track: ${t.name}. Choose Selected track placement to insert here.`); return; }
    if (action === 'rename-track' && t) { this.selectedTrack = t.id; this.trackDialog(t); return; }
    if (action === 'apply-track') { this.applyTrack(); return; }
    if (action === 'delete-track') { const id = el.dataset.track!; this.updateProject(p => { const clipIds = p.clips.filter(c => c.trackId === id).map(c => c.id); applyCommand(p, { type: 'remove', ids: clipIds }); p.tracks = p.tracks.filter(t => t.id !== id); }); this.closeDialog(); return; }
    if (action === 'move-track') { const id = el.dataset.track!, delta = Number(el.dataset.delta); this.updateProject(p => { const from = p.tracks.findIndex(t => t.id === id), to = Math.max(0, Math.min(p.tracks.length - 1, from + delta)); p.tracks.splice(to, 0, p.tracks.splice(from, 1)[0]); }); this.closeDialog(); return; }
    if (action === 'add-marker') { this.showDialog('New marker', `${field('Name', 'marker-name', `Marker ${this.project.markers.length + 1}`, 'text')}${button('commit-marker', 'Add at playhead', 'marker', 'class="he-primary"')}`); return; }
    if (action === 'commit-marker') { this.dispatch({ type: 'marker', frame: this.frame, name: this.dialogValue('marker-name') }); this.closeDialog(); return; }
    if (action === 'remove-marker') { this.updateProject(p => { p.markers = p.markers.filter(m => m.id !== el.dataset.marker); }); return; }
    if (action === 'add-transition' || action === 'edit-transition') { this.transitionDialog(el.dataset.transition); return; }
    if (action === 'apply-transition') { this.applyTransition(); return; }
    if (action === 'remove-transition') { this.updateProject(p => { p.transitions = p.transitions.filter(t => t.id !== el.dataset.transition); }); this.closeDialog(); return; }
    if (action === 'add-key') { if (c) { this.dispatch({ type: 'keyframe', id: c.id, property: this.motionProperty, frame: this.frame - c.start, value: propertyValue(c, this.motionProperty, this.inspectFrame().nodes.find(n => n.id === c.id)) }); this.expanded.add(c.id); this.renderTimeline(); this.renderInspector(); } return; }
    if (action === 'select-key') { this.keyId = el.dataset.key!; const key = c?.animations?.find(ch => ch.property === this.motionProperty)?.keyframes.find(k => k.id === this.keyId); if (key && c) await this.seek(c.start + key.frame - (c.animationOffset ?? 0)); this.renderInspector(); return; }
    if (action === 'previous-key' || action === 'next-key') { if (!c) return; const frames = (c.animations?.find(ch => ch.property === this.motionProperty)?.keyframes ?? []).map(k => c.start + k.frame - (c.animationOffset ?? 0)).sort((a, b) => a - b); const f = action === 'next-key' ? frames.find(f => f > this.frame) : frames.findLast(f => f < this.frame); if (f !== undefined) { this.keyId = null; await this.seek(f); } return; }
    if (action === 'copy-key' || action === 'delete-key') { const key = c?.animations?.find(ch => ch.property === this.motionProperty)?.keyframes.find(k => k.id === this.keyId); if (key) { if (action === 'copy-key') copiedKey = clone(key); else this.dispatch({ type: 'remove-keyframe', id: c!.id, property: this.motionProperty, keyframeId: key.id }); } return; }
    if (action === 'paste-key') { if (c && copiedKey) this.dispatch({ type: 'keyframe', id: c.id, property: this.motionProperty, frame: this.frame - c.start, value: copiedKey.value, easing: copiedKey.easing }); return; }
    if (action === 'import-subtitles') { this.ref<HTMLInputElement>('subtitles').click(); return; }
    if (action === 'export-srt' || action === 'export-vtt') { const ext = action === 'export-srt' ? 'srt' : 'vtt'; this.download(this.exportSubtitles(ext), `${this.project.name}.${ext}`); return; }
    if (action === 'save-template') { this.showDialog('Save local template', `${field('Template name', 'template-name', this.project.name, 'text')}${button('commit-template', 'Save template', 'template', 'class="he-primary"')}`); return; }
    if (action === 'commit-template') { await this.saveTemplate(this.dialogValue('template-name')); this.closeDialog(); this.panel = 'templates'; this.renderPanel(); return; }
    if (action === 'load-template') { await this.switchUI(async token => { const id = el.dataset.template!; const bundle = isBuiltinTemplate(id) ? { project: builtinProject(id), assets: {} } : await this.storage.loadTemplate(id); if (token !== this.operation || this.closed) return; this.replace({ project: freshProject(bundle.project), assets: bundle.assets }); await this.compile(); this.closeDialog(); }); return; }
    if (action === 'projects') { await this.projectsDialog(); return; }
    if (action === 'new-project') { await this.switchUI(async () => { this.replace({ project: createProject(), assets: {} }); this.closeDialog(); await this.compile(); }); return; }
    if (action === 'open-project') { await this.switchUI(async token => { const bundle = await this.storage.load(el.dataset.key!); if (token !== this.operation || this.closed) return; this.replace(bundle); this.savedDocument = this.project; this.saveStatus('saved', 'All changes saved'); this.closeDialog(); await this.compile(); }); return; }
    if (action === 'duplicate-project') { const bundle = el.dataset.key === `${this.storage.namespace}/${this.project.id}` ? { project: this.getProject(), assets: this.getAssets() } : await this.storage.load(el.dataset.key!); bundle.project = freshProject(bundle.project, `${bundle.project.name} copy`); await this.storage.save(bundle.project, bundle.assets); await this.projectsDialog(); return; }
    if (action === 'trash-project' || action === 'restore-project') { const key = el.dataset.key!; if (key === `${this.storage.namespace}/${this.project.id}`) throw new Error('Open another project before moving this project to recovery.'); await this.storage.trash(key, action === 'restore-project'); await this.projectsDialog(); return; }
    if (action === 'rename-saved') { this.showDialog('Rename saved project', `${field('Name', 'saved-name', el.dataset.name!, 'text')}${button('commit-saved-name', 'Rename', undefined, `data-key="${esc(el.dataset.key)}"`)}`); return; }
    if (action === 'commit-saved-name') { const name = this.dialogValue('saved-name'); if (el.dataset.key === `${this.storage.namespace}/${this.project.id}`) { this.updateProject(p => { p.name = name; }); await this.flushSave(); } else await this.storage.rename(el.dataset.key!, name); await this.projectsDialog(); return; }
    if (action === 'save') { await this.downloadProject(); return; }
    if (action === 'storage') { const usage = await this.storage.usage(); this.showDialog('Local storage', `<p>${bytes(usage.usage)} used of approximately ${bytes(usage.quota)} available on this origin.</p><p>Browser data can be cleared by the browser or device. Keep portable .htmv archives for important work.</p>${button('save', 'Download portable project', 'download')}${button('retry-save', 'Retry autosave')}`); return; }
    if (action === 'retry-save') { await this.flushSave(); this.closeDialog(); return; }
    if (action === 'save-copy') { await this.saveCopy(); this.closeDialog(); return; }
    if (action === 'reopen-saved') { await this.switchUI(async token => { const bundle = await this.storage.load(`${this.storage.namespace}/${this.project.id}`); if (token !== this.operation || this.closed) return; this.replace(bundle); this.savedDocument = this.project; this.saveStatus('saved', 'All changes saved'); this.closeDialog(); await this.compile(); }); return; }
    if (action.endsWith('-switch')) { const next = this.pendingSwitch; if (!next) return; if (action === 'retry-switch') await this.flushSave(); else if (action === 'copy-switch') await this.saveCopy(); else if (action === 'download-switch') await this.downloadProject(); else if (action !== 'discard-switch') return; this.pendingSwitch = null; this.closeDialog(); this.departureAccepted = true; try { await next(); } finally { this.departureAccepted = false; } return; }
    if (action === 'settings') { this.settingsDialog(); return; }
    if (action.startsWith('preset-')) { const preset = action.slice(7), width = preset === 'portrait' || preset === 'square' ? 1080 : 1920, height = preset === 'portrait' ? 1920 : 1080; this.dialog!.querySelector<HTMLInputElement>('[name="project-width"]')!.value = String(width); this.dialog!.querySelector<HTMLInputElement>('[name="project-height"]')!.value = String(height); return; }
    if (action === 'apply-settings') { this.applySettings(); return; }
    if (action === 'export-dialog') { this.exportDialog(); return; }
    if (action === 'preflight') { await this.checkExport(); return; }
    if (action === 'start-export') { await this.startExport(); return; }
    if (action === 'export-still') { this.download(await this.exportStill(), `${this.project.name}-frame-${this.frame}.png`); return; }
    if (action === 'appearance') {
      const menu = this.ref('appearance-menu'); const open = menu.hidden; menu.hidden = !open; el.setAttribute('aria-expanded', String(open));
      if (open) menu.querySelector<HTMLInputElement>('input:checked')?.focus(); return;
    }
    if (action === 'about') this.showDialog('HTMV Editor', `<div class="he-about-brand"><span class="he-brandmark" aria-hidden="true"></span><strong>HTMV Editor</strong></div><p>A local motion graphics workspace, powered by HTMV. Media processing and rendering happen in your browser.</p><p>Desktop Chrome and Edge are the target browsers. Codec and audio synchronization support depend on the engine and browser configuration.</p><p>The keyboard does everything the pointer does — see the shortcut list.</p><div class="he-button-row">${button('shortcuts', 'Keyboard shortcuts', 'keyboard')}</div>`);
    if (action === 'shortcuts') this.showDialog('Keyboard shortcuts', `<p>Most actions live on buttons; these keys skip the mouse. On Mac, use <kbd>⌘</kbd> where it says <kbd>Ctrl</kbd>.</p><div class="he-shortcut-grid">${([['Play / pause', '<kbd>Space</kbd>'], ['Step 1 / 10 frames', '<kbd>←</kbd><kbd>→</kbd> + <kbd>Shift</kbd>'], ['Move selected layers by frames', '<kbd>Alt</kbd> + <kbd>←</kbd>/<kbd>→</kbd>'], ['Undo / redo', '<kbd>Ctrl</kbd><kbd>Z</kbd> / <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Z</kbd>'], ['Select every layer', '<kbd>Ctrl</kbd><kbd>A</kbd>'], ['Copy · cut · paste · duplicate', '<kbd>Ctrl</kbd><kbd>C</kbd><kbd>X</kbd><kbd>V</kbd><kbd>D</kbd>'], ['Group / ungroup', '<kbd>Ctrl</kbd><kbd>G</kbd> / <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>G</kbd>'], ['Split selected layers at playhead', '<kbd>S</kbd>'], ['Delete selection', '<kbd>Del</kbd>'], ['Mark export range start / end', '<kbd>I</kbd> / <kbd>O</kbd>'], ['Download .htmv project file', '<kbd>Ctrl</kbd><kbd>S</kbd>'], ['Select the focused clip', '<kbd>Enter</kbd>'], ['Cancel a drag, close a dialog', '<kbd>Esc</kbd>'], ['Resize a panel', 'arrow keys on its divider'], ['Drag without snapping', 'hold <kbd>Alt</kbd>']] as const).map(([label, keys]) => `<span>${label}</span><span class="he-kbd-row">${keys}</span>`).join('')}</div>`);
  }
  private insertNew(kind: 'text' | 'shape' | 'caption', shape: ShapeClip['shape'] = 'rectangle'): void {
    let id = ''; this.updateProject(p => {
      const trackKind = kind === 'caption' ? 'caption' : 'visual'; let track = this.placement === 'selected' ? p.tracks.find(t => t.id === this.selectedTrack) : undefined;
      if (this.placement === 'selected' && !track) throw new Error('Select a track in the Layers panel or timeline, or choose New layer placement.');
      if (track && (track.kind !== trackKind || track.locked)) throw new Error('Select an unlocked, compatible track or choose New layer.');
      if (!track) { track = { id: uid('track'), name: kind === 'text' ? 'Text' : kind === 'caption' ? 'Captions' : shape[0].toUpperCase() + shape.slice(1), kind: trackKind }; p.tracks.unshift(track); }
      const base = { id: uid('clip'), name: kind === 'text' ? 'Your text' : shape[0].toUpperCase() + shape.slice(1), trackId: track.id, start: this.frame, duration: p.fps * 3 };
      const visual = { x: Math.round(p.width * .25), y: Math.round(p.height * .35), width: Math.round(p.width * .5), height: Math.round(p.height * .3), opacity: 1 };
      const clip: EditorClip = kind === 'caption' ? makeCaption(p, track.id, this.frame, p.fps * 2) : kind === 'text' ? { ...base, ...visual, kind, text: 'Your text', fontSize: Math.round(p.height / 10), fontFamily: 'Arial', fontWeight: '700', color: '#ffffff', align: 'center' } : { ...base, ...visual, kind, shape, fill: shape === 'line' ? 'transparent' : '#91dfbd', stroke: '#91dfbd', strokeWidth: shape === 'line' ? 8 : 0, radius: shape === 'rectangle' ? 16 : 0, ...(shape === 'line' ? { height: 8 } : {}) };
      p.clips.push(clip); p.duration = Math.max(p.duration, endFrame(p)); id = clip.id; this.selectedTrack = track.id;
    }); if (id) this.setSelection([id]);
  }
  private insertAsset(assetId: string, trackId?: string, start = this.frame): void {
    const asset = this.project.assets.find(a => a.id === assetId); if (!asset || asset.kind === 'font') return; if (!this.assets[assetId]) throw new Error('Relink the missing media before inserting it.');
    let id = ''; this.updateProject(p => {
      let track = p.tracks.find(t => t.id === (trackId ?? (this.placement === 'selected' ? this.selectedTrack : null)));
      if ((trackId || this.placement === 'selected') && !track) throw new Error('Select a track first or choose New layer placement.');
      const kind = asset.kind === 'audio' ? 'audio' : 'visual'; if (track && (track.locked || track.kind !== kind)) throw new Error('Drop onto an unlocked, compatible track.');
      if (!track) { track = { id: uid('track'), kind, name: asset.name.slice(0, 200) }; p.tracks.unshift(track); }
      const base = { id: uid('clip'), kind: asset.kind, name: asset.name.slice(0, 200), trackId: track.id, start, duration: asset.kind === 'image' ? p.fps * 3 : Math.max(1, Math.floor(asset.duration * p.fps)), assetId };
      const visual = { x: 0, y: 0, width: p.width, height: p.height, opacity: 1, fit: 'contain' as const };
      const clip: EditorClip = asset.kind === 'audio' ? { ...base, kind: 'audio', sourceIn: 0, gain: 1, muted: false } : asset.kind === 'video' ? { ...base, ...visual, kind: 'video', sourceIn: 0, gain: 1, muted: false } : { ...base, ...visual, kind: 'image' };
      p.clips.push(clip); p.duration = Math.max(p.duration, endFrame(p)); id = clip.id; this.selectedTrack = track.id;
    }); if (id) this.setSelection([id]);
  }
  private async replaceAsset(id: string, file: File): Promise<void> {
    this.assertEditable(); const token = ++this.operation, abort = this.operationAbort = new AbortController(); this.busy = true; this.setBusy();
    try { const asset = await inspectFile(file, abort.signal); abort.signal.throwIfAborted(); if (token !== this.operation || this.closed) return; const old = this.project.assets.find(a => a.id === id); if (!old || asset.kind !== old.kind) throw new Error('Replacement media must have the same type as the original.');
      // A new reference keeps the old Blob reachable by undo, including missing-media state.
      const newId = asset.id; this.assets[newId] = file; this.busy = false;
      try { this.updateProject(p => { p.assets.push(asset); for (const c of p.clips) { if (hasMedia(c) && c.assetId === id) c.assetId = newId; if (isText(c) && old.family && c.fontFamily === old.family) c.fontFamily = asset.family!; } p.assets = p.assets.filter(a => a.id !== id); }); } catch (e) { delete this.assets[newId]; throw e; }
      this.media.invalidate(id); this.status('Media replaced. Timing and layer properties were preserved.');
    } finally { if (token === this.operation) { this.busy = false; this.operationAbort = null; this.setBusy(); } }
  }
  private editKey(name: string, value: string): void {
    this.assertEditable();
    const c = this.selectedClips()[0], property = this.motionProperty; if (!c) return; const key = c.animations?.find(ch => ch.property === property)?.keyframes.find(k => k.id === this.keyId) ?? c.animations?.find(ch => ch.property === property)?.keyframes.find(k => k.frame === this.frame - c.start + (c.animationOffset ?? 0)); if (!key) return;
    const changed = this.store.update(p => { const keys = p.clips.find(x => x.id === c.id)!.animations!.find(ch => ch.property === property)!.keyframes, k = keys.find(k => k.id === key.id)!;
      if (name === 'key-frame') k.frame = Math.round(Number(value)) + (c.animationOffset ?? 0);
      if (name === 'key-value') k.value = property === 'color' || property === 'background' ? value : Number(value);
      if (name === 'key-easing') k.easing = value === 'custom' ? 'cubic-bezier(0.25,0.1,0.25,1)' : value;
      if (name === 'key-bezier') { const nums = value.split(',').map(Number); if (nums.length !== 4 || nums.some(n => !Number.isFinite(n)) || nums[0] < 0 || nums[0] > 1 || nums[2] < 0 || nums[2] > 1) throw new Error('Enter four Bézier numbers; x1 and x2 must be between 0 and 1.'); k.easing = `cubic-bezier(${nums.join(',')})`; }
      keys.sort((a, b) => a.frame - b.frame);
    }, this.assets); if (changed) this.changed(); this.keyId = key.id; this.renderInspector();
  }
  private copy(): void { const ids = this.getSelection(); if (!ids.length) return; const project = this.getProject(); project.clips = project.clips.filter(c => ids.includes(c.id)); project.assets = project.assets.filter(a => project.clips.some(c => hasMedia(c) && c.assetId === a.id || isText(c) && c.fontFamily === a.family)); project.tracks = project.tracks.filter(t => project.clips.some(c => c.trackId === t.id)); project.transitions = project.transitions.filter(t => ids.includes(t.incomingId) && ids.includes(t.outgoingId)); project.groups = project.groups.filter(g => project.clips.some(c => c.groupId === g.id)); clipboard = { project, assets: Object.fromEntries(project.assets.map(a => [a.id, this.assets[a.id]])), ids, owner: this.identity }; this.status(`Copied ${ids.length} layers.`); }
  private paste(): void {
    if (!clipboard) return; const source = clipboard, chosen = source.project.clips.filter(c => source.ids.includes(c.id)), min = Math.min(...chosen.map(c => c.start));
    const assetIds = new Set(chosen.flatMap(c => hasMedia(c) ? [c.assetId] : isText(c) ? source.project.assets.filter(a => a.family === c.fontFamily).map(a => a.id) : []));
    for (const id of assetIds) this.assets[id] = source.assets[id]; const selected: string[] = [];
    this.updateProject(p => { for (const a of source.project.assets.filter(a => assetIds.has(a.id))) if (!p.assets.some(x => x.id === a.id)) p.assets.push(clone(a));
      const tracks = new Map<string, string>(), groups = new Map<string, string>(), clipIds = new Map<string, string>();
      for (const clip of chosen) { const c = clone(clip), originalId = c.id; if (!tracks.has(c.trackId)) { const t = source.project.tracks.find(t => t.id === c.trackId)!; const track = { ...clone(t), id: uid('track'), locked: false }; tracks.set(c.trackId, track.id); p.tracks.unshift(track); }
        c.trackId = tracks.get(c.trackId)!; c.id = uid('clip'); clipIds.set(originalId, c.id); c.start = this.frame + c.start - min; for (const ch of c.animations ?? []) for (const k of ch.keyframes) k.id = uid('key');
        if (c.groupId) { const original = c.groupId; if (!groups.has(original)) { const g = { id: uid('group'), name: source.project.groups.find(g => g.id === original)?.name ?? 'Group' }; groups.set(original, g.id); p.groups.push(g); } c.groupId = groups.get(original); }
        p.clips.push(c); selected.push(c.id);
      }
      for (const tr of source.project.transitions) if (clipIds.has(tr.incomingId) && clipIds.has(tr.outgoingId)) p.transitions.push({ ...clone(tr), id: uid('transition'), incomingId: clipIds.get(tr.incomingId)!, outgoingId: clipIds.get(tr.outgoingId)! }); p.duration = Math.max(p.duration, endFrame(p));
    }); this.setSelection(selected);
  }
  private keydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (!this.ref('appearance-menu').hidden && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.closeAppearance(true); return; }
    if (target.closest('.he-appearance,input,textarea,select,[contenteditable="true"]') || e.code === 'Space' && target.closest('button,a')) return;
    if (e.key === 'Escape') { this.pointer.cancel(); this.renderTimeline(); this.renderOverlay(); this.closeDialog(); return; }
    if (this.dialog) return;
    const clipEl = target.closest<HTMLElement>('[data-clip]');
    if (clipEl && (e.key === 'Enter' || e.code === 'Space')) { e.preventDefault(); const id = clipEl.dataset.clip!; if (e.ctrlKey || e.metaKey || e.shiftKey) { this.selection.toggle(id, this.project); this.setSelection(this.getSelection()); } else this.setSelection([id]); return; }
    if (target.matches('[data-resize-panel]') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); const panel = target.dataset.resizePanel!, delta = ['ArrowRight', 'ArrowDown'].includes(e.key) ? 10 : -10; const current = panel === 'timeline' ? this.ref('timeline-scroll').parentElement!.getBoundingClientRect().height : this.root.querySelector<HTMLElement>(panel === 'browser' ? '.he-browser' : '.he-inspector')!.getBoundingClientRect().width; this.resizePanel(panel, current + delta); return; }
    const mod = e.ctrlKey || e.metaKey;
    try {
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); this.run(this.downloadProject()); return; }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); this.setSelection(this.project.clips.filter(c => !this.project.tracks.find(t => t.id === c.trackId)?.locked).map(c => c.id)); return; }
      if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); this.copy(); return; }
      if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); this.copy(); this.dispatch({ type: 'remove', ids: this.getSelection() }); return; }
      if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); this.paste(); return; }
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); this.dispatch({ type: 'duplicate', ids: this.getSelection() }); return; }
      if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); this.dispatch({ type: e.shiftKey ? 'ungroup' : 'group', ids: this.getSelection() }); return; }
      if (e.code === 'Space') { e.preventDefault(); if (this.playing) this.pause(); else this.run(this.play()); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.dispatch({ type: 'remove', ids: this.getSelection() }); return; }
      if (e.key.toLowerCase() === 's' && !mod) { this.dispatch({ type: 'split', ids: this.getSelection(), frame: this.frame }); return; }
      if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); if (e.altKey && this.selection.ids.size) this.dispatch({ type: 'move', ids: this.getSelection(), delta: (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1) }); else { this.pause(); this.run(this.seek(this.frame + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1))); } }
      if (e.key.toLowerCase() === 'i') this.updateProject(p => { p.range = { from: this.frame, toExclusive: Math.max(this.frame + 1, p.range?.toExclusive ?? p.duration) }; });
      if (e.key.toLowerCase() === 'o') this.updateProject(p => { p.range = { from: Math.min(p.range?.from ?? 0, this.frame), toExclusive: this.frame + 1 }; });
    } catch (error) { this.diagnostic(error, 'keyboard'); }
  }
  private showDialog(title: string, body: string): void { this.closeAppearance(); this.closeDialog(); const dialog = this.dialog = document.createElement('dialog'); dialog.className = 'he-dialog'; dialog.setAttribute('aria-label', title); dialog.innerHTML = `<div class="he-dialog-title"><h2>${esc(title)}</h2>${button('close-dialog', 'Close', undefined, 'class="he-dialog-close"')}</div><div class="he-dialog-body">${body}</div>`; this.root.append(dialog); dialog.addEventListener('cancel', e => { e.preventDefault(); this.closeDialog(); }); dialog.showModal(); }
  private closeDialog(): void { this.dialog?.close(); this.dialog?.remove(); this.dialog = null; }
  private dialogValue(name: string): string { return this.dialog!.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value; }
  private defer(action: () => void): void { const timer = setTimeout(() => { this.deferred.delete(timer); action(); }, 30_000); this.deferred.add(timer); }
  private download(blob: Blob, name: string): void { const url = URL.createObjectURL(blob); this.urls.add(url); const a = document.createElement('a'); a.href = url; a.download = name.replace(/[<>:"/\\|?*]/g, '-'); a.click(); this.defer(() => { URL.revokeObjectURL(url); this.urls.delete(url); }); }
  private async downloadProject(): Promise<void> { const document = this.project; this.download(await this.saveArchive(), `${document.name}.htmv`); this.archivedDocument = document; }
  private async recoveryDialog(): Promise<void> { if (!this.conflict && !this.hasUnsavedChanges) { this.status('All changes saved locally.'); return; }
    const missing = this.project.assets.filter(a => !this.assets[a.id] && a.kind !== 'font'), names = missing.slice(0, 3).map(a => a.name).join(' · ');
    this.showDialog(this.conflict ? 'Another tab saved this project' : 'Save recovery', `${missing.length ? `<p class="he-error">Missing media blocks saving and downloading: ${esc(names)}${missing.length > 3 ? ` · ${missing.length - 3} more` : ''}.</p><p>Open the Media panel and use Relink on every item marked “Missing media”, then try again.</p>` : '<p>Your active edits and undo history remain available.</p>'}<div class="he-button-row">${button('retry-save', 'Retry save')}${button('save-copy', 'Save a copy')}${button('save', 'Download .htmv', 'download')}${button('reopen-saved', 'Reopen saved version')}</div>`); }
  private async saveCopy(): Promise<void> {
    this.assertEditable(); const p = clone(this.project), assets = this.currentAssets(), token = ++this.operation; p.id = uid('project'); p.name = `${p.name.slice(0, 190)} copy`; this.busy = true; this.setBusy();
    try { await this.saveChain.catch(() => {}); await this.storage.save(p, assets); if (this.closed || token !== this.operation) return; this.store.reidentify(p.id, p.name); this.conflict = false; this.changed(); this.savedDocument = this.project; this.saveStatus('saved', 'Copy saved locally'); }
    finally { if (token === this.operation) { this.busy = false; this.setBusy(); } }
  }
  private async projectsDialog(): Promise<void> { const [rows, trash] = await Promise.all([this.storage.list(), this.storage.list(true)]); this.showDialog('Your projects', `<div class="he-button-row">${button('new-project', 'New project', 'plus', 'class="he-primary"')}${button('open-archive', 'Open .htmv', 'folder')}${button('save', 'Download current', 'download')}</div><div class="he-project-list">${rows.map(row => `<article><button data-action="open-project" data-key="${esc(row.key)}"><strong>${esc(row.project.name)}</strong><small>${row.project.clips.length} clips · ${new Date(row.updatedAt).toLocaleString()}</small></button><div>${button('duplicate-project', 'Duplicate', 'copy', `class="he-icon" data-key="${esc(row.key)}"`)}${button('rename-saved', 'Rename', undefined, `data-key="${esc(row.key)}" data-name="${esc(row.project.name)}"`)}${button('trash-project', 'Move to recovery', 'trash', `class="he-icon" data-key="${esc(row.key)}"`)}</div></article>`).join('') || '<p>No saved projects yet.</p>'}</div>${trash.length ? `<h3>Recovery</h3><p>Deleted projects and media are retained for recovery.</p>${trash.map(row => `<div class="he-marker-item">${esc(row.project.name)}${button('restore-project', 'Restore', undefined, `data-key="${esc(row.key)}"`)}</div>`).join('')}` : ''}`); }
  private trackDialog(track: EditorTrack): void { this.showDialog('Layer settings', `<div data-edit-track="${track.id}">${field('Name', 'track-name', track.name, 'text')}<div class="he-button-row">${button('toggle-hidden', track.hidden ? 'Show layer' : 'Hide layer', 'eye', `data-track="${track.id}"`)}${button('toggle-lock', track.locked ? 'Unlock layer' : 'Lock layer', 'lock', `data-track="${track.id}"`)}${button('toggle-muted', track.muted ? 'Unmute' : 'Mute audio', 'audio', `data-track="${track.id}"`)}${button('toggle-solo', track.solo ? 'Unsolo' : 'Solo audio', undefined, `data-track="${track.id}"`)}</div><div class="he-button-row">${button('move-track', 'Move up', undefined, `data-track="${track.id}" data-delta="-1"`)}${button('move-track', 'Move down', undefined, `data-track="${track.id}" data-delta="1"`)}${button('delete-track', 'Delete layer', 'trash', `data-track="${track.id}"`)}</div>${button('apply-track', 'Save name', undefined, 'class="he-primary"')}</div>`); }
  private applyTrack(): void { const id = this.dialog!.querySelector<HTMLElement>('[data-edit-track]')!.dataset.editTrack; const name = this.dialogValue('track-name'); this.updateProject(p => { p.tracks.find(t => t.id === id)!.name = name; }); this.closeDialog(); }
  private transitionDialog(id?: string): void {
    const tr = this.project.transitions.find(t => t.id === id), outgoing = tr ? this.project.clips.find(c => c.id === tr.outgoingId) : this.selectedClips()[0]; if (!outgoing) throw new Error('Select the outgoing clip at a cut first.'); const incoming = this.project.clips.find(c => c.trackId === outgoing.trackId && c.start === outgoing.start + outgoing.duration); if (!incoming) throw new Error('The next clip must touch this clip on the same visual track.');
    this.showDialog('Transition at the cut', `<div data-outgoing="${outgoing.id}" data-incoming="${incoming.id}"><p>${esc(outgoing.name)} → ${esc(incoming.name)} · cut at frame ${incoming.start}</p>${selectField('Transition', 'transition-type', tr?.type ?? 'crossfade', [['crossfade', 'Crossfade'], ['slide', 'Slide'], ['wipe', 'Wipe']])}${field('Duration · frames', 'transition-duration', tr?.duration ?? Math.round(this.project.fps * .5), 'number', 'min="2" step="1"')}${selectField('Direction', 'transition-direction', tr?.direction ?? 'left', [['left', 'Left'], ['right', 'Right'], ['up', 'Up'], ['down', 'Down']])}<p>Timing stays fixed. Video needs source handles on both sides of the cut; still layers hold their endpoint appearance.</p><div class="he-button-row">${button('apply-transition', 'Apply transition', undefined, 'class="he-primary"')}${tr ? button('remove-transition', 'Remove', 'trash', `data-transition="${tr.id}"`) : ''}</div></div>`);
  }
  private applyTransition(): void { const el = this.dialog!.querySelector<HTMLElement>('[data-outgoing]')!; this.dispatch({ type: 'transition', outgoingId: el.dataset.outgoing!, incomingId: el.dataset.incoming!, duration: Number(this.dialogValue('transition-duration')), transition: this.dialogValue('transition-type') as 'crossfade', direction: this.dialogValue('transition-direction') as 'left' }); this.closeDialog(); }
  private settingsDialog(): void { this.showDialog('Composition settings', `<div class="he-button-row">${button('preset-landscape', 'Landscape')}${button('preset-portrait', 'Portrait')}${button('preset-square', 'Square')}</div><div class="he-field-grid">${field('Width', 'project-width', this.project.width, 'number', 'min="16" step="2"')}${field('Height', 'project-height', this.project.height, 'number', 'min="16" step="2"')}${field('Frame rate', 'project-fps', this.project.fps, 'number', 'min="1" max="120"')}${field('Duration · frames', 'project-duration', this.project.duration, 'number', 'min="1" step="1"')}</div>${field('Background', 'project-background', this.project.background, 'color')}<p>Changing frame rate preserves frame positions. Duration cannot end before an existing clip.</p>${button('apply-settings', 'Apply settings', undefined, 'class="he-primary"')}`); }
  private applySettings(): void { const width = Number(this.dialogValue('project-width')), height = Number(this.dialogValue('project-height')), fps = Number(this.dialogValue('project-fps')), duration = Number(this.dialogValue('project-duration')), background = this.dialogValue('project-background'); this.updateProject(p => { Object.assign(p, { width, height, fps, duration, background }); if (p.range && p.range.toExclusive > duration) p.range.toExclusive = duration; }); this.closeDialog(); }
  private exportDialog(): void {
    this.pause();
    this.cachedPreflight = null; this.showDialog('Export your composition', `<div class="he-field-grid">${selectField('Format', 'export-profile', 'mp4', [['mp4', 'MP4 / H.264'], ['webm', 'WebM / VP9'], ['auto', 'Best available']])}${selectField('Quality', 'export-quality', '12000000', [['6000000', 'Compact · 6 Mbps'], ['12000000', 'High · 12 Mbps'], ['20000000', 'Maximum · 20 Mbps']])}${field('Output width', 'export-width', this.project.width, 'number', 'min="16" step="2"')}${field('Output height', 'export-height', this.project.height, 'number', 'min="16" step="2"')}</div>${selectField('Range', 'export-range', 'full', [['full', 'Full composition'], ...(this.project.range ? [['marked', `Marked · frames ${this.project.range.from}–${this.project.range.toExclusive - 1}`] as [string, string]] : [])])}${selectField('Save to', 'export-target', 'opfs', [['opfs', 'Disk cache, then download'], ['file', 'Save to a file you choose'], ['memory', 'Memory, then download · up to 128 MB']])}<label class="he-check"><input type="checkbox" name="export-unverified"> My project has audio — allow possible sync drift in this export</label><p class="he-hint">Rendering can't guarantee audio stays in sync in every browser, so exports with sound ask for your OK first. Disk cache and direct file output avoid the memory limit.</p><output class="he-preflight" data-preflight>Check capabilities before rendering.</output><progress value="0" max="1"></progress><div class="he-dialog-actions">${button('cancel-operation', 'Cancel export')}${button('preflight', 'Check capabilities')}${button('export-still', 'PNG of current frame')}${button('start-export', 'Export video', 'upload', 'class="he-primary"')}</div>`);
  }
  private exportOptions(): VideoExportOptions { return { profile: this.dialogValue('export-profile') as 'mp4', videoBitrate: Number(this.dialogValue('export-quality')), audioBitrate: 192000, width: Number(this.dialogValue('export-width')), height: Number(this.dialogValue('export-height')), range: this.dialogValue('export-range') === 'marked' ? this.project.range : undefined, allowUnverifiedAudio: this.dialog!.querySelector<HTMLInputElement>('[name="export-unverified"]')!.checked }; }
  private async checkExport(): Promise<void> { const options = this.exportOptions(), dialog = this.dialog, output = dialog!.querySelector('[data-preflight]')!; output.textContent = 'Checking encoders and composition…'; const report = await this.preflightExport(options); if (this.dialog !== dialog) return; this.cachedPreflight = { options, extension: report.extension }; output.textContent = `${report.supported ? 'Ready to render' : 'Export unavailable'} · estimated ${bytes(report.estimatedBytes)}\n${report.diagnostics.join('\n')}`; }
  private async startExport(): Promise<void> {
    const options = this.exportOptions(), kind = this.dialogValue('export-target'); let target: EditorOutputTarget = { kind: 'memory' };
    if (kind === 'file') { const pick = (window as unknown as { showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker; if (!pick) throw new Error('Direct file saving is unavailable in this browser context. Choose temporary disk storage.'); let ext = options.profile === 'auto' ? this.cachedPreflight && JSON.stringify(options) === JSON.stringify(this.cachedPreflight.options) ? this.cachedPreflight.extension?.replace(/^\./, '') : null : options.profile; if (!ext) throw new Error('Run Check capabilities after changing settings before saving the automatic format directly to file.'); const handle = await pick({ suggestedName: `${this.project.name}.${ext}`, types: [{ description: 'Rendered video', accept: { [ext === 'mp4' ? 'video/mp4' : 'video/webm']: [`.${ext}`] } }] }); target = { kind: 'file', handle }; }
    if (kind === 'opfs') target = { kind: 'opfs', name: `${uid('render')}.${options.profile === 'webm' ? 'webm' : 'mp4'}` };
    const dialog = this.dialog; const result = await this.exportToTarget(target, options);
    if (this.closed) return; if (result.kind === 'blob') this.download(result.blob, `${this.project.name}${result.extension}`); if (result.kind === 'opfs') { this.download(result.file, `${this.project.name}${result.extension}`); const cleanup = result.cleanup; this.defer(() => { void cleanup().finally(() => this.cleanups.delete(cleanup)); }); }
    this.download(new Blob([JSON.stringify(result.manifest, null, 2)], { type: 'application/json' }), `${this.project.name}.render.json`); if (this.dialog === dialog) this.closeDialog(); this.status('Export complete. Video and render manifest are ready.');
  }
  private resizePanel(panel: string, size: number): void { this.root.style.setProperty(`--${panel === 'timeline' ? 'timeline-height' : `${panel}-width`}`, `${Math.max(panel === 'timeline' ? 150 : 190, Math.min(panel === 'timeline' ? this.root.clientHeight * .65 : 460, size))}px`); this.fitCanvas(); }
  private canvasPoint(x: number, y: number): { x: number; y: number } { const r = this.ref('screen').getBoundingClientRect(); return { x: (x - r.left) / r.width * this.project.width, y: (y - r.top) / r.height * this.project.height }; }
  private hitCanvas(x: number, y: number): EditorFrameNode | undefined {
    const p = this.canvasPoint(x, y), state = this.inspectFrame(); return state.nodes.findLast(n => {
      const c = this.project.clips.find(c => c.id === n.id), t = this.project.tracks.find(t => t.id === c?.trackId); if (!c || !isVisual(c) || t?.locked || t?.hidden || n.opacity <= 0) return false;
      const wipe = state.transitions?.find(t => t.type === 'wipe' && t.incomingId === `${c.id}_scope`);
      if (wipe) { const progress = wipe.progress, width = this.project.width, height = this.project.height; if (progress === 0 || wipe.direction === 'left' && p.x > width * progress || wipe.direction === 'right' && p.x < width * (1 - progress) || wipe.direction === 'up' && p.y < height * (1 - progress) || wipe.direction === 'down' && p.y > height * progress) return false; }
      const crosses = n.corners.map((a, i) => { const b = n.corners[(i + 1) % 4]; return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x); }); return crosses.every(v => v >= 0) || crosses.every(v => v <= 0);
    });
  }
  private pointerDown(e: PointerEvent): void {
    this.clickingInspector = !!(e.target as HTMLElement).closest('.he-inspector');
    if (e.button !== 0 || this.dialog) return; const target = e.target as HTMLElement; if (target.closest('input,select,textarea,[data-action],[data-select]') && !target.closest('[data-keyframe]')) return;
    const resize = target.closest<HTMLElement>('[data-resize-panel]');
    if (resize) { const panel = resize.dataset.resizePanel!, box = panel === 'timeline' ? this.root.querySelector('.he-timeline')! : this.root.querySelector(panel === 'browser' ? '.he-browser' : '.he-inspector')!; this.pointer.begin(e, { kind: 'panel', panel, size: panel === 'timeline' ? box.clientHeight : box.clientWidth, x: e.clientX, y: e.clientY, clips: [], preview: [], valid: true, delta: 0 }, this.root, (ev, _, d) => this.resizePanel(d.panel!, d.size! + (panel === 'timeline' ? d.y - ev.clientY : panel === 'inspector' ? d.x - ev.clientX : ev.clientX - d.x))); e.preventDefault(); return; }
    if (this.busy || this.exportAbort) return; this.root.focus({ preventScroll: true });
    const keyEl = target.closest<HTMLElement>('[data-keyframe]'), clipEl = target.closest<HTMLElement>('[data-clip]'), handle = target.closest<HTMLElement>('[data-handle]');
    let drag: Drag | null = null;
    if (keyEl) {
      const id = keyEl.dataset.keyclip!, c = this.project.clips.find(c => c.id === id)!; if (this.project.tracks.find(t => t.id === c.trackId)?.locked) return;
      this.setSelection([id]); this.motionProperty = keyEl.dataset.property as MotionProperty; this.keyId = keyEl.dataset.keyframe!; this.animated = true; this.renderInspector(); drag = { kind: 'key', x: e.clientX, y: e.clientY, clips: [clone(c)], preview: [], delta: 0, valid: true, keyId: this.keyId, property: this.motionProperty };
    } else if (clipEl) {
      const id = clipEl.dataset.clip!, c = this.project.clips.find(c => c.id === id)!; this.selectedTrack = c.trackId;
      if (e.ctrlKey || e.metaKey || e.shiftKey) { this.selection.toggle(id, this.project); this.setSelection(this.getSelection()); return; }
      if (!this.selection.ids.has(id)) this.setSelection([id]); if (this.selectedClips().some(c => this.project.tracks.find(t => t.id === c.trackId)?.locked)) return;
      const edge = target.closest<HTMLElement>('[data-trim]')?.dataset.trim as 'left' | 'right' | undefined; drag = { kind: edge ?? 'move', x: e.clientX, y: e.clientY, clips: (edge ? [c] : this.selectedClips()).map(clone), preview: [], delta: 0, valid: true };
    } else if (target.closest('[data-ruler]') || target.closest('[data-lane]')) {
      const lane = target.closest<HTMLElement>('[data-lane]'); if (lane) { this.selectedTrack = lane.dataset.lane!; this.setSelection([]); } this.pause(); this.run(this.seek(this.timeline.frameAt(e.clientX))); drag = { kind: 'scrub', x: e.clientX, y: e.clientY, clips: [], preview: [], delta: 0, valid: true };
    } else if (target.closest('[data-ref="stage"]')) {
      if (this.panMode || e.altKey) drag = { kind: 'pan', x: e.clientX - this.pan.x, y: e.clientY - this.pan.y, clips: [], preview: [], delta: 0, valid: true };
      else {
        const node = handle ? this.inspectFrame().nodes.find(n => n.id === handle.dataset.handleClip) : this.hitCanvas(e.clientX, e.clientY); if (!node) { this.setSelection([]); return; }
        if (e.shiftKey || e.ctrlKey || e.metaKey) { this.selection.toggle(node.id, this.project); this.setSelection(this.getSelection()); return; }
        if (!this.selection.ids.has(node.id)) this.setSelection([node.id]); const clips = handle ? this.project.clips.filter(c => c.id === node.id) : this.selectedClips().filter(isVisual);
        if (clips.some(c => this.project.tracks.find(t => t.id === c.trackId)?.locked)) return;
        drag = { kind: handle ? handle.dataset.handle === 'rotate' ? 'rotate' : 'resize' : 'position', x: e.clientX, y: e.clientY, clips: clips.map(clone), preview: [], delta: 0, valid: true, corner: Number(handle?.dataset.handle), nodes: this.inspectFrame().nodes.filter(n => clips.some(c => c.id === n.id)) };
      }
    }
    if (drag) { this.pause(); e.preventDefault(); this.pointer.begin(e, drag, this.root, (event, origin, value) => this.previewPointer(event, origin, value)); }
  }
  private snap(frame: number, exclude: Set<string>, e: PointerEvent): number {
    if (!this.snapping || e.altKey) return Math.round(frame); const threshold = this.project.fps / this.timeline.zoom * 8;
    const targets = [0, this.frame, ...this.project.markers.map(m => m.frame), ...this.project.clips.filter(c => !exclude.has(c.id)).flatMap(c => [c.start, c.start + c.duration])]; let result = Math.round(frame), distance = threshold;
    for (const target of targets) if (Math.abs(frame - target) < distance) { distance = Math.abs(frame - target); result = target; } return result;
  }
  private previewPointer(e: PointerEvent, _origin: PointerEvent, d: Drag): void {
    if (d.kind === 'panel') return;
    if (d.kind === 'scrub') { this.run(this.seek(this.timeline.frameAt(e.clientX))); return; }
    if (d.kind === 'pan') { this.pan = { x: e.clientX - d.x, y: e.clientY - d.y }; this.fitCanvas(); return; }
    const ids = new Set(d.clips.map(c => c.id)); const rawDelta = Math.round((e.clientX - d.x) / this.timeline.zoom * this.project.fps);
    if (d.kind === 'key') {
      const c = d.clips[0], keys = c.animations!.find(ch => ch.property === d.property)!.keyframes, k = keys.find(k => k.id === d.keyId)!; const global = c.start + k.frame - (c.animationOffset ?? 0); d.delta = this.snap(global + rawDelta, ids, e) - global;
      d.valid = k.frame + d.delta >= 0 && !keys.some(other => other.id !== k.id && other.frame === k.frame + d.delta);
      const el = this.ref('timeline').querySelector<HTMLElement>(`[data-keyframe="${k.id}"]`); if (el) { el.style.left = `${(global + d.delta) / this.project.fps * this.timeline.zoom}px`; el.classList.toggle('he-invalid', !d.valid); } return;
    }
    if (d.kind === 'move' || d.kind === 'left' || d.kind === 'right') {
      const first = d.clips[0], anchor = d.kind === 'right' ? first.start + first.duration : Math.min(...d.clips.map(c => c.start)); d.delta = this.snap(anchor + rawDelta, ids, e) - anchor;
      if (d.kind === 'move') { const end = Math.max(...d.clips.map(c => c.start + c.duration)), endSnap = this.snap(end + rawDelta, ids, e) - end; if (Math.abs(endSnap - rawDelta) < Math.abs(d.delta - rawDelta)) d.delta = endSnap; }
      const lane = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-lane]'); d.trackId = d.kind === 'move' && d.clips.every(c => c.trackId === first.trackId) ? lane?.dataset.lane : undefined;
      d.preview = d.clips.map(c => { const next = { ...c }; if (d.kind === 'move') { next.start += d.delta; if (d.trackId) next.trackId = d.trackId; } else if (d.kind === 'left') { next.start += d.delta; next.duration -= d.delta; if (hasSound(next)) next.sourceIn += d.delta / this.project.fps; } else next.duration += d.delta; return next; });
      d.valid = d.preview.every(c => { const t = this.project.tracks.find(t => t.id === c.trackId); if (!t || t.locked || !trackAccepts(t, c) || c.start < 0 || c.duration < 1 || hasSound(c) && (c.sourceIn < 0 || c.sourceIn + c.duration / this.project.fps > this.project.assets.find(a => a.id === c.assetId)!.duration + 1e-8)) return false; return t.kind === 'caption' || !this.project.clips.some(other => !ids.has(other.id) && other.trackId === c.trackId && c.start < other.start + other.duration && c.start + c.duration > other.start); });
      this.timeline.ghost(d.preview, d.valid); this.status(`${d.valid ? '' : 'Cannot place here · '}${d.kind === 'move' ? 'Start' : 'Trim'} ${d.preview[0].start} · ${d.preview[0].duration} frames`); return;
    }
    const start = this.canvasPoint(d.x, d.y), point = this.canvasPoint(e.clientX, e.clientY); let dx = point.x - start.x, dy = point.y - start.y; this.ref('guides').replaceChildren();
    d.changes = []; const nodes: EditorFrameNode[] = [];
    for (const clip of d.clips.filter(isVisual)) { const n = d.nodes!.find(n => n.id === clip.id)!; if (!n) continue; const changes: Record<string, unknown> = {};
      if (d.kind === 'position') {
        if (this.snapping && !e.altKey && d.clips.length === 1) { const tolerance = 6 * this.project.width / this.ref('screen').getBoundingClientRect().width, tx = [0, this.project.width / 2, this.project.width], ty = [0, this.project.height / 2, this.project.height]; const xs = [n.x + dx, n.x + dx + n.width / 2, n.x + dx + n.width], ys = [n.y + dy, n.y + dy + n.height / 2, n.y + dy + n.height]; for (const x of tx) for (const a of xs) if (Math.abs(a - x) < tolerance) { dx += x - a; this.ref('guides').innerHTML += `<i style="left:${x / this.project.width * 100}%"></i>`; } for (const y of ty) for (const a of ys) if (Math.abs(a - y) < tolerance) { dy += y - a; this.ref('guides').innerHTML += `<b style="top:${y / this.project.height * 100}%"></b>`; } }
        changes.x = n.x + dx; changes.y = n.y + dy; nodes.push({ ...n, corners: n.corners.map(p => ({ x: p.x + dx, y: p.y + dy })) });
      } else if (d.kind === 'rotate') {
        const center = { x: n.corners.reduce((s, p) => s + p.x, 0) / 4, y: n.corners.reduce((s, p) => s + p.y, 0) / 4 }; let angle = (Math.atan2(point.y - center.y, point.x - center.x) - Math.atan2(start.y - center.y, start.x - center.x)) * 180 / Math.PI; if (e.shiftKey) angle = Math.round(angle / 15) * 15; changes.rotation = n.rotation + angle; const a = angle * Math.PI / 180; nodes.push({ ...n, corners: n.corners.map(p => ({ x: center.x + (p.x - center.x) * Math.cos(a) - (p.y - center.y) * Math.sin(a), y: center.y + (p.x - center.x) * Math.sin(a) + (p.y - center.y) * Math.cos(a) })) });
      } else {
        const corner = d.corner ?? 2, anchor = n.corners[(corner + 2) % 4], original = n.corners[corner]; const a = -n.rotation * Math.PI / 180, localX = dx * Math.cos(a) - dy * Math.sin(a), localY = dx * Math.sin(a) + dy * Math.cos(a); let sx = Math.max(.02, 1 + localX * (corner === 0 || corner === 3 ? -1 : 1) / (n.width * n.scaleX)), sy = Math.max(.02, 1 + localY * (corner < 2 ? -1 : 1) / (n.height * n.scaleY)); if (e.shiftKey) sx = sy = Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy;
        // Scale about the center, keeping authored width/height and text layout intact.
        changes.scaleX = Math.max(.001, n.scaleX * sx); changes.scaleY = Math.max(.001, n.scaleY * sy); const center = { x: n.corners.reduce((s, p) => s + p.x, 0) / 4, y: n.corners.reduce((s, p) => s + p.y, 0) / 4 }; const rotate = n.rotation * Math.PI / 180;
        nodes.push({ ...n, corners: n.corners.map(p => { const px = (p.x - center.x) * Math.cos(-rotate) - (p.y - center.y) * Math.sin(-rotate), py = (p.x - center.x) * Math.sin(-rotate) + (p.y - center.y) * Math.cos(-rotate); return { x: center.x + px * sx * Math.cos(rotate) - py * sy * Math.sin(rotate), y: center.y + px * sx * Math.sin(rotate) + py * sy * Math.cos(rotate) }; }) }); void anchor; void original;
      }
      d.changes.push(changes);
    }
    this.renderOverlay(nodes);
  }
  private pointerEnd(e: PointerEvent): void {
    const d = this.pointer.end(e); if (!d) return; const moved = this.pointer.moved; this.ref('guides').replaceChildren();
    if (!moved) { if (d.kind === 'key') { const c = d.clips[0], k = c.animations!.find(ch => ch.property === d.property)!.keyframes.find(k => k.id === d.keyId)!; this.run(this.seek(c.start + k.frame - (c.animationOffset ?? 0))); } return; }
    if (!d.valid) { this.renderTimeline(); this.renderOverlay(); this.status('Placement rejected. Use a compatible unlocked track without overlapping clips.'); return; }
    if (d.clips.length && d.clips.some(c => !this.project.clips.some(live => live.id === c.id))) { this.renderTimeline(); this.renderOverlay(); this.status('The edited layer was removed during the drag, so the change was dropped.'); return; }
    if (d.kind === 'move' && (d.delta || d.trackId)) this.dispatch({ type: 'move', ids: d.clips.map(c => c.id), delta: d.delta, trackId: d.trackId });
    if ((d.kind === 'left' || d.kind === 'right') && d.delta) this.dispatch({ type: 'trim', id: d.clips[0].id, edge: d.kind, delta: d.delta });
    if (d.kind === 'key' && d.delta) this.updateProject(p => { const keys = p.clips.find(c => c.id === d.clips[0].id)!.animations!.find(ch => ch.property === d.property)!.keyframes; keys.find(k => k.id === d.keyId)!.frame += d.delta; keys.sort((a, b) => a.frame - b.frame); });
    if (d.kind === 'position' || d.kind === 'resize' || d.kind === 'rotate') this.updateProject(p => { d.clips.forEach((old, i) => { const c = p.clips.find(c => c.id === old.id)!; for (const [key, value] of Object.entries(d.changes?.[i] ?? {})) { if (this.autoKey || c.animations?.some(ch => ch.property === key)) applyCommand(p, { type: 'keyframe', id: c.id, property: key as MotionProperty, frame: this.frame - c.start, value: value as number }); else applyCommand(p, { type: 'patch', ids: [c.id], changes: { [key]: value } }); } }); });
    this.renderTimeline(); this.renderOverlay();
  }
}
