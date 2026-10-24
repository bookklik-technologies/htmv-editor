import { createEditor } from './index.js';
const host = document.querySelector<HTMLElement>('#editor')!;
const editor = createEditor(host, { storageKey: 'standalone', onEvent(event) { if (event.type === 'appearance') document.querySelector('meta[name="theme-color"]')?.setAttribute('content', event.resolved === 'dark' ? '#161719' : '#eeefec'); } });
// Page lifecycle is intentionally managed by the app, not the reusable package.
document.addEventListener('visibilitychange', () => { if (document.hidden) void editor.flushSave().catch(() => {}); });
window.addEventListener('beforeunload', event => { if (editor.hasUnsavedChanges) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', event => { if (!event.persisted) void editor.destroy(); });
