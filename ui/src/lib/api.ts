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

export function badgeClasses(value: string) {
  const v = value.toUpperCase();

  if (v === "CRITICAL") return "border-red-700 text-red-300 bg-red-950/40";
  if (v === "HIGH") return "border-orange-700 text-orange-300 bg-orange-950/40";
  if (v === "MEDIUM") return "border-yellow-700 text-yellow-300 bg-yellow-950/40";
  if (v === "LOW") return "border-blue-700 text-blue-300 bg-blue-950/40";
  if (v === "INFO") return "border-slate-700 text-slate-300 bg-slate-950/40";
  if (v === "PASS") return "border-emerald-700 text-emerald-300 bg-emerald-950/40";
  if (v === "FAIL") return "border-red-700 text-red-300 bg-red-950/40";
  if (v === "FIXED") return "border-emerald-700 text-emerald-300 bg-emerald-950/40";
  if (v === "IGNORED") return "border-yellow-700 text-yellow-300 bg-yellow-950/40";
  if (v === "OPEN") return "border-neutral-700 text-neutral-300 bg-neutral-900";
  return "border-neutral-700 text-neutral-300 bg-neutral-900";
}
