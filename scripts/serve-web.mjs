import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('apps/app/dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
createServer(async (request, response) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
    let body; let extension = extname(path);
    try { body = await readFile(path); } catch { body = await readFile(resolve(root, 'index.html')); extension = '.html'; }
    response.writeHead(200, { 'Content-Type': types[extension] || 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(body);
  } catch { response.writeHead(500); response.end(); }
}).listen(8081, '127.0.0.1');
