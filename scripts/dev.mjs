import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
const root = resolve('app');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.map': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const info = await stat(path);
    const file = info.isDirectory() ? resolve(path, 'index.html') : path;
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(8898, '127.0.0.1', () => console.log('HTMV Editor: http://127.0.0.1:8898/\nEmbedding example: http://127.0.0.1:8898/embed.html'));
let building = false, again = false, timer;
function rebuild() {
  if (building) { again = true; return; }
  building = true;
  const child = spawn(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit', windowsHide: true });
  child.on('exit', () => { building = false; if (again) { again = false; rebuild(); } });
}
const watcher = watch('src', { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(rebuild, 200); });
const brandWatchers = ['logo.svg', 'icon.svg'].map(path => watch(path, () => { clearTimeout(timer); timer = setTimeout(rebuild, 200); }));
function close() { clearTimeout(timer); watcher.close(); brandWatchers.forEach(watcher => watcher.close()); server.close(); }
process.on('SIGINT', () => { close(); process.exit(); }); process.on('SIGTERM', () => { close(); process.exit(); });
