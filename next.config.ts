import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libSQL ships a native binary; keep it out of the server bundle.
  serverExternalPackages: ["@libsql/client", "libsql"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
};

export default nextConfig;
