import type { NextConfig } from 'next';

// Content Security Policy (docs/security.md: "strict CSP"). The only other origin
// the browser talks to is Supabase: REST/Auth/Storage over https and Realtime
// over wss. Signed photo URLs come from the same origin; the MFA QR code is a
// data: URL. Next.js needs inline scripts for hydration ('unsafe-inline'; no
// nonce because pages are not statically cached) and eval only in dev.
function contentSecurityPolicy(): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  let origin = '';
  let ws = '';
  try {
    const u = new URL(supabase);
    origin = u.origin;
    ws = `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`;
  } catch {
    // Missing or invalid URL: the app cannot reach Supabase anyway.
  }
  const dev = process.env.NODE_ENV !== 'production';
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${origin}`.trim(),
    "font-src 'self'",
    `connect-src 'self' ${origin} ${ws}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

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
          { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
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
