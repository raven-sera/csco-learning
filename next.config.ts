import type { NextConfig } from 'next';

const githubPages = process.env.GITHUB_PAGES === 'true';

const nextConfig: NextConfig = githubPages ? {
  output: 'export',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  trailingSlash: true,
  images: { unoptimized: true },
  // The original Vite build also imports the editable phrase corpus as text.
  webpack(config) {
    config.module.rules.push({ test: /\.md$/, resourceQuery: /raw/, type: 'asset/source' });
    return config;
  },
} : {};

export default nextConfig;
