# HTMV Editor

`@htmv/editor` 0.2 is a framework-independent TypeScript motion editor and a standalone browser application. Editing, decoding, storage, and rendering run locally. Its working target is a three-minute 1920×1080 project with roughly 100 clips, ten tracks, and 1,000 keyframes.

## Build and serve

Install dependencies and run from `htmv-editor`. The engine is installed from npm; no sibling engine checkout is required:

```sh
npm install
npm run typecheck
npm run build
# Optional development server, http://127.0.0.1:8898/
npm run dev
```

The check/build scripts use the installed engine package and do not run unit tests. Ask before running unit tests in this workspace. The development server rebuilds editor bundles after source changes; reload to use the new build.

Build outputs:

The UI uses locally bundled **Outfit** (variable weight 100–900, SIL Open Font License) and **Lucide** SVG icons (ISC license). No font or icon CDN is required. Keep `fonts/` and `branding/` beside `styles.css` when copying the built stylesheet; build outputs include both licenses. UI typography does not change fonts authored inside project compositions.

Branding comes from the project's root `logo.svg` (header/About mark) and `icon.svg` (page favicon). The build adds scalable SVG viewports without changing their artwork, distributes them with both outputs, and versions their URLs for static hosting. Library consumers can import `@htmv/editor/logo.svg` and `@htmv/editor/icon.svg`. The UI uses the logo's green (`#00FF99`) for actions and status, blue (`#2563EB`) for navigation, selection, and keyboard focus, and yellow (`#FACC15`) for timeline highlights. Theme-aware shades and tinted selection surfaces keep these roles legible in dark and light modes; workspace surfaces stay neutral, and clip-type colors and error/warning semantics remain distinct.

| Directory | Contents |
| --- | --- |
| `dist/` | ESM library, declarations, source maps, scoped stylesheet; engine peer imports remain external |
| `app/` | Bundled standalone app, bundled ESM for buildless embedding, `embed.html`, and interactive `manual.html` |

