# Neon & Vercel Migration Guide

This branch (`neon-version`) migrates the **GRP Slab Opname System** from Supabase to **Neon Serverless PostgreSQL** hosted on **Vercel**.

---

## 🚀 Key Improvements & Architecture

| Feature | Previous (Supabase) | New (Neon + Vercel) |
| :--- | :--- | :--- |
| **Database** | Supabase PostgreSQL | **Neon Serverless PostgreSQL** |
| **Backend API** | Direct Browser PostgREST | **Vercel Serverless Functions (`/api/*`)** |
| **Evidence & CSV Storage** | Supabase Storage Bucket | **Neon Database Storage (`app_storage` table)** - zero external S3 / bucket required |
| **Realtime Multiuser** | Supabase Realtime Channels | **Event Queue Synchronization (`system_events` table + `/api/events`)** - reliable on serverless |
| **Frontend Compatibility** | `@supabase/supabase-js` | **`neonClient.ts`** provides full drop-in API parity |

---

## 🛠️ Step 1: Initialize Neon Database

1. Open your [Neon Console](https://console.neon.tech).
2. Go to the **SQL Editor**.
3. Open and run [`command/01.Neon_Schema_Setup.sql`](./command/01.Neon_Schema_Setup.sql).
   This creates:
   - Stock tables (`sap_stock`, `mother_slab_stock`, `cut_slab_stock`)
   - `opname_records` & `locations`
   - `system_settings` & `users_online`
   - `opname_backups`
   - `app_storage` (replaces Supabase storage buckets)
   - `system_events` (realtime event broker)
   - Performance indexes on `batch_id` and timestamps

---

## ⚙️ Step 2: Configure Environment Variables

In your local `.env` (or in Vercel Project Settings > Environment Variables):

```env
DATABASE_URL=postgresql://<user>:<password>@<ep-pooler-domain>.neon.tech/neondb?sslmode=require
```

---

## 🚢 Step 3: Deploy to Vercel

### Option A: Via Vercel CLI
From this project directory:
```bash
vercel
```
Set the environment variable `DATABASE_URL` when prompted, or in the dashboard.

### Option B: Via GitHub Integration
1. Push this branch (`neon-version`) to GitHub.
2. In [Vercel Dashboard](https://vercel.com/new), import the repository.
3. Add the `DATABASE_URL` environment variable.
4. Deploy!
