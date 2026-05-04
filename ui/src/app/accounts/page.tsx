"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Account, BillingMe } from "@/types";
import { Card } from "@/components/ui/Card";

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

function fmtDate(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
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

  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load billing status");
    } finally {
      setLoadingBilling(false);
    }
  }

  useEffect(() => {
    (async () => {
      await Promise.all([loadAccounts(), loadBilling()]);
    })();
  }, []);

  const activeCount = useMemo(
    () => accounts.filter((a) => a.is_active).length,
    [accounts]
  );

  const currentPlan = (billing?.subscription_status || "free").toUpperCase();
  const accountLimit = billing?.account_limit ?? 1;
  const accountsUsed = billing?.connected_accounts_used ?? accounts.length;
  const limitReached = !editing && accountsUsed >= accountLimit;

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
    setForm((prev) => ({ ...prev, [key]: value }));
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
          body: JSON.stringify({
            ...form,
            status: editing.status || "PENDING",
          }),
        });
        setMessage("Account updated successfully.");
      } else {
        await api("/accounts", {
          method: "POST",
          body: JSON.stringify(form),
        });
        setMessage("Account created successfully.");
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
      const data = await api<{ message: string }>(`/accounts/test-connection/${accountId}`, {
        method: "POST",
      });
      setMessage(data.message || "Connection successful.");
      await loadAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection test failed");
    } finally {
      setTestingId(null);
    }
  }

  async function deleteAccount(accountId: number) {
    const ok = window.confirm(
      "Delete this account? This only works if there are no scans linked to it."
    );
    if (!ok) return;

    setDeletingId(accountId);
    setError("");
    setMessage("");

    try {
      await api(`/accounts/${accountId}`, { method: "DELETE" });
      setMessage("Account deleted successfully.");
      if (editing?.id === accountId) {
        setEditing(null);
        setForm(emptyForm);
      }
      await Promise.all([loadAccounts(), loadBilling()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete account");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Account Management</h1>
        <p className="mt-2 text-neutral-400">
          Add, edit, test, and manage connected customer AWS accounts.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-5">
          <div className="text-sm text-neutral-400">Total Accounts</div>
          <div className="mt-2 text-3xl font-bold">{accounts.length}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-neutral-400">Active Accounts</div>
          <div className="mt-2 text-3xl font-bold">{activeCount}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-neutral-400">Current Plan</div>
          <div className="mt-2 text-3xl font-bold">{loadingBilling ? "..." : currentPlan}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-neutral-400">Account Usage</div>
          <div className="mt-2 text-3xl font-bold">
            {loadingBilling ? "..." : `${accountsUsed}/${accountLimit}`}
          </div>
        </Card>
      </div>

      {(message || error) && (
        <div className={`rounded-xl border p-4 text-sm ${error ? "border-red-700 bg-red-950/40 text-red-200" : "border-emerald-700 bg-emerald-950/40 text-emerald-200"}`}>
          {error || message}
        </div>
      )}

      {limitReached && (
        <div className="flex flex-col gap-3 rounded-2xl border border-yellow-700/50 bg-yellow-950/20 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-semibold text-yellow-300">Account limit reached</div>
            <div className="mt-1 text-sm text-yellow-100/80">
              Your current plan allows up to {accountLimit} connected account(s). Upgrade to add more.
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[400px_1fr]">
        <section>
          <Card className="h-full">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold">
                {editing ? "Edit Account" : "Add Account"}
              </h2>
              {editing && (
                <button
                  onClick={startCreate}
                  className="text-xs text-neutral-500 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>

            <form onSubmit={submitForm} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Customer Name</label>
                <input
                  value={form.customer_name}
                  onChange={(e) => onChange("customer_name", e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black px-4 py-2 outline-none focus:border-emerald-500"
                  placeholder="e.g. Acme Corp"
                  required
                  disabled={!editing && limitReached}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Account Name</label>
                <input
                  value={form.account_name}
                  onChange={(e) => onChange("account_name", e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black px-4 py-2 outline-none focus:border-emerald-500"
                  placeholder="e.g. Production"
                  required
                  disabled={!editing && limitReached}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">AWS Account ID</label>
                <input
                  value={form.aws_account_id}
                  onChange={(e) => onChange("aws_account_id", e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black px-4 py-2 outline-none focus:border-emerald-500"
                  placeholder="12-digit ID"
                  required
                  disabled={!editing && limitReached}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Role ARN</label>
                <textarea
                  value={form.role_arn}
                  onChange={(e) => onChange("role_arn", e.target.value)}
                  className="min-h-[80px] w-full rounded-xl border border-white/10 bg-black px-4 py-2 outline-none focus:border-emerald-500"
                  placeholder="arn:aws:iam::..."
                  required
                  disabled={!editing && limitReached}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Region</label>
                  <input
                    value={form.region}
                    onChange={(e) => onChange("region", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black px-4 py-2 outline-none focus:border-emerald-500"
                    placeholder="us-east-1"
                    required
                    disabled={!editing && limitReached}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">External ID</label>
                  <input
                    value={form.external_id}
                    onChange={(e) => onChange("external_id", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black px-4 py-2 outline-none focus:border-emerald-500"
                    placeholder="Optional"
                    disabled={!editing && limitReached}
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-white/10 p-4 transition-colors hover:bg-white/5">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => onChange("is_active", e.target.checked)}
                  disabled={!editing && limitReached}
                  className="h-4 w-4 rounded border-white/10 bg-black text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm font-medium">Account is active</span>
              </label>

              <button
                type="submit"
                disabled={saving || (!editing && limitReached)}
                className="w-full rounded-2xl bg-white px-4 py-3 font-bold text-black hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : editing ? "Update Account" : "Connect Account"}
              </button>
            </form>
          </Card>
        </section>

        <section>
          <Card>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold">Connected Accounts</h2>
              <span className="text-xs font-medium text-neutral-500">{accounts.length} total</span>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 w-full animate-pulse rounded-2xl bg-white/5" />
                ))}
              </div>
            ) : accounts.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 p-12 text-center">
                <div className="text-lg font-bold">No accounts connected</div>
                <p className="mt-2 text-sm text-neutral-400">
                  Connect your first customer AWS account to start running scans.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-xs uppercase tracking-wider text-neutral-500">
                      <th className="px-3 py-4 font-medium">Customer / Account</th>
                      <th className="px-3 py-4 font-medium">AWS ID</th>
                      <th className="px-3 py-4 font-medium">Status</th>
                      <th className="px-3 py-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {accounts.map((account) => (
                      <tr key={account.id} className="group">
                        <td className="px-3 py-5">
                          <div className="font-bold text-white">{account.customer_name}</div>
                          <div className="text-xs text-neutral-500">{account.account_name} • {account.region}</div>
                        </td>
                        <td className="px-3 py-5 font-mono text-xs text-neutral-400">
                          {account.aws_account_id}
                        </td>
                        <td className="px-3 py-5">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                            account.is_active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"
                          }`}>
                            {account.status}
                          </span>
                        </td>
                        <td className="px-3 py-5 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => startEdit(account)}
                              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/5"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => testConnection(account.id)}
                              disabled={testingId === account.id}
                              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/5 disabled:opacity-50"
                            >
                              {testingId === account.id ? "..." : "Test"}
                            </button>
                            <button
                              onClick={() => deleteAccount(account.id)}
                              disabled={deletingId === account.id}
                              className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      </div>
    </main>
  );
}