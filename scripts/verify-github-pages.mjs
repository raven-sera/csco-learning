import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// Verify actual exported pages and local asset targets before a Pages deployment.
export function verifyExport(root, basePath, origin) {
  const out = path.join(root, 'out');
  for (const file of ['index.html', 'learning/index.html', 'schedule/index.html', 'library/index.html', '404.html',
    'huidu-logo.png', 'huidu-latest-qr.jpg', 'og.png', 'venue/three.min.js',
    'venue/map-scene.js', 'venue/level1.jpg', 'venue/level2.png', 'venue/THREE-LICENSE.txt']) {
    assert.ok(existsSync(path.join(out, file)), `Missing exported file: ${file}`);
  }
  for (const file of ['index.html', 'learning/index.html', 'schedule/index.html', 'library/index.html', '404.html']) {
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
  for (const file of ['learning/index.html', 'schedule/index.html', 'library/index.html']) {
    const html = readFileSync(path.join(out, file), 'utf8');
    assert.ok(!/<script[^>]*src="[^"]*\/venue\//.test(html), `${file} eagerly loads the map engine`);
  }
  const home = readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.ok(home.includes(`${origin}${basePath}/og.png`), 'Incorrect social preview URL');
  console.log('Verified: four routes, repository paths, preview image and lazy map assets.');
}
