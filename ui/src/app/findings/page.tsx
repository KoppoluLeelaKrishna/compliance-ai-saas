"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ApprovalEvent, AuthMe, Finding, FixGuidance } from "@/types";
import { FindingsTable } from "@/components/scans/FindingsTable";
import { FindingDetail } from "@/components/scans/FindingDetail";

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

const SEV_CONFIG = {
  CRITICAL: { border: "border-red-500/20", from: "from-red-500/[0.08]", text: "text-red-400", bar: "bg-red-500" },
  HIGH:     { border: "border-orange-500/20", from: "from-orange-500/[0.08]", text: "text-orange-400", bar: "bg-orange-500" },
  MEDIUM:   { border: "border-yellow-500/20", from: "from-yellow-500/[0.08]", text: "text-yellow-400", bar: "bg-yellow-500" },
  LOW:      { border: "border-blue-500/20", from: "from-blue-500/[0.08]", text: "text-blue-400", bar: "bg-blue-500" },
} as const;

export default function FindingsPage() {
  const router = useRouter();

  const [findings, setFindings] = useState<Finding[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [serviceFilter, setServiceFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [fixGuidance, setFixGuidance] = useState<FixGuidance | null>(null);
  const [loadingGuidance, setLoadingGuidance] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [actionSaving, setActionSaving] = useState<"FIXED" | "IGNORED" | null>(null);

  const [approvalEvents, setApprovalEvents] = useState<ApprovalEvent[]>([]);
  const [approvalSaving, setApprovalSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const auth = await api<AuthMe>("/auth/me");
        if (!auth.authenticated) { router.push("/signin"); return; }
      } catch { router.push("/signin"); return; }
      await loadFindings();
    })();
  }, []);

  async function loadFindings() {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ findings: Finding[]; total: number }>("/findings?limit=500");
      setFindings(data.findings || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load findings");
    } finally {
      setLoading(false);
    }
  }

  const services = useMemo(() => Array.from(new Set(findings.map(f => f.service))).sort(), [findings]);

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    findings.filter(f => f.status === "FAIL").forEach(f => {
      counts[f.severity] = (counts[f.severity] || 0) + 1;
    });
    return counts;
  }, [findings]);

  const sevTotal = Object.values(severityCounts).reduce((a, b) => a + b, 0);

  const filtered = useMemo(() => {
    return findings.filter(f => {
      const q = search.trim().toLowerCase();
      const matchSearch = !q || f.title.toLowerCase().includes(q) || f.check_id.toLowerCase().includes(q) || f.resource_id.toLowerCase().includes(q) || (f.account_name || "").toLowerCase().includes(q);
      const matchSeverity = severityFilter === "ALL" || f.severity === severityFilter;
      const matchService = serviceFilter === "ALL" || f.service === serviceFilter;
      const matchStatus = statusFilter === "ALL" || f.status === statusFilter;
      return matchSearch && matchSeverity && matchService && matchStatus;
    });
  }, [findings, search, severityFilter, serviceFilter, statusFilter]);

  async function openFinding(finding: Finding) {
    setSelectedFinding(finding);
    setNoteInput(finding.note || "");
    setFixGuidance(null);
    setApprovalEvents([]);
    setLoadingGuidance(true);
    try {
      const [guidanceData, approvalsData] = await Promise.all([
        api<FixGuidance>(`/fix-guidance/${finding.check_id}`).catch(() => null),
        api<{ events: ApprovalEvent[] }>(
          `/scans/${finding.scan_id}/approvals?check_id=${encodeURIComponent(finding.check_id)}&resource_id=${encodeURIComponent(finding.resource_id)}`
        ).catch(() => ({ events: [] })),
      ]);
      setFixGuidance(guidanceData);
      setApprovalEvents(approvalsData.events || []);
      if (approvalsData.events?.length) {
        const latest = approvalsData.events[approvalsData.events.length - 1];
        setSelectedFinding(f => f ? { ...f, approval_status: latest.event_type } : f);
      }
    } finally {
      setLoadingGuidance(false);
    }
  }

  async function handleSetAction(action: "FIXED" | "IGNORED") {
    if (!selectedFinding) return;
    setActionSaving(action);
    try {
      await api(
        `/finding-actions/${selectedFinding.scan_id}/${encodeURIComponent(selectedFinding.check_id)}?resource_id=${encodeURIComponent(selectedFinding.resource_id)}`,
        { method: "POST", body: JSON.stringify({ action, note: noteInput }) }
      );
      setMessage(`Marked as ${action.toLowerCase()}.`);
      setFindings(prev => prev.map(f =>
        f.scan_id === selectedFinding.scan_id && f.check_id === selectedFinding.check_id && f.resource_id === selectedFinding.resource_id
          ? { ...f, resolution: action, note: noteInput } : f
      ));
      setSelectedFinding(f => f ? { ...f, resolution: action, note: noteInput } : f);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save action");
    } finally {
      setActionSaving(null);
    }
  }

  async function postApprovalAction(endpoint: string, body: object) {
    if (!selectedFinding) return;
    setApprovalSaving(true);
    try {
      const params = new URLSearchParams({ check_id: selectedFinding.check_id, resource_id: selectedFinding.resource_id });
      await api(`/scans/${selectedFinding.scan_id}/approvals/${endpoint}?${params}`, { method: "POST", body: JSON.stringify(body) });
      const data = await api<{ events: ApprovalEvent[] }>(
        `/scans/${selectedFinding.scan_id}/approvals?check_id=${encodeURIComponent(selectedFinding.check_id)}&resource_id=${encodeURIComponent(selectedFinding.resource_id)}`
      );
      const events = data.events || [];
      setApprovalEvents(events);
      if (events.length) {
        const latest = events[events.length - 1];
        setSelectedFinding(f => f ? { ...f, approval_status: latest.event_type } : f);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval action failed");
    } finally {
      setApprovalSaving(false);
    }
  }

  const hasActiveFilters = search || severityFilter !== "ALL" || serviceFilter !== "ALL" || statusFilter !== "ALL";
  const failCount = findings.filter(f => f.status === "FAIL").length;
  const passCount = findings.filter(f => f.status === "PASS").length;

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <div className="text-sm text-neutral-500">Loading findings…</div>
        </div>
      </div>
    );
  }

  return (
    <main className="space-y-5 pb-24">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-white/[0.04] via-transparent to-violet-500/[0.02] p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-violet-500/[0.05] blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-500/25 bg-violet-500/10">
              <svg className="h-5 w-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">All Findings</h1>
              <p className="mt-0.5 text-sm text-neutral-500">Aggregated view across all scans and accounts</p>
              {!loading && (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="text-neutral-500">{total} total</span>
                  <span className="font-medium text-red-400">{failCount} failing</span>
                  <span className="font-medium text-emerald-400">{passCount} passing</span>
                  {filtered.length !== findings.length && (
                    <span className="text-violet-400">{filtered.length} shown (filtered)</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={loadFindings}
            disabled={loading}
            className="shrink-0 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2 text-xs font-medium text-neutral-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-40 transition-colors"
          >
            {loading ? "Refreshing…" : "↺ Refresh"}
          </button>
        </div>
      </div>

      {/* ── Status ─────────────────────────────────────────────────────── */}
      {(message || error) && (
        <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${error ? "border-red-500/20 bg-red-500/[0.07] text-red-300" : "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"}`}>
          <span className="mt-0.5">{error ? "✕" : "✓"}</span>
          <span>{error || message}</span>
        </div>
      )}

      {/* ── Severity tiles (clickable to filter) ───────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SEVERITIES.map(sev => {
          const cfg = SEV_CONFIG[sev];
          const count = severityCounts[sev] || 0;
          const pct = sevTotal > 0 ? Math.round((count / sevTotal) * 100) : 0;
          const active = severityFilter === sev;
          return (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(active ? "ALL" : sev)}
              className={`relative overflow-hidden rounded-2xl border text-left transition-all ${cfg.border} bg-gradient-to-br ${cfg.from} to-transparent p-5 ${active ? "ring-1 ring-white/20 scale-[1.02]" : "hover:scale-[1.01]"}`}
            >
              <div className="text-[10px] font-bold tracking-widest text-neutral-500">{sev}</div>
              <div className={`mt-1 text-4xl font-bold ${cfg.text}`}>{count}</div>
              <div className="mt-3 h-[2px] rounded-full bg-white/5">
                <div className={`h-[2px] rounded-full transition-all duration-700 ${cfg.bar}`} style={{ '--w': `${pct}%`, width: 'var(--w)' } as React.CSSProperties} />
              </div>
              <div className="mt-1.5 text-[10px] text-neutral-600">{pct}% of findings</div>
              {active && <div className="absolute right-3 top-3 text-[10px] font-bold text-white/40">ACTIVE</div>}
            </button>
          );
        })}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search by title, check ID, resource, account…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="min-w-[220px] flex-1 rounded-xl border border-white/[0.07] bg-black/40 px-4 py-2 text-sm text-white placeholder-neutral-600 focus:border-violet-500/40 focus:outline-none transition-colors"
          />
          {[
            { label: "Severity", value: severityFilter, onChange: setSeverityFilter, options: [["ALL", "All Severities"], ...SEVERITIES.map(s => [s, s])] },
            { label: "Service", value: serviceFilter, onChange: setServiceFilter, options: [["ALL", "All Services"], ...services.map(s => [s, s])] },
            { label: "Status", value: statusFilter, onChange: setStatusFilter, options: [["ALL", "All Statuses"], ["FAIL", "FAIL"], ["PASS", "PASS"]] },
          ].map(({ label, value, onChange, options }) => (
            <select
              key={label}
              aria-label={label}
              value={value}
              onChange={e => onChange(e.target.value)}
              className="rounded-xl border border-white/[0.07] bg-black/40 px-3 py-2 text-sm text-white focus:border-violet-500/40 focus:outline-none transition-colors"
            >
              {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => { setSearch(""); setSeverityFilter("ALL"); setServiceFilter("ALL"); setStatusFilter("ALL"); }}
              className="rounded-xl border border-white/[0.07] px-4 py-2 text-sm text-neutral-500 hover:text-white hover:bg-white/[0.05] transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── Findings table ─────────────────────────────────────────────── */}
      <FindingsTable findings={filtered} onOpenFinding={openFinding} loading={loading} search={search} />

      {/* ── Finding detail ─────────────────────────────────────────────── */}
      {selectedFinding && (
        <FindingDetail
          finding={selectedFinding}
          onClose={() => setSelectedFinding(null)}
          fixGuidance={fixGuidance}
          loadingGuidance={loadingGuidance}
          noteInput={noteInput}
          setNoteInput={setNoteInput}
          onSetAction={handleSetAction}
          actionSaving={actionSaving}
          approvalEvents={approvalEvents}
          onRequestFix={(email, note) => postApprovalAction("request-fix", { assignee_email: email, note })}
          onApprove={note => postApprovalAction("approve", { note })}
          onReject={note => postApprovalAction("reject", { note })}
          approvalSaving={approvalSaving}
        />
      )}
    </main>
  );
}
