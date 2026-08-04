"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ApprovalEvent, AuthMe, Finding, FixGuidance } from "@/types";
import { FindingsTable } from "@/components/scans/FindingsTable";
import { FindingDetail } from "@/components/scans/FindingDetail";
import TopbarActions from "@/components/app/TopbarActions";
import { severityTone } from "@/lib/ui";

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

const SEV_LABEL: Record<(typeof SEVERITIES)[number], string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const CSV_COLUMNS = ["severity", "status", "check_id", "title", "resource_id", "service", "customer_name", "account_name", "resolution"] as const;

function toCsv(rows: Finding[]) {
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = CSV_COLUMNS.join(",");
  const body = rows.map(r => CSV_COLUMNS.map(c => escape(r[c])).join(",")).join("\n");
  return `${header}\n${body}`;
}

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

  /** Download the currently filtered rows — what you see is what you export. */
  function exportCsv() {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vigilicloud-findings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasActiveFilters = search || severityFilter !== "ALL" || serviceFilter !== "ALL" || statusFilter !== "ALL";
  const failCount = findings.filter(f => f.status === "FAIL").length;
  const passCount = findings.filter(f => f.status === "PASS").length;

  return (
    <>
      <TopbarActions>
        <button type="button" className="vc-btn" onClick={exportCsv} disabled={filtered.length === 0}>
          Export CSV
        </button>
        <button type="button" className="vc-btn-primary" onClick={loadFindings} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </TopbarActions>

      <div className="vc-page-head">
        <div>
          <h1 className="vc-h1">Findings</h1>
          <p className="vc-sub">
            {failCount} open across every connected account · {passCount} check
            {passCount === 1 ? "" : "s"} passing
          </p>
        </div>
        <span className="text-[12.5px] text-[var(--vc-muted)]">
          Showing <span className="font-semibold text-[var(--vc-text)]">{filtered.length}</span> of {total}
          {hasActiveFilters ? " · filtered" : ""}
        </span>
      </div>

      {error && <div className="vc-note vc-note-error">{error}</div>}
      {message && !error && <div className="vc-note vc-note-success">{message}</div>}

      {/* ── Severity tiles — each one filters the table ─────────────────── */}
      <div className="vc-grid vc-grid-4">
        {SEVERITIES.map(sev => {
          const tone = severityTone(sev);
          const count = severityCounts[sev] || 0;
          const pct = sevTotal > 0 ? Math.round((count / sevTotal) * 100) : 0;
          const active = severityFilter === sev;
          return (
            <button
              key={sev}
              type="button"
              aria-pressed={active}
              onClick={() => setSeverityFilter(active ? "ALL" : sev)}
              className={`vc-card text-left ${tone}`}
              style={active ? { borderColor: "currentColor", borderWidth: 1.5 } : undefined}
            >
              <div className={`vc-stat-label ${active ? "!text-current" : ""}`}>{SEV_LABEL[sev]}</div>
              <div className={`vc-stat ${count > 0 ? "" : "!text-[var(--vc-faint)]"}`}>{count}</div>
              <div className="vc-meter vc-meter-thin mt-3">
                <i style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2 text-[11.5px] text-[var(--vc-muted)]">
                {active ? "Filtering · click to clear" : `${pct}% of open findings`}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Filter row ─────────────────────────────────────────────────── */}
      <div className="vc-filters">
        <label className="vc-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vc-dim)" strokeWidth={1.8} strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search title, check ID, resource, account"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </label>

        {severityFilter !== "ALL" && (
          <button
            type="button"
            className={`vc-chip is-on ${severityTone(severityFilter)} !bg-[color-mix(in_srgb,currentColor_16%,transparent)]`}
            onClick={() => setSeverityFilter("ALL")}
          >
            {SEV_LABEL[severityFilter as (typeof SEVERITIES)[number]] ?? severityFilter} ✕
          </button>
        )}

        <select aria-label="Service" className="vc-chip" value={serviceFilter} onChange={e => setServiceFilter(e.target.value)}>
          <option value="ALL">All services</option>
          {services.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select aria-label="Status" className="vc-chip" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="ALL">All states</option>
          <option value="FAIL">Open</option>
          <option value="PASS">Passing</option>
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            className="vc-link px-2"
            onClick={() => { setSearch(""); setSeverityFilter("ALL"); setServiceFilter("ALL"); setStatusFilter("ALL"); }}
          >
            Clear
          </button>
        )}
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
    </>
  );
}
