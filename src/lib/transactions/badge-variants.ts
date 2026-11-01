/**
 * Nama varian Badge — diambil dari `badgeVariants` di
 * src/components/ui/badge.tsx agar lib tidak perlu mengimpor React.
 * Bila varian badge berubah, daftar ini ikut disesuaikan.
 */
export type BadgeVariant =
  | "default"
  | "deep"
  | "outline"
  | "income"
  | "expense"
  | "orange"
  | "muted"
  | "on-dark";
