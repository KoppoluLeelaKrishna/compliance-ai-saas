import { Account, ScanItem } from "@/types";

interface ScanFiltersProps {
  accounts: Account[];
  scans: ScanItem[];
  selectedAccountId: string;
  selectedScanId: string;
  onAccountChange: (id: string) => void;
  onScanChange: (id: string) => void;
  search: string;
  setSearch: (val: string) => void;
  serviceFilter: string;
  setServiceFilter: (val: string) => void;
  severityFilter: string;
  setSeverityFilter: (val: string) => void;
  resolutionFilter: string;
  setResolutionFilter: (val: string) => void;
  services: string[];
  severities: string[];
  onClearFilters: () => void;
}

export function ScanFilters({
  accounts,
  scans,
  selectedAccountId,
  selectedScanId,
  onAccountChange,
  onScanChange,
  search,
  setSearch,
  serviceFilter,
  setServiceFilter,
  severityFilter,
  setSeverityFilter,
  resolutionFilter,
  setResolutionFilter,
  services,
  severities,
  onClearFilters,
}: ScanFiltersProps) {
  return (
    <div className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Account</label>
          <select
            value={selectedAccountId}
            onChange={(e) => onAccountChange(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black p-3 text-sm focus:border-emerald-500 focus:outline-none"
          >
            <option value="">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_name} ({a.aws_account_id})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Scan History</label>
          <select
            value={selectedScanId}
            onChange={(e) => onScanChange(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black p-3 text-sm focus:border-emerald-500 focus:outline-none"
          >
            {scans.length === 0 ? (
              <option value="">No scans found</option>
            ) : (
              scans.map((s) => (
                <option key={s.scan_id} value={s.scan_id}>
                  {new Date(s.created_at).toLocaleString()}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="lg:col-span-2 space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by check title, ID, resource, or evidence..."
            className="w-full rounded-xl border border-white/10 bg-black p-3 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-white/5 pt-6">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-500">Service:</span>
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-black px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
          >
            <option value="ALL">All Services</option>
            {services.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-500">Severity:</span>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-black px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
          >
            <option value="ALL">All Severities</option>
            {severities.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-500">Resolution:</span>
          <select
            value={resolutionFilter}
            onChange={(e) => setResolutionFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-black px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
          >
            <option value="ALL">All Status</option>
            <option value="OPEN">Open</option>
            <option value="FIXED">Fixed</option>
            <option value="IGNORED">Ignored</option>
          </select>
        </div>

        <button
          onClick={onClearFilters}
          className="ml-auto text-xs text-neutral-500 hover:text-white"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
}
