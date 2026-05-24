"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AuthMe, BillingMe } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export default function SettingsPage() {
  const [user, setUser] = useState<AuthMe["user"] | null>(null);
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const auth = await api<AuthMe>("/auth/me");
        if (auth.authenticated && auth.user) {
          setUser(auth.user);
          const billingData = await api<BillingMe>("/billing/me");
          setBilling(billingData);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function syncBilling() {
    setSyncLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await api<BillingMe>("/billing/sync", { method: "POST" });
      setBilling(data);
      setMessage("Billing synced successfully.");
      setTimeout(() => setMessage(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Billing sync failed");
    } finally {
      setSyncLoading(false);
    }
  }

  async function openPortal() {
    setPortalLoading(true);
    setError("");
    try {
      const data = await api<{ url: string }>("/billing/portal", {
        method: "POST",
        body: JSON.stringify({ return_url: `${window.location.origin}/settings` }),
      });
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open billing portal");
      setPortalLoading(false);
    }
  }

  const currentPlan = (billing?.subscription_status || "free").toUpperCase();
  const isPaidPlan = billing?.subscription_status?.toLowerCase() !== "free";
  const accountsUsed = billing?.connected_accounts_used ?? 0;
  const accountLimit = billing?.account_limit ?? 1;
  const usagePct = accountLimit > 0 ? Math.round((accountsUsed / accountLimit) * 100) : 0;

  const NAV_LINKS = [
    { href: "/scans",    label: "Scans & Findings",   desc: "Run scans and review AWS posture findings",    icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" },
    { href: "/accounts", label: "Connected Accounts",  desc: "Manage AWS account connections",               icon: "M3 7h18M3 12h18M3 17h18" },
    { href: "/findings", label: "All Findings",        desc: "Aggregated view across all scans",            icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" },
    { href: "/plans",    label: "Plans & Billing",     desc: "Upgrade plan or manage your subscription",    icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" },
  ];

  return (
    <main className="space-y-5 pb-24">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-white/[0.04] via-transparent to-sky-500/[0.02] p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-sky-500/[0.05] blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-500/25 bg-sky-500/10">
            <svg className="h-5 w-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="mt-0.5 text-sm text-neutral-500">Manage your VigiliCloud profile, billing, and workspace</p>
          </div>
        </div>
      </div>

      {/* ── Status ─────────────────────────────────────────────────────── */}
      {(message || error) && (
        <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${error ? "border-red-500/20 bg-red-500/[0.07] text-red-300" : "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"}`}>
          <span className="mt-0.5">{error ? "✕" : "✓"}</span>
          <span>{error || message}</span>
        </div>
      )}

      {/* ── Stat tiles ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Current Plan",   value: loading ? "…" : currentPlan,              color: isPaidPlan ? "text-emerald-400" : "text-neutral-300" },
          { label: "Account Usage",  value: loading ? "…" : `${accountsUsed}/${accountLimit}`, color: usagePct >= 100 ? "text-red-400" : "text-white" },
          { label: "Exports",        value: loading ? "…" : billing?.capabilities?.exports ? "Enabled" : "Locked", color: billing?.capabilities?.exports ? "text-emerald-400" : "text-yellow-400" },
          { label: "Role",           value: loading ? "…" : (user?.role ?? "—"),     color: "text-sky-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</div>
            <div className={`mt-2 text-2xl font-bold capitalize ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">

        {/* ── Account Profile ──────────────────────────────────────────── */}
        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
              <svg className="h-4 w-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold">Account Profile</h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />)}
            </div>
          ) : !user ? (
            <div className="rounded-xl border border-dashed border-white/[0.07] p-8 text-center">
              <p className="text-sm text-neutral-500">Not authenticated. <Link href="/signin" className="text-emerald-400 hover:underline">Sign in</Link></p>
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { label: "Name",    value: user.name,  mono: false },
                { label: "Email",   value: user.email, mono: false },
                { label: "Role",    value: user.role,  mono: false },
                { label: "User ID", value: String(user.id), mono: true },
              ].map(({ label, value, mono }) => (
                <div key={label} className="rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</div>
                  <div className={`mt-1 ${mono ? "font-mono text-sm text-neutral-300" : "font-medium text-white capitalize"}`}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Billing & Plan ───────────────────────────────────────────── */}
        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
              <svg className="h-4 w-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold">Billing & Plan</h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />)}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Subscription Status</div>
                <div className={`mt-1 text-xl font-bold ${isPaidPlan ? "text-emerald-400" : "text-neutral-300"}`}>{currentPlan}</div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Account Usage</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className={`text-xl font-bold ${usagePct >= 100 ? "text-red-400" : usagePct >= 75 ? "text-yellow-400" : "text-emerald-400"}`}>
                    {accountsUsed}/{accountLimit}
                  </span>
                  <span className="text-xs text-neutral-500">accounts used</span>
                </div>
              </div>

              {!isPaidPlan && (
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.05] px-4 py-3 text-sm text-yellow-200">
                  Upgrade your plan to unlock account-linked scans and exports.{" "}
                  <Link href="/plans" className="font-medium underline">View Plans →</Link>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={syncBilling}
                  disabled={syncLoading}
                  className="rounded-xl border border-white/[0.07] px-4 py-2 text-sm text-neutral-400 hover:bg-white/[0.05] hover:text-white disabled:opacity-40 transition-colors"
                >
                  {syncLoading ? "Syncing…" : "↺ Sync Billing"}
                </button>
                {isPaidPlan ? (
                  <button
                    type="button"
                    onClick={openPortal}
                    disabled={portalLoading}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-40 transition-colors"
                  >
                    {portalLoading ? "Opening…" : "Manage Billing"}
                  </button>
                ) : (
                  <Link href="/plans" className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400 transition-colors">
                    Upgrade Plan
                  </Link>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── Plan Capabilities ────────────────────────────────────────── */}
        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
              <svg className="h-4 w-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold">Plan Capabilities</h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {[
                {
                  label: "Account-Linked Scans",
                  desc: "Run scans tied to specific connected AWS accounts",
                  enabled: billing?.capabilities?.account_linked_scans ?? false,
                },
                {
                  label: "Exports (JSON, CSV, PDF)",
                  desc: "Download findings as structured exports and evidence packs",
                  enabled: billing?.capabilities?.exports ?? false,
                },
                {
                  label: "Connected Accounts",
                  desc: `${accountsUsed} of ${accountLimit} slot${accountLimit !== 1 ? "s" : ""} used`,
                  enabled: true,
                },
              ].map(cap => (
                <div key={cap.label} className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                  <div>
                    <div className="font-medium text-white">{cap.label}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">{cap.desc}</div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${cap.enabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"}`}>
                    {cap.enabled ? "Enabled" : "Locked"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Quick Navigation ─────────────────────────────────────────── */}
        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
              <svg className="h-4 w-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold">Quick Navigation</h2>
          </div>

          <div className="space-y-2">
            {NAV_LINKS.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3 hover:bg-white/[0.04] hover:border-white/[0.10] transition-colors"
              >
                <svg className="h-4 w-4 shrink-0 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                <div className="min-w-0">
                  <div className="font-medium text-white">{item.label}</div>
                  <div className="text-xs text-neutral-500">{item.desc}</div>
                </div>
                <svg className="ml-auto h-3.5 w-3.5 shrink-0 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">API Endpoint</div>
            <div className="mt-1 break-all font-mono text-xs text-neutral-400">{API_BASE}</div>
          </div>
        </section>

      </div>
    </main>
  );
}
