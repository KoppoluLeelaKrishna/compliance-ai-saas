import { Finding, FixGuidance } from "@/types";
import { badgeClasses, fmtDate } from "@/lib/api";

interface FindingDetailProps {
  finding: Finding | null;
  onClose: () => void;
  fixGuidance: FixGuidance | null;
  loadingGuidance: boolean;
  noteInput: string;
  setNoteInput: (val: string) => void;
  onSetAction: (action: "FIXED" | "IGNORED") => void;
  actionSaving: "FIXED" | "IGNORED" | null;
}

export function FindingDetail({
  finding,
  onClose,
  fixGuidance,
  loadingGuidance,
  noteInput,
  setNoteInput,
  onSetAction,
  actionSaving,
}: FindingDetailProps) {
  if (!finding) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl border-l border-white/10 bg-black p-8 shadow-2xl transition-transform md:w-2/3 lg:w-1/2 overflow-y-auto">
      <div className="mb-8 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Finding Detail</h2>
        <button
          onClick={onClose}
          className="rounded-full border border-white/10 p-2 hover:bg-white/5"
        >
          ✕
        </button>
      </div>

      <div className="space-y-8">
        <section>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${badgeClasses(finding.severity)}`}>
              {finding.severity}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${badgeClasses(finding.resolution || "OPEN")}`}>
              {finding.resolution || "OPEN"}
            </span>
            <span className="text-sm text-neutral-500">{finding.service}</span>
          </div>
          <h1 className="text-3xl font-bold leading-tight">{finding.title}</h1>
          <p className="mt-2 text-sm text-neutral-400">ID: {finding.check_id}</p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">Resource</h3>
          <div className="font-mono text-emerald-400 break-all">{finding.resource_id}</div>
          <div className="mt-4 text-xs text-neutral-500">Detected at: {fmtDate(finding.created_at)}</div>
        </section>

        <section>
          <h3 className="mb-4 text-xl font-bold">Fix Guidance</h3>
          {loadingGuidance ? (
            <div className="animate-pulse space-y-3">
              <div className="h-4 w-3/4 rounded bg-white/5" />
              <div className="h-4 w-1/2 rounded bg-white/5" />
              <div className="h-20 w-full rounded bg-white/5" />
            </div>
          ) : fixGuidance ? (
            <div className="space-y-6">
              <p className="text-neutral-300">{fixGuidance.summary}</p>
              
              <div>
                <h4 className="mb-2 font-semibold">Console Steps</h4>
                <ul className="list-inside list-disc space-y-2 text-sm text-neutral-400">
                  {fixGuidance.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ul>
              </div>

              {fixGuidance.cli && fixGuidance.cli.length > 0 && (
                <div>
                  <h4 className="mb-2 font-semibold">CLI Remediation</h4>
                  <pre className="overflow-auto rounded-xl bg-neutral-900 p-4 font-mono text-xs text-emerald-400">
                    {fixGuidance.cli.join("\n")}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <p className="text-neutral-500 italic">No remediation guidance available for this check yet.</p>
          )}
        </section>

        <section className="space-y-4">
          <h3 className="text-xl font-bold">Resolution Note</h3>
          <textarea
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Add a note about this resolution (e.g., ticket ID, exception reason)..."
            className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            rows={4}
          />
          <div className="flex gap-3">
            <button
              onClick={() => onSetAction("FIXED")}
              disabled={!!actionSaving}
              className="flex-1 rounded-xl bg-white px-6 py-3 font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
            >
              {actionSaving === "FIXED" ? "Saving..." : "Mark as Fixed"}
            </button>
            <button
              onClick={() => onSetAction("IGNORED")}
              disabled={!!actionSaving}
              className="flex-1 rounded-xl border border-white/10 px-6 py-3 font-medium hover:bg-white/5 disabled:opacity-50"
            >
              {actionSaving === "IGNORED" ? "Saving..." : "Mark as Ignored"}
            </button>
          </div>
        </section>

        <section>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500">Evidence</h3>
          <pre className="overflow-auto rounded-2xl border border-white/10 bg-black p-4 font-mono text-xs text-neutral-400">
            {JSON.stringify(finding.evidence, null, 2)}
          </pre>
        </section>
      </div>
    </div>
  );
}
