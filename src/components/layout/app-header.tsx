"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LayoutDashboard, ReceiptText, Bot, Package, BarChart3, Settings, LogIn } from "lucide-react";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Header aplikasi: judul halaman dinamis + notifikasi "Data Demo".
 * Di mobile, tombol hamburger membuka drawer navigasi.
 */

const PAGE_TITLES: Array<{ match: (p: string) => boolean; title: string }> = [
  { match: (p) => p === "/dashboard", title: "Dashboard" },
  { match: (p) => p.startsWith("/transaksi/baru"), title: "Tambah Transaksi" },
  { match: (p) => p.startsWith("/transaksi"), title: "Transaksi" },
  { match: (p) => p.startsWith("/assistant"), title: "AI Assistant" },
  { match: (p) => p.startsWith("/produk"), title: "Produk" },
  { match: (p) => p.startsWith("/laporan"), title: "Laporan" },
  { match: (p) => p.startsWith("/pengaturan"), title: "Pengaturan" },
];

const DRAWER_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Transaksi", href: "/transaksi", icon: ReceiptText },
  { label: "AI Assistant", href: "/assistant", icon: Bot },
  { label: "Produk", href: "/produk", icon: Package },
  { label: "Laporan", href: "/laporan", icon: BarChart3 },
  { label: "Pengaturan", href: "/pengaturan", icon: Settings },
] as const;

export function AppHeader() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Tutup drawer setiap kali berpindah halaman
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Tutup drawer dengan tombol Escape (aksesibilitas)
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const title = PAGE_TITLES.find((t) => t.match(pathname))?.title ?? "Dashboard";
  const isActive = (href: string) =>
    href === "/transaksi" ? pathname.startsWith("/transaksi") : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            {/* Hamburger hanya tampil di mobile */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Buka menu navigasi"
              aria-expanded={drawerOpen}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-foreground transition-colors hover:bg-muted lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold tracking-tight">{title}</h1>
          </div>

          <div className="flex items-center gap-2.5">
            <Badge variant="orange" className="hidden sm:inline-flex">
              Data Demo · Tahap 1
            </Badge>
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-deep text-xs font-bold text-white"
              title="Akun demo — login diaktifkan di Tahap 2"
              aria-label="Akun demo"
            >
              R
            </span>
          </div>
        </div>
      </header>

      {/* Drawer navigasi mobile */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu navigasi">
          <div
            className="absolute inset-0 bg-primary-deep/50 animate-fade-in"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 right-0 flex w-[280px] max-w-[85vw] flex-col bg-surface shadow-lift animate-slide-in-right">
            <div className="flex h-16 items-center justify-between border-b border-line px-5">
              <Logo variant="dark" />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Tutup menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-3" aria-label="Navigasi utama">
              {DRAWER_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-colors",
                    isActive(item.href)
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-[18px] w-[18px]" strokeWidth={2} />
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="border-t border-line p-4">
              <Link
                href="/login"
                className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <LogIn className="h-[18px] w-[18px]" />
                Masuk / Ganti Akun
              </Link>
              <p className="mt-2 px-3.5 text-xs text-muted-foreground">
                Login diaktifkan di Tahap 2.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
