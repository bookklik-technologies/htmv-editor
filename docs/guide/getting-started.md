# Getting started

HTMV Editor runs entirely in the browser. Install the package, embed the mounted workspace, and start editing.

## Install

```sh
npm install @bookklik/htmv-editor @bookklik/htmv
```

The engine `@bookklik/htmv` is a peer dependency; install `0.1.2` or a compatible `0.1.x` release alongside the editor.

## Mount the editor

```ts
import { createEditor } from '@bookklik/htmv-editor';
import '@bookklik/htmv-editor/styles.css';

const editor = createEditor(document.querySelector<HTMLElement>('#editor')!, {
  storageKey: 'my-app'
});
await editor.ready;
```

Give the container an explicit height — the workspace minimum is 880×580 CSS pixels. On unmount, await `editor.destroy()` to cancel work, save, and dispose resources.

## Try the standalone app

You can also run the prebuilt standalone application:

```sh
npm install
npm run build
npm run dev   # http://127.0.0.1:8898/
```

Under WAMP, open [the editor](http://localhost/htmv-projects/htmv-editor/app/), the [embedding example](http://localhost/htmv-projects/htmv-editor/app/embed.html), or the [manual verification workspace](http://localhost/htmv-projects/htmv-editor/app/manual.html). Serve `app/` unchanged under localhost or HTTPS; relative URLs support subdirectories.

## First project

New projects start at 1920×1080, 30 fps, ten seconds, with a black background. Composition settings offer landscape, portrait, and square presets. Add video, images, text, shapes, and audio from the Layers panel; new text and shapes land on a new layer at the playhead. Clips extend the project duration when needed.

Buildless hosts can import `createEditor` from `app/htmv-editor.js` and link `app/styles.css` instead of installing the package.

## Next steps

- Embed [headless](/reference/headless) if you want your own UI.
- Read about the [workspace](/guide/workspace) — canvas, timeline, inspector, and tracks.
- Learn how [persistence](/guide/persistence) keeps documents safe across sessions.
- Export your composition as [MP4 or WebM](/guide/exporting).
