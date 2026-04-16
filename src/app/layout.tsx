import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "甲子園シミュレーター",
  description: "高校野球シミュレーションゲーム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
