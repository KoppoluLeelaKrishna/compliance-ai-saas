"use client";

import { useEffect, useMemo, useState } from "react";
import { api, API_BASE } from "@/lib/api";
import {
  Account,
  ActionRow,
  ActionsResponse,
  ApprovalEvent,
  BillingMe,
  DriftSummary,
  Finding,
  FindingsResponse,
  FixGuidance,
  ScanItem,
} from "@/types";
import { Card } from "@/components/ui/Card";
import { FindingsTable } from "@/components/scans/FindingsTable";
import { FindingDetail } from "@/components/scans/FindingDetail";
import { ScanFilters } from "@/components/scans/ScanFilters";

export default function ScansPage() {
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedScanId, setSelectedScanId] = useState<string>("");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingScans, setLoadingScans] = useState(false);
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [running, setRunning] = useState(false);

  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [resolutionFilter, setResolutionFilter] = useState("ALL");

  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [fixGuidance, setFixGuidance] = useState<FixGuidance | null>(null);
  const [loadingGuidance, setLoadingGuidance] = useState(false);

  const [noteInput, setNoteInput] = useState("");
  const [actionSaving, setActionSaving] = useState<"FIXED" | "IGNORED" | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [aiAnalysis, setAiAnalysis] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);

  const [questionnaire, setQuestionnaire] = useState("");
  const [questionnaireFramework, setQuestionnaireFramework] = useState<"soc2" | "iso27001" | "pci">("soc2");
  const [loadingQuestionnaire, setLoadingQuestionnaire] = useState(false);
  const [questionnaireCopied, setQuestionnaireCopied] = useState(false);

  const [drift, setDrift] = useState<DriftSummary | null>(null);
  const [driftFilter, setDriftFilter] = useState(false);

  const [approvalEvents, setApprovalEvents] = useState<ApprovalEvent[]>([]);
  const [approvalSaving, setApprovalSaving] = useState(false);

  async function loadInitialData() {
    setLoading(true);
    try {
      const [billingData, accountsData] = await Promise.all([
        api<BillingMe>("/billing/me"),
        api<{ accounts: Account[] }>("/accounts"),
      ]);
      setBilling(billingData);
      setAccounts(accountsData.accounts || []);
      await loadScans("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function loadScans(accountId?: string) {
    setLoadingScans(true);
    try {
      const query = accountId ? `?account_id=${accountId}` : "";
      const data = await api<{ scans: ScanItem[] }>(`/scans${query}`);
      const list = data.scans || [];
      setScans(list);

      if (list.length > 0) {
        const keepExisting = selectedScanId && list.some((s) => s.scan_id === selectedScanId);
        setSelectedScanId(keepExisting ? selectedScanId : list[0].scan_id);
      } else {
        setSelectedScanId("");
        setFindings([]);
      }
    } finally {
      setLoadingScans(false);
    }
  }

  async function loadFindings(scanId: string) {
    if (!scanId) return;
    setLoadingFindings(true);
    setDrift(null);
    try {
      const [findingsData, actionsData, driftData] = await Promise.all([
        api<FindingsResponse>(`/scans/${scanId}/findings`),
        api<ActionsResponse>(`/finding-actions/${scanId}`).catch(() => ({ scan_id: scanId, actions: [] })),
        api<DriftSummary>(`/scans/${scanId}/drift`).catch(() => null),
      ]);

      if (driftData) setDrift(driftData);

      const actionMap = new Map(
        (actionsData.actions || []).map((a) => [`${a.check_id}::${a.resource_id}`, a])
      );

      const enriched = (findingsData.findings || []).map((f) => {
        const key = `${f.check_id}::${f.resource_id}`;
        const action = actionMap.get(key);
        const driftStatus = driftData?.drift_map?.[key] ?? null;
        return {
          ...f,
          resolution: action?.resolution || f.resolution || "OPEN",
          note: action?.note || f.note || "",
          drift_status: driftStatus,
        };
      });

      setFindings(enriched);
      setActions(actionsData.actions || []);
    } finally {
      setLoadingFindings(false);
    }
  }

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedScanId) {
      loadFindings(selectedScanId);
    }
  }, [selectedScanId]);

  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        f.check_id.toLowerCase().includes(q) ||
        f.title.toLowerCase().includes(q) ||
        f.resource_id.toLowerCase().includes(q) ||
        f.service.toLowerCase().includes(q);

      const matchesService = serviceFilter === "ALL" || f.service === serviceFilter;
      const matchesSeverity = severityFilter === "ALL" || f.severity === severityFilter;
      const matchesResolution =
        resolutionFilter === "ALL" || (f.resolution || "OPEN") === resolutionFilter;
      const matchesDrift = !driftFilter || f.drift_status === "NEW";

      return matchesSearch && matchesService && matchesSeverity && matchesResolution && matchesDrift;
    });
  }, [findings, search, serviceFilter, severityFilter, resolutionFilter, driftFilter]);

  const services = useMemo(() => Array.from(new Set(findings.map((f) => f.service))).sort(), [findings]);
  const severities = useMemo(() => Array.from(new Set(findings.map((f) => f.severity))).sort(), [findings]);

  async function handleAccountChange(id: string) {
    setSelectedAccountId(id);
    await loadScans(id);
  }

  async function handleRunScan() {
    setRunning(true);
    setError("");
    setMessage("");
    try {
      const payload: { account_id?: number } = {};
      if (selectedAccountId) payload.account_id = Number(selectedAccountId);
      
      const data = await api<{ scan_id: string; count: number }>("/scans/run", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setMessage(`Scan completed with ${data.count} findings.`);
      await loadScans(selectedAccountId);
      if (data.scan_id) setSelectedScanId(data.scan_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run scan");
    } finally {
      setRunning(false);
    }
  }

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
        setSelectedFinding((f) => f ? { ...f, approval_status: latest.event_type } : f);
      }
    } finally {
      setLoadingGuidance(false);
    }
  }

  async function handleSetAction(action: "FIXED" | "IGNORED") {
    if (!selectedFinding || !selectedScanId) return;
    setActionSaving(action);
    try {
      await api(
        `/finding-actions/${selectedScanId}/${encodeURIComponent(
          selectedFinding.check_id
        )}?resource_id=${encodeURIComponent(selectedFinding.resource_id)}`,
        {
          method: "POST",
          body: JSON.stringify({ action, note: noteInput }),
        }
      );
      setMessage(`Marked as ${action.toLowerCase()}.`);
      await loadFindings(selectedScanId);
      // Close detail after saving? Or keep open? Let's refresh finding in place.
      const updated = findings.find(f => f.check_id === selectedFinding.check_id && f.resource_id === selectedFinding.resource_id);
      if (updated) setSelectedFinding({...updated, resolution: action, note: noteInput});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save action");
    } finally {
      setActionSaving(null);
    }
  }

  async function postApprovalAction(endpoint: string, body: object) {
    if (!selectedFinding || !selectedScanId) return;
    setApprovalSaving(true);
    try {
      const params = new URLSearchParams({
        check_id: selectedFinding.check_id,
        resource_id: selectedFinding.resource_id,
      });
      await api(`/scans/${selectedScanId}/approvals/${endpoint}?${params}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const approvalsData = await api<{ events: ApprovalEvent[] }>(
        `/scans/${selectedScanId}/approvals?check_id=${encodeURIComponent(selectedFinding.check_id)}&resource_id=${encodeURIComponent(selectedFinding.resource_id)}`
      );
      const events = approvalsData.events || [];
      setApprovalEvents(events);
      if (events.length) {
        const latest = events[events.length - 1];
        setSelectedFinding((f) => f ? { ...f, approval_status: latest.event_type } : f);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval action failed");
    } finally {
      setApprovalSaving(false);
    }
  }

  async function handleRequestFix(assigneeEmail: string, note: string) {
    await postApprovalAction("request-fix", { assignee_email: assigneeEmail, note });
  }

  async function handleApprove(note: string) {
    await postApprovalAction("approve", { note });
  }

  async function handleReject(note: string) {
    await postApprovalAction("reject", { note });
  }

  async function handleAiAnalysis() {
    if (!selectedScanId || loadingAi) return;
    setLoadingAi(true);
    setAiAnalysis("");
    setError("");
    try {
      const data = await api<{ analysis: string }>(`/scans/${selectedScanId}/ai-analysis`, { method: "POST" });
      setAiAnalysis(data.analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI analysis failed");
    } finally {
      setLoadingAi(false);
    }
  }

  async function handleGenerateQuestionnaire() {
    if (!selectedScanId || loadingQuestionnaire) return;
    setLoadingQuestionnaire(true);
    setQuestionnaire("");
    setError("");
    try {
      const data = await api<{ questionnaire: string }>(
        `/scans/${selectedScanId}/questionnaire?framework=${questionnaireFramework}`,
        { method: "POST" }
      );
      setQuestionnaire(data.questionnaire);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Questionnaire generation failed");
    } finally {
      setLoadingQuestionnaire(false);
    }
  }

  function copyQuestionnaire() {
    navigator.clipboard.writeText(questionnaire);
    setQuestionnaireCopied(true);
    setTimeout(() => setQuestionnaireCopied(false), 1800);
  }

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    filteredFindings.forEach(f => {
      counts[f.severity] = (counts[f.severity] || 0) + 1;
    });
    return counts;
  }, [filteredFindings]);

  function renderFormattedText(text: string) {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={i} className="h-2" />;
      const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
      const isHeading = parts.length === 1 && trimmed.startsWith("**") && trimmed.endsWith("**");
      if (isHeading) {
        return (
          <div key={i} className="mt-4 mb-1 text-sm font-semibold text-white">
            {trimmed.slice(2, -2)}
          </div>
        );
      }
      return (
        <p key={i} className="text-sm leading-6 text-neutral-400">
          {parts.map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <span key={j} className="font-semibold text-neutral-200">{part.slice(2, -2)}</span>
            ) : part
          )}
        </p>
      );
    });
  }

  const SEV_CONFIG = {
    CRITICAL: { border: "border-red-500/20", from: "from-red-500/[0.08]", text: "text-red-400", bar: "bg-red-500" },
    HIGH:     { border: "border-orange-500/20", from: "from-orange-500/[0.08]", text: "text-orange-400", bar: "bg-orange-500" },
    MEDIUM:   { border: "border-yellow-500/20", from: "from-yellow-500/[0.08]", text: "text-yellow-400", bar: "bg-yellow-500" },
    LOW:      { border: "border-blue-500/20", from: "from-blue-500/[0.08]", text: "text-blue-400", bar: "bg-blue-500" },
  } as const;

  const failCount = findings.filter(f => f.status === "FAIL").length;
  const passCount = findings.filter(f => f.status === "PASS").length;
  const sevTotal = Object.values(severityCounts).reduce((a, b) => a + b, 0);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <div className="text-sm text-neutral-500">Loading workspace…</div>
        </div>
      </div>
    );
  }

  return (
    <main className="space-y-5 pb-24">

      {/* ── Header card ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-white/[0.04] via-transparent to-emerald-500/[0.02] p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-emerald-500/[0.06] blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">

          {/* Title + stats */}
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10">
              <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 010 12c0 3.182 1.24 6.078 3.268 8.22" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Security Dashboard</h1>
              <p className="mt-0.5 text-sm text-neutral-500">AWS posture · compliance evidence · remediation tracking</p>
              {selectedScanId && !loadingFindings && (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="text-neutral-500">{findings.length} total findings</span>
                  <span className="font-medium text-red-400">{failCount} failing</span>
                  <span className="font-medium text-emerald-400">{passCount} passing</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2.5 sm:items-end">
            <div className="flex items-center divide-x divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03]">
              {[
                { label: "CSV", href: `${API_BASE}/scans/${selectedScanId}/export.csv` },
                { label: "PDF", href: `${API_BASE}/scans/${selectedScanId}/export.pdf` },
                { label: "JSON", href: `${API_BASE}/scans/${selectedScanId}/export.json` },
              ].map(({ label, href }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => window.open(href, "_blank")}
                  disabled={!selectedScanId}
                  className="px-3.5 py-2 text-xs font-medium text-neutral-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-40 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAiAnalysis}
                disabled={!selectedScanId || loadingAi}
                className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
              >
                {loadingAi ? "Analyzing…" : "✦ AI Analysis"}
              </button>
              <button
                type="button"
                onClick={handleRunScan}
                disabled={running}
                className="rounded-xl bg-emerald-500 px-5 py-2 text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-50 transition-all active:scale-95"
              >
                {running ? "Scanning…" : "Run Scan"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Status message ─────────────────────────────────────────────── */}
      {(message || error) && (
        <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${
          error
            ? "border-red-500/20 bg-red-500/[0.07] text-red-300"
            : "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"
        }`}>
          <span className="mt-0.5 text-base">{error ? "✕" : "✓"}</span>
          <span>{error || message}</span>
        </div>
      )}

      {/* ── Severity tiles ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((sev) => {
          const cfg = SEV_CONFIG[sev];
          const count = severityCounts[sev] || 0;
          const pct = sevTotal > 0 ? Math.round((count / sevTotal) * 100) : 0;
          return (
            <div key={sev} className={`relative overflow-hidden rounded-2xl border ${cfg.border} bg-gradient-to-br ${cfg.from} to-transparent p-5`}>
              <div className="text-[10px] font-bold tracking-widest text-neutral-500">{sev}</div>
              <div className={`mt-1 text-4xl font-bold ${cfg.text}`}>{count}</div>
              <div className="mt-3 h-[2px] rounded-full bg-white/5">
                <div className={`h-[2px] rounded-full ${cfg.bar} transition-all duration-700`} style={{ '--w': `${pct}%`, width: 'var(--w)' } as React.CSSProperties} />
              </div>
              <div className="mt-1.5 text-[10px] text-neutral-600">{pct}% of findings</div>
            </div>
          );
        })}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <ScanFilters
        accounts={accounts}
        scans={scans}
        selectedAccountId={selectedAccountId}
        selectedScanId={selectedScanId}
        onAccountChange={handleAccountChange}
        onScanChange={setSelectedScanId}
        search={search}
        setSearch={setSearch}
        serviceFilter={serviceFilter}
        setServiceFilter={setServiceFilter}
        severityFilter={severityFilter}
        setSeverityFilter={setSeverityFilter}
        resolutionFilter={resolutionFilter}
        setResolutionFilter={setResolutionFilter}
        services={services}
        severities={severities}
        onClearFilters={() => {
          setSearch("");
          setServiceFilter("ALL");
          setSeverityFilter("ALL");
          setResolutionFilter("ALL");
        }}
      />

      {/* ── AI Analysis ─────────────────────────────────────────────────── */}
      {aiAnalysis && (
        <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
              <span>✦</span><span>AI Security Analysis</span>
            </div>
            <button type="button" onClick={() => setAiAnalysis("")} className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors">
              Dismiss
            </button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-300">{aiAnalysis}</p>
        </div>
      )}

      {/* ── Security Questionnaire ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-violet-300">
              <span>◈</span><span>Security Questionnaire Autofill</span>
            </div>
            <p className="mt-0.5 text-xs text-neutral-600">AI generates audit-ready answers from your scan evidence.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center divide-x divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03]">
              {(["soc2", "iso27001", "pci"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => { setQuestionnaireFramework(f); setQuestionnaire(""); }}
                  className={`px-3.5 py-2 text-xs font-semibold transition-colors ${
                    questionnaireFramework === f
                      ? "bg-violet-500/20 text-violet-300"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {f === "soc2" ? "SOC 2" : f === "iso27001" ? "ISO 27001" : "PCI DSS"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleGenerateQuestionnaire}
              disabled={!selectedScanId || loadingQuestionnaire}
              className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 disabled:opacity-40 transition-colors"
            >
              {loadingQuestionnaire ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>

        {questionnaire && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-neutral-600">Ready to paste into your questionnaire</span>
              <button
                type="button"
                onClick={copyQuestionnaire}
                className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-1 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
              >
                {questionnaireCopied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-xl border border-white/[0.06] bg-black/30 p-5">
              {renderFormattedText(questionnaire)}
            </div>
          </div>
        )}
      </div>

      {/* ── Drift banner ─────────────────────────────────────────────────── */}
      {drift && (
        <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium text-neutral-300">Drift since last scan</span>
            {drift.has_baseline ? (
              <>
                {drift.summary.new > 0 && (
                  <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-bold text-cyan-400">
                    +{drift.summary.new} NEW
                  </span>
                )}
                {drift.summary.remediated > 0 && (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
                    -{drift.summary.remediated} FIXED
                  </span>
                )}
                {drift.summary.new === 0 && drift.summary.remediated === 0 && (
                  <span className="text-xs text-neutral-600">No changes detected</span>
                )}
              </>
            ) : (
              <span className="text-xs text-neutral-600">No baseline — run another scan to enable drift tracking</span>
            )}
            {drift.previous_scan_date && (
              <span className="text-xs text-neutral-700">vs {new Date(drift.previous_scan_date).toLocaleDateString()}</span>
            )}
          </div>
          {drift.has_baseline && drift.summary.new > 0 && (
            <button
              type="button"
              onClick={() => setDriftFilter((v) => !v)}
              className={`shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                driftFilter
                  ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300"
                  : "border-white/[0.07] text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {driftFilter ? "Show all" : "New issues only"}
            </button>
          )}
        </div>
      )}

      {/* ── Findings table ───────────────────────────────────────────────── */}
      <FindingsTable findings={filteredFindings} onOpenFinding={openFinding} loading={loadingFindings} />

      {/* ── Finding detail panel ─────────────────────────────────────────── */}
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
          onRequestFix={handleRequestFix}
          onApprove={handleApprove}
          onReject={handleReject}
          approvalSaving={approvalSaving}
        />
      )}
    </main>
  );
}
