import type { EditorAssets, EditorCommand, EditorProject } from './types.js';
import { clone, migrateProject, validateProject } from './project.js';
import { applyCommand } from './commands.js';

/** Documents are immutable between transactions. Pointer previews never clone this state. */
export class DocumentStore {
  project: EditorProject;
  revision = 0;
  private past: EditorProject[] = [];
  private future: EditorProject[] = [];
  private group: string | null = null;
  private grouped = false;
  beginGroup(name: string): void { if (this.group !== name) { this.group = name; this.grouped = false; } }
  endGroup(): void { this.group = null; this.grouped = false; }
  constructor(project: unknown) { this.project = migrateProject(project); }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  update(update: (draft: EditorProject) => void, assets: EditorAssets): boolean {
    const next = clone(this.project), result = update(next) as unknown;
    if (result && typeof (result as { then?: unknown }).then === 'function') { void Promise.resolve(result).catch(() => {}); throw new Error('Document update callbacks must be synchronous. Prepare asynchronous data before calling updateProject.'); }
    validateProject(next, assets, true);
    if (JSON.stringify(next) === JSON.stringify(this.project)) return false;
    if (!this.group || !this.grouped) { this.past.push(this.project); if (this.past.length > 100) this.past.shift(); this.grouped = !!this.group; } this.future = []; this.project = next; this.trimMediaHistory(); this.revision++; return true;
  }
  command(command: EditorCommand, assets: EditorAssets): { changed: boolean; ids: string[] } { let ids: string[] = []; const changed = this.update(p => { ids = applyCommand(p, command); }, assets); return { changed, ids }; }
  undo(): boolean { this.endGroup(); const previous = this.past.pop(); if (!previous) return false; this.future.push(this.project); this.project = previous; this.revision++; return true; }
  redo(): boolean { this.endGroup(); const next = this.future.pop(); if (!next) return false; this.past.push(this.project); this.project = next; this.revision++; return true; }
  replace(project: EditorProject): void { this.endGroup(); this.project = project; this.past = []; this.future = []; this.revision++; }
  /** Saving a copy changes identity across history, so undo never returns to the conflicted project. */
  reidentify(id: string, name: string): void { this.endGroup(); this.project = { ...this.project, id, name }; this.past = this.past.map(p => ({ ...p, id })); this.future = this.future.map(p => ({ ...p, id })); this.revision++; }
  clearHistory(): void { this.endGroup(); this.past = []; this.future = []; }
  retainedAssetIds(): Set<string> { return new Set([this.project, ...this.past, ...this.future].flatMap(p => p.assets.map(a => a.id))); }
  private trimMediaHistory(): void {
    const seen = new Set<string>(); let bytes = 0;
    for (const document of [this.project, ...this.past.toReversed()]) { for (const a of document.assets) if (!seen.has(a.id)) { seen.add(a.id); bytes += a.size; } if (bytes > 1024 * 1024 * 1024) { const index = this.past.indexOf(document); this.past.splice(0, index + 1); break; } }
  }
}
export class SelectionModel {
  ids = new Set<string>();
  set(ids: string[], project: EditorProject, expandGroups = true): void {
    this.ids = new Set(ids.filter(id => project.clips.some(c => c.id === id)));
    if (expandGroups) for (const c of project.clips) if (c.groupId && project.clips.some(x => this.ids.has(x.id) && x.groupId === c.groupId)) this.ids.add(c.id);
  }
  toggle(id: string, project: EditorProject): void { const next = new Set(this.ids); if (next.has(id)) { const group = project.clips.find(c => c.id === id)?.groupId; for (const c of project.clips) if (c.id === id || group && c.groupId === group) next.delete(c.id); } else next.add(id); this.set([...next], project); }
  prune(project: EditorProject): void { this.set([...this.ids], project, false); }
  get first(): string | null { return this.ids.values().next().value ?? null; }
}
