# Exporting video

Export renders the composition through the HTMV engine and encodes MP4 or WebM with WebCodecs, entirely in the browser.

## The workflow

Export pauses playback and locks document editing. Choose:

- **Format:** MP4 or WebM.
- **Output dimensions** and **bitrate preset**.
- **Range:** the full composition or a marked range.
- **Output target:** memory, direct file, or temporary disk.

Encoder availability is probed for the chosen configuration. Strict audio synchronization preflight remains enabled; accepting an unverified warning is explicit and does not certify it. The audio peak meter reports canonical mixed PCM during playback, with clipping feedback.

## Preflight

```ts
const report = await editor.preflightExport({ profile: 'mp4' });
if (!report.supported) console.log(report.diagnostics);
```

## Stills

```ts
const png = await editor.exportStill();  // Optional frame argument.
```

## Cancelling

Pass an AbortSignal to cancel video export:

```ts
const abort = new AbortController();
await editor.exportVideo({
  profile: 'mp4',
  signal: abort.signal
});
```

## See also

- [Export targets](/reference/export-targets) — memory, file, and OPFS output with code examples.
- [Controller API](/reference/controller-api) — the full method reference.
