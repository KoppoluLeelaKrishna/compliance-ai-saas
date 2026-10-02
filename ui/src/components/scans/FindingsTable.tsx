import { Finding } from "@/types";
import { severityTone, shortAge, stateLabel, stateTone } from "@/lib/ui";

interface FindingsTableProps {
  findings: Finding[];
  onOpenFinding: (finding: Finding) => void;
  loading: boolean;
  search?: string;
}

/**
 * Column track shared by the header and every row. The finding title is the
 * one column that must stay readable, so it alone gets a floor; the other text
 * columns share what is left and truncate. (Fixed widths summing to ~840px
 * squeezed the title to "S3 …" on a laptop-width card.)
 */
const COLS = "minmax(200px, 2fr) minmax(0, 1.1fr) minmax(0, 1.4fr) minmax(0, 1.1fr) 52px 80px";

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-[var(--vc-accent-wash)] px-0.5 text-[var(--vc-accent-text)]">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function FindingsTable({ findings, onOpenFinding, loading, search = "" }: FindingsTableProps) {
  if (loading) {
    return (
      <div className="vc-card vc-card-flush">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="border-b border-[var(--vc-hairline-soft)] p-4 last:border-b-0">
            <div className="vc-skel h-6 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (findings.length === 0) {
    return (
      <div className="vc-card vc-card-flush">
        <div className="vc-empty">No findings match these filters.</div>
      </div>
    );
  }

  return (
    <div className="vc-card vc-card-flush">
      {/* The header lives inside the scroller (sticky) so the rows' scrollbar
          narrows both equally and the columns stay aligned. */}
      <div className="vc-scroll-rows">
      <div className="vc-thead vc-thead-sticky" style={{ gridTemplateColumns: COLS }}>
        <span>Finding</span>
        <span>Check</span>
        <span>Resource</span>
        <span>Account</span>
        <span>Age</span>
        <span className="text-right">State</span>
      </div>
      {findings.map((f) => {
        const resolved = f.resolution === "FIXED" || f.status === "PASS";
        // "OPEN" is the default resolution, not a decision: let a pass or an
        // approval status show through it.
        const userResolution = f.resolution && f.resolution !== "OPEN" ? f.resolution : "";
        const state = userResolution || (f.status === "PASS" ? "PASS" : f.approval_status || "OPEN");
        return (
          <div
            key={`${f.scan_id}-${f.check_id}-${f.resource_id}`}
            role="button"
            tabIndex={0}
            onClick={() => onOpenFinding(f)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenFinding(f);
              }
            }}
            className={`vc-tr vc-tr-hover${resolved ? " is-done" : ""}`}
            style={{ gridTemplateColumns: COLS }}
          >
            <div className="flex min-w-0 items-center gap-[11px]">
              <span className={`vc-dot ${resolved ? "vc-ok" : severityTone(f.severity)}`} />
              <span
                className={`vc-cell-strong truncate ${resolved ? "line-through" : ""}`}
                title={f.title}
              >
                <Highlight text={f.title} query={search} />
              </span>
              {f.drift_status === "NEW" && (
                <span className="vc-tag flex-none !text-[var(--vc-accent-text)]">New</span>
              )}
            </div>

            <span className="vc-mono truncate text-[11.5px] text-[var(--vc-muted)]" title={f.check_id}>
              <Highlight text={f.check_id} query={search} />
            </span>

            <span className="vc-mono truncate text-[11.5px] text-[var(--vc-text-2)]" title={f.resource_id}>
              <Highlight text={f.resource_id} query={search} />
            </span>

            <span className="vc-cell truncate">
              {f.customer_name ? `${f.customer_name} · ${f.account_name ?? ""}` : f.account_name || "—"}
            </span>

            <span className="text-[12.5px] text-[var(--vc-muted)]">{resolved ? "—" : shortAge(f.created_at)}</span>

            <span className={`text-right text-[11.5px] font-semibold ${stateTone(state)}`}>
              {stateLabel(state)}
            </span>
          </div>
        );
      })}
      </div>
    </div>
  );
}
