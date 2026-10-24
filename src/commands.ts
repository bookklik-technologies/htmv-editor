import type { EditorClip, EditorCommand, EditorProject, MotionProperty, VisualClip } from './types.js';
import { availableStart, clone, endFrame, hasSound, isText, isVisual, uid } from './project.js';

export function applyCommand(p: EditorProject, command: EditorCommand): string[] {
  const ids = 'ids' in command ? command.ids : 'id' in command ? [command.id] : command.type === 'transition' ? [command.incomingId, command.outgoingId] : [];
  const selected = p.clips.filter(c => ids.includes(c.id));
  for (const c of selected) if (p.tracks.find(t => t.id === c.trackId)?.locked) throw new Error('Unlock the layer before editing it.');
  const changedIds = selected.map(c => c.id);
  switch (command.type) {
    case 'patch': for (const c of selected) {
      const changes = { ...command.changes };
      if (Object.keys(changes).some(k => !['name', 'text', 'start', 'duration', 'sourceIn', 'x', 'y', 'width', 'height', 'opacity', 'rotation', 'scaleX', 'scaleY', 'gain', 'muted', 'fit', 'fontSize', 'fontFamily', 'fontWeight', 'color', 'align', 'lineHeight', 'decoration', 'background', 'shape', 'fill', 'stroke', 'strokeWidth', 'radius', 'fadeIn', 'fadeOut'].includes(k))) throw new Error('Unsupported clip property.');
      for (const key of Object.keys(changes)) { const compatible = ['name', 'start', 'duration'].includes(key) || ['sourceIn', 'gain', 'muted', 'fadeIn', 'fadeOut'].includes(key) && hasSound(c) || ['x', 'y', 'width', 'height', 'opacity', 'rotation', 'scaleX', 'scaleY'].includes(key) && isVisual(c) || ['text', 'fontSize', 'fontFamily', 'fontWeight', 'color', 'align', 'lineHeight', 'decoration', 'background'].includes(key) && isText(c) || key === 'fit' && (c.kind === 'image' || c.kind === 'video') || ['shape', 'fill', 'stroke', 'strokeWidth', 'radius'].includes(key) && c.kind === 'shape'; if (!compatible) throw new Error(`${key} is not available on ${c.kind} clips. Select compatible layers for this edit.`); }
      if ('duration' in changes) { if (!Number.isSafeInteger(changes.duration)) throw new Error('Duration must be an integer number of output frames.'); applyCommand(p, { type: 'trim', id: c.id, edge: 'right', delta: Number(changes.duration) - c.duration }); delete changes.duration; }
      Object.assign(c, changes);
      if (c.kind === 'shape' && c.shape === 'line') { if ('strokeWidth' in changes) c.height = Math.max(1, c.strokeWidth); else if ('height' in changes) c.strokeWidth = c.height; }
      if (hasSound(c) && ('fadeIn' in changes || 'fadeOut' in changes)) { delete c.fadeOffset; delete c.fadeDuration; }
    } break;
    case 'move': if (command.trackId && p.tracks.find(t => t.id === command.trackId)?.locked) throw new Error('Unlock the destination track before moving clips into it.'); for (const c of selected) { c.start += command.delta; if (command.trackId) c.trackId = command.trackId; } break;
    case 'trim': {
      const c = selected[0]; if (!c) break;
      if (hasSound(c)) { c.fadeOffset ??= 0; c.fadeDuration ??= c.duration; if (command.edge === 'left') c.fadeOffset += command.delta; }
      if (command.edge === 'left') { c.start += command.delta; c.duration -= command.delta; c.animationOffset = (c.animationOffset ?? 0) + command.delta; if (hasSound(c)) c.sourceIn += command.delta / p.fps; }
      else c.duration += command.delta;
      break;
    }
    case 'split': for (const c of selected) {
      const offset = command.frame - c.start; if (offset <= 0 || offset >= c.duration) continue;
      if (hasSound(c)) { c.fadeOffset ??= 0; c.fadeDuration ??= c.duration; }
      const second = clone(c); second.id = uid('clip'); second.start = command.frame; second.duration = c.duration - offset; second.animationOffset = (c.animationOffset ?? 0) + offset;
      for (const channel of second.animations ?? []) for (const k of channel.keyframes) k.id = uid('key');
      if (hasSound(second)) { second.sourceIn += offset / p.fps; second.fadeOffset = (second.fadeOffset ?? 0) + offset; }
      c.duration = offset;
      for (const t of p.transitions) if (t.outgoingId === c.id) t.outgoingId = second.id;
      p.clips.push(second); changedIds.push(second.id);
    } break;
    case 'remove': p.clips = p.clips.filter(c => !ids.includes(c.id)); p.transitions = p.transitions.filter(t => !ids.includes(t.incomingId) && !ids.includes(t.outgoingId)); break;
    case 'duplicate': {
      if (!selected.length) break;
      const first = Math.min(...selected.map(c => c.start)), last = Math.max(...selected.map(c => c.start + c.duration));
      let delta = (command.at ?? last) - first;
      if (command.at === undefined) for (let pass = 0; pass <= p.clips.length; pass++) { const before = delta; for (const c of selected) delta = Math.max(delta, availableStart(p, c.trackId, c.duration, c.start + delta) - c.start); if (delta === before) break; }
      const copies = clone(selected); const remapped = new Map<string, string>(); const groupIds = new Map<string, string>();
      for (const c of copies) {
        const oldId = c.id; c.id = uid('clip'); remapped.set(oldId, c.id); c.start += delta; c.name = `${c.name.slice(0, 190)} copy`;
        for (const ch of c.animations ?? []) for (const k of ch.keyframes) k.id = uid('key');
        if (c.groupId) { if (!groupIds.has(c.groupId)) { const group = { id: uid('group'), name: 'Copied group' }; groupIds.set(c.groupId, group.id); p.groups.push(group); } c.groupId = groupIds.get(c.groupId); }
      }
      for (const t of [...p.transitions]) if (remapped.has(t.outgoingId) && remapped.has(t.incomingId)) p.transitions.push({ ...t, id: uid('transition'), outgoingId: remapped.get(t.outgoingId)!, incomingId: remapped.get(t.incomingId)! });
      p.clips.push(...copies); changedIds.splice(0, changedIds.length, ...copies.map(c => c.id)); break;
    }
    case 'group': { if (selected.length < 2) break; const group = { id: uid('group'), name: `Group ${p.groups.length + 1}` }; p.groups.push(group); for (const c of selected) c.groupId = group.id; break; }
    case 'ungroup': for (const c of selected) delete c.groupId; break;
    case 'align': {
      const clips = selected.filter(isVisual); if (!clips.length) break;
      const minX = Math.min(...clips.map(c => c.x)), maxX = Math.max(...clips.map(c => c.x + c.width)), minY = Math.min(...clips.map(c => c.y)), maxY = Math.max(...clips.map(c => c.y + c.height));
      const move = (c: VisualClip, axis: 'x' | 'y', value: number): void => { const delta = value - c[axis]; c[axis] = value; for (const ch of c.animations ?? []) if (ch.property === axis) for (const k of ch.keyframes) k.value = Number(k.value) + delta; };
      if (command.mode.startsWith('distribute')) {
        const axis = command.mode === 'distribute-x' ? 'x' : 'y', size = axis === 'x' ? 'width' : 'height'; const sorted = [...clips].sort((a, b) => a[axis] - b[axis]);
        if (sorted.length < 3) break;
        const span = sorted.at(-1)![axis] + sorted.at(-1)![size] - sorted[0][axis]; const gap = (span - sorted.reduce((s, c) => s + c[size], 0)) / (sorted.length - 1); let at = sorted[0][axis];
        for (const c of sorted) { move(c, axis, at); at += c[size] + gap; }
      } else for (const c of clips) {
        const canvas = clips.length === 1;
        switch (command.mode) {
          case 'left': move(c, 'x', canvas ? 0 : minX); break; case 'right': move(c, 'x', (canvas ? p.width : maxX) - c.width); break;
          case 'center': move(c, 'x', (canvas ? p.width / 2 : (minX + maxX) / 2) - c.width / 2); break;
          case 'top': move(c, 'y', canvas ? 0 : minY); break; case 'bottom': move(c, 'y', (canvas ? p.height : maxY) - c.height); break;
          case 'middle': move(c, 'y', (canvas ? p.height / 2 : (minY + maxY) / 2) - c.height / 2); break;
        }
      }
      break;
    }
    case 'keyframe': {
      const c = selected[0]; if (!c) break; c.animations ??= [];
      let channel = c.animations.find(ch => ch.property === command.property);
      if (!channel) { channel = { property: command.property, keyframes: [] }; c.animations.push(channel); }
      const frame = command.frame + (c.animationOffset ?? 0); const old = channel.keyframes.find(k => k.frame === frame);
      if (old) { old.value = command.value; old.easing = command.easing ?? old.easing; }
      else channel.keyframes.push({ id: uid('key'), frame, value: command.value, easing: command.easing ?? 'ease-in-out' });
      channel.keyframes.sort((a, b) => a.frame - b.frame); break;
    }
    case 'remove-keyframe': {
      const c = selected[0]; if (!c) break; for (const ch of c.animations ?? []) if (ch.property === command.property) ch.keyframes = ch.keyframes.filter(k => k.id !== command.keyframeId); c.animations = c.animations?.filter(ch => ch.keyframes.length); break;
    }
    case 'preset': for (const c of selected) applyPreset(c, command.preset, p.fps); break;
    case 'transition': p.transitions = p.transitions.filter(t => t.outgoingId !== command.outgoingId); p.transitions.push({ id: uid('transition'), outgoingId: command.outgoingId, incomingId: command.incomingId, duration: command.duration, type: command.transition, direction: command.direction ?? 'left' }); break;
    case 'marker': p.markers.push({ id: uid('marker'), frame: command.frame, name: command.name }); break;
  }
  p.groups = p.groups.filter(g => p.clips.some(c => c.groupId === g.id)); p.duration = Math.max(p.duration, endFrame(p)); return changedIds;
}
export function applyPreset(c: EditorClip, preset: 'fade' | 'slide' | 'scale' | 'rise', fps: number): void {
  if (!isVisual(c)) return;
  if (c.duration < 3) { c.animations = [...(c.animations ?? []).filter(ch => ch.property !== 'opacity'), { property: 'opacity', keyframes: [{ id: uid('key'), frame: c.animationOffset ?? 0, value: c.opacity, easing: 'linear' }] }]; return; }
  const end = Math.max(1, c.duration - 1), ramp = Math.max(1, Math.min(Math.round(fps * .4), Math.floor(end / 3))), offset = c.animationOffset ?? 0;
  const set = (property: MotionProperty, values: [number, number | string][]): void => {
    const frames = new Map(values); c.animations ??= []; c.animations = c.animations.filter(ch => ch.property !== property);
    c.animations.push({ property, keyframes: [...frames].sort((a, b) => a[0] - b[0]).map(([frame, value]) => ({ id: uid('key'), frame: frame + offset, value, easing: 'ease-out' })) });
  };
  set('opacity', [[0, 0], [ramp, c.opacity], [Math.max(ramp, end - ramp), c.opacity], [end, 0]]);
  if (preset === 'slide' || preset === 'rise') set(preset === 'slide' ? 'x' : 'y', [[0, (preset === 'slide' ? c.x : c.y) + 90], [ramp, preset === 'slide' ? c.x : c.y], [end - ramp, preset === 'slide' ? c.x : c.y], [end, (preset === 'slide' ? c.x : c.y) - 50]]);
  if (preset === 'scale' || preset === 'rise') for (const prop of ['scaleX', 'scaleY'] as const) set(prop, [[0, .8], [ramp, c[prop] ?? 1], [end - ramp, c[prop] ?? 1], [end, .95]]);
}
