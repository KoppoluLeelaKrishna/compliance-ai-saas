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
    usd: "$99",
    period: "/mo",
    description: "For solo teams starting AWS compliance checks.",
    bullets: [
      "Up to 3 AWS accounts",
      "All 10 security checks",
      "Fix guidance & remediation",
      "CSV / JSON / PDF exports",
      "Email alerts on CRITICAL",
    ],
    highlighted: false,
    color: "border-white/[0.07]",
  },
  {
    key: "pro",
    title: "Pro",
    price: "₹24,999/mo",
    usd: "$299",
    period: "/mo",
    description: "For growing teams managing multiple customer environments.",
    bullets: [
      "Up to 10 AWS accounts",
      "Everything in Starter",
      "AI security analysis",
      "Scheduled daily scans",
      "Approval gate workflows",
    ],
    highlighted: true,
    color: "border-emerald-500/40",
  },
  {
    key: "msp",
    title: "MSP",
    price: "₹83,499+/mo",
    usd: "$999+",
    period: "/mo",
    description: "For agencies and managed service providers.",
    bullets: [
      "Unlimited AWS accounts",
      "Everything in Pro",
      "Multi-customer workflows",
      "High-volume scanning",
      "Priority support",
    ],
    highlighted: false,
    color: "border-white/[0.07]",
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

export default function PlansPage() {
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

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
        setTimeout(() => setSuccessMessage(""), 2500);
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
        modal: { ondismiss: () => setCheckoutLoading(null) },
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
    if (!rzConfig?.configured) return { label: "NOT CONFIGURED", cls: "border-red-500/30 bg-red-500/10 text-red-400" };
    if (rzConfig.checkout_ready) return { label: "READY", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" };
    return { label: "PARTIAL", cls: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400" };
  }, [rzConfig]);

  return (
    <main className="space-y-5 pb-24">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-white/[0.04] via-transparent to-emerald-500/[0.02] p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-emerald-500/[0.05] blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10">
            <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Plans & Billing</h1>
            <p className="mt-0.5 text-sm text-neutral-500">Simple pricing for pilots, growing teams, and MSP workflows</p>
            {!loading && billing && (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="font-medium text-violet-400">{(billing.subscription_status || "free").toUpperCase()} plan</span>
                <span className="text-neutral-500">{billing.connected_accounts_used}/{billing.account_limit} accounts</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusBadge.cls}`}>{statusBadge.label}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Status ─────────────────────────────────────────────────────── */}
      {(successMessage || error) && (
        <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${error ? "border-red-500/20 bg-red-500/[0.07] text-red-300" : "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"}`}>
          <span className="mt-0.5">{error ? "✕" : "✓"}</span>
          <span>{error || successMessage}</span>
        </div>
      )}

      {/* ── Current plan summary ────────────────────────────────────────── */}
      <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Current Plan</div>
            <div className="mt-1 text-4xl font-black text-white">
              {loading ? "…" : (billing?.subscription_status || "free").toUpperCase()}
            </div>
            <div className="mt-1 text-sm text-neutral-500">
              {loading ? "" : `${billing?.connected_accounts_used ?? 0} of ${billing?.account_limit ?? 1} accounts used`}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isPaidPlan && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelLoading}
                className="rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-2 text-sm text-red-400 hover:bg-red-500/[0.12] disabled:opacity-40 transition-colors"
              >
                {cancelLoading ? "Cancelling…" : "Cancel Subscription"}
              </button>
            )}
            <button
              type="button"
              onClick={() => syncBilling(true)}
              disabled={syncLoading}
              className="rounded-xl border border-white/[0.07] px-4 py-2 text-sm text-neutral-400 hover:bg-white/[0.05] hover:text-white disabled:opacity-40 transition-colors"
            >
              {syncLoading ? "Syncing…" : "↺ Refresh Billing"}
            </button>
          </div>
        </div>

        {/* Razorpay status strip */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Payment Provider", value: "Razorpay", color: "text-white" },
            { label: "Checkout Ready", value: loading ? "…" : rzConfig?.checkout_ready ? "Yes" : "No", color: rzConfig?.checkout_ready ? "text-emerald-400" : "text-red-400" },
            { label: "Webhook", value: loading ? "…" : rzConfig?.webhook_configured ? "Configured" : "Missing", color: rzConfig?.webhook_configured ? "text-emerald-400" : "text-yellow-400" },
            { label: "Status", value: loading ? "…" : statusBadge.label, color: rzConfig?.checkout_ready ? "text-emerald-400" : "text-yellow-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</div>
              <div className={`mt-1 font-semibold ${color}`}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Plan cards ──────────────────────────────────────────────────── */}
      <p className="text-xs text-neutral-600">All plans billed in INR via Razorpay. USD prices shown for reference — the INR amount is fixed.</p>

      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_CARDS.map((plan) => {
          const isCurrent = currentPlanKey === plan.key;
          const checkoutBlocked = !rzConfig?.checkout_ready;

          return (
            <div
              key={plan.key}
              className={`relative rounded-3xl border bg-white/[0.02] p-7 transition-all ${plan.highlighted ? "border-emerald-500/40 bg-gradient-to-b from-emerald-500/[0.06] to-transparent" : "border-white/[0.07]"} ${isCurrent ? "ring-1 ring-emerald-500/30" : ""}`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-1 text-[10px] font-bold text-black">
                  MOST POPULAR
                </div>
              )}

              <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">{plan.title}</div>
              <div className="flex items-end gap-1.5">
                <span className={`text-4xl font-black ${plan.highlighted ? "text-emerald-400" : "text-white"}`}>{plan.usd}</span>
                <span className="mb-1 text-sm text-neutral-500">{plan.period}</span>
              </div>
              <div className="mt-0.5 text-xs text-neutral-600">{plan.price} · INR · billed monthly</div>
              <p className="mt-4 text-sm text-neutral-400">{plan.description}</p>

              <div className="my-5 h-px bg-white/[0.06]" />

              <ul className="space-y-2.5">
                {plan.bullets.map(bullet => (
                  <li key={bullet} className="flex items-center gap-2.5 text-sm text-neutral-300">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] ${plan.highlighted ? "bg-emerald-500/20 text-emerald-400" : "bg-white/[0.08] text-neutral-400"}`}>✓</span>
                    {bullet}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => startCheckout(plan.key)}
                disabled={checkoutLoading === plan.key || isCurrent || checkoutBlocked}
                className={`mt-7 w-full rounded-2xl py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  isCurrent
                    ? "border border-emerald-500/30 text-emerald-400"
                    : plan.highlighted
                    ? "bg-emerald-500 text-black hover:bg-emerald-400"
                    : "border border-white/[0.10] text-white hover:bg-white/[0.06]"
                }`}
              >
                {isCurrent ? "Current Plan" : checkoutLoading === plan.key ? "Opening checkout…" : `Upgrade to ${plan.title}`}
              </button>

              {!isCurrent && checkoutBlocked && !loading && (
                <p className="mt-2 text-center text-xs text-red-400">Configure Razorpay keys to enable checkout</p>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Bottom context sections ─────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">Pilot Positioning</div>
          <h2 className="mt-1 text-xl font-bold">Use this in a VigiliCloud pilot conversation</h2>
          <p className="mt-3 text-sm leading-6 text-neutral-400">
            VigiliCloud is easiest to position as an AWS-native security posture workflow for early-stage teams, consultants, and MSPs that want fast visibility and actionable remediation guidance.
          </p>
          <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/30 p-4">
            <div className="font-semibold text-white">₹2,00,000 pilot example</div>
            <div className="mt-2 text-sm leading-6 text-neutral-400">
              Up to 2 AWS accounts, misconfiguration review, remediation workflow, evidence exports, and a live founder-led walkthrough.
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">Before Full Launch</div>
          <h2 className="mt-1 text-xl font-bold">Remaining Razorpay setup</h2>
          <ul className="mt-4 space-y-2.5">
            {[
              "Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to Render env vars",
              "Create starter, pro, msp plans in Razorpay dashboard",
              "Set webhook URL → /billing/webhook in Razorpay",
              "Add RAZORPAY_PLAN_STARTER, _PRO, _MSP env vars",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-400">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-yellow-500/30 bg-yellow-500/10 text-[9px] font-bold text-yellow-400">{i + 1}</span>
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3 text-sm text-emerald-300">
            Pricing page is ready for demos and pilot conversations.
          </div>
        </section>
      </div>
    </main>
  );
}
