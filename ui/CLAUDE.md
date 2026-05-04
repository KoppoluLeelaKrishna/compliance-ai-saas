# UI — Claude Code Guide

## Stack
Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · App Router

## Running
```bash
npm install && npm run dev    # http://localhost:3000
npm run build                 # production build
```

## Design System
- **Background**: `bg-black` with `text-white`
- **Accent**: emerald (`bg-emerald-500`, `text-emerald-400`, `border-emerald-500/30`)
- **Cards**: `rounded-3xl border border-white/10 bg-white/5 p-6`
- **Buttons primary**: `bg-emerald-500 text-black hover:bg-emerald-400 rounded-2xl`
- **Buttons ghost**: `border border-white/10 hover:bg-white/5 rounded-xl`
- **Inputs**: `border border-white/10 bg-black/60 rounded-2xl focus:border-emerald-500/50`

## Key Files
```
src/lib/api.ts          shared fetch wrapper — api<T>(path, init?)
src/types/index.ts      all TypeScript types (Account, ScanItem, Finding, etc.)
src/components/
  AppTopNav.tsx         top navigation — shows Sign In/Sign Up or user + logout
  ui/Card.tsx           Card and Badge components
  scans/
    FindingsTable.tsx   scan findings list
    FindingDetail.tsx   finding detail panel
    ScanFilters.tsx     severity/service/status filters
```

## API calls
```typescript
import { api } from "@/lib/api";
const data = await api<MyType>("/endpoint");
const result = await api<MyType>("/endpoint", { method: "POST", body: JSON.stringify(payload) });
```

## Adding a new page
1. Create `src/app/newpage/page.tsx`
2. Mark `"use client"` if it needs state/effects
3. Add link in `AppTopNav.tsx` if needed

## AI Analysis Integration
Call `POST /scans/{scan_id}/ai-analysis` → returns `{ analysis: string, findings_count: number }`.
Display the `analysis` text in a dedicated panel in the scans page.

## Common Patterns
- Auth check: `const auth = await api<AuthMe>("/auth/me")` — redirect to `/signin` if `!auth.authenticated`
- Loading states: `animate-pulse rounded-xl bg-white/5 h-10 w-24`
- Error display: `border border-red-800/60 bg-red-950/40 text-red-300 rounded-2xl px-4 py-3`
- Success display: `border border-emerald-700 bg-emerald-950/40 text-emerald-200 rounded-2xl px-4 py-3`

## Routes
`/` · `/signin` · `/signup` · `/accounts` · `/scans` · `/plans` · `/settings` · `/launch` · `/onboarding`
