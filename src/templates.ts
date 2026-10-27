import type { EditorProject, EditorTemplate, MotionProperty, ShapeClip, TextClip, VisualClip } from './types.js';
import { createProject, clone, uid, validateProject } from './project.js';
import { MALAYSIA_STORY, HTML_STORY, FOOD_STORY } from './template-stories.js';

export const BUILTIN_TEMPLATES: EditorTemplate[] = [
  { id: 'builtin-malaysia', name: 'Malaysia: many stories', description: 'A complete country introduction: cities, heritage, nature, and everyday culture.', builtin: true, durationSeconds: 80, sceneCount: 8, previewTitle: 'Many stories.\nOne Malaysia.', previewLabel: 'COUNTRY PORTRAIT' },
  { id: 'builtin-html', name: 'HTML: build your first page', description: 'A beginner-friendly lesson with real code, semantic structure, accessibility, and a recap.', builtin: true, durationSeconds: 108, sceneCount: 10, previewTitle: 'Your first\nHTML page.', previewLabel: 'A PRACTICAL MINI-LESSON' },
  { id: 'builtin-food', name: 'Malaysia, served fresh', description: 'A complete food guide: nasi lemak, roti canai, laksa, satay, and shared tables.', builtin: true, durationSeconds: 80, sceneCount: 8, previewTitle: 'A taste of\nMalaysia.', previewLabel: 'THE FOOD EDIT' }
];

interface Palette { background: string; ink: string; muted: string; accent: string; surface: string; display: 'Georgia' | 'Arial'; label: string }
const palettes: Record<string, Palette> = {
  'builtin-malaysia': { background: '#102B46', ink: '#FFF3DD', muted: '#C8D6E3', accent: '#EDBE62', surface: '#1A3C5A', display: 'Georgia', label: 'MALAYSIA / A COUNTRY PORTRAIT' },
  'builtin-html': { background: '#101D21', ink: '#F1F8F3', muted: '#B8CBC4', accent: '#92E6AE', surface: '#1B3035', display: 'Arial', label: 'HTML / FROM THE FIRST TAG' },
  'builtin-food': { background: '#FFF0D9', ink: '#5A2026', muted: '#74544B', accent: '#A62D35', surface: '#F3DFC1', display: 'Georgia', label: 'MALAYSIA / THE FOOD EDIT' }
};
const aliases: Record<string, string> = { 'builtin-title': 'builtin-malaysia', 'builtin-lower': 'builtin-food', 'builtin-presentation': 'builtin-html' };
export function isBuiltinTemplate(id: string): boolean { return BUILTIN_TEMPLATES.some(item => item.id === (aliases[id] ?? id)); }

export function freshProject(source: EditorProject, name = source.name): EditorProject {
  const p = clone(source); p.id = uid('project'); p.name = name.slice(0, 200); const ids = new Map<string, string>();
  for (const item of [...p.tracks, ...p.clips, ...p.transitions, ...p.markers, ...p.groups]) { const old = item.id; item.id = uid('item'); ids.set(old, item.id); }
  for (const c of p.clips) { c.trackId = ids.get(c.trackId)!; if (c.groupId) c.groupId = ids.get(c.groupId); for (const ch of c.animations ?? []) for (const k of ch.keyframes) k.id = uid('key'); }
  for (const t of p.transitions) { t.incomingId = ids.get(t.incomingId)!; t.outgoingId = ids.get(t.outgoingId)!; } return p;
}

