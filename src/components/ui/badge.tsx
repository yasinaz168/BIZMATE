import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Badge kecil untuk status (pemasukan/pengeluaran/label/dll). */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary-ink",
        deep: "bg-primary-deep text-primary-foreground",
        outline: "border border-line bg-transparent text-muted-foreground",
        income: "bg-primary/10 text-primary-ink",
        expense: "bg-expense/10 text-expense",
        orange: "bg-orange-100 text-orange-700",
        muted: "bg-muted text-muted-foreground",
        "on-dark": "bg-white/10 text-white/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
