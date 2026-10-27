# The workspace

The editing workspace combines a canvas, a frame-based timeline, an inspector, and panels for media, templates, and track settings.

## Layers

Projects hold video, images, uniform text, rectangles, ellipses, lines, separate audio, and overlapping caption tracks. Visual and caption track order determines layering, with the first track on top.

New text and shapes go on a new layer at the playhead. Choose **Selected track** for explicit insertion into an unlocked compatible track; overlaps are rejected there.

## Canvas

The canvas supports direct selection, drag outlines, rotation, Shift-constrained resizing, alignment guides, fit-relative zoom, and pan. The renderer redraws after a committed edit; drag feedback uses temporary geometry.

## Timeline

The timeline uses integer output frames with virtualized rows and visible clips, horizontal scrolling, zoom, trims, splits, and dragging clips across compatible tracks. Marker, boundary, and playhead snapping are built in; hold Alt to bypass snapping. Expand a selected clip's animation channels with **Show keyframes**.

Clips extend the project duration when needed; shortening the project cannot cut off existing clips.

## Inspector

The inspector edits numeric timing and geometry, fit, opacity, text styling, locally imported fonts, shapes, gain, mute, and fades. A focused inspector edit or pointer gesture is one undo transaction.

Alignment and distribution uses authored layout boxes. Groups combine selection and editing without parenting.

## Track settings

Each layer's options button provides rename, order, visibility, lock, audio mute/solo, and deletion. The audio-track timeline button toggles mute. Visual visibility leaves a video clip's audio available unless it is muted separately.

## Composition settings

New projects start at 1920×1080, 30 fps, ten seconds, with a black background. Composition settings offer landscape, portrait, and square presets. An optional export range can restrict rendered output.