export function builtinProject(id: string): EditorProject {
  const key = aliases[id] ?? id, template = BUILTIN_TEMPLATES.find(item => item.id === key);
  if (!template) throw new Error('Unknown built-in template: ' + id);
  const palette = palettes[key], scenes = key === 'builtin-malaysia' ? MALAYSIA_STORY : key === 'builtin-html' ? HTML_STORY : FOOD_STORY;
  const project = createProject(template.name);
  project.background = palette.background;
  project.duration = scenes.reduce((total, scene) => total + scene.seconds * project.fps, 0);
  project.range = { from: 0, toExclusive: project.duration };
  project.tracks = [];
  const tracks = new Map<number, string>(), layers = new Map<string, number>();
  const track = (layer: number, name: string): string => {
    let trackId = tracks.get(layer);
    if (!trackId) {
      trackId = uid('track'); tracks.set(layer, trackId); layers.set(trackId, layer);
      project.tracks.push({ id: trackId, name, kind: 'visual' });
    }
    return trackId;
  };
  let start = 0;
  scenes.forEach((scene, index) => {
    const duration = scene.seconds * project.fps, prefix = String(index + 1).padStart(2, '0') + ' / ';
    let textLayer = 0, shapeLayer = 0;
    project.markers.push({ id: uid('marker'), frame: start, name: prefix + scene.chapter });
    const animate = (clip: VisualClip, delay: number, move = false): void => {
      const end = duration - 1;
      const channel = (property: MotionProperty, values: [number, number][]): void => {
        clip.animations ??= [];
        clip.animations.push({ property, keyframes: values.map(([frame, value]) => ({ id: uid('key'), frame, value, easing: 'ease-in-out' })) });
      };
      channel('opacity', [[0, index === 0 ? 1 : 0], [delay + 16, 1], [end - 12, 1], [end, index === scenes.length - 1 ? 1 : 0]]);
      if (move && index > 0) channel('y', [[0, clip.y + 24], [delay + 20, clip.y], [end, clip.y]]);
    };
    const text = (name: string, value: string, x: number, y: number, width: number, height: number, size: number, color = palette.ink, display = false, mono = false): TextClip => {
      const layer = textLayer++;
      const clip: TextClip = { id: uid('clip'), kind: 'text', name: prefix + name, trackId: track(layer, layer < 4 ? name : layer === 4 ? 'Headlines' : layer === 5 ? 'Supporting copy' : 'Content detail ' + (layer - 5)), start, duration, text: value, x, y, width, height, opacity: 1, fontFamily: mono ? 'Courier New' : display ? palette.display : 'Arial', fontWeight: display || size < 25 ? '700' : '400', fontSize: size, color, align: 'left', lineHeight: 1.2 };
      animate(clip, Math.min(layer * 3, 24), size > 28);
      project.clips.push(clip);
      return clip;
    };
    const shape = (name: string, x: number, y: number, width: number, height: number, fill: string, radius = 0, layer = 100 + shapeLayer++): ShapeClip => {
      const clip: ShapeClip = { id: uid('clip'), kind: 'shape', name: prefix + name, trackId: track(layer, layer >= 180 ? name : 'Graphic layer ' + (layer - 99)), start, duration, x, y, width, height, opacity: 1, shape: 'rectangle', fill, stroke: palette.accent, strokeWidth: 0, radius };
      project.clips.push(clip);
      return clip;
    };
    text('Series label', palette.label, 120, 62, 1460, 36, 22, palette.accent);
    text('Chapter number', String(index + 1).padStart(2, '0') + ' / ' + String(scenes.length).padStart(2, '0'), 1650, 62, 160, 36, 22, palette.muted);
    text('Chapter label', scene.chapter.toUpperCase(), 120, 980, 1480, 35, 22, palette.muted);
    text('Chapter start time', Math.floor(start / project.fps / 60) + ':' + String(start / project.fps % 60).padStart(2, '0'), 1670, 980, 130, 35, 22, palette.muted);
    if (scene.layout === 'hero' || scene.layout === 'closing') {
      text('Main title', scene.title, 120, 235, 1660, 330, 116, palette.ink, true);
      text('Supporting copy', scene.body, 126, 622, 1630, 190, 40);
      text('Closing note', scene.note ?? '', 126, 864, 1630, 48, 24, palette.accent);
      shape('Editorial rule', 126, 190, 110, 6, palette.accent);
      shape('Footer rule', 120, 947, 1680, 2, palette.accent);
    } else if (scene.layout === 'cards') {
      text('Section heading', scene.title, 120, 175, 1680, 140, 70, palette.ink, true);
      text('Section introduction', scene.body, 120, 326, 1680, 70, 34, palette.muted);
      scene.items?.forEach((item, itemIndex) => {
        const x = 120 + itemIndex * 570;
        text('Item ' + (itemIndex + 1) + ' number', item.number ?? '', x + 32, 466, 480, 90, 64, palette.accent, true);
        text('Item ' + (itemIndex + 1) + ' title', item.label, x + 32, 590, 480, 100, 38, palette.ink, true);
        text('Item ' + (itemIndex + 1) + ' explanation', item.text, x + 32, 710, 480, 150, 28);
        shape('Item ' + (itemIndex + 1) + ' panel', x, 430, 540, 455, palette.surface, 12);
      });
      if (scene.note) text('Context note', scene.note, 120, 914, 1680, 36, 22, palette.muted);
    } else if (scene.layout === 'code') {
      text('Lesson heading', scene.title, 120, 230, 670, 260, 78, palette.ink, true);
      text('Lesson explanation', scene.body, 120, 558, 660, 230, 34, palette.muted);
      text('Example label', 'index.html / EXAMPLE', 900, 220, 830, 42, 24, palette.accent, false, true);
      text('Editable code example', scene.code ?? '', 900, 307, 860, 570, 31, palette.ink, false, true);
      text('Lesson takeaway', scene.note ?? '', 120, 905, 1680, 55, 22, palette.accent);
      shape('Code editor divider', 885, 280, 885, 2, palette.accent);
      shape('Code editor surface', 855, 186, 945, 707, palette.surface, 12);
    } else {
      text('Feature heading', scene.title, 120, 218, 980, 270, 80, palette.ink, true);
      text('Feature explanation', scene.body, 120, 560, 960, 240, 38, palette.muted);
      scene.items?.forEach((item, itemIndex) => {
        const y = 282 + itemIndex * 275;
        text('Feature ' + (itemIndex + 1) + ' label', item.label, 1210, y, 530, 60, 24, palette.accent);
        text('Feature ' + (itemIndex + 1) + ' details', item.text, 1210, y + 75, 530, 140, 30);
      });
      text('Context note', scene.note ?? '', 120, 895, 1660, 54, 22, palette.accent);
      shape('Feature panel', 1160, 222, 640, 610, palette.surface, 12);
    }
    const progress = shape('Chapter progress', 120, 1040, 1680, 4, palette.accent, 0, 180);
    progress.animations = [
      { property: 'scaleX', keyframes: [{ id: uid('key'), frame: 0, value: .001, easing: 'linear' }, { id: uid('key'), frame: duration - 1, value: 1, easing: 'linear' }] },
      { property: 'x', keyframes: [{ id: uid('key'), frame: 0, value: -719.16, easing: 'linear' }, { id: uid('key'), frame: duration - 1, value: 120, easing: 'linear' }] }
    ];
    shape('Scene background', 0, 0, 1920, 1080, palette.background, 0, 200);
    start += duration;
  });
  project.tracks.sort((left, right) => layers.get(left.id)! - layers.get(right.id)!);
  project.tracks.push({ id: uid('track'), name: 'Optional soundtrack', kind: 'audio' });
  validateProject(project, {});
  return project;
}
