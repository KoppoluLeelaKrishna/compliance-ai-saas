"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import TopbarActions from "@/components/app/TopbarActions";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type HealthResponse = {
  ok: boolean;
  app_env: string;
  frontend_url: string;
  cookie_secure: boolean;
  razorpay: {
    configured: boolean;
    webhook_configured: boolean;
    checkout_ready: boolean;
  };
};

type AuthMe = {
  authenticated: boolean;
  user?: { id: number; email: string; name: string; role: string };
};

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
  region: string;
  status: string;
  is_active: boolean;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || `Request failed: ${res.status}`);
  return data;
}

function copyText(text: string) { navigator.clipboard.writeText(text); }

/** The demo, beat by beat — each row opens the page it talks about. */
const DEMO_BEATS = [
  { at: "0:00", href: "/",          title: "Open on the story",       desc: "AWS-only posture, ten checks, one grade." },
  { at: "0:50", href: "/accounts",  title: "Connect an account live", desc: "Read-only role, about forty seconds." },
  { at: "1:40", href: "/dashboard", title: "Show the portfolio",      desc: "Grade, open findings, what to fix now." },
  { at: "2:10", href: "/scans",     title: "Run the scan on stage",   desc: "Ten checks streaming in real time." },
  { at: "3:40", href: "/findings",  title: "Open a critical finding", desc: "Console path, CLI, Terraform." },
  { at: "4:40", href: "/scans",     title: "Claude summarises",       desc: "Priority order in plain English." },
  { at: "5:30", href: "/plans",     title: "Close on pricing",        desc: "Per workspace, not per finding." },
];

const LAUNCH_ASSETS = [
  { label: "Client pitch deck", kind: "PPTX" },
  { label: "Explainer video · 90s", kind: "MP4" },
  { label: "Marketing deck", kind: "PPTX" },
  { label: "Speaker script", kind: "MD" },
  { label: "Internal roadmap", kind: "PPTX" },
];

