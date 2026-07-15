import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Day | あなたの予定とタスク",
  description: "予定とタスクをひとつにまとめる、個人用の小さなカレンダー。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
