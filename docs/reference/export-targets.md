# Export targets

Export output goes to one of three targets through `exportToTarget(target, options?)`.

## File target

Call the browser's picker directly from a trusted user gesture, then pass the handle:

```ts
const handle = await window.showSaveFilePicker({ suggestedName: 'composition.mp4' });
const fileResult = await editor.exportToTarget({ kind: 'file', handle }, {
  profile: 'mp4',
  videoBitrate: 12_000_000,
  // Set only after the user explicitly accepts the engine's warning:
  allowUnverifiedAudio: false,
  signal: abort.signal
});
```

## OPFS target

```ts
const diskResult = await editor.exportToTarget({ kind: 'opfs', name: 'composition' });
if (diskResult.kind === 'opfs') {
  try {
    await consumeFile(diskResult.file);
  } finally {
    await diskResult.cleanup();
  }
}
```

Consume OPFS files before calling `cleanup()` because deletion invalidates their backing file. OPFS depends on origin quota and a secure context.

## Memory target

Memory output defaults to a 128 MiB budget and rejects a larger estimate before rendering. File and OPFS targets remove that output-buffer limit.

## Options

| Option | Purpose |
|---|---|
| `profile` | `'mp4'` or `'webm'` |
| `videoBitrate` | Target bitrate in bits per second |
| `allowUnverifiedAudio` | Explicitly accept an unverified audio-sync warning |
| `signal` | AbortSignal to cancel the export |

Encoder availability is probed for the chosen configuration; run `preflightExport()` first and inspect the report's diagnostics when unsupported.

## Lifecycle

Export pauses playback and locks document editing. Partial and cancelled renders clean their owned output. The standalone app downloads outputs and manifests, then cleans temporary output. Cleanup is also awaited during `destroy()`.
