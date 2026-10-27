# Controller API

All public types are exported from the package. The full signatures ship in [dist/types.d.ts](https://github.com/bookklik-technologies/htmv-editor/blob/main/dist/types.d.ts); the source checkout keeps them in `src/types.ts`.

Both the mounted and headless editors share this controller API.

## Methods

| API | Behavior |
|---|---|
| `ready`, `getProject()`, `getAssets()` | Initialization and document/media snapshots |
| `loadProject(input, assets, options?)`, `openArchive(blob, options?)` | Validated replacement with unsaved-work protection; v1 input is accepted |
| `importFiles(files)`, `updateProject(fn)`, `dispatch(command)` | Inspected imports, validated transactions, typed document commands |
| `getSelection()`, `setSelection(ids)`, `inspectFrame(frame?)` | Selection and canonical evaluated geometry/values; inspection is empty while a new preview is pending/unavailable |
| `undo()`, `redo()`, `play()`, `pause()`, `seek(frame)` | Editing and frame-based playback |
| `flushSave()`, `hasUnsavedChanges`, `saveArchive()` | Observable persistence; the archive API returns a Blob and leaves download ownership to the host |
| `listTemplates()`, `saveTemplate(name)`, `loadTemplate(id, options?)` | Built-in and local templates |
| `importSubtitles(blob)`, `exportSubtitles('srt' \| 'vtt')` | Plain subtitle import and Blob sidecar export |
| `exportStill(frame?)`, `preflightExport(options?)` | PNG output and codec/audio capability checks |
| `exportVideo(options?)` | Existing `{ blob, extension, manifest }` API; the extension includes its leading dot |
| `exportToTarget(target, options?)` | Discriminated Blob/file/OPFS output |
| `getPerformanceMetrics()`, `destroy()` | Pointer feedback samples/p95 and asynchronous cleanup |

## Calling convention

Async operations are serialized; await them before synchronous edits, otherwise editing throws. Initialization and operation failures reject their promises; preview diagnostics also arrive through `onEvent`. `canUndo`/`canRedo` expose history availability.

## Commands

All edits flow through typed document commands. See [Commands](/reference/commands) for the catalog and validation rules.

## Events

Observe state through events rather than polling. See [Events](/reference/events) for the full list.
