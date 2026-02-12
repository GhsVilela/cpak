/** @type {import('next').NextConfig} */
const nextConfig = {
  // Removed output: "export" to support dynamic routes
  distDir: "dist",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
