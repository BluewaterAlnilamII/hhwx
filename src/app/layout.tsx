import type { Metadata } from "next";
import "./globals.css";
import AppChrome from "@/components/AppChrome";

// Next 的 segment config 必须写成可静态分析的字面量，
// 这里不能复用外部常量，否则生产构建会直接报 Invalid segment configuration export。
export const revalidate = 900;

export const metadata: Metadata = {
  title: "🎭 Happy！Lucky！黑白棋！",
  applicationName: "Happy！Lucky！黑白棋！",
  description: "与 Hello, Happy World! 的成员们来一场黑白棋对决吧！",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon.ico", sizes: "any", type: "image/x-icon" },
    ],
    shortcut: [{ url: "/favicon.ico", type: "image/x-icon" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen min-h-svh overflow-x-hidden text-slate-900">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
