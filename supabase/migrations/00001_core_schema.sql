-- =====================================================================
-- BIZMATE — MIGRATION 0001: Core Schema + Row Level Security
-- =====================================================================
-- Cara menjalankan: Supabase Dashboard → SQL Editor → paste → Run.
-- Aman dijalankan ulang: bagian policy/schema dipisah per-statemen,
-- tapi idealnya dijalankan pada database yang masih kosong.
--
-- Prinsip keamanan:
-- - Setiap pengguna HANYA bisa mengakses business miliknya sendiri.
-- - hak akses selalu dicek di DATABASE (RLS), bukan di browser.
-- - is_business_owner() = SECURITY DEFINER agar pengecekan tidak rekursif.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Utilitas
-- ---------------------------------------------------------------------

-- Kolom updated_at otomatis terisi
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. PROFILES — data akun pengguna (1 baris per auth.users id)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. BUSINESSES — profil bisnis tiap pengguna
--    MVP: 1 pengguna = 1 bisnis (unique index owner_id)
-- ---------------------------------------------------------------------
create table if not exists public.businesses (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 120),
  category     text not null check (char_length(btrim(category)) between 1 and 80),
  description  text,
  product_type text,
  phone        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- MVP: satu bisnis per pemilik
create unique index if not exists businesses_owner_id_key on public.businesses (owner_id);

