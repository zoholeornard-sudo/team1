/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/orchestrator/:path*',
        destination: 'http://localhost:3099/:path*',
      },
      {
        source: '/api/registry/:path*',
        destination: 'http://localhost:3107/:path*',
      },
      {
        source: '/api/workflow/:path*',
        destination: 'http://localhost:3108/:path*',
      },
      {
        source: '/api/metrics/:path*',
        destination: 'http://localhost:3112/:path*',
      },
    ];
  },
};

export default nextConfig;
