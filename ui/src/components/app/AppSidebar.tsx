"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import NavIcon, { NavIconName } from "@/components/NavIcon";
import { useAppShell } from "./AppShellContext";

type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  badge?: number | null;
  adminOnly?: boolean;
};

type NavGroup = { title: string; items: NavItem[] };

function initials(value: string) {
  const parts = value.trim().split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "VC";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function AppSidebar() {
  const pathname = usePathname();
  const { user, workspace, planLabel, findingsCount, accountsCount, navOpen, setNavOpen, signOut } = useAppShell();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the account menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const groups: NavGroup[] = [
    {
      title: "Monitor",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
        { href: "/scans", label: "Scans", icon: "scans" },
        { href: "/findings", label: "Findings", icon: "findings", badge: findingsCount },
      ],
    },
    {
      title: "Manage",
      items: [
        { href: "/accounts", label: "Accounts", icon: "accounts", badge: accountsCount },
        { href: "/msp", label: "Clients", icon: "msp" },
        { href: "/onboarding", label: "Get started", icon: "onboarding" },
        { href: "/launch", label: "Launch", icon: "launch" },
      ],
    },
    {
      title: "Workspace",
      items: [
        { href: "/plans", label: "Plans & billing", icon: "plans" },
        { href: "/settings", label: "Settings", icon: "settings" },
        { href: "/admin", label: "Admin", icon: "admin", adminOnly: true },
      ],
    },
  ];

  const isAdmin = user?.role === "admin";

  return (
    <>
      {navOpen && <div className="vc-side-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}

      <aside className={`vc-side${navOpen ? " is-open" : ""}`}>
        <Link href="/" className="vc-side-brand">
          <div className="vc-side-mark">V</div>
          <div className="flex flex-col gap-px">
            <div className="vc-side-wordmark">VigiliCloud</div>
            <div className="vc-side-wordsub">Cloud posture</div>
          </div>
        </Link>

        <Link href="/settings" className="vc-ws">
          <div className="vc-ws-avatar">{initials(workspace)}</div>
          <div className="min-w-0 flex-1">
            <div className="vc-ws-name truncate">{workspace}</div>
            <div className="vc-ws-plan truncate">{planLabel || " "}</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vc-dim)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="m7 15 5 5 5-5" />
            <path d="m7 9 5-5 5 5" />
          </svg>
        </Link>

        <nav className="vc-nav">
          {groups.map((group) => {
            const items = group.items.filter((it) => !it.adminOnly || isAdmin);
            if (items.length === 0) return null;
            return (
              <div key={group.title} className="vc-nav-group">
                <div className="vc-nav-title">{group.title}</div>
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setNavOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`vc-nav-item${active ? " is-active" : ""}`}
                    >
                      <NavIcon name={item.icon} />
                      <span className="vc-nav-label">{item.label}</span>
                      {item.badge != null && item.badge > 0 && <span className="vc-nav-badge">{item.badge}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="vc-side-foot" ref={menuRef}>
          {menuOpen && (
            <div className="vc-card mb-2 !p-1.5">
              <Link href="/settings" onClick={() => setMenuOpen(false)} className="vc-nav-item">
                <NavIcon name="settings" size={15} />
                <span className="vc-nav-label">Settings</span>
              </Link>
              <button type="button" onClick={signOut} className="vc-nav-item w-full">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" x2="9" y1="12" y2="12" />
                </svg>
                <span className="vc-nav-label">Sign out</span>
              </button>
            </div>
          )}

          <button
            type="button"
            className="vc-side-user"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <div className="vc-side-avatar">{initials(user?.name || user?.email || "User")}</div>
            <div className="min-w-0 flex-1">
              <div className="vc-side-name truncate">{user?.name || "Signed out"}</div>
              <div className="vc-side-role">
                {user ? `${user.role === "admin" ? "Owner" : "Member"} · ${user.email}` : "Not signed in"}
              </div>
            </div>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--vc-dim)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </button>
        </div>
      </aside>
    </>
  );
}
