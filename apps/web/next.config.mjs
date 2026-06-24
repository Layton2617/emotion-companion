/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // monorepo 里 workspace 包以源码形式被消费,需让 Next 转译 @emotion/*。
  transpilePackages: [
    "@emotion/core",
    "@emotion/memory",
    "@emotion/safety",
    "@emotion/rag",
    "@emotion/prompts",
  ],
  // 包内源码用 ESM 风格的 .js 扩展名导入(tsc Bundler 解析能映射到 .ts),
  // 让 webpack 也把 .js 解析回 .ts/.tsx。
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
