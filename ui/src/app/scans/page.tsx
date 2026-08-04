"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, API_BASE } from "@/lib/api";
import {
  Account,
  ActionRow,
  ActionsResponse,
  ApprovalEvent,
  BillingMe,
  ComplianceCoverage,
  DriftSummary,
  Finding,
  FindingsResponse,
  FixGuidance,
  IacSnippets,
  RiskScore,
  ScanHistoryItem,
  ScanItem,
} from "@/types";
import { FindingsTable } from "@/components/scans/FindingsTable";
import { FindingDetail } from "@/components/scans/FindingDetail";
import { ScanFilters } from "@/components/scans/ScanFilters";
import TopbarActions from "@/components/app/TopbarActions";
import { scanTime, severityTone } from "@/lib/ui";

/** Column track for the sweep-history table. */
const SCAN_COLS = "150px 1fr 130px 260px 110px 96px";

const COVERAGE_FRAMEWORKS: ["soc2" | "iso27001" | "pci_dss" | "nist", string][] = [
  ["soc2", "SOC 2"],
  ["iso27001", "ISO 27001"],
  ["pci_dss", "PCI DSS"],
  ["nist", "NIST CSF"],
];

function gradeTone(grade: string) {
  if (grade === "A") return "vc-ok";
  if (grade === "B") return "vc-sev-low";
  if (grade === "C") return "vc-sev-medium";
  if (grade === "D") return "vc-sev-high";
  return "vc-sev-critical";
}

