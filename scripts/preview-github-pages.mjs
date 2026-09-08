import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
let out;
let basePath;
try {
  out = await realpath(path.join(root, 'out'));
  ({ basePath } = JSON.parse(await readFile(path.join(root, '.next/routes-manifest.json'), 'utf8')));
  await stat(path.join(out, 'index.html'));
} catch {
  console.error('No static export found. Run npm run build before npm start.');
  process.exit(1);
}
const port = Number(process.env.PORT || 3000);
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.pdf': 'application/pdf',
};
const insideExport = (target) => target === out || target.startsWith(out + path.sep);

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let url;
  let pathname;
  try {
    url = new URL(request.url, 'http://localhost');
    pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\0') || pathname.includes('\\')) throw new Error('Invalid path');
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  if (basePath && (pathname === '/' || pathname === basePath)) {
    response.writeHead(308, { Location: `${basePath}/${url.search}` }).end();
    return;
  }
  if (!pathname.startsWith(`${basePath}/`)) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    let file = path.resolve(out, `.${pathname.slice(basePath.length)}`);
    if (!insideExport(file) || !insideExport(await realpath(file))) {
      response.writeHead(404).end('Not found');
      return;
    }
    if ((await stat(file)).isDirectory()) {
      if (!pathname.endsWith('/')) {
        response.writeHead(308, { Location: `${url.pathname}/${url.search}` }).end();
        return;
      }
      file = path.join(file, 'index.html');
    }
    if (!insideExport(await realpath(file))) {
      response.writeHead(404).end('Not found');
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
    });
    if (request.method === 'HEAD') response.end();
    else await pipeline(createReadStream(file), response);
  } catch (error) {
    if (response.headersSent) response.destroy();
    else response.writeHead(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500).end('Unable to serve file');
  }
});
server.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => {
  console.log(`GitHub Pages preview: http://127.0.0.1:${server.address().port}${basePath}/`);
});
