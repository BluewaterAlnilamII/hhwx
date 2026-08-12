import type { MetadataRoute } from "next";
import { SITE_BRAND } from "@/lib/site-brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_BRAND,
    short_name: SITE_BRAND,
    description: "与 Hello, Happy World! 的成员们来一场黑白棋对决吧！",
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
