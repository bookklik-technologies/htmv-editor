# Captions

The editor supports caption tracks with manual cues, import, burned-in rendering, and sidecar export.

## Authoring cues

Captions live on caption tracks, which can overlap. Cues are frame-quantized: cue timing snaps to integer output frames. Each cue can be styled individually.

Overlapping cues are retained and stacked rather than rejected.

## Import and export

Plain SRT and WebVTT files can be imported. VTT positioning, `STYLE`/`REGION` blocks, and inline markup are rejected with a diagnostic.

Export produces an SRT or VTT sidecar as a Blob:

```ts
const srt = await editor.exportSubtitles('srt');
const vtt = await editor.exportSubtitles('vtt');
```

Burned-in rendering draws captions into the composition during preview and export.

## The API

| API | Behavior |
|---|---|
| `importSubtitles(blob)` | Import a plain SRT/VTT file with validated timing |
| `exportSubtitles('srt' \| 'vtt')` | Export a Blob sidecar in the chosen format |
