"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AuthMe } from "@/types";

function navClass(active: boolean) {
  return active
    ? "rounded-xl bg-white px-4 py-2 font-bold text-black shadow-lg shadow-white/10"
    : "rounded-xl border border-white/10 px-4 py-2 font-medium text-neutral-400 hover:bg-white/5 hover:text-white transition-all";
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
    if (loggingOut) return;
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
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
      <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-xl font-bold text-emerald-400">
          V
        </div>
        <div>
          <div className="text-2xl font-black tracking-tight">VigiliCloud</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-bold">
            AWS Compliance SaaS
          </div>
        </div>
      </Link>

      <nav className="flex flex-wrap items-center gap-2 text-sm">
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

        <div className="mx-2 h-4 w-px bg-white/10 hidden md:block" />

        {loading ? (
          <div className="h-10 w-24 animate-pulse rounded-xl bg-white/5" />
        ) : authenticated ? (
          <div className="flex items-center gap-2">
            <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-300">
              {userName}
            </span>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-xl border border-white/10 px-4 py-2 font-medium text-neutral-400 hover:bg-white/5 disabled:opacity-50"
            >
              {loggingOut ? "..." : "Logout"}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link href="/signin" className="rounded-xl border border-white/10 px-4 py-2 font-medium text-neutral-400 hover:bg-white/5 hover:text-white transition-all text-sm">
              Sign In
            </Link>
            <Link href="/signup" className="rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400 transition-colors text-sm">
              Sign Up
            </Link>
          </div>
        )}
      </nav>
    </div>
  );
}