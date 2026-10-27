# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are web developers who embed the editor library (`@htmv/editor`) into their own applications so their end users can create and export motion-graphics compositions. They integrate via the Controller API (`createEditor`, `dispatch`, events) and manage persistence with `storageKey` / host-managed autosave. The standalone browser app in `app/` is a direct-use surface and the reference implementation of the embed; a secondary audience is solo creators who use the standalone app directly to build kinetic titles, lower thirds, and social video.

## Product Purpose

HTMV Editor is a framework-independent TypeScript motion editor: editing, media decoding, storage, and rendering all run locally in the browser. It lets users compose video, images, text, shapes, audio, and captions on a multi-track timeline with keyframes, presets, transitions, and burned-in subtitles, then export MP4/WebM or PNG stills — with no accounts, servers, or uploads. Success is smooth editing of the stated working target: a three-minute 1920×1080 project with roughly 100 clips, ten tracks, and 1,000 keyframes, without UI degradation.

## Positioning

A fully local, embeddable motion editor. Both claims jointly: everything (editing, decoding, storage, rendering, export) runs in the browser with no cloud dependency, and any host app can mount the editor as a drop-in TypeScript component with scoped styles, independent persistence namespaces, and a typed Controller API. A cloud editor could not truthfully copy the privacy/no-server claim; a local editor like ours is unusual in being embeddable framework-independently with validated transactions and cross-tab-safe persistence.

## Operating Context

- Runs as an npm library (`@htmv/editor`) or a bundled standalone app served statically under localhost/HTTPS (WAMP at `http://localhost/htmv-projects/htmv-editor/app/`); `file://` is unsupported, no deployment/publication is performed.
- Development: `npm run typecheck`, `npm run build`, optional dev server at `http://127.0.0.1:8898/`.
- Persistence is browser-side: IndexedDB projects/media, localStorage preferences (`htmv-editor:appearance:<storageKey>`), `.htmv` ZIP archives for portability.
- Engine dependency: `@bookklik/htmv` `^0.1.2` peer (dev pins 0.1.2) supplies compilation, rendering, playback, and media inspection.
- Workbenches: `app/appearance.html` (appearance testing), `app/manual.html` (manual verification, isolated storage namespace).

## Capabilities and Constraints

Confirmed functionality (see README for full detail): multi-track timeline (video/image/text/shape/audio/captions), canvas direct manipulation, keyframed clip-local channels with easing, motion presets, clip transitions, subtitle import/export (SRT/VTT), templates, media panel with relinking, undo/redo, markers/export ranges, PNG stills and MP4/WebM export (memory/file/OPFS targets), Controller API with typed document commands and events.

Constraints:
- Desktop Chrome/Edge are the target; branded Chrome/Edge verification remains outstanding (exercised in available Chromium).
- Workspace minimum 880×580 CSS pixels; >2-channel audio needs external downmix; waveforms are bounded sampled overviews.
- Archive limits: 256 MiB/asset, 512 MiB current-project media, 8 MiB JSON/subtitles, 8,192 px / 33.5 MP decoded image surfaces.
- Out of scope this phase: nested compositions, parenting, graph editing, auto-transcription, cloud services, accounts, remote media URLs, editable raw source, transparent-video export.
- Documents save as version 2 with in-memory v1/`.htmv` migration; next save writes v2.
- Run unit tests only when asked; check/build scripts do not run them.

## Brand Commitments

- Name: HTMV Editor / `@htmv/editor`. Marks: root `logo.svg` (header/About) and `icon.svg` (favicon); build distributes versioned SVGs, importable as `@htmv/editor/logo.svg` and `@htmv/editor/icon.svg`.
- UI typography: locally bundled Outfit variable (100–900, SIL OFL). No font/icon CDN. UI typography never changes fonts authored inside project compositions.
- Icons: Lucide SVG (ISC).
- Color roles (from the logo): green `#00FF99` actions/status, blue `#2563EB` navigation/selection/keyboard focus, yellow `#FACC15` timeline highlights. Theme-aware shades and tinted selection surfaces keep roles legible in light and dark; workspace surfaces stay neutral; clip-type colors and error/warning semantics stay distinct.
- Appearance language: iOS-inspired grouped surfaces in light and dark modes with restrained glass on stationary chrome; System/Light/Dark selection via header control.

## Evidence on Hand

- README.md: authoritative feature/constraint documentation.
- Working implementation: `src/` (TypeScript modules), built outputs in `dist/` and `app/`.
- Real examples: `examples/embed.html`, `examples/captions.srt`, `examples/motion.html`, `examples/appearance.html`.
- Branding assets: `logo.svg`, `icon.svg` at project root.
- README references `VALIDATION.md` for measured evidence, but the file does not exist in the repository; do not cite validation results as verified until that file is present.

## Product Principles

- Local-first: every capability must keep working with no server, account, or network beyond initial asset loading.
- Embed without escape hatches: scoping, persistence isolation, unsaved-work protection, and clean teardown are product features, not implementation details.
- Protect the user's work: unsaved-work rejection, revision compare-and-swap, recovery, and explicit discard decisions outrank convenience.
- Performance is the success metric: the three-minute/100-clip benchmark defines acceptable interaction quality.
- Honest diagnostics: rejected operations, unverified warnings, and capability probes are surfaced explicitly, never silently degraded.

## Accessibility & Inclusion

Dedicated fallbacks exist for reduced motion, reduced transparency, increased contrast, and forced-colors modes. Appearance (System/Light/Dark) is user-selectable and persists per namespace. Keyboard shortcuts do not intercept text inputs; keyboard focus uses the designated blue treatment.
