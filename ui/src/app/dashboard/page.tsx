"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import TopbarActions from "@/components/app/TopbarActions";
import {
  AuthMe,
  ComplianceCoverage,
  CoverageFramework,
  DashboardAccount,
  DashboardResponse,
} from "@/types";

const SEVERITIES = [
  { key: "CRITICAL", short: "C", label: "Critical", cls: "vc-sev-critical" },
  { key: "HIGH", short: "H", label: "High", cls: "vc-sev-high" },
  { key: "MEDIUM", short: "M", label: "Medium", cls: "vc-sev-medium" },
  { key: "LOW", short: "L", label: "Low", cls: "vc-sev-low" },
] as const;

const FRAMEWORKS: [keyof ComplianceCoverage["coverage"], string][] = [
  ["soc2", "SOC 2 Type II"],
  ["iso27001", "ISO 27001"],
  ["pci_dss", "PCI DSS 4.0"],
  ["nist", "NIST CSF"],
];

/** A–F from a 0–100 posture score, matching the backend's risk-score bands. */
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

function relativeTime(iso?: string | null) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Donut score dial — r=52 on a 128 box, matching the design's 11px ring. */
function PostureDial({ score, grade, tone }: { score: number; grade: string; tone: string }) {
  const circumference = 2 * Math.PI * 52;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;

  return (
    <div className="relative h-32 w-32 flex-none">
      <svg width="128" height="128" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r="52" fill="none" stroke="var(--vc-chip)" strokeWidth="11" />
        <circle
          cx="64"
          cy="64"
          r="52"
          fill="none"
          className={tone}
          stroke="currentColor"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          transform="rotate(-90 64 64)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[40px] font-semibold leading-none tracking-[-1.4px] text-[var(--vc-text)]">{grade}</div>
        <div className="mt-1 text-xs text-[var(--vc-muted)]">{score} / 100</div>
      </div>
    </div>
  );
}

