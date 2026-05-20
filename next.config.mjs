/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  async redirects() {
    return [
      {
        source: "/purchase-orders",
        destination: "/inventory/purchase-orders",
        permanent: true,
      },
      {
        source: "/purchase-orders/:id",
        destination: "/inventory/purchase-orders/:id",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/((?!_next|api).*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
