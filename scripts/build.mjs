import { build } from 'esbuild';
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const common = { bundle: true, format: 'esm', target: 'es2022', sourcemap: true, logLevel: 'info' };
// The supplied SVGs use fixed dimensions. Add a viewBox so they scale at UI/favicon sizes.
const branding = await Promise.all(['logo.svg', 'icon.svg'].map(async name => {
  const source = await readFile(name, 'utf8');
  const width = source.match(/<svg\b[^>]*\bwidth="([\d.]+)"/)?.[1];
  const height = source.match(/<svg\b[^>]*\bheight="([\d.]+)"/)?.[1];
  if (!width || !height) throw new Error(`Brand asset ${name} must define its dimensions.`);
  const svg = /<svg\b[^>]*\bviewBox=/.test(source) ? source : source.replace('<svg ', `<svg viewBox="0 0 ${width} ${height}" `);
  return [name, svg, createHash('sha256').update(svg).digest('hex').slice(0, 12)];
}));
const stylesheet = (await readFile('src/styles.css', 'utf8')).replaceAll('./branding/logo.svg', `./branding/logo.svg?v=${branding.find(([name]) => name === 'logo.svg')[2]}`);
await mkdir('dist', { recursive: true });
await build({ ...common, entryPoints: ['src/index.ts'], outfile: 'dist/index.js', packages: 'external' });
await build({ ...common, entryPoints: ['src/headless.ts'], outfile: 'dist/headless.js', packages: 'external' });
await writeFile('dist/styles.css', stylesheet);
await mkdir('app', { recursive: true });
await build({ ...common, entryPoints: ['src/app.ts'], outfile: 'app/editor.js', minify: true });
await writeFile('app/styles.css', stylesheet);
// Keep the standalone and embedded UI fully local, including font and icon licenses.
for (const output of ['dist', 'app']) {
  await mkdir(`${output}/branding`, { recursive: true });
  for (const [name, svg] of branding) await writeFile(`${output}/branding/${name}`, svg);
  await mkdir(`${output}/fonts`, { recursive: true });
  await copyFile('src/assets/Outfit.ttf', `${output}/fonts/Outfit.ttf`);
  await copyFile('src/assets/Outfit-OFL.txt', `${output}/fonts/Outfit-OFL.txt`);
  await copyFile('src/assets/Lucide-LICENSE.txt', `${output}/Lucide-LICENSE.txt`);
}
await writeFile('app/index.html', `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#191c1f"><meta name="description" content="Create motion graphics locally with HTMV. Animate layers, design titles, add captions, and render in your browser."><title>HTMV Editor</title><link rel="icon" type="image/svg+xml" href="./branding/icon.svg"><link rel="stylesheet" href="./styles.css"><style>html,body{margin:0;background:#111315;height:100%;}#editor{height:100dvh;min-height:650px;}</style></head><body><main id="editor"></main><script type="module" src="./editor.js"></script></body></html>`);
await build({ ...common, entryPoints: ['src/index.ts'], outfile: 'app/htmv-editor.js', minify: true });
await build({ ...common, entryPoints: ['src/headless.ts'], outfile: 'app/htmv-headless.js', minify: true });
await copyFile('examples/headless.html', 'app/headless.html');
await copyFile('examples/embed.html', 'app/embed.html');
await copyFile('examples/motion.html', 'app/motion.html');
await copyFile('examples/appearance.html', 'app/appearance.html');
await build({ ...common, entryPoints: ['src/manual.ts'], outfile: 'app/manual.js', minify: true });
await copyFile('examples/manual.html', 'app/manual.html');
// Static hosts may cache CSS and modules with different policies. Version the pair together.
const versions = await Promise.all(['styles.css', 'editor.js', 'htmv-editor.js', 'htmv-headless.js', 'manual.js'].map(async name => [name, createHash('sha256').update(await readFile(`app/${name}`)).digest('hex').slice(0, 12)]));
for (const page of ['index.html', 'embed.html', 'headless.html', 'motion.html', 'manual.html', 'appearance.html']) {
  let html = await readFile(`app/${page}`, 'utf8');
  const favicon = `<link rel="icon" type="image/svg+xml" href="./branding/icon.svg?v=${branding.find(([name]) => name === 'icon.svg')[2]}">`;
  html = /<link\b[^>]*\brel="icon"[^>]*>/.test(html) ? html.replace(/<link\b[^>]*\brel="icon"[^>]*>/, favicon) : html.replace('</head>', `${favicon}</head>`);
  for (const [name, hash] of versions) html = html.replaceAll(`./${name}`, `./${name}?v=${hash}`);
  await writeFile(`app/${page}`, html);
}
