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
}

type MockQuery = {
  select: () => MockQuery;
  eq: () => MockQuery;
  order: () => MockQuery;
  limit: () => MockQuery;
  insert: () => MockQuery;
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
}

/**
 * Client tiruan dengan antrean hasil FIFO: setiap operasi query/insert
 * memakai hasil berikutnya dari `results` (urutan pemanggilan di route
 * bersifat deterministik).
 */
export function makeMockSupabase(results: QueryResult[]): MockSupabase {
  const inserts: RecordedInsert[] = [];
  let idx = 0;
  const next = (): QueryResult => results[idx++] ?? { data: null, error: null };

  const from = (table: string): MockQuery => {
    const chain: MockQuery = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      insert: () => {
        inserts.push({ table, op: "insert" });
        return chain;
      },
      single: () => Promise.resolve(next()),
      maybeSingle: () => Promise.resolve(next()),
      then: (onFulfilled, onRejected) =>
        Promise.resolve(next()).then(onFulfilled, onRejected),
    };
    return chain;
  };

  return {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from,
    inserts,
  };
}
