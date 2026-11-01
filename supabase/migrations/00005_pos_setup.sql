-- =====================================================================
-- BIZMATE — MIGRATION 00005
-- POS Setup: permission, source 'pos', CHECK stok, idempotency, RPC create_sale
-- =====================================================================
--
-- Latar belakang (hasil audit P4 T0, kondisi terverifikasi):
--   - products      : authenticated = SELECT, INSERT, UPDATE (00004)
--   - transactions  : authenticated = SELECT, INSERT
--   - transaction_items : BELUM memiliki GRANT yang diperlukan
--   - transactions.source hanya menerima manual/ai_chat/receipt_scan
--   - products.stock nullable numeric(14,2), belum ada CHECK nonnegatif
--     (data terverifikasi bersih: 0 baris stok negatif)
--   - transactions: 2 baris, transaction_items: 0 baris (data lama utuh)
--
-- Isi migration ini (5 bagian, saling independen & idempotent):
--   1. GRANT SELECT, INSERT pada transaction_items (tanpa DELETE/TRUNCATE/
--      REFERENCES/TRIGGER; tanpa menyentuh products/transactions/anon/service_role)
--   2. Perluas CHECK transactions.source → + 'pos' (nilai lama tetap diterima)
--   3. CHECK stok nonnegatif dengan pola NOT VALID → VALIDATE
--      (NULL tetap berarti "tidak dilacak" — TIDAK diubah menjadi 0)
--   4. Idempotency: kolom transactions.request_id + unique partial index
--      (transaksi lama ber-request_id NULL tetap sah)
--   5. RPC public.create_sale — checkout POS atomik (security invoker)
--
-- Prinsip keamanan:
--   - Least privilege: hanya hak yang benar-benar dibutuhkan POS.
--   - RLS & policy existing TIDAK diubah — tetap menjadi pembatas baris.
--   - Tidak menghapus/ mengubah data apa pun (2 transaksi & produk lama utuh).
--   - Tidak menambah CHECK total = quantity * unit_price pada transactions
--     (POS multi-item memakai baris ringkasan; konsistensi per-item berada
--     di transaction_items).
--   - Kompatibel dengan fitur AI Assistant, dashboard, dan Products.
--   - Idempotent: seluruh bagian aman dijalankan berulang kali.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. PERMISSIONS — transaction_items
--    Kebutuhan RPC create_sale (SECURITY INVOKER = memakai hak pemanggil):
--    SELECT (baca saat replay/idempotency) + INSERT (tulis item penjualan).
--    Sengaja TANPA UPDATE/DELETE/ TRUNCATE/ REFERENCES/ TRIGGER — item
--    bersifat immutable (riwayat). GRANT products (00004) dan transactions
--    TIDAK diulang di sini.
-- ---------------------------------------------------------------------
grant select, insert
  on table public.transaction_items
  to authenticated;

-- ---------------------------------------------------------------------
-- 2. SOURCE POS — perluas CHECK transactions.source
--    Nilai lama (manual, ai_chat, receipt_scan) TETAP diterima; hanya
--    menambah 'pos'. Constraint dibuat ulang dengan nama eksplisit agar
--    deterministik. Idempotent: constraint check lama pada kolom source
--    (termasuk yang dibuat ulang sebelumnya) dibuang dulu, lalu ditambahkan
--    definisi kanonik — aman dijalankan berulang.
-- ---------------------------------------------------------------------
alter table public.transactions
  drop constraint if exists transactions_source_check;

alter table public.transactions
  add constraint transactions_source_check
  check (source in ('manual', 'ai_chat', 'receipt_scan', 'pos'));

-- ---------------------------------------------------------------------
-- 3. CHECK STOK NONNEGATIF — products.stock
--    stock NULL tetap = "tidak dilacak" (boleh NULL, TIDAK dipaksa 0).
--    Pola: NOT VALID (berlaku untuk tulis baru) lalu VALIDATE setelah
--    dipastikan data bersih (audit: 0 baris stok negatif).
--    Tidak ada perubahan data stok yang sudah ada.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_stock_non_negative'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_stock_non_negative
      check (stock is null or stock >= 0) not valid;
  end if;
end;
$$;

alter table public.products
  validate constraint products_stock_non_negative;

