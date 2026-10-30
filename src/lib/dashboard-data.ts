import type { SupabaseClient } from "@supabase/supabase-js";
import {
  jakartaTodayISO,
  jakartaDaysAgoN,
  jakartaMonthISO,
  isoToStartOfDayUTC,
  toJakartaDayISO,
  dayLabel,
} from "@/lib/time";
import type { SalesTrendPoint, TopProduct } from "@/types";

/**
 * Sumber data DASHBOARD — semuanya dari tabel transactions milik
 * business pengguna (diquery dengan RLS aktif).
 * Semua agregasi berbasis kalender Asia/Jakarta (WIB).
 */

interface TransactionRow {
  type: "income" | "expense";
  title: string;
  quantity: number | null;
  total: number;
  transacted_at: string;
}

export interface DashboardData {
  todaySales: number;
  monthSales: number;
  monthTransactions: number;
  monthExpenses: number;
  monthProfit: number;
  /** Grafik 14 hari terakhir */
  chart: Array<{ day: string; value: number }>;
  topProducts: TopProduct[];
  recentTransactions: Array<{
    id: string;
    date: string;
    title: string;
    type: "income" | "expense";
    method: string;
    amount: number;
  }>;
  /** true bila belum ada transaksi sama sekali (empty state) */
  hasNoTransactionAtAll: boolean;
}

export async function getDashboardData(
  supabase: SupabaseClient,
  businessId: string
): Promise<DashboardData> {
  const todayISO = jakartaTodayISO();
  const monthISO = jakartaMonthISO();

  // 14 hari terakhir (kalender Jakarta)
  const days = Array.from({ length: 14 }, (_, i) => jakartaDaysAgoN(13 - i));
  const monthStartISO = `${monthISO}-01`;

  const { data, error } = await supabase
    .from("transactions")
    .select("id, type, title, quantity, total, transacted_at, payment_method")
    .eq("business_id", businessId)
    .gte("transacted_at", isoToStartOfDayUTC(monthStartISO))
    .order("transacted_at", { ascending: false });

  if (error) {
    throw new Error(`Gagal mengambil data transaksi: ${error.message}`);
  }

  const rows = (data ?? []) as Array<
    TransactionRow & { id: string; payment_method: string }
  >;

  // ---------- Agregasi ----------
  let todaySales = 0;
  let monthSales = 0;
  let monthExpenses = 0;

  const perDayIncome = new Map<string, number>(days.map((d) => [d, 0]));
  const productQty = new Map<string, number>();
  const productRevenue = new Map<string, number>();

  for (const row of rows) {
    const dayISO = toJakartaDayISO(row.transacted_at);
    if (row.type === "income") {
      monthSales += Number(row.total);
      if (dayISO === todayISO) todaySales += Number(row.total);
      if (perDayIncome.has(dayISO)) {
        perDayIncome.set(dayISO, (perDayIncome.get(dayISO) ?? 0) + Number(row.total));
      }
      const qty = Number(row.quantity ?? 1);
      productQty.set(row.title, (productQty.get(row.title) ?? 0) + qty);
      productRevenue.set(row.title, (productRevenue.get(row.title) ?? 0) + Number(row.total));
    } else {
      monthExpenses += Number(row.total);
    }
  }

  const chart: SalesTrendPoint[] = days.map((d) => ({
    day: dayLabel(d),
    value: Math.round(perDayIncome.get(d) ?? 0),
  }));

  const topProducts: TopProduct[] = [...productQty.entries()]
    .map(([name, qty]) => ({
      rank: 0,
      name,
      sold: qty,
      revenue: Math.round(productRevenue.get(name) ?? 0),
    }))
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 5)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  const recentTransactions = rows
    .slice(0, 6)
    .map((r) => ({
      id: r.id,
      date: new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(r.transacted_at)),
      title: r.title,
      type: r.type,
      method: r.payment_method,
      amount: Math.round(Number(r.total)),
    }));

  return {
    todaySales,
    monthSales,
    monthTransactions: rows.length,
    monthExpenses,
    monthProfit: monthSales - monthExpenses,
    chart,
    topProducts,
    recentTransactions,
    hasNoTransactionAtAll: rows.length === 0,
  };
}
