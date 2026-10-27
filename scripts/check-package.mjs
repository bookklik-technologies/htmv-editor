import { access, readFile } from 'node:fs/promises';
import { resolve, relative, sep, isAbsolute } from 'node:path';

const root = resolve('.');
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const targets = [];
function collect(value) {
  if (typeof value === 'string') targets.push(value);
  else for (const entry of Object.values(value)) collect(entry);
}
collect(manifest.exports);
targets.push(manifest.main, manifest.module, manifest.types, 'README.md', 'PUBLISHING.md', 'LICENSE',
  'dist/fonts/Outfit.ttf', 'dist/fonts/Outfit-OFL.txt', 'dist/Lucide-LICENSE.txt');
for (const target of new Set(targets)) {
  const path = resolve(root, target);
  const local = relative(root, path);
  if (local === '..' || local.startsWith('..' + sep) || isAbsolute(local) || !local) throw new Error('Invalid package path: ' + target);
  await access(path);
}
const headless = await readFile('dist/headless.js', 'utf8');
if (/from ["']lucide["']|workspaceHTML|class AppearanceController|class TimelineView/.test(headless)) {
  throw new Error('The headless entry must not bundle the editor UI.');
}
console.log('Package exports, documentation, licenses, and headless boundary are present.');
