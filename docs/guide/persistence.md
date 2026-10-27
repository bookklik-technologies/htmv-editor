# Persistence and recovery

Documents persist to IndexedDB with conflict detection, and travel as portable ZIP archives.

## Storage model

The version-2 document saves composition settings, ordered tracks and state, typed clips, assets, animation channels, transitions, fonts, groups, markers, and an optional export range. Selection, playhead, caches, and undo history are transient.

Version-1 documents and `.htmv` archives migrate in memory without changing existing IDs, timing, or properties; the next successful save writes version 2.

IndexedDB retains the original `htmv-editor-v1` database name and upgrades it additively. Media is written only when its Blob changes; document edits do not rewrite unchanged media.

## Conflict protection

A revision compare-and-swap and cross-tab notifications prevent silent overwrites. A storage failure leaves the current document and undo history active. Project switching offers retry, save a copy, portable download, or explicit discard. Saving a copy preserves history while rebasing its project identity. The save indicator opens recovery controls.

## Projects

The project picker supports rename, duplication, and recoverable deletion. Recovery keeps deleted projects **and their media**, so moving a project there does not free quota. Missing media can be relinked in the Media panel. Storage usage is available from the sidebar.

Keep portable archives for important work; browser storage can be evicted or cleared.

## Archives

A `.htmv` file is a ZIP containing `project.json` and `assets/<asset-id>`. Import validates versions, IDs, references, paths, entry counts, and expanded sizes before replacing the document.

Limits:

| Limit | Value |
|---|---|
| Per asset | 256 MiB |
| Current-project media | 512 MiB |
| JSON/subtitles | 8 MiB |
| Decoded image surface | 8,192 pixels per side / 33,554,432 pixels total |

History retains up to 100 transactions and at most 1 GiB of distinct media references.

Archives include imported fonts and media, so reopening requires no relinking when the archive is complete. Use `saveArchive()` to obtain a Blob; the host decides where to store or download it.
