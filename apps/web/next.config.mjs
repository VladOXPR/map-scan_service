/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@cuub/shared"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
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
