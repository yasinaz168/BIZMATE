import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Pengujian kontras ComingSoon (fix UI/laporan):
 * Bug: blok bawah "Rencana build" berlatar TERANG (bg-surface) memakai
 * teks putih saat tone "dark" → teks tak terlihat, hanya ikon centang.
 *
 * Dijaga:
 * - Blok bawah memakai warna tersedia di latar terang (text-foreground /
 *   text-muted-foreground), KEDUA tone.
 * - Panel gelap atas (benar-benar gelap) tetap boleh memakai teks putih —
 *   pengujian memastikan penggunaan warna putih tidak berlebihan.
 * - Konten/struktur informasi tidak berubah (judul & daftar tetap ada).
 */

const source = readFileSync(
  fileURLToPath(new URL("./coming-soon.tsx", import.meta.url)),
  "utf8"
);

describe("ComingSoon — kontras blok 'Rencana build'", () => {
  it("heading blok bawah memakai warna latar terang (text-foreground), dua heading", () => {
    expect(
      (source.match(/text-sm font-semibold text-foreground/g) || []).length
    ).toBe(2);
  });

  it("daftar planned & paragraf samping memakai text-muted-foreground", () => {
    expect(source).toContain('className="mt-3 space-y-2.5 text-muted-foreground"');
    expect(source).toContain('"mt-3 text-sm leading-relaxed text-muted-foreground"');
  });

  it("pola bug 'teks putih pada blok terang' tidak ada lagi", () => {
    // cn(..., tone === "dark" ? "text-white" : "") pada heading blok bawah
    expect(source).not.toContain(`tone === "dark" ? "text-white" : ""`);
    // text-white/70 hanya tersisa pada panel gelap yang memang gelap (1×)
    expect((source.match(/text-white\/70/g) || []).length).toBe(1);
  });

  it("isi informasi tidak berubah", () => {
    expect(source).toContain("Yang dibangun di {phase.toLowerCase()}:");
    expect(source).toContain("{item}");
    expect(source).toContain("Sementara itu:");
    // dipakai oleh halaman /laporan dan /assistant/nota (keduanya dark)
    const laporan = readFileSync(
      fileURLToPath(new URL("../../app/(app)/laporan/page.tsx", import.meta.url)),
      "utf8"
    );
    const nota = readFileSync(
      fileURLToPath(new URL("../../app/(app)/assistant/nota/page.tsx", import.meta.url)),
      "utf8"
    );
    expect(laporan).toContain("<ComingSoon");
    expect(nota).toContain('tone="dark"');
  });
});
