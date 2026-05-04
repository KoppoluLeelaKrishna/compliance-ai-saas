import { Finding } from "@/types";
import { badgeClasses } from "@/lib/api";

interface FindingsTableProps {
  findings: Finding[];
  onOpenFinding: (finding: Finding) => void;
  loading: boolean;
}

export function FindingsTable({ findings, onOpenFinding, loading }: FindingsTableProps) {
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
                <div className="font-semibold text-white">{f.title}</div>
                <div className="mt-0.5 text-xs text-neutral-500">{f.check_id}</div>
              </td>
              <td className="px-6 py-4 font-mono text-xs text-neutral-400">
                {f.resource_id.length > 30 ? f.resource_id.substring(0, 30) + "..." : f.resource_id}
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
