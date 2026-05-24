"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type HealthResponse = {
  ok: boolean;
  app_env: string;
  frontend_url: string;
  cookie_secure: boolean;
  razorpay: {
    configured: boolean;
    webhook_configured: boolean;
    checkout_ready: boolean;
  };
};

type AuthMe = {
  authenticated: boolean;
  user?: { id: number; email: string; name: string; role: string };
};

type BillingMe = {
  subscription_status: string;
  account_limit: number;
  connected_accounts_used: number;
};

type Account = {
  id: number;
  customer_name: string;
  account_name: string;
  aws_account_id: string;
  region: string;
  status: string;
  is_active: boolean;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || `Request failed: ${res.status}`);
  return data;
}

function copyText(text: string) { navigator.clipboard.writeText(text); }

export default function LaunchPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const healthData = await api<HealthResponse>("/health");
        setHealth(healthData);
        try {
          const auth = await api<AuthMe>("/auth/me");
          if (auth.authenticated) {
            setAuthenticated(true);
            const [billingData, accountsData] = await Promise.all([
              api<BillingMe>("/billing/me"),
              api<{ accounts: Account[] }>("/accounts"),
            ]);
            setBilling(billingData);
            setAccounts(accountsData.accounts || []);
          }
        } catch { setAuthenticated(false); }
      } finally { setLoading(false); }
    })();
  }, []);

  const activeAccounts = useMemo(() => accounts.filter(a => a.is_active).length, [accounts]);

  const qaChecks = [
    { label: "Backend health endpoint",      done: !!health?.ok,                        detail: health?.ok ? `Healthy (${health.app_env})` : "Needs validation" },
    { label: "Razorpay checkout readiness",  done: !!health?.razorpay?.checkout_ready,  detail: health?.razorpay?.checkout_ready ? "Keys + plan IDs configured" : "Checkout not ready" },
    { label: "Webhook configured",           done: !!health?.razorpay?.webhook_configured, detail: health?.razorpay?.webhook_configured ? "Webhook secret set" : "Webhook not configured" },
    { label: "Authenticated session",        done: authenticated,                        detail: authenticated ? "Login and session working" : "Not logged in this session" },
    { label: "Connected AWS account",        done: accounts.length > 0,                 detail: accounts.length > 0 ? `${accounts.length} account(s) connected` : "No accounts connected" },
    { label: "Public deployment",            done: !!health?.frontend_url && !health.frontend_url.includes("localhost"), detail: health?.frontend_url && !health.frontend_url.includes("localhost") ? `Live at ${health.frontend_url}` : "Still on localhost" },
  ];

  const doneCount = qaChecks.filter(c => c.done).length;

  const demoScript = `1. Open the homepage — explain AWS-only posture-checking focus.
2. Open Accounts — show connected account management.
3. Test role-based connection on an account.
4. Open Scans — run a linked scan.
5. Review findings, fix guidance, actions, and exports.
6. Open Plans — show Razorpay-backed pricing and billing readiness.
7. Open Launch Prep — show final QA and launch readiness.`;

  const outreachTemplate = `Hi [Name],

I built VigiliCloud, an AWS-focused compliance workflow that helps teams connect AWS accounts, detect misconfigurations, review findings, track remediation actions, and export structured evidence.

The product already supports:
- Connected AWS accounts
- Account-linked scans
- AI-powered security analysis
- Remediation tracking + approval gates
- Exports (CSV, JSON, PDF evidence pack)
- Razorpay-backed billing (live)

Opening pilot conversations for MSPs and startups preparing for SOC 2 or customer security reviews.

Would you be open to a short 10-minute demo?

Best,
Leela`;

  function handleCopy(text: string, label: string) {
    copyText(text);
    setCopyMessage(`${label} copied`);
    setTimeout(() => setCopyMessage(""), 2000);
  }

  const DEMO_LINKS = [
    { href: "/",        label: "Homepage",       desc: "Marketing & hero" },
    { href: "/accounts", label: "Accounts",      desc: "AWS account management" },
    { href: "/scans",    label: "Scans",          desc: "Run and review scans" },
    { href: "/findings", label: "Findings",       desc: "All findings dashboard" },
    { href: "/plans",    label: "Plans",          desc: "Pricing and billing" },
  ];

  return (
    <main className="space-y-5 pb-24">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-white/[0.04] via-transparent to-amber-500/[0.02] p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-amber-500/[0.05] blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10">
            <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Launch Prep</h1>
            <p className="mt-0.5 text-sm text-neutral-500">QA status, demo flow, outreach copy, and launch assets</p>
            {!loading && (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className={`font-medium ${doneCount === qaChecks.length ? "text-emerald-400" : "text-yellow-400"}`}>{doneCount}/{qaChecks.length} checks passing</span>
                <span className="text-neutral-500">{accounts.length} accounts · {activeAccounts} active</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Copy confirmation ───────────────────────────────────────────── */}
      {copyMessage && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] p-4 text-sm text-emerald-300">
          <span>✓</span><span>{copyMessage}</span>
        </div>
      )}

      {/* ── Stat tiles ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Backend Health", value: loading ? "…" : health?.ok ? "OK" : "Check", color: health?.ok ? "text-emerald-400" : "text-red-400" },
          { label: "Billing Mode",   value: loading ? "…" : health?.razorpay?.configured ? "Razorpay" : "Not set", color: health?.razorpay?.configured ? "text-emerald-400" : "text-yellow-400" },
          { label: "Accounts",       value: loading ? "…" : accounts.length, color: "text-white" },
          { label: "QA Status",      value: loading ? "…" : `${doneCount}/${qaChecks.length}`, color: doneCount === qaChecks.length ? "text-emerald-400" : "text-yellow-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</div>
            <div className={`mt-2 text-2xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── QA + Environment ────────────────────────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Final QA Status</div>
            <h2 className="mt-1 text-lg font-bold">What to verify before public launch</h2>
          </div>
          <div className="space-y-3">
            {qaChecks.map(item => (
              <div key={item.label} className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                <div>
                  <div className="font-medium text-white">{item.label}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">{item.detail}</div>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${item.done ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"}`}>
                  {item.done ? "Done" : "Pending"}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Environment Snapshot</div>
            <h2 className="mt-1 text-lg font-bold">Backend and billing state</h2>
          </div>
          <div className="space-y-3">
            {[
              { label: "App Environment",   value: loading ? "…" : health?.app_env || "—", mono: true  },
              { label: "Frontend URL",       value: loading ? "…" : health?.frontend_url || "—", mono: true },
              { label: "Cookie Secure",      value: loading ? "…" : health?.cookie_secure ? "TRUE" : "FALSE", mono: false },
              { label: "Current Plan",       value: loading ? "…" : (billing?.subscription_status || "free").toUpperCase(), mono: false },
              { label: "API Endpoint",       value: API_BASE, mono: true },
            ].map(({ label, value, mono }) => (
              <div key={label} className="rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</div>
                <div className={`mt-1 break-all ${mono ? "font-mono text-xs text-neutral-300" : "font-medium text-white"}`}>{value}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Demo script + Outreach ──────────────────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Demo Script</div>
              <h2 className="mt-1 text-lg font-bold">Use this for pilot calls</h2>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(demoScript, "Demo script")}
              className="rounded-xl border border-white/[0.07] px-3 py-1.5 text-xs text-neutral-400 hover:bg-white/[0.05] hover:text-white transition-colors"
            >
              Copy
            </button>
          </div>
          <pre className="overflow-auto whitespace-pre-wrap rounded-2xl border border-white/[0.06] bg-black/40 p-4 text-sm leading-7 text-neutral-400">{demoScript}</pre>
        </section>

        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Outreach Template</div>
              <h2 className="mt-1 text-lg font-bold">First pilot outreach</h2>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(outreachTemplate, "Outreach template")}
              className="rounded-xl border border-white/[0.07] px-3 py-1.5 text-xs text-neutral-400 hover:bg-white/[0.05] hover:text-white transition-colors"
            >
              Copy
            </button>
          </div>
          <pre className="overflow-auto whitespace-pre-wrap rounded-2xl border border-white/[0.06] bg-black/40 p-4 text-sm leading-7 text-neutral-400">{outreachTemplate}</pre>
        </section>
      </div>

      {/* ── Assets + Quick nav ──────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Launch Assets</div>
            <h2 className="mt-1 text-lg font-bold">Prepare before announcing publicly</h2>
          </div>
          <div className="space-y-2">
            {[
              "Homepage screenshot",
              "Plans & pricing screenshot",
              "Accounts page screenshot",
              "Scans + findings screenshot",
              "Short demo video (Loom)",
              "Pilot outreach message",
              "LinkedIn post draft",
            ].map((item, i) => (
              <div key={item} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/30 px-4 py-2.5 text-sm text-neutral-400">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/[0.08] text-[9px] font-bold text-neutral-600">{i + 1}</span>
                {item}
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3 text-sm text-emerald-300">
            Treat this page as your founder launch board — QA, demo flow, and asset checklist in one place.
          </div>
        </section>

        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Quick Navigation</div>
            <h2 className="mt-1 text-lg font-bold">Open during a demo</h2>
          </div>
          <div className="space-y-2">
            {DEMO_LINKS.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3 hover:bg-white/[0.04] hover:border-white/[0.10] transition-colors"
              >
                <div>
                  <div className="font-medium text-white">{item.label}</div>
                  <div className="text-xs text-neutral-500">{item.desc}</div>
                </div>
                <svg className="h-3.5 w-3.5 shrink-0 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            ))}
          </div>
        </section>
      </div>

    </main>
  );
}
