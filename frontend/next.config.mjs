import path from "node:path";

const apiTarget = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8016";
let apiRemotePattern = null;
try {
  const parsedApiTarget = new URL(apiTarget);
  apiRemotePattern = {
    protocol: parsedApiTarget.protocol.replace(":", ""),
    hostname: parsedApiTarget.hostname,
    pathname: "/api/uploads/**",
    ...(parsedApiTarget.port ? { port: parsedApiTarget.port } : {}),
  };
} catch {
  apiRemotePattern = null;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lakodi.cz", pathname: "/api/uploads/**" },
      { protocol: "https", hostname: "www.lakodi.cz", pathname: "/api/uploads/**" },
      { protocol: "http", hostname: "localhost", port: "8016", pathname: "/api/uploads/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "8016", pathname: "/api/uploads/**" },
      ...(apiRemotePattern ? [apiRemotePattern] : []),
    ],
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiTarget}/api/:path*` }];
  },
};

export default nextConfig;
