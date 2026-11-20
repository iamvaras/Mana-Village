import type { NextConfig } from 'next';

// The admin console is fully authenticated and per-user, so every page is dynamic;
// cacheComponents / partial prefetching (static shells) are intentionally not used.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@mana/core', '@mana/services'],
  turbopack: {
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
