# AGENTS.md - Slab Opname PPIC

> **IMPORTANT**: This file contains all memories, workflows, and procedures for working on this project. Read this first when starting a new session.

---

## 📋 Project Overview

**Slab Opname PPIC** - A React/Vite application for slab stock reconciliation with Supabase backend. Real-time monitoring of inventory opname (stock-taking) process.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GRP SLAB OPNAME SYSTEM                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐          ┌──────────────────────────────────────────────┐ │
│  │   FRONTEND   │          │                  BACKEND                     │ │
│  │   (React)    │          │              (Supabase)                      │ │
│  │              │          │                                              │ │
│  │  • Dashboard │◄────────►│  ┌────────────┐    ┌──────────────────┐     │ │
│  │  • Opname    │   REST   │  │ PostgreSQL │    │ Realtime Engine  │     │ │
│  │  • Locations │   API    │  │            │◄──►│                  │     │ │
│  │  • Admin     │          │  │ • opname   │    │ • subscriptions  │     │ │
│  │              │◄─────────┼─►│ • stock    │    │ • broadcasts     │     │ │
│  │  Realtime ◄──┼──────────┼──►│ • users    │    │ • presence       │     │ │
│  │  Updates     │          │  │ • config   │    └──────────────────┘     │ │
│  │              │          │  └────────────┘                              │ │
│  └──────────────┘          └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Standard Workflow

### 1. Before Starting Any Work

1. **Read this AGENTS.md** - Always check for recent updates
2. **Check GitHub for changes** - Pull latest or check remote
3. **Check command/log.txt** - Review recent AI revisions and decisions

### 2. During Development

1. **Run build first** - Always verify with `npm run build` before claiming completion
2. **Use TypeScript** - This is a TypeScript project
3. **Follow code conventions** - See Code Style section below
4. **Document SQL changes** - Always create .sql files (see below)

### 3. After Completing Work

1. **Run npm run build** - Verify no TypeScript errors
2. **Update command/log.txt** - Log what was done with timestamp
3. **Push to GitHub** - If requested by user

---

## 📝 SQL Change Procedure

> **CRITICAL**: Any database schema changes MUST be documented in SQL files.

### Creating SQL Files

When making database changes (tables, columns, RLS policies, indexes):

1. **Create file in `/command/` directory**
2. **Naming format**: `XX.D.DESCRIPTION.sql` where:
   - `XX` = sequential number (01, 02, 03...)
   - `D` = type: `D` = Database schema change
3. **Include in file**:
   - Timestamp comment
   - Description of change
   - SQL commands
   - Rollback instructions (optional)

### Example SQL File

```sql
-- ==============================================================================
-- Migration: Add lock columns to opname_records
-- Created: 2026-03-27
-- Description: Adds locked_at and locked_by columns for admin lock feature
-- ==============================================================================

-- Add columns
ALTER TABLE public.opname_records 
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS locked_by TEXT;

-- Enable Realtime for new columns
ALTER PUBLICATION supabase_realtime ADD TABLE public.opname_records;
```

### Always Update log.txt

After creating SQL file, append to `command/log.txt`:
```
[YYYY-MM-DD HH:MM] - CREATED: command/XX.D.DESCRIPTION.sql - Description of change
```

---

## 📜 Command History Log

**Location**: `/command/log.txt`

**Purpose**: Track all AI-made revisions and database changes

**Format**:
```
================================================================================
SESSION: YYYY-MM-DD HH:MM - HH:MM
================================================================================
[TIMESTAMP] - ACTION: Description of what was done
[TIMESTAMP] - CREATED: filepath - Description
[TIMESTAMP] - UPDATED: filepath - What changed
[TIMESTAMP] - PUSHED: description - What was pushed to GitHub
[TIMESTAMP] - DEPLOYED: description - What was deployed

================================================================================
SESSION NOTES:
- Key decisions made
- Pending items
- User requests
================================================================================
```

---

## 🗂️ File Organization

```
├── components/          # React UI components
│   ├── Dashboard.tsx
│   ├── OpnameSlab.tsx
│   ├── OpnameList.tsx
│   ├── Database.tsx
│   ├── DatabaseSetup.tsx
│   ├── Setting.tsx
│   ├── BackupList.tsx
│   ├── BackupModal.tsx
│   ├── LockBanner.tsx
│   └── Navigation.tsx
├── services/           # Data service functions
│   └── dataService.ts
├── migrations/         # SQL migration scripts (future)
├── command/            # SQL Editor commands & logs
│   ├── log.txt        # AI revision history
│   └── *.sql          # Database change scripts
├── docs/              # Design specs
├── types.ts           # TypeScript interfaces
├── supabaseClient.ts  # Supabase client config
└── App.tsx            # Main app component
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 18 + TypeScript | UI Components |
| **Build Tool** | Vite 6 | Fast bundling & HMR |
| **Styling** | Tailwind CSS 3 | Utility-first CSS |
| **Backend** | Supabase | PostgreSQL + Auth + Storage |
| **Realtime** | Supabase Realtime | WebSocket subscriptions |
| **Icons** | Lucide React | Icon library |
| **Charts** | Recharts | Dashboard visualizations |

---

## 🚀 Build & Development Commands

```bash
# Development server
npm run dev

# Production build (ALWAYS run after changes to verify)
npm run build

