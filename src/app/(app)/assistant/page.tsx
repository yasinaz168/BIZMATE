import { Bot, MessagesSquare, Edit3, CircleCheck } from "lucide-react";
import { ComingSoon } from "@/components/app/coming-soon";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "AI Assistant" };

export default function AssistantPage() {
  return (
    <>
      <ComingSoon
        title="AI Chat Transaction"
        phase="Tahap 4"
        icon={Bot}
        description="Fitur inti BIZMATE. Tulis transaksi dengan bahasa sehari-hari, AI mengubahnya menjadi data yang siap disimpan."
        planned={[
          "Chat AI dalam Bahasa Indonesia, respon natural",
          "Contoh: \"Hari ini saya menjual 3 kaos harga 75 ribu per buah\" → data terstruktur otomatis",
          "Preview transaksi sebelum disimpan — kamu bisa edit lalu konfirmasi",
          "AI bertanya balik bila data tidak lengkap (tidak menebak harga atau tanggal)",
          "Panggilan LLM dilakukan di server (API key tidak pernah ada di browser)",
        ]}
      />

      {/* Contoh visual alur (bukan fitur aktif — diberi label jelas sebagai pratinjau) */}
      <div className="mt-6 flex items-center gap-2.5">
        <Badge variant="muted">Pratinjau Alur</Badge>
        <span className="text-xs text-muted-foreground">Berikut cara kerja yang dibangun di Tahap 4 (belum aktif):</span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-4">
        {ALUR_STEPS.map((step) => (
          <div key={step.title} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <step.icon className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <p className="mt-3 text-sm font-semibold">{step.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.desc}</p>
          </div>
        ))}
      </div>
    </>
  );
}

const ALUR_STEPS = [
  {
    title: "1. Kamu menulis",
    desc: "Catat transaksi seperti sedang chat biasa.",
    icon: MessagesSquare,
  },
  {
    title: "2. AI memahami",
    desc: "Server mengirim pesan ke LLM dan menerima data terstruktur.",
    icon: Bot,
  },
  {
    title: "3. Kamu konfirmasi",
    desc: "Preview muncul, bisa diedit sebelum disimpan.",
    icon: Edit3,
  },
  {
    title: "4. Data tersimpan",
    desc: "Transaksi masuk ke database dan dashboard ikut diperbarui.",
    icon: CircleCheck,
  },
];
