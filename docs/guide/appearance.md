# Appearance

The workspace uses iOS-inspired grouped surfaces in light and dark modes, with restrained glass on stationary chrome. The header's **Appearance** control selects System, Light, or Dark. System follows `prefers-color-scheme` changes.

## Editor option

`EditorOptions.appearance` accepts `'system' | 'light' | 'dark'`. The initial preference resolves in this order:

1. An explicit option.
2. The namespace's remembered preference.
3. System.

`editor.getAppearance()` returns the current preference; `editor.setAppearance('dark')` updates it. An `appearance` event contains both the `preference` and the resolved `'light' | 'dark'` value.

Appearance changes do not modify projects, history, rendered compositions, or document revisions.

## Preference storage

Preferences use localStorage under `htmv-editor:appearance:<encoded storageKey>` rather than the project database. Same-namespace instances synchronize in the page and across tabs; other namespaces remain independent.

Failed writes retain the last choice in page memory, including across remounts, but cannot survive a page reload. Explicit initial options take precedence on each mount. Destruction releases system and storage listeners.

## Accessibility

Reduced motion, reduced transparency, increased contrast, and forced-color styles have dedicated fallbacks.

## Isolated workbench

Serve `app/appearance.html` for an isolated interactive workbench with exact-size desktop containers, shared and independent instances, simulated system changes, and injected preference-write failure. These simulations do not change device settings or user project storage.

## Brand colors

The UI uses the logo's green (`#00FF99`) for actions and status, blue (`#2563EB`) for navigation, selection, and keyboard focus, and yellow (`#FACC15`) for timeline highlights. Theme-aware shades and tinted selection surfaces keep these roles legible in dark and light modes; workspace surfaces stay neutral, and clip-type colors and error/warning semantics remain distinct.
