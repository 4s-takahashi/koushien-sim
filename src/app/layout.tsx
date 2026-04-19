import type { Metadata, Viewport } from "next";
import "./globals.css";
import VersionBadge from "@/components/VersionBadge";

export const metadata: Metadata = {
  title: "甲子園への道 — 高校野球シミュレーション",
  description: "高校野球シミュレーションゲーム。選手を育て、練習メニューを選び、大会で勝ち上がれ。夢の甲子園を目指せ！",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        {children}
        <VersionBadge />
      </body>
    </html>
  );
}
