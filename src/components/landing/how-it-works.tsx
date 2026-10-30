import { MessageSquare, Bot, LineChart } from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";

const STEPS = [
  {
    icon: MessageSquare,
    title: "Catat transaksi",
    text: "Chat biasa, foto nota, atau isi manual. Pilih cara tercepat untukmu.",
  },
  {
    icon: Bot,
    title: "AI mengolah data",
    text: "AI merapikan semua catatan menjadi data yang terstruktur dan akurat.",
  },
  {
    icon: LineChart,
    title: "Pantau hasil bisnis",
    text: "Dashboard laporan dan insight selalu siap, tanpa perlu rekap manual.",
  },
];

/** How It Works: 3 langkah sederhana. */
export function HowItWorks() {
  return (
    <section className="bg-primary-deep py-16 lg:py-24" id="tentang">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Cara Kerja"
          title="Tiga langkah. Selesai."
          subtitle="BIZMATE dibuat untuk pemilik usaha yang sibuk — bukan akuntan."
          tone="dark"
        />

        <div className="relative mt-14 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
          {/* Garis koneksi antar langkah (desktop) */}
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-[26px] hidden border-t border-dashed border-white/15 md:block"
          />
          {STEPS.map((step, index) => (
            <div key={step.title} className="relative text-center md:text-left">
              <div className="flex items-center justify-center gap-4 md:justify-start">
                <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-lift">
                  <step.icon className="h-6 w-6" strokeWidth={2.2} />
                </span>
                <span className="text-4xl font-extrabold text-white/15">{index + 1}</span>
              </div>
              <h3 className="mt-5 text-lg font-bold text-white">{step.title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/60 md:mx-0">
                {step.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
