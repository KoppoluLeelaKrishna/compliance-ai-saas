"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type HealthResponse = {
  ok: boolean;
  app_env: string;
  frontend_url: string;
  cookie_secure: boolean;
  stripe: {
    configured: boolean;
    mode: string;
    webhook_configured: boolean;
    checkout_ready: boolean;
  };
};

type AuthMe = {
  authenticated: boolean;
  user?: {
    id: number;
    email: string;
    name: string;
    role: string;
    subscription_status?: string;
  };
};

type BillingMe = {
  subscription_status: string;
  account_limit: number;
  connected_accounts_used: number;
  stripe?: {
    configured: boolean;
    mode: string;
    webhook_configured: boolean;
    checkout_ready: boolean;
  };
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
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || `Request failed: ${res.status}`);
  }

  return data;
}

function copyText(text: string) {
  navigator.clipboard.writeText(text);
}

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
          } else {
            setAuthenticated(false);
          }
        } catch {
          setAuthenticated(false);
          setBilling(null);
          setAccounts([]);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.is_active).length,
    [accounts]
  );

  const qaChecks = [
    {
      label: "Backend health endpoint",
      done: !!health?.ok,
      detail: health?.ok ? `Healthy (${health.app_env})` : "Still needs validation",
    },
    {
      label: "Stripe checkout readiness",
      done: !!health?.stripe?.checkout_ready,
      detail: health?.stripe?.checkout_ready
        ? `Ready in ${health?.stripe?.mode?.toUpperCase()} mode`
        : "Stripe checkout not ready",
    },
    {
      label: "Webhook readiness",
      done: !!health?.stripe?.webhook_configured,
      detail: health?.stripe?.webhook_configured
        ? "Webhook secret configured"
        : "Webhook still not configured",
    },
    {
      label: "Authenticated workspace access",
      done: authenticated,
      detail: authenticated ? "Login/session working" : "Login state not active in this browser session",
    },
    {
      label: "Connected account setup",
      done: accounts.length > 0,
      detail: accounts.length > 0 ? `${accounts.length} account(s) available` : "No connected accounts available",
    },
    {
      label: "Public deployment",
      done: false,
      detail: "Still pending: move from localhost to real hosted frontend/backend",
    },
  ];

  const demoScript = `1. Open the homepage and explain the AWS-only posture-checking focus.
2. Open Accounts and show connected account management.
3. Test role-based connection on an account.
4. Open Scans and run a linked scan.
5. Review findings, fix guidance, actions, and exports.
6. Open Plans and show Stripe-backed pricing and billing readiness.
7. Open Launch Prep and show final QA plus launch readiness.`;

  const outreachTemplate = `Hi [Name],

I built VigiliCloud, an AWS-focused compliance workflow that helps teams connect AWS accounts, detect misconfigurations, review findings, track remediation actions, and export structured evidence.
The current product already supports:
- connected AWS accounts
- account-linked scans
- remediation tracking
- exports
- Stripe-backed billing flow

I am opening pilot conversations for MSPs and startups preparing for SOC2 or customer security reviews.

Would you be open to a short 10-minute demo?

Best,
Leela`;

  const launchAssets = [
    "homepage screenshot",
    "plans screenshot",
    "accounts screenshot",
    "scans screenshot",
    "launch prep screenshot",
    "short demo video",
    "pilot outreach message",
  ];

  function handleCopy(text: string, label: string) {
    copyText(text);
    setCopyMessage(`${label} copied`);
    setTimeout(() => setCopyMessage(""), 1800);
  }

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Launch Prep</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Final public launch polish, QA visibility, and founder-ready launch assets.
          </p>
        </div>

        {copyMessage ? (
          <div className="mb-5 rounded-2xl border border-emerald-700 bg-emerald-950 px-4 py-3 text-sm text-emerald-200">
            {copyMessage}
          </div>
        ) : null}

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Backend Health</div>
            <div className="mt-2 text-3xl font-bold">
              {loading ? "..." : health?.ok ? "OK" : "Check"}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Billing Mode</div>
            <div className="mt-2 text-3xl font-bold uppercase">
              {loading ? "..." : health?.stripe?.mode || "unknown"}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Connected Accounts</div>
            <div className="mt-2 text-3xl font-bold">{loading ? "..." : accounts.length}</div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Active Accounts</div>
            <div className="mt-2 text-3xl font-bold">{loading ? "..." : activeAccounts}</div>
          </div>
        </div>

        <div className="mb-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-3xl border border-neutral-800 bg-neutral-950 p-6">
            <div className="mb-4 text-xs uppercase tracking-[0.25em] text-neutral-500">
              Final QA status
            </div>
            <h2 className="text-3xl font-bold">What to verify before public launch</h2>
            <div className="mt-6 space-y-4">
              {qaChecks.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-white/10 bg-black p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="font-semibold">{item.label}</div>
                      <div className="mt-2 text-sm text-neutral-400">{item.detail}</div>
                    </div>

                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs ${
                        item.done
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
                      }`}
                    >
                      {item.done ? "Done" : "Pending"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-neutral-800 bg-neutral-950 p-6">
            <div className="mb-4 text-xs uppercase tracking-[0.25em] text-neutral-500">
              Environment snapshot
            </div>
            <h2 className="text-3xl font-bold">Current backend and billing state</h2>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black p-4">
                <div className="text-sm text-neutral-400">App Environment</div>
                <div className="mt-2 text-2xl font-bold uppercase">
                  {loading ? "..." : health?.app_env || "-"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black p-4">
                <div className="text-sm text-neutral-400">Frontend URL</div>
                <div className="mt-2 break-all text-sm text-neutral-200">
                  {loading ? "..." : health?.frontend_url || "-"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black p-4">
                <div className="text-sm text-neutral-400">Cookie Secure</div>
                <div className="mt-2 text-2xl font-bold">
                  {loading ? "..." : health?.cookie_secure ? "TRUE" : "FALSE"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black p-4">
                <div className="text-sm text-neutral-400">Current Plan</div>
                <div className="mt-2 text-2xl font-bold uppercase">
                  {loading ? "..." : billing?.subscription_status || "free"}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="mb-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-3xl border border-neutral-800 bg-neutral-950 p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">
                  Demo script
                </div>
                <h2 className="mt-2 text-3xl font-bold">Use this for pilot calls</h2>
              </div>

              <button
                onClick={() => handleCopy(demoScript, "Demo script")}
                className="rounded-2xl border border-neutral-800 px-4 py-2 text-sm hover:bg-neutral-900"
              >
                Copy
              </button>
            </div>

            <pre className="overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black p-4 text-sm leading-7 text-neutral-300">
              {demoScript}
            </pre>
          </section>

          <section className="rounded-3xl border border-neutral-800 bg-neutral-950 p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">
                  Outreach template
                </div>
                <h2 className="mt-2 text-3xl font-bold">Use this for first pilot outreach</h2>
              </div>

              <button
                onClick={() => handleCopy(outreachTemplate, "Outreach template")}
                className="rounded-2xl border border-neutral-800 px-4 py-2 text-sm hover:bg-neutral-900"
              >
                Copy
              </button>
            </div>

            <pre className="overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black p-4 text-sm leading-7 text-neutral-300">
              {outreachTemplate}
            </pre>
          </section>
        </div>

        <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-3xl border border-neutral-800 bg-neutral-950 p-6">
            <div className="mb-4 text-xs uppercase tracking-[0.25em] text-neutral-500">
              Launch assets
            </div>
            <h2 className="text-3xl font-bold">What to prepare before announcing publicly</h2>

            <div className="mt-6 space-y-3">
              {launchAssets.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-neutral-300"
                >
                  • {item}
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              Treat this page as the VigiliCloud founder launch board: QA status, demo flow, copy, and asset checklist in one place.
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-800 bg-neutral-950 p-6">
            <div className="mb-4 text-xs uppercase tracking-[0.25em] text-neutral-500">
              Quick navigation
            </div>
            <h2 className="text-3xl font-bold">What to open during a demo</h2>

            <div className="mt-6 space-y-3">
              <Link
                href="/"
                className="block rounded-2xl border border-white/10 px-5 py-4 text-center hover:bg-white/5"
              >
                Homepage
              </Link>
              <Link
                href="/accounts"
                className="block rounded-2xl border border-white/10 px-5 py-4 text-center hover:bg-white/5"
              >
                Accounts
              </Link>
              <Link
                href="/scans"
                className="block rounded-2xl border border-white/10 px-5 py-4 text-center hover:bg-white/5"
              >
                Scans
              </Link>
              <Link
                href="/plans"
                className="block rounded-2xl border border-white/10 px-5 py-4 text-center hover:bg-white/5"
              >
                Plans
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}