drop trigger if exists businesses_set_updated_at on public.businesses;
create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. PRODUCTS — katalog produk/jasa
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 160),
  category      text,
  selling_price numeric(14, 2) not null default 0 check (selling_price >= 0),
  unit_cost     numeric(14, 2) check (unit_cost is null or unit_cost >= 0),
  stock         numeric(14, 2),
  unit          text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists products_business_id_idx on public.products (business_id);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. TRANSACTIONS — pemasukan & pengeluaran
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  type           text not null check (type in ('income', 'expense')),
  title          text not null check (char_length(btrim(title)) between 1 and 160),
  quantity       numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price     numeric(14, 2) not null default 0 check (unit_price >= 0),
  total          numeric(14, 2) not null check (total >= 0),
  transacted_at  timestamptz not null default now(),
  payment_method text not null default 'cash'
                 check (payment_method in ('cash', 'transfer', 'qris', 'ewallet')),
  source         text not null default 'manual'
                 check (source in ('manual', 'ai_chat', 'receipt_scan')),
  notes          text,
  status         text not null default 'completed' check (status in ('completed', 'draft', 'void')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists transactions_business_time_idx
  on public.transactions (business_id, transacted_at desc);

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 5. TRANSACTION_ITEMS — rincian multi-item (dipakai by receipt scan di Tahap 5)
-- ---------------------------------------------------------------------
create table if not exists public.transaction_items (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  business_id    uuid not null references public.businesses (id) on delete cascade,
  product_id     uuid references public.products (id) on delete set null,
  product_name   text not null,
  quantity       numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price     numeric(14, 2) not null default 0 check (unit_price >= 0),
  total          numeric(14, 2) not null check (total >= 0),
  created_at     timestamptz not null default now()
);

create index if not exists transaction_items_transaction_idx on public.transaction_items (transaction_id);

-- ---------------------------------------------------------------------
-- 6. AI_CONVERSATIONS — riwayat percakapan dengan AI Assistant
-- ---------------------------------------------------------------------
create table if not exists public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ai_conversations_business_idx on public.ai_conversations (business_id);

drop trigger if exists ai_conversations_set_updated_at on public.ai_conversations;
create trigger ai_conversations_set_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 7. AI_MESSAGES — isi percakapan (teks + hasil parse AI bila ada)
-- ---------------------------------------------------------------------
create table if not exists public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  structured_data jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------
-- 8. Helper hak akses (SECURITY DEFINER — RLS-nya dilewati pada query
--    di dalam fungsi, dan fungsi ini TIDAK pernah membocorkan data:
--    hasilnya hanyalah true/false untuk bisnis milik auth.uid())
-- ---------------------------------------------------------------------
create or replace function public.is_business_owner(business uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = business and b.owner_id = auth.uid()
  );
$$;

create or replace function public.is_conversation_owner(conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ai_conversations c
    where c.id = conversation
      and public.is_business_owner(c.business_id)
  );
$$;

-- ---------------------------------------------------------------------
-- 9. Trigger: buat profiles otomatis saat pengguna mendaftar
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY — aktifkan pada semua tabel
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.businesses        enable row level security;
alter table public.products          enable row level security;
alter table public.transactions      enable row level security;
alter table public.transaction_items enable row level security;
alter table public.ai_conversations  enable row level security;
alter table public.ai_messages       enable row level security;

-- profiles: pengguna hanya melihat & mengedit profilnya sendiri
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- businesses: seluruh CRUD hanya untuk pemiliknya
drop policy if exists "businesses_select_own" on public.businesses;
create policy "businesses_select_own" on public.businesses
  for select using (auth.uid() = owner_id);

drop policy if exists "businesses_insert_own" on public.businesses;
create policy "businesses_insert_own" on public.businesses
  for insert with check (auth.uid() = owner_id);

drop policy if exists "businesses_update_own" on public.businesses;
create policy "businesses_update_own" on public.businesses
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "businesses_delete_own" on public.businesses;
create policy "businesses_delete_own" on public.businesses
  for delete using (auth.uid() = owner_id);

-- products: pemilik business-nya
drop policy if exists "products_select_own" on public.products;
create policy "products_select_own" on public.products
  for select using (public.is_business_owner(business_id));

drop policy if exists "products_insert_own" on public.products;
create policy "products_insert_own" on public.products
  for insert with check (public.is_business_owner(business_id));

drop policy if exists "products_update_own" on public.products;
create policy "products_update_own" on public.products
  for update using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

drop policy if exists "products_delete_own" on public.products;
create policy "products_delete_own" on public.products
  for delete using (public.is_business_owner(business_id));

-- transactions: pemilik business-nya
drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select using (public.is_business_owner(business_id));

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert with check (public.is_business_owner(business_id));

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
  for delete using (public.is_business_owner(business_id));

-- transaction_items: pemilik business-nya
drop policy if exists "transaction_items_select_own" on public.transaction_items;
create policy "transaction_items_select_own" on public.transaction_items
  for select using (public.is_business_owner(business_id));

drop policy if exists "transaction_items_insert_own" on public.transaction_items;
create policy "transaction_items_insert_own" on public.transaction_items
  for insert with check (public.is_business_owner(business_id));

drop policy if exists "transaction_items_delete_own" on public.transaction_items;
create policy "transaction_items_delete_own" on public.transaction_items
  for delete using (public.is_business_owner(business_id));

-- ai_conversations: pemilik business-nya
drop policy if exists "ai_conversations_select_own" on public.ai_conversations;
create policy "ai_conversations_select_own" on public.ai_conversations
  for select using (public.is_business_owner(business_id));

drop policy if exists "ai_conversations_insert_own" on public.ai_conversations;
create policy "ai_conversations_insert_own" on public.ai_conversations
  for insert with check (public.is_business_owner(business_id));

drop policy if exists "ai_conversations_delete_own" on public.ai_conversations;
create policy "ai_conversations_delete_own" on public.ai_conversations
  for delete using (public.is_business_owner(business_id));

-- ai_messages: lewat kepemilikan percakapannya
drop policy if exists "ai_messages_select_own" on public.ai_messages;
create policy "ai_messages_select_own" on public.ai_messages
  for select using (public.is_conversation_owner(conversation_id));

drop policy if exists "ai_messages_insert_own" on public.ai_messages;
create policy "ai_messages_insert_own" on public.ai_messages
  for insert with check (public.is_conversation_owner(conversation_id));
