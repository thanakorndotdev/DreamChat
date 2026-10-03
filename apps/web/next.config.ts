import path from 'node:path';
import type { NextConfig } from 'next';
import { SECURITY_HEADERS } from '../../packages/shared/src/security-headers';

const nextConfig: NextConfig = {
  output: 'standalone',
  // The workspace root, so the standalone build also picks up packages/*.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@longrak/shared', '@longrak/db'],
  poweredByHeader: false,
  experimental: {
    // /api/* is proxied to the backend (proxy.ts). The default 30 s cuts off a picture waiting in the GPU queue
    // (lib/comfyui.ts allows 180 s) and an Ollama reply on a cold model load (45 s to the first byte).
    proxyTimeout: 200_000,
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
