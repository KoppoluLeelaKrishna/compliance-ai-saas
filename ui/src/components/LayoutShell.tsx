"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { AuthMe, BillingMe } from "@/types";
import KeepAlive from "@/components/KeepAlive";
import AssistantWidget from "@/components/assistant/AssistantWidget";
import AppSidebar from "@/components/app/AppSidebar";
import AppTopbar from "@/components/app/AppTopbar";
import { AppShellContext, ShellUser } from "@/components/app/AppShellContext";
import { BARE_ROUTES, applyTheme, getThemePref } from "@/lib/theme";

const PLAN_LABEL: Record<string, string> = {
  starter: "Starter plan",
  pro: "Pro plan",
  msp: "MSP plan",
  active: "Active plan",
  trial: "Trial",
  none: "No plan",
  inactive: "No plan",
};

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<ShellUser | null>(null);
  const [findingsCount, setFindingsCount] = useState<number | null>(null);
  const [accountsCount, setAccountsCount] = useState<number | null>(null);
  const [planKey, setPlanKey] = useState("");
  const [navOpen, setNavOpen] = useState(false);

  const bare = BARE_ROUTES.includes(pathname);

  // Re-apply on every route change (bare routes stay dark) and follow the OS
  // live while the preference is "system".
  useEffect(() => {
    applyTheme(getThemePref(), pathname);
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme(getThemePref(), pathname);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pathname]);

  useEffect(() => {
    if (bare) return;
    let cancelled = false;

    (async () => {
      try {
        const auth = await api<AuthMe>("/auth/me");
        if (cancelled) return;
        setUser(auth.authenticated && auth.user ? auth.user : null);
        if (!auth.authenticated) return;

        // Nav badges are decorative — a failure here must not blank the shell.
        const [billing, dash] = await Promise.allSettled([
          api<BillingMe>("/billing/me"),
          api<{ totals?: { accounts: number; critical: number; high: number; medium: number; low: number } }>("/dashboard"),
        ]);
        if (cancelled) return;

        if (billing.status === "fulfilled") {
          setPlanKey(billing.value.subscription_status || "");
          setAccountsCount(billing.value.connected_accounts_used ?? null);
        }
        if (dash.status === "fulfilled" && dash.value.totals) {
          const t = dash.value.totals;
          setAccountsCount(t.accounts);
          setFindingsCount(t.critical + t.high + t.medium + t.low);
        }
      } catch {
        if (!cancelled) setUser(null);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Keyed on `bare`, not `pathname`: the chrome's data does not change
    // between app routes, and refetching three endpoints on every navigation
    // triples the request load on a backend the pages are already hitting.
    // Entering the app from a bare route (sign-in) still re-runs this.
  }, [bare]);

  const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // Sign out locally even if the session is already gone server-side.
    }
    setUser(null);
    router.push("/signin");
    router.refresh();
  }, [router]);

  const workspace = user?.name || "VigiliCloud";
  const planLabel = useMemo(() => {
    const plan = PLAN_LABEL[planKey.toLowerCase()] ?? (planKey ? `${planKey} plan` : "");
    if (accountsCount == null) return plan;
    const accounts = `${accountsCount} account${accountsCount === 1 ? "" : "s"}`;
    return plan ? `${plan} · ${accounts}` : accounts;
  }, [planKey, accountsCount]);

  const shell = useMemo(
    () => ({ user, findingsCount, accountsCount, workspace, planLabel, navOpen, setNavOpen, signOut }),
    [user, findingsCount, accountsCount, workspace, planLabel, navOpen, signOut],
  );

  if (bare) {
    return (
      <>
        <KeepAlive />
        {children}
      </>
    );
  }

  return (
    <AppShellContext.Provider value={shell}>
      <div className="vc-app">
        <KeepAlive />
        <AppSidebar />
        <div className="vc-main">
          <AppTopbar />
          <main className="vc-content">{children}</main>
        </div>
        {user && <AssistantWidget />}
      </div>
    </AppShellContext.Provider>
  );
}
