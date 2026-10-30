import Link from "next/link";
import { Logo } from "@/components/logo";
import { Mail } from "lucide-react";

const PRODUCT_LINKS = [
  { label: "Fitur", href: "/#fitur" },
  { label: "Cara Kerja", href: "/#tentang" },
  { label: "Daftar Gratis", href: "/register" },
];

const LEGAL_LINKS = [
  { label: "Kebijakan Privasi", href: "/kebijakan-privasi" },
  { label: "Ketentuan Layanan", href: "/ketentuan-layanan" },
];

/** Footer landing page. */
export function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-2">
            <Logo variant="dark" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              AI Business Assistant untuk UMKM Indonesia. Catat transaksi,
              pantau penjualan, dan pahami perkembangan bisnismu dalam satu platform.
            </p>
            <a
              href="mailto:hello@bizmate.id?subject=Halo%20BIZMATE"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <Mail className="h-4 w-4" />
              hello@bizmate.id
            </a>
          </div>

          {/* Produk */}
          <div>
            <h3 className="text-sm font-bold text-foreground">Produk</h3>
            <ul className="mt-4 space-y-2.5">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-bold text-foreground">Legal</h3>
            <ul className="mt-4 space-y-2.5">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} BIZMATE. Semua hak dilindungi.
          </p>
          <p className="text-xs text-muted-foreground">Dibuat di Indonesia untuk UMKM Indonesia.</p>
        </div>
      </div>
    </footer>
  );
}
