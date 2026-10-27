<script setup lang="ts">
import { withBase } from 'vitepress';
const previewUrl = withBase('/preview.png');
</script>

<template>
  <section class="home-preview" aria-labelledby="workspace-preview-title">
    <div class="container">
      <h2 id="workspace-preview-title">The editing workspace</h2>
      <img
        :src="previewUrl"
        alt="HTMV Editor workspace showing the canvas, timeline, inspector, and media panel"
        loading="lazy"
      >
    </div>
  </section>
</template>

<style scoped>
.home-preview {
  padding: 0 24px 48px;
}

.container {
  max-width: 1152px;
  margin: 0 auto;
}

h2 {
  margin-bottom: 20px;
  color: var(--vp-c-text-1);
  font-size: 24px;
  font-weight: 600;
  line-height: 1.4;
}

img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: #000;
}

@media (min-width: 640px) {
  .home-preview {
    padding: 0 48px 64px;
  }
}

@media (min-width: 960px) {
  .home-preview {
    padding-right: 64px;
    padding-left: 64px;
  }
}
</style>
