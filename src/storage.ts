import type { EditorAssets, EditorProject, EditorTemplate, ProjectBundle } from './types.js';
import { migrateProject, uid, validateProject } from './project.js';
export interface SavedProject { key: string; namespace: string; project: EditorProject; updatedAt: number; revision?: number; deletedAt?: number }
interface TemplateRecord extends ProjectBundle { id: string; namespace: string; name: string }
const request = <T>(r: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const completed = (tx: IDBTransaction): Promise<void> => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Browser storage transaction failed.')); });
export class StorageConflictError extends Error { readonly code = 'E_SAVE_CONFLICT'; constructor() { super('This project changed in another tab. Keep your edits with Save a copy, or reopen the saved version.'); } }

/** Compare-and-swap revisions prevent silent cross-tab overwrites; all media writes are atomic. */
export class ProjectStorage {
  private db: IDBDatabase | null = null;
  private opening: Promise<IDBDatabase> | null = null;
  private closed = false;
  private baseline = new Map<string, number>();
  private storedBlobs = new Map<string, WeakRef<Blob>>();
  private session = uid('session');
  private channel: BroadcastChannel | null;
  constructor(readonly namespace: string, private onExternal?: (projectId: string) => void) {
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`htmv-editor:${namespace}`) : null;
    if (this.channel) this.channel.onmessage = event => { const d = event.data; if (d && typeof d.projectId === 'string' && typeof d.revision === 'number' && d.session !== this.session && this.baseline.get(this.key(d.projectId)) !== d.revision) this.onExternal?.(d.projectId); };
  }
  private key(id: string): string { return `${this.namespace}/${id}`; }
  private async open(): Promise<IDBDatabase> {
    if (this.closed) throw new Error('Project storage is closed.'); if (this.db) return this.db;
    if (!this.opening) {
      this.opening = new Promise((resolve, reject) => {
        const r = indexedDB.open('htmv-editor-v1', 2);
        r.onupgradeneeded = () => { for (const name of ['projects', 'assets', 'templates']) if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name, name === 'projects' ? { keyPath: 'key' } : undefined); };
        r.onerror = () => reject(r.error); r.onblocked = () => reject(new Error('Close older editor tabs so local storage can upgrade. Your projects are preserved.'));
        r.onsuccess = () => {
          if (this.closed) { r.result.close(); reject(new Error('Project storage closed.')); return; }
          this.db = r.result; this.db.onversionchange = () => { this.db?.close(); this.db = null; this.opening = null; }; resolve(this.db);
        };
      });
      this.opening.catch(() => { this.opening = null; });
    }
    return this.opening;
  }
  async list(trash = false): Promise<SavedProject[]> {
    const db = await this.open(); const rows = await request(db.transaction('projects').objectStore('projects').getAll()) as SavedProject[];
    return rows.filter(r => r.namespace === this.namespace && !!r.deletedAt === trash).map(r => ({ ...r, project: migrateProject(r.project) })).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async load(key: string): Promise<ProjectBundle> {
    const db = await this.open(), tx = db.transaction(['projects', 'assets']); const row = await request(tx.objectStore('projects').get(key)) as SavedProject | undefined;
    if (!row || row.namespace !== this.namespace || row.deletedAt) throw new Error('Saved project not found.');
    const project = migrateProject(row.project), assets: EditorAssets = Object.create(null);
    await Promise.all(project.assets.map(async a => { const blob = await request(tx.objectStore('assets').get(`${key}/${a.id}`)); if (blob instanceof Blob) { assets[a.id] = blob; this.storedBlobs.set(`${key}/${a.id}`, new WeakRef(blob)); } }));
    validateProject(project, assets, true); this.baseline.set(key, row.revision ?? 0); return { project, assets };
  }
  /** Re-importing an archive whose content already matches the stored row must not read as a cross-tab conflict: adopt the stored revision as the save baseline. */
  async adopt(project: EditorProject): Promise<void> {
    if (this.closed) throw new Error('Project storage is closed.');
    const key = this.key(project.id); if (this.baseline.get(key) !== undefined) return;
    try {
      const db = await this.open(), row = await request(db.transaction('projects').objectStore('projects').get(key)) as SavedProject | undefined;
      if (row && !row.deletedAt && row.namespace === this.namespace && JSON.stringify(migrateProject(row.project)) === JSON.stringify(project)) this.baseline.set(key, row.revision ?? 0);
    } catch { /* Without a baseline the next save keeps today's compare-and-swap behavior. */ }
  }
  async save(project: EditorProject, assets: EditorAssets): Promise<void> {
    validateProject(project, assets); const db = await this.open(), key = this.key(project.id), expected = this.baseline.get(key);
    const tx = db.transaction(['projects', 'assets'], 'readwrite'), done = completed(tx); let conflict = false, nextRevision = 0;
    const previous = tx.objectStore('projects').get(key);
    previous.onsuccess = () => {
      const row = previous.result as SavedProject | undefined;
      if (row && (expected === undefined || (row.revision ?? 0) !== expected || row.deletedAt)) { conflict = true; tx.abort(); return; }
      nextRevision = (row?.revision ?? 0) + 1;
      const assetStore = tx.objectStore('assets');
      for (const old of row?.project.assets ?? []) if (!project.assets.some(a => a.id === old.id)) assetStore.delete(`${key}/${old.id}`);
      tx.objectStore('projects').put({ key, namespace: this.namespace, project, updatedAt: Date.now(), revision: nextRevision } satisfies SavedProject);
      for (const a of project.assets) if (this.storedBlobs.get(`${key}/${a.id}`)?.deref() !== assets[a.id]) assetStore.put(assets[a.id], `${key}/${a.id}`);
    };
    try { await done; } catch (error) { if (conflict) throw new StorageConflictError(); throw error; }
    this.baseline.set(key, nextRevision); for (const a of project.assets) this.storedBlobs.set(`${key}/${a.id}`, new WeakRef(assets[a.id]));
    for (const [entry, reference] of this.storedBlobs) if (!reference.deref() || entry.startsWith(`${key}/`) && !project.assets.some(a => entry === `${key}/${a.id}`)) this.storedBlobs.delete(entry);
    this.channel?.postMessage({ projectId: project.id, revision: nextRevision, session: this.session });
  }
  async trash(key: string, restore = false): Promise<void> {
    const db = await this.open(), tx = db.transaction('projects', 'readwrite'), done = completed(tx); const r = tx.objectStore('projects').get(key);
    let row: SavedProject | undefined;
    r.onsuccess = () => { row = r.result; if (!row || row.namespace !== this.namespace) { tx.abort(); return; } row.revision = (row.revision ?? 0) + 1; row.updatedAt = Date.now(); if (restore) delete row.deletedAt; else row.deletedAt = Date.now(); tx.objectStore('projects').put(row); };
    await done; if (row) this.channel?.postMessage({ projectId: row.project.id, revision: row.revision, session: this.session });
  }
  async rename(key: string, name: string): Promise<void> { const bundle = await this.load(key); bundle.project.name = name; await this.save(bundle.project, bundle.assets); }
  async saveTemplate(bundle: ProjectBundle, name: string): Promise<void> {
    if (!name.trim() || name.length > 200) throw new Error('Template name must contain 1–200 characters.'); validateProject(bundle.project, bundle.assets);
    const db = await this.open(), tx = db.transaction('templates', 'readwrite'), done = completed(tx), id = uid('template'); tx.objectStore('templates').put({ ...bundle, id, name, namespace: this.namespace } satisfies TemplateRecord, `${this.namespace}/${id}`); await done;
  }
  async listTemplates(): Promise<EditorTemplate[]> { const db = await this.open(); const rows = await request(db.transaction('templates').objectStore('templates').getAll()) as TemplateRecord[]; return rows.filter(r => r.namespace === this.namespace).map(r => ({ id: r.id, name: r.name, description: `${r.project.clips.length} layers · saved on this device`, builtin: false })); }
  async loadTemplate(id: string): Promise<ProjectBundle> { const db = await this.open(); const row = await request(db.transaction('templates').objectStore('templates').get(`${this.namespace}/${id}`)) as TemplateRecord | undefined; if (!row || row.namespace !== this.namespace) throw new Error('Template not found.'); const project = migrateProject(row.project); validateProject(project, row.assets); return { project, assets: row.assets }; }
  async usage(): Promise<{ usage: number; quota: number }> { const estimate = await navigator.storage.estimate(); return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }; }
  close(): void { this.closed = true; this.db?.close(); this.db = null; this.channel?.close(); this.channel = null; this.storedBlobs.clear(); this.baseline.clear(); }
}
