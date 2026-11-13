/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@cuub/core", "@cuub/theme"],
  async headers() {
    return [
      {
        source: "/:path*",
        // No CSP frame-ancestors (or X-Frame-Options): framing is allowed by default, and
        // Framer's Embed refuses any page that sends frame-ancestors, even `*`.
        headers: [
          { key: "Permissions-Policy", value: "geolocation=*" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PATCH, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, manufacture_id, sticker_type" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      { source: "/map", destination: "/" },
      { source: "/map.html", destination: "/" },
    ];
  },
};

export default nextConfig;
