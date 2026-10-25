-- ========================================================
-- Auth & Password Reset Schema for Slab Opname
-- ========================================================

-- 1. App Users Table
CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user', -- 'admin' or 'user'
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_users_username ON public.app_users(LOWER(username));

-- 2. Password Reset Requests Table
CREATE TABLE IF NOT EXISTS public.password_reset_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username TEXT NOT NULL,
    full_name TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'resolved', 'cancelled'
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_reset_requests_status ON public.password_reset_requests(status);
