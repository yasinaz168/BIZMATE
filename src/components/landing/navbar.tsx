"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Beranda", href: "/#beranda" },
  { label: "Fitur", href: "/#fitur" },
  { label: "Tentang", href: "/#tentang" },
] as const;

export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled ? "border-b border-line bg-surface/90 shadow-card backdrop-blur" : "bg-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="BIZMATE">
          <Logo variant="dark" />
        </Link>

        {/* Nav desktop */}
        <nav className="hidden items-center gap-7 md:flex" aria-label="Navigasi utama">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="text-sm font-semibold text-foreground transition-colors hover:text-primary"
          >
            Login
          </Link>
          <Link href="/register" className={buttonVariants({ size: "sm" })}>
            Mulai Gratis
          </Link>
        </nav>

        {/* Toggle mobile */}
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-foreground hover:bg-muted md:hidden"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Tutup menu" : "Buka menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Menu mobile */}
      {open && (
        <div className="border-t border-line bg-surface px-4 pb-4 pt-2 shadow-lift md:hidden">
          <nav className="flex flex-col" aria-label="Navigasi utama">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Login
            </Link>
            <Link
              href="/register"
              onClick={() => setOpen(false)}
              className={cn(buttonVariants(), "mt-2 justify-center")}
            >
              Mulai Gratis
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
