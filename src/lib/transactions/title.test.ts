import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  cleanTransactionCore,
  normalizeTransactionTitle,
  TITLE_MAX_CHARS,
} from "./title";

/**
 * R1.a — normalisasi keterangan transaksi.
 * Dijaga: 4 contoh target, ekor penghubung, prefiks ganda, kata
 * berulang, input ambigu, judul panjang, ANTI-FABRIKASI, input kosong.
 */

describe("R1.a — 4 contoh target produk", () => {
  it("bayar tagihan token listrik toko → Pembayaran token listrik toko", () => {
    expect(
      normalizeTransactionTitle("expense", "bayar tagihan token listrik toko")
    ).toBe("Pembayaran token listrik toko");
  });

  it("beli bahan-bahan kue → Pembelian bahan kue", () => {
    expect(normalizeTransactionTitle("expense", "beli bahan-bahan kue")).toBe(
      "Pembelian bahan kue"
    );
  });

  it("jual es teh → Penjualan es teh", () => {
    expect(normalizeTransactionTitle("income", "jual es teh")).toBe(
      "Penjualan es teh"
    );
  });

  it("jual loyang brownies → Penjualan loyang brownies", () => {
    expect(normalizeTransactionTitle("income", "jual loyang brownies")).toBe(
      "Penjualan loyang brownies"
    );
  });
});

describe("R1.a — kebersihan core (ekor penghubung, kata ganda, nominal)", () => {
  it("ekor 'dengan'/'untuk'/'yang' dibuang", () => {
    expect(normalizeTransactionTitle("income", "es teh dengan")).toBe(
      "Penjualan es teh"
    );
    expect(normalizeTransactionTitle("expense", "hadiah untuk")).toBe(
      "Pengeluaran hadiah"
    );
    expect(normalizeTransactionTitle("income", "brownies yang")).toBe(
      "Penjualan brownies"
    );
  });

  it("kata ganda berdampingan (dengan/tanpa tanda hubung) diringkas", () => {
    expect(normalizeTransactionTitle("expense", "beli bahan bahan kue")).toBe(
      "Pembelian bahan kue"
    );
    expect(normalizeTransactionTitle("expense", "beli bahan-bahan kue")).toBe(
      "Pembelian bahan kue"
    );
  });

  it("nominal & kuantitas tidak masuk judul", () => {
    expect(normalizeTransactionTitle("income", "jual 10 gelas es teh 50rb")).toBe(
      "Penjualan es teh"
    );
    expect(cleanTransactionCore("bayar token 100rb pakai QRIS")).toBe(
      "bayar token pakai QRIS"
    );
  });

  it("kata ganti 'Aku' dan sapaan dibuang (kasus 'Aku … dengan')", () => {
    expect(
      normalizeTransactionTitle("expense", "Aku tagihan token listrik toko dengan")
    ).toBe("Pembayaran token listrik toko");
    expect(normalizeTransactionTitle("income", "saya jual es teh")).toBe(
      "Penjualan es teh"
    );
  });
});

describe("R1.a — prefiks ganda dihindari", () => {
  it("core berawalan kata kategori tidak diberi prefiks lagi", () => {
    expect(normalizeTransactionTitle("income", "Penjualan es teh")).toBe(
      "Penjualan es teh"
    );
    expect(normalizeTransactionTitle("income", "penjualan es teh")).toBe(
      "Penjualan es teh"
    );
    expect(normalizeTransactionTitle("expense", "pembayaran token listrik")).toBe(
      "Pembayaran token listrik"
    );
  });
});

describe("R1.a — kategori expense", () => {
  it("kewajiban eksplisit → Pembayaran (tagihan redundan dibuang)", () => {
    expect(normalizeTransactionTitle("expense", "listrik toko")).toBe(
      "Pembayaran listrik toko"
    );
    expect(normalizeTransactionTitle("expense", "sewa ruko")).toBe(
      "Pembayaran sewa ruko"
    );
    expect(normalizeTransactionTitle("expense", "bayar gaji karyawan")).toBe(
      "Pembayaran gaji karyawan"
    );
  });

  it("konteks jelas pembelian barang → Pembelian", () => {
    expect(normalizeTransactionTitle("expense", "bahan kue")).toBe(
      "Pembelian bahan kue"
    );
    expect(normalizeTransactionTitle("expense", "stok kopi")).toBe(
      "Pembelian stok kopi"
    );
    expect(normalizeTransactionTitle("expense", "pesan kardus")).toBe(
      "Pembelian kardus"
    );
  });

  it("input ambigu → fallback NETRAL Pengeluaran (tanpa mengarang kategori)", () => {
    expect(normalizeTransactionTitle("expense", "hadiah karyawan")).toBe(
      "Pengeluaran hadiah karyawan"
    );
    expect(normalizeTransactionTitle("expense", "transportasi ke pasar")).toBe(
      "Pengeluaran transportasi ke pasar"
    );
  });
});

describe("R1.a — judul panjang dipotong pada batas kata", () => {
  it("<= 150 karakter utuh; lebih → dipotong di batas kata", () => {
    const long = `jual ${Array.from({ length: 40 }, (_, i) => `produk${i}`).join(" ")}`;
    const title = normalizeTransactionTitle("income", long);
    expect(title.length).toBeLessThanOrEqual(TITLE_MAX_CHARS);
    expect(title.endsWith(" ")).toBe(false);
    // dipotong di batas kata: tidak berakhir dengan potongan kata aneh
    expect(title).toMatch(/\S$/);
    expect(title.startsWith("Penjualan")).toBe(true);
  });
});

