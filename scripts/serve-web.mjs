import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('apps/app/dist');
const config = JSON.parse(await readFile('vercel.json', 'utf8'));
const headers = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key, value]));
// Mirror release headers in local E2E, allowing only the local API as an extra connection target.
headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace("connect-src 'self'", "connect-src 'self' http://localhost:3001 ws://localhost:3001");
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
createServer(async (request, response) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
    let body; let extension = extname(path);
    try { body = await readFile(path); } catch { body = await readFile(resolve(root, 'index.html')); extension = '.html'; }
    response.writeHead(200, { ...headers, 'Content-Type': types[extension] || 'application/octet-stream' }); response.end(body);
  } catch { response.writeHead(500); response.end(); }
}).listen(8081, '127.0.0.1');
