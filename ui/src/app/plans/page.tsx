"use client";

import { useEffect, useMemo, useState } from "react";

type RazorpayConfig = {
  configured: boolean;
  webhook_configured: boolean;
  checkout_ready: boolean;
};

type BillingState = {
  subscription_status: string;
  razorpay_subscription_id: string;
  account_limit: number;
  connected_accounts_used: number;
  plans: { key: string; label: string; plan_id: string }[];
  razorpay?: RazorpayConfig;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

const PLAN_CARDS = [
  {
    key: "starter",
    title: "Starter",
    price: "₹8,299/mo",
    usd: "~$99/mo",
    description: "For solo teams starting AWS compliance checks.",
    bullets: ["Up to 3 AWS accounts", "Core scans", "Dashboard + exports"],
  },
  {
    key: "pro",
    title: "Pro",
    price: "₹24,999/mo",
    usd: "~$299/mo",
    description: "For growing teams managing multiple customer environments.",
    bullets: ["Up to 10 AWS accounts", "Better reporting", "Operational scaling"],
    highlighted: true,
  },
  {
    key: "msp",
    title: "MSP",
    price: "₹83,499+/mo",
    usd: "~$999+/mo",
    description: "For agencies and managed service providers.",
    bullets: ["Many accounts", "Multi-customer workflows", "High-volume usage"],
  },
];

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function PlansPage() {
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || "Request failed");
    return data as T;
  }

  async function loadBilling() {
    try {
      setLoading(true);
      setError("");
      const data = await fetchJson<BillingState>("/billing/me");
      setBilling(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load billing");
    } finally {
      setLoading(false);
    }
  }

  async function syncBilling(showMessage = true) {
    try {
      setSyncLoading(true);
      setError("");
      const data = await fetchJson<BillingState>("/billing/sync", { method: "POST" });
      setBilling(data);
      if (showMessage) {
        setSuccessMessage("Billing status refreshed.");
        setTimeout(() => setSuccessMessage(""), 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Billing refresh failed");
    } finally {
      setSyncLoading(false);
    }
  }

  useEffect(() => {
    loadBilling();
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "cancelled") setError("Checkout was cancelled.");
  }, []);

  async function startCheckout(plan: string) {
    setCheckoutLoading(plan);
    setError("");
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Failed to load Razorpay. Please try again.");

      const data = await fetchJson<{ subscription_id: string; key_id: string; plan: string }>(
        "/billing/create-checkout-session",
        { method: "POST", body: JSON.stringify({ plan }) }
      );

      const options = {
        key: data.key_id,
        subscription_id: data.subscription_id,
        name: "VigiliCloud",
        description: `VigiliCloud ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
        theme: { color: "#10b981" },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_subscription_id: string;
          razorpay_signature: string;
        }) => {
          try {
            await fetchJson("/billing/verify-payment", {
              method: "POST",
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_signature: response.razorpay_signature,
                plan: data.plan,
              }),
            });
            setSuccessMessage("Subscription activated! Welcome to VigiliCloud.");
            await loadBilling();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Payment verification failed");
          } finally {
            setCheckoutLoading(null);
          }
        },
        modal: {
          ondismiss: () => setCheckoutLoading(null),
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setCheckoutLoading(null);
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel your subscription? You will lose access at the end of this billing cycle.")) return;
    setCancelLoading(true);
    setError("");
    try {
      await fetchJson("/billing/cancel-subscription", { method: "POST" });
      setSuccessMessage("Subscription cancelled. You'll have access until end of billing cycle.");
      await loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancellation failed");
    } finally {
      setCancelLoading(false);
    }
  }

  const currentPlanKey = (billing?.subscription_status || "free").toLowerCase();
  const isPaidPlan = currentPlanKey !== "free";
  const rzConfig = billing?.razorpay;

  const statusBadge = useMemo(() => {
    if (!rzConfig?.configured) return { label: "NOT CONFIGURED", cls: "border-red-800 bg-red-950 text-red-300" };
    if (rzConfig.checkout_ready) return { label: "READY", cls: "border-emerald-700 bg-emerald-950 text-emerald-300" };
    return { label: "PARTIAL SETUP", cls: "border-yellow-700 bg-yellow-950 text-yellow-300" };
  }, [rzConfig]);

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Plans & Billing</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Simple pricing for VigiliCloud pilots, growing teams, and MSP workflows.
          </p>
        </div>

        {successMessage && (
          <div className="mb-5 rounded-2xl border border-emerald-700 bg-emerald-950 px-4 py-3 text-sm text-emerald-200">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="mb-5 rounded-2xl border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <section className="mb-6 rounded-3xl border border-neutral-800 bg-neutral-950 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-neutral-400">Payment Provider</div>
              <div className="mt-1 text-xl font-bold">Razorpay</div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadge.cls}`}>
              {loading ? "Checking..." : statusBadge.label}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-neutral-800 bg-black p-4">
              <div className="text-sm text-neutral-400">Checkout Ready</div>
              <div className="mt-2 text-2xl font-bold">
                {loading ? "..." : rzConfig?.checkout_ready ? "Yes" : "No"}
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-black p-4">
              <div className="text-sm text-neutral-400">Webhook Configured</div>
              <div className="mt-2 text-2xl font-bold">
                {loading ? "..." : rzConfig?.webhook_configured ? "Yes" : "No"}
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8 rounded-3xl border border-neutral-800 bg-neutral-950 p-6">
          <div className="text-sm text-neutral-400">Current Plan</div>
          <div className="mt-3 text-5xl font-bold">
            {loading ? "..." : (billing?.subscription_status || "free").toUpperCase()}
          </div>
          <div className="mt-4 text-lg text-neutral-300">
            Account usage: {billing?.connected_accounts_used ?? 0}/{billing?.account_limit ?? 1}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {isPaidPlan && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelLoading}
                className="rounded-2xl border border-red-800 bg-red-950/50 px-5 py-3 text-sm text-red-300 hover:bg-red-950 disabled:opacity-60 transition-colors"
              >
                {cancelLoading ? "Cancelling..." : "Cancel Subscription"}
              </button>
            )}
            <button
              type="button"
              onClick={() => syncBilling(true)}
              disabled={syncLoading}
              className="rounded-2xl border border-neutral-800 px-5 py-3 text-sm hover:bg-neutral-900 disabled:opacity-60 transition-colors"
            >
              {syncLoading ? "Refreshing..." : "Refresh Billing"}
            </button>
          </div>
        </section>

        <div className="mb-10 grid gap-6 md:grid-cols-3">
          {PLAN_CARDS.map((plan) => {
            const isCurrent = currentPlanKey === plan.key;
            const checkoutBlocked = !rzConfig?.checkout_ready;

            return (
              <section
                key={plan.key}
                className={`rounded-3xl border bg-neutral-950 p-8 ${
                  isCurrent ? "border-white" : plan.highlighted ? "border-emerald-500/40" : "border-neutral-800"
                }`}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-4xl font-bold">{plan.title}</h2>
                  {isCurrent && (
                    <span className="rounded-full border border-emerald-600 bg-emerald-950 px-3 py-1 text-xs text-emerald-300">
                      Current
                    </span>
                  )}
                </div>

                <div className="mt-3 text-4xl font-bold">{plan.price}</div>
                <div className="mt-1 text-sm text-neutral-500">{plan.usd}</div>
                <p className="mt-5 text-lg text-neutral-300">{plan.description}</p>

                <ul className="mt-8 space-y-3 text-lg text-neutral-200">
                  {plan.bullets.map((bullet) => (
                    <li key={bullet}>• {bullet}</li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => startCheckout(plan.key)}
                  disabled={checkoutLoading === plan.key || isCurrent || checkoutBlocked}
                  className="mt-10 w-full rounded-2xl bg-white px-5 py-4 text-lg font-medium text-black disabled:cursor-not-allowed disabled:opacity-50 hover:bg-neutral-100 transition-colors"
                >
                  {isCurrent
                    ? "Current Plan"
                    : checkoutLoading === plan.key
                    ? "Opening checkout..."
                    : `Upgrade to ${plan.title}`}
                </button>

                {!isCurrent && checkoutBlocked && !loading && (
                  <div className="mt-3 text-xs text-red-300">
                    Configure RAZORPAY_KEY_ID and plan IDs to enable checkout.
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <section className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
          <div className="rounded-3xl border border-neutral-800 bg-neutral-950 p-6">
            <div className="mb-3 text-xs uppercase tracking-[0.25em] text-neutral-500">
              Pilot positioning
            </div>
            <h2 className="text-3xl font-bold">Use this pricing page in a VigiliCloud pilot conversation</h2>
            <p className="mt-4 text-neutral-300">
              VigiliCloud is easiest to position as an AWS-native security posture workflow for
              early-stage teams, consultants, and MSPs that want fast visibility and actionable remediation guidance.
            </p>
            <div className="mt-6 rounded-2xl border border-white/10 bg-black p-4">
              <div className="text-lg font-semibold">₹2,00,000 pilot example</div>
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
            <h2 className="text-3xl font-bold">Before full VigiliCloud launch</h2>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-neutral-300">
              <li>• Configure Razorpay: add RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, plan IDs to Render env vars</li>
              <li>• Create plans in Razorpay dashboard (starter, pro, msp)</li>
              <li>• Set up Razorpay webhook pointing to /billing/webhook</li>
              <li>• Custom domain cutover</li>
              <li>• Final QA across scans, billing, and onboarding</li>
            </ul>
            <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              Pricing page is ready for demos and pilot conversations.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
