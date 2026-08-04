"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Link from "next/link";
import { AuthMe } from "@/types";
import TopbarActions from "@/components/app/TopbarActions";

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

/** Sentinel used while a fan-out across every client is in flight. */
const ALL_CLIENTS = "__all__";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function gradeFor(score: number) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function scoreTone(score: number) {
  if (score >= 80) return "vc-ok";
  if (score >= 60) return "vc-sev-high";
  return "vc-sev-critical";
}

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

  /** Checks passing across every scanned account in the group, as a 0-100 score. */
  function groupScore(group: ClientGroup) {
    const scanned = group.accounts.filter(a => a.latest_scan && a.latest_scan.total > 0);
    if (scanned.length === 0) return null;
    const total = scanned.reduce((n, a) => n + a.latest_scan!.total, 0);
    const fail = scanned.reduce((n, a) => n + a.latest_scan!.fail, 0);
    return Math.round(((total - fail) / total) * 100);
  }

  /** Fan a sweep out across every client group in one action. */
  async function scanAllClients() {
    if (!data || data.clients.length === 0) return;
    setScanningGroup(ALL_CLIENTS);
    setError("");
    setMessage("");
    try {
      const results = await Promise.allSettled(
        data.clients.map(c =>
          api(`/msp/clients/${encodeURIComponent(c.client_group)}/scan`, { method: "POST" }),
        ),
      );
      const failed = results.filter(r => r.status === "rejected").length;
      setMessage(
        failed === 0
          ? `Sweep started across all ${data.clients.length} clients.`
          : `Sweep started for ${data.clients.length - failed} of ${data.clients.length} clients.`,
      );
      setTimeout(() => setMessage(""), 6000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start scans");
    } finally {
      setScanningGroup(null);
    }
  }

  const clients = data?.clients ?? [];
  const ungrouped = data?.ungrouped ?? [];
  const totalAccounts = clients.reduce((n, c) => n + c.total_accounts, 0) + ungrouped.length;
  const atRisk = clients.filter(c => c.critical > 0).length;

  return (
    <>
      <TopbarActions>
        <Link href="/findings" className="vc-btn">
          Client report
        </Link>
        <button
          type="button"
          className="vc-btn-primary"
          onClick={scanAllClients}
          disabled={!!scanningGroup || clients.length === 0}
        >
          {scanningGroup === ALL_CLIENTS ? "Starting…" : "Scan all clients"}
        </button>
      </TopbarActions>

      <div className="vc-page-head">
        <div>
          <h1 className="vc-h1">Clients</h1>
          <p className="vc-sub">
            One grade per relationship. Group accounts by client to roll findings up the way you bill.
          </p>
        </div>
      </div>

      {error && <div className="vc-note vc-note-error">{error}</div>}
      {message && !error && <div className="vc-note vc-note-success">{message}</div>}

      <div className="vc-grid vc-grid-4">
        <div className="vc-card">
          <div className="vc-stat-label">Clients</div>
          <div className="vc-stat vc-stat-sm">{loading ? "—" : clients.length}</div>
        </div>
        <div className="vc-card">
          <div className="vc-stat-label">Accounts</div>
          <div className="vc-stat vc-stat-sm">{loading ? "—" : totalAccounts}</div>
        </div>
        <div className="vc-card">
          <div className="vc-stat-label">Clients at risk</div>
          <div className={`vc-stat vc-stat-sm ${atRisk > 0 ? "vc-sev-critical" : ""}`}>{loading ? "—" : atRisk}</div>
        </div>
        <div className="vc-card">
          <div className="vc-stat-label">Ungrouped</div>
          <div className={`vc-stat vc-stat-sm ${ungrouped.length > 0 ? "vc-sev-medium" : ""}`}>
            {loading ? "—" : ungrouped.length}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="vc-grid vc-grid-2">
          {[0, 1].map(i => <div key={i} className="vc-skel h-64" />)}
        </div>
      ) : clients.length === 0 && ungrouped.length === 0 ? (
        <div className="vc-card flex flex-col items-center gap-4 py-14 text-center">
          <div className="vc-card-title">No accounts connected yet</div>
          <p className="vc-sub max-w-sm">Connect an AWS account, then group it under a client name.</p>
          <Link href="/accounts" className="vc-btn-primary vc-btn-lg">Connect account</Link>
        </div>
      ) : (
        <div className="vc-grid vc-grid-2">
          {clients.map(group => {
            const score = groupScore(group);
            const tone = score == null ? "vc-neutral" : scoreTone(score);
            return (
              <div key={group.client_group} className="vc-card vc-card-flush flex flex-col">
                <div className="flex items-center gap-3.5 border-b border-[var(--vc-hairline)] px-[22px] py-[18px]">
                  <div className={`flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] text-[13px] font-semibold ${tone}`}
                       style={{ background: "color-mix(in srgb, currentColor 12%, transparent)" }}>
                    {initials(group.client_group)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="vc-card-title truncate">{group.client_group}</div>
                    <div className="mt-0.5 text-xs text-[var(--vc-muted)]">
                      {group.total_accounts} account{group.total_accounts !== 1 ? "s" : ""} · last sweep {fmtDate(group.last_scan_at)}
                    </div>
                  </div>
                  {score != null && (
                    <span className={`vc-pill flex-none !px-[11px] !py-1 !text-xs ${tone}`}>
                      {gradeFor(score)} · {score}
                    </span>
                  )}
                </div>

                {group.accounts.map(acct => (
                  <div key={acct.id} className="flex items-center gap-3.5 border-b border-[var(--vc-hairline-soft)] px-[22px] py-[13px]">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--vc-text)]">
                      {acct.account_name || acct.customer_name}{" "}
                      <span className="vc-mono text-[11.5px] text-[var(--vc-dim)]">{acct.region}</span>
                    </span>
                    <span className={`text-xs font-semibold ${acct.latest_scan?.critical ? "vc-sev-critical" : "text-[var(--vc-dim)]"}`}>
                      {acct.latest_scan?.critical ?? 0} critical
                    </span>
                    <span className="text-xs text-[var(--vc-muted)]">
                      {acct.latest_scan ? `${acct.latest_scan.fail} open` : "No scan"}
                    </span>
                  </div>
                ))}

                <div className="mt-auto flex flex-wrap items-center gap-2.5 px-[22px] py-3.5">
                  <button
                    type="button"
                    className="vc-btn-secondary"
                    onClick={() => scanGroup(group.client_group)}
                    disabled={scanningGroup === group.client_group}
                  >
                    {scanningGroup === group.client_group ? "Starting…" : "Scan client"}
                  </button>
                  <Link href="/findings" className="vc-btn-secondary">Open findings</Link>
                  {group.high > 0 && (
                    <span className="vc-pill vc-sev-high ml-auto">{group.high} high</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Ungrouped accounts ───────────────────────────────────────────── */}
      {ungrouped.length > 0 && (
        <div className="vc-card vc-card-flush">
          <div className="vc-card-head">
            <div>
              <div className="vc-card-title">Ungrouped accounts</div>
              <div className="vc-card-sub">
                Assign a client name to roll these up into a client view.
              </div>
            </div>
            <span className="vc-tag">{ungrouped.length}</span>
          </div>

          {ungrouped.map(acct => (
            <div key={acct.id} className="vc-list-row">
              <div className="min-w-0 flex-1">
                <div className="vc-cell-strong truncate">{acct.account_name || acct.customer_name}</div>
                <div className="vc-mono vc-cell-sub">{acct.aws_account_id} · {acct.region}</div>
              </div>
              <input
                type="text"
                className="vc-input !h-8 !w-40"
                value={groupInputs[acct.id] ?? ""}
                onChange={e => setGroupInputs(prev => ({ ...prev, [acct.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") assignGroup(acct.id); }}
                placeholder="Client name"
                aria-label={`Client group for ${acct.account_name}`}
              />
              <button
                type="button"
                className="vc-btn-primary"
                onClick={() => assignGroup(acct.id)}
                disabled={assigningAccountId === acct.id || !(groupInputs[acct.id] || "").trim()}
              >
                {assigningAccountId === acct.id ? "…" : "Assign"}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
