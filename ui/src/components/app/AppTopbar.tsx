"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppShell } from "./AppShellContext";

/** Route → breadcrumb leaf. Longest matching prefix wins. */
const CRUMBS: [string, string][] = [
  ["/dashboard", "Dashboard"],
  ["/scans", "Scans"],
  ["/findings", "Findings"],
  ["/accounts", "Accounts"],
  ["/msp", "Clients"],
  ["/onboarding", "Get started"],
  ["/launch", "Launch"],
  ["/plans", "Plans & billing"],
  ["/settings", "Settings"],
  ["/admin", "Admin"],
];

export function crumbFor(pathname: string) {
  const hit = CRUMBS.filter(([href]) => pathname === href || pathname.startsWith(`${href}/`)).sort(
    (a, b) => b[0].length - a[0].length,
  )[0];
  return hit?.[1] ?? "";
}

export default function AppTopbar() {
  const pathname = usePathname();
  const { workspace, navOpen, setNavOpen } = useAppShell();
  const leaf = crumbFor(pathname);
  const isScanDetail = /^\/scans\/.+/.test(pathname);

  return (
    <header className="vc-topbar">
      <div className="vc-crumbs">
        <button
          type="button"
          className="vc-btn !h-8 !w-8 !p-0 lg:!hidden"
          onClick={() => setNavOpen(!navOpen)}
          aria-label={navOpen ? "Close navigation" : "Open navigation"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <span className="vc-crumbs-root hidden sm:inline">{workspace}</span>
        {leaf && (
          <>
            <span className="vc-crumbs-sep hidden sm:inline">/</span>
            {isScanDetail ? (
              <>
                <Link href="/scans" className="vc-crumbs-root">
                  Scans
                </Link>
                <span className="vc-crumbs-sep">/</span>
                <span className="vc-crumbs-leaf vc-mono truncate">{pathname.split("/").pop()}</span>
              </>
            ) : (
              <span className="vc-crumbs-leaf">{leaf}</span>
            )}
          </>
        )}
      </div>

      {/* Pages fill this slot via <TopbarActions>. */}
      <div id="vc-topbar-actions" className="vc-topbar-actions" />
    </header>
  );
}
