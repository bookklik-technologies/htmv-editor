import { compile, createRenderer, PlayerEngine } from '@bookklik/htmv';
import type { CompiledCompositionImpl, RendererSession } from '@bookklik/htmv';
import type { EditorAssets, EditorFrameState, EditorOutputTarget, EditorProject, TargetExportResult, VideoExportOptions, VideoExportResult } from './types.js';
import { clone, hasSound, isText, isVisual } from './project.js';
import { toComposition } from './composition.js';
interface Revision { compiled: CompiledCompositionImpl; renderer: RendererSession }
export async function retire(revision: Revision | null): Promise<void> { if (!revision) return; await revision.renderer.whenIdle(); try { await revision.renderer.dispose(); } finally { await revision.compiled.dispose(); } }
function exportProject(project: EditorProject, options: VideoExportOptions): EditorProject {
  if (!options.width && !options.height) return project;
  const p = clone(project), sx = (options.width ?? p.width) / p.width, sy = (options.height ?? p.height) / p.height;
  p.width = options.width ?? p.width; p.height = options.height ?? p.height;
  for (const c of p.clips) if (isVisual(c)) {
    c.x *= sx; c.y *= sy; c.width *= sx; c.height *= sy;
    if (isText(c)) c.fontSize *= sy; if (c.kind === 'shape') { c.strokeWidth *= Math.min(sx, sy); c.radius *= Math.min(sx, sy); }
    for (const channel of c.animations ?? []) if (channel.property === 'x' || channel.property === 'y') for (const k of channel.keyframes) k.value = Number(k.value) * (channel.property === 'x' ? sx : sy);
  }
  return p;
}
export class PreviewEngine {
  private revision: Revision | null = null;
  private player: PlayerEngine | null = null;
  private pending: AbortController | null = null;
  private generation = 0;
  private playerGeneration = -1;
  private closed = false;
  private desiredFrame = 0;
  private tasks = new Set<Promise<unknown>>();
  private retirement = new Set<Promise<void>>();
  constructor(private canvas: HTMLCanvasElement, private onFrame: (frame: number, playing: boolean) => void, private onError: (error: unknown) => void, private onLevel?: (peak: number, clipped: number) => void) {}
  get frame(): number { return this.player?.frame ?? this.desiredFrame; }
  get hasPreview(): boolean { return this.revision !== null; }
  get playing(): boolean { return this.player?.isPlaying ?? false; }
  invalidatePending(): void { this.generation++; this.pending?.abort(); this.pending = null; }
  setDesiredFrame(frame: number): void { this.desiredFrame = frame; }
  inspectFrame(frame = this.desiredFrame): EditorFrameState {
    if (!this.revision) return { frame, revisionHash: '', nodes: [] };
    const safe = Math.min(Math.max(frame, 0), this.revision.renderer.metadata.durationFrames - 1);
    return this.revision.renderer.inspectFrame(safe);
  }
  async prepare(project: EditorProject, assets: EditorAssets, signal?: AbortSignal): Promise<Revision> {
    signal?.throwIfAborted(); const compiled = await compile(toComposition(project), { assets, signal, stylePolicy: 'strict' }); let renderer: RendererSession | null = null;
    try { signal?.throwIfAborted(); renderer = await createRenderer(compiled); const first = await renderer.renderFrame(0, { signal }); first.close(); return { compiled, renderer }; }
    catch (error) { await renderer?.dispose(); await compiled.dispose(); throw error; }
  }
  private retire(revision: Revision | null): void { const task = retire(revision); this.retirement.add(task); void task.catch(this.onError).finally(() => this.retirement.delete(task)); }
  async replace(project: EditorProject, assets: EditorAssets, frame: number): Promise<boolean> { const task = this.replaceNow(project, assets, frame); this.tasks.add(task); try { return await task; } finally { this.tasks.delete(task); } }
  private async replaceNow(project: EditorProject, assets: EditorAssets, frame: number): Promise<boolean> {
    if (this.closed) return false;
    const generation = ++this.generation; this.pending?.abort(); const controller = new AbortController(); this.pending = controller; this.desiredFrame = frame; this.pause(); let next: Revision | null = null;
    try {
      next = await this.prepare(project, assets, controller.signal);
      while (!this.closed && generation === this.generation) {
        const desired = Math.min(Math.max(this.desiredFrame, 0), project.duration - 1), image = await next.renderer.renderFrame(desired, { signal: controller.signal });
        if (this.closed || generation !== this.generation) { image.close(); break; }
        if (desired !== Math.min(this.desiredFrame, project.duration - 1)) { image.close(); continue; }
        this.player?.stop(); const previous = this.revision; this.revision = next; next = null; this.pending = null;
        this.canvas.width = project.width; this.canvas.height = project.height;
        try { this.canvas.getContext('2d')!.drawImage(image.image, 0, 0); } finally { image.close(); }
        const player = new PlayerEngine(this.revision.compiled, this.revision.renderer, { target: this.canvas, onEvent: (name, detail) => {
          if (this.closed || this.player !== player || generation !== this.generation) return;
          if (name === 'hv-frame') { const f = (detail as { frame: number }).frame; if (this.playing) this.desiredFrame = f; this.onFrame(f, this.playing); }
          if (['hv-play', 'hv-pause', 'hv-ended'].includes(name)) this.onFrame(this.frame, this.playing);
          if (name === 'hv-error') this.onError(new Error((detail as { message: string }).message));
          if (name === 'hv-level') { const level = detail as { peak: number; clippedSamples: number }; this.onLevel?.(level.peak, level.clippedSamples); }
        } });
        this.player = player; this.playerGeneration = generation; this.retire(previous);
        try { await player.seekToFrame(Math.min(this.desiredFrame, project.duration - 1)); } catch (error) { if ((error as Error).name !== 'AbortError') throw error; }
        return generation === this.generation;
      }
      return false;
    } catch (error) { if (!this.closed && generation === this.generation && (error as Error).name !== 'AbortError') throw error; return false; }
    finally { if (next) await retire(next); if (this.pending === controller) this.pending = null; }
  }
  async play(): Promise<void> { if (!this.player || this.playerGeneration !== this.generation) throw new Error('The current preview is not ready. Resolve the composition diagnostic first.'); await this.player.start(); }
  pause(): void { this.player?.pause(); }
  async seek(frame: number): Promise<void> {
    this.desiredFrame = frame; if (!this.player || this.pending || this.playerGeneration !== this.generation) return;
    const desired = Math.min(Math.max(frame, 0), this.revision!.renderer.metadata.durationFrames - 1);
    try { await this.player.seekToFrame(desired); } catch (error) { if ((error as Error).name !== 'AbortError') throw error; }
  }
  private async preflightRevision(revision: Revision, options: VideoExportOptions) {
    const report = await revision.renderer.preflight({ profile: options.profile ?? 'auto', allowedProfiles: ['mp4', 'webm'], syncPolicy: options.allowUnverifiedAudio ? 'allow-unverified' : 'certified', range: options.range, videoBitrate: options.videoBitrate, audioBitrate: options.audioBitrate });
    return report;
  }
  async preflight(project: EditorProject, assets: EditorAssets, options: VideoExportOptions) {
    const revision = await this.prepare(exportProject(project, options), assets, options.signal);
    try { const report = await this.preflightRevision(revision, options); return { supported: report.supported, estimatedBytes: report.estimatedBytes, diagnostics: [...new Set([...report.diagnostics, ...report.candidates.flatMap(c => c.diagnostics)].map(d => `${d.code}: ${d.message}`))], extension: report.selected?.extension }; } finally { await retire(revision); }
  }
  async exportTarget(project: EditorProject, assets: EditorAssets, target: EditorOutputTarget, options: VideoExportOptions, onProgress: (phase: string, completed: number, total: number) => void): Promise<TargetExportResult> {
    this.pause(); const revision = await this.prepare(exportProject(project, options), assets, options.signal);
    try {
      options.signal?.throwIfAborted(); const report = await this.preflightRevision(revision, options);
      if (!report.supported || !report.selected) throw new Error([...new Set([...report.diagnostics, ...report.candidates.flatMap(c => c.diagnostics)].map(d => `${d.code}: ${d.message}`))].join('\n') || 'No supported encoder is available.');
      if (target.kind === 'memory' && report.estimatedBytes > (target.maxBytes ?? 128 * 1024 * 1024)) throw new Error('Estimated output exceeds the memory budget. Choose Save directly to file or Temporary disk storage.');
      if (target.kind === 'opfs') { if (!navigator.storage?.getDirectory) throw new Error('Temporary disk storage is unavailable in this context. Choose direct file saving.'); const estimate = await navigator.storage.estimate(); if (estimate.quota !== undefined && estimate.usage !== undefined && report.estimatedBytes > estimate.quota - estimate.usage) throw new Error('Estimated output exceeds available origin storage. Free storage or choose direct file saving.'); }
      const result = await revision.renderer.exportVideo({ configuration: report.selected, target, signal: options.signal, onProgress: p => onProgress(p.phase, p.completedFrames, p.totalFrames) });
      return { ...result, extension: report.selected.extension, manifest: result.manifest as unknown as Record<string, unknown> };
    } finally { await retire(revision); }
  }
  async export(project: EditorProject, assets: EditorAssets, options: VideoExportOptions, progress: (phase: string, completed: number, total: number) => void): Promise<VideoExportResult> {
    const result = await this.exportTarget(project, assets, { kind: 'memory' }, options, progress); if (result.kind !== 'blob') throw new Error('Expected a Blob.'); return result;
  }
  async still(project: EditorProject, assets: EditorAssets, frame: number, signal?: AbortSignal): Promise<Blob> { const revision = await this.prepare(project, assets, signal); try { return await revision.renderer.renderStill({ frame, type: 'png', signal }); } finally { await retire(revision); } }
  async destroy(): Promise<void> { this.closed = true; this.invalidatePending(); this.player?.stop(); this.player = null; await Promise.allSettled([...this.tasks]); await retire(this.revision); this.revision = null; await Promise.allSettled([...this.retirement]); }
}
