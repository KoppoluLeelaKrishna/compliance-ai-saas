"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AuthMe } from "@/types";

type AccountSummary = {
  id: number;
  customer_name: string;
  account_name: string;
  aws_account_id: string;
  region: string;
  status: string;
  is_active: boolean;
  client_group: string;
  latest_scan: {
    scan_id: string;
    status: string;
    created_at: string;
    total: number;
    fail: number;
    critical: number;
    high: number;
  } | null;
};

type ClientGroup = {
  client_group: string;
  accounts: AccountSummary[];
  total_accounts: number;
  critical: number;
  high: number;
  last_scan_at: string | null;
};

type MspData = {
  clients: ClientGroup[];
  ungrouped: AccountSummary[];
};

export default function MspPage() {
  const router = useRouter();
  const [data, setData] = useState<MspData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [scanningGroup, setScanningGroup] = useState<string | null>(null);
  const [assigningAccountId, setAssigningAccountId] = useState<number | null>(null);
  const [groupInputs, setGroupInputs] = useState<Record<number, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const auth = await api<AuthMe>("/auth/me");
        if (!auth.authenticated) { router.push("/signin"); return; }
        const msp = await api<MspData>("/msp/clients");
        setData(msp);
        const inputs: Record<number, string> = {};
        [...(msp.clients.flatMap(c => c.accounts)), ...(msp.ungrouped)].forEach(a => {
          inputs[a.id] = a.client_group || "";
        });
        setGroupInputs(inputs);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load MSP dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  async function assignGroup(accountId: number) {
    const group = (groupInputs[accountId] || "").trim();
    setAssigningAccountId(accountId);
    try {
      await api(`/msp/accounts/${accountId}/client-group`, {
        method: "PUT",
        body: JSON.stringify({ client_group: group }),
      });
      const msp = await api<MspData>("/msp/clients");
      setData(msp);
      setMessage(`Account assigned to "${group || "(ungrouped)"}" successfully.`);
      setTimeout(() => setMessage(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign group");
    } finally {
      setAssigningAccountId(null);
    }
  }

  async function scanGroup(clientGroup: string) {
    setScanningGroup(clientGroup);
    setError("");
    setMessage("");
    try {
      const data = await api<{ ok: boolean; message: string; accounts_triggered: number }>(
        `/msp/clients/${encodeURIComponent(clientGroup)}/scan`,
        { method: "POST" }
      );
      setMessage(data.message || `Scans started for ${data.accounts_triggered} account(s).`);
      setTimeout(() => setMessage(""), 6000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start scans");
    } finally {
      setScanningGroup(null);
    }
  }

  function fmtDate(s: string | null) {
    if (!s) return "Never";
    return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <main className="space-y-5 pb-24">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-white/[0.04] via-transparent to-violet-500/[0.02] p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-violet-500/[0.05] blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-500/25 bg-violet-500/10">
            <svg className="h-5 w-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">MSP Dashboard</h1>
            <p className="mt-0.5 text-sm text-neutral-500">Manage multiple client environments from a single view</p>
          </div>
        </div>
      </div>

      {/* Status */}
      {(message || error) && (
        <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${error ? "border-red-500/20 bg-red-500/[0.07] text-red-300" : "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"}`}>
          <span className="mt-0.5">{error ? "✕" : "✓"}</span>
          <span>{error || message}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-3xl bg-white/[0.03]" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Client groups */}
          {data?.clients.map(group => (
            <section key={group.client_group} className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10">
                    <svg className="h-4 w-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">{group.client_group}</h2>
                    <p className="text-xs text-neutral-500">{group.total_accounts} account{group.total_accounts !== 1 ? "s" : ""} · Last scan: {fmtDate(group.last_scan_at)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {group.critical > 0 && (
                    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-400">
                      {group.critical} CRITICAL
                    </span>
                  )}
                  {group.high > 0 && (
                    <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-xs font-bold text-orange-400">
                      {group.high} HIGH
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => scanGroup(group.client_group)}
                    disabled={scanningGroup === group.client_group}
                    className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
                  >
                    {scanningGroup === group.client_group ? "Starting…" : "Scan All"}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {group.accounts.map(acct => (
                  <div key={acct.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white truncate">{acct.account_name || acct.customer_name}</span>
                        <span className="font-mono text-xs text-neutral-500">{acct.aws_account_id}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-neutral-500">
                        <span>{acct.region}</span>
                        {acct.latest_scan && (
                          <>
                            <span>{acct.latest_scan.critical > 0 && <span className="text-red-400">{acct.latest_scan.critical} crit</span>}</span>
                            <span>{fmtDate(acct.latest_scan.created_at)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="text"
                        value={groupInputs[acct.id] ?? acct.client_group}
                        onChange={e => setGroupInputs(prev => ({ ...prev, [acct.id]: e.target.value }))}
                        placeholder="Client group"
                        className="w-32 rounded-lg border border-white/[0.07] bg-black/40 px-2 py-1 text-xs text-white placeholder-neutral-600 focus:border-violet-500/40 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => assignGroup(acct.id)}
                        disabled={assigningAccountId === acct.id}
                        className="rounded-lg border border-white/[0.07] px-2.5 py-1 text-xs text-neutral-400 hover:bg-white/[0.05] hover:text-white disabled:opacity-40 transition-colors"
                      >
                        {assigningAccountId === acct.id ? "…" : "Save"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {/* Ungrouped accounts */}
          {data && data.ungrouped.length > 0 && (
            <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-lg font-bold text-neutral-400">Ungrouped Accounts</h2>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-500">{data.ungrouped.length}</span>
              </div>
              <p className="mb-4 text-sm text-neutral-500">Assign a client group name to organize these accounts into a client view.</p>
              <div className="space-y-2">
                {data.ungrouped.map(acct => (
                  <div key={acct.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white truncate">{acct.account_name || acct.customer_name}</span>
                        <span className="font-mono text-xs text-neutral-500">{acct.aws_account_id}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-500">{acct.region}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="text"
                        value={groupInputs[acct.id] ?? ""}
                        onChange={e => setGroupInputs(prev => ({ ...prev, [acct.id]: e.target.value }))}
                        onKeyDown={e => e.key === "Enter" && assignGroup(acct.id)}
                        placeholder="Enter client group"
                        className="w-36 rounded-lg border border-white/[0.07] bg-black/40 px-2 py-1 text-xs text-white placeholder-neutral-600 focus:border-violet-500/40 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => assignGroup(acct.id)}
                        disabled={assigningAccountId === acct.id || !(groupInputs[acct.id] || "").trim()}
                        className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
                      >
                        {assigningAccountId === acct.id ? "…" : "Assign"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data?.clients.length === 0 && data?.ungrouped.length === 0 && (
            <div className="rounded-3xl border border-dashed border-white/[0.07] p-16 text-center">
              <p className="text-neutral-500">No accounts connected yet.</p>
              <a href="/accounts" className="mt-2 inline-block text-sm text-emerald-400 hover:underline">Connect an AWS account →</a>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
