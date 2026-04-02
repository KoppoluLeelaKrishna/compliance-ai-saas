"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppTopNav from "@/components/AppTopNav";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

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
  stripe_customer_id: string;
  stripe_subscription_id: string;
  account_limit: number;
  connected_accounts_used: number;
  capabilities: {
    account_linked_scans: boolean;
    exports: boolean;
  };
  stripe?: {
    configured: boolean;
    mode: string;
    webhook_configured: boolean;
    checkout_ready: boolean;
    portal_ready: boolean;
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

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || `Request failed: ${res.status}`);
  }

  return data as T;
}

export default function SettingsPage() {
  const [user, setUser] = useState<AuthMe["user"] | null>(null);
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const auth = await api<AuthMe>("/auth/me");
        if (auth.authenticated && auth.user) {
          setUser(auth.user);
          const billingData = await api<BillingMe>("/billing/me");
          setBilling(billingData);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function syncBilling() {
    setSyncLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await api<BillingMe>("/billing/sync", { method: "POST" });
      setBilling(data);
      setMessage("Billing synced successfully.");
      setTimeout(() => setMessage(""), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Billing sync failed");
    } finally {
      setSyncLoading(false);
    }
  }

  async function openPortal() {
    setPortalLoading(true);
    setError("");
    try {
      const data = await api<{ url: string }>("/billing/portal", {
        method: "POST",
        body: JSON.stringify({ return_url: `${window.location.origin}/settings` }),
      });
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open billing portal");
      setPortalLoading(false);
    }
  }

  const currentPlan = (billing?.subscription_status || "free").toUpperCase();
  const isPaidPlan = billing?.subscription_status?.toLowerCase() !== "free";
  const stripeMode = billing?.stripe?.mode?.toUpperCase() || "—";

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <AppTopNav />

        <div className="mb-8">
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Account profile, billing status, plan capabilities, and workspace configuration.
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

        {/* Summary stats */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Current Plan</div>
            <div className="mt-2 text-3xl font-bold">
              {loading ? "..." : currentPlan}
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Account Usage</div>
            <div className="mt-2 text-3xl font-bold">
              {loading ? "..." : `${billing?.connected_accounts_used ?? 0}/${billing?.account_limit ?? 1}`}
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Stripe Mode</div>
            <div className="mt-2 text-3xl font-bold">
              {loading ? "..." : stripeMode}
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Exports</div>
            <div className="mt-2 text-3xl font-bold">
              {loading ? "..." : billing?.capabilities?.exports ? "Enabled" : "Locked"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* Account Profile */}
          <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
            <h2 className="mb-4 text-xl font-semibold">Account Profile</h2>

            {loading ? (
              <div className="rounded-xl border border-neutral-800 p-4 text-neutral-400">
                Loading profile...
              </div>
            ) : !user ? (
              <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-center text-neutral-400">
                Not authenticated.{" "}
                <Link href="/onboarding" className="underline">
                  Login
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-neutral-800 bg-black p-4">
                  <div className="text-sm text-neutral-400">Name</div>
                  <div className="mt-1 text-lg font-medium">{user.name}</div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-black p-4">
                  <div className="text-sm text-neutral-400">Email</div>
                  <div className="mt-1 text-lg font-medium">{user.email}</div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-black p-4">
                  <div className="text-sm text-neutral-400">Role</div>
                  <div className="mt-1 text-lg font-medium capitalize">{user.role}</div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-black p-4">
                  <div className="text-sm text-neutral-400">User ID</div>
                  <div className="mt-1 font-mono text-sm text-neutral-300">{user.id}</div>
                </div>
              </div>
            )}
          </section>

          {/* Billing & Plan */}
          <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
            <h2 className="mb-4 text-xl font-semibold">Billing & Plan</h2>

            {loading ? (
              <div className="rounded-xl border border-neutral-800 p-4 text-neutral-400">
                Loading billing...
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-neutral-800 bg-black p-4">
                  <div className="text-sm text-neutral-400">Subscription Status</div>
                  <div className="mt-1 text-2xl font-bold">{currentPlan}</div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-neutral-800 bg-black p-4">
                    <div className="text-sm text-neutral-400">Checkout Ready</div>
                    <div className="mt-1 font-medium">
                      {billing?.stripe?.checkout_ready ? (
                        <span className="text-emerald-400">Yes</span>
                      ) : (
                        <span className="text-red-400">No</span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-black p-4">
                    <div className="text-sm text-neutral-400">Webhook</div>
                    <div className="mt-1 font-medium">
                      {billing?.stripe?.webhook_configured ? (
                        <span className="text-emerald-400">Configured</span>
                      ) : (
                        <span className="text-red-400">Missing</span>
                      )}
                    </div>
                  </div>
                </div>

                {billing?.stripe_customer_id ? (
                  <div className="rounded-xl border border-neutral-800 bg-black p-4">
                    <div className="text-sm text-neutral-400">Stripe Customer ID</div>
                    <div className="mt-1 break-all font-mono text-xs text-neutral-300">
                      {billing.stripe_customer_id}
                    </div>
                  </div>
                ) : null}

                {billing?.stripe_subscription_id ? (
                  <div className="rounded-xl border border-neutral-800 bg-black p-4">
                    <div className="text-sm text-neutral-400">Stripe Subscription ID</div>
                    <div className="mt-1 break-all font-mono text-xs text-neutral-300">
                      {billing.stripe_subscription_id}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={syncBilling}
                    disabled={syncLoading}
                    className="rounded-xl border border-neutral-800 px-4 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
                  >
                    {syncLoading ? "Syncing..." : "Sync Billing"}
                  </button>

                  {isPaidPlan && billing?.stripe?.portal_ready ? (
                    <button
                      onClick={openPortal}
                      disabled={portalLoading}
                      className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
                    >
                      {portalLoading ? "Opening..." : "Manage Billing"}
                    </button>
                  ) : (
                    <Link
                      href="/plans"
                      className="rounded-xl border border-neutral-800 px-4 py-2 text-sm hover:bg-neutral-900"
                    >
                      View Plans
                    </Link>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Plan Capabilities */}
          <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
            <h2 className="mb-4 text-xl font-semibold">Plan Capabilities</h2>

            {loading ? (
              <div className="rounded-xl border border-neutral-800 p-4 text-neutral-400">
                Loading capabilities...
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  {
                    label: "Account-Linked Scans",
                    enabled: billing?.capabilities?.account_linked_scans ?? false,
                    desc: "Run scans tied to specific connected AWS accounts",
                  },
                  {
                    label: "Exports (JSON & CSV)",
                    enabled: billing?.capabilities?.exports ?? false,
                    desc: "Download scan findings as structured exports",
                  },
                  {
                    label: "Connected Accounts",
                    enabled: true,
                    desc: `${billing?.connected_accounts_used ?? 0} of ${billing?.account_limit ?? 1} slots used`,
                  },
                ].map((cap) => (
                  <div
                    key={cap.label}
                    className="rounded-xl border border-neutral-800 bg-black p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{cap.label}</div>
                        <div className="mt-1 text-sm text-neutral-400">{cap.desc}</div>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-1 text-xs ${
                          cap.enabled
                            ? "border-emerald-700 bg-emerald-950 text-emerald-300"
                            : "border-yellow-700 bg-yellow-950 text-yellow-300"
                        }`}
                      >
                        {cap.enabled ? "Enabled" : "Locked"}
                      </span>
                    </div>
                  </div>
                ))}

                {!isPaidPlan ? (
                  <div className="rounded-xl border border-yellow-700/40 bg-yellow-950/20 p-4 text-sm text-yellow-200">
                    Upgrade your plan to unlock account-linked scans and exports.{" "}
                    <Link href="/plans" className="underline">
                      View Plans →
                    </Link>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          {/* Quick Navigation */}
          <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
            <h2 className="mb-4 text-xl font-semibold">Quick Navigation</h2>

            <div className="space-y-3">
              {[
                { href: "/scans", label: "Scans & Findings", desc: "Run scans and review AWS posture findings" },
                { href: "/accounts", label: "Connected Accounts", desc: "Manage AWS account connections" },
                { href: "/plans", label: "Plans & Billing", desc: "Upgrade plan or manage subscription" },
                { href: "/launch", label: "Launch Prep", desc: "QA checklist, demo script, and outreach tools" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-xl border border-neutral-800 bg-black p-4 hover:bg-neutral-900"
                >
                  <div className="font-medium">{item.label}</div>
                  <div className="mt-1 text-sm text-neutral-400">{item.desc}</div>
                </Link>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-neutral-800 bg-black p-4 text-sm text-neutral-400">
              <div className="mb-1 font-medium text-neutral-300">API Endpoint</div>
              <div className="break-all font-mono text-xs">{API_BASE}</div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}