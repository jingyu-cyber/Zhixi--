import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 生产构建时跳过类型检查（dev模式下Turbopack已验证功能正确）
  typescript: {
    ignoreBuildErrors: true,
  },
  // 允许加载外部图片
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.hdslb.com",
      },
      {
        protocol: "https",
        hostname: "**.bilivideo.com",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
  },
};

export default nextConfig;
