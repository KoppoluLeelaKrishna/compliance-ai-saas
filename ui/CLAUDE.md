# UI — Claude Code Guide

## Stack
Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · App Router

## Running
```bash
npm install && npm run dev    # http://localhost:3000
npm run build                 # production build
```

## Design System — "VigiliCloud Redesign"
Apple-derived: **Action Blue is the only accent**, 600 weight for display and 400 for body,
hairline borders instead of glow, and a single elevation reserved for overlays.
Dark is the default surface; `html[data-theme="light"]` swaps the same variables.
Users pick Dark / Light / System in **Settings → Appearance** (`components/settings/AppearanceCard.tsx`);
`src/lib/theme.ts` stores it in localStorage (`vc-theme`) and a boot script in `layout.tsx` applies it
before first paint. Bare routes (landing, sign-in, sign-up) never get `data-theme` and stay dark.
In app pages, colour text and surfaces with `--vc-*` variables — a raw `text-white` or `bg-white/…`
vanishes in light mode.

All tokens and component classes live at the bottom of `src/app/globals.css`.
**Style with `vc-*` classes, not raw Tailwind colours** — that is what keeps marketing
and product on one language. Reach for `text-[var(--vc-…)]` only for one-offs.

| Token | Dark | Purpose |
|---|---|---|
| `--vc-canvas` | `#000000` | page background |
| `--vc-raised` | `#1c1c1e` | cards and panels |
| `--vc-side` | `#0a0a0b` | sidebar |
| `--vc-hairline` | `rgba(255,255,255,0.08)` | every border |
| `--vc-text` / `--vc-text-2` / `--vc-muted` / `--vc-dim` / `--vc-faint` | | text ramp |
| `--vc-accent` `#0066cc` / `--vc-accent-text` `#2997ff` | | fills / text + icons |
| `--vc-critical` `--vc-high` `--vc-medium` `--vc-low` `--vc-ok` | | severity + state |

Core classes: `.vc-card` (+ `.vc-card-flush`, `.vc-card-head`, `.vc-card-title`, `.vc-card-sub`),
`.vc-btn` / `.vc-btn-primary` / `.vc-btn-secondary` (+ `.vc-btn-lg`, `.vc-btn-xs`),
`.vc-input` `.vc-select` `.vc-textarea` `.vc-label` `.vc-toggle`,
`.vc-filters` `.vc-search` `.vc-chip` `.vc-seg`,
`.vc-thead` / `.vc-tr` (set `gridTemplateColumns` per table),
`.vc-stat` `.vc-stat-label` `.vc-meter` `.vc-pill` `.vc-count` `.vc-tag` `.vc-dot`,
`.vc-note` (+ `-error` / `-success` / `-info`), `.vc-skel` `.vc-spinner` `.vc-empty`,
grid helpers `.vc-grid` + `.vc-grid-2/3/4`.

Severity colour comes from a tone class (`.vc-sev-critical` … `.vc-ok`, `.vc-neutral`) applied
to the element; `.vc-count`, `.vc-pill`, and `.vc-meter` derive their fill from `currentColor`.
Helpers in `src/lib/ui.ts`: `severityTone()`, `stateTone()`, `stateLabel()`, `shortAge()`,
`scanTime()`, `duration()`.

## App shell
`LayoutShell.tsx` renders a **248px grouped left sidebar + 58px breadcrumb top bar**.
`/`, `/signin`, `/signup`, and `/auth/callback` are "bare" routes that opt out of all chrome
(`BARE_ROUTES` in `LayoutShell.tsx`).

Pages put their primary actions in the top bar, not the page body:
```tsx
import TopbarActions from "@/components/app/TopbarActions";

<TopbarActions>
  <button className="vc-btn">Export</button>
  <button className="vc-btn-primary">Run scan</button>
</TopbarActions>
```
Shell state (user, plan label, nav badge counts, mobile drawer) comes from
`useAppShell()` in `src/components/app/AppShellContext.tsx`.

## Key Files
```
src/lib/api.ts          shared fetch wrapper — api<T>(path, init?) · badgeClasses()
src/lib/ui.ts           severity/state tones, age + duration formatting
src/types/index.ts      all TypeScript types (Account, ScanItem, Finding, etc.)
src/components/
  LayoutShell.tsx       app shell — sidebar + top bar, loads auth/billing for the chrome
  NavIcon.tsx           sidebar line icons
  app/
    AppSidebar.tsx      248px grouped nav + workspace card + account menu
    AppTopbar.tsx       58px breadcrumb bar with the #vc-topbar-actions slot
    TopbarActions.tsx   portal that fills that slot
    AppShellContext.tsx shell state shared by sidebar and top bar
  ui/Card.tsx           Card and Badge (tone-based variants)
  scans/
    FindingsTable.tsx   findings grid — Finding / Check / Resource / Account / Age / State
    FindingDetail.tsx   finding detail panel (the one elevated surface)
    ScanFilters.tsx     search + account/scan/service/severity/state filters
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
3. Add the route to `groups` in `components/app/AppSidebar.tsx` and to `CRUMBS` in `AppTopbar.tsx`
4. Open with `<div className="vc-page-head"><h1 className="vc-h1">…</h1><p className="vc-sub">…</p></div>`

## AI Analysis Integration
Call `POST /scans/{scan_id}/ai-analysis` → returns `{ analysis: string, findings_count: number }`.
Display the `analysis` text in a dedicated panel in the scans page.

## AI Assistant Widget
`components/assistant/AssistantWidget.tsx` — floating chat, mounted once in `LayoutShell`
for signed-in users on non-bare routes. It streams NDJSON from `POST /assistant/chat`
(frames: `text` / `tool` / `error` / `done`), renders replies with
`components/chat/ChatMarkdown.tsx` (shared with the per-finding chat in `FindingDetail`),
and hides itself when `GET /assistant/config` reports `enabled: false`.
Styling lives in the `.vc-assist-*` block at the bottom of `globals.css`.

## Common Patterns
- Auth check: `const auth = await api<AuthMe>("/auth/me")` — redirect to `/signin` if `!auth.authenticated`
- Loading: `<div className="vc-skel h-14 w-full" />` or `<span className="vc-spinner" />`
- Error: `<div className="vc-note vc-note-error">{error}</div>`
- Success: `<div className="vc-note vc-note-success">{message}</div>`
- Empty state: `<div className="vc-empty">Nothing here yet.</div>`

## Routes
`/` · `/signin` · `/signup` · `/dashboard` · `/scans` · `/findings` · `/accounts` · `/msp` ·
`/onboarding` · `/launch` · `/plans` · `/settings` · `/admin`
