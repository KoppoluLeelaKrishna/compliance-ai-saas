/**
 * Presentation helpers for the VigiliCloud design system.
 *
 * Everything here returns a `vc-*` class from globals.css rather than a raw
 * colour, so severity and state colouring stays derived from one token set.
 */

export type Tone = "vc-sev-critical" | "vc-sev-high" | "vc-sev-medium" | "vc-sev-low" | "vc-ok" | "vc-neutral";

const SEVERITY_TONE: Record<string, Tone> = {
  CRITICAL: "vc-sev-critical",
  HIGH: "vc-sev-high",
  MEDIUM: "vc-sev-medium",
  LOW: "vc-sev-low",
  INFO: "vc-neutral",
};

export function severityTone(severity?: string): Tone {
  return SEVERITY_TONE[(severity || "").toUpperCase()] ?? "vc-neutral";
}

/**
 * Colour for a finding's resolution / approval state.
 * Fixed and passing read green; requested and in-review read blue/amber; open reads red.
 */
export function stateTone(state?: string): Tone {
  switch ((state || "").toUpperCase()) {
    case "FIXED":
    case "PASS":
    case "APPROVED":
      return "vc-ok";
    case "IGNORED":
    case "FIX_REQUESTED":
      return "vc-sev-high";
    case "REJECTED":
    case "FAIL":
    case "OPEN":
      return "vc-sev-critical";
    default:
      return "vc-neutral";
  }
}

const STATE_LABEL: Record<string, string> = {
  FIX_REQUESTED: "Fix requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  FIXED: "Fixed",
  IGNORED: "Ignored",
  OPEN: "Open",
  PASS: "Passing",
  FAIL: "Open",
};

export function stateLabel(state?: string) {
  const key = (state || "OPEN").toUpperCase();
  return STATE_LABEL[key] ?? key;
}

/** Compact age string used in table cells: "6h", "2d", "3w". */
export function shortAge(iso?: string) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d`;
  return `${Math.round(days / 7)}w`;
}

/** "Today, 14:06" · "Yesterday, 22:00" · "2 Aug, 22:00" — the scans table format. */
export function scanTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  const today = new Date();
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(d, today)) return `Today, ${time}`;
  if (isSameDay(d, yesterday)) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
}

/** Duration between two ISO timestamps, as "1m 48s". */
export function duration(startIso?: string, endIso?: string) {
  if (!startIso || !endIso) return "—";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, "0")}s`;
}
