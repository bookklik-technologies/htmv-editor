# Headless embedding

The headless entry (`@bookklik/htmv-editor/headless`) exposes the editor's core without any UI. It does not mount HTML, install keyboard handlers, open dialogs, load UI fonts/icons/styles, or access IndexedDB/localStorage. Your application owns controls, persistence, asset acquisition, downloads, and unsaved-change prompts.

It reuses the same project validation, commands, undo/redo, selection, composition conversion, archives, preview engine, and export pipeline as the mounted editor.

## Creating an editor

```ts
import { createHeadlessEditor, createProject } from '@bookklik/htmv-editor/headless';

const editor = createHeadlessEditor({
  project: createProject('Embedded project'),
  // Optional: your canvas enables browser preview, playback, and exports.
  canvas: document.querySelector<HTMLCanvasElement>('#preview')!,
  onEvent(event) {
    if (event.type === 'change') console.log(event.project);
  }
});
await editor.ready;
```

Omit `canvas` for DOM-free document editing, commands, selection, undo/redo, archives, and `toComposition()`.

## Preview and playback

```ts
editor.updateProject(draft => { draft.background = '#163325'; });
await editor.refreshPreview();
await editor.seek(30);
```

After synchronous edits, call `await refreshPreview()` to redraw; `play()` and `seek()` refresh automatically. `inspectFrame()` requires a current preview.

## Persistence

Headless never touches IndexedDB or localStorage. Use snapshots for host persistence:

- `getProject()` / `getAssets()` return snapshots to persist however the host chooses.
- `loadProject(project, assets)` performs validated replacement and resets undo history. Supply Blob assets keyed by asset ID when loading media projects; missing asset data is rejected rather than silently persisted.
- `saveArchive()` returns a Blob; the host persists or downloads it.
- `openArchive(archive)` restores project and media.

## Exports

Browser exports use `preflightExport()`, `exportStill()`, `exportVideo()`, and `exportToTarget()` with the same options and targets as the mounted editor. Pass an AbortSignal to cancel video export. See [Export targets](/reference/export-targets).

`destroy()` aborts owned work, waits for resource disposal, and cleans retained temporary OPFS outputs; consume those outputs before destroying the controller. The host retains ownership of its canvas.

## Calling convention

- Async operations are serialized; await them before synchronous edits, otherwise editing throws.
- Callbacks must be synchronous; use events to update host state rather than mutating the editor reentrantly.
- Initialization and operation failures reject their promises; preview diagnostics also arrive through `onEvent`.
- `canUndo`/`canRedo` expose history availability.

## What headless omits

Headless omits the mounted editor's media-import workflow, template library, appearance, autosave, and download dialogs. Prepare project and media bundles in the host, or open a `.htmv` archive.

## Buildless usage

Buildless hosts can serve `app/htmv-headless.js` and import `createHeadlessEditor` from it. See `examples/headless.html` (copied to `app/headless.html` during build) for host-owned controls.

Headless is **UI-free**, not server-side video encoding: rendering, playback, and frame inspection require a browser canvas and the same browser capabilities as the full editor. No stylesheet is needed.
