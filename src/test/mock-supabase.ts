/**
 * Bantuan PENGUJIAN — mock client Supabase untuk unit test route handler.
 *
 * File ini HANYA diimpor oleh berkas *.test.ts (tidak pernah oleh kode
 * aplikasi), sehingga tidak ikut masuk bundle produksi.
 *
 * Objek error yang dikembalikan sengaja BOLEH berisi field sensitif
 * (details/hint/dll.) untuk menguji bahwa logger tidak pernah mencetaknya.
 */

export interface QueryResult {
  data?: unknown;
  error?: unknown;
}

export interface RecordedInsert {
  table: string;
  op: "insert";
  /** Payload insert — untuk verifikasi (mis. business_id dari server) */
  payload?: Record<string, unknown>;
}

/** Operasi UPDATE yang tercatat — untuk memverifikasi alur edit/status */
export interface RecordedUpdate {
  table: string;
  op: "update";
  payload?: Record<string, unknown>;
}

/** Operasi DELETE yang tercatat (P4.2) — dipakai untuk memverifikasi
 *  jalur hapus percakapan tidak menyentuh tabel transaksi. */
export interface RecordedDelete {
  table: string;
  op: "delete";
}

/** Pemanggilan RPC (mis. create_sale) — untuk verifikasi kontrak POS */
export interface RecordedRpc {
  name: string;
  args?: Record<string, unknown>;
}

type MockQuery = {
  select: () => MockQuery;
  eq: () => MockQuery;
  order: () => MockQuery;
  limit: () => MockQuery;
  insert: (payload?: Record<string, unknown>) => MockQuery;
  update: (payload?: Record<string, unknown>) => MockQuery;
  delete: () => MockQuery;
  single: () => Promise<QueryResult>;
  maybeSingle: () => Promise<QueryResult>;
  then: <T1 = QueryResult, T2 = never>(
    onFulfilled?: ((value: QueryResult) => T1 | PromiseLike<T1>) | null,
    onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ) => Promise<T1 | T2>;
};

export interface MockSupabase {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
  from: (table: string) => MockQuery;
  /** Semua operasi INSERT yang terjadi — untuk memverifikasi alur simpan */
  inserts: RecordedInsert[];
  /** Semua operasi UPDATE yang terjadi — untuk memverifikasi alur ubah */
  updates: RecordedUpdate[];
  /** Semua operasi DELETE yang tercatat (P4.2 hapus percakapan) */
  deletes: RecordedDelete[];
  /** Semua pemanggilan RPC yang tercatat — untuk memverifikasi kontrak POS */
  rpcs: RecordedRpc[];
  /** Hasil yang dijadwalkan untuk pemanggilan RPC berikutnya (diatur test) */
  rpcResult?: QueryResult | null;
  /** Pemanggilan RPC — selalu mengembalikan nilai dari `rpcResult` */
  rpc: (name: string, args?: Record<string, unknown>) => Promise<QueryResult>;
}

/**
 * Client tiruan dengan antrean hasil FIFO: setiap operasi query/insert
 * memakai hasil berikutnya dari `results` (urutan pemanggilan di route
 * bersifat deterministik).
 */
export function makeMockSupabase(results: QueryResult[]): MockSupabase {
  const inserts: RecordedInsert[] = [];
  const updates: RecordedUpdate[] = [];
  const deletes: RecordedDelete[] = [];
  const rpcs: RecordedRpc[] = [];
  let idx = 0;
  const next = (): QueryResult => results[idx++] ?? { data: null, error: null };

  const from = (table: string): MockQuery => {
    const chain: MockQuery = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      insert: (payload) => {
        inserts.push({ table, op: "insert", payload });
        return chain;
      },
      update: (payload) => {
        updates.push({ table, op: "update", payload });
        return chain;
      },
      delete: () => {
        deletes.push({ table, op: "delete" });
        return chain;
      },
      single: () => Promise.resolve(next()),
      maybeSingle: () => Promise.resolve(next()),
      then: (onFulfilled, onRejected) =>
        Promise.resolve(next()).then(onFulfilled, onRejected),
    };
    return chain;
  };

  const mock: MockSupabase = {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from,
    inserts,
    updates,
    deletes,
    rpcs,
    rpcResult: null,
    rpc: (name, args) => {
      rpcs.push({ name, args });
      return Promise.resolve(mock.rpcResult ?? { data: null, error: null });
    },
  };
  return mock;
}
