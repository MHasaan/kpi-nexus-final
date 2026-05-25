/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@kpi-nexus/contracts', '@kpi-nexus/ui'],
  typedRoutes: true,
};

export default nextConfig;
