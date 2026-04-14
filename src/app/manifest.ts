import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Happy！Lucky！黑白棋！",
    short_name: "HHW黑白棋",
    description: "与 Hello, Happy World! 的成员们来一场黑白棋对决吧！",
    start_url: "/",
    display: "standalone",
    background_color: "#FFEE22",
    theme_color: "#FFEE22",
    // App Router 的 icon/apple-icon 文件约定负责浏览器标签图标，
    // manifest 这里保留 192/512 两个固定尺寸，专门给安装态与启动画面使用。
    icons: [
      {
        src: "/favicon/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/favicon/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}