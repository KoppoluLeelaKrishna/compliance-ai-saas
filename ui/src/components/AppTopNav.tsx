"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

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

function navClass(active: boolean) {
  return active
    ? "rounded-xl bg-white px-4 py-2 font-medium text-black"
    : "rounded-xl border border-white/10 px-4 py-2 hover:bg-white/5";
}

export default function AppTopNav() {
  const pathname = usePathname();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [userName, setUserName] = useState("User");
  const [loggingOut, setLoggingOut] = useState(false);

  async function loadAuth() {
    setLoading(true);
    try {
      const auth = await api<AuthMe>("/auth/me");
      setAuthenticated(!!auth.authenticated);
      setUserName(auth.user?.name || "User");
    } catch {
      setAuthenticated(false);
      setUserName("User");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAuth();
  }, [pathname]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await api("/auth/logout", {
        method: "POST",
      });
      setAuthenticated(false);
      router.push("/onboarding");
      router.refresh();
    } catch {
      setLoggingOut(false);
      return;
    }
    setLoggingOut(false);
  }

  return (
    <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-bold">
          V
        </div>
        <div>
          <div className="text-lg font-semibold">VigiliCloud</div>
          <div className="text-xs text-neutral-400">
            AWS security posture checks, remediation workflows, and evidence exports for lean teams and MSPs
          </div>
        </div>
      </div>

      <nav className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/" className={navClass(pathname === "/")}>
          Home
        </Link>
        <Link href="/plans" className={navClass(pathname === "/plans")}>
          Plans
        </Link>
        <Link href="/accounts" className={navClass(pathname === "/accounts")}>
          Accounts
        </Link>
        <Link href="/scans" className={navClass(pathname === "/scans")}>
          Scans
        </Link>
        <Link href="/launch" className={navClass(pathname === "/launch")}>
          Launch Prep
        </Link>
        <Link href="/settings" className={navClass(pathname === "/settings")}>
          Settings
        </Link>

        {loading ? (
          <span className="rounded-xl border border-white/10 px-4 py-2 text-neutral-400">
            ...
          </span>
        ) : authenticated ? (
          <>
            <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-emerald-300">
              {userName}
            </span>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-xl border border-white/10 px-4 py-2 hover:bg-white/5 disabled:opacity-60"
            >
              {loggingOut ? "Logging out..." : "Logout"}
            </button>
            <Link href="/scans" className="rounded-xl bg-white px-4 py-2 font-medium text-black">
              Open Workspace
            </Link>
          </>
        ) : (
          <Link href="/onboarding" className="rounded-xl bg-white px-4 py-2 font-medium text-black">
            Login
          </Link>
        )}
      </nav>
    </div>
  );
}