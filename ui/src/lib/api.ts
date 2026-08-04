export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      msg = data?.detail || data?.message || JSON.stringify(data);
    } catch {}
    throw new Error(msg);
  }

  return res.json();
}

export function fmtDate(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

/**
 * Pill classes for a severity or state value.
 *
 * Returns `vc-pill` plus a design-system tone class, so the colour comes from
 * the token set in globals.css rather than a hard-coded Tailwind palette.
 */
export function badgeClasses(value: string) {
  const v = value.toUpperCase();

  const tone =
    v === "CRITICAL" || v === "FAIL" || v === "OPEN" || v === "REJECTED" ? "vc-sev-critical"
    : v === "HIGH" || v === "IGNORED" || v === "FIX_REQUESTED" ? "vc-sev-high"
    : v === "MEDIUM" ? "vc-sev-medium"
    : v === "LOW" ? "vc-sev-low"
    : v === "PASS" || v === "FIXED" || v === "APPROVED" ? "vc-ok"
    : "vc-neutral";

  return `vc-pill ${tone}`;
}
