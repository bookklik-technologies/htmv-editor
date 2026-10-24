import type { EditorClip, EditorProject, MotionChannel } from './types.js';
import { describeTime } from './project.js';
import { button, esc, icon } from './ui.js';
import type { MediaCache } from './media.js';
export const TRACK_HEADER = 192;
interface Row { kind: 'track' | 'channel'; trackId: string; top: number; height: number; clip?: EditorClip; channel?: MotionChannel }
export class TimelineView {
  zoom = 72;
  private project: EditorProject | null = null;
  private selection = new Set<string>();
  private expanded = new Set<string>();
  private frame = 0;
  private raf = 0;
  private signature = '';
  constructor(readonly scroller: HTMLElement, readonly content: HTMLElement, private media: MediaCache, signal: AbortSignal, private onRender?: () => void) {
    scroller.addEventListener('scroll', () => { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); }); }, { signal });
    signal.addEventListener('abort', () => cancelAnimationFrame(this.raf), { once: true });
  }
  render(project: EditorProject, selection: Set<string>, frame: number, expanded: Set<string>, force = true): void { this.project = project; this.selection = selection; this.frame = frame; this.expanded = expanded; if (force) this.signature = ''; this.draw(); }
  setFrame(frame: number): void { this.frame = frame; const playhead = this.content.querySelector<HTMLElement>('.he-playhead'); if (playhead && this.project) playhead.style.left = `${TRACK_HEADER + frame / this.project.fps * this.zoom}px`; }
  select(ids: Set<string>): void { this.selection = ids; for (const el of this.content.querySelectorAll<HTMLElement>('[data-clip]')) el.classList.toggle('he-selected', ids.has(el.dataset.clip!)); }
  frameAt(clientX: number): number { if (!this.project) return 0; return Math.max(0, Math.round((clientX - this.content.getBoundingClientRect().left - TRACK_HEADER) / this.zoom * this.project.fps)); }
  ghost(clips: EditorClip[], valid: boolean): void {
    for (const c of clips) { const el = this.content.querySelector<HTMLElement>(`[data-clip="${c.id}"]`); if (el && this.project) { const lane = this.content.querySelector<HTMLElement>(`[data-lane="${c.trackId}"]`); if (lane && el.parentElement !== lane) lane.append(el); el.style.left = `${c.start / this.project.fps * this.zoom}px`; el.style.width = `${Math.max(3, c.duration / this.project.fps * this.zoom)}px`; el.classList.toggle('he-invalid', !valid); } }
  }
  private draw(): void {
    const p = this.project; if (!p) return;
    const rows: Row[] = []; let top = 34;
    const clipMap = new Map<string, EditorClip[]>();
    for (const c of p.clips) { const list = clipMap.get(c.trackId) ?? []; list.push(c); clipMap.set(c.trackId, list); }
    for (const t of p.tracks) { rows.push({ kind: 'track', trackId: t.id, top, height: 55 }); top += 55; for (const c of clipMap.get(t.id) ?? []) if (this.expanded.has(c.id)) for (const channel of c.animations ?? []) { rows.push({ kind: 'channel', trackId: t.id, top, height: 27, clip: c, channel }); top += 27; } }
    const left = this.scroller.scrollLeft, scrollTop = this.scroller.scrollTop, viewWidth = this.scroller.clientWidth || 900, viewHeight = this.scroller.clientHeight || 240;
    const visible = rows.filter(r => r.top + r.height >= scrollTop - 80 && r.top <= scrollTop + viewHeight + 100);
    const bucket = `${visible[0]?.top}/${visible.at(-1)?.top}/${Math.floor(left / 150)}/${viewWidth}/${this.zoom}`; if (bucket === this.signature) return; this.signature = bucket;
    const width = Math.max(viewWidth - TRACK_HEADER, p.duration / p.fps * this.zoom + 120), firstFrame = Math.max(0, (left - 160) / this.zoom * p.fps), lastFrame = (left + viewWidth - TRACK_HEADER + 160) / this.zoom * p.fps;
    const secondsStep = this.zoom >= 100 ? 1 : this.zoom >= 35 ? 2 : 5;
    const firstSecond = Math.max(0, Math.floor((left - 50) / this.zoom / secondsStep) * secondsStep), lastSecond = Math.ceil((left + viewWidth) / this.zoom);
    const ticks: string[] = []; for (let second = firstSecond; second <= lastSecond; second += secondsStep) ticks.push(`<span style="left:${second * this.zoom}px">${describeTime(second * p.fps, p.fps).slice(0, 5)}</span>`);
    const markers = p.markers.filter(m => m.frame >= firstFrame && m.frame <= lastFrame).map(m => `<button data-action="seek-marker" data-frame="${m.frame}" data-marker="${m.id}" style="left:${m.frame / p.fps * this.zoom}px" title="${esc(m.name)}" aria-label="Marker ${esc(m.name)}">${icon('marker')}</button>`).join('');
    const range = p.range ? `<div class="he-range" style="left:${p.range.from / p.fps * this.zoom}px;width:${(p.range.toExclusive - p.range.from) / p.fps * this.zoom}px"></div>` : '';
    this.content.style.width = `${width + TRACK_HEADER}px`; this.content.style.height = `${Math.max(top + 30, viewHeight)}px`;
    this.content.innerHTML = `<div class="he-time-row"><div class="he-track-label he-time-label">LAYERS <span>${p.tracks.length}</span></div><div class="he-ruler" data-ruler style="width:${width}px">${range}${ticks.join('')}${markers}</div></div>` + visible.map(row => {
      const t = p.tracks.find(t => t.id === row.trackId)!;
      if (row.kind === 'channel') {
        const c = row.clip!, ch = row.channel!, offset = c.animationOffset ?? 0;
        return `<div class="he-channel-row" style="top:${row.top}px;height:${row.height}px"><div class="he-track-label"><span>${icon('channel')} ${esc(ch.property)}</span><small>${esc(c.name)}</small></div><div class="he-channel-lane" data-channel-lane="${ch.property}" data-channel-clip="${c.id}" style="width:${width}px">${ch.keyframes.filter(k => c.start + k.frame - offset >= firstFrame && c.start + k.frame - offset <= lastFrame).map(k => `<button class="he-keyframe" data-keyframe="${k.id}" data-keyclip="${c.id}" data-property="${ch.property}" style="left:${(c.start + k.frame - offset) / p.fps * this.zoom}px" aria-label="${esc(ch.property)} keyframe at ${k.frame - offset}" title="${esc(k.value)} · ${esc(k.easing)}">${icon('key')}</button>`).join('')}</div></div>`;
      }
      const clips = (clipMap.get(t.id) ?? []).filter(c => c.start + c.duration >= firstFrame && c.start <= lastFrame);
      return `<div class="he-track-row ${t.hidden ? 'he-track-hidden' : ''}" style="top:${row.top}px;height:${row.height}px"><div class="he-track-label" data-track-select="${t.id}">${icon(t.kind === 'audio' ? 'audio' : t.kind === 'caption' ? 'caption' : 'layers')}<button class="he-track-name" data-action="select-track" data-track="${t.id}">${esc(t.name)}</button><div class="he-track-actions">${button(t.kind === 'audio' ? 'toggle-muted' : 'toggle-hidden', t.kind === 'audio' ? t.muted ? 'Unmute audio' : 'Mute audio' : t.hidden ? 'Show layer' : 'Hide layer', t.kind === 'audio' ? t.muted ? 'muted' : 'volume' : t.hidden ? 'eye-off' : 'eye', `data-track="${t.id}" class="${t.hidden ? 'is-active' : ''}"`)}${button('toggle-lock', t.locked ? 'Unlock layer' : 'Lock layer', t.locked ? 'lock' : 'unlock', `data-track="${t.id}" class="${t.locked ? 'is-active' : ''}"`)}</div></div><div class="he-lane ${t.locked ? 'he-locked-lane' : ''}" data-lane="${t.id}" style="width:${width}px">${clips.map(c => this.clipHTML(c, p)).join('')}${p.transitions.filter(tr => clips.some(c => c.id === tr.outgoingId)).map(tr => { const incoming = p.clips.find(c => c.id === tr.incomingId)!; return `<button class="he-transition" data-action="edit-transition" data-transition="${tr.id}" style="left:${(incoming.start - Math.floor(tr.duration / 2)) / p.fps * this.zoom}px;width:${Math.max(12, tr.duration / p.fps * this.zoom)}px" aria-label="${tr.type} transition" title="${tr.type} · ${tr.duration} frames">${icon('transition')}</button>`; }).join('')}</div></div>`;
    }).join('') + `<div class="he-playhead" style="left:${TRACK_HEADER + this.frame / p.fps * this.zoom}px"><span></span><i></i></div>`;
    this.onRender?.();
  }
  private clipHTML(c: EditorClip, p: EditorProject): string {
    const overview = 'assetId' in c ? this.media.get(c.assetId) : undefined;
    const sourcePeaks = overview?.peaks, asset = 'assetId' in c ? p.assets.find(a => a.id === c.assetId) : undefined;
    const peaks = sourcePeaks && asset?.duration ? Array.from({ length: 160 }, (_, i) => sourcePeaks[Math.max(0, Math.min(sourcePeaks.length - 1, Math.floor(((('sourceIn' in c ? c.sourceIn : 0) + i / 160 * c.duration / p.fps) / asset.duration) * sourcePeaks.length)))]) : sourcePeaks;
    const art = peaks && (c.kind === 'audio' || c.kind === 'video') ? `<svg class="he-waveform" viewBox="0 0 160 28" preserveAspectRatio="none" aria-label="Sampled audio waveform">${peaks.map((v, i) => `<path d="M${i} ${14 - v * 13}v${Math.max(.5, v * 26)}"/>`).join('')}</svg>` : overview?.url ? `<img src="${overview.url}" class="he-clip-thumb" alt="">` : '';
    return `<div class="he-clip he-${c.kind} ${this.selection.has(c.id) ? 'he-selected' : ''}" data-clip="${c.id}" tabindex="0" role="button" aria-label="${esc(c.name)}, start frame ${c.start}, duration ${c.duration}" style="left:${c.start / p.fps * this.zoom}px;width:${Math.max(3, c.duration / p.fps * this.zoom)}px"><span class="he-trim he-trim-left" data-trim="left"></span><div class="he-clip-name">${icon(c.kind)}<span>${esc(c.name)}</span>${c.animations?.length ? `<b>${icon('key')}</b>` : ''}</div>${art}<span class="he-trim he-trim-right" data-trim="right"></span></div>`;
  }
}
