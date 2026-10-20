/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const isDemoExport = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || process.env.DEMO_EXPORT === 'true';

const nextConfig = {
  output: isDemoExport ? 'export' : 'standalone',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  basePath: basePath,
  assetPrefix: basePath,
};

export default nextConfig;
