"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AuthMe } from "@/types";

function navLink(active: boolean) {
  return active
    ? "px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm font-medium"
    : "px-3 py-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 text-sm font-medium transition-colors";
}

export default function AppTopNav() {
  const pathname = usePathname();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [userName, setUserName] = useState("User");
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isAuthPage = pathname === "/signin" || pathname === "/signup";

  useEffect(() => {
    (async () => {
      try {
        const auth = await api<AuthMe>("/auth/me");
        setAuthenticated(!!auth.authenticated);
        setUserName(auth.user?.name || "User");
      } catch {
        setAuthenticated(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [pathname]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await api("/auth/logout", { method: "POST" });
      setAuthenticated(false);
      router.push("/signin");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  const appLinks = [
    { href: "/scans", label: "Scans" },
    { href: "/accounts", label: "Accounts" },
    { href: "/plans", label: "Plans" },
    { href: "/launch", label: "Launch" },
  ];

  return (
    <header className="mb-8 flex items-center justify-between">
      <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-base font-black text-emerald-400">
          V
        </div>
        <div>
          <div className="text-lg font-black tracking-tight leading-none">VigiliCloud</div>
          <div className="text-[9px] uppercase tracking-widest text-neutral-500 font-semibold">
            AWS Compliance
          </div>
        </div>
      </Link>

      {!isAuthPage && (
        <nav className="hidden md:flex items-center gap-1">
          {appLinks.map((link) => (
            <Link key={link.href} href={link.href} className={navLink(pathname === link.href)}>
              {link.label}
            </Link>
          ))}
        </nav>
      )}

      <div className="flex items-center gap-2">
        {loading ? (
          <div className="h-8 w-20 animate-pulse rounded-lg bg-white/5" />
        ) : authenticated ? (
          <div className="flex items-center gap-2">
            <span className="hidden sm:block rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
              {userName}
            </span>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:bg-white/5 hover:text-white disabled:opacity-50 transition-colors"
            >
              {loggingOut ? "..." : "Sign Out"}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/signin"
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:bg-white/5 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400 transition-colors"
            >
              Sign Up
            </Link>
          </div>
        )}

        {!isAuthPage && (
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="md:hidden rounded-lg border border-white/10 p-1.5 text-neutral-400 hover:bg-white/5"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        )}
      </div>

      {menuOpen && !isAuthPage && (
        <div className="absolute top-16 left-0 right-0 z-50 border-b border-white/10 bg-black/95 px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-2">
            {appLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={navLink(pathname === link.href) + " block"}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
