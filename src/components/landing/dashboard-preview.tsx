import { Bot, Bot as BotIcon } from "lucide-react";

/**
 * Mockup dashboard BIZMATE untuk hero section — dibuat murni dengan
 * div + SVG (tanpa chart library di marketing page), ringan dan tetap cantik.
 */
export function DashboardPreview() {
  return (
    <div className="relative">
      {/* Glow dekoratif */}
      <div
        aria-hidden="true"
        className="absolute -inset-6 rounded-[32px] bg-primary/10 blur-3xl"
      />

      <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-primary-deep shadow-lift">
        {/* Bar atas - seperti chrome aplikasi */}
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-white">
            <Bot className="h-4 w-4" strokeWidth={2.2} />
          </span>
          <span className="text-sm font-bold text-white">BIZMATE</span>
          <span className="ml-2 rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-white/70">
            Dashboard
          </span>
          <div className="ml-auto flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-white/20" />
            <span className="h-2 w-2 rounded-full bg-white/20" />
            <span className="h-2 w-2 rounded-full bg-white/20" />
          </div>
        </div>

        {/* Isi mockup */}
        <div className="p-4 sm:p-5">
          {/* Kartu statistik mini */}
          <div className="grid grid-cols-3 gap-2.5">
            <MiniStat label="Penjualan Hari Ini" value="Rp 485rb" />
            <MiniStat label="Transaksi" value="143" />
            <MiniStat label="Keuntungan" value="Rp 5,03jt" />
          </div>

          {/* Grafik + produk */}
          <div className="mt-2.5 grid grid-cols-5 gap-2.5">
            <div className="col-span-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-[10px] font-medium text-white/50">Tren Penjualan</p>
              <ChartMockup />
            </div>
            <div className="col-span-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="mb-2 text-[10px] font-medium text-white/50">Produk Terlaris</p>
              <ul className="space-y-2">
                {[
                  { name: "Kopi Susu", pct: 92 },
                  { name: "Roti Bakar", pct: 68 },
                  { name: "Matcha", pct: 44 },
                ].map((p) => (
                  <li key={p.name}>
                    <div className="flex justify-between text-[10px] text-white/70">
                      <span>{p.name}</span>
                      <span className="text-white/40">{p.pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${p.pct}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Chip AI */}
          <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-white">
              <BotIcon className="h-3.5 w-3.5" />
            </span>
            <p className="text-[11px] leading-snug text-white/70">
              <span className="font-semibold text-white">AI Insight:</span> Penjualan 14 hari terakhir naik, terutama akhir pekan.
            </p>
          </div>
        </div>
      </div>

      {/* Chip mengambang kiri */}
      <div className="absolute -left-3 top-16 hidden animate-fade-up rounded-xl border border-line bg-surface px-3.5 py-2.5 shadow-lift sm:block lg:-left-10">
        <p className="text-[10px] font-medium text-muted-foreground">Transaksi baru</p>
        <p className="text-sm font-bold text-primary">+ Rp 135.000</p>
      </div>

      {/* Chip mengambang kanan */}
      <div className="absolute -right-3 bottom-10 hidden animate-fade-up rounded-xl border border-line bg-surface px-3.5 py-2.5 shadow-lift sm:block lg:-right-10">
        <p className="text-[10px] font-medium text-muted-foreground">AI mencatat</p>
        <p className="text-sm font-bold text-foreground">&ldquo;3 kaos × 75rb&rdquo;</p>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
      <p className="truncate text-[9px] font-medium text-white/50">{label}</p>
      <p className="mt-0.5 truncate text-[13px] font-bold text-white">{value}</p>
    </div>
  );
}

/** Grafik berupa SVG area sederhana — murni dekoratif di mockup */
function ChartMockup() {
  return (
    <svg viewBox="0 0 160 64" className="mt-2 h-14 w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="mockFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#087F73" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#087F73" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 50 L20 44 L40 47 L60 36 L80 40 L100 28 L120 22 L140 26 L160 14 L160 64 L0 64 Z"
        fill="url(#mockFill)"
      />
      <path
        d="M0 50 L20 44 L40 47 L60 36 L80 40 L100 28 L120 22 L140 26 L160 14"
        fill="none"
        stroke="#087F73"
        strokeWidth="2"
      />
      <circle cx="160" cy="14" r="3" fill="#087F73" stroke="#123D38" strokeWidth="1.5" />
    </svg>
  );
}
