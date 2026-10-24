import type { CaptionClip, EditorProject } from './types.js';
import { uid } from './project.js';
export interface SubtitleCue { start: number; end: number; text: string }
function timestamp(value: string): number {
  const m = /^(?:(\d{1,3}):)?(\d{2}):(\d{2})[,.](\d{3})$/.exec(value.trim());
  if (!m || Number(m[2]) > 59 || Number(m[3]) > 59) throw new Error(`Invalid subtitle timestamp: ${value}`);
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}
export function parseSubtitles(text: string, fps: number): SubtitleCue[] {
  if (text.length > 8 * 1024 * 1024) throw new Error('Subtitle metadata exceeds 8 MiB.');
  const blocks = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n\s*\n/); const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.trim().split('\n'); if (!block.trim() || /^WEBVTT(?:\s|$)/.test(lines[0]) || /^NOTE(?:\s|$)/.test(lines[0])) continue;
    if (/^(STYLE|REGION)(?:\s|$)/.test(lines[0])) throw new Error('Subtitle STYLE and REGION blocks are not supported.');
    const i = lines.findIndex(l => l.includes('-->')); if (i < 0) throw new Error('Subtitle cue is missing its timing line.');
    const match = /^(\S+)\s+-->\s+(\S+)\s*$/.exec(lines[i]); if (!match) throw new Error('Cue positioning settings are unsupported; import plain timed captions.');
    const from = timestamp(match[1]), to = timestamp(match[2]); if (to <= from) throw new Error('Subtitle end must follow its start.');
    const body = lines.slice(i + 1).join('\n'); if (/<[^>]*>/.test(body)) throw new Error('Import plain-text subtitles without inline markup.');
    const start = Math.round(from * fps), end = Math.max(start + 1, Math.round(to * fps)); if (!body.trim()) continue;
    cues.push({ start, end, text: body }); if (cues.length > 10000) throw new Error('Too many subtitle cues.');
  }
  if (!cues.length) throw new Error('No subtitle cues were found.'); return cues.sort((a, b) => a.start - b.start);
}
export function makeCaption(p: EditorProject, trackId: string, start: number, duration: number, text = 'Your caption here'): CaptionClip {
  return { id: uid('clip'), name: text.slice(0, 80) || 'Caption', kind: 'caption', trackId, start, duration, text, x: p.width * .08, y: p.height * .81, width: p.width * .84, height: p.height * .13, opacity: 1, color: '#ffffff', background: '#17191f', fontFamily: 'Arial', fontWeight: '700', fontSize: Math.round(p.height / 22), align: 'center', lineHeight: 1.3 };
}
export function subtitleBlob(p: EditorProject, format: 'srt' | 'vtt'): Blob {
  const time = (frame: number): string => { const ms = Math.round(frame / p.fps * 1000), sec = Math.floor(ms / 1000); return `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}${format === 'srt' ? ',' : '.'}${String(ms % 1000).padStart(3, '0')}`; };
  const cues = p.clips.filter((c): c is CaptionClip => c.kind === 'caption' && !p.tracks.find(t => t.id === c.trackId)?.hidden).sort((a, b) => a.start - b.start);
  return new Blob([(format === 'vtt' ? 'WEBVTT\n\n' : '') + cues.map((c, i) => `${i + 1}\n${time(c.start)} --> ${time(c.start + c.duration)}\n${c.text}\n`).join('\n')], { type: format === 'vtt' ? 'text/vtt' : 'application/x-subrip' });
}
