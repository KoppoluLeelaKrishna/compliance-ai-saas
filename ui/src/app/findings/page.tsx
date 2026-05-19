"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AuthMe, Finding, FixGuidance } from "@/types";
import { Card } from "@/components/ui/Card";
import { FindingsTable } from "@/components/scans/FindingsTable";
import { FindingDetail } from "@/components/scans/FindingDetail";

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export default function FindingsPage() {
  const router = useRouter();

  const [findings, setFindings] = useState<Finding[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [serviceFilter, setServiceFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [fixGuidance, setFixGuidance] = useState<FixGuidance | null>(null);
  const [loadingGuidance, setLoadingGuidance] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [actionSaving, setActionSaving] = useState<"FIXED" | "IGNORED" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const auth = await api<AuthMe>("/auth/me");
        if (!auth.authenticated) {
          router.push("/signin");
          return;
        }
      } catch {
        router.push("/signin");
        return;
      }
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

  const services = useMemo(
    () => Array.from(new Set(findings.map((f) => f.service))).sort(),
    [findings]
  );

  const filtered = useMemo(() => {
    return findings.filter((f) => {
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        f.title.toLowerCase().includes(q) ||
        f.check_id.toLowerCase().includes(q) ||
        f.resource_id.toLowerCase().includes(q) ||
        (f.account_name || "").toLowerCase().includes(q);
      const matchSeverity = severityFilter === "ALL" || f.severity === severityFilter;
      const matchService = serviceFilter === "ALL" || f.service === serviceFilter;
      const matchStatus = statusFilter === "ALL" || f.status === statusFilter;
      return matchSearch && matchSeverity && matchService && matchStatus;
    });
  }, [findings, search, severityFilter, serviceFilter, statusFilter]);

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    findings.filter((f) => f.status === "FAIL").forEach((f) => {
      counts[f.severity] = (counts[f.severity] || 0) + 1;
    });
    return counts;
  }, [findings]);

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
    if (!selectedFinding) return;
    setActionSaving(action);
    try {
      await api(
        `/finding-actions/${selectedFinding.scan_id}/${encodeURIComponent(
          selectedFinding.check_id
        )}?resource_id=${encodeURIComponent(selectedFinding.resource_id)}`,
        { method: "POST", body: JSON.stringify({ action, note: noteInput }) }
      );
      setMessage(`Marked as ${action.toLowerCase()}.`);
      setFindings((prev) =>
        prev.map((f) =>
          f.scan_id === selectedFinding.scan_id &&
          f.check_id === selectedFinding.check_id &&
          f.resource_id === selectedFinding.resource_id
            ? { ...f, resolution: action, note: noteInput }
            : f
        )
      );
      setSelectedFinding((f) => (f ? { ...f, resolution: action, note: noteInput } : f));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save action");
    } finally {
      setActionSaving(null);
    }
  }

  const selectClass =
    "rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none";

  return (
    <main className="space-y-8 pb-20">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-bold">All Findings</h1>
          <p className="mt-2 text-neutral-400">
            {loading
              ? "Loading findings..."
              : `Showing ${filtered.length} of ${total} findings across all scans`}
          </p>
        </div>
        <button
          type="button"
          onClick={loadFindings}
          disabled={loading}
          className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium hover:bg-white/5 disabled:opacity-50 transition-colors"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {(message || error) && (
        <div
          className={`rounded-2xl border p-4 text-sm ${
            error
              ? "border-red-800/60 bg-red-950/40 text-red-300"
              : "border-emerald-700 bg-emerald-950/40 text-emerald-200"
          }`}
        >
          {error || message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {SEVERITIES.map((sev) => (
          <button
            key={sev}
            type="button"
            onClick={() => setSeverityFilter(severityFilter === sev ? "ALL" : sev)}
            className={`text-left transition-all ${
              severityFilter === sev ? "ring-1 ring-white/30" : ""
            }`}
          >
            <Card className="py-4 px-5 hover:bg-white/10 transition-colors cursor-pointer">
              <div className="text-xs font-semibold text-neutral-500">{sev} FAILS</div>
              <div
                className={`mt-1 text-3xl font-bold ${
                  sev === "CRITICAL"
                    ? "text-red-500"
                    : sev === "HIGH"
                    ? "text-orange-500"
                    : sev === "MEDIUM"
                    ? "text-yellow-500"
                    : "text-blue-500"
                }`}
              >
                {severityCounts[sev] || 0}
              </div>
            </Card>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search findings..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] rounded-xl border border-white/10 bg-black/60 px-4 py-2 text-sm text-white placeholder-neutral-500 focus:border-emerald-500/50 focus:outline-none"
        />
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className={selectClass}
        >
          <option value="ALL">All Severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          className={selectClass}
        >
          <option value="ALL">All Services</option>
          {services.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={selectClass}
        >
          <option value="ALL">All Statuses</option>
          <option value="FAIL">FAIL</option>
          <option value="PASS">PASS</option>
        </select>
        {(search || severityFilter !== "ALL" || serviceFilter !== "ALL" || statusFilter !== "ALL") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSeverityFilter("ALL");
              setServiceFilter("ALL");
              setStatusFilter("ALL");
            }}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      <FindingsTable findings={filtered} onOpenFinding={openFinding} loading={loading} />

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
