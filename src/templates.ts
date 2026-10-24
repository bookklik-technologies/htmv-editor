import type { EditorProject, EditorTemplate, ShapeClip, TextClip } from './types.js';
import { createProject, clone, uid } from './project.js';
import { applyPreset } from './commands.js';
export const BUILTIN_TEMPLATES: EditorTemplate[] = [
  { id: 'builtin-title', name: 'Kinetic title', description: 'A bold title, a quiet subtitle, and a little movement.', builtin: true },
  { id: 'builtin-lower', name: 'Lower third', description: 'Introduce a person, a place, or your next idea.', builtin: true },
  { id: 'builtin-presentation', name: 'Image presentation', description: 'Two editable scene cards with a centered crossfade.', builtin: true }
];
export function freshProject(source: EditorProject, name = source.name): EditorProject {
  const p = clone(source); p.id = uid('project'); p.name = name.slice(0, 200); const ids = new Map<string, string>();
  for (const item of [...p.tracks, ...p.clips, ...p.transitions, ...p.markers, ...p.groups]) { const old = item.id; item.id = uid('item'); ids.set(old, item.id); }
  for (const c of p.clips) { c.trackId = ids.get(c.trackId)!; if (c.groupId) c.groupId = ids.get(c.groupId); for (const ch of c.animations ?? []) for (const k of ch.keyframes) k.id = uid('key'); }
  for (const t of p.transitions) { t.incomingId = ids.get(t.incomingId)!; t.outgoingId = ids.get(t.outgoingId)!; } return p;
}
export function builtinProject(id: string): EditorProject {
  const p = createProject(BUILTIN_TEMPLATES.find(t => t.id === id)?.name ?? 'Motion project'); p.background = '#10151e'; p.duration = 180; p.tracks = [];
  const track = (name: string): string => { const id = uid('track'); p.tracks.push({ id, name, kind: 'visual' }); return id; };
  const text = (name: string, value: string, y: number, size: number, color: string, duration = 180): TextClip => ({ id: uid('clip'), kind: 'text', name, trackId: track(name), start: 0, duration, text: value, x: 150, y, width: 1620, height: 180, opacity: 1, fontFamily: 'Arial', fontWeight: '700', fontSize: size, color, align: 'center' });
  const shape = (name: string, x: number, y: number, width: number, height: number, fill: string): ShapeClip => ({ id: uid('clip'), kind: 'shape', name, trackId: track(name), start: 0, duration: 180, x, y, width, height, opacity: 1, shape: 'rectangle', fill, stroke: fill, strokeWidth: 0, radius: 20 });
  if (id === 'builtin-lower') {
    const title = text('Name', 'Alex Morgan', 745, 68, '#f6f8fc'); title.align = 'left'; title.x = 180; title.height = 95;
    const sub = text('Role', 'Designer & storyteller', 846, 36, '#a5b2c7'); sub.align = 'left'; sub.x = 182; sub.fontWeight = '400';
    const plate = shape('Name plate', 130, 700, 1120, 260, '#222d3e'); p.clips.push(title, sub, plate); applyPreset(title, 'slide', p.fps); applyPreset(sub, 'fade', p.fps);
  } else if (id === 'builtin-presentation') {
    const title = text('Presentation heading', 'A different perspective.', 350, 100, '#ffffff'); const hint = text('Image placeholder', 'Import an image and place it on a layer below this title.', 505, 36, '#c3d8cf'); hint.fontWeight = '400';
    const first = shape('Scene 1', 90, 100, 1740, 850, '#21493f'); first.duration = 90;
    const second = { ...clone(first), id: uid('clip'), name: 'Scene 2', start: 90, duration: 90, fill: '#3b3355' }; p.clips.push(title, hint, first, second);
    p.transitions.push({ id: uid('transition'), outgoingId: first.id, incomingId: second.id, duration: 24, type: 'crossfade', direction: 'left' });
  } else {
    const title = text('Headline', 'Make your next move.', 395, 104, '#f5f7ef'); const sub = text('Subtitle', 'A little motion. A lot of possibility.', 550, 36, '#93a593'); sub.fontWeight = '400';
    const accent = shape('Accent line', 780, 710, 360, 8, '#c5f573'); accent.radius = 4;
    p.clips.push(title, sub, accent); applyPreset(title, 'rise', p.fps); applyPreset(sub, 'fade', p.fps); applyPreset(accent, 'scale', p.fps);
  }
  return p;
}
