import type { Metadata } from "next";
import { Noto_Sans_SC } from "next/font/google";

import { AppShell } from "@/components/app-shell";
import { ChunkReloadGuard } from "@/components/chunk-reload-guard";

import "./globals.css";

const sans = Noto_Sans_SC({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

export const metadata: Metadata = {
  title: "AI算法巡检",
  description: "TP-LINK 商用云平台 AI 算法巡检控制台"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={sans.variable}>
        <ChunkReloadGuard />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
