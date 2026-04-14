import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "🎭 Happy！Lucky！黑白棋！",
  applicationName: "Happy！Lucky！黑白棋！",
  description: "与 Hello, Happy World! 的成员们来一场黑白棋对决吧！",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.ico", type: "image/x-icon" }],
    shortcut: ["/favicon.ico"],
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
      <body className={`${outfit.variable} font-sans`}>
        <BackgroundEffects />
        {children}
      </body>
    </html>
  );
}
