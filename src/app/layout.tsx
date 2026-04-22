import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import Toolbar from "@/components/Toolbar";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

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

import BackgroundEffects from "@/components/BackgroundEffects";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${outfit.variable} min-h-screen bg-[#f8f5ea] font-sans text-slate-900`}>
        <BackgroundEffects />
        <div className="relative flex min-h-screen flex-col">
          <Toolbar />
          <div className="relative flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
