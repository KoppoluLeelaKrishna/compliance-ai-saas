"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

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

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || `Request failed: ${res.status}`);
  }

  return data;
}

export default function OnboardingPage() {
  const router = useRouter();

  const [authenticated, setAuthenticated] = useState(false);
  const [userName, setUserName] = useState("User");
  const [userEmail, setUserEmail] = useState("");
  const [plan, setPlan] = useState("free");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [billing, setBilling] = useState<BillingMe | null>(null);

  const [loadingPage, setLoadingPage] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadPageState() {
    setLoadingPage(true);
    try {
      const auth = await api<AuthMe>("/auth/me");

      if (auth.authenticated && auth.user) {
        setAuthenticated(true);
        setUserName(auth.user.name || "User");
        setUserEmail(auth.user.email || "");
        setPlan(auth.user.subscription_status || "free");

        const [accountsData, billingData] = await Promise.all([
          api<{ accounts: Account[] }>("/accounts"),
          api<BillingMe>("/billing/me"),
        ]);

        setAccounts(accountsData.accounts || []);
        setBilling(billingData);
      } else {
        setAuthenticated(false);
        setUserName("User");
        setUserEmail("");
        setPlan("free");
        setAccounts([]);
        setBilling(null);
      }
    } catch {
      setAuthenticated(false);
      setUserName("User");
      setUserEmail("");
      setPlan("free");
      setAccounts([]);
      setBilling(null);
    } finally {
      setLoadingPage(false);
    }
  }

  useEffect(() => {
    loadPageState();
  }, []);

  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.is_active).length,
    [accounts]
  );

  const accountUsage = billing
    ? `${billing.connected_accounts_used}/${billing.account_limit}`
    : "-";

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoggingIn(true);

    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
        }),
      });

      setMessage("Login successful. Redirecting to workspace...");
      await loadPageState();

      setTimeout(() => {
        router.push("/scans");
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setError("");
    setMessage("");

    try {
      await api("/auth/logout", {
        method: "POST",
      });

      setAuthenticated(false);
      setUserName("User");
      setUserEmail("");
      setPlan("free");
      setAccounts([]);
      setBilling(null);
      setEmail("");
      setPassword("");
      setMessage("Logged out successfully.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logout failed");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10 px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div>
              <div className="mb-5 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                Secure workspace access
              </div>

              <h1 className="max-w-4xl text-5xl font-bold leading-tight tracking-tight md:text-6xl">
                {authenticated
                  ? "You are signed in and ready to continue."
                  : "Sign in to manage scans, accounts, billing, and launch workflows."}
              </h1>

              <p className="mt-6 max-w-3xl text-lg leading-8 text-neutral-300">
                This access page supports the full product workflow: login, open
                the workspace, manage connected AWS accounts, review findings,
                handle billing access, and sign out cleanly when needed.
              </p>

              <div className="mt-6 flex flex-wrap gap-2 text-xs text-neutral-300">
                {[
                  "Session-based auth",
                  "Stripe-ready app",
                  "Account-linked scans",
                  "Guidance + actions",
                  "JSON / CSV exports",
                  "Launch prep workflow",
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
                {authenticated ? (
                  <>
                    <Link
                      href="/scans"
                      className="rounded-2xl bg-white px-6 py-3 font-medium text-black"
                    >
                      Open Workspace
                    </Link>
                    <button
                      onClick={handleLogout}
                      disabled={loggingOut}
                      className="rounded-2xl border border-white/10 px-6 py-3 hover:bg-white/5 disabled:opacity-60"
                    >
                      {loggingOut ? "Logging out..." : "Logout"}
                    </button>
                  </>
                ) : (
                  <a
                    href="#auth"
                    className="rounded-2xl bg-white px-6 py-3 font-medium text-black"
                  >
                    Get Started
                  </a>
                )}
              </div>

              <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="text-sm text-neutral-400">Current Plan</div>
                  <div className="mt-2 text-4xl font-bold uppercase">
                    {loadingPage ? "..." : plan}
                  </div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="text-sm text-neutral-400">
                    Connected Accounts
                  </div>
                  <div className="mt-2 text-4xl font-bold">
                    {loadingPage ? "..." : accounts.length}
                  </div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="text-sm text-neutral-400">Active Accounts</div>
                  <div className="mt-2 text-4xl font-bold">
                    {loadingPage ? "..." : activeAccounts}
                  </div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="text-sm text-neutral-400">Account Usage</div>
                  <div className="mt-2 text-4xl font-bold">
                    {loadingPage ? "..." : accountUsage}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-2xl shadow-emerald-950/10">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-sm text-neutral-400">Workspace Access</div>
                  <div className="text-2xl font-semibold">
                    {authenticated ? "Account Session" : "Sign In"}
                  </div>
                </div>
                <div
                  className={`rounded-full border px-3 py-1 text-xs ${
                    authenticated
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
                  }`}
                >
                  {authenticated ? "Authenticated" : "Not signed in"}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
                {authenticated ? (
                  <>
                    <div className="text-sm text-neutral-400">Logged in as</div>
                    <div className="mt-2 text-3xl font-bold">{userName}</div>
                    <div className="mt-2 text-sm text-neutral-400">
                      {userEmail || "-"}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm text-neutral-400">
                      Workspace sign-in
                    </div>
                    <div className="mt-2 text-xl font-semibold">
                      Use your assigned credentials
                    </div>
                    <div className="mt-2 text-sm text-neutral-400">
                      Sign in with your workspace email and password.
                    </div>
                  </>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
                  <div className="text-sm text-neutral-400">Billing</div>
                  <div className="mt-2 text-3xl font-bold">Stripe</div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
                  <div className="text-sm text-neutral-400">Exports</div>
                  <div className="mt-2 text-3xl font-bold">JSON / CSV</div>
                </div>
              </div>

              <div className="mt-4 rounded-3xl border border-white/10 bg-black/40 p-5">
                <div className="mb-3 text-sm text-neutral-400">
                  What this login unlocks
                </div>
                <ul className="space-y-2 text-sm text-neutral-300">
                  <li>• account onboarding and test connection</li>
                  <li>• scan runs and findings review</li>
                  <li>• fix guidance and remediation notes</li>
                  <li>• export downloads</li>
                  <li>• pricing and launch workflows</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="auth" className="scroll-mt-24 border-b border-white/10 px-6 py-16">
        <div className="mx-auto max-w-7xl">
          {message ? (
            <div className="mb-6 rounded-2xl border border-emerald-700 bg-emerald-950 px-4 py-3 text-sm text-emerald-200">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="mb-6 rounded-2xl border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {authenticated ? (
            <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
                <div className="mb-4 text-xs uppercase tracking-[0.25em] text-neutral-500">
                  Session active
                </div>
                <h2 className="text-4xl font-bold">
                  You are already logged in
                </h2>
                <p className="mt-4 text-lg text-neutral-300">
                  Your session is active. You can continue directly into the
                  product or sign out and test login again.
                </p>

                <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                  Current user: {userName} {userEmail ? `(${userEmail})` : ""}
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/scans"
                    className="rounded-2xl bg-white px-5 py-4 text-center font-medium text-black"
                  >
                    Open Workspace
                  </Link>
                  <Link
                    href="/accounts"
                    className="rounded-2xl border border-white/10 px-5 py-4 text-center hover:bg-white/5"
                  >
                    Manage Accounts
                  </Link>
                  <Link
                    href="/launch"
                    className="rounded-2xl border border-white/10 px-5 py-4 text-center hover:bg-white/5"
                  >
                    Launch Prep
                  </Link>
                </div>
              </div>

              <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
                <div className="mb-4 text-xs uppercase tracking-[0.25em] text-neutral-500">
                  Account actions
                </div>
                <h2 className="text-4xl font-bold">Logout and login again</h2>
                <p className="mt-4 text-lg text-neutral-300">
                  Use logout here whenever you want to test the full auth flow
                  again.
                </p>

                <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-5">
                  <div className="text-sm text-neutral-400">Status</div>
                  <div className="mt-2 text-2xl font-bold text-emerald-300">
                    Authenticated
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="mt-6 w-full rounded-2xl bg-white px-5 py-4 font-medium text-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loggingOut ? "Logging out..." : "Logout"}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
                <div className="mb-4 text-xs uppercase tracking-[0.25em] text-neutral-500">
                  Sign in
                </div>
                <h2 className="text-4xl font-bold">Welcome back</h2>
                <p className="mt-4 text-lg text-neutral-300">
                  Sign in to continue to your workspace and manage scans,
                  accounts, billing, and launch workflows.
                </p>

                <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-neutral-300">
                  Use your workspace email and password to continue.
                </div>
              </div>

              <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
                <div className="mb-4 text-xs uppercase tracking-[0.25em] text-neutral-500">
                  Login form
                </div>
                <h2 className="text-4xl font-bold">
                  Secure access to your workspace
                </h2>
                <p className="mt-4 text-lg text-neutral-300">
                  Enter your credentials below. After successful login, you will
                  be redirected to the scans workspace.
                </p>

                <form onSubmit={handleLogin} className="mt-6 space-y-4">
                  <div>
                    <label className="mb-2 block text-sm text-neutral-300">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 outline-none focus:border-neutral-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-neutral-300">
                      Password
                    </label>
                    <div className="flex gap-3">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 outline-none focus:border-neutral-500"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="rounded-2xl border border-white/10 px-4 py-3 text-sm hover:bg-white/5"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loggingIn || loadingPage}
                    className="w-full rounded-2xl bg-white px-5 py-4 font-medium text-black disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loggingIn ? "Logging in..." : "Login and Open Workspace"}
                  </button>
                </form>

                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  <Link
                    href="/plans"
                    className="rounded-2xl border border-white/10 px-4 py-3 text-center text-sm hover:bg-white/5"
                  >
                    View Plans
                  </Link>
                  <Link
                    href="/accounts"
                    className="rounded-2xl border border-white/10 px-4 py-3 text-center text-sm hover:bg-white/5"
                  >
                    Accounts
                  </Link>
                  <Link
                    href="/launch"
                    className="rounded-2xl border border-white/10 px-4 py-3 text-center text-sm hover:bg-white/5"
                  >
                    Launch Prep
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}