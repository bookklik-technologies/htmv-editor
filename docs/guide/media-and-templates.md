# Media and templates

The Media panel manages assets; templates provide ready-made starting sequences.

## Media panel

The Media panel supports search, metadata, replacement and relinking, removal of unused assets, decoded video thumbnails, and sampled audio waveforms.

Replacement preserves clip timing and properties and is undoable. Source extent checks can reject a replacement that is shorter than the original. Waveforms are bounded sampled overviews, not complete sample-by-sample analysis.

## Templates

Three complete, media-free 1920×1080 sequences ship with finished copy, reusable text and graphic tracks, editable keyframes, chapter markers, and an optional soundtrack track:

| Template | ID | Runtime | Chapters |
|---|---|---|---|
| Malaysia: many stories | `builtin-malaysia` | 1:20 | 8 |
| HTML: build your first page | `builtin-html` | 1:48 | 10 |
| Malaysia, served fresh | `builtin-food` | 1:20 | 8 |

Preview cards show runtime and scene count. No images, fonts, music, or branding need replacing before use; the templates are intentionally silent. Narration and music can be added on the optional soundtrack track, but neither is required to export.

The previous `builtin-title`, `builtin-presentation`, and `builtin-lower` IDs remain aliases for those sequences, respectively.

## Working with templates

Save complete projects and media as local templates with `saveTemplate(name)`; opening a template creates independent project, clip, and track IDs. `loadTemplate(id, options?)` replaces the current document with unsaved-work protection.

Select a chapter marker from the Motion panel to jump to that section, then edit its named clips in the timeline or inspector. The HTML examples are editable displayed text, not executable code; the image filename in that lesson is a teaching example, not a missing template asset.

## Fonts

The inspector supports locally imported fonts. Imported fonts travel with the project and with `.htmv` archives, so reopening requires no relinking when the archive is complete.