describe("R1.a — ANTI-FABRIKASI & input kosong", () => {
  it("tidak ada objek/nama baru yang ditambahkan di luar pesan pengguna", () => {
    const inputs: Array<[string, string]> = [
      ["income", "jual es teh"],
      ["expense", "beli bahan-bahan kue"],
      ["expense", "bayar tagihan token listrik toko"],
      ["expense", "Aku tagihan token listrik toko dengan"],
    ];
    for (const [type, core] of inputs) {
      const title = normalizeTransactionTitle(type as "income" | "expense", core);
      // buang prefiks kategori; semua sisa kata harus ada di input
      const body = title.replace(
        /^(?:Penjualan|Pembelian|Pembayaran|Pengeluaran)\s+/,
        ""
      );
      for (const word of body.toLowerCase().split(/\s+/).filter(Boolean)) {
        expect(core.toLowerCase().replace(/-/g, " ")).toContain(word);
      }
    }
  });

  it("input kosong/putih → '' (tanpa judul palsu)", () => {
    expect(normalizeTransactionTitle("income", "")).toBe("");
    expect(normalizeTransactionTitle("expense", "   ")).toBe("");
    expect(normalizeTransactionTitle("expense", "100rb")).toBe(""); // hanya nominal
  });
});

describe("R1.c — kontrak SYSTEM_PROMPT (judul semantik LLM)", () => {
  const prompt = readFileSync(
    fileURLToPath(new URL("../ai/llm.ts", import.meta.url)),
    "utf8"
  );

  it("pola judul & aturan anti-salinan/anti-ganda/anti-fabrikasi ada", () => {
    expect(prompt).toContain("[Penjualan|Pembelian|Pembayaran|Pengeluaran] + objek/keperluan");
    expect(prompt).toContain("JANGAN menyalin kalimat mentah pengguna");
    expect(prompt).toContain("JANGAN membuat prefiks ganda");
    expect(prompt).toContain("JANGAN mengarang objek, nominal, jumlah");
  });

  it("empat contoh few-shot target tersedia", () => {
    expect(prompt).toContain('"Pembayaran token listrik toko"');
    expect(prompt).toContain('"Pembelian bahan kue"');
    expect(prompt).toContain('"Penjualan es teh"');
    expect(prompt).toContain('"Penjualan loyang brownies"');
  });

  it("instruksi lama yang bermasalah (judul = salinan frasa) sudah diganti", () => {
    expect(prompt).not.toContain("judul itu pendek: nama item/jasa, bukan kalimat utuh");
  });
});

describe("R1.1 — kata kerja redundan di ekor ('dengan membayar' dsb.)", () => {
  it("'Pembayaran pajak toko dengan membayar' → Pembayaran pajak toko", () => {
    expect(
      normalizeTransactionTitle("expense", "Pembayaran pajak toko dengan membayar")
    ).toBe("Pembayaran pajak toko");
  });

  it("'Pembayaran token listrik dengan membayar' → Pembayaran token listrik", () => {
    expect(
      normalizeTransactionTitle("expense", "Pembayaran token listrik dengan membayar")
    ).toBe("Pembayaran token listrik");
    // varian tanpa prefiks juga bersih (lewat deteksi aktivitas)
    expect(
      normalizeTransactionTitle("expense", "bayar token listrik dengan membayar")
    ).toBe("Pembayaran token listrik");
  });

  it("'Pembelian bahan kue dengan membeli' → Pembelian bahan kue", () => {
    expect(
      normalizeTransactionTitle("expense", "Pembelian bahan kue dengan membeli")
    ).toBe("Pembelian bahan kue");
  });

  it("'Penjualan es teh dengan menjual' → Penjualan es teh", () => {
    expect(
      normalizeTransactionTitle("income", "Penjualan es teh dengan menjual")
    ).toBe("Penjualan es teh");
  });

  it("judul normal TANPA redundansi tetap utuh", () => {
    expect(normalizeTransactionTitle("income", "jual es teh")).toBe("Penjualan es teh");
    expect(normalizeTransactionTitle("expense", "bayar tagihan token listrik toko")).toBe(
      "Pembayaran token listrik toko"
    );
    expect(normalizeTransactionTitle("expense", "beli bahan kue")).toBe(
      "Pembelian bahan kue"
    );
    expect(
      normalizeTransactionTitle("income", "Penjualan es teh") // tanpa ekor verb
    ).toBe("Penjualan es teh");
  });

  it("nama produk yang mengandung kata kerja (whole-word) tidak rusak", () => {
    // "belimbing" mengandung "beli" — tidak boleh tersentuh (butuh kata utuh)
    expect(normalizeTransactionTitle("expense", "beli belimbing")).toBe(
      "Pembelian belimbing"
    );
    expect(normalizeTransactionTitle("income", "jual belimbing")).toBe(
      "Penjualan belimbing"
    );
  });

  it("keamanan konteks: kata kerja dengan kategori BERBEDA dari prefiks TIDAK dibuang", () => {
    // "menjual" (sale) tidak dihapus dari judul berkategori Pembelian
    expect(
      normalizeTransactionTitle("expense", "Pembelian kue dengan menjual")
    ).toBe("Pembelian kue dengan menjual");
  });

  it("end-to-end mock: 'bayar tagihan token listrik toko dengan membayar 100rb'", async () => {
    const { parseSimulation } = await import("./../ai/mock-parser");
    const r = parseSimulation("Aku tadi bayar tagihan token listrik toko dengan membayar 100rb");
    expect(r.transaction?.title).toBe("Pembayaran token listrik toko");
    expect(r.transaction?.unit_price).toBe(100000);
  });
});
