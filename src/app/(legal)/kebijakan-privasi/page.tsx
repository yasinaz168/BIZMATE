import { Info } from "lucide-react";

export const metadata = { title: "Kebijakan Privasi" };

export default function PrivacyPolicyPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Kebijakan Privasi</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Terakhir diperbarui: 30 Oktober 2026
      </p>

      <div className="mt-6 flex items-start gap-3 rounded-xl bg-muted p-4 text-sm leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          BIZMATE masih dalam tahap pengembangan. Dokumen ini akan dilengkapi
          sebelum aplikasi menerima data pengguna yang sebenarnya (Tahap 2).
          Mau tahu lebih awal? Hubungi kami di{" "}
          <a href="mailto:hello@bizmate.id" className="font-medium text-primary hover:underline">
            hello@bizmate.id
          </a>
          .
        </p>
      </div>

      <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-foreground">
        <section>
          <h2 className="text-lg font-bold">Prinsip privasi BIZMATE</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Data bisnis Anda (transaksi, produk, catatan) hanya bisa diakses oleh akun Anda sendiri.</li>
            <li> Kami tidak menjual atau membagikan data bisnis Anda kepada pihak ketiga untuk tujuan iklan.</li>
            <li>API key dan kredensial sistem dijaga di sisi server, tidak pernah berjalan di browser Anda.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-bold">Data apa yang kami simpan?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Nama dan email akun, nama bisnis, kategori bisnis, produk, transaksi, serta riwayat
            percakapan dengan AI Assistant. Detail teknis akan ditulis di sini setelah struktur
            database final (Tahap 2).
          </p>
        </section>
      </div>
    </>
  );
}
