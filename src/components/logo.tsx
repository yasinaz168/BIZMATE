import { Store } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Logo BIZMATE. Logo ini TIDAK menampilkan nama bisnis pengguna —
 * nama bisnis pengguna baru muncul setelah registrasi & onboarding.
 */
export function Logo({
  className,
  variant = "light",
}: {
  className?: string;
  /** light = di atas latar gelap; dark = di atas latar terang */
  variant?: "light" | "dark";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-[10px]",
          variant === "light" ? "bg-primary text-white" : "bg-primary-deep text-white"
        )}
      >
        <Store className="h-[18px] w-[18px]" strokeWidth={2.2} />
      </span>
      <span
        className={cn(
          "text-lg font-extrabold tracking-tight",
          variant === "light" ? "text-white" : "text-foreground"
        )}
      >
        BIZMATE
      </span>
    </span>
  );
}
