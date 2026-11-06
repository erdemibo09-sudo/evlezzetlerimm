-- Ev Yemeklerim — Supabase (PostgreSQL) Veritabanı Tablo Şeması
-- Bu SQL kodunu Supabase sol menüdeki "SQL Editor" ekranına yapıştırıp "Run" butonuna basın.

CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  image_url TEXT NOT NULL,
  portion_info TEXT NOT NULL,
  allergens_json TEXT NOT NULL DEFAULT '[]',
  prep_time_minutes INTEGER NOT NULL,
  daily_stock INTEGER NOT NULL,
  price_kurus INTEGER NOT NULL,
  is_featured INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  customer_name_snapshot TEXT NOT NULL,
  customer_email_snapshot TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  customer_note TEXT NOT NULL DEFAULT '',
  total_amount_kurus INTEGER NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT,
  refund_reason TEXT,
  refunded_amount_kurus INTEGER DEFAULT 0,
  refunded_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT,
  product_name_snapshot TEXT NOT NULL,
  portion_info_snapshot TEXT NOT NULL,
  allergens_snapshot_json TEXT NOT NULL DEFAULT '[]',
  unit_price_kurus_snapshot INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  line_total_kurus_snapshot INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS public.refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  processed_by_user_id TEXT NOT NULL,
  amount_kurus INTEGER NOT NULL,
  reason TEXT NOT NULL,
  stock_restored INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.email_outbox (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  order_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_role TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  message_id TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  old_data_json TEXT,
  new_data_json TEXT,
  created_at TEXT NOT NULL
);

-- RLS ve Erişim İzinleri
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_outbox DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
