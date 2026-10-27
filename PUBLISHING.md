# Manual npm publishing

This project is prepared for publication as the ESM-only package `@htmv/editor`. Nothing is published by the build, prepack, or package inspection scripts.

## Before publishing

1. Confirm that you own or can publish under the `@htmv` npm scope. If not, change `name` in `package.json` and regenerate the lockfile with `npm install --package-lock-only`. Update the documented imports too.
2. Select an unpublished version. The current version is `0.3.0`; registry availability has not been assumed or checked. Use `npm version patch --no-git-tag-version` (or the desired version) to update both manifests without committing or tagging.
3. Use a current supported Node.js LTS with npm, install with `npm ci`, and review the repository changes and MIT license.
4. Add your real repository/homepage/bugs URLs if desired; no placeholder URLs are included.

## Local release checks (no unit tests)

```sh
npm run typecheck
npm run pack:check
npm pack
```

Both pack commands run `prepack`, which rebuilds JavaScript, TypeScript declarations, CSS, fonts, branding, and license files, then checks the declared entry points. The dry run does not create a tarball or publish. `npm pack` creates a local tarball; inspect/install it in a separate consumer project before publishing. Neither command runs unit tests.

The npm payload contains `dist/`, `package.json`, README, this guide, and LICENSE. Standalone `app/`, examples, caches, design audits, and development scripts are excluded. Library builds leave dependencies external. Consumers need the compatible `@bookklik/htmv` peer; `fflate` and `lucide` are declared runtime dependencies. No CommonJS entry is provided.

## Publish yourself when ready

```sh
npm login
npm whoami
npm publish --access public
```

This last command is the only publication step; run it manually after reviewing the package. If publishing an already inspected tarball, use `npm publish ./htmv-editor-<version>.tgz --access public` instead. Public scoped access is also configured in `publishConfig`. Follow any authentication or organization policies enforced by your npm account.

## Consumer entry points

- `@htmv/editor`: mounted editor, headless factory, shared utilities, and types.
- `@htmv/editor/headless`: headless controller, shared utilities, and types; no workspace, dialogs, keyboard handlers, persistence, fonts, icons, or CSS setup.
- `@htmv/editor/styles.css`: opt-in mounted UI stylesheet; bundlers must preserve its relative font and branding assets.
- `@htmv/editor/logo.svg` and `@htmv/editor/icon.svg`: branding assets.

Browser rendering and codecs remain browser-only. Headless means no built-in UI, not a server-side video renderer. Importing the headless entry and using its document operations requires no DOM. Rendering, preview, playback, and media decoding require a supported browser and a host-owned canvas.
