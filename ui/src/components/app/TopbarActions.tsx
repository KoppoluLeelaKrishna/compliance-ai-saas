"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/** Never resubscribes — this store only distinguishes server from client. */
const noopSubscribe = () => () => {};

/**
 * Renders its children into the top bar's action slot.
 *
 * The redesign puts each page's primary action ("Run scan", "Connect account")
 * in the 58px bar rather than in the page body, so pages declare their actions
 * here and the shell places them. Renders nothing until the slot exists, which
 * also keeps it inert during SSR.
 */
export default function TopbarActions({ children }: { children: React.ReactNode }) {
  // The slot is server-rendered by AppTopbar, so it exists in the DOM by the
  // time this runs on the client. On the server there is no document at all.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  if (!mounted) return null;
  const slot = document.getElementById("vc-topbar-actions");
  if (!slot) return null;

  return createPortal(children, slot);
}
