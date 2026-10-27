# Motion and transitions

Clips animate through clip-local channels with keyframes; clips join with generated transitions at cuts.

## Animation channels

Clip-local channels support X/Y position, scale X/Y, rotation, opacity, text color, shape and text background color, and audio gain. Add, remove, move, copy/paste, and navigate keys in the Animation inspector or the timeline.

Easing includes linear, ease-in/out/in-out, steps, and numeric cubic Bézier controls.

Auto-key creates keys for property edits; editing an already animated property also records a key at the playhead.

## Motion presets

Fade, slide, scale, and rise presets create editable entrance/exit keys and replace only the channels they affect.

A retained `animationOffset` keeps the original curve clock through trimming and splitting; moving a clip moves its animation with it. Audio fade envelopes retain their clock too. Editing fade lengths explicitly starts a new envelope for the current clip.

## Transitions

Select the outgoing clip at an existing touching cut to add crossfade, slide, or wipe.

A transition of `D` frames starts `floor(D/2)` frames before that cut and ends the remaining frames after it. Clip starts, nominal durations, and project duration remain fixed. Video must supply outgoing and incoming media handles; insufficient handles are rejected. Still image, text, and shape appearances hold their evaluated endpoint values in the added handles.

Transition overlap is generated for engine execution rather than saved as overlapping clips.
