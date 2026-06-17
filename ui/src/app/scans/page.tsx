"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  IacSnippets,
  ScanHistoryItem,
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

  const [iac, setIac] = useState<IacSnippets | null>(null);
  const [iacTool, setIacTool] = useState<"terraform" | "cdk">("terraform");
  const [loadingIac, setLoadingIac] = useState(false);
  const [iacCopied, setIacCopied] = useState(false);

  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [approvalEvents, setApprovalEvents] = useState<ApprovalEvent[]>([]);
  const [approvalSaving, setApprovalSaving] = useState(false);

  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleIntervalHours, setScheduleIntervalHours] = useState(24);
  const [schedulePlanSupports, setSchedulePlanSupports] = useState(false);
  const [togglingSchedule, setTogglingSchedule] = useState(false);
  const [scanSummary, setScanSummary] = useState<{ total: number; newCount: number; critical: number } | null>(null);
  const [hoveredSev, setHoveredSev] = useState<string | null>(null);

  const findingsRef = useRef<HTMLDivElement>(null);

  async function loadScheduleSettings() {
    try {
      const data = await api<{ enabled: boolean; interval_hours: number; plan_supports: boolean }>("/settings/scan-schedule");
      setScheduleEnabled(data.enabled);
      setScheduleIntervalHours(data.interval_hours);
      setSchedulePlanSupports(data.plan_supports);
    } catch { /* ignore */ }
  }

  async function loadInitialData() {
    setLoading(true);
    try {
      const [billingData, accountsData] = await Promise.all([
        api<BillingMe>("/billing/me"),
        api<{ accounts: Account[] }>("/accounts"),
      ]);
      setBilling(billingData);
      setAccounts(accountsData.accounts || []);
      await Promise.all([loadScans(""), loadScheduleSettings()]);
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
      setIac(null);
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
    setIac(null);
    setScanHistory([]);
    await Promise.all([loadScans(id), loadScanHistory(id)]);
  }

  async function handleRunScan() {
    setRunning(true);
    setError("");
    setMessage("Scan started — running in background...");
    setScanSummary(null);
    try {
      const payload: { account_id?: number } = {};
      if (selectedAccountId) payload.account_id = Number(selectedAccountId);

      // POST returns immediately with scan_id and status PENDING
      const data = await api<{ scan_id: string; count: number }>("/scans/run", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!data.scan_id) {
        setError("Scan did not return a scan ID");
        return;
      }

      setSelectedScanId(data.scan_id);
      await loadScans(selectedAccountId);

      // Poll /scans/{scan_id}/status until COMPLETED or FAILED
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes at 5s intervals
      const poll = async (): Promise<void> => {
        if (attempts++ >= maxAttempts) {
          setMessage("Scan is still running — check back shortly.");
          setRunning(false);
          return;
        }
        try {
          const status = await api<{ scan_id: string; status: string; count: number }>(
            `/scans/${data.scan_id}/status`
          );
          if (status.status === "COMPLETED") {
            const [findingsData, driftData] = await Promise.all([
              api<FindingsResponse>(`/scans/${data.scan_id}/findings`).catch(() => ({ findings: [] as Finding[] })),
              api<DriftSummary>(`/scans/${data.scan_id}/drift`).catch(() => null),
            ]);
            const allFindings = (findingsData.findings || []) as Finding[];
            const newCount = driftData?.summary?.new ?? 0;
            const critical = allFindings.filter((f) => f.severity === "CRITICAL" && f.status === "FAIL").length;
            setScanSummary({ total: status.count, newCount, critical });
            setMessage("");
            await loadScans(selectedAccountId);
            setRunning(false);
          } else if (status.status === "FAILED") {
            setError("Scan failed. Check your AWS credentials and try again.");
            setMessage("");
            setRunning(false);
          } else {
            setTimeout(poll, 5000);
          }
        } catch {
          setTimeout(poll, 5000);
        }
      };
      setTimeout(poll, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run scan");
      setRunning(false);
    }
  }

  async function handleToggleSchedule() {
    setTogglingSchedule(true);
    try {
      const data = await api<{ enabled: boolean }>("/settings/scan-schedule", {
        method: "PUT",
        body: JSON.stringify({ enabled: !scheduleEnabled }),
      });
      setScheduleEnabled(data.enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update auto-scan schedule");
    } finally {
      setTogglingSchedule(false);
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

  async function handleGenerateIac() {
    if (!selectedScanId || loadingIac) return;
    setLoadingIac(true);
    setIac(null);
    setError("");
    try {
      const data = await api<IacSnippets>(
        `/scans/${selectedScanId}/iac-snippets?tool=${iacTool}`,
        { method: "POST" }
      );
      setIac(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "IaC generation failed");
    } finally {
      setLoadingIac(false);
    }
  }

  function copyIac() {
    if (iac) {
      navigator.clipboard.writeText(iac.snippets);
      setIacCopied(true);
      setTimeout(() => setIacCopied(false), 1800);
    }
  }

  async function loadScanHistory(accountId: string) {
    if (!accountId) { setScanHistory([]); return; }
    setLoadingHistory(true);
    try {
      const data = await api<{ scans: ScanHistoryItem[] }>(`/scans/history?account_id=${accountId}`);
      setScanHistory(data.scans || []);
    } catch {
      setScanHistory([]);
    } finally {
      setLoadingHistory(false);
    }
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

  const nextScanTime = useMemo(() => {
    if (!scheduleEnabled || scans.length === 0) return null;
    const lastScan = scans[0];
    const nextMs = new Date(lastScan.created_at).getTime() + scheduleIntervalHours * 3_600_000;
    const diffMs = nextMs - Date.now();
    if (diffMs <= 0) return "Due now";
    const diffH = Math.round(diffMs / 3_600_000);
    if (diffH < 1) return "< 1h";
    if (diffH < 24) return `~${diffH}h`;
    return `~${Math.round(diffH / 24)}d`;
  }, [scheduleEnabled, scans, scheduleIntervalHours]);

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
                {running ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 animate-spin rounded-full border border-black border-t-transparent" />
                    Scanning…
                  </span>
                ) : "Run Scan"}
              </button>
            </div>

            {/* Auto-scan toggle */}
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-neutral-300">Daily Auto-Scan</div>
                <div className="text-[10px] text-neutral-600 mt-0.5">
                  {schedulePlanSupports
                    ? scheduleEnabled
                      ? nextScanTime
                        ? `Every ${scheduleIntervalHours}h · Next: ${nextScanTime}`
                        : `Runs every ${scheduleIntervalHours}h`
                      : "Automatic scanning disabled"
                    : "Upgrade plan to enable"}
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleSchedule}
                disabled={togglingSchedule || !schedulePlanSupports}
                title={!schedulePlanSupports ? "Requires a paid plan" : scheduleEnabled ? "Disable daily auto-scan" : "Enable daily auto-scan"}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40 ${
                  scheduleEnabled ? "bg-emerald-500" : "bg-white/[0.12]"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    scheduleEnabled ? "translate-x-[18px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Error message ───────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.07] p-4 text-sm text-red-300">
          <span className="mt-0.5 text-base">✕</span>
          <span>{error}</span>
        </div>
      )}

      {/* ── Post-scan summary ────────────────────────────────────────────── */}
      {scanSummary && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Scan complete
            </div>
            <button type="button" onClick={() => setScanSummary(null)} className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors">
              Dismiss
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-center">
              <div className="text-3xl font-bold text-neutral-200">{scanSummary.total}</div>
              <div className="mt-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wider">Total Findings</div>
            </div>
            <div className={`rounded-xl border p-3 text-center ${scanSummary.newCount > 0 ? "border-cyan-500/25 bg-cyan-500/[0.06]" : "border-white/[0.07] bg-white/[0.02]"}`}>
              <div className={`text-3xl font-bold ${scanSummary.newCount > 0 ? "text-cyan-400" : "text-neutral-600"}`}>
                {scanSummary.newCount > 0 ? `+${scanSummary.newCount}` : "0"}
              </div>
              <div className="mt-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wider">New Issues</div>
            </div>
            <div className={`rounded-xl border p-3 text-center ${scanSummary.critical > 0 ? "border-red-500/25 bg-red-500/[0.06]" : "border-emerald-500/20 bg-emerald-500/[0.04]"}`}>
              <div className={`text-3xl font-bold ${scanSummary.critical > 0 ? "text-red-400" : "text-emerald-400"}`}>
                {scanSummary.critical}
              </div>
              <div className="mt-1 text-[10px] font-medium text-neutral-600 uppercase tracking-wider">Criticals</div>
            </div>
          </div>
          {scanSummary.critical > 0 && (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-2.5">
              <svg className="h-4 w-4 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span className="flex-1 text-xs font-semibold text-red-300">
                {scanSummary.critical} critical finding{scanSummary.critical !== 1 ? "s" : ""} — immediate remediation required
              </span>
              <button
                type="button"
                onClick={() => { setSeverityFilter("CRITICAL"); setScanSummary(null); setTimeout(() => findingsRef.current?.scrollIntoView({ behavior: "smooth" }), 100); }}
                className="shrink-0 rounded-lg border border-red-500/25 px-3 py-1 text-[11px] font-bold text-red-300 hover:bg-red-500/10 transition-colors"
              >
                View →
              </button>
            </div>
          )}
          {scanSummary.newCount > 0 && (
            <button
              type="button"
              onClick={() => { setDriftFilter(true); setScanSummary(null); }}
              className="mt-2 w-full rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] py-2 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/[0.08] transition-colors"
            >
              Show {scanSummary.newCount} new issue{scanSummary.newCount !== 1 ? "s" : ""} →
            </button>
          )}
        </div>
      )}

      {/* ── Critical alert banner ────────────────────────────────────────── */}
      {!scanSummary && severityCounts.CRITICAL > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-5 py-3.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/15">
            <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-red-300">
              {severityCounts.CRITICAL} Critical Finding{severityCounts.CRITICAL !== 1 ? "s" : ""} — Immediate Attention Required
            </div>
            <div className="mt-0.5 text-xs text-red-400/60">
              Critical misconfigurations expose your infrastructure to active threats.
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setSeverityFilter("CRITICAL"); setTimeout(() => findingsRef.current?.scrollIntoView({ behavior: "smooth" }), 100); }}
            className="shrink-0 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20 transition-colors"
          >
            View Criticals
          </button>
        </div>
      )}

      {/* ── Severity pie chart ─────────────────────────────────────────── */}
      {(() => {
        const SEV_COLORS: Record<string, string> = { CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#eab308", LOW: "#3b82f6" };
        const ALL_SEVS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
        const r = 80; const cx = 110; const cy = 110; const stroke = 28;
        const circumference = 2 * Math.PI * r;
        let offset = 0;
        const slices = ALL_SEVS.map((sev) => {
          const count = severityCounts[sev] || 0;
          const pct = sevTotal > 0 ? count / sevTotal : 0;
          const dash = pct * circumference;
          const gap = circumference - dash;
          const sl = { sev, count, pct, dash, gap, offset, color: SEV_COLORS[sev] };
          offset += dash;
          return sl;
        });
        const activeSlices = slices.filter(s => s.count > 0);
        const display = hoveredSev
          ? (slices.find(s => s.sev === hoveredSev) ?? activeSlices[0])
          : activeSlices.length > 0 ? activeSlices.reduce((a, b) => a.count > b.count ? a : b) : null;

        return (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
            <div className="mb-4 text-sm font-semibold text-neutral-300">Findings by Severity</div>
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">

              {/* Big donut */}
              <div className="shrink-0">
                {sevTotal === 0 ? (
                  <div className="flex h-[220px] w-[220px] items-center justify-center rounded-full border border-white/[0.06] text-xs text-neutral-600">No findings</div>
                ) : (
                  <svg width={220} height={220} viewBox="0 0 220 220" style={{ overflow: "visible" }}>
                    {slices.map((s) => {
                      if (s.count === 0) return null;
                      const isHov = hoveredSev === s.sev;
                      const isActive = severityFilter === s.sev;
                      const sw = isHov ? stroke + 10 : isActive ? stroke + 5 : stroke;
                      const op = hoveredSev && !isHov ? 0.2 : isActive ? 1 : 0.85;
                      const sc = isHov ? 1.06 : 1;
                      return (
                        <circle
                          key={s.sev}
                          cx={cx} cy={cy} r={r}
                          fill="none"
                          stroke={s.color}
                          strokeWidth={sw}
                          strokeDasharray={`${s.dash} ${s.gap}`}
                          strokeDashoffset={-s.offset + circumference * 0.25}
                          strokeLinecap="butt"
                          style={{ opacity: op, cursor: "pointer", transition: "stroke-width 0.2s ease, opacity 0.2s ease, transform 0.2s ease", transformOrigin: `${cx}px ${cy}px`, transform: `scale(${sc})` }}
                          onMouseEnter={() => setHoveredSev(s.sev)}
                          onMouseLeave={() => setHoveredSev(null)}
                          onClick={() => { setSeverityFilter(severityFilter === s.sev ? "ALL" : s.sev); setTimeout(() => findingsRef.current?.scrollIntoView({ behavior: "smooth" }), 100); }}
                        />
                      );
                    })}
                    {display && (
                      <>
                        <text x={cx} y={cy - 14} textAnchor="middle" fill={display.color} fontSize={36} fontWeight={800} style={{ transition: "fill 0.2s" }}>{display.count}</text>
                        <text x={cx} y={cy + 12} textAnchor="middle" fill={display.color} fontSize={11} fontWeight={700} letterSpacing={2} style={{ transition: "fill 0.2s" }}>{display.sev}</text>
                        <text x={cx} y={cy + 30} textAnchor="middle" fill="#6b7280" fontSize={11}>{Math.round(display.pct * 100)}% of findings</text>
                      </>
                    )}
                  </svg>
                )}
              </div>

              {/* Legend */}
              <div className="flex flex-1 flex-col gap-3 w-full">
                {ALL_SEVS.map((sev) => {
                  const count = severityCounts[sev] || 0;
                  const pct = sevTotal > 0 ? Math.round((count / sevTotal) * 100) : 0;
                  const color = SEV_COLORS[sev];
                  const isActive = severityFilter === sev;
                  const isHov = hoveredSev === sev;
                  return (
                    <button
                      key={sev}
                      type="button"
                      onMouseEnter={() => setHoveredSev(sev)}
                      onMouseLeave={() => setHoveredSev(null)}
                      onClick={() => { setSeverityFilter(isActive ? "ALL" : sev); setTimeout(() => findingsRef.current?.scrollIntoView({ behavior: "smooth" }), 100); }}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-all ${isActive ? "border-white/20 bg-white/[0.06]" : "border-white/[0.05] hover:border-white/10 hover:bg-white/[0.03]"}`}
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full transition-transform" style={{ background: color, transform: isHov ? "scale(1.4)" : "scale(1)" }} />
                      <span className="flex-1 text-xs font-semibold text-neutral-400">{sev}</span>
                      <span className="text-lg font-bold" style={{ color: count > 0 ? color : "#374151" }}>{count}</span>
                      <span className="w-10 text-right text-[11px] text-neutral-600">{pct}%</span>
                    </button>
                  );
                })}
                <div className="mt-1 text-[11px] text-neutral-600">{sevTotal} total findings · click any row or arc to filter</div>
              </div>
            </div>
          </div>
        );
      })()}

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
          <div className="space-y-1 text-sm leading-7 text-neutral-300">
            {aiAnalysis.split("\n").map((line, i) => {
              const isHeader = /^[A-Z][A-Z\s]{3,}$/.test(line.trim()) && line.trim().length < 40;
              return isHeader
                ? <p key={i} className="mt-3 font-bold text-emerald-400 tracking-wide text-xs uppercase">{line}</p>
                : <p key={i} className={line.trim() === "" ? "mt-1" : ""}>{line}</p>;
            })}
          </div>
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

      {/* ── IaC Fix Snippets ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-orange-300">
              <span>⬡</span><span>IaC Fix Snippets</span>
            </div>
            <p className="mt-0.5 text-xs text-neutral-600">AI generates Terraform or CDK code to fix every failing control.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center divide-x divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03]">
              {(["terraform", "cdk"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setIacTool(t); setIac(null); }}
                  className={`px-3.5 py-2 text-xs font-semibold transition-colors ${
                    iacTool === t ? "bg-orange-500/20 text-orange-300" : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {t === "terraform" ? "Terraform" : "CDK (Python)"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleGenerateIac}
              disabled={!selectedScanId || loadingIac}
              className="rounded-xl border border-orange-500/25 bg-orange-500/10 px-4 py-2 text-xs font-semibold text-orange-300 hover:bg-orange-500/20 disabled:opacity-40 transition-colors"
            >
              {loadingIac ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>

        {iac && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-neutral-600">{iac.findings_count} failing control{iac.findings_count !== 1 ? "s" : ""} · {iac.tool}</span>
              <button
                type="button"
                onClick={copyIac}
                className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-1 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
              >
                {iacCopied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-xl border border-white/[0.06] bg-black/30 p-5">
              {iac.snippets.split("\n").map((line, i) => {
                const isHeader = line.startsWith("FINDING:");
                const isSep = line.trim() === "---";
                if (isSep) return <div key={i} className="my-3 border-t border-white/[0.06]" />;
                return isHeader
                  ? <p key={i} className="mt-2 mb-1 text-xs font-bold text-orange-300 uppercase tracking-wide">{line}</p>
                  : <p key={i} className={`font-mono text-xs ${line.trim() === "" ? "h-2" : "text-neutral-300"}`}>{line}</p>;
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Scan Timeline ────────────────────────────────────────────────── */}
      {selectedAccountId && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold text-neutral-300">Scan History</div>
            {loadingHistory && <span className="text-xs text-neutral-600">Loading…</span>}
          </div>
          {scanHistory.length === 0 && !loadingHistory ? (
            <p className="text-xs text-neutral-600">Run more scans to see the history timeline.</p>
          ) : (
            <div className="flex items-end gap-2 overflow-x-auto pb-1">
              {[...scanHistory].reverse().map((s) => {
                const barPct = s.total > 0 ? Math.min(100, Math.round((s.fail / s.total) * 100)) : 0;
                const barH = barPct === 0 ? "h-2" : barPct <= 25 ? "h-4" : barPct <= 50 ? "h-8" : barPct <= 75 ? "h-12" : "h-16";
                const isSelected = s.scan_id === selectedScanId;
                const hasCritical = s.critical > 0;
                return (
                  <button
                    key={s.scan_id}
                    type="button"
                    title={`${new Date(s.created_at).toLocaleDateString()} — ${s.fail} fail / ${s.total} total`}
                    onClick={() => setSelectedScanId(s.scan_id)}
                    className={`group flex flex-col items-center gap-1.5 rounded-xl border px-2.5 py-2 transition-colors ${
                      isSelected
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex h-16 w-6 items-end">
                      <div
                        className={`w-full rounded-t ${barH} ${hasCritical ? "bg-red-500/70" : s.fail > 0 ? "bg-yellow-500/60" : "bg-emerald-500/60"}`}
                      />
                    </div>
                    <span className="text-[9px] text-neutral-600 group-hover:text-neutral-400">
                      {new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                    {s.critical > 0 && (
                      <span className="text-[9px] font-bold text-red-400">{s.critical}C</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-3 flex items-center gap-4 text-[10px] text-neutral-600">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-red-500/70" /> Critical fails</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-yellow-500/60" /> Other fails</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500/60" /> All passing</span>
          </div>
        </div>
      )}

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
      <div ref={findingsRef}>
        <FindingsTable findings={filteredFindings} onOpenFinding={openFinding} loading={loadingFindings} search={search} />
      </div>

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
