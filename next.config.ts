import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  trailingSlash: true,
  images: { unoptimized: true },
  // Keep the editable phrase corpus available as text in development and export.
  webpack(config) {
    config.module.rules.push({ test: /\.md$/, resourceQuery: /raw/, type: 'asset/source' });
    return config;
  },
};

export default nextConfig;
