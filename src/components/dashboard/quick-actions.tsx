import Link from "next/link";
import { Bot, Camera, CirclePlus, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickAction {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  featured?: boolean;
}

const ACTIONS: QuickAction[] = [
  {
    title: "Catat via AI Chat",
    description: "Tulis transaksi pakai bahasa sehari-hari.",
    href: "/assistant",
    icon: Bot,
    featured: true,
  },
  {
    title: "Upload Foto Nota",
    description: "AI membaca nota dan mengisi form-nya.",
    href: "/assistant/nota",
    icon: Camera,
  },
  {
    title: "Input Manual",
    description: "Isi formulir transaksi secara manual.",
    href: "/transaksi/baru",
    icon: CirclePlus,
  },
];

/** Kartu aksi cepat: tiga cara mencatat transaksi di BIZMATE. */
export function QuickActions() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
      {ACTIONS.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className={cn(
            "group flex items-center gap-3.5 rounded-2xl border p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift",
            action.featured
              ? "border-primary/25 bg-primary/5"
              : "border-line bg-surface"
          )}
        >
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              action.featured ? "bg-primary text-white" : "bg-primary/10 text-primary"
            )}
          >
            <action.icon className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">{action.title}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {action.description}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </div>
  );
}
