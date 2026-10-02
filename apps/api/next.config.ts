import path from 'node:path';
import type { NextConfig } from 'next';
import { SECURITY_HEADERS } from '../../packages/shared/src/security-headers';

const nextConfig: NextConfig = {
  output: 'standalone',
  // The workspace root, so the standalone build also picks up packages/*.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@longrak/shared', '@longrak/db'],
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
