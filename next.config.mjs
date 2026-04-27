/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // ytdl-core and fluent-ffmpeg spawn child processes / native bindings,
    // so we mark them as external on the server to avoid bundling issues.
    serverComponentsExternalPackages: ["@distube/ytdl-core", "fluent-ffmpeg"],
  },
};

export default nextConfig;
