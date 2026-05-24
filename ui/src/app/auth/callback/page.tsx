"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Signing you in…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      router.replace("/signin?error=github_failed");
      return;
    }

    // Clear the token from the URL immediately (no browser history entry)
    window.history.replaceState({}, "", "/auth/callback");

    fetch(`${API_BASE}/auth/exchange?token=${encodeURIComponent(token)}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
      .then((res) => {
        if (!res.ok) throw new Error("exchange failed");
        router.replace("/scans");
      })
      .catch(() => {
        setStatus("Sign-in failed. Redirecting…");
        setTimeout(() => router.replace("/signin?error=github_failed"), 1500);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center space-y-3">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-emerald-500" />
        <p className="text-sm text-neutral-400">{status}</p>
      </div>
    </div>
  );
}
