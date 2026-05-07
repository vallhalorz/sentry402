/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 15 moved this out of `experimental`.
  serverExternalPackages: ["@covalenthq/client-sdk"],
};

export default nextConfig;
