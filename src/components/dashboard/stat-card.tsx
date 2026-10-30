import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  /** Aksen warna ikon */
  tone?: "primary" | "neutral" | "expense";
}

/** Kartu statistik ringkas untuk dashboard. */
export function StatCard({ label, value, hint, icon: Icon, tone = "primary" }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-card transition-shadow hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            tone === "primary" && "bg-primary/10 text-primary",
            tone === "neutral" && "bg-muted text-muted-foreground",
            tone === "expense" && "bg-expense/10 text-expense"
          )}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
