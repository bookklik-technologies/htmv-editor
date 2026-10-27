import { lstat, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
if (dirname(output) !== resolve(root)) throw new Error('Refusing to clean outside the package root.');
const info = await lstat(output).catch(error => { if (error.code !== 'ENOENT') throw error; });
if (info?.isSymbolicLink()) throw new Error('Refusing to clean a linked dist directory.');
await rm(output, { recursive: true, force: true });
