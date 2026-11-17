/**
 * Production server: serves the built app from ./dist and hosts online rooms on /ws.
 *   npm run build && npm start        (PORT defaults to 3000)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { attachRooms } from './rooms.js';

const DIST = path.resolve(import.meta.dirname, '../dist');
const PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('No build found. Run `npm run build` first (or `npm run dev` for development).');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  let file;
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (file !== DIST && !file.startsWith(DIST + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  const ext = path.extname(file);
  const cache = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': cache });
  fs.createReadStream(file).pipe(res);
});

attachRooms(server);
server.listen(PORT, () => console.log(`Checkmoji running on http://localhost:${PORT}`));
