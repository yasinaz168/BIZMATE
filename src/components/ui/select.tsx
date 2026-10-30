import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Select menggunakan elemen <select> native — lebih sederhana,
 * bekerja baik di mobile, dan mudah dipahami untuk developer pemula.
 */
const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "flex h-11 w-full appearance-none rounded-lg border border-line bg-surface px-3.5 py-2 pr-9 text-sm text-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = "Select";

/** Wrapper untuk menampilkan panah kecil di kanan select. */
function SelectWithIcon({
  className,
  iconClassName,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { iconClassName?: string }) {
  return (
    <div className="relative">
      <Select className={cn(className, "pr-9")} {...props}>
        {children}
      </Select>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground",
          iconClassName
        )}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

export { Select, SelectWithIcon };