-- ---------------------------------------------------------------------
-- 4. IDEMPOTENCY — transactions.request_id
--    - Kolom uuid NULLABLE: transaksi lama (AI/manual) tetap sah.
--    - Unique partial index pada (business_id, request_id) hanya untuk
--      request_id yang tidak NULL → satu request_id per bisnis = maksimal
--      satu transaksi, tanpa memengaruhi baris lama.
--    - Perlindungan terhadap double-submit/retry yang bersamaan (bukan
--      sekadar mengandalkan tombol disabled di UI).
-- ---------------------------------------------------------------------
alter table public.transactions
  add column if not exists request_id uuid;

create unique index if not exists transactions_business_request_uidx
  on public.transactions (business_id, request_id)
  where request_id is not null;

-- ---------------------------------------------------------------------
-- 5. RPC create_sale — checkout POS atomik (satu transaksi PostgreSQL)
--
-- PERILAKU:
--   - Satu pemanggilan = satu baris transactions + semua baris
--     transaction_items + pengurangan stok — SEMUA ATAU TIDAK SAMA SEKALI
--     (bila satu langkah gagal, tidak ada yang tertinggal).
--   - Idempotency: request_id yang sama (bisnis yang sama) → mengembalikan
--     transaksi SEBELUMNYA (idempotent_replay = true) tanpa membuat item
--     baru dan tanpa mengurangi stok. Payload berbeda dengan request_id
--     yang sama (termasuk payment_method/notes) → DITOLAK dengan error
--     yang jelas. Bila produk pada transaksi lama sudah dihapus (product_id
--     snapshot NULL) sehingga payload tak bisa diverifikasi → replay juga
--     DITOLAK dengan error yang jelas (tetap tanpa transaksi/item/stok baru).
--   - Stok NULL = tidak dilacak (tidak dikurangi). Stok non-NULL wajib
--     mencukupi; pengurangan atomik dengan row lock berurutan (mengurangi
--     risiko deadlock); tidak pernah menghasilkan stok negatif.
--   - Harga & nama produk diambil DARI DATABASE saat checkout (tidak
--     mempercayai harga/nama/subtotal/total dari klien).
--
-- PARAMETER:
--   p_request_id   uuid  — wajib; kunci idempotency dari klien.
--   p_payment_method text — 'cash' | 'transfer' | 'qris' | 'ewallet'.
--   p_items        jsonb — array [{product_id, quantity}] (1..100 elemen).
--                  Field lain pada item (harga, nama, dst.) DIABAIKAN.
--                  Duplikat product_id diagregasikan secara deterministik.
--   p_notes        text  — opsional, maksimal 500 karakter.
--
-- RETURN (jsonb):
--   transaction_id    uuid   — id transaksi (baru maupun replay)
--   total             numeric — total transaksi (server-side)
--   item_count        integer — jumlah baris item (setelah agregasi)
--   total_quantity    numeric — jumlah seluruh unit
--   idempotent_replay boolean — true bila ini replay request_id lama
--
-- KEAMANAN:
--   - SECURITY INVOKER eksplisit: RLS tetap berlaku penuh (lapisan ganda).
--   - SET search_path = '' : seluruh referensi objek berkualifikasi schema.
--   - business_id HANYA dari businesses.owner_id = auth.uid() — tidak pernah
--     dari klien; kepemilikan diverifikasi ulang via is_business_owner().
--   - EXECUTE hanya untuk authenticated (di bawah).
-- ---------------------------------------------------------------------
create or replace function public.create_sale(
  p_request_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id       uuid := auth.uid();
  v_business_id    uuid;
  v_payload_count  integer;
  v_agg_count      integer := 0;
  v_agg            jsonb := '{}'::jsonb;
  v_agg_qty        numeric := 0;
  v_raw            jsonb;
  v_pid_text       text;
  v_pid            uuid;
  v_qty            numeric;
  v_key            text;
  v_i              integer;
  v_name           text;
  v_price          numeric(14, 2);
  v_stock          numeric(14, 2);
  v_names          text[] := '{}';
  v_active         boolean;
  v_subtotal       numeric;
  v_total          numeric(14, 2) := 0;
  v_total_quantity numeric(12, 2) := 0;
  v_summary_price  numeric(14, 2) := 0;
  v_title          text;
  v_transaction_id uuid;
  v_prev_total     numeric(14, 2);
  v_prev_count     integer;
  v_prev_qty       numeric;
  v_prev_payment   text;
  v_prev_notes     text;
begin
  -- ===================== VALIDASI PARAMETER =====================
  if p_request_id is null then
    raise exception 'request_id wajib diisi.';
  end if;

  if p_payment_method is null
     or p_payment_method not in ('cash', 'transfer', 'qris', 'ewallet') then
    raise exception 'Metode pembayaran tidak valid.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Daftar item harus berupa array.';
  end if;

  v_payload_count := jsonb_array_length(p_items);
  if v_payload_count < 1 then
    raise exception 'Keranjang belanja kosong.';
  end if;
  if v_payload_count > 100 then
    raise exception 'Maksimal 100 item dalam satu transaksi.';
  end if;

  if p_notes is not null and char_length(p_notes) > 500 then
    raise exception 'Catatan maksimal 500 karakter.';
  end if;

  if v_owner_id is null then
    raise exception 'Sesi tidak valid. Silakan login ulang.';
  end if;

  -- ============ BISNIS PEMANGGIL — dari auth, BUKAN dari klien ============
  select b.id
    into v_business_id
  from public.businesses b
  where b.owner_id = v_owner_id;

  if v_business_id is null then
    raise exception 'Profil bisnis belum ada.';
  end if;

  if not public.is_business_owner(v_business_id) then
    raise exception 'Anda tidak memiliki akses ke bisnis ini.';
  end if;

  -- ======= AGREGASI ITEM (deterministik) + VALIDASI RINGAN =======
  -- Setiap item hanya membutuhkan product_id + quantity. Duplikat
  -- product_id digabung (deterministik) sebelum pemeriksaan stok.
  -- Harga/nama/subtotal/total dari klien DIABAIKAN.
  for v_i in 0 .. v_payload_count - 1 loop
    v_raw := p_items -> v_i;
    if jsonb_typeof(v_raw) <> 'object' then
      raise exception 'Format item tidak valid.';
    end if;

    v_pid_text := v_raw ->> 'product_id';
    if v_pid_text is null or v_pid_text = '' then
      raise exception 'product_id wajib diisi pada setiap item.';
    end if;
    begin
      v_pid := v_pid_text::uuid;
    exception
      when invalid_text_representation then
        raise exception 'product_id tidak valid.';
    end;

    if v_raw ->> 'quantity' is null or v_raw ->> 'quantity' = '' then
      raise exception 'quantity wajib diisi pada setiap item.';
    end if;
    begin
      v_qty := (v_raw ->> 'quantity')::numeric;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'quantity harus berupa angka.';
    end;

    -- Tahan terhadap NaN/Infinity (numeric di PG dapat bernilai demikian)
    if v_qty = 'NaN'::numeric then
      raise exception 'quantity tidak valid.';
    end if;
    if v_qty > 9999999999.99 then
      raise exception 'quantity melebihi batas.';
    end if;
    v_qty := round(v_qty, 2);
    -- Validasi SETELAH pembulatan: quantity sangat kecil (mis. 0.004)
    -- dibulatkan menjadi 0.00 — harus ditolak dengan pesan yang jelas.
    if not (v_qty > 0) then
      raise exception 'quantity harus lebih besar dari 0.';
    end if;

    v_agg := v_agg || jsonb_build_object(
      v_pid::text,
      coalesce((v_agg ->> v_pid::text)::numeric, 0) + v_qty
    );
    v_agg_qty := v_agg_qty + v_qty;
  end loop;

  select count(*)
    into v_agg_count
  from jsonb_object_keys(v_agg) as t (k);

  -- ================== FAST-PATH IDEMPOTENCY ==================
  -- request_id yang sama (bisnis yang sama) yang SUDAH tuntas →
  -- kembalikan transaksi sebelumnya tanpa menyentuh stok/item.
  select t.id, t.total, t.payment_method, t.notes
    into v_transaction_id, v_prev_total, v_prev_payment, v_prev_notes
  from public.transactions t
  where t.business_id = v_business_id
    and t.request_id = p_request_id;

  if v_transaction_id is not null then
    select count(*), coalesce(sum(i.quantity), 0)
      into v_prev_count, v_prev_qty
    from public.transaction_items i
    where i.transaction_id = v_transaction_id;

    -- Validasi payload terhadap transaksi sebelumnya: request_id yang sama
    -- dengan payload BERBEDA bukan transaksi baru — tolak dengan jelas.
    -- Aturan kecocokan payload (diterapkan SAMA di kedua jalur replay):
    --   a. TIDAK boleh ada item ber-product_id NULL — produk yang dihapus
    --      setelah penjualan membuat snapshot product_id menjadi NULL
    --      (ON DELETE SET NULL) sehingga identitas item TIDAK BISA
    --      diverifikasi lagi → replay DITOLAK dengan error yang jelas;
    --      tidak membuat transaksi baru, tidak menambah item, tidak
    --      mengurangi stok.
    --   b. jumlah baris item sama;
    --   c. total kuantitas sama;
    --   d. setiap pasangan (product_id, quantity) cocok persis dengan payload.
    --   e. payment_method sama;
    --   f. notes sama (IS DISTINCT FROM agar aman terhadap NULL).
    if exists (
          select 1
          from public.transaction_items i
          where i.transaction_id = v_transaction_id
            and i.product_id is null
        )
    then
      raise exception 'Replay tidak dapat diverifikasi: produk pada transaksi sebelumnya sudah tidak ada.';
    end if;

    if v_prev_count <> v_agg_count
       or v_prev_qty <> v_agg_qty
       or v_prev_payment is distinct from p_payment_method
       or v_prev_notes is distinct from p_notes
       or exists (
            select 1
            from public.transaction_items i
            where i.transaction_id = v_transaction_id
              and (
                (v_agg ->> i.product_id::text) is null
                or (v_agg ->> i.product_id::text)::numeric <> i.quantity
              )
          )
    then
      raise exception 'request_id sudah pernah digunakan dengan data yang berbeda.';
    end if;

    return jsonb_build_object(
      'transaction_id', v_transaction_id,
      'total', v_prev_total,
      'item_count', v_prev_count,
      'total_quantity', v_prev_qty,
      'idempotent_replay', true
    );
  end if;

  -- ==== BACA + KUNCI PRODUK (urutan product_id — anti deadlock) ====
  -- Harga & nama diambil dari database. Produk harus aktif & milik bisnis.
  for v_key in
    select k from jsonb_object_keys(v_agg) as t (k) order by k
  loop
    v_pid := v_key::uuid;
    v_qty := (v_agg ->> v_key)::numeric;

    select p.name, p.selling_price, p.is_active
      into v_name, v_price, v_active
    from public.products p
    where p.id = v_pid
      and p.business_id = v_business_id
    for update;

    if not found then
      raise exception 'Produk tidak ditemukan atau bukan milik bisnis Anda.';
    end if;

    if v_active is distinct from true then
      raise exception 'Produk yang tidak aktif tidak dapat dijual.';
    end if;

    v_names := v_names || v_name;
    v_subtotal := round(v_qty * v_price, 2);
    if v_subtotal > 999999999999.99 then
      raise exception 'Nilai item melebihi batas.';
    end if;

    v_total := v_total + v_subtotal;
    if v_total > 999999999999.99 then
      raise exception 'Total transaksi melebihi batas.';
    end if;

    v_total_quantity := v_total_quantity + v_qty;
    if v_total_quantity > 9999999999.99 then
      raise exception 'Jumlah unit melebihi batas.';
    end if;

    if v_agg_count = 1 then
      -- Ringkasan satu item: unit_price = harga produk (konsisten dengan
      -- transaksi AI/manual lama). Multi-item: unit_price = 0 (lihat bawah).
      v_summary_price := v_price;
    end if;
  end loop;

  if v_agg_count = 1 then
    v_title := left(v_names[1], 160);
  else
    v_title := left('Penjualan Kasir: ' || array_to_string(v_names, ', '), 160);
  end if;

  -- ================= TRANSAKSI UTAMA (atomik) =================
  -- Reservasi baris transaksi lebih dulu dengan ON CONFLICT DO NOTHING:
  -- request_id kembar yang bersamaan akan saling menunggu di index unik;
  -- yang kalah TIDAK membuat transaksi/item baru dan TIDAK menyentuh stok.
  insert into public.transactions (
    business_id, type, title, quantity, unit_price, total,
    transacted_at, payment_method, source, notes, request_id
  ) values (
    v_business_id, 'income', v_title, v_total_quantity,
    case when v_agg_count = 1 then v_summary_price else 0 end,
    v_total, now(), p_payment_method, 'pos', p_notes, p_request_id
  )
  on conflict (business_id, request_id) where request_id is not null
  do nothing
  returning id into v_transaction_id;

  if v_transaction_id is null then
    -- Kalah balapan dengan permintaan paralel yang sama → replay.
    select t.id, t.total, t.payment_method, t.notes
      into v_transaction_id, v_prev_total, v_prev_payment, v_prev_notes
    from public.transactions t
    where t.business_id = v_business_id
      and t.request_id = p_request_id;

    if v_transaction_id is null then
      raise exception 'Gagal memproses permintaan. Silakan coba lagi.';
    end if;

    select count(*), coalesce(sum(i.quantity), 0)
      into v_prev_count, v_prev_qty
    from public.transaction_items i
    where i.transaction_id = v_transaction_id;

    -- Aturan kecocokan payload (diterapkan SAMA di kedua jalur replay):
    --   a. TIDAK boleh ada item ber-product_id NULL — produk yang dihapus
    --      setelah penjualan membuat snapshot product_id menjadi NULL
    --      (ON DELETE SET NULL) sehingga identitas item TIDAK BISA
    --      diverifikasi lagi → replay DITOLAK dengan error yang jelas;
    --      tidak membuat transaksi baru, tidak menambah item, tidak
    --      mengurangi stok.
    --   b. jumlah baris item sama;
    --   c. total kuantitas sama;
    --   d. setiap pasangan (product_id, quantity) cocok persis dengan payload.
    --   e. payment_method sama;
    --   f. notes sama (IS DISTINCT FROM agar aman terhadap NULL).
    if exists (
          select 1
          from public.transaction_items i
          where i.transaction_id = v_transaction_id
            and i.product_id is null
        )
    then
      raise exception 'Replay tidak dapat diverifikasi: produk pada transaksi sebelumnya sudah tidak ada.';
    end if;

    if v_prev_count <> v_agg_count
       or v_prev_qty <> v_agg_qty
       or v_prev_payment is distinct from p_payment_method
       or v_prev_notes is distinct from p_notes
       or exists (
            select 1
            from public.transaction_items i
            where i.transaction_id = v_transaction_id
              and (
                (v_agg ->> i.product_id::text) is null
                or (v_agg ->> i.product_id::text)::numeric <> i.quantity
              )
          )
    then
      raise exception 'request_id sudah pernah digunakan dengan data yang berbeda.';
    end if;

    return jsonb_build_object(
      'transaction_id', v_transaction_id,
      'total', v_prev_total,
      'item_count', v_prev_count,
      'total_quantity', v_prev_qty,
      'idempotent_replay', true
    );
  end if;

  -- ======= STOK + ITEM (hanya untuk transaksi BARU; atomik) =======
  -- Urutan penguncian sama dengan blok sebelumnya (product_id naik) →
  -- aman terhadap checkout bersamaan (tanpa deadlock). Stok NULL = tidak
  -- dilacak (tidak dikurangi); stok non-NULL wajib mencukupi — bila tidak,
  -- SELURUH transaksi ini rollback (tidak ada transaksi/item/stok yang
  -- tertinggal). Stok tidak pernah menjadi negatif.
  for v_key in
    select k from jsonb_object_keys(v_agg) as t (k) order by k
  loop
    v_pid := v_key::uuid;
    v_qty := (v_agg ->> v_key)::numeric;

    select p.name, p.selling_price, p.stock
      into v_name, v_price, v_stock
    from public.products p
    where p.id = v_pid;

    if not found then
      raise exception 'Produk tidak ditemukan.';
    end if;

    if v_stock is not null then
      if v_stock < v_qty then
        raise exception 'Stok % tidak mencukupi (tersisa %).', v_name, v_stock;
      end if;
      update public.products
        set stock = stock - v_qty
      where id = v_pid;
    end if;

    insert into public.transaction_items (
      transaction_id, business_id, product_id,
      product_name, quantity, unit_price, total
    ) values (
      v_transaction_id, v_business_id, v_pid,
      v_name, v_qty, v_price, round(v_qty * v_price, 2)
    );
  end loop;

  return jsonb_build_object(
    'transaction_id', v_transaction_id,
    'total', v_total,
    'item_count', v_agg_count,
    'total_quantity', v_total_quantity,
    'idempotent_replay', false
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5b. Hak eksekusi RPC — hanya authenticated
--     (REVOKE dari PUBLIC & anon; tidak menyentuh service_role).
-- ---------------------------------------------------------------------
revoke all on function public.create_sale(uuid, text, jsonb, text)
  from public, anon;

grant execute on function public.create_sale(uuid, text, jsonb, text)
  to authenticated;

commit;
