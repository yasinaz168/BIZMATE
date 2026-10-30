/** Kepala seksi yang konsisten: eyebrow kecil + judul besar + subjudul. */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
  tone = "default",
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  tone?: "default" | "dark";
}) {
  return (
    <div className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : ""}`}>
      <span
        className={`text-xs font-bold uppercase tracking-widest ${
          tone === "dark" ? "text-primary" : "text-primary"
        }`}
      >
        {eyebrow}
      </span>
      <h2
        className={`mt-3 text-3xl font-extrabold tracking-tight lg:text-4xl ${
          tone === "dark" ? "text-white" : "text-foreground"
        }`}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={`mt-4 text-base leading-relaxed ${
            tone === "dark" ? "text-white/60" : "text-muted-foreground"
          }`}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
