"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AuthMe, DashboardResponse, DashboardAccount } from "@/types";

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  ACTIVE:  { label: "Active",  cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
  PENDING: { label: "Pending", cls: "border-yellow-500/30 bg-yellow-500/10  text-yellow-400"  },
  ERROR:   { label: "Error",   cls: "border-red-500/30    bg-red-500/10     text-red-400"    },
};

const SEV_CFG = [
  { key: "CRITICAL", label: "C", cls: "border-red-500/40    bg-red-500/10     text-red-400"    },
  { key: "HIGH",     label: "H", cls: "border-orange-500/40 bg-orange-500/10  text-orange-400" },
  { key: "MEDIUM",   label: "M", cls: "border-yellow-500/40 bg-yellow-500/10  text-yellow-400" },
  { key: "LOW",      label: "L", cls: "border-blue-500/40   bg-blue-500/10    text-blue-400"   },
];

function fmt(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return iso; }
}

function PassBar({ rate }: { rate: number }) {
  const color = rate >= 80 ? "bg-emerald-500" : rate >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-neutral-500">Pass rate</span>
        <span className={rate >= 80 ? "text-emerald-400" : rate >= 50 ? "text-yellow-400" : "text-red-400"}>
          {rate}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${rate}%` }} />
      </div>
    </div>
  );
}

function AccountCard({ account, onRunScan, scanning }: {
  account: DashboardAccount;
  onRunScan: (id: number) => void;
  scanning: boolean;
}) {
  const status = STATUS_CFG[account.status] ?? STATUS_CFG.PENDING;
  const s = account.findings_summary;
  const hasScan = !!account.latest_scan;
  const hasFindings = hasScan && s.total > 0;

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-white/[0.07] bg-white/[0.02] p-5 hover:border-white/[0.12] transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white truncate">{account.account_name}</span>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${status.cls}`}>
              {status.label}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">{account.customer_name}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] font-mono text-neutral-600">{account.aws_account_id}</div>
          <div className="text-[10px] text-neutral-700">{account.region}</div>
        </div>
      </div>

      {/* Severity badges */}
      {hasFindings ? (
        <div className="flex gap-1.5 flex-wrap">
          {SEV_CFG.map(({ key, label, cls }) => {
            const count = s[key as keyof typeof s] as number;
            return (
              <span key={key} className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${cls} ${count === 0 ? "opacity-30" : ""}`}>
                {label}: {count}
              </span>
            );
          })}
        </div>
      ) : hasScan ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2 text-xs text-emerald-400">
          No findings — all checks passed
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-neutral-600">
          No scans yet
        </div>
      )}

      {/* Pass rate */}
      {hasFindings && <PassBar rate={s.pass_rate} />}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.05]">
        <div className="text-[10px] text-neutral-600">
          {account.latest_scan
            ? <>Last scan: <span className="text-neutral-500">{fmt(account.latest_scan.created_at)}</span></>
            : <span>No scans yet</span>
          }
        </div>
        <div className="flex items-center gap-1.5">
          {account.latest_scan && (
            <Link
              href={`/scans/${account.latest_scan.scan_id}`}
              className="rounded-lg border border-white/[0.08] px-2.5 py-1 text-[10px] font-medium text-neutral-400 hover:bg-white/[0.05] hover:text-white transition-colors"
            >
              View Scan
            </Link>
          )}
          <button
            type="button"
            disabled={scanning || !account.is_active}
            onClick={() => onRunScan(account.id)}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
          >
            {scanning ? "Running…" : "Run Scan"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scanningId, setScanningId] = useState<number | null>(null);
  const [scanMsg, setScanMsg] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const auth = await api<AuthMe>("/auth/me");
      if (!auth.authenticated) { router.push("/signin"); return; }
      const d = await api<DashboardResponse>("/dashboard");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRunScan(accountId: number) {
    setScanningId(accountId);
    setScanMsg("");
    try {
      await api("/scans/run", { method: "POST", body: JSON.stringify({ account_id: accountId, region: "us-east-1" }) });
      setScanMsg("Scan started — refreshing shortly…");
      setTimeout(() => { setScanMsg(""); load(); }, 3500);
    } catch (e) {
      setScanMsg(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanningId(null);
    }
  }

  const totals = data?.totals;
  const accounts = data?.accounts ?? [];

  return (
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/[0.15] bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-transparent p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-500/[0.06] blur-3xl" />
        <div className="relative">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-emerald-500">Posture Overview</div>
          <h1 className="text-3xl font-black tracking-tight">Security Dashboard</h1>
          <p className="mt-2 max-w-lg text-sm text-neutral-500">Multi-account AWS security posture at a glance. Run scans and track findings across all connected accounts.</p>
        </div>
      </div>

      {/* ── Stat tiles ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Accounts",  value: totals?.accounts ?? "—",  cls: "text-white" },
          { label: "Critical",  value: totals?.critical ?? "—",  cls: totals?.critical ? "text-red-400"    : "text-white" },
          { label: "High",      value: totals?.high     ?? "—",  cls: totals?.high    ? "text-orange-400" : "text-white" },
          { label: "Med / Low", value: totals ? `${totals.medium} / ${totals.low}` : "—", cls: "text-white" },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{t.label}</div>
            <div className={`mt-1 text-2xl font-black ${t.cls}`}>{loading ? <span className="animate-pulse text-neutral-700">—</span> : t.value}</div>
          </div>
        ))}
      </div>

      {/* ── Scan message ───────────────────────────────────────────────── */}
      {scanMsg && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-3 text-sm text-emerald-300">
          {scanMsg}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* ── Account cards ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-3xl border border-white/[0.07] bg-white/[0.02]" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-white/[0.07] bg-white/[0.02] py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03]">
            <svg className="h-6 w-6 text-neutral-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-white">No accounts connected</div>
            <div className="mt-1 text-sm text-neutral-500">Connect an AWS account to start seeing security posture data.</div>
          </div>
          <Link href="/accounts" className="rounded-2xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-black hover:bg-emerald-400 transition-colors">
            Connect Account →
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((acct) => (
            <AccountCard
              key={acct.id}
              account={acct}
              onRunScan={handleRunScan}
              scanning={scanningId === acct.id}
            />
          ))}
        </div>
      )}

      {/* ── Quick links ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-white/[0.05]">
        {[
          { href: "/accounts", label: "Manage Accounts" },
          { href: "/scans",    label: "All Scans" },
          { href: "/findings", label: "All Findings" },
          { href: "/plans",    label: "Upgrade Plan" },
        ].map((l) => (
          <Link key={l.href} href={l.href}
            className="rounded-xl border border-white/[0.07] px-3 py-1.5 text-xs font-medium text-neutral-400 hover:bg-white/[0.05] hover:text-white transition-colors">
            {l.label} →
          </Link>
        ))}
      </div>
    </div>
  );
}
