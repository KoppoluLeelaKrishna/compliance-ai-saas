"use client";

import { useEffect, useMemo, useState } from "react";
import TopbarActions from "@/components/app/TopbarActions";

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
    price: "₹8,299",
    usd: "$99",
    period: "/mo",
    description: "For solo consultants and small teams.",
    bullets: [
      "Up to 3 AWS accounts",
      "All 10 security checks",
      "Fix guidance & remediation",
      "CSV / JSON / PDF exports",
      "Email alerts on CRITICAL",
    ],
    highlighted: false,
  },
  {
    key: "pro",
    title: "Pro",
    price: "₹24,999",
    usd: "$299",
    period: "/mo",
    description: "For teams running several AWS environments.",
    bullets: [
      "Up to 10 AWS accounts",
      "Everything in Starter",
      "AI security analysis",
      "Scheduled daily scans",
      "Approval gate workflows",
    ],
    highlighted: true,
  },
  {
    key: "msp",
    title: "MSP",
    price: "₹83,499",
    usd: "$999",
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

/** Cheapest to richest — used to label a switch as an upgrade or a downgrade. */
const PLAN_ORDER = ["free", "starter", "pro", "msp"];

function planTitle(key: string) {
  const hit = PLAN_CARDS.find(p => p.key === key);
  return hit ? hit.title : "Free";
}

function currentPlanPrice(key: string) {
  const hit = PLAN_CARDS.find(p => p.key === key);
  return hit ? `${hit.usd} / month · ${hit.price} in INR` : "No subscription";
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
        theme: { color: "#0066cc" },
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

  const statusLabel = useMemo(() => {
    if (!rzConfig?.configured) return "Not configured";
    if (rzConfig.checkout_ready) return "Ready";
    return "Partial";
  }, [rzConfig]);

  return (
    <>
      <TopbarActions>
        <button type="button" className="vc-btn" onClick={() => syncBilling(true)} disabled={syncLoading}>
          {syncLoading ? "Syncing…" : "Refresh billing"}
        </button>
        {isPaidPlan ? (
          <button type="button" className="vc-btn-primary" onClick={handleCancel} disabled={cancelLoading}>
            {cancelLoading ? "Cancelling…" : "Manage subscription"}
          </button>
        ) : (
          <button type="button" className="vc-btn-primary" onClick={() => startCheckout("pro")} disabled={!rzConfig?.checkout_ready}>
            Choose a plan
          </button>
        )}
      </TopbarActions>

      <div className="vc-page-head">
        <div>
          <h1 className="vc-h1">Plans &amp; billing</h1>
          <p className="vc-sub">
            Priced per workspace, not per finding. Change tier at any time; billing prorates.
          </p>
        </div>
      </div>

      {error && <div className="vc-note vc-note-error">{error}</div>}
      {successMessage && !error && <div className="vc-note vc-note-success">{successMessage}</div>}

      {/* ── Current plan strip ───────────────────────────────────────────── */}
      <div className="vc-card !px-6 !py-[22px] flex flex-wrap items-center gap-8">
        <div className="flex-1 min-w-[220px]">
          <div className="vc-stat-label !mb-2">Current plan</div>
          <div className="flex items-baseline gap-3">
            <span className="text-[26px] font-semibold tracking-[-0.6px] text-[var(--vc-text)]">
              {loading ? "…" : planTitle(currentPlanKey)}
            </span>
            <span className="text-sm text-[var(--vc-muted)]">
              {loading ? "" : currentPlanPrice(currentPlanKey)}
            </span>
          </div>
        </div>

        <div className="h-11 w-px bg-[var(--vc-hairline)]" />

        <div>
          <div className="vc-stat-label !mb-2">Accounts</div>
          <div className="text-xl font-semibold tracking-[-0.4px] text-[var(--vc-text)]">
            {loading ? "…" : billing?.connected_accounts_used ?? 0}{" "}
            <span className="text-sm font-normal text-[var(--vc-muted)]">
              of {billing?.account_limit ?? 1}
            </span>
          </div>
        </div>

        <div className="h-11 w-px bg-[var(--vc-hairline)]" />

        <div>
          <div className="vc-stat-label !mb-2">Checkout</div>
          <div className={`text-xl font-semibold tracking-[-0.4px] ${rzConfig?.checkout_ready ? "vc-ok" : "vc-sev-high"}`}>
            {loading ? "…" : rzConfig?.checkout_ready ? "Ready" : rzConfig?.configured ? "Partial" : "Not configured"}
          </div>
        </div>

        {isPaidPlan && (
          <button type="button" className="vc-btn-secondary !h-9" onClick={handleCancel} disabled={cancelLoading}>
            {cancelLoading ? "Cancelling…" : "Cancel plan"}
          </button>
        )}
      </div>

      {/* ── Plan ladder ──────────────────────────────────────────────────── */}
      <div className="vc-grid vc-grid-3">
        {PLAN_CARDS.map((plan) => {
          const isCurrent = currentPlanKey === plan.key;
          const checkoutBlocked = !rzConfig?.checkout_ready;
          const rank = PLAN_ORDER.indexOf(plan.key);
          const currentRank = PLAN_ORDER.indexOf(currentPlanKey);
          const isDowngrade = currentRank > -1 && rank > -1 && rank < currentRank;

          return (
            <div
              key={plan.key}
              className="vc-card !p-7 flex flex-col"
              style={isCurrent ? { borderColor: "var(--vc-accent)", borderWidth: 1.5 } : undefined}
            >
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-[21px] font-semibold tracking-[-0.4px] text-[var(--vc-text)]">{plan.title}</span>
                {isCurrent ? (
                  <span className="vc-pill-outline !border-none !bg-[var(--vc-accent)] !text-white">Current</span>
                ) : plan.highlighted ? (
                  <span className="vc-pill-outline text-[var(--vc-accent-text)]">Most chosen</span>
                ) : null}
              </div>

              <div className="mt-1.5 text-[13.5px] leading-[1.5] text-[var(--vc-muted)]">{plan.description}</div>

              <div className="mt-[22px] mb-1 flex items-baseline gap-2">
                <span className="text-[40px] font-semibold tracking-[-1.2px] text-[var(--vc-text)]">{plan.usd}</span>
                <span className="text-sm text-[var(--vc-muted)]">{plan.period}</span>
              </div>
              <div className="mb-6 text-[12.5px] text-[var(--vc-dim)]">{plan.price} billed in INR</div>

              <div className="flex flex-col gap-[11px] text-[13.5px] leading-[1.45] text-[var(--vc-text-2)]">
                {plan.bullets.map(bullet => <span key={bullet}>{bullet}</span>)}
              </div>

              <button
                type="button"
                onClick={() => startCheckout(plan.key)}
                disabled={checkoutLoading === plan.key || isCurrent || checkoutBlocked}
                className={`mt-auto pt-6 ${isCurrent || plan.highlighted ? "" : ""}`}
              >
                <span
                  className={`flex h-10 w-full items-center justify-center rounded-full text-[13.5px] font-semibold ${
                    isCurrent
                      ? "bg-[var(--vc-accent)] text-white"
                      : "border border-[var(--vc-hairline-strong)] text-[var(--vc-text)]"
                  } ${checkoutLoading === plan.key || checkoutBlocked ? "opacity-45" : ""}`}
                >
                  {isCurrent
                    ? "Your plan"
                    : checkoutLoading === plan.key
                    ? "Opening checkout…"
                    : isDowngrade
                    ? "Downgrade"
                    : `Upgrade to ${plan.title}`}
                </span>
              </button>

              {!isCurrent && checkoutBlocked && !loading && (
                <p className="mt-2 text-center text-[11.5px] vc-sev-critical">
                  Configure Razorpay keys to enable checkout
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[12.5px] text-[var(--vc-dim)]">
        All plans are billed in INR via Razorpay. USD prices are shown for reference — the INR amount is what is charged.
      </p>

      {/* ── Provider status ──────────────────────────────────────────────── */}
      <div className="vc-card vc-card-flush">
        <div className="vc-card-head">
          <div>
            <div className="vc-card-title">Payment provider</div>
            <div className="vc-card-sub">Razorpay subscription checkout and webhook status</div>
          </div>
          <span className={`vc-pill ${rzConfig?.checkout_ready ? "vc-ok" : rzConfig?.configured ? "vc-sev-high" : "vc-sev-critical"}`}>
            {statusLabel}
          </span>
        </div>

        <div className="vc-grid vc-grid-3 !gap-0">
          {[
            { label: "API keys", ok: !!rzConfig?.configured, yes: "Configured", no: "Missing" },
            { label: "Checkout", ok: !!rzConfig?.checkout_ready, yes: "Ready", no: "Not ready" },
            { label: "Webhook", ok: !!rzConfig?.webhook_configured, yes: "Configured", no: "Missing" },
          ].map(({ label, ok, yes, no }) => (
            <div key={label} className="border-b border-[var(--vc-hairline-soft)] px-[22px] py-4 last:border-b-0">
              <div className="vc-stat-label !mb-1.5">{label}</div>
              <div className={`text-[15px] font-semibold ${ok ? "vc-ok" : "vc-sev-high"}`}>
                {loading ? "…" : ok ? yes : no}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
