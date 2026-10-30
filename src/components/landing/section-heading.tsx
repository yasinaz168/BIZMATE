/**
 * Kepala seksi yang konsisten: eyebrow kecil + judul besar + subjudul.
 * Di latar gelap (tone="dark"), eyebrow memakai primary-bright agar
 * kontrasnya memenuhi WCAG AA (#087F73 di atas #123D38 hanya 2.45:1).
 */
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
        className={cnEyebrow(tone)}
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

function cnEyebrow(tone: "default" | "dark") {
  const base = "text-xs font-bold uppercase tracking-widest";
  return tone === "dark" ? `${base} text-primary-bright` : `${base} text-primary-ink`;
}
