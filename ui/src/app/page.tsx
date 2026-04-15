"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppTopNav from "@/components/AppTopNav";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type Account = {
  id: number;
  customer_name: string;
  account_name: string;
  aws_account_id: string;
  region: string;
  status: string;
  is_active: boolean;
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
    throw new Error(`Request failed: ${res.status}`);
  }

  return res.json();
}

export default function HomePage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [plan, setPlan] = useState("free");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const auth = await api<AuthMe>("/auth/me");
        if (auth.authenticated) {
          setAuthenticated(true);
          setPlan(auth.user?.subscription_status || "free");

          const [accountsData, billingData] = await Promise.all([
            api<{ accounts: Account[] }>("/accounts"),
            api<BillingMe>("/billing/me"),
          ]);

          setAccounts(accountsData.accounts || []);
          setBilling(billingData);
        } else {
          setAuthenticated(false);
          setAccounts([]);
          setBilling(null);
          setPlan("free");
        }
      } catch {
        setAuthenticated(false);
        setAccounts([]);
        setBilling(null);
        setPlan("free");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.is_active).length,
    [accounts]
  );

  const accountUsage = billing
    ? `${billing.connected_accounts_used}/${billing.account_limit}`
    : "-";

  const billingMode = billing?.stripe?.mode?.toUpperCase() || "TEST";
  const checkoutReady = billing?.stripe?.checkout_ready ?? true;
  const webhookReady = billing?.stripe?.webhook_configured ?? true;

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10 px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <AppTopNav />

          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div>
              <div className="mb-5 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                AWS security posture workflow
              </div>

              <h1 className="max-w-4xl text-5xl font-bold leading-tight tracking-tight md:text-6xl">
                AWS misconfiguration detection for teams that need fast visibility,
                clear remediation, and a lightweight pilot-ready workflow.
              </h1>

              <p className="mt-6 max-w-3xl text-lg leading-8 text-neutral-300">
                VigiliCloud helps teams connect AWS accounts, run focused
                posture checks, review findings, capture remediation actions, export
                structured evidence, and move toward customer demos, paid pilots,
                and launch readiness.
              </p>

              <div className="mt-6 flex flex-wrap gap-2 text-xs text-neutral-300">
                {[
                  "AWS-only MVP",
                  "Account-linked scans",
                  "Fix guidance + actions",
                  "CSV / JSON exports",
                  "Stripe checkout + portal",
                  "Launch prep dashboard",
                ].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1"
                  >
                    {item}
                  </span>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={authenticated ? "/scans" : "/onboarding"}
                  className="rounded-2xl bg-white px-6 py-3 font-medium text-black"
                >
                  Go to Product
                </Link>
                <Link
                  href="/plans"
                  className="rounded-2xl border border-white/10 px-6 py-3 hover:bg-white/5"
                >
                  View Pricing
                </Link>
                <Link
                  href="/launch"
                  className="rounded-2xl border border-white/10 px-6 py-3 hover:bg-white/5"
                >
                  Open Launch Prep
                </Link>
              </div>

              <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="text-sm text-neutral-400">Checks Live</div>
                  <div className="mt-2 text-4xl font-bold">4+</div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="text-sm text-neutral-400">Connected Accounts</div>
                  <div className="mt-2 text-4xl font-bold">
                    {loading ? "..." : accounts.length}
                  </div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="text-sm text-neutral-400">Active Accounts</div>
                  <div className="mt-2 text-4xl font-bold">
                    {loading ? "..." : activeAccounts}
                  </div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="text-sm text-neutral-400">Account Usage</div>
                  <div className="mt-2 text-4xl font-bold">
                    {loading ? "..." : accountUsage}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-2xl shadow-emerald-950/10">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-sm text-neutral-400">Launch Snapshot</div>
                  <div className="text-2xl font-semibold">Workspace + Readiness</div>
                </div>
                <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                  {authenticated ? "Authenticated" : "Preview"}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
                <div className="text-sm text-neutral-400">Current Plan</div>
                <div className="mt-2 text-5xl font-bold uppercase">
                  {loading ? "..." : plan}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
                  <div className="text-sm text-neutral-400">Billing Mode</div>
                  <div className="mt-2 text-4xl font-bold">{billingMode}</div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
                  <div className="text-sm text-neutral-400">Launch Status</div>
                  <div className="mt-2 text-4xl font-bold">Pilot Ready</div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
                  <div className="text-sm text-neutral-400">Checkout</div>
                  <div className="mt-2 text-sm">
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-300">
                      {checkoutReady ? "Configured" : "Pending"}
                    </span>
                  </div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
                  <div className="text-sm text-neutral-400">Webhook</div>
                  <div className="mt-2 text-sm">
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-300">
                      {webhookReady ? "Configured" : "Pending"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-3xl border border-white/10 bg-black/40 p-5">
                <div className="mb-3 text-sm text-neutral-400">
                  What you can show in a live demo
                </div>
                <ul className="space-y-2 text-sm text-neutral-300">
                  <li>• connect AWS accounts and validate access</li>
                  <li>• run account-linked scans and review findings</li>
                  <li>• capture resolution notes and remediation actions</li>
                  <li>• export scan results as JSON or CSV</li>
                  <li>• show Stripe-backed billing and launch prep workflow</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <div className="mb-4 text-xs uppercase tracking-[0.25em] text-neutral-500">
              Why this product
            </div>
            <h2 className="text-4xl font-bold">
              A lightweight AWS security workflow for focused teams
            </h2>
            <p className="mt-5 text-lg leading-8 text-neutral-300">
              This product is designed to stay small, useful, and demo-ready:
              connect accounts, run focused checks, show remediation guidance,
              export evidence, and prepare for paid pilots without enterprise complexity.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                num: "01",
                title: "Solo cloud consultant",
                desc: "Run focused AWS scans for client environments and export structured evidence quickly.",
              },
              {
                num: "02",
                title: "Startup security lead",
                desc: "Track public exposure and risky posture issues before customer or compliance reviews.",
              },
              {
                num: "03",
                title: "Managed service provider",
                desc: "Use a lightweight recurring workflow for multi-account AWS compliance monitoring.",
              },
            ].map((card) => (
              <div
                key={card.num}
                className="rounded-3xl border border-white/10 bg-white/5 p-6"
              >
                <div className="text-xs text-neutral-500">{card.num}</div>
                <h3 className="mt-3 text-3xl font-semibold">{card.title}</h3>
                <p className="mt-4 text-neutral-300">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
            <div className="mb-4 text-xs uppercase tracking-[0.25em] text-neutral-500">
              Founder-ready offer
            </div>
            <h2 className="text-4xl font-bold">
              Use this to position your first paid pilot
            </h2>
            <p className="mt-4 text-lg text-neutral-300">
              Position VigiliCloud as an AWS-native security posture workflow for startups,
              security-conscious teams, and MSPs that need fast visibility without
              a heavyweight platform.
            </p>

            <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="font-semibold">$2,500 pilot example</div>
              <div className="mt-2 text-sm text-neutral-400">
                Scan up to 2 AWS accounts, identify misconfigurations, review findings,
                track remediation actions, and export structured evidence for internal
                or customer review.
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
            <div className="mb-4 text-xs uppercase tracking-[0.25em] text-neutral-500">
              Final launch checklist
            </div>
            <h2 className="text-4xl font-bold">Launch checklist</h2>

            <div className="mt-8 space-y-3 text-sm text-neutral-300">
              <div>• custom domain cutover</div>
              <div>• final QA pass</div>
              <div>• demo video</div>
              <div>• clean product screenshots</div>
              <div>• customer onboarding instructions</div>
              <div>• pilot outreach</div>
            </div>

            <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              VigiliCloud is now pilot-ready. The remaining work is branding, domain cutover, and launch polish.
            </div>
          </div>
        </div>

        <div className="mx-auto mt-6 grid max-w-7xl gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
            <div className="mb-4 text-xs uppercase tracking-[0.25em] text-neutral-500">
              Next step
            </div>
            <h2 className="text-4xl font-bold">Ready to launch VigiliCloud publicly?</h2>
            <p className="mt-4 text-lg text-neutral-300">
              VigiliCloud is now in launch-polish mode.
              Use Launch Prep for final QA, outreach, and demo execution.
            </p>

            <div className="mt-8 space-y-3">
              <Link
                href="/launch"
                className="block rounded-2xl bg-white px-5 py-4 text-center font-medium text-black"
              >
                Open Launch Prep
              </Link>
              <Link
                href="/plans"
                className="block rounded-2xl border border-white/10 px-5 py-4 text-center hover:bg-white/5"
              >
                Compare Plans
              </Link>
              <Link
                href="/scans"
                className="block rounded-2xl border border-white/10 px-5 py-4 text-center hover:bg-white/5"
              >
                Open Scans
              </Link>
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
            <div className="mb-4 text-xs uppercase tracking-[0.25em] text-neutral-500">
              Internal note
            </div>
            <h2 className="text-4xl font-bold">What is already strong</h2>

            <div className="mt-8 space-y-3">
              {[
                "billing-aware plans page",
                "working account onboarding and testing",
                "linked scan history and findings",
                "fix guidance and remediation actions",
                "exportable evidence",
                "launch prep dashboard",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-neutral-300"
                >
                  • {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer className="mx-auto mt-16 flex max-w-7xl flex-col gap-4 border-t border-white/10 pt-6 text-sm text-neutral-500 md:flex-row md:items-center md:justify-between">
          <div>VigiliCloud</div>
          <div className="flex gap-4">
            <Link href="/">Home</Link>
            <Link href="/plans">Plans</Link>
            <Link href="/accounts">Accounts</Link>
            <Link href="/scans">Scans</Link>
            <Link href="/launch">Launch Prep</Link>
            <Link href="/settings">Settings</Link>
          </div>
        </footer>
      </section>
    </main>
  );
}