export default function LaunchPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const healthData = await api<HealthResponse>("/health");
        setHealth(healthData);
        try {
          const auth = await api<AuthMe>("/auth/me");
          if (auth.authenticated) {
            setAuthenticated(true);
            const [billingData, accountsData] = await Promise.all([
              api<BillingMe>("/billing/me"),
              api<{ accounts: Account[] }>("/accounts"),
            ]);
            setBilling(billingData);
            setAccounts(accountsData.accounts || []);
          }
        } catch { setAuthenticated(false); }
      } finally { setLoading(false); }
    })();
  }, []);

  const activeAccounts = useMemo(() => accounts.filter(a => a.is_active).length, [accounts]);

  const qaChecks = [
    { label: "Backend health endpoint",      done: !!health?.ok,                        detail: health?.ok ? `Healthy (${health.app_env})` : "Needs validation" },
    { label: "Razorpay checkout readiness",  done: !!health?.razorpay?.checkout_ready,  detail: health?.razorpay?.checkout_ready ? "Keys + plan IDs configured" : "Checkout not ready" },
    { label: "Webhook configured",           done: !!health?.razorpay?.webhook_configured, detail: health?.razorpay?.webhook_configured ? "Webhook secret set" : "Webhook not configured" },
    { label: "Authenticated session",        done: authenticated,                        detail: authenticated ? "Login and session working" : "Not logged in this session" },
    { label: "Connected AWS account",        done: accounts.length > 0,                 detail: accounts.length > 0 ? `${accounts.length} account(s) connected` : "No accounts connected" },
    { label: "Public deployment",            done: !!health?.frontend_url && !health.frontend_url.includes("localhost"), detail: health?.frontend_url && !health.frontend_url.includes("localhost") ? `Live at ${health.frontend_url}` : "Still on localhost" },
  ];

  const doneCount = qaChecks.filter(c => c.done).length;

  const demoScript = `1. Open the homepage — explain AWS-only posture-checking focus.
2. Open Accounts — show connected account management.
3. Test role-based connection on an account.
4. Open Scans — run a linked scan.
5. Review findings, fix guidance, actions, and exports.
6. Open Plans — show Razorpay-backed pricing and billing readiness.
7. Open Launch Prep — show final QA and launch readiness.`;

  const outreachTemplate = `Hi [Name],

I built VigiliCloud, an AWS-focused compliance workflow that helps teams connect AWS accounts, detect misconfigurations, review findings, track remediation actions, and export structured evidence.

The product already supports:
- Connected AWS accounts
- Account-linked scans
- AI-powered security analysis
- Remediation tracking + approval gates
- Exports (CSV, JSON, PDF evidence pack)
- Razorpay-backed billing (live)

Opening pilot conversations for MSPs and startups preparing for SOC 2 or customer security reviews.

Would you be open to a short 10-minute demo?

Best,
Leela`;

  function handleCopy(text: string, label: string) {
    copyText(text);
    setCopyMessage(`${label} copied`);
    setTimeout(() => setCopyMessage(""), 2000);
  }


  const pct = Math.round((doneCount / qaChecks.length) * 100);
  const blockers = qaChecks.filter(c => !c.done).length;

  return (
    <>
      <TopbarActions>
        <button type="button" className="vc-btn" onClick={() => handleCopy(demoScript, "Demo script")}>
          Copy demo script
        </button>
        <button type="button" className="vc-btn-primary" onClick={() => window.location.reload()}>
          Re-run readiness check
        </button>
      </TopbarActions>

      <div className="vc-page-head">
        <div>
          <h1 className="vc-h1">Launch readiness</h1>
          <p className="vc-sub">
            {loading
              ? "Checking environment…"
              : blockers === 0
              ? `All ${qaChecks.length} checks green. Ready to go live.`
              : `${doneCount} of ${qaChecks.length} checks green. ${blockers} left before go-live.`}
          </p>
        </div>
        <div className="flex items-center gap-3.5">
          <div className={`vc-meter vc-meter-thick w-[220px] ${pct === 100 ? "vc-ok" : pct >= 60 ? "vc-sev-high" : "vc-sev-critical"}`}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[15px] font-semibold text-[var(--vc-text)]">{pct}%</span>
        </div>
      </div>

      {copyMessage && <div className="vc-note vc-note-success">{copyMessage}</div>}

      <div className="vc-grid" style={{ gridTemplateColumns: "1.25fr 1fr 1fr" }}>

        {/* ── QA status ────────────────────────────────────────────────── */}
        <div className="vc-card vc-card-flush">
          <div className="vc-card-head">
            <div>
              <div className="vc-card-title">QA status</div>
              <div className="vc-card-sub">Live checks against the running environment</div>
            </div>
          </div>

          {qaChecks.map(item => (
            <div
              key={item.label}
              className="flex items-center gap-3 border-b border-[var(--vc-hairline-soft)] px-[22px] py-[13px] last:border-b-0"
              style={item.done ? undefined : { background: "rgba(255,69,58,0.05)" }}
            >
              <span
                className={`flex h-4 w-4 flex-none items-center justify-center rounded-full ${item.done ? "vc-ok" : "vc-sev-critical"}`}
                style={{ background: "color-mix(in srgb, currentColor 16%, transparent)" }}
              >
                {item.done ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                ) : (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] text-[var(--vc-text)]">{item.label}</div>
                <div className="mt-0.5 truncate text-[11.5px] text-[var(--vc-dim)]">{item.detail}</div>
              </div>
              <span className={`flex-none text-xs font-semibold ${item.done ? "text-[var(--vc-dim)]" : "vc-sev-critical"}`}>
                {item.done ? "Green" : "Blocker"}
              </span>
            </div>
          ))}

          <div className="vc-card-foot">
            <div className="vc-eyebrow mb-3">Environment</div>
            <dl className="flex flex-col gap-2">
              {[
                ["App environment", loading ? "…" : health?.app_env || "—"],
                ["Frontend URL", loading ? "…" : health?.frontend_url || "—"],
                ["Cookie secure", loading ? "…" : health?.cookie_secure ? "true" : "false"],
                ["Plan", loading ? "…" : (billing?.subscription_status || "free")],
                ["API endpoint", API_BASE],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="flex-none text-[11.5px] text-[var(--vc-dim)]">{label}</dt>
                  <dd className="vc-mono min-w-0 truncate text-right text-[11.5px] text-[var(--vc-text-2)]">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* ── Demo flow ────────────────────────────────────────────────── */}
        <div className="vc-card vc-card-flush">
          <div className="vc-card-head">
            <div>
              <div className="vc-card-title">Demo flow</div>
              <div className="vc-card-sub">Seven beats, end to end</div>
            </div>
          </div>

          <div className="py-1.5">
            {DEMO_BEATS.map(beat => (
              <Link
                key={beat.at}
                href={beat.href}
                className="flex gap-3.5 px-[22px] py-[13px] transition-colors hover:bg-[var(--vc-fill)]"
              >
                <span className="vc-mono w-[34px] flex-none text-[11.5px] text-[var(--vc-dim)]">{beat.at}</span>
                <div>
                  <div className="text-[13.5px] font-semibold text-[var(--vc-text)]">{beat.title}</div>
                  <div className="mt-0.5 text-xs leading-[1.45] text-[var(--vc-muted)]">{beat.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Assets + outreach ────────────────────────────────────────── */}
        <div className="flex flex-col gap-3.5">
          <div className="vc-card vc-card-flush">
            <div className="vc-card-head">
              <div className="vc-card-title">Assets</div>
            </div>
            {LAUNCH_ASSETS.map(asset => (
              <div
                key={asset.label}
                className="flex items-center gap-3 border-b border-[var(--vc-hairline-soft)] px-[22px] py-[13px] last:border-b-0"
              >
                <span className="flex-1 text-[13.5px] text-[var(--vc-text)]">{asset.label}</span>
                <span className="text-xs font-semibold text-[var(--vc-accent-text)]">{asset.kind}</span>
              </div>
            ))}
          </div>

          <div className="vc-card flex flex-1 flex-col">
            <div className="vc-card-title">Outreach</div>
            <div className="vc-card-sub mb-4">First-touch email for pilot conversations</div>
            <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--vc-hairline)] bg-[var(--vc-inset)] p-3.5 text-[12.5px] leading-[1.65] text-[var(--vc-text-2)]">
              {outreachTemplate}
            </pre>
            <button
              type="button"
              className="vc-btn-secondary vc-btn-block mt-3.5 !h-9"
              onClick={() => handleCopy(outreachTemplate, "Outreach template")}
            >
              Copy
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
