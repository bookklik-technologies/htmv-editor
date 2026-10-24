import type { EditorClip, EditorProject, MotionChannel, MotionProperty } from './types.js';
import { hasSound, isText, isVisual, validateProject } from './project.js';
export const escapeHTML = (s: unknown): string => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const n = (v: number): string => Number(v.toFixed(10)).toString();
const propertyMap: Record<MotionProperty, string> = { x: 'translate-x', y: 'translate-y', scaleX: 'scale-x', scaleY: 'scale-y', rotation: 'rotate', opacity: 'opacity', color: 'color', background: 'background-color', gain: 'gain' };
function animation(c: EditorClip, channel: MotionChannel, offset: number, lead = 0, trail = 0): string {
  const keys = channel.keyframes, first = keys[0].frame, last = keys.at(-1)!.frame, length = Math.max(1, last - first);
  const value = (v: string | number): string => {
    if (channel.property === 'x' || channel.property === 'y') return `${n(Number(v) - (isVisual(c) ? c[channel.property] : 0))}px`;
    if (channel.property === 'rotation') return `${n(Number(v))}deg`;
    return typeof v === 'number' ? n(v) : v;
  };
  const held = !hasSound(c) && (lead || trail) ? ` sample-start="${lead}f" sample-end="${lead + c.duration - 1}f"` : '';
  const attrs = `target="#${c.id}" property="${propertyMap[channel.property]}" start="${first - offset}f" duration="${length}f" fill="both"${held}`;
  if (keys.length === 1) return `<hv-animation ${attrs} from="${escapeHTML(value(keys[0].value))}" to="${escapeHTML(value(keys[0].value))}"></hv-animation>`;
  return `<hv-animation ${attrs}>${keys.map(k => `<hv-keyframe offset="${(k.frame - first) / length}" value="${escapeHTML(value(k.value))}" easing="${escapeHTML(k.easing)}"></hv-keyframe>`).join('')}</hv-animation>`;
}
function clipHTML(p: EditorProject, c: EditorClip, lead = 0, trail = 0, scene = false, muted = false, hidden = false, captionLane = 0): string {
  const duration = c.duration + lead + trail, tag = scene ? 'hv-scene' : 'hv-sequence';
  const scope = `id="${c.id}_scope" ${scene ? '' : `start="${c.start - lead}f"`} duration="${duration}f"`;
  const y = isText(c) && c.kind === 'caption' ? c.y - captionLane * c.height : isVisual(c) ? c.y : 0;
  const style = isVisual(c) ? `position:absolute;left:${n(c.x)}px;top:${n(y)}px;width:${n(c.width)}px;height:${n(c.height)}px;opacity:${c.opacity}` : '';
  let media = '';
  if (hasSound(c)) {
    const sourceIn = Math.max(0, c.sourceIn - lead / p.fps), frames = Math.round(sourceIn * p.fps);
    const trim = Math.abs(sourceIn - frames / p.fps) < 1e-10 ? `${frames}f` : `${sourceIn.toFixed(12)}s`;
    media = `src="asset:${c.assetId}" trim-in="${trim}" gain="${muted || c.muted ? 0 : c.gain}" fade-in="${c.fadeIn ?? 0}f" fade-out="${c.fadeOut ?? 0}f" fade-offset="${(c.fadeOffset ?? 0) - lead}f" fade-duration="${c.fadeDuration ?? c.duration}f"`;
  }
  let leaf = '';
  if (c.kind === 'video') leaf = hidden ? p.assets.find(a => a.id === c.assetId)?.hasAudio ? `<hv-audio id="${c.id}" ${media} duration="${duration}f"></hv-audio>` : '' : `<hv-video id="${c.id}" ${media} duration="${duration}f" audio="${muted || c.muted ? 'mute' : 'include'}" fit="${c.fit}" style="${style}"></hv-video>`;
  if (c.kind === 'audio') leaf = `<hv-audio id="${c.id}" ${media} duration="${duration}f"></hv-audio>`;
  if (c.kind === 'image' && !hidden) leaf = `<img id="${c.id}" src="asset:${c.assetId}" style="${style};object-fit:${c.fit}">`;
  if (isText(c) && !hidden) leaf = `<p id="${c.id}" style="${style};font-family:${escapeHTML(c.fontFamily)};font-size:${c.fontSize}px;font-weight:${c.fontWeight};color:${c.color};background-color:${c.background ?? 'transparent'};text-align:${c.align};white-space:pre-wrap;overflow-wrap:anywhere;line-height:${c.lineHeight ?? 1.2};text-decoration-line:${c.decoration ?? 'none'}">${escapeHTML(c.text)}</p>`;
  if (c.kind === 'shape' && !hidden) leaf = `<div id="${c.id}" style="${style};background-color:${c.shape === 'line' ? c.strokeWidth ? c.stroke : 'transparent' : c.fill};border:${c.shape === 'line' ? 0 : c.strokeWidth}px solid ${c.stroke};border-radius:${c.shape === 'ellipse' ? '50%' : `${c.radius}px`}"></div>`;
  if (!leaf) return hidden && scene ? `<${tag} ${scope}></${tag}>` : '';
  let channels = (c.animations ?? []).filter(ch => !(ch.property === 'gain' && (muted || hasSound(c) && c.muted)) && !(hidden && ch.property !== 'gain'));
  // Animated transform channels replace the static transform in HTMV. Emit static channels too.
  if (isVisual(c) && !hidden) for (const property of ['rotation', 'scaleX', 'scaleY'] as const) if (!channels.some(ch => ch.property === property)) channels = [...channels, { property, keyframes: [{ id: 'constant', frame: 0, value: c[property] ?? (property === 'rotation' ? 0 : 1), easing: 'linear' }] }];
  return `<${tag} ${scope}>${leaf}${channels.map(ch => animation(c, ch, (c.animationOffset ?? 0) - lead, lead, trail)).join('')}</${tag}>`;
}
export function toComposition(p: EditorProject): string {
  validateProject(p);
  const tracks = [...p.tracks.filter(t => t.kind !== 'audio').reverse(), ...p.tracks.filter(t => t.kind === 'audio')];
  const solo = p.tracks.some(t => t.solo); const html: string[] = [];
  for (const track of tracks) {
    const clips = p.clips.filter(c => c.trackId === track.id).sort((a, b) => a.start - b.start); const used = new Set<string>(); const captionEnds: number[] = [];
    const mute = !!track.muted || solo && !track.solo;
    for (const c of clips) {
      if (used.has(c.id)) continue; used.add(c.id);
      if (track.kind === 'caption') {
        if (track.hidden) continue;
        let lane = captionEnds.findIndex(end => end <= c.start); if (lane < 0) lane = captionEnds.length; captionEnds[lane] = c.start + c.duration;
        html.push(clipHTML(p, c, 0, 0, false, mute, false, lane)); continue;
      }
      const chain: EditorClip[] = [c]; let next = p.transitions.find(t => t.outgoingId === c.id);
      while (next) { const incoming = clips.find(x => x.id === next!.incomingId)!; chain.push(incoming); used.add(incoming.id); next = p.transitions.find(t => t.outgoingId === incoming.id); }
      if (chain.length === 1) { for (const item of chain) html.push(clipHTML(p, item, 0, 0, false, mute, !!track.hidden)); continue; }
      const scenes: string[] = [];
      for (let i = 0; i < chain.length; i++) {
        const incoming = i ? p.transitions.find(t => t.incomingId === chain[i].id)! : null, outgoing = i < chain.length - 1 ? p.transitions.find(t => t.outgoingId === chain[i].id)! : null;
        scenes.push(clipHTML(p, chain[i], incoming ? Math.floor(incoming.duration / 2) : 0, outgoing ? Math.ceil(outgoing.duration / 2) : 0, true, mute, !!track.hidden));
        if (outgoing) scenes.push(`<hv-transition type="${outgoing.type}" direction="${outgoing.direction}" duration="${outgoing.duration}f"></hv-transition>`);
      }
      html.push(`<hv-series start="${c.start}f">${scenes.join('')}</hv-series>`);
    }
  }
  const fonts = p.assets.filter(a => a.kind === 'font').map(a => `<hv-asset id="${a.id}" kind="font" src="asset:${a.id}" family="${a.family}"></hv-asset>`).join('');
  return `<hv-composition id="${p.id}" width="${p.width}" height="${p.height}" fps="${p.fps}" duration="${p.duration}f" background="${p.background}">${fonts ? `<hv-assets>${fonts}</hv-assets>` : ''}${html.join('')}</hv-composition>`;
}
