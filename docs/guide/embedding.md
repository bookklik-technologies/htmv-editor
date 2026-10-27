# Embedding

HTMV Editor can be mounted inside any web application, or driven headlessly with your own UI.

## Mounted workspace

```ts
import { createEditor, createProject } from '@bookklik/htmv-editor';
import '@bookklik/htmv-editor/styles.css';

const editor = createEditor(document.querySelector<HTMLElement>('#editor')!, {
  storageKey: 'my-application',
  onEvent(event) {
    if (event.type === 'diagnostic') console.error(event.operation, event.code, event.message);
    if (event.type === 'save') console.log(event.status, event.message);
  }
});
await editor.ready;

// Existing unsaved work is protected. This rejects if it cannot be saved.
await editor.loadProject(createProject('My composition'), {});

// On unmount, await cancellation, saving, and resource disposal.
await editor.destroy();
```

Key points:

- Give the container an explicit height; the workspace minimum is 880×580 CSS pixels.
- Styles and shortcuts are scoped to each instance.
- Use distinct `storageKey` values for independently persisted instances.
- `autosave: false` lets a host manage persistence. Before deliberately abandoning that host-managed document, pass `{ discardUnsaved: true }` to `loadProject`, `openArchive`, or `loadTemplate` only after the host has obtained the user's decision.

## Buildless embedding

From a source checkout, import `createEditor` from `app/htmv-editor.js` and link `app/styles.css`. The repository's `examples/embed.html` demonstrates mounting and asynchronously destroying two instances.

Buildless hosts can also serve `app/htmv-headless.js` and import `createHeadlessEditor` from it; see `examples/headless.html` (copied to `app/headless.html` during build) for host-owned controls.

## Headless embedding

For bring-your-own-UI hosts, the dedicated headless entry mounts no HTML, installs no keyboard handlers, opens no dialogs, loads no UI fonts/icons/styles, and does not access IndexedDB or localStorage:

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
editor.updateProject(draft => { draft.background = '#163325'; });
await editor.refreshPreview();
await editor.seek(30);
const archive = await editor.saveArchive(); // Persist/download the Blob yourself.
// await editor.loadProject(project, assets); // Validated, resets undo history.
// await editor.openArchive(archive);         // Restores project and media.
await editor.destroy();
```

The host owns controls, persistence, asset acquisition, downloads, and unsaved-change prompts. Omit `canvas` for DOM-free document editing, commands, selection, undo/redo, archives, and `toComposition()`. Headless is **UI-free**, not server-side video encoding: rendering, playback, and frame inspection still require a browser canvas and the same browser capabilities as the full editor. No stylesheet is needed.

After synchronous edits, call `await refreshPreview()` to redraw; `play()` and `seek()` refresh automatically. `inspectFrame()` requires a current preview. Async operations are serialized — await them before synchronous edits, otherwise editing throws. Callbacks must be synchronous; use events to update host state rather than mutating the editor reentrantly.

See the [headless reference](/reference/headless) for the full behavioral contract, and the [controller API](/reference/controller-api) for shared methods.
