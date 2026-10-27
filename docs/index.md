---
layout: home

hero:
  name: HTMV Editor
  text: Motion graphics for the browser
  tagline: A local, framework-independent TypeScript motion editor. Mount the full workspace, embed the headless controller, and export MP4 or WebM — everything runs on the device.
  image:
    src: /logo.svg
    alt: HTMV Editor mark
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Introduction
      link: /guide/introduction
    - theme: alt
      text: Controller API
      link: /reference/controller-api

features:
  - icon: 🎬
    title: Complete editing workspace
    details: Canvas, timeline, inspector, media panel, and track settings. Direct manipulation, snapping, keyframes, and grouped undo transactions.
  - icon: 🧩
    title: Headless embedding
    details: Bring your own UI. The headless entry reuses the same project validation, commands, undo/redo, archives, preview engine, and export pipeline without mounting HTML.
  - icon: ⏱️
    title: Frame-accurate timing
    details: Integer output frames, marker/boundary/playhead snapping, frame-quantized captions, and frame-based seek and inspection.
  - icon: 💾
    title: Local persistence
    details: IndexedDB storage with revision compare-and-swap, cross-tab notifications, recovery controls, and portable ZIP archives.
  - icon: 📦
    title: Export in the browser
    details: Render MP4 or WebM with WebCodecs. Memory, file-picker, and OPFS output targets with preflight checks and cancellation.
  - icon: 🎨
    title: Light and dark themes
    details: iOS-inspired grouped surfaces with System, Light, and Dark modes. Synchronized preferences per storage namespace.
---
