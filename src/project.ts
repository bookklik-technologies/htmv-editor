import { parseEasing } from '@bookklik/htmv';
import type { EditorAssets, EditorClip, EditorProject, EditorTrack, VisualClip } from './types.js';
export const LIMITS = { assetBytes: 256 * 1024 * 1024, totalBytes: 512 * 1024 * 1024, imageDimension: 8192, imagePixels: 33_554_432, entries: 2048 };
export const uid = (prefix = 'id'): string => `${prefix}_${crypto.randomUUID()}`;
export const clone = <T>(value: T): T => structuredClone(value);
export const isVisual = (c: EditorClip): c is VisualClip => c.kind !== 'audio';
export const hasMedia = (c: EditorClip): c is Extract<EditorClip, { assetId: string }> => c.kind === 'audio' || c.kind === 'video' || c.kind === 'image';
export const hasSound = (c: EditorClip): c is Extract<EditorClip, { sourceIn: number }> => c.kind === 'audio' || c.kind === 'video';
export const isText = (c: EditorClip): c is Extract<EditorClip, { text: string }> => c.kind === 'text' || c.kind === 'caption';
export const trackAccepts = (t: EditorTrack, c: EditorClip): boolean => t.kind === 'audio' ? c.kind === 'audio' : t.kind === 'caption' ? c.kind === 'caption' : c.kind !== 'audio' && c.kind !== 'caption';
export const endFrame = (p: EditorProject): number => p.clips.reduce((n, c) => Math.max(n, c.start + c.duration), 1);
export function createProject(name = 'Untitled project'): EditorProject {
  return { version: 2, id: uid('project'), name, width: 1920, height: 1080, fps: 30, duration: 300, background: '#000000', tracks: [{ id: uid('track'), name: 'Layer 1', kind: 'visual' }, { id: uid('track'), name: 'Audio 1', kind: 'audio' }], clips: [], assets: [], transitions: [], markers: [], groups: [] };
}
export function migrateProject(input: unknown): EditorProject {
  if (!input || typeof input !== 'object') throw new Error('Invalid project document.');
  const p = clone(input) as EditorProject;
  if ((p.version as number) === 1) { p.version = 2; p.transitions = []; p.markers = []; p.groups = []; }
  validateProject(p); return p;
}
function assert(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }
const idOK = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z][\w-]{0,99}$/.test(v);
const integer = (n: unknown, min: number, max = 10_000_000): n is number => Number.isSafeInteger(n) && (n as number) >= min && (n as number) <= max;
const finite = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
export const colorOK = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
const nameOK = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= 200;
export function validateProject(input: unknown, blobs?: EditorAssets, allowMissing = false): asserts input is EditorProject {
  assert(input && typeof input === 'object', 'Invalid project document.'); const p = input as EditorProject;
  assert(p.version === 2, 'Unsupported project version. Expected version 1 or 2 at import.');
  assert(idOK(p.id) && nameOK(p.name), 'Invalid project identity or name.');
  assert(integer(p.width, 16, 8192) && integer(p.height, 16, 8192) && p.width * p.height <= LIMITS.imagePixels, 'Invalid composition dimensions.');
  assert(integer(p.fps, 1, 120) && integer(p.duration, 1) && colorOK(p.background), 'Invalid frame rate, duration, or background.');
  assert(Array.isArray(p.tracks) && p.tracks.length <= 200 && Array.isArray(p.clips) && p.clips.length <= 10000 && Array.isArray(p.assets) && p.assets.length < LIMITS.entries && Array.isArray(p.transitions) && Array.isArray(p.markers) && Array.isArray(p.groups), 'Invalid project collections.');
  assert(p.transitions.length <= 10000 && p.markers.length <= 10000 && p.groups.length <= 10000, 'Excessive project collections.');
  const ids = new Set<string>(); const unique = (id: string): void => { assert(idOK(id) && !ids.has(id), 'Project IDs must be safe and unique.'); ids.add(id); }; unique(p.id);
  const tracks = new Map<string, EditorTrack>();
  for (const t of p.tracks) { assert(t && typeof t === 'object', 'Invalid track.'); unique(t.id); assert(nameOK(t.name) && ['visual', 'audio', 'caption'].includes(t.kind), 'Invalid track.'); for (const field of ['hidden', 'locked', 'muted', 'solo'] as const) assert(t[field] === undefined || typeof t[field] === 'boolean', 'Invalid track state.'); tracks.set(t.id, t); }
  const assets = new Map(p.assets.map(a => [a?.id, a])); let bytes = 0;
  for (const a of p.assets) {
    assert(a && typeof a === 'object', 'Invalid asset.'); unique(a.id);
    assert(nameOK(a.name) && ['video', 'image', 'audio', 'font'].includes(a.kind) && typeof a.mimeType === 'string' && a.mimeType.length <= 100, 'Invalid asset metadata.');
    assert(integer(a.size, 1, LIMITS.assetBytes) && finite(a.duration, 0, 10_000_000) && integer(a.width, 0, 65536) && integer(a.height, 0, 65536) && typeof a.hasAudio === 'boolean', 'Invalid media dimensions, size, or duration.');
    if (a.kind === 'video' || a.kind === 'audio') assert(a.duration > 0, 'Media must have a positive playable extent.');
    if (a.kind === 'font') assert(a.family === `EditorFont_${a.id}`, 'Invalid imported font family.');
    if (a.kind === 'image') assert(a.width > 0 && a.height > 0 && a.width <= LIMITS.imageDimension && a.height <= LIMITS.imageDimension && a.width * a.height <= LIMITS.imagePixels, 'Image exceeds engine limits.');
    bytes += a.size; assert(bytes <= LIMITS.totalBytes, 'Project media exceeds 512 MiB.');
    if (blobs && (!allowMissing || Object.hasOwn(blobs, a.id))) assert(Object.hasOwn(blobs, a.id) && blobs[a.id] instanceof Blob && blobs[a.id].size === a.size, `Missing or mismatched asset: ${a.name}.`);
  }
  const fonts = new Set(['Arial', 'Georgia', 'Courier New', ...p.assets.filter(a => a.kind === 'font').map(a => a.family!)]);
  for (const g of p.groups) { unique(g.id); assert(nameOK(g.name), 'Invalid group.'); }
  const clips = new Map<string, EditorClip>(); const byTrack = new Map<string, EditorClip[]>(); let keys = 0;
  for (const c of p.clips) {
    assert(c && typeof c === 'object', 'Invalid clip.'); unique(c.id); clips.set(c.id, c);
    assert(['video', 'image', 'text', 'audio', 'shape', 'caption'].includes(c.kind) && nameOK(c.name), 'Invalid clip kind/name.');
    const t = tracks.get(c.trackId); assert(t && trackAccepts(t, c), 'Clip is on an incompatible or missing track.');
    assert(integer(c.start, 0) && integer(c.duration, 1) && c.start + c.duration <= p.duration, 'Clip must fit within project duration.');
    assert(c.animationOffset === undefined || integer(c.animationOffset, -10_000_000), 'Invalid animation time offset.');
    assert(!c.groupId || p.groups.some(g => g.id === c.groupId), 'Clip references a missing group.');
    if (hasMedia(c)) { const a = assets.get(c.assetId); assert(a && a.kind === c.kind, 'Clip references missing/incompatible media.'); }
    if (hasSound(c)) { assert(finite(c.sourceIn, 0, assets.get(c.assetId)!.duration) && c.sourceIn + c.duration / p.fps <= assets.get(c.assetId)!.duration + 1e-8, 'Trim exceeds playable source media.'); assert(finite(c.gain, 0, 4) && typeof c.muted === 'boolean', 'Invalid audio gain/mute.'); assert((c.fadeOffset === undefined || integer(c.fadeOffset, -10_000_000)) && (c.fadeDuration === undefined || integer(c.fadeDuration, 1)), 'Invalid retained fade envelope.'); assert((c.fadeIn === undefined || integer(c.fadeIn, 0, c.fadeDuration ?? c.duration)) && (c.fadeOut === undefined || integer(c.fadeOut, 0, c.fadeDuration ?? c.duration)), 'Fade lengths must fit their envelope duration.'); }
    if (isVisual(c)) {
      assert(finite(c.x, -100000, 100000) && finite(c.y, -100000, 100000) && finite(c.width, 1, 32768) && finite(c.height, 1, 32768) && finite(c.opacity, 0, 1), 'Invalid clip geometry.');
      assert((c.rotation === undefined || finite(c.rotation, -360000, 360000)) && (c.scaleX === undefined || finite(c.scaleX, .001, 100)) && (c.scaleY === undefined || finite(c.scaleY, .001, 100)), 'Invalid rotation/scale.');
      if (isText(c)) assert(typeof c.text === 'string' && c.text.length <= 100000 && finite(c.fontSize, 1, 2048) && fonts.has(c.fontFamily) && ['400', '700'].includes(c.fontWeight) && colorOK(c.color) && ['left', 'center', 'right'].includes(c.align) && (c.lineHeight === undefined || finite(c.lineHeight, .5, 5)) && (c.decoration === undefined || ['none', 'underline', 'line-through'].includes(c.decoration)) && (c.background === undefined || c.background === 'transparent' || colorOK(c.background)), 'Invalid text properties or missing font.');
      else if (c.kind === 'shape') assert(['rectangle', 'ellipse', 'line'].includes(c.shape) && (colorOK(c.fill) || c.fill === 'transparent') && colorOK(c.stroke) && finite(c.strokeWidth, 0, 512) && finite(c.radius, 0, 16384), 'Invalid shape properties.');
      else assert(['cover', 'contain', 'fill'].includes(c.fit), 'Invalid media fit.');
    }
    assert(c.animations === undefined || Array.isArray(c.animations), 'Invalid animation channels.'); const properties = new Set<string>();
    for (const channel of c.animations ?? []) {
      assert(!properties.has(channel.property) && ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity', 'color', 'background', 'gain'].includes(channel.property), 'Invalid/duplicate animation property.'); properties.add(channel.property);
      assert(channel.property === 'gain' ? hasSound(c) : isVisual(c), 'Animation does not apply to this clip.'); assert(channel.property !== 'color' || isText(c), 'Color animation requires text.'); assert(channel.property !== 'background' || isText(c) || c.kind === 'shape', 'Background animation requires text or a shape.');
      assert(Array.isArray(channel.keyframes) && channel.keyframes.length > 0, 'Animation needs keyframes.'); let last = -Infinity;
      for (const k of channel.keyframes) {
        unique(k.id); assert(integer(k.frame, -10_000_000) && k.frame > last, 'Keyframes must have unique ascending frames.'); last = k.frame;
        if (channel.property === 'color' || channel.property === 'background') assert(colorOK(k.value), 'Keyframe requires a solid hex color.');
        else assert(finite(k.value, ['scaleX', 'scaleY'].includes(channel.property) ? .001 : channel.property === 'opacity' || channel.property === 'gain' ? 0 : -100000, ['scaleX', 'scaleY'].includes(channel.property) ? 100 : channel.property === 'opacity' ? 1 : channel.property === 'gain' ? 4 : 100000), 'Invalid numeric keyframe value.');
        assert(typeof k.easing === 'string' && k.easing.length < 160 && !k.easing.startsWith('spring('), 'Use segment easing, not a spring.'); parseEasing(k.easing); assert(++keys <= 100000, 'Too many keyframes.');
      }
    }
    const list = byTrack.get(c.trackId) ?? []; list.push(c); byTrack.set(c.trackId, list);
  }
  for (const [id, list] of byTrack) if (tracks.get(id)!.kind !== 'caption') { list.sort((a, b) => a.start - b.start); for (let i = 1; i < list.length; i++) assert(list[i].start >= list[i - 1].start + list[i - 1].duration, `Clips cannot overlap on ${tracks.get(id)!.name}. Use another layer.`); }
  const cuts = new Set<string>();
  for (const tr of p.transitions) {
    unique(tr.id); const a = clips.get(tr.outgoingId), b = clips.get(tr.incomingId);
    assert(a && b && a.trackId === b.trackId && a.kind !== 'audio' && b.kind !== 'audio' && a.kind !== 'caption' && b.kind !== 'caption' && a.start + a.duration === b.start, 'Transitions require touching visual clips on one track.');
    assert(!cuts.has(a.id) && integer(tr.duration, 2) && ['crossfade', 'slide', 'wipe'].includes(tr.type) && ['left', 'right', 'up', 'down'].includes(tr.direction), 'Invalid transition.'); cuts.add(a.id);
    const before = Math.floor(tr.duration / 2), after = tr.duration - before; assert(before < a.duration && after < b.duration, 'Transition is too long for neighboring clips.'); assert(b.start >= before, 'Transition extends before project start.');
    if (hasSound(a)) assert(a.sourceIn + (a.duration + after) / p.fps <= assets.get(a.assetId)!.duration + 1e-8, `Not enough outgoing source handles for ${a.name}. Trim its end first.`);
    if (hasSound(b)) assert(b.sourceIn >= before / p.fps - 1e-8, `Not enough incoming source handles for ${b.name}. Trim its start first.`);
  }
  for (const c of p.clips) { const incoming = p.transitions.find(t => t.incomingId === c.id), outgoing = p.transitions.find(t => t.outgoingId === c.id); assert((incoming ? Math.ceil(incoming.duration / 2) : 0) + (outgoing ? Math.floor(outgoing.duration / 2) : 0) <= c.duration, 'Transitions cannot create a triple overlap.'); }
  for (const m of p.markers) { unique(m.id); assert(integer(m.frame, 0, p.duration - 1) && nameOK(m.name), 'Invalid marker.'); }
  if (p.range) assert(integer(p.range.from, 0) && integer(p.range.toExclusive, p.range.from + 1, p.duration), 'Invalid marked export range.');
}
export function availableStart(p: EditorProject, trackId: string, duration: number, desired: number): number { let start = Math.max(0, desired); for (const c of p.clips.filter(c => c.trackId === trackId).sort((a, b) => a.start - b.start)) { if (start + duration <= c.start) break; if (start < c.start + c.duration) start = c.start + c.duration; } return start; }
export function describeTime(frame: number, fps: number): string { const s = Math.floor(frame / fps); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(frame % fps).padStart(2, '0')}`; }
