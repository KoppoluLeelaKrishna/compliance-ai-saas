"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppTopNav from "@/components/AppTopNav";

type StripePriceState = {
  configured: boolean;
  matches_mode: boolean;
  price_id: string;
};

type StripeConfig = {
  configured: boolean;
  mode: string;
  webhook_configured: boolean;
  checkout_ready: boolean;
  portal_ready: boolean;
  prices: Record<string, StripePriceState>;
};

type BillingState = {
  subscription_status: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  account_limit: number;
  connected_accounts_used: number;
  plans: { key: string; label: string; price_id: string }[];
  stripe?: StripeConfig;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

const PLAN_CARDS = [
  {
    key: "starter",
    title: "Starter",
    price: "$99/mo",
    description: "For solo teams starting AWS compliance checks.",
    bullets: ["Up to 3 AWS accounts", "Core scans", "Dashboard + exports"],
  },
  {
    key: "pro",
    title: "Pro",
    price: "$299/mo",
    description: "For growing teams managing multiple customer environments.",
    bullets: ["Up to 10 AWS accounts", "Better reporting", "Operational scaling"],
  },
  {
    key: "msp",
    title: "MSP",
    price: "$999+/mo",
    description: "For agencies and managed service providers.",
    bullets: ["Many accounts", "Multi-customer workflows", "High-volume usage"],
  },
];

export default function PlansPage() {
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
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
      throw new Error(data?.detail || "Request failed");
    }

    return data as T;
  }

  async function loadBilling() {
    try {
      setLoading(true);
      setError("");
      const data = await fetchJson<BillingState>("/billing/me");
      setBilling(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load billing";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function syncBilling(showMessage = true) {
    try {
      setSyncLoading(true);
      setError("");

      const data = await fetchJson<BillingState & { synced?: boolean }>("/billing/sync", {
        method: "POST",
      });

      setBilling(data);

      if (showMessage) {
        setSuccessMessage("Billing state refreshed.");
        setTimeout(() => setSuccessMessage(""), 1800);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Billing refresh failed";
      setError(message);
    } finally {
      setSyncLoading(false);
    }
  }

  useEffect(() => {
    loadBilling();

    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");

    if (checkout === "success") {
      setSuccessMessage("Checkout completed. Syncing billing status...");
      setTimeout(() => {
        syncBilling(false);
      }, 1000);
    } else if (checkout === "cancelled") {
      setError("Checkout was cancelled.");
    }
  }, []);

  async function startCheckout(plan: string) {
    try {
      setCheckoutLoading(plan);
      setError("");

      const data = await fetchJson<{ url: string }>("/billing/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });

      if (!data?.url) {
        throw new Error("Stripe checkout URL missing");
      }

      window.location.href = data.url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Checkout failed";
      setError(message);
      setCheckoutLoading(null);
    }
  }

  async function openPortal() {
    try {
      setPortalLoading(true);
      setError("");

      const data = await fetchJson<{ url: string }>("/billing/portal", {
        method: "POST",
        body: JSON.stringify({
          return_url: `${window.location.origin}/plans`,
        }),
      });

      if (!data?.url) {
        throw new Error("Billing portal URL missing");
      }

      window.location.href = data.url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Portal open failed";
      setError(message);
      setPortalLoading(false);
    }
  }

  const currentPlanLabel = useMemo(() => {
    if (!billing?.subscription_status) return "FREE";
    return billing.subscription_status.toUpperCase();
  }, [billing]);

  const currentPlanKey = (billing?.subscription_status || "free").toLowerCase();

  const isPaidPlan = useMemo(() => {
    const status = billing?.subscription_status?.toLowerCase() || "free";
    return status !== "free";
  }, [billing]);

  const stripe = billing?.stripe;
  const stripeModeLabel =
    stripe?.mode === "live"
      ? "LIVE MODE"
      : stripe?.mode === "test"
      ? "TEST MODE"
      : "DISABLED";

  const modeBadgeClasses =
    stripe?.mode === "live"
      ? "border-emerald-700 bg-emerald-950 text-emerald-300"
      : stripe?.mode === "test"
      ? "border-yellow-700 bg-yellow-950 text-yellow-300"
      : "border-red-800 bg-red-950 text-red-300";

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <AppTopNav />

        <div className="mb-8">
          <h1 className="text-3xl font-bold">Plans & Billing</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Day 28: final public-facing pricing polish and pilot-ready positioning.
          </p>
        </div>

        {successMessage ? (
          <div className="mb-5 rounded-2xl border border-emerald-700 bg-emerald-950 px-4 py-3 text-sm text-emerald-200">
            {successMessage}
          </div>
        ) : null}

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="mb-6 rounded-3xl border border-neutral-800 bg-neutral-950 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-neutral-400">Billing Environment</div>
              <div className="mt-2 text-2xl font-bold">{loading ? "..." : stripeModeLabel}</div>
            </div>

            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${modeBadgeClasses}`}>
              {loading ? "Checking..." : stripeModeLabel}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-neutral-800 bg-black p-4">
              <div className="text-sm text-neutral-400">Checkout Ready</div>
              <div className="mt-2 text-2xl font-bold">
                {loading ? "..." : stripe?.checkout_ready ? "Yes" : "No"}
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-black p-4">
              <div className="text-sm text-neutral-400">Webhook Ready</div>
              <div className="mt-2 text-2xl font-bold">
                {loading ? "..." : stripe?.webhook_configured ? "Yes" : "No"}
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-black p-4">
              <div className="text-sm text-neutral-400">Portal Ready</div>
              <div className="mt-2 text-2xl font-bold">
                {loading ? "..." : stripe?.portal_ready ? "Yes" : "No"}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-neutral-800 bg-black p-4 text-sm text-neutral-300">
            This page now supports demo calls and pilot conversations by showing pricing, active plan state, Stripe readiness, and upgrade flow clearly.
          </div>
        </section>

        <section className="mb-8 rounded-3xl border border-neutral-800 bg-neutral-950 p-6">
          <div className="text-sm text-neutral-400">Current Plan</div>
          <div className="mt-3 text-5xl font-bold">{loading ? "..." : currentPlanLabel}</div>
          <div className="mt-4 text-lg text-neutral-300">
            Account usage: {billing?.connected_accounts_used ?? 0}/{billing?.account_limit ?? 1}
          </div>

          <div className="mt-4 text-sm text-neutral-500">
            {isPaidPlan
              ? "Your subscription is active. You can manage billing anytime."
              : "You are on the free tier. Upgrade when you need more capacity."}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {isPaidPlan ? (
              <button
                onClick={openPortal}
                disabled={portalLoading || !stripe?.portal_ready}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-medium text-black disabled:opacity-60"
              >
                {portalLoading ? "Opening Portal..." : "Manage Billing"}
              </button>
            ) : null}

            <button
              onClick={() => syncBilling(true)}
              disabled={syncLoading}
              className="rounded-2xl border border-neutral-800 px-5 py-3 text-sm hover:bg-neutral-900 disabled:opacity-60"
            >
              {syncLoading ? "Refreshing..." : "Refresh Billing"}
            </button>
          </div>
        </section>

        <div className="mb-10 grid gap-6 md:grid-cols-3">
          {PLAN_CARDS.map((plan) => {
            const isCurrent = currentPlanKey === plan.key;
            const priceState = stripe?.prices?.[plan.key];
            const checkoutBlocked =
              !stripe?.checkout_ready || !priceState?.configured || !priceState?.matches_mode;

            return (
              <section
                key={plan.key}
                className={`rounded-3xl border bg-neutral-950 p-8 ${
                  isCurrent ? "border-white" : "border-neutral-800"
                }`}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-4xl font-bold">{plan.title}</h2>
                  {isCurrent ? (
                    <span className="rounded-full border border-emerald-600 bg-emerald-950 px-3 py-1 text-xs text-emerald-300">
                      Current Plan
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 text-5xl font-bold">{plan.price}</div>
                <p className="mt-5 text-lg text-neutral-300">{plan.description}</p>

                <ul className="mt-8 space-y-3 text-lg text-neutral-200">
                  {plan.bullets.map((bullet) => (
                    <li key={bullet}>• {bullet}</li>
                  ))}
                </ul>

                <div className="mt-6 rounded-2xl border border-neutral-800 bg-black p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Price ID</span>
                    <span className={priceState?.configured ? "text-emerald-300" : "text-red-300"}>
                      {priceState?.configured ? "Configured" : "Missing"}
                    </span>
                  </div>
                  <div className="mt-2 break-all text-xs text-neutral-500">
                    {priceState?.price_id || "Not configured"}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-neutral-400">Mode Match</span>
                    <span className={priceState?.matches_mode ? "text-emerald-300" : "text-red-300"}>
                      {priceState?.matches_mode ? "Valid" : "Check setup"}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => startCheckout(plan.key)}
                  disabled={checkoutLoading === plan.key || isCurrent || checkoutBlocked}
                  className="mt-10 w-full rounded-2xl bg-white px-5 py-4 text-lg font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCurrent
                    ? "Current Plan"
                    : checkoutLoading === plan.key
                    ? "Redirecting..."
                    : `Upgrade to ${plan.title}`}
                </button>

                {!isCurrent && checkoutBlocked ? (
                  <div className="mt-3 text-xs text-red-300">
                    Checkout is blocked until Stripe setup is complete for this plan.
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>

        <section className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
          <div className="rounded-3xl border border-neutral-800 bg-neutral-950 p-6">
            <div className="mb-3 text-xs uppercase tracking-[0.25em] text-neutral-500">
              Pilot positioning
            </div>
            <h2 className="text-3xl font-bold">Use this pricing page in a founder-led pilot conversation</h2>
            <p className="mt-4 text-neutral-300">
              This product is easiest to position as an AWS-only compliance workflow for
              early-stage teams, consultants, and MSPs that want fast visibility and actionable posture checks.
            </p>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black p-4">
              <div className="text-lg font-semibold">$2,500 pilot example</div>
              <div className="mt-3 text-sm leading-7 text-neutral-300">
                Up to 2 AWS accounts, misconfiguration review, remediation workflow, evidence exports,
                and a live founder-led walkthrough for internal or customer-facing readiness.
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-800 bg-neutral-950 p-6">
            <div className="mb-3 text-xs uppercase tracking-[0.25em] text-neutral-500">
              Remaining launch work
            </div>
            <h2 className="text-3xl font-bold">Before real public launch</h2>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-neutral-300">
              <li>• production hosting and domain</li>
              <li>• final QA across scans, billing, and onboarding</li>
              <li>• demo video and clean product screenshots</li>
              <li>• customer onboarding instructions</li>
              <li>• pilot outreach execution</li>
            </ul>

            <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              Day 28 makes pricing more usable in public-facing demos and early pilot conversations.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}