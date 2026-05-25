import { Finding } from "@/types";
import { badgeClasses } from "@/lib/api";

interface FindingsTableProps {
  findings: Finding[];
  onOpenFinding: (finding: Finding) => void;
  loading: boolean;
  search?: string;
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-violet-500/30 text-violet-200 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function FindingsTable({ findings, onOpenFinding, loading, search = "" }: FindingsTableProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 w-full animate-pulse rounded-2xl bg-white/5" />
        ))}
      </div>
    );
  }

  if (findings.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-12 text-center">
        <p className="text-neutral-400">No findings found matching your filters.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-wider text-neutral-500">
            <th className="px-6 py-4 font-medium">Severity</th>
            <th className="px-6 py-4 font-medium">Service</th>
            <th className="px-6 py-4 font-medium">Finding</th>
            <th className="px-6 py-4 font-medium">Resource</th>
            <th className="px-6 py-4 font-medium">Resolution</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {findings.map((f) => (
            <tr
              key={`${f.check_id}-${f.resource_id}`}
              onClick={() => onOpenFinding(f)}
              className="group cursor-pointer hover:bg-white/5"
            >
              <td className="px-6 py-4">
                <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${badgeClasses(f.severity)}`}>
                  {f.severity}
                </span>
              </td>
              <td className="px-6 py-4 font-medium text-neutral-300">{f.service}</td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">
                    <Highlight text={f.title} query={search} />
                  </span>
                  {f.drift_status === "NEW" && (
                    <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-cyan-400">
                      NEW
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  <Highlight text={f.check_id} query={search} />
                </div>
              </td>
              <td className="px-6 py-4 font-mono text-xs text-neutral-400 max-w-[200px]">
                <span className="break-all">
                  <Highlight text={f.resource_id} query={search} />
                </span>
              </td>
              <td className="px-6 py-4">
                <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${badgeClasses(f.resolution || "OPEN")}`}>
                  {f.resolution || "OPEN"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
