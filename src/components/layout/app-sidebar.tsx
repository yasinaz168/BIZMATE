"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ReceiptText,
  Bot,
  Package,
  BarChart3,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

/**
 * Sidebar utama (desktop). Warna hijau gelap sebagai aksen premium BIZMATE.
 * Di layar kecil, sidebar ini disembunyikan dan digantikan MobileDrawer.
 */

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Transaksi", href: "/transaksi", icon: ReceiptText },
  { label: "AI Assistant", href: "/assistant", icon: Bot },
  { label: "Produk", href: "/produk", icon: Package },
  { label: "Laporan", href: "/laporan", icon: BarChart3 },
  { label: "Pengaturan", href: "/pengaturan", icon: Settings },
] as const;

export function AppSidebar({ businessName }: { businessName?: string | null }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/transaksi") {
      return pathname.startsWith("/transaksi");
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col bg-primary-deep lg:flex">
      {/* Logo */}
      <div className="flex h-16 items-center px-6">
        <Link href="/dashboard" aria-label="BIZMATE — ke dashboard">
          <Logo variant="light" />
        </Link>
      </div>

      {/* Navigasi */}
      <nav className="mt-2 flex-1 space-y-1 px-3" aria-label="Navigasi utama">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white/90"
              )}
            >
              <item.icon
                className={cn("h-[18px] w-[18px]", active ? "text-primary-foreground" : "")}
                strokeWidth={2}
              />
              {item.label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
            </Link>
          );
        })}
      </nav>

      {/* Identitas workspace — data asli dari database */}
      <div className="p-3">
        <div className="rounded-xl bg-white/5 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <ShieldCheck className="h-4 w-4 text-primary-bright" />
            Bisnis aktif
          </div>
          <p className="mt-1.5 truncate text-sm font-semibold text-white" title={businessName ?? "Bisnismu"}>
            {businessName ?? "Bisnismu"}
          </p>
          <p className="mt-0.5 text-xs text-white/60">
            Data hanya bisa diakses akunmu (RLS aktif).
          </p>
        </div>
      </div>
    </aside>
  );
}
