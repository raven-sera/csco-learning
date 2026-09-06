import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifyExport } from './verify-github-pages.mjs';
import { prepareLiterature } from './prepare-literature.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const repository = process.env.GITHUB_REPOSITORY || 'raven-sera/csco-learning';
const [owner, name] = repository.split('/');
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ??
  (name.toLowerCase() === `${owner}.github.io`.toLowerCase() ? '' : `/${name}`)).replace(/\/$/, '');
if (!/^(?:\/[A-Za-z0-9._-]+)*$/.test(basePath)) throw new Error('Invalid GitHub Pages base path.');
const origin = new URL(process.env.NEXT_PUBLIC_SITE_ORIGIN || `https://${owner}.github.io`).origin;
if (!origin.startsWith('https://')) throw new Error('GitHub Pages must use HTTPS.');

const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    GITHUB_PAGES: 'true',
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_SITE_ORIGIN: origin,
    NEXT_PUBLIC_LITERATURE_CHUNKS: 'true',
  },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
writeFileSync(new URL('../out/.nojekyll', import.meta.url), '');
prepareLiterature(root);
verifyExport(root, basePath, origin);
console.log(`GitHub Pages files ready: ${origin}${basePath}/`);
