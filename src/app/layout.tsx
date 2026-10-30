import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "BIZMATE — AI Business Assistant",
    template: "%s · BIZMATE",
  },
  description:
    "Catat transaksi, pantau penjualan, dan pahami perkembangan bisnismu dalam satu platform. Dibuat khusus untuk UMKM Indonesia.",
  keywords: ["UMKM", "AI", "pencatatan transaksi", "bisnis", "Indonesia"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#087F73",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <head>
        {/*
          Font dimuat via <link> (bukan next/font) agar build tetap berhasil
          walau koneksi font bermasalah — otomatis fallback ke font sistem.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-background font-sans">
        {children}
      </body>
    </html>
  );
}
