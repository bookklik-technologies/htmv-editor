import { defineConfig } from 'vitepress';

// GitHub Pages deploys project sites under the repository slug
// (https://bookklik-technologies.github.io/htmv-editor/). Override locally with VITEPRESS_BASE.
const base = process.env.VITEPRESS_BASE ?? '/htmv-editor/';

export default defineConfig({
  base,
  appearance: 'dark',
  lang: 'en-US',
  title: 'HTMV Editor',
  description:
    'A local browser motion graphics editor powered by HTMV. Mount the full workspace or embed the headless controller and export MP4 or WebM.',
  sitemap: {
    hostname: 'https://bookklik-technologies.github.io/htmv-editor/'
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}icon.svg` }]
  ],
  cleanUrls: true,
  markdown: {
    lineNumbers: false
  },
  themeConfig: {
    logo: { src: '/logo.svg', alt: 'HTMV Editor' },
    nav: [
      { text: 'Guide', link: '/guide/introduction', activeMatch: '/guide/' },
      { text: 'Reference', link: '/reference/controller-api', activeMatch: '/reference/' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Getting started',
          collapsed: false,
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Embedding', link: '/guide/embedding' },
            { text: 'Appearance', link: '/guide/appearance' }
          ]
        },
        {
          text: 'Authoring',
          collapsed: false,
          items: [
            { text: 'The workspace', link: '/guide/workspace' },
            { text: 'Motion and transitions', link: '/guide/motion-and-transitions' },
            { text: 'Media and templates', link: '/guide/media-and-templates' },
            { text: 'Captions', link: '/guide/captions' }
          ]
        },
        {
          text: 'Projects & output',
          collapsed: false,
          items: [
            { text: 'Persistence and recovery', link: '/guide/persistence' },
            { text: 'Exporting video', link: '/guide/exporting' },
            { text: 'Keyboard shortcuts', link: '/guide/shortcuts' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          collapsed: false,
          items: [
            { text: 'Controller API', link: '/reference/controller-api' },
            { text: 'Commands', link: '/reference/commands' },
            { text: 'Events', link: '/reference/events' },
            { text: 'Headless embedding', link: '/reference/headless' },
            { text: 'Export targets', link: '/reference/export-targets' },
            { text: 'Scope and limits', link: '/reference/scope-and-limits' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/bookklik-technologies/htmv-editor' }
    ],
    outline: { level: [2, 3], label: 'On this page' },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: 'Search docs', buttonAriaLabel: 'Search docs' }
        }
      }
    },
    footer: {
      message: 'HTMV Editor — motion graphics for the browser',
      copyright: 'Copyright © 2026 Bookklik Technologies'
    },
    docFooter: { prev: 'Previous', next: 'Next' },
    lastUpdated: true
  },
  vite: {
    build: {
      chunkSizeWarningLimit: 2000
    }
  }
});
