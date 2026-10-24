import { Zip, ZipPassThrough, Unzip, UnzipInflate } from 'fflate';
import type { EditorAssets, ProjectBundle } from './types.js';
import { LIMITS, validateProject, migrateProject } from './project.js';

const MAX_JSON = 8 * 1024 * 1024;
const safePath = (path: string): boolean => path === 'project.json' || /^assets\/[a-zA-Z][\w-]{0,99}$/.test(path);

export async function writeArchive(bundle: ProjectBundle, signal?: AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();
  validateProject(bundle.project, bundle.assets);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, data) => { if (error) failure = error; else chunks.push(data.slice()); });
  // Media is already compressed. Store it without recompression or full-file ArrayBuffers.
  const add = async (path: string, blob: Blob): Promise<void> => {
    const file = new ZipPassThrough(path); zip.add(file);
    const reader = blob.stream().getReader();
    try {
      while (true) {
        signal?.throwIfAborted();
        const { value, done } = await reader.read();
        if (done) break;
        file.push(value, false);
        if (failure) throw failure;
      }
      file.push(new Uint8Array(), true);
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  };
  try {
    const json = new Blob([JSON.stringify(bundle.project)], { type: 'application/json' });
    if (json.size > MAX_JSON) throw new Error('Project metadata exceeds 8 MiB.');
    await add('project.json', json);
    for (const asset of bundle.project.assets) await add(`assets/${asset.id}`, bundle.assets[asset.id]);
    signal?.throwIfAborted(); zip.end(); if (failure) throw failure;
    return new Blob(chunks, { type: 'application/x-htmv-project' });
  } catch (error) { zip.terminate(); throw error; }
}

export async function readArchive(blob: Blob, signal?: AbortSignal): Promise<ProjectBundle> {
  signal?.throwIfAborted();
  if (blob.size > LIMITS.totalBytes + MAX_JSON + 1024 * 1024) throw new Error('Project archive exceeds the supported size.');
  const files = new Map<string, Blob>();
  const paths = new Set<string>();
  const pending = new Set<string>();
  let total = 0;
  let failure: Error | null = null;
  const unzip = new Unzip(file => {
    if (!safePath(file.name) || paths.has(file.name) || paths.size >= LIMITS.entries) {
      failure = new Error('Archive contains unsafe, duplicate, or excessive entries.'); return;
    }
    paths.add(file.name); pending.add(file.name);
    const max = file.name === 'project.json' ? MAX_JSON : LIMITS.assetBytes;
    if (file.originalSize !== undefined && file.originalSize > max) { failure = new Error('Archive entry exceeds the size limit.'); return; }
    let size = 0;
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    file.ondata = (error, chunk, final) => {
      if (failure) return;
      if (error) { failure = error; return; }
      size += chunk.length; total += chunk.length;
      if (size > max || total > LIMITS.totalBytes + MAX_JSON) { failure = new Error('Expanded archive exceeds media limits.'); return; }
      chunks.push(chunk.slice());
      if (final) { files.set(file.name, new Blob(chunks)); pending.delete(file.name); }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  const reader = blob.stream().getReader();
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      unzip.push(value, false);
      if (failure) throw failure;
    }
    unzip.push(new Uint8Array(), true);
    if (failure) throw failure;
    if (pending.size || !files.has('project.json')) throw new Error('Incomplete project archive.');
    const project = migrateProject(JSON.parse(await files.get('project.json')!.text()));
    const assets: EditorAssets = Object.create(null);
    for (const asset of project.assets) {
      const data = files.get(`assets/${asset.id}`);
      if (!data) throw new Error(`Archive is missing ${asset.name}.`);
      assets[asset.id] = new Blob([data], { type: asset.mimeType });
    }
    if (files.size !== project.assets.length + 1) throw new Error('Archive contains undeclared assets.');
    signal?.throwIfAborted(); validateProject(project, assets);
    return { project, assets };
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
