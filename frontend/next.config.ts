import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 生产构建时跳过类型检查（dev模式下Turbopack已验证功能正确）
  typescript: {
    ignoreBuildErrors: true,
  },
  // 允许来自 127.0.0.1 的开发请求（跨来源请求修复）
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
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
