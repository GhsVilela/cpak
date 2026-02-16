/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use standalone mode for containerized deployments
  output: "standalone",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
