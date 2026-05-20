"use client";

import { useEffect } from "react";
import { API_BASE } from "@/lib/api";

export default function KeepAlive() {
  useEffect(() => {
    // Ping backend immediately on page load to wake it up from Render sleep
    fetch(`${API_BASE}/health`, { method: "GET" }).catch(() => {});

    // Then ping every 10 minutes to keep it awake while user is on site
    const interval = setInterval(() => {
      fetch(`${API_BASE}/health`, { method: "GET" }).catch(() => {});
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return null;
}
