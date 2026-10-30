import { Bot, CircleAlert } from "lucide-react";

interface AiInsightProps {
  headline: string;
  bullets: string[];
}

/**
 * Kartu AI Business Insight.
 *
 * PENTING (sesuai aturan produk):
 * - Insight WAJIB dibentuk dari data yang benar-benar ada (atau data demo yang
 *   diberi label jelas). AI tidak boleh mengarang angka.
 * - Di Tahap 1 ini masih teks contoh; di Tahap 7, kartu ini diisi dari hasil
 *   LLM yang diberi data riil lewat backend.
 */
export function AiInsightCard({ headline, bullets }: AiInsightProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary-deep/80 bg-primary-deep p-6 text-white shadow-lift">
      {/* Aksen dekoratif halus */}
      <div
        aria-hidden="true"
        className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/30 blur-3xl"
      />
        <div className="relative">
          <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
            <Bot className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold">AI Business Insight</h2>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white/80">
              Contoh · Data Demo
            </span>
          </div>
        </div>

        <p className="mt-4 text-[15px] font-semibold leading-snug text-white/95">{headline}</p>
        <ul className="mt-3 space-y-2.5">
          {bullets.map((bullet, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-white/70">
              <span
                aria-hidden="true"
                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary-bright"
              />
              {bullet}
            </li>
          ))}
        </ul>

        <p className="mt-4 flex items-start gap-1.5 text-xs text-white/60">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Ini ringkasan contoh. Analisis AI yang sebenarnya aktif di Tahap 7, dengan data bisnismu yang nyata.
        </p>
      </div>
    </div>
  );
}
