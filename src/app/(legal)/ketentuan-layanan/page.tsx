import { Info } from "lucide-react";

export const metadata = { title: "Ketentuan Layanan" };

export default function TermsPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Ketentuan Layanan</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Terakhir diperbarui: 30 Oktober 2026
      </p>

      <div className="mt-6 flex items-start gap-3 rounded-xl bg-muted p-4 text-sm leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          Ketentuan resmi akan diaktifkan bersamaan dengan peluncuran publik.
          Saat ini BIZMATE masih dalam tahap pengembangan aktif.
        </p>
      </div>

      <div className="mt-8 space-y-5 text-[15px] leading-relaxed">
        <section>
          <h2 className="text-lg font-bold">1. Tentang layanan</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            BIZMATE adalah perangkat bantu pencatatan dan analisis bisnis berbasis AI.
            Output AI (insight, pembacaan nota) bersifat BANTU dan estimasi — keputusan
            bisnis tetap menjadi tanggung jawab pemilik usaha.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold">2. Akun dan tanggung jawab</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Anda bertanggung jawab menjaga kerahasiaan akun dan kata sandi.
            Satu akun hanya dapat mengakses data bisnis miliknya sendiri.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold">3. Kontak</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Pertanyaan tentang ketentuan ini:{" "}
            <a href="mailto:hello@bizmate.id" className="font-medium text-primary hover:underline">
              hello@bizmate.id
            </a>
          </p>
        </section>
      </div>
    </>
  );
}
