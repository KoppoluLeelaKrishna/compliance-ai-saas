"use client";

import { useEffect, useMemo, useState } from "react";
import AppTopNav from "@/components/AppTopNav";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type BillingMe = {
  subscription_status: string;
  account_limit: number;
  connected_accounts_used: number;
};

type Account = {
  id: number;
  customer_name: string;
  account_name: string;
  aws_account_id: string;
  role_arn: string;
  external_id: string;
  region: string;
  status: string;
  is_active: boolean;
};

type ScanAccount = {
  scan_id?: string;
  account_id?: number;
  customer_name?: string;
  account_name?: string;
  aws_account_id?: string;
  role_arn?: string;
  region?: string;
  linked_at?: string;
};

type ScanItem = {
  scan_id: string;
  status: string;
  created_at: string;
  account_id?: number;
  customer_name?: string;
  account_name?: string;
  aws_account_id?: string;
  role_arn?: string;
  region?: string;
  linked_at?: string;
  account?: ScanAccount | null;
};

type Finding = {
  scan_id: string;
  service: string;
  severity: string;
  check_id: string;
  title: string;
  resource_id: string;
  status: string;
  created_at: string;
  evidence: Record<string, unknown>;
  resolution: string;
  note: string;
  account_id?: number;
  customer_name?: string;
  account_name?: string;
  region?: string;
};

type FindingsResponse = {
  scan_id: string;
  account?: ScanAccount | null;
  findings: Finding[];
};

type ActionRow = {
  scan_id: string;
  check_id: string;
  resource_id: string;
  resolution: string;
  note: string;
  created_at: string;
};

type ActionsResponse = {
  scan_id: string;
  actions: ActionRow[];
};

type FixGuidance = {
  check_id: string;
  title: string;
  summary: string;
  consolePath: string;
  steps: string[];
  cli: string[];
  terraform: string;
  updated_at: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      msg = data?.detail || data?.message || JSON.stringify(data);
    } catch {}
    throw new Error(msg);
  }

  return res.json();
}

