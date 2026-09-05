import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// Verify actual exported pages and local asset targets before a Pages deployment.
export function verifyExport(root, basePath, origin) {
  const out = path.join(root, 'out');
  for (const file of ['index.html', 'learning/index.html', 'schedule/index.html', '404.html',
    'huidu-logo.png', 'huidu-latest-qr.jpg', 'og.png', 'data/literature.json']) {
    assert.ok(existsSync(path.join(out, file)), `Missing exported file: ${file}`);
  }
  for (const file of ['index.html', 'learning/index.html', 'schedule/index.html', '404.html']) {
    const html = readFileSync(path.join(out, file), 'utf8');
    assert.ok(!html.includes('chatgpt.site'), `Old domain found in ${file}`);
    for (const match of html.matchAll(/(?:src|href)="(\/[^"<>]*)"/g)) {
      const url = new URL(match[1].replaceAll('&amp;', '&'), origin);
      assert.ok(!basePath || url.pathname === basePath || url.pathname.startsWith(basePath + '/'),
        `Asset or link escapes repository path in ${file}: ${url.pathname}`);
      const local = decodeURIComponent(url.pathname.slice(basePath.length));
      const target = path.join(out, local);
      assert.ok(existsSync(target), `Broken exported link in ${file}: ${url.pathname}`);
      if (statSync(target).isDirectory()) assert.ok(existsSync(path.join(target, 'index.html')));
    }
  }
  for (const file of ['learning/index.html', 'schedule/index.html']) {
    assert.ok(readFileSync(path.join(out, file), 'utf8').includes('正在返回三合一入口'), `${file} bypasses portal`);
  }
  const home = readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.ok(home.includes('三合一'), 'Missing unified portal');
  assert.ok(home.includes(`${origin}${basePath}/og.png`), 'Incorrect social preview URL');
  console.log('Verified: three routes, entry gate, repository paths, images and literature data.');
}
