import { compile, getMediabunnyAdapter } from '@bookklik/htmv';
import type { EditorAsset } from './types.js';
import { LIMITS, uid } from './project.js';
export async function inspectFile(file: File, signal?: AbortSignal): Promise<EditorAsset> {
  signal?.throwIfAborted(); if (!file.size || file.size > LIMITS.assetBytes) throw new Error(`${file.name}: files must be between 1 byte and 256 MiB.`);
  const id = uid('asset'), name = file.name.slice(0, 200) || 'Media', base = { id, name, mimeType: file.type || 'application/octet-stream', size: file.size, duration: 0, width: 0, height: 0, hasAudio: false };
  if (/\.(woff2?|ttf|otf)$/i.test(name) || /font/.test(file.type)) { const family = `EditorFont_${id}`; await new FontFace(family, await file.arrayBuffer()).load(); signal?.throwIfAborted(); return { ...base, kind: 'font', family }; }
  if (/^image\//.test(file.type) || /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(name)) {
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width > LIMITS.imageDimension || bitmap.height > LIMITS.imageDimension || bitmap.width * bitmap.height > LIMITS.imagePixels) throw new Error('Image exceeds the engine dimension limits.');
      const compiled = await compile(`<hv-composition id="probe" width="64" height="64" fps="30" duration="1f"><img src="asset:${id}" style="width:64px;height:64px"></hv-composition>`, { assets: { [id]: file }, signal }); await compiled.dispose();
      return { ...base, kind: 'image', width: bitmap.width, height: bitmap.height };
    } finally { bitmap.close(); }
  }
  const adapter = getMediabunnyAdapter().adapter, inspection = await adapter.inspect(file), video = inspection.videoTracks[0], audio = inspection.audioTracks[0];
  signal?.throwIfAborted(); if (!video && !audio) throw new Error(`${name}: no playable media tracks.`);
  if (video && (video.width > LIMITS.imageDimension || video.height > LIMITS.imageDimension || video.width * video.height > LIMITS.imagePixels)) throw new Error('Video dimensions exceed the engine surface limits. Import a smaller source.');
  if (audio && audio.numberOfChannels > 2) throw new Error('Audio with more than two channels needs an external mono/stereo downmix before import.');
  const kind = video ? 'video' : 'audio', extent = Math.max(0, (video?.durationSeconds ?? audio.durationSeconds) - inspection.movieOriginSeconds); if (!extent) throw new Error('No positive playable extent.');
  const reader = adapter.open(file, { kind, assetId: id, trimIn: 0, trimOut: null, rate: 1 }, () => undefined);
  try {
    if (video) { const frame = await reader.getVideoSample(Math.max(0, video.firstTimestampSeconds - inspection.movieOriginSeconds), { generation: 1 }); frame?.close(); }
    if (audio) await reader.getAudioBlock(Math.max(0, audio.firstTimestampSeconds - inspection.movieOriginSeconds), .02, [new Float32Array(Math.ceil(audio.sampleRate * .02)), new Float32Array(Math.ceil(audio.sampleRate * .02))], audio.sampleRate);
    signal?.throwIfAborted();
  } finally { await reader.dispose(); }
  const rotated = video && Math.abs(video.rotation) % 180 === 90;
  return { ...base, kind, duration: extent, width: video ? rotated ? video.height : video.width : 0, height: video ? rotated ? video.width : video.height : 0, hasAudio: !!audio };
}
export interface MediaOverview { url?: string; peaks?: number[] }
/** Bounded sampled waveforms and decoded thumbnails, never cosmetic waveform marks. */
export class MediaCache {
  private entries = new Map<string, MediaOverview>();
  private tasks = new Map<string, Promise<MediaOverview>>();
  private controllers = new Map<string, AbortController>();
  private queue: (() => void)[] = [];
  private running = 0;
  private closed = false;
  private failures = new Set<string>();
  private listeners = new Set<(id: string) => void>();
  onReady(callback: (id: string) => void): void { this.listeners.add(callback); }
  get(id: string): MediaOverview | undefined { return this.entries.get(id); }
  request(asset: EditorAsset, blob: Blob): void {
    if (this.closed || this.failures.has(asset.id) || this.entries.has(asset.id) || this.tasks.has(asset.id) || asset.kind === 'font') return;
    const controller = new AbortController(); this.controllers.set(asset.id, controller);
    const task = new Promise<MediaOverview>((resolve, reject) => { this.queue.push(() => { void this.generate(asset, blob, controller.signal).then(resolve, reject).finally(() => { this.running--; this.pump(); }); }); });
    this.tasks.set(asset.id, task); this.pump();
    void task.then(result => { if (this.closed || controller.signal.aborted) { if (result.url) URL.revokeObjectURL(result.url); return; } this.entries.set(asset.id, result); while (this.entries.size > 80) this.invalidate(this.entries.keys().next().value!); for (const listener of this.listeners) listener(asset.id); }).catch(() => { if (!controller.signal.aborted) this.failures.add(asset.id); }).finally(() => { this.tasks.delete(asset.id); if (this.controllers.get(asset.id) === controller) this.controllers.delete(asset.id); });
  }
  private pump(): void { while (this.running < 2 && this.queue.length) { this.running++; this.queue.shift()!(); } }
  private async generate(asset: EditorAsset, blob: Blob, signal: AbortSignal): Promise<MediaOverview> {
    signal.throwIfAborted(); if (asset.kind === 'image') return { url: URL.createObjectURL(blob) };
    const adapter = getMediabunnyAdapter().adapter, reader = adapter.open(blob, { kind: asset.kind === 'video' ? 'video' : 'audio', assetId: asset.id, trimIn: 0, trimOut: null, rate: 1 }, () => undefined); const result: MediaOverview = {};
    try {
      if (asset.kind === 'video') {
        const sample = await reader.getVideoSample(asset.duration * .1, { generation: 1 });
        if (sample) try { const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = Math.max(1, Math.round(240 * sample.height / sample.width)); sample.paint(canvas.getContext('2d')!, 0, 0, canvas.width, canvas.height); const image = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .7)); signal.throwIfAborted(); if (image) result.url = URL.createObjectURL(image); } finally { sample.close(); }
      }
      if (asset.hasAudio) {
        const metadata = await adapter.inspect(blob), track = metadata.audioTracks[0]; if (track) {
          const peaks: number[] = [], bins = 160, length = Math.min(asset.duration / bins, .025), count = Math.max(1, Math.ceil(length * track.sampleRate));
          for (let i = 0; i < bins; i++) { signal.throwIfAborted(); const buffers = [new Float32Array(count), new Float32Array(count)]; await reader.getAudioBlock(i / bins * asset.duration, length, buffers, track.sampleRate); let peak = 0; for (const channel of buffers) for (const v of channel) peak = Math.max(peak, Math.abs(v)); peaks.push(peak); }
          result.peaks = peaks;
        }
      }
      return result;
    } catch (error) { if (result.url) URL.revokeObjectURL(result.url); throw error; } finally { await reader.dispose(); }
  }
  invalidate(id: string): void { this.controllers.get(id)?.abort(); const entry = this.entries.get(id); if (entry?.url) URL.revokeObjectURL(entry.url); this.entries.delete(id); this.failures.delete(id); }
  retain(ids: Set<string>): void { for (const id of new Set([...this.controllers.keys(), ...this.entries.keys(), ...this.failures])) if (!ids.has(id)) this.invalidate(id); }
  async destroy(): Promise<void> { this.closed = true; for (const c of this.controllers.values()) c.abort(); this.pump(); await Promise.allSettled([...this.tasks.values()]); for (const id of this.entries.keys()) this.invalidate(id); this.listeners.clear(); }
}
