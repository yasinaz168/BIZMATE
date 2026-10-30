"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LayoutDashboard, ReceiptText, Bot, Package, BarChart3, Settings, LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { signOutAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

/**
 * Header aplikasi: judul halaman + identitas bisnis aktif + tombol keluar.
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

export function AppHeader({ businessName }: { businessName?: string | null }) {
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

  // Inisial untuk avatar: huruf pertama nama bisnis
  const initial = (businessName ?? "B").trim().charAt(0).toUpperCase();

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
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
            <h1 className="truncate text-lg font-bold tracking-tight">{title}</h1>
          </div>

          <div className="flex items-center gap-2.5">
            <span
              className="hidden max-w-[180px] truncate rounded-full border border-line bg-background px-3 py-1 text-xs font-medium text-muted-foreground sm:inline-block"
              title={businessName ?? "Bisnismu"}
            >
              {businessName ?? "Bisnismu"}
            </span>

            {/* Keluar: server action, langsung fungsional */}
            <form action={signOutAction}>
              <button
                type="submit"
                title={`Keluar (${businessName ?? "akun"})`}
                aria-label="Keluar dari BIZMATE"
                className="flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-expense/30 hover:text-expense"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-deep text-[11px] font-bold text-white">
                  {initial}
                </span>
                <LogOut className="h-4 w-4 lg:hidden" />
                <span className="hidden lg:inline">Keluar</span>
              </button>
            </form>
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

            {/* Identitas bisnis aktif */}
            <div className="border-b border-line px-5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bisnis aktif</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                {businessName ?? "Bisnismu"}
              </p>
            </div>

            <nav className="flex-1 space-y-1 p-3" aria-label="Navigasi utama">
              {DRAWER_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-colors",
                    isActive(item.href)
                      ? "bg-primary/10 text-primary-ink"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-[18px] w-[18px]" strokeWidth={2} />
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="border-t border-line p-4">
              {/* Di drawer juga bisa keluar */}
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <LogOut className="h-[18px] w-[18px]" />
                  Keluar
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
