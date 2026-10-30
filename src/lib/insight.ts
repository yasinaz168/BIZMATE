import { formatIDR } from "@/lib/format";

/**
 * Ringkasan bisnis OTOMATIS yang dihitung langsung dari data
 * transaksi nyata (rule-based).
 *
 * PENTING: LLM tidak dipakai di sini (baru di Tahap 7). Semua angka dan
 * narasi dihasilkan dari perhitungan di file ini — jujur karena
 * berbasis data. Jika data belum cukup, file ini TERBUKA mengatakannya.
 */

interface InsightRows {
  type: "income" | "expense";
  title: string;
  quantity: number | null;
  total: number;
  transacted_at: string;
}

export interface AutoInsight {
  headline: string;
  bullets: string[];
  /** true = benar-benar belum ada data pendukung */
  isEmpty: boolean;
}

export function buildAutoInsight(rows: InsightRows[]): AutoInsight {
  if (rows.length === 0) {
    return {
      isEmpty: true,
      headline: "Belum cukup data — belum ada transaksi bulan ini.",
      bullets: [
        "Tambahkan transaksi pertamamu lewat AI Chat, foto nota, atau input manual.",
        "Insight mulai muncul setelah ada beberapa transaksi pemasukan.",
        "Aku (insight otomatis) akan membandingkan pekan ini dengan pekan sebelumnya begitu datanya ada.",
      ],
    };
  }

  const income = rows.filter((r) => r.type === "income");
  const expenses = rows.filter((r) => r.type === "expense");
  const totalIncome = income.reduce((s, r) => s + Number(r.total), 0);
  const totalExpense = expenses.reduce((s, r) => s + Number(r.total), 0);

  if (income.length === 0) {
    return {
      isEmpty: false,
      headline: "Bulan ini belum ada transaksi pemasukan yang tercatat.",
      bullets: [
        `Ada ${expenses.length} transaksi pengeluaran senilai ${formatIDR(totalExpense)} tapi belum ada catatan penjualan.`,
        "Catat penjualan tiap hari agar pembanding antar-pekan bisa jalan.",
      ],
    };
  }

  if (income.length < 5) {
    return {
      isEmpty: false,
      headline: "Data masih sedikit — insight belum terlalu berarti.",
      bullets: [
        `Sudah ada ${income.length} transaksi penjualan sebesar ${formatIDR(totalIncome)} bulan ini.`,
        "Menulis tiap penjualan (bahwa yang kecil sekalipun) akan membuat pembanding pekan ini akurat.",
        totalExpense > 0
          ? `Pengeluaran tercatat ${formatIDR(totalExpense)} selama bulan ini.`
          : "Belum ada pengeluaran yang tercatat.",
      ],
    };
  }

  // ---------- Data cukup: bandingkan pekan ini vs pekan lalu (WIB) ----------
  const nowMs = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;

  const incomeThisWeek = income.filter(
    (r) => Date.parse(r.transacted_at) > nowMs - week
  );
  const incomePrevWeek = income.filter(
    (r) =>
      Date.parse(r.transacted_at) > nowMs - 2 * week &&
      Date.parse(r.transacted_at) <= nowMs - week
  );

  const sum = (list: InsightRows[]) => list.reduce((s, r) => s + Number(r.total), 0);
  const thisWeek = sum(incomeThisWeek);
  const prevWeek = sum(incomePrevWeek);

  // produk terlaris
  const qtyByProduct = new Map<string, number>();
  for (const r of income) {
    qtyByProduct.set(r.title, (qtyByProduct.get(r.title) ?? 0) + Number(r.quantity ?? 1));
  }
  const topProduct = [...qtyByProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .find(([, q]) => q > 0)?.[0];

  const bullets: string[] = [];

  if (prevWeek > 0) {
    const pct = Math.round(((thisWeek - prevWeek) / prevWeek) * 100);
    if (pct >= 0) {
      bullets.push(
        `Penjualan 7 hari terakhir ${formatIDR(thisWeek)} — naik ${pct}% dibanding 7 hari sebelumnya (${formatIDR(prevWeek)}).`
      );
    } else {
      bullets.push(
        `Penjualan 7 hari terakhir ${formatIDR(thisWeek)} — turun ${Math.abs(pct)}% dibanding 7 hari sebelumnya (${formatIDR(prevWeek)}).`
      );
    }
  } else if (thisWeek === 0) {
    bullets.push(
      `7 hari terakhir belum ada penjualan tercatat; total penjualan bulan ini ${formatIDR(totalIncome)}.`
    );
  } else {
    bullets.push(
      `Penjualan 7 hari terakhir ${formatIDR(thisWeek)} (tidak ada pembanding dari pekan pertama bulan ini).`
    );
  }

  bullets.push(
    topProduct
      ? `Produk paling laris: ${topProduct}.`
      : "Belum ada detail jumlah per produk."
  );

  if (totalExpense > totalIncome) {
    bullets.push(
      `Perhatian: pengeluaran (${formatIDR(totalExpense)}) lebih besar dari penjualan (${formatIDR(totalIncome)}) bulan ini.`
    );
  } else if (totalExpense > 0) {
    bullets.push(
      `Selisih sederhana: ${formatIDR(totalIncome - totalExpense)} (penjualan dikurangi pengeluaran tercatat — bukan keuntungan final karena modal per produk belum dicatat semua).`
    );
  } else {
    bullets.push("Belum ada pengeluaran tercatat — catat modal supaya estimasi keuntungan akurat.");
  }

  return {
    isEmpty: false,
    headline:
      prevWeek > 0 && thisWeek >= prevWeek
        ? "Penjualan 7 hari terakhir berkembang."
        : prevWeek > 0
          ? "Penjualan 7 hari terakhir menurun — perlu dicek."
          : "Data penjualan mulai menumpuk — bagus!",
    bullets,
  };
}
