import {
  NotebookPen,
  TrendingDown,
  CalendarClock,
  CircleHelp,
} from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";

const PROBLEMS = [
  {
    icon: NotebookPen,
    title: "Pencatatan masih manual",
    text: "Catatan transaksi tercecer di buku, HP, atau kepala saja. Saat ramai, pencatatan sering terlewat.",
  },
  {
    icon: TrendingDown,
    title: "Sulit memantau penjualan",
    text: "Berapa penjualan hari ini? Bulan ini? Harus dihitung ulang manual — dan sering meleset.",
  },
  {
    icon: CalendarClock,
    title: "Laporan memakan waktu",
    text: "Membuat laporan bulanan bisa makan waktu berjam-jam rekap, padahal harusnya cukup beberapa klik.",
  },
  {
    icon: CircleHelp,
    title: "Sulit memahami performa",
    text: "Angka mentah tidak menceritakan apa pun. Bisnis sedang tumbuh atau malah bocor tidak terlihat.",
  },
];

/** Problem Section: masalah nyata UMKM yang BIZMATE selesaikan. */
export function ProblemSection() {
  return (
    <section className="bg-surface py-16 lg:py-20" id="masalah">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Masalah UMKM"
          title="Kita tahu capeknya jualan sambil jadi admin sekaligus."
          subtitle="Pemilik usaha kecil punya waktu terbatas. BIZMATE dirancang untuk mengurangi pekerjaan administrasi, bukan menambahnya."
        />

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {PROBLEMS.map((item) => (
            <div
              key={item.title}
              className="group flex gap-4 rounded-2xl border border-line bg-background p-6 transition-all hover:border-primary/30 hover:shadow-card"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                <item.icon className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <div>
                <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
