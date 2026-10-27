# Introduction

HTMV Editor (`@bookklik/htmv-editor`) is a framework-independent TypeScript motion editor and a standalone browser application. Editing, decoding, storage, and rendering run locally in the browser. Its working target is a three-minute 1920×1080 project with roughly 100 clips, ten tracks, and 1,000 keyframes.

The editor is powered by the [HTMV](https://github.com/bookklik-technologies/htmv) engine, which provides compilation, rendering, playback, media inspection, frame inspection, and audio levels. The editor adds a complete authoring workspace on top: canvas manipulation, a frame-based timeline, keyframe animation, media management, captions, and export.

## Two ways to embed

Use the **mounted workspace** when you want the complete editor UI — canvas, timeline, inspector, panels, and keyboard shortcuts — inside your application.

Use the **headless entry** when your application owns the UI. The headless editor does not mount HTML, install keyboard handlers, or touch storage, yet it reuses the same project validation, commands, undo/redo, selection, composition conversion, archives, preview engine, and export pipeline as the mounted editor.

## What it covers

| Category | Scope |
|---|---|
| Authoring | Video, images, uniform text, rectangles, ellipses, lines, audio, and caption tracks |
| Motion | Clip-local channels with keyframes, easing presets, cubic Bézier, and motion presets |
| Transitions | Crossfade, slide, and wipe at touching cuts with engine-generated overlap |
| Captions | Manual cues, SRT/VTT import/export, frame-quantized timing, burned-in rendering |
| Persistence | IndexedDB documents with revision compare-and-swap, recovery, and `.htmv` ZIP archives |
| Export | MP4/WebM via WebCodecs with memory, file, and OPFS targets, preflight, and cancellation |

## Design principles

- **Local first.** Media, documents, and rendering never leave the device. No accounts, servers, or cloud services.
- **Frame-based.** Timing uses integer output frames throughout — clips, trims, captions, keyframes, and playback.
- **Typed commands.** All edits go through validated document commands, so undo/redo, selection, and persistence stay consistent regardless of which UI drives them.
- **Host-owned integration.** The headless API leaves persistence, asset acquisition, downloads, and unsaved-change prompts to the embedding application.

## Browsers and scope

Desktop Chrome/Edge are the target. Codecs, file pickers, storage quotas, hardware, and font metrics vary by browser and device. Serve the app over `localhost` or HTTPS; `file://` is unsupported. See [Scope and limits](/reference/scope-and-limits) for the full list of what is and is not included.

## Package

The npm package ships ESM-only with declarations for two entries:

| Entry | Responsibility |
|---|---|
| `@bookklik/htmv-editor` | Mounted editor workspace and full controller API |
| `@bookklik/htmv-editor/headless` | Headless controller for bring-your-own-UI hosts |

The engine is supplied through a `^0.1.2` peer dependency on `@bookklik/htmv`. Standalone builds bundle the installed engine.
