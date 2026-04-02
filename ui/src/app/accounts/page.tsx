"use client";

import { useEffect, useMemo, useState } from "react";
import AppTopNav from "@/components/AppTopNav";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type Account = {
  id: number;
  customer_name: string;
  account_name: string;
  aws_account_id: string;
  role_arn: string;
  external_id: string;
  region: string;
  status: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
};

type AccountForm = {
  customer_name: string;
  account_name: string;
  aws_account_id: string;
  role_arn: string;
  external_id: string;
  region: string;
  is_active: boolean;
};

type BillingMe = {
  subscription_status: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  account_limit?: number;
  connected_accounts_used?: number;
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
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
      role_arn: account.role_arn,
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
    <main className="min-h-screen bg-black px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <AppTopNav />

        <div className="mb-8">
          <h1 className="text-3xl font-bold">Account Management</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Add, edit, test, and manage connected customer AWS accounts.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Total Accounts</div>
            <div className="mt-2 text-3xl font-bold">{accounts.length}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Active Accounts</div>
            <div className="mt-2 text-3xl font-bold">{activeCount}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Current Plan</div>
            <div className="mt-2 text-3xl font-bold">{loadingBilling ? "..." : currentPlan}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm text-neutral-400">Account Usage</div>
            <div className="mt-2 text-3xl font-bold">
              {loadingBilling ? "..." : `${accountsUsed}/${accountLimit}`}
            </div>
          </div>
        </div>

        {message ? (
          <div className="mb-4 rounded-xl border border-emerald-700 bg-emerald-950 px-4 py-3 text-sm text-emerald-200">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-xl border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {limitReached ? (
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-yellow-700 bg-yellow-950/40 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-semibold text-yellow-300">Account limit reached</div>
              <div className="mt-1 text-sm text-yellow-100/80">
                Your current plan allows up to {accountLimit} connected account(s). Upgrade to add more.
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {editing ? "Edit Account" : "Add Account"}
              </h2>
              <button
                onClick={startCreate}
                className="rounded-xl border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900"
              >
                New
              </button>
            </div>

            {!editing && limitReached ? (
              <div className="mb-4 rounded-xl border border-dashed border-neutral-700 bg-black p-4 text-sm text-neutral-400">
                You have used all available account slots for your current plan.
                Upgrade on the Plans page to create another account.
              </div>
            ) : null}

            <form onSubmit={submitForm} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-neutral-300">Customer Name</label>
                <input
                  value={form.customer_name}
                  onChange={(e) => onChange("customer_name", e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-black px-3 py-2 outline-none focus:border-neutral-600"
                  placeholder="Origin Bank"
                  required
                  disabled={!editing && limitReached}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Account Name</label>
                <input
                  value={form.account_name}
                  onChange={(e) => onChange("account_name", e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-black px-3 py-2 outline-none focus:border-neutral-600"
                  placeholder="Production AWS"
                  required
                  disabled={!editing && limitReached}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">AWS Account ID</label>
                <input
                  value={form.aws_account_id}
                  onChange={(e) => onChange("aws_account_id", e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-black px-3 py-2 outline-none focus:border-neutral-600"
                  placeholder="123456789012"
                  required
                  disabled={!editing && limitReached}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Role ARN</label>
                <textarea
                  value={form.role_arn}
                  onChange={(e) => onChange("role_arn", e.target.value)}
                  className="min-h-[90px] w-full rounded-xl border border-neutral-800 bg-black px-3 py-2 outline-none focus:border-neutral-600"
                  placeholder="arn:aws:iam::123456789012:role/ComplianceReadOnlyRole"
                  required
                  disabled={!editing && limitReached}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">External ID</label>
                <input
                  value={form.external_id}
                  onChange={(e) => onChange("external_id", e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-black px-3 py-2 outline-none focus:border-neutral-600"
                  placeholder="Optional"
                  disabled={!editing && limitReached}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Region</label>
                <input
                  value={form.region}
                  onChange={(e) => onChange("region", e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-black px-3 py-2 outline-none focus:border-neutral-600"
                  placeholder="us-east-1"
                  required
                  disabled={!editing && limitReached}
                />
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-neutral-800 p-3">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => onChange("is_active", e.target.checked)}
                  disabled={!editing && limitReached}
                />
                <span className="text-sm">Account is active</span>
              </label>

              <button
                type="submit"
                disabled={saving || (!editing && limitReached)}
                className="w-full rounded-xl bg-white px-4 py-2 font-medium text-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : editing ? "Update Account" : "Create Account"}
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Connected Accounts</h2>
              <span className="text-sm text-neutral-400">{accounts.length} total</span>
            </div>

            {loading ? (
              <div className="rounded-xl border border-neutral-800 p-4 text-neutral-400">
                Loading accounts...
              </div>
            ) : accounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-700 p-8 text-center">
                <div className="text-lg font-semibold">No accounts yet</div>
                <p className="mt-2 text-sm text-neutral-400">
                  Add your first customer AWS account to begin customer-linked scans.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-neutral-400">
                    <tr className="border-b border-neutral-800">
                      <th className="px-3 py-3">Customer</th>
                      <th className="px-3 py-3">Account</th>
                      <th className="px-3 py-3">AWS Account ID</th>
                      <th className="px-3 py-3">Region</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Active</th>
                      <th className="px-3 py-3">Created</th>
                      <th className="px-3 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((account) => (
                      <tr key={account.id} className="border-b border-neutral-900 align-top">
                        <td className="px-3 py-3 font-medium">{account.customer_name}</td>
                        <td className="px-3 py-3">{account.account_name}</td>
                        <td className="px-3 py-3">{account.aws_account_id}</td>
                        <td className="px-3 py-3">{account.region}</td>
                        <td className="px-3 py-3">
                          <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs">
                            {account.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {account.is_active ? (
                            <span className="text-emerald-400">Yes</span>
                          ) : (
                            <span className="text-red-400">No</span>
                          )}
                        </td>
                        <td className="px-3 py-3">{fmtDate(account.created_at)}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => startEdit(account)}
                              className="rounded-lg border border-neutral-800 px-3 py-1 hover:bg-neutral-900"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => testConnection(account.id)}
                              disabled={testingId === account.id}
                              className="rounded-lg border border-neutral-800 px-3 py-1 hover:bg-neutral-900 disabled:opacity-60"
                            >
                              {testingId === account.id ? "Testing..." : "Test"}
                            </button>
                            <button
                              onClick={() => deleteAccount(account.id)}
                              disabled={deletingId === account.id}
                              className="rounded-lg border border-red-900 px-3 py-1 text-red-300 hover:bg-red-950 disabled:opacity-60"
                            >
                              {deletingId === account.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                          <div className="mt-2 break-all text-xs text-neutral-500">
                            {account.role_arn}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}