Under WAMP, open [the editor](http://localhost/htmv-projects/htmv-editor/app/), [embedding example](http://localhost/htmv-projects/htmv-editor/app/embed.html), or [manual verification workspace](http://localhost/htmv-projects/htmv-editor/app/manual.html). Serve `app/` unchanged under localhost or HTTPS; relative URLs support subdirectories. `file://` is unsupported. No deployment or publication is performed.

**Engine compatibility:** HTMV Editor uses `@bookklik/htmv` version `0.1.2` or a compatible `0.1.x` release starting at `0.1.2`. The public package supplies compilation, rendering, playback, media inspection, frame inspection, held-animation sampling, retained fades, and audio levels. Library consumers provide the engine through the `^0.1.2` peer dependency; editor development pins `0.1.2`. Standalone builds bundle the installed engine. No local engine aliases or source builds are used.

## Appearance

The workspace supports iOS-inspired grouped surfaces in light and dark modes, with restrained glass on stationary chrome. Use the header's **Appearance** control to select System, Light, or Dark. System follows `prefers-color-scheme` changes. Reduced motion, reduced transparency, increased contrast, and forced-color styles have dedicated fallbacks.

`EditorOptions.appearance` accepts `'system' | 'light' | 'dark'`. The initial order is an explicit option, the namespace's remembered preference, then System. `editor.getAppearance()` returns the preference; `editor.setAppearance('dark')` updates it. An `appearance` event contains `preference` and resolved `'light' | 'dark'` values. Appearance changes do not modify projects, history, rendered compositions, or document revisions.

Preferences use localStorage under `htmv-editor:appearance:<encoded storageKey>` rather than the project database. Same-namespace instances synchronize in the page and across tabs; other namespaces remain independent. Failed writes retain the last choice in page memory, including across remounts, but cannot survive a page reload. Explicit initial options take precedence on each mount. Destruction releases system and storage listeners.

Serve `app/appearance.html` for an isolated interactive workbench with exact-size desktop containers, shared/independent instances, simulated system changes, and injected preference-write failure. These simulations do not change device settings or user project storage.

## Embed

```ts
import { createEditor, createProject } from '@htmv/editor';
import '@htmv/editor/styles.css';

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

Give the container an explicit height; the workspace minimum is 880×580 CSS pixels. Styles and shortcuts are scoped to each instance. Use distinct `storageKey` values for independently persisted instances. `autosave: false` lets a host manage persistence. Before deliberately abandoning that host-managed document, pass `{ discardUnsaved: true }` to `loadProject`, `openArchive`, or `loadTemplate` only after the host has obtained the user's decision.

For buildless embedding, import `createEditor` from `app/htmv-editor.js` and link `app/styles.css`. [examples/embed.html](examples/embed.html) demonstrates mounting and asynchronously destroying two instances.

## Workspace

New projects start at 1920×1080, 30 fps, ten seconds, with a black background. Composition settings offer landscape, portrait, and square presets. Clips extend project duration when needed; shortening cannot cut off existing clips. Visual/caption track order determines layering, with the first track on top.

- **Layers:** video, images, uniform text, rectangles, ellipses, lines, separate audio, and overlapping caption tracks. New text/shapes go on a new layer at the playhead. Choose **Selected track** for explicit insertion into an unlocked compatible track; overlaps are rejected there.
- **Canvas:** direct selection, drag outlines, rotation, Shift-constrained resizing, alignment guides, fit-relative zoom, and pan. The renderer redraws after a committed edit; drag feedback uses temporary geometry.
- **Timeline:** integer output frames, virtualized rows/visible clips, horizontal scrolling, zoom, trims, splits, dragging across compatible tracks, marker/boundary/playhead snapping. Alt bypasses snapping. Expand a selected clip's animation channels with **Show keyframes**.
- **Inspector:** numeric timing/geometry, fit, opacity, text styling, locally imported fonts, shapes, gain, mute, and fades. A focused inspector edit or pointer gesture is one undo transaction. Alignment/distribution uses authored layout boxes; groups combine selection/editing without parenting.
- **Track settings:** the layer's options button provides rename, order, visibility, lock, audio mute/solo, and deletion. The audio-track timeline button toggles mute. Visual visibility leaves its video audio available unless muted separately.
- **Media:** search, metadata, replacement/relinking, removal of unused assets, decoded video thumbnails, and sampled audio waveforms. Replacement preserves clip timing/properties and is undoable. Source extent checks can reject a shorter replacement.
- **Templates:** kinetic title, lower third, and image-presentation starter layouts. Replace presentation placeholders with imported images. Save complete projects and media as local templates; opening a template creates independent project/clip/track IDs.
- **Captions:** manual cues, plain SRT/VTT import, frame-quantized timing, per-cue styling, burned-in rendering, and SRT/VTT export. Overlapping cues are retained and stacked. VTT positioning/STYLE/REGION blocks and inline markup are rejected with a diagnostic.

## Motion and transitions

Clip-local channels support X/Y position, scale X/Y, rotation, opacity, text color, shape/text background color, and audio gain. Add, remove, move, copy/paste, and navigate keys in the Animation inspector or timeline. Easing includes linear, ease-in/out/in-out, steps, and numeric cubic Bézier controls. Auto-key creates keys for property edits; editing an already animated property also records a key at the playhead.

Fade, slide, scale, and rise presets create editable entrance/exit keys and replace only the channels they affect. A retained `animationOffset` keeps the original curve clock through trimming and splitting; moving a clip moves its animation with it. Audio fade envelopes retain their clock too. Editing fade lengths explicitly starts a new envelope for the current clip.

Select the outgoing clip at an existing touching cut to add crossfade, slide, or wipe. A transition of `D` frames starts `floor(D/2)` frames before that cut and ends the remaining frames after it. Clip starts, nominal durations, and project duration remain fixed. Video must supply outgoing/incoming media handles; insufficient handles are rejected. Still image/text/shape appearances hold their evaluated endpoint values in the added handles. Transition overlap is generated for engine execution rather than saved as overlapping clips.

## Persistence and recovery

The version-2 document saves composition settings, ordered tracks/state, typed clips, assets, animation channels, transitions, fonts, groups, markers, and an optional export range. Selection, playhead, caches, and undo history are transient. Version-1 documents and `.htmv` archives migrate in memory without changing existing IDs, timing, or properties; the next successful save writes version 2.

IndexedDB retains the original `htmv-editor-v1` database name and upgrades it additively. Media is written only when its Blob changes; document edits do not rewrite unchanged media. Revision compare-and-swap and cross-tab notifications prevent silent overwrites. A storage failure leaves the current document and undo history active. Project switching offers retry, save a copy, portable download, or explicit discard. Saving a copy preserves history while rebasing its project identity. The save indicator opens recovery controls.

The project picker supports rename, duplication, and recoverable deletion. Recovery keeps deleted projects **and their media**, so moving a project there does not free quota. Missing media can be relinked in the Media panel. Storage usage is available from the sidebar. Keep portable archives for important work; browser storage can be evicted or cleared.

A `.htmv` file is a ZIP containing `project.json` and `assets/<asset-id>`. Import validates versions, IDs, references, paths, entry counts, and expanded sizes before replacing the document. Limits are 256 MiB per asset, 512 MiB of current-project media, 8 MiB of JSON/subtitles, and 8,192 pixels / 33,554,432 pixels per decoded image surface. History retains up to 100 transactions and at most 1 GiB of distinct media references. Archives include imported fonts and media, so reopening requires no relinking when the archive is complete.

## Controller API

All public types are exported from the package. The full signatures are in [src/types.ts](src/types.ts).

| API | Behavior |
| --- | --- |
| `ready`, `getProject()`, `getAssets()` | Initialization and document/media snapshots |
| `loadProject(input, assets, options?)`, `openArchive(blob, options?)` | Validated replacement with unsaved-work protection; v1 input is accepted |
| `importFiles(files)`, `updateProject(fn)`, `dispatch(command)` | Inspected imports, validated transactions, typed document commands |
| `getSelection()`, `setSelection(ids)`, `inspectFrame(frame?)` | Selection and canonical evaluated geometry/values; inspection is empty while a new preview is pending/unavailable |
| `undo()`, `redo()`, `play()`, `pause()`, `seek(frame)` | Editing and frame-based playback |
| `flushSave()`, `hasUnsavedChanges`, `saveArchive()` | Observable persistence; archive API returns a Blob and leaves download ownership to the host |
| `listTemplates()`, `saveTemplate(name)`, `loadTemplate(id, options?)` | Built-in/local templates |
| `importSubtitles(blob)`, `exportSubtitles('srt' \| 'vtt')` | Plain subtitle import and Blob sidecar export |
| `exportStill(frame?)`, `preflightExport(options?)` | PNG output and codec/audio capability checks |
| `exportVideo(options?)` | Existing `{ blob, extension, manifest }` API; extension includes its leading dot |
| `exportToTarget(target, options?)` | Discriminated Blob/file/OPFS output |
| `getPerformanceMetrics()`, `destroy()` | Pointer feedback samples/p95 and asynchronous cleanup |

Commands include `patch`, `move`, `trim`, `split`, `remove`, `duplicate`, `group`, `ungroup`, `align`, `keyframe`, `remove-keyframe`, `preset`, `transition`, and `marker`. Command positions/durations use output frames; source in-points use seconds. Unknown/incompatible properties and invalid placements reject the complete transaction.

```ts
editor.dispatch({ type: 'keyframe', id: clipId, property: 'x', frame: 15, value: 320, easing: 'ease-out' });
editor.dispatch({ type: 'trim', id: clipId, edge: 'left', delta: 8 });
```

Events cover `change`, `selection` (including all selected IDs), `playback`, `diagnostic` (severity/code/operation), `save` (including error/conflict), and `export` progress/cancellation. `ready` means initialization finished; observe diagnostics for preview availability.

## Export targets

Export pauses playback and locks document editing. Choose MP4 or WebM, output dimensions, bitrate preset, full composition or marked range, and memory/direct-file/temporary-disk output. Encoder availability is probed for the chosen configuration. Strict audio synchronization preflight remains enabled; accepting an unverified warning is explicit and does not certify it. The audio peak meter reports canonical mixed PCM during playback, with clipping feedback.

```ts
const abort = new AbortController();
const report = await editor.preflightExport({ profile: 'mp4' });
if (!report.supported) console.log(report.diagnostics);

// Call the browser's picker directly from a trusted user gesture.
const handle = await window.showSaveFilePicker({ suggestedName: 'composition.mp4' });
const fileResult = await editor.exportToTarget({ kind: 'file', handle }, {
  profile: 'mp4', videoBitrate: 12_000_000,
  // Set only after the user explicitly accepts the engine's warning:
  allowUnverifiedAudio: false,
  signal: abort.signal
});

const diskResult = await editor.exportToTarget({ kind: 'opfs', name: 'composition' });
if (diskResult.kind === 'opfs') {
  try { await consumeFile(diskResult.file); }
  finally { await diskResult.cleanup(); }
}
```

Memory output defaults to a 128 MiB budget and rejects a larger estimate before rendering. File and OPFS targets remove that output-buffer limit; OPFS still depends on origin quota and a secure context. Consume OPFS files before calling `cleanup()` because deletion invalidates their backing file. The standalone app downloads outputs and manifests, then cleans temporary output. Partial/cancelled renders clean their owned output. Cleanup is also awaited during destruction.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| Space; Left/Right; Shift+Left/Right | Play/pause; step one frame; step ten frames |
| Ctrl/Cmd+Z; Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y | Undo; redo |
| Ctrl/Cmd+A; Ctrl/Cmd+C/X/V/D | Select all; internal clip copy/cut/paste/duplicate |
| Ctrl/Cmd+G; Ctrl/Cmd+Shift+G | Group; ungroup |
| S; Delete/Backspace | Split selected clips at playhead; remove selection |
| Alt+Left/Right; I / O | Move selection by frames; mark range start/end |
| Ctrl/Cmd+S; Escape | Download project archive; cancel pointer interaction/close dialog |

Shortcuts do not intercept text inputs. The internal clip clipboard is shared between mounted instances and released when its source instance is destroyed. It does not access the operating-system clipboard.

## Scope and verification

Desktop Chrome/Edge are the target. This delivery was exercised in the available Chromium in-app browser; separate branded Chrome/Edge verification remains outstanding. Codecs, file pickers, storage quotas, hardware, and font metrics vary by browser/device. Audio with more than two channels needs an external downmix. Waveforms are bounded sampled overviews, not complete sample-by-sample analysis. The three-minute benchmark uses synthetic shapes and keyframes, so its results do not predict heavy source decoding or text/font workloads.

Nested compositions, parenting, graph editing, automatic transcription, cloud services, accounts, remote media URLs, editable raw source, and transparent-video export remain outside this phase. See [VALIDATION.md](VALIDATION.md) for measured evidence and remaining checks. The manual fixture page uses an isolated storage namespace and does not replace standalone projects.
