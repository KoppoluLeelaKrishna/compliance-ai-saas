"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Account, BillingMe } from "@/types";

type AccountForm = {
  customer_name: string;
  account_name: string;
  aws_account_id: string;
  role_arn: string;
  external_id: string;
  region: string;
  is_active: boolean;
};

const emptyForm: AccountForm = {
  customer_name: "",
  account_name: "",
  aws_account_id: "",
  role_arn: "",
  external_id: "",
  region: "us-east-1",
  is_active: true,
};

const STATUS_CONFIG: Record<string, { border: string; bg: string; text: string }> = {
  ACTIVE:   { border: "border-emerald-500/30", bg: "bg-emerald-500/10", text: "text-emerald-400" },
  PENDING:  { border: "border-yellow-500/30",  bg: "bg-yellow-500/10",  text: "text-yellow-400"  },
  INACTIVE: { border: "border-red-500/30",     bg: "bg-red-500/10",     text: "text-red-400"     },
  ERROR:    { border: "border-red-500/30",     bg: "bg-red-500/10",     text: "text-red-400"     },
};

function statusCfg(status?: string) {
  return STATUS_CONFIG[status?.toUpperCase() ?? ""] ?? STATUS_CONFIG.PENDING;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [billing, setBilling] = useState<BillingMe | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingBilling, setLoadingBilling] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadAccounts() {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ accounts: Account[] }>("/accounts");
      setAccounts(data.accounts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }

  async function loadBilling() {
    setLoadingBilling(true);
    try {
      const data = await api<BillingMe>("/billing/me");
      setBilling(data);
    } catch {
      /* billing failure is non-fatal */
    } finally {
      setLoadingBilling(false);
    }
  }

  useEffect(() => {
    (async () => { await Promise.all([loadAccounts(), loadBilling()]); })();
  }, []);

  const activeCount = useMemo(() => accounts.filter(a => a.is_active).length, [accounts]);
  const currentPlan = (billing?.subscription_status || "free").toUpperCase();
  const accountLimit = billing?.account_limit ?? 1;
  const accountsUsed = billing?.connected_accounts_used ?? accounts.length;
  const limitReached = !editing && accountsUsed >= accountLimit;

  const usagePct = accountLimit > 0 ? Math.round((accountsUsed / accountLimit) * 100) : 0;

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setMessage("");
    setError("");
  }

  function startEdit(account: Account) {
    setEditing(account);
    setForm({
      customer_name: account.customer_name,
      account_name: account.account_name,
      aws_account_id: account.aws_account_id,
      role_arn: account.role_arn || "",
      external_id: account.external_id || "",
      region: account.region || "us-east-1",
      is_active: !!account.is_active,
    });
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onChange<K extends keyof AccountForm>(key: K, value: AccountForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (editing) {
        await api(`/accounts/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...form, status: editing.status || "PENDING" }),
        });
        setMessage("Account updated successfully.");
      } else {
        await api("/accounts", { method: "POST", body: JSON.stringify(form) });
        setMessage("Account connected successfully.");
      }
      setForm(emptyForm);
      setEditing(null);
      await Promise.all([loadAccounts(), loadBilling()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save account");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection(accountId: number) {
    setTestingId(accountId);
    setError("");
    setMessage("");
    try {
      const data = await api<{ message: string }>(`/accounts/test-connection/${accountId}`, { method: "POST" });
      setMessage(data.message || "Connection successful.");
      await loadAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection test failed");
    } finally {
      setTestingId(null);
    }
  }

  async function deleteAccount(accountId: number) {
    const ok = window.confirm("Delete this account? This only works if there are no scans linked to it.");
    if (!ok) return;
    setDeletingId(accountId);
    setError("");
    setMessage("");
    try {
      await api(`/accounts/${accountId}`, { method: "DELETE" });
      setMessage("Account deleted.");
      if (editing?.id === accountId) { setEditing(null); setForm(emptyForm); }
      await Promise.all([loadAccounts(), loadBilling()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete account");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="space-y-5 pb-24">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-white/[0.04] via-transparent to-emerald-500/[0.02] p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-emerald-500/[0.05] blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10">
              <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Account Management</h1>
              <p className="mt-0.5 text-sm text-neutral-500">Connect and manage customer AWS accounts for compliance scanning</p>
              {!loading && (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="text-neutral-500">{accounts.length} connected</span>
                  <span className="font-medium text-emerald-400">{activeCount} active</span>
                  {!loadingBilling && <span className="font-medium text-violet-400">{currentPlan} plan</span>}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={loadAccounts}
            disabled={loading}
            className="shrink-0 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2 text-xs font-medium text-neutral-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-40 transition-colors"
          >
            {loading ? "Refreshing…" : "↺ Refresh"}
          </button>
        </div>
      </div>

      {/* ── Stat tiles ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Accounts", value: loading ? "…" : accounts.length, color: "text-white" },
          { label: "Active Accounts", value: loading ? "…" : activeCount, color: "text-emerald-400" },
          { label: "Current Plan",   value: loadingBilling ? "…" : currentPlan, color: "text-violet-400" },
          { label: "Account Usage",  value: loadingBilling ? "…" : `${accountsUsed}/${accountLimit}`, color: usagePct >= 100 ? "text-red-400" : usagePct >= 75 ? "text-yellow-400" : "text-emerald-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</div>
            <div className={`mt-2 text-3xl font-bold ${color}`}>{value}</div>
            {label === "Account Usage" && !loadingBilling && (
              <div className="mt-3 h-[2px] rounded-full bg-white/5">
                <div
                  className={`h-[2px] rounded-full transition-all duration-700 ${usagePct >= 100 ? "bg-red-500" : usagePct >= 75 ? "bg-yellow-500" : "bg-emerald-500"}`}
                  style={{ width: `${Math.min(usagePct, 100)}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Status banner ───────────────────────────────────────────────── */}
      {(message || error) && (
        <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${error ? "border-red-500/20 bg-red-500/[0.07] text-red-300" : "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"}`}>
          <span className="mt-0.5">{error ? "✕" : "✓"}</span>
          <span>{error || message}</span>
        </div>
      )}

      {/* ── Limit warning ───────────────────────────────────────────────── */}
      {limitReached && (
        <div className="flex flex-col gap-3 rounded-2xl border border-yellow-500/20 bg-yellow-500/[0.06] p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-semibold text-yellow-300">Account limit reached</div>
            <div className="mt-0.5 text-sm text-yellow-100/70">
              Your {currentPlan} plan allows up to {accountLimit} connected account{accountLimit !== 1 ? "s" : ""}. Upgrade to add more.
            </div>
          </div>
          <a href="/plans" className="shrink-0 rounded-xl bg-yellow-500/20 px-4 py-2 text-sm font-medium text-yellow-300 hover:bg-yellow-500/30 transition-colors">
            Upgrade plan →
          </a>
        </div>
      )}

      {/* ── Main layout ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">

        {/* ── Add / Edit form ──────────────────────────────────────────── */}
        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">{editing ? "Edit Account" : "Connect Account"}</h2>
              <p className="mt-0.5 text-xs text-neutral-500">{editing ? "Update the account configuration below." : "Fill in the AWS account details to connect."}</p>
            </div>
            {editing && (
              <button type="button" onClick={startCreate} className="text-xs text-neutral-500 hover:text-white transition-colors">
                ✕ Clear
              </button>
            )}
          </div>

          <form onSubmit={submitForm} className="space-y-4">
            {[
              { key: "customer_name" as const, label: "Customer Name", placeholder: "e.g. Acme Corp" },
              { key: "account_name" as const,  label: "Account Name",  placeholder: "e.g. Production" },
              { key: "aws_account_id" as const, label: "AWS Account ID", placeholder: "12-digit ID" },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</label>
                <input
                  value={form[key] as string}
                  onChange={e => onChange(key, e.target.value)}
                  className="w-full rounded-xl border border-white/[0.07] bg-black/40 px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-emerald-500/40 focus:outline-none transition-colors"
                  placeholder={placeholder}
                  required
                  disabled={!editing && limitReached}
                />
              </div>
            ))}

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Role ARN</label>
              <textarea
                value={form.role_arn}
                onChange={e => onChange("role_arn", e.target.value)}
                className="min-h-[72px] w-full rounded-xl border border-white/[0.07] bg-black/40 px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-emerald-500/40 focus:outline-none transition-colors resize-none"
                placeholder="arn:aws:iam::123456789012:role/VigiliCloud"
                required
                disabled={!editing && limitReached}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Region</label>
                <input
                  value={form.region}
                  onChange={e => onChange("region", e.target.value)}
                  className="w-full rounded-xl border border-white/[0.07] bg-black/40 px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-emerald-500/40 focus:outline-none transition-colors"
                  placeholder="us-east-1"
                  required
                  disabled={!editing && limitReached}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">External ID</label>
                <input
                  value={form.external_id}
                  onChange={e => onChange("external_id", e.target.value)}
                  className="w-full rounded-xl border border-white/[0.07] bg-black/40 px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-emerald-500/40 focus:outline-none transition-colors"
                  placeholder="Optional"
                  disabled={!editing && limitReached}
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 transition-colors hover:bg-white/[0.04]">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => onChange("is_active", e.target.checked)}
                disabled={!editing && limitReached}
                className="h-4 w-4 rounded border-white/20 bg-black text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
              />
              <span className="text-sm font-medium">Account is active</span>
            </label>

            <button
              type="submit"
              disabled={saving || (!editing && limitReached)}
              className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving…" : editing ? "Update Account" : "Connect Account"}
            </button>
          </form>
        </section>

        {/* ── Connected accounts table ──────────────────────────────────── */}
        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Connected Accounts</h2>
              <p className="mt-0.5 text-xs text-neutral-500">
                {accounts.length} account{accounts.length !== 1 ? "s" : ""} configured
              </p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 w-full animate-pulse rounded-2xl bg-white/[0.04]" />
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/[0.07] py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03]">
                <svg className="h-6 w-6 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-white">No accounts connected</div>
                <p className="mt-1 text-sm text-neutral-500">Connect your first AWS account to start running compliance scans.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    <th className="pb-3 pr-4 font-medium">Customer / Account</th>
                    <th className="pb-3 pr-4 font-medium">AWS ID</th>
                    <th className="pb-3 pr-4 font-medium">Region</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {accounts.map(account => {
                    const cfg = statusCfg(account.status);
                    return (
                      <tr key={account.id} className="group transition-colors hover:bg-white/[0.02]">
                        <td className="py-4 pr-4">
                          <div className="font-semibold text-white">{account.customer_name}</div>
                          <div className="mt-0.5 text-xs text-neutral-500">{account.account_name}</div>
                        </td>
                        <td className="py-4 pr-4 font-mono text-xs text-neutral-400">
                          {account.aws_account_id}
                        </td>
                        <td className="py-4 pr-4 text-xs text-neutral-400">
                          {account.region || "—"}
                        </td>
                        <td className="py-4 pr-4">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.border} ${cfg.bg} ${cfg.text}`}>
                            {account.status || "PENDING"}
                          </span>
                        </td>
                        <td className="py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(account)}
                              className="rounded-lg border border-white/[0.07] px-3 py-1.5 text-xs font-medium text-neutral-400 hover:bg-white/[0.05] hover:text-white transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => testConnection(account.id)}
                              disabled={testingId === account.id}
                              className="rounded-lg border border-white/[0.07] px-3 py-1.5 text-xs font-medium text-neutral-400 hover:bg-white/[0.05] hover:text-white disabled:opacity-40 transition-colors"
                            >
                              {testingId === account.id ? "Testing…" : "Test"}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteAccount(account.id)}
                              disabled={deletingId === account.id}
                              className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                            >
                              {deletingId === account.id ? "…" : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
