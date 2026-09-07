import type { MetadataRoute } from "next";
import { SITE_BRAND } from "@/lib/site-brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_BRAND,
    short_name: SITE_BRAND,
    description: "HHW 团的复古主页，提供 Bandori 活动追踪、日历、图鉴、组队工具与黑白棋。",
    start_url: "/",
    display: "standalone",
    background_color: "#FFEE22",
    theme_color: "#FFEE22",
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
