import React, { useState } from 'react';
import { Database, Copy, Check, RefreshCw, ExternalLink, Zap } from 'lucide-react';

interface Props {
  onRetry: () => void;
}

const DatabaseSetup: React.FC<Props> = ({ onRetry }) => {
  const [copied, setCopied] = useState(false);

  const sqlScript = `-- ========================================================
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

-- Indexes for high performance
CREATE INDEX IF NOT EXISTS idx_sap_stock_batch_id ON public.sap_stock(batch_id);
CREATE INDEX IF NOT EXISTS idx_mother_stock_batch_id ON public.mother_slab_stock(batch_id);
CREATE INDEX IF NOT EXISTS idx_cut_stock_batch_id ON public.cut_slab_stock(batch_id);
CREATE INDEX IF NOT EXISTS idx_opname_records_batch_id ON public.opname_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_opname_records_created_at ON public.opname_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_id ON public.system_events(id);`;

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-3xl w-full bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="bg-emerald-600 p-8 text-white">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-white bg-opacity-20 rounded-xl"><Database size={32} /></div>
            <div>
              <h1 className="text-2xl font-bold">Neon Database Setup Required</h1>
              <p className="text-emerald-100 opacity-90">PPIC Slab System Initialization (Neon PostgreSQL)</p>
            </div>
          </div>
        </div>
        <div className="p-8 space-y-6">
          <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex gap-3 text-emerald-900 text-sm">
            <Zap className="text-emerald-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-bold">Neon Serverless Setup:</p>
              <p>Run the SQL script below in your Neon SQL Editor console to initialize all tables, storage, and realtime event queues.</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800">1. Run SQL in Neon SQL Editor</h3>
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-all"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy SQL Script'}
              </button>
            </div>
            <pre className="bg-gray-900 text-gray-300 p-6 rounded-xl text-xs font-mono overflow-x-auto max-h-[250px] border border-gray-800">
              {sqlScript}
            </pre>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
            <div>
              <h3 className="font-bold text-gray-800 mb-1">2. Environment Variable</h3>
              <p className="text-xs text-gray-500">
                Ensure <code className="bg-gray-100 px-1.5 py-0.5 rounded text-emerald-600 font-bold">DATABASE_URL</code> is set in Vercel or your local <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">.env</code>.
              </p>
            </div>
            <div className="flex flex-col justify-end">
              <button
                onClick={onRetry}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <RefreshCw size={20} /> I've Finished Setup
              </button>
            </div>
          </div>
          <div className="text-center pt-2">
            <a
              href="https://console.neon.tech"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-emerald-600 hover:underline inline-flex items-center gap-1"
            >
              Open Neon Console <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DatabaseSetup;
