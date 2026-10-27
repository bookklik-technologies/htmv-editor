# Scope and limits

What the current release covers, where it stops, and how to verify it.

## Target environment

Desktop Chrome/Edge are the target. This delivery was exercised in the available Chromium in-app browser; separate branded Chrome/Edge verification remains outstanding.

Codecs, file pickers, storage quotas, hardware, and font metrics vary by browser and device. Serve the app over `localhost` or HTTPS; `file://` is unsupported.

## Known approximations

- Audio with more than two channels needs an external downmix.
- Waveforms are bounded sampled overviews, not complete sample-by-sample analysis.
- The three-minute benchmark uses synthetic shapes and keyframes, so its results do not predict heavy source decoding or text/font workloads.

## Outside this phase

The following remain outside the current release:

- Nested compositions
- Parenting
- Graph editing
- Automatic transcription
- Cloud services and accounts
- Remote media URLs
- Editable raw source
- Transparent-video export

## Engine compatibility

HTMV Editor uses `@bookklik/htmv` version `0.1.2` or a compatible `0.1.x` release starting at `0.1.2`. The engine supplies compilation, rendering, playback, media inspection, frame inspection, held-animation sampling, retained fades, and audio levels. Library consumers provide the engine through the `^0.1.2` peer dependency; standalone builds bundle the installed engine.

## Testing notes

The check and build scripts use the installed engine package and do not run unit tests. The manual fixture page uses an isolated storage namespace and does not replace standalone projects.
