"use client";

import { useEffect, useMemo, useState } from "react";
import { api, API_BASE } from "@/lib/api";
import {
  Account,
  ActionRow,
  ActionsResponse,
  BillingMe,
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
    try {
      const findingsData = await api<FindingsResponse>(`/scans/${scanId}/findings`);
      const actionsData = await api<ActionsResponse>(`/finding-actions/${scanId}`).catch(() => ({
        scan_id: scanId,
        actions: [],
      }));

      const actionMap = new Map(
        (actionsData.actions || []).map((a) => [`${a.check_id}::${a.resource_id}`, a])
      );

      const enriched = (findingsData.findings || []).map((f) => {
        const key = `${f.check_id}::${f.resource_id}`;
        const action = actionMap.get(key);
        return {
          ...f,
          resolution: action?.resolution || f.resolution || "OPEN",
          note: action?.note || f.note || "",
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

      return matchesSearch && matchesService && matchesSeverity && matchesResolution;
    });
  }, [findings, search, serviceFilter, severityFilter, resolutionFilter]);

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
      const payload: any = {};
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
    setLoadingGuidance(true);
    try {
      const data = await api<FixGuidance>(`/fix-guidance/${finding.check_id}`);
      setFixGuidance(data);
    } catch {
      setFixGuidance(null);
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

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    filteredFindings.forEach(f => {
      counts[f.severity] = (counts[f.severity] || 0) + 1;
    });
    return counts;
  }, [filteredFindings]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-xl font-bold animate-pulse text-neutral-500">Loading VigiliCloud Workspace...</div>
      </div>
    );
  }

  return (
    <main className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-bold">Scans & Findings</h1>
          <p className="mt-2 text-neutral-400">
            Analyze your AWS posture, track remediation, and export compliance evidence.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.open(`${API_BASE}/scans/${selectedScanId}/export.json`, "_blank")}
            disabled={!selectedScanId}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium hover:bg-white/5 disabled:opacity-50 transition-colors"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={handleAiAnalysis}
            disabled={!selectedScanId || loadingAi}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
          >
            {loadingAi ? "Analyzing..." : "✦ AI Analysis"}
          </button>
          <button
            type="button"
            onClick={handleRunScan}
            disabled={running}
            className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-bold text-black hover:bg-emerald-400 disabled:opacity-50 transition-colors"
          >
            {running ? "Scanning..." : "Run Scan"}
          </button>
        </div>
      </div>

      {(message || error) && (
        <div className={`rounded-2xl border p-4 text-sm ${error ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
          {error || message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((sev) => (
          <Card key={sev} className="py-4 px-5">
            <div className="text-xs font-semibold text-neutral-500">{sev}</div>
            <div className={`mt-1 text-3xl font-bold ${
              sev === 'CRITICAL' ? 'text-red-500' : 
              sev === 'HIGH' ? 'text-orange-500' : 
              sev === 'MEDIUM' ? 'text-yellow-500' : 
              'text-blue-500'
            }`}>
              {severityCounts[sev] || 0}
            </div>
          </Card>
        ))}
      </div>

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

      {aiAnalysis && (
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
              <span>✦</span>
              <span>AI Security Analysis</span>
            </div>
            <button
              type="button"
              onClick={() => setAiAnalysis("")}
              className="text-xs text-neutral-500 hover:text-white transition-colors"
            >
              Dismiss
            </button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-300">{aiAnalysis}</p>
        </Card>
      )}

      <FindingsTable
        findings={filteredFindings}
        onOpenFinding={openFinding}
        loading={loadingFindings}
      />

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
        />
      )}
    </main>
  );
}
