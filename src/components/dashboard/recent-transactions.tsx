import { formatIDR, getPaymentLabel, getTypeLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TransactionSummary } from "@/types";
import { cn } from "@/lib/utils";

/** Tabel transaksi terbaru. Kolom "Metode" disembunyikan di mobile agar tidak overflow. */
export function RecentTransactions({ transactions }: { transactions: TransactionSummary[] }) {
  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line py-12 text-center">
        <p className="text-sm font-medium text-foreground">Belum ada transaksi</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Transaksi terbaru akan muncul di sini setelah kamu mencatat penjualan atau pengeluaran.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tanggal</TableHead>
          <TableHead>Keterangan</TableHead>
          <TableHead>Jenis</TableHead>
          <TableHead className="hidden md:table-cell">Metode</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="whitespace-nowrap text-muted-foreground">{t.date}</TableCell>
            <TableCell className="max-w-[180px] truncate font-medium sm:max-w-none">
              {t.title}
            </TableCell>
            <TableCell>
              <Badge variant={t.type === "income" ? "income" : "expense"}>
                {getTypeLabel(t.type)}
              </Badge>
            </TableCell>
            <TableCell className="hidden text-muted-foreground md:table-cell">
              {getPaymentLabel(t.method)}
            </TableCell>
            <TableCell
              className={cn(
                "whitespace-nowrap text-right font-semibold",
                t.type === "income" ? "text-income" : "text-expense"
              )}
            >
              {t.type === "income" ? "+" : "−"} {formatIDR(t.amount)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
