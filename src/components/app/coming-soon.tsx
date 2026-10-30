import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, CircleCheck, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ComingSoonProps {
  /** Judul fitur, contoh: "Transaksi" */
  title: string;
  /** Penjelasan singkat apa yang sedang/pakan dibangun */
  description: string;
  /** Tahap di mana fitur ini diaktifkan, contoh: "Tahap 3" */
  phase: string;
  icon: LucideIcon;
  /** Rencana kecil yang sudah jelas untuk fitur ini */
  planned: string[];
  tone?: "default" | "dark";
}

/**
 * Komponen untuk halaman fitur yang belum dibangun.
 * Prinsip kejujuran produk: tidak ada tombol dekoratif atau fitur palsu —
 * halaman ini menjelaskan status pengembangan dengan jelas.
 */
export function ComingSoon({ title, description, phase, icon: Icon, planned, tone = "default" }: ComingSoonProps) {
  return (
    <div className="rounded-2xl border border-line bg-surface shadow-card">
      {/* Panel utama */}
      <div
        className={cn(
          "flex flex-col items-start gap-5 border-b border-line p-6 sm:p-8",
          tone === "dark" ? "bg-primary-deep text-white" : "bg-surface"
        )}
      >
        <div className="flex items-center gap-4">
          <span
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl",
              tone === "dark" ? "bg-primary text-white" : "bg-primary/10 text-primary"
            )}
          >
            <Icon className="h-6 w-6" strokeWidth={2.2} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className={cn("text-xl font-bold tracking-tight", tone === "dark" ? "text-white" : "text-foreground")}>
                {title}
              </h2>
              <Badge variant={tone === "dark" ? "on-dark" : "orange"}>
                <Sparkles className="h-3 w-3" />
                Dalam pengembangan · {phase}
              </Badge>
            </div>
            <p className={cn("mt-1 max-w-2xl text-sm leading-relaxed", tone === "dark" ? "text-white/70" : "text-muted-foreground")}>
              {description}
            </p>
          </div>
        </div>
      </div>

      {/* Rencana build */}
      <div className="grid grid-cols-1 gap-6 p-6 sm:p-8 md:grid-cols-5">
        <div className="md:col-span-3">
          <h3 className={cn("text-sm font-semibold", tone === "dark" ? "text-white" : "")}>Yang dibangun di {phase.toLowerCase()}:</h3>
          <ul className={cn("mt-3 space-y-2.5", tone === "dark" ? "text-white/70" : "text-muted-foreground")}>
            {planned.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed">
                <CircleCheck className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "dark" ? "text-primary" : "text-primary")} />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-2">
          <h3 className={cn("text-sm font-semibold", tone === "dark" ? "text-white" : "")}>Sementara itu:</h3>
          <p className={cn("mt-3 text-sm leading-relaxed", tone === "dark" ? "text-white/70" : "text-muted-foreground")}>
            Dashboard dan halaman lain sudah aktif dengan data demo. Kamu bisa melihat arah desain aplikasi sebelum fitur ini selesai.
          </p>
          <Link
            href="/dashboard"
            className={buttonVariants({
              variant: tone === "dark" ? "default" : "outline",
              className: "mt-4",
            })}
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
