import path from "node:path";

const apiTarget = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8016";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "8016", pathname: "/api/uploads/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "8016", pathname: "/api/uploads/**" },
    ],
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiTarget}/api/:path*` }];
  },
};

export default nextConfig;