# Preview production build
npm run preview
```

**No test framework configured.** Verify changes by running `npm run build` and checking for TypeScript errors.

---

## 📊 Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `opname_records` | Main opname entries with findings |
| `sap_stock` | SAP system stock data |
| `mother_slab_stock` | Mother slab inventory |
| `cut_slab_stock` | Cut slab inventory |
| `opname_backups` | JSON database snapshots |
| `system_settings` | Lock state, notifications (id=1) |
| `users_online` | Active user sessions with heartbeat |
| `locations` | Warehouse/location configuration |

### Existing SQL Files

| File | Description |
|------|-------------|
| `01.D.Add_Lock_Columns.sql` | Added locked_at, locked_by columns |
| `02.D.Update_Lock_RLS_Policies.sql` | RLS policies for lock columns |

---

## 👥 User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access: CRUD, import/export, backup/restore, user management |
| **User** | View records, submit opname findings, upload evidence |

**Note**: Simple username-based auth. Username "admin" with password "admin" for admin access.

---

## 🎨 Code Style Guidelines

### Imports Order
```typescript
// Order: React → External → Local
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { UserRole, Location } from '../types';
import { getLockStatus, setLockMode } from '../services/dataService';
```

### Components
```typescript
interface Props {
  role: UserRole;
  isLocked?: boolean;
}

const MyComponent: React.FC<Props> = ({ role, isLocked = false }) => {
  // ...
};

export default MyComponent;
```

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `LockBanner`, `BackupModal` |
| Functions | camelCase | `fetchLockStatus`, `handleToggleLock` |
| Types | PascalCase | `LockStatus`, `OpnameRecord` |
| Constants | UPPER_SNAKE_CASE | `BUCKET_NAME`, `CACHE_LIMIT` |

---

## 🔌 Important Patterns

### Lock Mode
- Check `isLocked` prop before data operations
- Disabled buttons: `disabled:opacity-50 disabled:cursor-not-allowed`
- Hide admin actions when locked

### Real-time Updates
```typescript
useEffect(() => {
  const channel = supabase
    .channel('opname-changes')
    .on('postgres_changes', { event: '*', table: 'opname_records' }, (payload) => {
      // Handle change
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);
```

### Backup Operations
- Chunk inserts: `CHUNK_SIZE = 1000`
- Force refresh after restore: `fetchAllOpnameRecords(true)`
- Sync CSV: `syncOpnameListToStorage()`

---

## 🔐 Security Notes

### Known Issues (from Enhancement Report)
1. **Hardcoded Admin Password** - Currently 'admin' in plaintext (App.tsx line ~201)
2. **Client-Side Role Management** - Roles stored in localStorage
3. **No Input Sanitization** - Needs Zod/Yup validation
4. **Permissive RLS Policies** - Need audit
5. **No CSRF Protection** - Needs implementation

### Future Enhancements Planned
- Supabase Auth integration
- Audit logging
- Server-side validation
- Proper authentication flow

---

## 📝 CSV Import Format

The CSV parser (in `components/Database.tsx`) expects fixed column order:
- Column 0 → `batch_id`
- Column 1 → `grade`
- Column 2 → `thickness`
- Column 3 → `width`
- Column 4 → `length`
- Column 5 → `slab_weight`

**Recommendation:** Provide downloadable CSV template to ensure correct format.

---

## 📜 Session Memories

### Session: 2026-03-27 (Initial Setup)

- **GitHub MCP Configured**: Using GitHub's official MCP server (`https://api.githubcopilot.com/mcp/`) with Bearer token authentication
- **Repository**: `daniswaramp/grp-slab-stock-reconciliation` (public)
- **GitHub PAT**: Available in user's opencode config (do not share)
- **Supabase**: Uses environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY in .env.local)
- **Project ID**: mqwpgqvyzrjfsitvrmgh

### Sessions: Enhancement & Documentation

- **Enhancement Report Created**: `/command/enhancement.txt` contains comprehensive code analysis with:
  - Critical security issues
  - Features to be added (priority ordered)
  - Code revisions required
  - Performance optimizations
  - UI/UX improvements
  - Database schema improvements

- **README.md Enhanced**: Added mermaid diagrams, detailed features, setup instructions

- **AGENTS.md Created**: This file for session continuity and workflow documentation

### Files Pushed to GitHub
- package.json, vite.config.ts, tsconfig.json
- tailwind.config.js, postcss.config.js
- index.html, index.tsx, index.css
- .gitignore, .env.example
- types.ts, supabaseClient.ts
- services/dataService.ts
- components/Navigation.tsx, LockBanner.tsx, Dashboard.tsx
- README.md (enhanced)

---

## 🔗 External Resources

- **GitHub Repo**: https://github.com/daniswaramp/grp-slab-stock-reconciliation
- **Supabase Dashboard**: https://supabase.com/dashboard
- **Project Supabase**: mqwpgqvyzrjfsitvrmgh

---

## ✅ Checklist for New Session

- [ ] Read AGENTS.md completely
- [ ] Check command/log.txt for recent activity
- [ ] Check GitHub for any remote changes
- [ ] Verify npm run build works
- [ ] Ask user what they want to work on

---

## 📝 Development Notes

- **No test framework** - verify via `npm run build`
- **localStorage keys** use format: `slab_*`
- **Real-time scale** - optimized for 4-5 concurrent users
- **Chunked operations** for large datasets (1000 records per chunk)

---

*Last Updated: 2026-03-28*
