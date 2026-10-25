-- ========================================================
-- Neon PostgreSQL Schema for Slab Opname Reconciliation
-- ========================================================

-- 1. SAP Stock Table
CREATE TABLE IF NOT EXISTS public.sap_stock (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    batch_id TEXT NOT NULL,
    grade TEXT,
    thickness NUMERIC,
    width NUMERIC,
    length NUMERIC,
    slab_weight NUMERIC
);

-- 2. Mother Slab Stock Table
CREATE TABLE IF NOT EXISTS public.mother_slab_stock (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    batch_id TEXT NOT NULL,
    grade TEXT,
    thickness NUMERIC,
    width NUMERIC,
    length NUMERIC,
    slab_weight NUMERIC
);

-- 3. Cut Slab Stock Table
CREATE TABLE IF NOT EXISTS public.cut_slab_stock (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    batch_id TEXT NOT NULL,
    grade TEXT,
    thickness NUMERIC,
    width NUMERIC,
    length NUMERIC,
    slab_weight NUMERIC
);

-- 4. Opname Records Table
CREATE TABLE IF NOT EXISTS public.opname_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_name TEXT,
    batch_id TEXT,
    grade TEXT,
    location TEXT,
    status TEXT,
    dimension_match BOOLEAN,
    grade_match BOOLEAN,
    batch_match BOOLEAN,
    remarks TEXT,
    time TEXT,
    date TEXT,
    grade_sap TEXT,
    grade_mother TEXT,
    grade_cut TEXT,
    database_t NUMERIC,
    database_w NUMERIC,
    database_l NUMERIC,
    actual_thick NUMERIC,
    actual_width NUMERIC,
    actual_length NUMERIC,
    actual_grade TEXT,
    actual_batch_id TEXT,
    gang_baris TEXT,
    image_url TEXT
);

-- 5. Locations Table
CREATE TABLE IF NOT EXISTS public.locations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    name TEXT UNIQUE NOT NULL
);

-- 6. Users Online Table (Heartbeat / Multiuser)
CREATE TABLE IF NOT EXISTS public.users_online (
    name TEXT PRIMARY KEY,
    last_seen TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. System Settings Table
CREATE TABLE IF NOT EXISTS public.system_settings (
    id INT PRIMARY KEY DEFAULT 1,
    notification_text TEXT,
    lock_mode BOOLEAN DEFAULT FALSE,
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed row 1 for system_settings if not exists
INSERT INTO public.system_settings (id, notification_text, lock_mode)
VALUES (1, '', false)
ON CONFLICT (id) DO NOTHING;

-- 8. Opname Backups Table
CREATE TABLE IF NOT EXISTS public.opname_backups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    name TEXT,
    data JSONB
);

-- 9. App Storage Table (Stores Evidence Photos, Stock CSVs, and Opname_List.csv)
CREATE TABLE IF NOT EXISTS public.app_storage (
    path TEXT PRIMARY KEY,
    mime_type TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. System Events Table (For Realtime Multiuser Notifications & Broadcasts)
CREATE TABLE IF NOT EXISTS public.system_events (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sap_stock_batch_id ON public.sap_stock(batch_id);
CREATE INDEX IF NOT EXISTS idx_mother_stock_batch_id ON public.mother_slab_stock(batch_id);
CREATE INDEX IF NOT EXISTS idx_cut_stock_batch_id ON public.cut_slab_stock(batch_id);
CREATE INDEX IF NOT EXISTS idx_opname_records_batch_id ON public.opname_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_opname_records_created_at ON public.opname_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_id ON public.system_events(id);
