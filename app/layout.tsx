import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "勤番 KINBAN | シフト、勤怠管理をひとつに。",
  description: "シフトの希望・作成・割り当てから、勤務申告・承認までをひとつにまとめる管理ツール。",
  icons: {
    icon: "/kinban-mark.png",
    shortcut: "/kinban-mark.png",
  },
  manifest: "/manifest.webmanifest",
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
      </body>
    </html>
  );
}
