import { Account, ScanItem } from "@/types";
import { scanTime } from "@/lib/ui";

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
  const dirty =
    !!search || serviceFilter !== "ALL" || severityFilter !== "ALL" || resolutionFilter !== "ALL";

  return (
    <div className="vc-filters">
      <label className="vc-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vc-dim)" strokeWidth={1.8} strokeLinecap="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search check title, ID, resource"
        />
      </label>

      <select
        aria-label="Account"
        className="vc-chip"
        value={selectedAccountId}
        onChange={(e) => onAccountChange(e.target.value)}
      >
        <option value="">All accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.customer_name} · {a.account_name}
          </option>
        ))}
      </select>

      <select
        aria-label="Scan"
        className="vc-chip"
        value={selectedScanId}
        onChange={(e) => onScanChange(e.target.value)}
      >
        {scans.length === 0 ? (
          <option value="">No scans yet</option>
        ) : (
          scans.map((s) => (
            <option key={s.scan_id} value={s.scan_id}>
              {scanTime(s.created_at)}
            </option>
          ))
        )}
      </select>

      <select aria-label="Service" className="vc-chip" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
        <option value="ALL">All services</option>
        {services.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <select aria-label="Severity" className="vc-chip" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
        <option value="ALL">All severities</option>
        {severities.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <select aria-label="Resolution" className="vc-chip" value={resolutionFilter} onChange={(e) => setResolutionFilter(e.target.value)}>
        <option value="ALL">All states</option>
        <option value="OPEN">Open</option>
        <option value="FIXED">Fixed</option>
        <option value="IGNORED">Ignored</option>
      </select>

      {dirty && (
        <button type="button" onClick={onClearFilters} className="vc-link px-2">
          Clear
        </button>
      )}
    </div>
  );
}