function AccountCard({ account }: { account: DashboardAccount }) {
  const s = account.findings_summary;
  const scanned = relativeTime(account.latest_scan?.created_at);
  const score = s.total > 0 ? s.pass_rate : null;

  return (
    <div className="vc-card">
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[14.5px] font-semibold tracking-[-0.25px] text-[var(--vc-text)]">
            {account.customer_name} · {account.account_name}
          </div>
          <div className="vc-mono mt-0.5 text-[11.5px] text-[var(--vc-dim)]">
            {account.aws_account_id} · {account.region}
          </div>
        </div>
        {score != null ? (
          <span className={`vc-pill flex-none ${scoreTone(score)}`}>
            {gradeFor(score)} · {score}
          </span>
        ) : (
          <span className="vc-tag flex-none">No scan</span>
        )}
      </div>

      <div className="mb-3.5 flex gap-1.5">
        {SEVERITIES.map(({ key, short, cls }) => {
          const count = s[key] ?? 0;
          return (
            <span
              key={key}
              className={`vc-count flex-1 text-center ${count > 0 ? cls : "vc-count-zero"}`}
            >
              {count} {short}
            </span>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--vc-hairline-soft)] pt-3">
        <span className="text-[11.5px] text-[var(--vc-dim)]">
          {scanned ? `Scanned ${scanned}` : "Never scanned"}
        </span>
        {account.latest_scan ? (
          <Link href={`/scans/${account.latest_scan.scan_id}`} className="vc-link">
            Open
          </Link>
        ) : (
          <Link href="/accounts" className="vc-link">
            Connect
          </Link>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [coverage, setCoverage] = useState<ComplianceCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [scanning, setScanning] = useState(false);

  async function load() {
    setError("");
    try {
      const auth = await api<AuthMe>("/auth/me");
      if (!auth.authenticated) {
        router.push("/signin");
        return;
      }
      const d = await api<DashboardResponse>("/dashboard");
      setData(d);

      // Framework coverage is reported per scan; show it for the most recent one.
      const latest = d.accounts
        .filter((a) => a.latest_scan)
        .sort(
          (a, b) =>
            new Date(b.latest_scan!.created_at).getTime() - new Date(a.latest_scan!.created_at).getTime(),
        )[0];
      if (latest?.latest_scan) {
        api<ComplianceCoverage>(`/compliance/scans/${latest.latest_scan.scan_id}/coverage`)
          .then(setCoverage)
          .catch(() => setCoverage(null));
      } else {
        setCoverage(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const totals = data?.totals;

  /** Sweep every active account that has been connected. */
  async function runAllScans() {
    const targets = accounts.filter((a) => a.is_active);
    if (targets.length === 0) {
      router.push("/accounts");
      return;
    }
    setScanning(true);
    setNotice("");
    try {
      await Promise.all(
        targets.map((a) =>
          api("/scans/run", {
            method: "POST",
            body: JSON.stringify({ account_id: a.id, region: a.region || "us-east-1" }),
          }),
        ),
      );
      setNotice(`Sweep started across ${targets.length} account${targets.length === 1 ? "" : "s"} — refreshing shortly.`);
      setTimeout(() => {
        setNotice("");
        load();
      }, 4000);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not start the sweep");
    } finally {
      setScanning(false);
    }
  }

  const scanned = accounts.filter((a) => a.latest_scan);
  const lastSweep = relativeTime(
    scanned
      .map((a) => a.latest_scan!.created_at)
      .sort()
      .reverse()[0],
  );

  // Portfolio posture: pass rate weighted by checks run, across every scanned account.
  const portfolio = useMemo(() => {
    const withFindings = accounts.filter((a) => a.findings_summary.total > 0);
    if (withFindings.length === 0) return null;
    const checks = withFindings.reduce((sum, a) => sum + a.findings_summary.total, 0);
    const passing = withFindings.reduce((sum, a) => sum + a.findings_summary.pass, 0);
    const score = Math.round((passing / checks) * 100);

    const ranked = [...withFindings].sort(
      (a, b) => b.findings_summary.pass_rate - a.findings_summary.pass_rate,
    );
    return { score, best: ranked[0], worst: ranked[ranked.length - 1], accounts: withFindings.length };
  }, [accounts]);

  const openTotal = totals ? totals.critical + totals.high + totals.medium + totals.low : 0;

  // Accounts ranked by blast radius — critical first, then high, then total open.
  const attention = useMemo(
    () =>
      accounts
        .filter((a) => a.findings_summary.CRITICAL + a.findings_summary.HIGH > 0)
        .sort((a, b) => {
          const x = a.findings_summary;
          const y = b.findings_summary;
          return y.CRITICAL - x.CRITICAL || y.HIGH - x.HIGH || y.total - x.total;
        })
        .slice(0, 5),
    [accounts],
  );

  return (
    <>
      <TopbarActions>
        <button type="button" className="vc-btn" onClick={() => load()} disabled={loading}>
          Refresh
        </button>
        <button type="button" className="vc-btn-primary" onClick={runAllScans} disabled={scanning}>
          {scanning ? "Starting…" : "Run scan"}
        </button>
      </TopbarActions>

      <div className="vc-page-head">
        <div>
          <h1 className="vc-h1">Posture overview</h1>
          <p className="vc-sub">
            {loading
              ? "Loading your portfolio…"
              : `${totals?.accounts ?? 0} AWS account${totals?.accounts === 1 ? "" : "s"} connected${
                  lastSweep ? ` · last sweep ${lastSweep}` : " · no scans yet"
                }`}
          </p>
        </div>
      </div>

      {notice && <div className="vc-note vc-note-info">{notice}</div>}
      {error && <div className="vc-note vc-note-error">{error}</div>}

      {/* ── Stat tiles ───────────────────────────────────────────── */}
      <div className="vc-grid vc-grid-4">
        <div className="vc-card">
          <div className="vc-stat-label">Accounts monitored</div>
          <div className="vc-stat">{loading ? "—" : totals?.accounts ?? 0}</div>
          <div className="vc-stat-note">
            {scanned.length} scanned · {accounts.length - scanned.length} awaiting first scan
          </div>
        </div>
        <div className="vc-card">
          <div className="vc-stat-label">Critical open</div>
          <div className={`vc-stat ${totals?.critical ? "vc-sev-critical" : ""}`}>
            {loading ? "—" : totals?.critical ?? 0}
          </div>
          <div className="vc-stat-note">Fix today</div>
        </div>
        <div className="vc-card">
          <div className="vc-stat-label">High open</div>
          <div className={`vc-stat ${totals?.high ? "vc-sev-high" : ""}`}>{loading ? "—" : totals?.high ?? 0}</div>
          <div className="vc-stat-note">Fix this sprint</div>
        </div>
        <div className="vc-card">
          <div className="vc-stat-label">Medium · Low</div>
          <div className="vc-stat">
            {loading ? "—" : `${totals?.medium ?? 0} · ${totals?.low ?? 0}`}
          </div>
          <div className="vc-stat-note">Track and schedule</div>
        </div>
      </div>

      {/* ── Posture + severity mix ───────────────────────────────── */}
      <div className="vc-grid" style={{ gridTemplateColumns: "344px 1fr" }}>
        <div className="vc-card">
          <div className="vc-stat-label !mb-4">Portfolio posture</div>
          {portfolio ? (
            <div className="flex items-center gap-[22px]">
              <PostureDial
                score={portfolio.score}
                grade={gradeFor(portfolio.score)}
                tone={scoreTone(portfolio.score)}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-[11px]">
                <div className="text-[13.5px] leading-[1.45] tracking-[-0.15px] text-[var(--vc-text-2)] text-pretty">
                  Checks passing across {portfolio.accounts} scanned account
                  {portfolio.accounts === 1 ? "" : "s"}.
                </div>
                <div className="flex items-center justify-between border-t border-[var(--vc-hairline)] pt-[11px]">
                  <span className="truncate text-[12.5px] text-[var(--vc-muted)]">
                    Best · {portfolio.best.customer_name}
                  </span>
                  <span className={`text-[12.5px] font-semibold ${scoreTone(portfolio.best.findings_summary.pass_rate)}`}>
                    {gradeFor(portfolio.best.findings_summary.pass_rate)} · {portfolio.best.findings_summary.pass_rate}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="truncate text-[12.5px] text-[var(--vc-muted)]">
                    Worst · {portfolio.worst.customer_name}
                  </span>
                  <span className={`text-[12.5px] font-semibold ${scoreTone(portfolio.worst.findings_summary.pass_rate)}`}>
                    {gradeFor(portfolio.worst.findings_summary.pass_rate)} ·{" "}
                    {portfolio.worst.findings_summary.pass_rate}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="vc-empty !px-0">Run a scan to see your portfolio grade.</div>
          )}
        </div>

        <div className="vc-card flex flex-col">
          <div className="mb-1.5 flex items-baseline justify-between">
            <div className="vc-stat-label !mb-0">Open findings by severity</div>
            <span className="text-xs text-[var(--vc-muted)]">Across all connected accounts</span>
          </div>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-[32px] font-semibold tracking-[-0.9px] text-[var(--vc-text)]">
              {loading ? "—" : openTotal}
            </span>
            <span className="text-[13px] text-[var(--vc-muted)]">open across the portfolio</span>
          </div>

          <div className="flex flex-1 flex-col justify-center gap-4">
            {SEVERITIES.map(({ key, label, cls }) => {
              const count = totals ? (totals[key.toLowerCase() as "critical"] as number) : 0;
              const pct = openTotal > 0 ? Math.round((count / openTotal) * 100) : 0;
              return (
                <div key={key}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-[13.5px] font-semibold tracking-[-0.2px] text-[var(--vc-text)]">
                      {label}
                    </span>
                    <span className={`text-[13px] font-semibold ${count > 0 ? cls : "text-[var(--vc-dim)]"}`}>
                      {count}
                    </span>
                  </div>
                  <div className={`vc-meter ${cls}`}>
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1.5 text-[11.5px] text-[var(--vc-dim)]">{pct}% of open findings</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Attention list + framework coverage ──────────────────── */}
      <div className="vc-grid" style={{ gridTemplateColumns: "1fr 380px" }}>
        <div className="vc-card vc-card-flush">
          <div className="vc-card-head">
            <div>
              <div className="vc-card-title">Needs attention now</div>
              <div className="vc-card-sub">Ranked by blast radius, then volume</div>
            </div>
            <Link href="/findings" className="vc-link">
              View all {openTotal}
            </Link>
          </div>

          {loading ? (
            <div className="p-5">
              <div className="vc-skel h-14 w-full" />
            </div>
          ) : attention.length === 0 ? (
            <div className="vc-empty">
              {scanned.length === 0
                ? "No scans yet — run a sweep to surface findings."
                : "Nothing critical or high is open. Clean portfolio."}
            </div>
          ) : (
            attention.map((a) => {
              const s = a.findings_summary;
              const tone = s.CRITICAL > 0 ? "vc-sev-critical" : "vc-sev-high";
              return (
                <div key={a.id} className="vc-list-row">
                  <span className={`vc-dot ${tone}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold tracking-[-0.2px] text-[var(--vc-text)]">
                      {s.CRITICAL > 0
                        ? `${s.CRITICAL} critical finding${s.CRITICAL === 1 ? "" : "s"} open`
                        : `${s.HIGH} high finding${s.HIGH === 1 ? "" : "s"} open`}
                    </div>
                    <div className="vc-mono mt-0.5 truncate text-xs text-[var(--vc-muted)]">
                      {a.customer_name} · {a.account_name} · {a.aws_account_id}
                    </div>
                  </div>
                  <span className="hidden w-16 text-right text-xs text-[var(--vc-muted)] sm:block">
                    {relativeTime(a.latest_scan?.created_at) ?? "—"}
                  </span>
                  {a.latest_scan && (
                    <Link href={`/scans/${a.latest_scan.scan_id}`} className="vc-btn vc-btn-xs">
                      Fix
                    </Link>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="vc-card">
          <div className="vc-card-title">Framework coverage</div>
          <div className="vc-card-sub mb-5">
            {coverage ? "Controls satisfied on the latest scan" : "Available after your first scan"}
          </div>

          <div className="flex flex-col gap-4">
            {FRAMEWORKS.map(([key, label]) => {
              const fw: CoverageFramework | undefined = coverage?.coverage[key];
              const pct = fw?.pct ?? 0;
              const tone = !fw ? "text-[var(--vc-dim)]" : pct >= 80 ? "vc-ok" : pct >= 60 ? "vc-sev-high" : "vc-sev-critical";
              return (
                <div key={key}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-[13.5px] font-semibold tracking-[-0.2px] text-[var(--vc-text)]">
                      {label}
                    </span>
                    <span className={`text-[13px] font-semibold ${tone}`}>{fw ? `${pct}%` : "—"}</span>
                  </div>
                  <div className={`vc-meter ${fw ? tone : ""}`}>
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1.5 text-[11.5px] text-[var(--vc-dim)]">
                    {fw ? `${fw.passing} of ${fw.total_controls} controls` : "No data"}
                  </div>
                </div>
              );
            })}
          </div>

          <Link href="/scans" className="vc-btn-secondary vc-btn-block mt-5 !h-9">
            Download evidence pack
          </Link>
        </div>
      </div>

      {/* ── Accounts ─────────────────────────────────────────────── */}
      <div className="mt-1.5 flex items-center justify-between">
        <div className="vc-card-title">Accounts</div>
        <Link href="/accounts" className="vc-link">
          Manage all {accounts.length}
        </Link>
      </div>

      {loading ? (
        <div className="vc-grid vc-grid-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="vc-skel h-44" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="vc-card flex flex-col items-center gap-4 py-14 text-center">
          <div className="vc-card-title">No accounts connected</div>
          <p className="vc-sub max-w-sm">
            Connect an AWS account with a read-only role to start seeing posture data.
          </p>
          <Link href="/accounts" className="vc-btn-primary vc-btn-lg">
            Connect account
          </Link>
        </div>
      ) : (
        <div className="vc-grid vc-grid-3">
          {accounts.map((a) => (
            <AccountCard key={a.id} account={a} />
          ))}
        </div>
      )}
    </>
  );
}