function fmtDate(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function badgeClasses(value: string) {
  const v = value.toUpperCase();

  if (v === "CRITICAL") return "border-red-700 text-red-300 bg-red-950/40";
  if (v === "HIGH") return "border-orange-700 text-orange-300 bg-orange-950/40";
  if (v === "MEDIUM") return "border-yellow-700 text-yellow-300 bg-yellow-950/40";
  if (v === "LOW") return "border-blue-700 text-blue-300 bg-blue-950/40";
  if (v === "INFO") return "border-slate-700 text-slate-300 bg-slate-950/40";
  if (v === "PASS") return "border-emerald-700 text-emerald-300 bg-emerald-950/40";
  if (v === "FAIL") return "border-red-700 text-red-300 bg-red-950/40";
  if (v === "FIXED") return "border-emerald-700 text-emerald-300 bg-emerald-950/40";
  if (v === "IGNORED") return "border-yellow-700 text-yellow-300 bg-yellow-950/40";
  if (v === "OPEN") return "border-neutral-700 text-neutral-300 bg-neutral-900";
  return "border-neutral-700 text-neutral-300 bg-neutral-900";
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export default function ScansPage() {
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [loadingBilling, setLoadingBilling] = useState(true);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedScanId, setSelectedScanId] = useState<string>("");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedScanAccount, setSelectedScanAccount] = useState<ScanAccount | null>(null);

  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingScans, setLoadingScans] = useState(true);
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [running, setRunning] = useState(false);

  const [bucketName, setBucketName] = useState("");
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [resolutionFilter, setResolutionFilter] = useState("ALL");

  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [fixGuidance, setFixGuidance] = useState<FixGuidance | null>(null);
  const [loadingGuidance, setLoadingGuidance] = useState(false);

  const [noteInput, setNoteInput] = useState("");
  const [actionSaving, setActionSaving] = useState<"FIXED" | "IGNORED" | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [actions, setActions] = useState<ActionRow[]>([]);

  async function loadBilling() {
    setLoadingBilling(true);
    try {
      const data = await api<BillingMe>("/billing/me");
      setBilling(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load billing");
    } finally {
      setLoadingBilling(false);
    }
  }

  async function loadAccounts() {
    setLoadingAccounts(true);
    try {
      const data = await api<{ accounts: Account[] }>("/accounts");
      setAccounts(data.accounts || []);
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function loadScans(accountId?: string) {
    setLoadingScans(true);
    try {
      const query = accountId ? `?account_id=${accountId}` : "";
      const data = await api<{ scans: ScanItem[] }>(`/scans${query}`);
      const list = data.scans || [];
      setScans(list);

      if (list.length === 0) {
        setSelectedScanId("");
        setFindings([]);
        setSelectedScanAccount(null);
        setSelectedFinding(null);
        setFixGuidance(null);
        setActions([]);
        return;
      }

      const keepExisting = selectedScanId && list.some((s) => s.scan_id === selectedScanId);
      const nextScanId = keepExisting ? selectedScanId : list[0].scan_id;
      setSelectedScanId(nextScanId);
    } finally {
      setLoadingScans(false);
    }
  }

  async function loadFindings(scanId: string) {
    if (!scanId) {
      setFindings([]);
      setSelectedScanAccount(null);
      setActions([]);
      return;
    }

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
      setSelectedScanAccount(findingsData.account || null);
      setActions(actionsData.actions || []);

      if (selectedFinding) {
        const refreshed = enriched.find(
          (f) =>
            f.check_id === selectedFinding.check_id &&
            f.resource_id === selectedFinding.resource_id
        );
        if (refreshed) {
          setSelectedFinding(refreshed);
          setNoteInput(refreshed.note || "");
        }
      }
    } finally {
      setLoadingFindings(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([loadBilling(), loadAccounts()]);
        await loadScans("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load page");
      }
    })();
  }, []);

  useEffect(() => {
    if (selectedScanId) {
      loadFindings(selectedScanId).catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load findings");
      });
    }
  }, [selectedScanId]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => String(a.id) === selectedAccountId) || null,
    [accounts, selectedAccountId]
  );

  const currentPlan = (billing?.subscription_status || "free").toUpperCase();
  const accountUsage = billing
    ? `${billing.connected_accounts_used}/${billing.account_limit}`
    : "-";

  const canUseAccountLinkedScans = true;
  const canExport = true;

  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        f.check_id.toLowerCase().includes(q) ||
        f.title.toLowerCase().includes(q) ||
        f.resource_id.toLowerCase().includes(q) ||
        f.service.toLowerCase().includes(q) ||
        JSON.stringify(f.evidence || {}).toLowerCase().includes(q);

      const matchesService = serviceFilter === "ALL" || f.service === serviceFilter;
      const matchesSeverity = severityFilter === "ALL" || f.severity === severityFilter;
      const matchesStatus = statusFilter === "ALL" || f.status === statusFilter;
      const matchesResolution =
        resolutionFilter === "ALL" || (f.resolution || "OPEN") === resolutionFilter;

      return (
        matchesSearch &&
        matchesService &&
        matchesSeverity &&
        matchesStatus &&
        matchesResolution
      );
    });
  }, [findings, search, serviceFilter, severityFilter, statusFilter, resolutionFilter]);

  const severityCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of filteredFindings) {
      map[item.severity] = (map[item.severity] || 0) + 1;
    }
    return map;
  }, [filteredFindings]);

  const resolutionCounts = useMemo(() => {
    const map: Record<string, number> = { OPEN: 0, FIXED: 0, IGNORED: 0 };
    for (const item of filteredFindings) {
      const key = (item.resolution || "OPEN").toUpperCase();
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [filteredFindings]);

  const services = useMemo(
    () => Array.from(new Set(findings.map((f) => f.service))).sort(),
    [findings]
  );

  const severities = useMemo(
    () => Array.from(new Set(findings.map((f) => f.severity))).sort(),
    [findings]
  );

  const recentActions = useMemo(() => {
    return [...actions]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 8);
  }, [actions]);

  const fixedPercent = useMemo(() => {
    const total = filteredFindings.length || 1;
    return Math.round(((resolutionCounts.FIXED || 0) / total) * 100);
  }, [filteredFindings.length, resolutionCounts.FIXED]);

  async function onFilterChange(accountId: string) {
    setSelectedAccountId(accountId);
    setError("");
    setMessage("");
    setSelectedFinding(null);
    setFixGuidance(null);
    await loadScans(accountId);
  }

  async function runScan() {
    setRunning(true);
    setError("");
    setMessage("");

    try {
      const payload: Record<string, unknown> = {
        region: selectedAccount?.region || "us-east-1",
      };

      if (selectedAccountId) payload.account_id = Number(selectedAccountId);
      if (bucketName.trim()) payload.bucket_name = bucketName.trim();

      const data = await api<{ scan_id: string; count: number }>("/scans/run", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setMessage(`Scan completed. Findings count: ${data.count}`);
      await loadScans(selectedAccountId);
      if (data.scan_id) {
        setSelectedScanId(data.scan_id);
        await loadFindings(data.scan_id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run scan failed");
    } finally {
      setRunning(false);
    }
  }

  function downloadJson() {
    if (!selectedScanId || !canExport) return;
    window.open(`${API_BASE}/scans/${selectedScanId}/export.json`, "_blank");
  }

  function downloadCsv() {
    if (!selectedScanId || !canExport) return;
    window.open(`${API_BASE}/scans/${selectedScanId}/export.csv`, "_blank");
  }

  async function openFinding(finding: Finding) {
    setSelectedFinding(finding);
    setNoteInput(finding.note || "");
    setFixGuidance(null);
    setLoadingGuidance(true);
    setError("");

    try {
      const data = await api<FixGuidance>(`/fix-guidance/${finding.check_id}`);
      setFixGuidance(data);
    } catch (e) {
      setFixGuidance(null);
      setError(e instanceof Error ? e.message : "Failed to load fix guidance");
    } finally {
      setLoadingGuidance(false);
    }
  }

  async function setFindingAction(action: "FIXED" | "IGNORED") {
    if (!selectedFinding || !selectedScanId) return;

    setActionSaving(action);
    setError("");
    setMessage("");

    try {
      await api(
        `/finding-actions/${selectedScanId}/${encodeURIComponent(
          selectedFinding.check_id
        )}?resource_id=${encodeURIComponent(selectedFinding.resource_id)}`,
        {
          method: "POST",
          body: JSON.stringify({
            action,
            note: noteInput || "",
          }),
        }
      );

      setMessage(
        action === "FIXED"
          ? "Finding marked as fixed."
          : "Finding marked as ignored."
      );

      await loadFindings(selectedScanId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save action");
    } finally {
      setActionSaving(null);
    }
  }

  function clearFilters() {
    setSearch("");
    setServiceFilter("ALL");
    setSeverityFilter("ALL");
    setStatusFilter("ALL");
    setResolutionFilter("ALL");
  }

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <AppTopNav />

        <div className="mb-8">
          <h1 className="text-3xl font-bold">Scans & Findings</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Run scans, review findings, apply remediation guidance, and export evidence.
          </p>
        </div>

        {message ? (
          <div className="mb-4 rounded-xl border border-emerald-700 bg-emerald-950 px-4 py-3 text-sm text-emerald-200">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-xl border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Current Plan</div>
            <div className="mt-2 text-3xl font-bold">{loadingBilling ? "..." : currentPlan}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Account Usage</div>
            <div className="mt-2 text-3xl font-bold">
              {loadingBilling ? "..." : accountUsage}
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Account-Linked Scans</div>
            <div className="mt-2 text-3xl font-bold">
              {canUseAccountLinkedScans ? "Enabled" : "Locked"}
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Exports</div>
            <div className="mt-2 text-3xl font-bold">{canExport ? "Enabled" : "Locked"}</div>
          </div>
        </div>

        <section className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr_1fr_auto]">
            <div>
              <label className="mb-1 block text-sm text-neutral-300">
                Filter / Run for Account
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => onFilterChange(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-black px-3 py-2 outline-none focus:border-neutral-600"
              >
                <option value="">All accounts / no account filter</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.customer_name} — {a.account_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-neutral-300">
                Bucket Override (optional)
              </label>
              <input
                value={bucketName}
                onChange={(e) => setBucketName(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-black px-3 py-2 outline-none focus:border-neutral-600"
                placeholder="leela-public-test-1472018067"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-neutral-300">
                Selected Account Summary
              </label>
              <div className="rounded-xl border border-neutral-800 bg-black px-3 py-2 text-sm text-neutral-300">
                {loadingAccounts ? (
                  <span className="text-neutral-500">Loading accounts...</span>
                ) : selectedAccount ? (
                  <div>
                    <div className="font-medium">{selectedAccount.customer_name}</div>
                    <div>{selectedAccount.account_name}</div>
                    <div className="text-neutral-500">
                      {selectedAccount.aws_account_id} • {selectedAccount.region}
                    </div>
                  </div>
                ) : (
                  <span className="text-neutral-500">No account selected</span>
                )}
              </div>
            </div>

            <div className="flex items-end">
              <button
                onClick={runScan}
                disabled={running}
                className="w-full rounded-xl bg-white px-4 py-2 font-medium text-black disabled:opacity-60"
              >
                {running ? "Running..." : "Run Scan"}
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-neutral-800 bg-black px-4 py-3 text-sm text-neutral-300">
            {loadingBilling
              ? "Checking plan access..."
              : `${currentPlan} plan supports account-linked scans and evidence exports.`}
          </div>
        </section>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-5">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Scans Loaded</div>
            <div className="mt-2 text-3xl font-bold">{scans.length}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Findings Loaded</div>
            <div className="mt-2 text-3xl font-bold">{filteredFindings.length}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Critical</div>
            <div className="mt-2 text-3xl font-bold">{severityCounts.CRITICAL || 0}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Open</div>
            <div className="mt-2 text-3xl font-bold">{resolutionCounts.OPEN || 0}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Fixed %</div>
            <div className="mt-2 text-3xl font-bold">{fixedPercent}%</div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Scan History</h2>
              <button
                onClick={() => loadScans(selectedAccountId)}
                className="rounded-xl border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900"
              >
                Refresh
              </button>
            </div>

            {loadingScans ? (
              <div className="rounded-xl border border-neutral-800 p-4 text-neutral-400">
                Loading scans...
              </div>
            ) : scans.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-700 p-8 text-center">
                <div className="text-lg font-semibold">No scans found</div>
              </div>
            ) : (
              <div className="space-y-3">
                {scans.map((scan) => {
                  const active = scan.scan_id === selectedScanId;
                  const acc = scan.account || null;

                  return (
                    <button
                      key={scan.scan_id}
                      onClick={() => {
                        setSelectedScanId(scan.scan_id);
                        setSelectedFinding(null);
                        setFixGuidance(null);
                      }}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        active
                          ? "border-white bg-neutral-900 shadow-[0_0_0_1px_rgba(255,255,255,0.15)]"
                          : "border-neutral-800 bg-black hover:bg-neutral-900"
                      }`}
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="font-medium">{scan.scan_id}</div>
                          <div className="mt-1 text-sm text-neutral-400">
                            {fmtDate(scan.created_at)}
                          </div>
                        </div>
                        <div className="rounded-full border border-neutral-700 px-3 py-1 text-xs">
                          {scan.status}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-neutral-300 md:grid-cols-2">
                        <div>
                          <span className="text-neutral-500">Customer:</span>{" "}
                          {acc?.customer_name || scan.customer_name || "-"}
                        </div>
                        <div>
                          <span className="text-neutral-500">Account:</span>{" "}
                          {acc?.account_name || scan.account_name || "-"}
                        </div>
                        <div>
                          <span className="text-neutral-500">AWS Account ID:</span>{" "}
                          {acc?.aws_account_id || scan.aws_account_id || "-"}
                        </div>
                        <div>
                          <span className="text-neutral-500">Region:</span>{" "}
                          {acc?.region || scan.region || "-"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Selected Scan Context</h2>
              <div className="flex gap-2">
                <button
                  onClick={downloadJson}
                  disabled={!selectedScanId || !canExport}
                  className="rounded-xl border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-50"
                >
                  Download JSON
                </button>
                <button
                  onClick={downloadCsv}
                  disabled={!selectedScanId || !canExport}
                  className="rounded-xl border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-50"
                >
                  Download CSV
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-black p-4 text-sm">
              <div className="mb-2 font-medium">Account Context</div>
              {selectedScanAccount ? (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div>
                    <span className="text-neutral-500">Customer:</span>{" "}
                    {selectedScanAccount.customer_name || "-"}
                  </div>
                  <div>
                    <span className="text-neutral-500">Account:</span>{" "}
                    {selectedScanAccount.account_name || "-"}
                  </div>
                  <div>
                    <span className="text-neutral-500">AWS Account ID:</span>{" "}
                    {selectedScanAccount.aws_account_id || "-"}
                  </div>
                  <div>
                    <span className="text-neutral-500">Region:</span>{" "}
                    {selectedScanAccount.region || "-"}
                  </div>
                </div>
              ) : (
                <div className="text-neutral-500">No scan selected.</div>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-neutral-800 bg-black p-4 text-sm">
              <div className="mb-3 font-medium">Resolution Breakdown</div>
              <div className="space-y-2">
                {["OPEN", "FIXED", "IGNORED"].map((k) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-neutral-400">{k}</span>
                    <span className="font-medium">{resolutionCounts[k] || 0}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-neutral-800 bg-black p-4 text-sm">
              <div className="mb-3 font-medium">Severity Breakdown</div>
              <div className="space-y-2">
                {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((k) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-neutral-400">{k}</span>
                    <span className="font-medium">{severityCounts[k] || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <section className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
          <div className="mb-4 flex flex-col gap-4">
            <h2 className="text-xl font-semibold">Findings</h2>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search check, title, evidence, resource..."
                className="rounded-xl border border-neutral-800 bg-black px-3 py-2 outline-none focus:border-neutral-600 lg:col-span-2"
              />

              <select
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                className="rounded-xl border border-neutral-800 bg-black px-3 py-2 outline-none focus:border-neutral-600"
              >
                <option value="ALL">All services</option>
                {services.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="rounded-xl border border-neutral-800 bg-black px-3 py-2 outline-none focus:border-neutral-600"
              >
                <option value="ALL">All severities</option>
                {severities.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <div className="flex gap-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-neutral-800 bg-black px-3 py-2 outline-none focus:border-neutral-600"
                >
                  <option value="ALL">All status</option>
                  <option value="FAIL">FAIL</option>
                  <option value="PASS">PASS</option>
                </select>

                <select
                  value={resolutionFilter}
                  onChange={(e) => setResolutionFilter(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-neutral-800 bg-black px-3 py-2 outline-none focus:border-neutral-600"
                >
                  <option value="ALL">All resolution</option>
                  <option value="OPEN">OPEN</option>
                  <option value="FIXED">FIXED</option>
                  <option value="IGNORED">IGNORED</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={clearFilters}
                className="rounded-xl border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900"
              >
                Reset Filters
              </button>
            </div>
          </div>

          {loadingFindings ? (
            <div className="rounded-xl border border-neutral-800 p-4 text-neutral-400">
              Loading findings...
            </div>
          ) : filteredFindings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-700 p-8 text-center">
              <div className="text-lg font-semibold">No findings loaded</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-neutral-400">
                  <tr className="border-b border-neutral-800">
                    <th className="px-3 py-3">Service</th>
                    <th className="px-3 py-3">Severity</th>
                    <th className="px-3 py-3">Check</th>
                    <th className="px-3 py-3">Resource</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Resolution</th>
                    <th className="px-3 py-3">Account</th>
                    <th className="px-3 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFindings.map((f, idx) => {
                    const selected =
                      selectedFinding?.check_id === f.check_id &&
                      selectedFinding?.resource_id === f.resource_id;

                    return (
                      <tr
                        key={`${f.check_id}-${f.resource_id}-${idx}`}
                        className={`border-b border-neutral-900 align-top transition ${
                          selected ? "bg-neutral-900/80 ring-1 ring-inset ring-white/10" : ""
                        }`}
                      >
                        <td className="px-3 py-3">{f.service}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full border px-2 py-1 text-xs ${badgeClasses(
                              f.severity
                            )}`}
                          >
                            {f.severity}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium">{f.check_id}</div>
                          <div className="mt-1 text-xs text-neutral-500">{f.title}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="max-w-[280px] break-all">{f.resource_id}</div>
                          <div className="mt-1 text-xs text-neutral-500">
                            {fmtDate(f.created_at)}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full border px-2 py-1 text-xs ${badgeClasses(
                              f.status
                            )}`}
                          >
                            {f.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full border px-2 py-1 text-xs ${badgeClasses(
                              f.resolution || "OPEN"
                            )}`}
                          >
                            {f.resolution || "OPEN"}
                          </span>
                          {f.note ? (
                            <div className="mt-1 max-w-[220px] text-xs text-neutral-500">
                              {f.note}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <div>{f.customer_name || "-"}</div>
                          <div className="text-xs text-neutral-500">
                            {f.account_name || "-"}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => openFinding(f)}
                            className="rounded-lg border border-neutral-800 px-3 py-1 hover:bg-neutral-900"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_0.95fr]">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Remediation Guidance + Actions</h2>
              {selectedFinding ? (
                <button
                  onClick={() => {
                    setSelectedFinding(null);
                    setFixGuidance(null);
                    setNoteInput("");
                  }}
                  className="rounded-xl border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900"
                >
                  Close
                </button>
              ) : null}
            </div>

            {!selectedFinding ? (
              <div className="rounded-xl border border-dashed border-neutral-700 p-8 text-center">
                <div className="text-lg font-semibold">No finding selected</div>
                <p className="mt-2 text-sm text-neutral-400">
                  Click Open on a finding to load fix guidance and mark resolution.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-neutral-800 bg-black p-4">
                  <div className="mb-3 text-sm font-medium text-neutral-300">
                    Selected Finding
                  </div>
                  <div className="space-y-2 text-sm">
                    <div><span className="text-neutral-500">Check:</span> {selectedFinding.check_id}</div>
                    <div><span className="text-neutral-500">Title:</span> {selectedFinding.title}</div>
                    <div><span className="text-neutral-500">Service:</span> {selectedFinding.service}</div>
                    <div>
                      <span className="text-neutral-500">Resource:</span>{" "}
                      <span className="break-all">{selectedFinding.resource_id}</span>
                    </div>
                    <div><span className="text-neutral-500">Status:</span> {selectedFinding.status}</div>
                    <div><span className="text-neutral-500">Resolution:</span> {selectedFinding.resolution || "OPEN"}</div>
                    <div>
                      <span className="text-neutral-500">Account:</span>{" "}
                      {selectedFinding.customer_name || "-"} / {selectedFinding.account_name || "-"}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-black p-4">
                  <div className="mb-3 text-sm font-medium text-neutral-300">
                    Note / Ticket Link
                  </div>
                  <textarea
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="ex: JIRA-1234, fixed in terraform commit abc..."
                    className="min-h-[110px] w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-600"
                  />
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={() => setFindingAction("FIXED")}
                      disabled={actionSaving !== null}
                      className="rounded-xl bg-white px-4 py-2 font-medium text-black disabled:opacity-60"
                    >
                      {actionSaving === "FIXED" ? "Saving..." : "Mark Fixed"}
                    </button>
                    <button
                      onClick={() => setFindingAction("IGNORED")}
                      disabled={actionSaving !== null}
                      className="rounded-xl border border-neutral-800 px-4 py-2 hover:bg-neutral-900 disabled:opacity-60"
                    >
                      {actionSaving === "IGNORED" ? "Saving..." : "Ignore"}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-black p-4">
                  <div className="mb-3 flex items-center justify-between text-sm font-medium text-neutral-300">
                    <span>Evidence</span>
                    <button
                      onClick={() => copyText(JSON.stringify(selectedFinding.evidence || {}, null, 2))}
                      className="rounded-lg border border-neutral-800 px-3 py-1 text-xs hover:bg-neutral-900"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap break-all text-xs text-neutral-300">
                    {JSON.stringify(selectedFinding.evidence || {}, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="mb-4 text-xl font-semibold">Guidance Details</div>

            {loadingGuidance ? (
              <div className="rounded-xl border border-neutral-800 bg-black p-4 text-neutral-400">
                Loading fix guidance...
              </div>
            ) : !fixGuidance ? (
              <div className="rounded-xl border border-dashed border-neutral-700 bg-black p-8 text-center">
                <div className="text-lg font-semibold">No fix guidance loaded</div>
                <p className="mt-2 text-sm text-neutral-400">
                  This check may not have guidance seeded yet.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-neutral-800 bg-black p-4">
                  <div className="mb-2 text-lg font-semibold">{fixGuidance.title}</div>
                  <div className="text-sm text-neutral-300">{fixGuidance.summary}</div>
                  <div className="mt-3 text-xs text-neutral-500">
                    Updated: {fmtDate(fixGuidance.updated_at)}
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-black p-4">
                  <div className="mb-2 text-sm font-medium text-neutral-300">Console Path</div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="break-all text-sm text-neutral-300">
                      {fixGuidance.consolePath || "-"}
                    </div>
                    <button
                      onClick={() => copyText(fixGuidance.consolePath || "")}
                      className="rounded-lg border border-neutral-800 px-3 py-1 text-xs hover:bg-neutral-900"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-black p-4">
                  <div className="mb-2 text-sm font-medium text-neutral-300">Steps</div>
                  {fixGuidance.steps?.length ? (
                    <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-300">
                      {fixGuidance.steps.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ol>
                  ) : (
                    <div className="text-sm text-neutral-500">No steps available.</div>
                  )}
                </div>

                <div className="rounded-xl border border-neutral-800 bg-black p-4">
                  <div className="mb-2 flex items-center justify-between text-sm font-medium text-neutral-300">
                    <span>AWS CLI</span>
                    <button
                      onClick={() => copyText((fixGuidance.cli || []).join("\n\n"))}
                      className="rounded-lg border border-neutral-800 px-3 py-1 text-xs hover:bg-neutral-900"
                    >
                      Copy All
                    </button>
                  </div>
                  {fixGuidance.cli?.length ? (
                    <div className="space-y-2">
                      {fixGuidance.cli.map((cmd, idx) => (
                        <div key={idx} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                          <div className="mb-2 flex justify-end">
                            <button
                              onClick={() => copyText(cmd)}
                              className="rounded-lg border border-neutral-800 px-3 py-1 text-xs hover:bg-neutral-900"
                            >
                              Copy
                            </button>
                          </div>
                          <pre className="overflow-auto whitespace-pre-wrap break-all text-xs text-neutral-300">
                            {cmd}
                          </pre>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-neutral-500">No CLI guidance.</div>
                  )}
                </div>

                <div className="rounded-xl border border-neutral-800 bg-black p-4">
                  <div className="mb-2 flex items-center justify-between text-sm font-medium text-neutral-300">
                    <span>Terraform</span>
                    <button
                      onClick={() => copyText(fixGuidance.terraform || "")}
                      className="rounded-lg border border-neutral-800 px-3 py-1 text-xs hover:bg-neutral-900"
                    >
                      Copy
                    </button>
                  </div>
                  {fixGuidance.terraform ? (
                    <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300">
                      {fixGuidance.terraform}
                    </pre>
                  ) : (
                    <div className="text-sm text-neutral-500">No terraform guidance.</div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
          <div className="mb-4 text-xl font-semibold">Recent Action History</div>

          {recentActions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-700 p-8 text-center text-neutral-400">
              No action history yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-neutral-400">
                  <tr className="border-b border-neutral-800">
                    <th className="px-3 py-3">Check</th>
                    <th className="px-3 py-3">Resource</th>
                    <th className="px-3 py-3">Resolution</th>
                    <th className="px-3 py-3">Note</th>
                    <th className="px-3 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActions.map((a, idx) => (
                    <tr key={`${a.check_id}-${a.resource_id}-${idx}`} className="border-b border-neutral-900 align-top">
                      <td className="px-3 py-3">{a.check_id}</td>
                      <td className="px-3 py-3">
                        <div className="max-w-[320px] break-all">{a.resource_id}</div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full border px-2 py-1 text-xs ${badgeClasses(a.resolution)}`}>
                          {a.resolution}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="max-w-[320px] break-words text-neutral-300">
                          {a.note || "-"}
                        </div>
                      </td>
                      <td className="px-3 py-3">{fmtDate(a.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}