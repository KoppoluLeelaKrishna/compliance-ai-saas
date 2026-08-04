"use client";

import { createContext, useContext } from "react";
import { AuthMe } from "@/types";

export type ShellUser = NonNullable<AuthMe["user"]>;

export type ShellState = {
  user: ShellUser | null;
  /** Open finding count — badge on the Findings nav row. */
  findingsCount: number | null;
  /** Connected account count — badge on the Accounts nav row. */
  accountsCount: number | null;
  /** Workspace label shown in the sidebar card and breadcrumb root. */
  workspace: string;
  /** Human-readable plan line, e.g. "Pro plan · 4 accounts". */
  planLabel: string;
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  signOut: () => void;
};

export const AppShellContext = createContext<ShellState>({
  user: null,
  findingsCount: null,
  accountsCount: null,
  workspace: "VigiliCloud",
  planLabel: "",
  navOpen: false,
  setNavOpen: () => {},
  signOut: () => {},
});

export const useAppShell = () => useContext(AppShellContext);