function scanStatusTone(status: string) {
  if (status === "COMPLETED") return "vc-ok";
  if (status === "FAILED") return "vc-sev-critical";
  if (status === "RUNNING" || status === "PENDING") return "text-[var(--vc-accent-text)]";
  return "vc-neutral";
}

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

  const [riskScore, setRiskScore] = useState<RiskScore | null>(null);
  const [coverage, setCoverage] = useState<ComplianceCoverage | null>(null);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

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
      setRiskScore(null);
      setCoverage(null);
      setShareUrl("");
      loadFindings(selectedScanId);
      api<RiskScore>(`/scans/${selectedScanId}/risk-score`).then(setRiskScore).catch(() => {});
      api<ComplianceCoverage>(`/compliance/scans/${selectedScanId}/coverage`).then(setCoverage).catch(() => {});
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
            // Re-fetch risk score and coverage now that findings exist
            api<RiskScore>(`/scans/${data.scan_id}/risk-score`).then(setRiskScore).catch(() => {});
            api<ComplianceCoverage>(`/compliance/scans/${data.scan_id}/coverage`).then(setCoverage).catch(() => {});
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

  async function handleShareReport() {
    if (!selectedScanId || sharing) return;
    setSharing(true);
    setShareUrl("");
    try {
      const data = await api<{ url: string }>(`/scans/${selectedScanId}/share`, { method: "POST" });
      setShareUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create share link");
    } finally {
      setSharing(false);
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
        <p key={i} className="text-[13.5px] leading-[1.6] text-[var(--vc-muted)]">
          {parts.map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <span key={j} className="font-semibold text-[var(--vc-text)]">{part.slice(2, -2)}</span>
            ) : part
          )}
        </p>
      );
    });
  }


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

  /** Per-scan totals from the history endpoint, keyed by scan id. */
  const historyById = useMemo(
    () => new Map(scanHistory.map((h) => [h.scan_id, h])),
    [scanHistory],
  );

  const selectedScan = scans.find((s) => s.scan_id === selectedScanId) ?? null;

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <span className="vc-spinner !h-6 !w-6" />
        <div className="vc-sub">Loading workspace…</div>
      </div>
    );
  }

  return (
    <>
      <TopbarActions>
        <div className="vc-seg">
          {(["csv", "pdf", "json"] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              disabled={!selectedScanId}
              onClick={() => window.open(`${API_BASE}/scans/${selectedScanId}/export.${fmt}`, "_blank")}
            >
              {fmt.toUpperCase()}
            </button>
          ))}
        </div>
        <button type="button" className="vc-btn" onClick={handleShareReport} disabled={!selectedScanId || sharing}>
          {sharing ? "Sharing…" : "Share"}
        </button>
        <button type="button" className="vc-btn-primary" onClick={handleRunScan} disabled={running}>
          {running ? <><span className="vc-spinner !border-white/40 !border-t-white" /> Scanning…</> : "Run scan"}
        </button>
      </TopbarActions>

      <div className="vc-page-head">
        <div>
          <h1 className="vc-h1">Scans</h1>
          <p className="vc-sub">
            Every sweep across every connected account, with drift against the previous run.
          </p>
        </div>
        {riskScore && (
          <div className="flex items-center gap-3">
            <span className="vc-eyebrow">Posture</span>
            <span className={`vc-pill !px-3 !py-1.5 !text-sm ${gradeTone(riskScore.grade)}`}>
              {riskScore.grade} · {riskScore.score}/100
            </span>
          </div>
        )}
      </div>

      {error && <div className="vc-note vc-note-error">{error}</div>}
      {message && !error && <div className="vc-note vc-note-info">{message}</div>}

      {shareUrl && (
        <div className="vc-note vc-note-info items-center">
          <span className="vc-mono flex-1 truncate text-xs">{shareUrl}</span>
          <button
            type="button"
            className="vc-btn vc-btn-xs !text-[var(--vc-accent-text)]"
            onClick={() => { navigator.clipboard.writeText(shareUrl); setShareCopied(true); setTimeout(() => setShareCopied(false), 1800); }}
          >
            {shareCopied ? "Copied" : "Copy"}
          </button>
          <button type="button" className="vc-link" onClick={() => setShareUrl("")}>Dismiss</button>
        </div>
      )}

      {/* ── Post-scan summary ────────────────────────────────────────────── */}
      {scanSummary && (
        <div className="vc-card">
          <div className="mb-4 flex items-center justify-between">
            <div className="vc-card-title vc-ok">Scan complete</div>
            <button type="button" className="vc-link !text-[var(--vc-muted)]" onClick={() => setScanSummary(null)}>
              Dismiss
            </button>
          </div>
          <div className="vc-grid vc-grid-3">
            <div className="rounded-[14px] border border-[var(--vc-hairline)] p-4 text-center">
              <div className="vc-stat vc-stat-sm">{scanSummary.total}</div>
              <div className="vc-stat-label !mb-0 mt-1.5">Total findings</div>
            </div>
            <div className="rounded-[14px] border border-[var(--vc-hairline)] p-4 text-center">
              <div className={`vc-stat vc-stat-sm ${scanSummary.newCount > 0 ? "vc-sev-high" : "!text-[var(--vc-faint)]"}`}>
                {scanSummary.newCount > 0 ? `+${scanSummary.newCount}` : "0"}
              </div>
              <div className="vc-stat-label !mb-0 mt-1.5">New issues</div>
            </div>
            <div className="rounded-[14px] border border-[var(--vc-hairline)] p-4 text-center">
              <div className={`vc-stat vc-stat-sm ${scanSummary.critical > 0 ? "vc-sev-critical" : "vc-ok"}`}>
                {scanSummary.critical}
              </div>
              <div className="vc-stat-label !mb-0 mt-1.5">Criticals</div>
            </div>
          </div>
          {scanSummary.critical > 0 && (
            <div className="vc-note vc-note-error mt-3.5 items-center">
              <span className="flex-1 font-semibold">
                {scanSummary.critical} critical finding{scanSummary.critical !== 1 ? "s" : ""} — fix today
              </span>
              <button
                type="button"
                className="vc-btn vc-btn-xs !text-[var(--vc-critical)]"
                onClick={() => { setSeverityFilter("CRITICAL"); setScanSummary(null); setTimeout(() => findingsRef.current?.scrollIntoView({ behavior: "smooth" }), 100); }}
              >
                View
              </button>
            </div>
          )}
          {scanSummary.newCount > 0 && (
            <button
              type="button"
              className="vc-btn-secondary vc-btn-block mt-2.5"
              onClick={() => { setDriftFilter(true); setScanSummary(null); }}
            >
              Show {scanSummary.newCount} new issue{scanSummary.newCount !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {/* ── Critical banner ──────────────────────────────────────────────── */}
      {!scanSummary && severityCounts.CRITICAL > 0 && (
        <div className="vc-note vc-note-error items-center">
          <span className="vc-dot mt-1.5" />
          <div className="flex-1">
            <div className="font-semibold">
              {severityCounts.CRITICAL} critical finding{severityCounts.CRITICAL !== 1 ? "s" : ""} — immediate attention required
            </div>
            <div className="mt-0.5 text-[12.5px] opacity-70">
              Critical misconfigurations expose your infrastructure to active threats.
            </div>
          </div>
          <button
            type="button"
            className="vc-btn vc-btn-xs !text-[var(--vc-critical)]"
            onClick={() => { setSeverityFilter("CRITICAL"); setTimeout(() => findingsRef.current?.scrollIntoView({ behavior: "smooth" }), 100); }}
          >
            View criticals
          </button>
        </div>
      )}

      {/* ── Stat tiles ───────────────────────────────────────────────────── */}
      <div className="vc-grid vc-grid-3">
        <div className="vc-card">
          <div className="vc-stat-label">Scans recorded</div>
          <div className="vc-stat vc-stat-sm">{scans.length}</div>
          <div className="vc-stat-note">
            {selectedAccountId ? "For the selected account" : "Across every account"}
          </div>
        </div>
        <div className="vc-card">
          <div className="vc-stat-label">This scan</div>
          <div className="vc-stat vc-stat-sm">
            {loadingFindings ? "—" : `${failCount} open`}
          </div>
          <div className="vc-stat-note">{passCount} check{passCount === 1 ? "" : "s"} passing</div>
        </div>
        <div className="vc-card flex items-center justify-between gap-4">
          <div>
            <div className="vc-stat-label">Daily auto-scan</div>
            <div className="text-[15px] font-semibold tracking-[-0.3px] text-[var(--vc-text)]">
              {schedulePlanSupports ? (scheduleEnabled ? `On · every ${scheduleIntervalHours} hours` : "Off") : "Upgrade to enable"}
            </div>
            <div className="mt-1.5 text-[12.5px] text-[var(--vc-muted)]">
              {schedulePlanSupports && scheduleEnabled && nextScanTime ? `Next sweep in ${nextScanTime}` : "Automatic scanning disabled"}
            </div>
          </div>
          <button
            type="button"
            aria-label="Toggle daily auto-scan"
            aria-pressed={scheduleEnabled}
            title={!schedulePlanSupports ? "Requires a paid plan" : scheduleEnabled ? "Disable daily auto-scan" : "Enable daily auto-scan"}
            onClick={handleToggleSchedule}
            disabled={togglingSchedule || !schedulePlanSupports}
            className={`vc-toggle${scheduleEnabled ? " is-on" : ""} disabled:opacity-40`}
          />
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
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

      {/* ── Sweep history ────────────────────────────────────────────────── */}
      <div className="vc-card vc-card-flush">
        <div className="vc-thead" style={{ gridTemplateColumns: SCAN_COLS }}>
          <span>Scan</span>
          <span>Account</span>
          <span>Started</span>
          <span>Findings</span>
          <span>Drift</span>
          <span className="text-right">Status</span>
        </div>

        <div className="vc-scroll-rows">
        {loadingScans ? (
          <div className="p-5"><div className="vc-skel h-14 w-full" /></div>
        ) : scans.length === 0 ? (
          <div className="vc-empty">No scans yet — run your first sweep.</div>
        ) : (
          scans.map((s) => {
            const hist = historyById.get(s.scan_id);
            const isSelected = s.scan_id === selectedScanId;
            const status = (s.status || "").toUpperCase();
            const running_ = status === "RUNNING" || status === "PENDING";
            return (
              <div
                key={s.scan_id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedScanId(s.scan_id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedScanId(s.scan_id); } }}
                className={`vc-tr vc-tr-hover${isSelected ? " is-selected" : ""}`}
                style={{ gridTemplateColumns: SCAN_COLS }}
              >
                <span className="vc-mono truncate text-xs text-[var(--vc-accent-text)]">{s.scan_id}</span>
                <div className="min-w-0">
                  <div className="vc-cell-strong truncate">
                    {s.customer_name ? `${s.customer_name} · ${s.account_name ?? ""}` : s.account_name || "All accounts"}
                  </div>
                  <div className="vc-cell-sub">{s.region || "—"}</div>
                </div>
                <span className="vc-cell">{scanTime(s.created_at)}</span>

                {running_ ? (
                  <div className="flex items-center gap-2.5">
                    <span className="vc-spinner" />
                    <span className="text-[12.5px] text-[var(--vc-muted)]">Running checks…</span>
                  </div>
                ) : hist ? (
                  <div className="flex gap-1.5">
                    <span className={`vc-count ${hist.critical > 0 ? "vc-sev-critical" : "vc-count-zero"}`}>{hist.critical} C</span>
                    <span className={`vc-count ${hist.fail > 0 ? "vc-sev-high" : "vc-count-zero"}`}>{hist.fail} fail</span>
                    <span className="vc-count vc-neutral">{hist.total} total</span>
                  </div>
                ) : isSelected && !loadingFindings ? (
                  <div className="flex gap-1.5">
                    {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((sev) => {
                      const n = severityCounts[sev] || 0;
                      return (
                        <span key={sev} className={`vc-count ${n > 0 ? severityTone(sev) : "vc-count-zero"}`}>
                          {n} {sev[0]}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <span className="vc-cell !text-[var(--vc-dim)]">Select to load</span>
                )}

                <span className="text-[12.5px] font-semibold">
                  {isSelected && drift?.has_baseline ? (
                    drift.summary.new > 0 ? (
                      <span className="vc-sev-critical">+{drift.summary.new} new</span>
                    ) : drift.summary.remediated > 0 ? (
                      <span className="vc-ok">−{drift.summary.remediated} fixed</span>
                    ) : (
                      <span className="text-[var(--vc-dim)]">No change</span>
                    )
                  ) : (
                    <span className="text-[var(--vc-dim)]">—</span>
                  )}
                </span>

                <span className={`text-right text-xs font-semibold ${scanStatusTone(status)}`}>
                  {status ? status[0] + status.slice(1).toLowerCase() : "Unknown"}
                </span>
              </div>
            );
          })
        )}
        </div>
      </div>

      {/* ── Posture of the selected scan ─────────────────────────────────── */}
      <div className="vc-grid vc-split-aside">
        <div className="vc-card">
          <div className="vc-stat-label !mb-4">Findings by severity</div>
          {sevTotal === 0 ? (
            <div className="vc-empty !px-0">
              {loadingFindings ? "Loading findings…" : "No findings on this scan."}
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((sev) => {
                const count = severityCounts[sev] || 0;
                const pct = sevTotal > 0 ? Math.round((count / sevTotal) * 100) : 0;
                const active = severityFilter === sev;
                const tone = severityTone(sev);
                return (
                  <button
                    key={sev}
                    type="button"
                    aria-pressed={active}
                    onClick={() => { setSeverityFilter(active ? "ALL" : sev); setTimeout(() => findingsRef.current?.scrollIntoView({ behavior: "smooth" }), 100); }}
                    className={`text-left ${tone}`}
                  >
                    <div className="mb-2 flex items-baseline justify-between">
                      <span className={`text-[13.5px] font-semibold tracking-[-0.2px] ${active ? "" : "text-[var(--vc-text)]"}`}>
                        {sev[0] + sev.slice(1).toLowerCase()}
                      </span>
                      <span className={`text-[13px] font-semibold ${count > 0 ? "" : "text-[var(--vc-dim)]"}`}>{count}</span>
                    </div>
                    <div className="vc-meter"><i style={{ width: `${pct}%` }} /></div>
                    <div className="mt-1.5 text-[11.5px] text-[var(--vc-dim)]">
                      {active ? "Filtering · click to clear" : `${pct}% of this scan`}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="vc-card">
          <div className="vc-card-title">Compliance coverage</div>
          <div className="vc-card-sub mb-5">
            {coverage ? "Controls satisfied on this scan" : "Run a scan to map findings onto controls"}
          </div>
          <div className="vc-grid vc-grid-2">
            {COVERAGE_FRAMEWORKS.map(([key, label]) => {
              const fw = coverage?.coverage[key];
              const pct = fw?.pct ?? 0;
              const tone = !fw ? "text-[var(--vc-dim)]" : pct >= 80 ? "vc-ok" : pct >= 60 ? "vc-sev-high" : "vc-sev-critical";
              return (
                <div key={key}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-[13.5px] font-semibold tracking-[-0.2px] text-[var(--vc-text)]">{label}</span>
                    <span className={`text-[13px] font-semibold ${tone}`}>{fw ? `${pct}%` : "—"}</span>
                  </div>
                  <div className={`vc-meter ${fw ? tone : ""}`}><i style={{ width: `${pct}%` }} /></div>
                  <div className="mt-1.5 text-[11.5px] text-[var(--vc-dim)]">
                    {fw ? `${fw.passing} of ${fw.total_controls} controls` : "No data"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Drift ────────────────────────────────────────────────────────── */}
      {drift && (
        <div className="vc-card flex flex-wrap items-center gap-3">
          <span className="vc-card-title">Drift since last scan</span>
          {drift.has_baseline ? (
            <>
              {drift.summary.new > 0 && <span className="vc-pill vc-sev-critical">+{drift.summary.new} new</span>}
              {drift.summary.remediated > 0 && <span className="vc-pill vc-ok">−{drift.summary.remediated} fixed</span>}
              {drift.summary.new === 0 && drift.summary.remediated === 0 && (
                <span className="text-[12.5px] text-[var(--vc-muted)]">No changes detected</span>
              )}
            </>
          ) : (
            <span className="text-[12.5px] text-[var(--vc-muted)]">
              No baseline — run another scan to enable drift tracking
            </span>
          )}
          {drift.previous_scan_date && (
            <span className="text-[12.5px] text-[var(--vc-dim)]">
              vs {new Date(drift.previous_scan_date).toLocaleDateString()}
            </span>
          )}
          {drift.has_baseline && drift.summary.new > 0 && (
            <button
              type="button"
              onClick={() => setDriftFilter((v) => !v)}
              className={`vc-chip ml-auto${driftFilter ? " is-on" : ""}`}
            >
              {driftFilter ? "Show all" : "New issues only"}
            </button>
          )}
        </div>
      )}

      {/* ── AI analysis ──────────────────────────────────────────────────── */}
      <div className="vc-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="vc-card-title">AI security analysis</div>
            <div className="vc-card-sub">
              Claude reads the whole scan and tells you what to fix first, ranked by blast radius.
            </div>
          </div>
          <div className="flex items-center gap-2">
            {aiAnalysis && (
              <button type="button" className="vc-btn" onClick={() => setAiAnalysis("")}>Dismiss</button>
            )}
            <button type="button" className="vc-btn-primary" onClick={handleAiAnalysis} disabled={!selectedScanId || loadingAi}>
              {loadingAi ? "Analysing…" : "Ask Claude"}
            </button>
          </div>
        </div>

        {aiAnalysis && (
          <div className="mt-4 max-h-96 overflow-y-auto rounded-xl border border-[var(--vc-hairline)] bg-[var(--vc-inset)] p-5">
            {aiAnalysis.split("\n").map((line, i) => {
              const isHeader = /^[A-Z][A-Z\s]{3,}$/.test(line.trim()) && line.trim().length < 40;
              return isHeader ? (
                <p key={i} className="vc-eyebrow mt-4 mb-1.5 !text-[var(--vc-accent-text)]">{line}</p>
              ) : (
                <p key={i} className={`text-[13.5px] leading-[1.6] text-[var(--vc-text-2)] ${line.trim() === "" ? "h-2" : ""}`}>{line}</p>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Questionnaire + IaC ──────────────────────────────────────────── */}
      <div className="vc-grid vc-grid-2">
        <div className="vc-card flex flex-col">
          <div className="vc-card-title">Security questionnaire autofill</div>
          <div className="vc-card-sub mb-4">Audit-ready answers generated from this scan&rsquo;s evidence.</div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="vc-seg">
              {(["soc2", "iso27001", "pci"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={questionnaireFramework === f ? "is-on" : ""}
                  onClick={() => { setQuestionnaireFramework(f); setQuestionnaire(""); }}
                >
                  {f === "soc2" ? "SOC 2" : f === "iso27001" ? "ISO 27001" : "PCI DSS"}
                </button>
              ))}
            </div>
            <button type="button" className="vc-btn-secondary" onClick={handleGenerateQuestionnaire} disabled={!selectedScanId || loadingQuestionnaire}>
              {loadingQuestionnaire ? "Generating…" : "Generate"}
            </button>
            {questionnaire && (
              <button type="button" className="vc-btn" onClick={copyQuestionnaire}>
                {questionnaireCopied ? "Copied" : "Copy"}
              </button>
            )}
          </div>

          {questionnaire && (
            <div className="mt-4 max-h-80 overflow-y-auto rounded-xl border border-[var(--vc-hairline)] bg-[var(--vc-inset)] p-5">
              {renderFormattedText(questionnaire)}
            </div>
          )}
        </div>

        <div className="vc-card flex flex-col">
          <div className="vc-card-title">Infrastructure-as-code fixes</div>
          <div className="vc-card-sub mb-4">Terraform or CDK to close every failing control on this scan.</div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="vc-seg">
              {(["terraform", "cdk"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={iacTool === t ? "is-on" : ""}
                  onClick={() => { setIacTool(t); setIac(null); }}
                >
                  {t === "terraform" ? "Terraform" : "CDK (Python)"}
                </button>
              ))}
            </div>
            <button type="button" className="vc-btn-secondary" onClick={handleGenerateIac} disabled={!selectedScanId || loadingIac}>
              {loadingIac ? "Generating…" : "Generate"}
            </button>
            {iac && (
              <button type="button" className="vc-btn" onClick={copyIac}>
                {iacCopied ? "Copied" : "Copy"}
              </button>
            )}
          </div>

          {iac && (
            <>
              <div className="mt-3 text-[11.5px] text-[var(--vc-dim)]">
                {iac.findings_count} failing control{iac.findings_count !== 1 ? "s" : ""} · {iac.tool}
              </div>
              <div className="mt-2 max-h-80 overflow-y-auto rounded-xl border border-[var(--vc-hairline)] bg-[var(--vc-inset)] p-5">
                {iac.snippets.split("\n").map((line, i) => {
                  if (line.trim() === "---") return <div key={i} className="my-3 border-t border-[var(--vc-hairline)]" />;
                  return line.startsWith("FINDING:") ? (
                    <p key={i} className="vc-eyebrow mt-2 mb-1 !text-[var(--vc-accent-text)]">{line}</p>
                  ) : (
                    <p key={i} className={`vc-mono text-xs ${line.trim() === "" ? "h-2" : "text-[var(--vc-text-2)]"}`}>{line}</p>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Scan history sparkbars ───────────────────────────────────────── */}
      {selectedAccountId && (
        <div className="vc-card">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="vc-card-title">Scan history</div>
              <div className="vc-card-sub">Failing checks per sweep for this account</div>
            </div>
            {loadingHistory && <span className="text-xs text-[var(--vc-dim)]">Loading…</span>}
          </div>

          {scanHistory.length === 0 && !loadingHistory ? (
            <p className="text-[12.5px] text-[var(--vc-muted)]">Run more scans to build the timeline.</p>
          ) : (
            <div className="flex items-end gap-2 overflow-x-auto pb-1">
              {[...scanHistory].reverse().map((s) => {
                const pct = s.total > 0 ? Math.min(100, Math.round((s.fail / s.total) * 100)) : 0;
                const isSelected = s.scan_id === selectedScanId;
                const tone = s.critical > 0 ? "vc-sev-critical" : s.fail > 0 ? "vc-sev-high" : "vc-ok";
                return (
                  <button
                    key={s.scan_id}
                    type="button"
                    title={`${new Date(s.created_at).toLocaleDateString()} — ${s.fail} failing of ${s.total}`}
                    onClick={() => setSelectedScanId(s.scan_id)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-2.5 py-2 transition-colors ${
                      isSelected
                        ? "border-[var(--vc-accent)] bg-[var(--vc-accent-wash)]"
                        : "border-[var(--vc-hairline)] hover:bg-[var(--vc-chip)]"
                    }`}
                  >
                    <div className="flex h-16 w-6 items-end">
                      <div className={`w-full rounded-t bg-current ${tone}`} style={{ height: `${Math.max(8, pct)}%` }} />
                    </div>
                    <span className="text-[9px] text-[var(--vc-dim)]">
                      {new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                    {s.critical > 0 && <span className="text-[9px] font-semibold vc-sev-critical">{s.critical}C</span>}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-3.5 flex flex-wrap items-center gap-4 text-[11px] text-[var(--vc-dim)]">
            <span className="flex items-center gap-1.5"><span className="vc-dot vc-sev-critical" /> Critical fails</span>
            <span className="flex items-center gap-1.5"><span className="vc-dot vc-sev-high" /> Other fails</span>
            <span className="flex items-center gap-1.5"><span className="vc-dot vc-ok" /> All passing</span>
          </div>
        </div>
      )}

      {/* ── Findings ─────────────────────────────────────────────────────── */}
      <div className="mt-1 flex items-center justify-between">
        <div className="vc-card-title">
          Findings{selectedScan ? ` · ${selectedScan.account_name ?? selectedScan.scan_id}` : ""}
        </div>
        <span className="text-[12.5px] text-[var(--vc-muted)]">
          {filteredFindings.length} shown of {findings.length}
        </span>
      </div>

      <div ref={findingsRef}>
        <FindingsTable findings={filteredFindings} onOpenFinding={openFinding} loading={loadingFindings} search={search} />
      </div>

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
    </>
  );
}
