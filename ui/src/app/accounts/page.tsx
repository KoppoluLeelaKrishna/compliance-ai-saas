"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import { Account, BillingMe } from "@/types";
import TopbarActions from "@/components/app/TopbarActions";

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

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "vc-ok",
  PENDING: "vc-sev-medium",
  INACTIVE: "vc-neutral",
  ERROR: "vc-sev-critical",
};

function statusTone(status?: string) {
  return STATUS_TONE[status?.toUpperCase() ?? ""] ?? "vc-sev-medium";
}

function statusLabel(status?: string) {
  const s = (status || "PENDING").toUpperCase();
  return s[0] + s.slice(1).toLowerCase();
}

/** Column track for the connected-accounts register. */
const ACCOUNT_COLS = "1fr 160px 130px 120px 190px";

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
    <>
      <TopbarActions>
        <Link href="/onboarding" className="vc-btn">
          CloudFormation template
        </Link>
        <button type="button" className="vc-btn-primary" onClick={startCreate} disabled={limitReached}>
          Connect account
        </button>
      </TopbarActions>

      <div className="vc-page-head">
        <div>
          <h1 className="vc-h1">Accounts</h1>
          <p className="vc-sub">
            Read-only IAM roles. Credentials are never stored — access is assumed per scan.
          </p>
        </div>
        <div className="text-right">
          <div className="mb-1.5 text-[12.5px] text-[var(--vc-muted)]">
            {loadingBilling ? "Checking plan…" : `${accountsUsed} of ${accountLimit} on the ${currentPlan} plan`}
          </div>
          <div className={`vc-meter vc-meter-thin w-[200px] ${usagePct >= 100 ? "vc-sev-critical" : usagePct >= 75 ? "vc-sev-high" : "text-[var(--vc-accent)]"}`}>
            <i style={{ width: `${Math.min(usagePct, 100)}%` }} />
          </div>
        </div>
      </div>

      {error && <div className="vc-note vc-note-error">{error}</div>}
      {message && !error && <div className="vc-note vc-note-success">{message}</div>}

      {limitReached && (
        <div className="vc-note items-center">
          <div className="flex-1">
            <div className="font-semibold text-[var(--vc-text)]">Account limit reached</div>
            <div className="mt-0.5 text-[12.5px] text-[var(--vc-muted)]">
              The {currentPlan} plan allows up to {accountLimit} connected account{accountLimit !== 1 ? "s" : ""}.
            </div>
          </div>
          <Link href="/plans" className="vc-btn-primary">Upgrade plan</Link>
        </div>
      )}

      <div className="vc-grid" style={{ gridTemplateColumns: "400px 1fr" }}>

        {/* ── Connect / edit panel ─────────────────────────────────────── */}
        <form onSubmit={submitForm} className="vc-card !p-6 flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[17px] font-semibold tracking-[-0.374px] text-[var(--vc-text)]">
                {editing ? "Edit account" : "Connect an account"}
              </div>
              <div className="mt-1.5 text-[12.5px] leading-[1.5] text-[var(--vc-muted)]">
                {editing
                  ? "Update the role and region VigiliCloud assumes for this account."
                  : "Deploy the role with one CloudFormation stack, then paste the ARN."}
              </div>
            </div>
            {editing && (
              <button type="button" onClick={startCreate} className="vc-link !text-[var(--vc-muted)]">
                Clear
              </button>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-4">
            <div>
              <label className="vc-label" htmlFor="acct-client">Client</label>
              <input
                id="acct-client"
                className="vc-input"
                value={form.customer_name}
                onChange={e => onChange("customer_name", e.target.value)}
                placeholder="Acme Retail"
                required
                disabled={!editing && limitReached}
              />
            </div>

            <div>
              <label className="vc-label" htmlFor="acct-name">Account name</label>
              <input
                id="acct-name"
                className="vc-input"
                value={form.account_name}
                onChange={e => onChange("account_name", e.target.value)}
                placeholder="Production"
                required
                disabled={!editing && limitReached}
              />
            </div>

            <div className="vc-grid vc-grid-2 !gap-3">
              <div>
                <label className="vc-label" htmlFor="acct-aws-id">AWS account ID</label>
                <input
                  id="acct-aws-id"
                  className="vc-input vc-input-mono"
                  value={form.aws_account_id}
                  onChange={e => onChange("aws_account_id", e.target.value)}
                  placeholder="489411223344"
                  inputMode="numeric"
                  required
                  disabled={!editing && limitReached}
                />
              </div>
              <div>
                <label className="vc-label" htmlFor="acct-region">Region</label>
                <input
                  id="acct-region"
                  className="vc-input"
                  value={form.region}
                  onChange={e => onChange("region", e.target.value)}
                  placeholder="us-east-1"
                  required
                  disabled={!editing && limitReached}
                />
              </div>
            </div>

            <div>
              <label className="vc-label" htmlFor="acct-arn">Role ARN</label>
              <textarea
                id="acct-arn"
                className="vc-textarea"
                value={form.role_arn}
                onChange={e => onChange("role_arn", e.target.value)}
                placeholder="arn:aws:iam::489411223344:role/VigiliCloudReadOnly"
                required
                disabled={!editing && limitReached}
              />
            </div>

            <div>
              <label className="vc-label" htmlFor="acct-ext">External ID</label>
              <input
                id="acct-ext"
                className="vc-input vc-input-mono"
                value={form.external_id}
                onChange={e => onChange("external_id", e.target.value)}
                placeholder="Optional"
                disabled={!editing && limitReached}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-[var(--vc-hairline-strong)] bg-[var(--vc-fill)] px-3.5 py-3">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => onChange("is_active", e.target.checked)}
                disabled={!editing && limitReached}
                className="h-4 w-4 accent-[var(--vc-accent)]"
              />
              <span className="text-[13.5px] text-[var(--vc-text)]">Account is active</span>
            </label>
          </div>

          <div className="mt-auto flex gap-2.5 pt-6">
            <button type="submit" className="vc-btn-primary vc-btn-lg flex-1" disabled={saving || (!editing && limitReached)}>
              {saving ? "Saving…" : editing ? "Update account" : "Connect account"}
            </button>
            {editing && (
              <button
                type="button"
                className="vc-btn-secondary vc-btn-lg"
                onClick={() => testConnection(editing.id)}
                disabled={testingId === editing.id}
              >
                {testingId === editing.id ? "Testing…" : "Test"}
              </button>
            )}
          </div>
        </form>

        {/* ── Connected accounts register ──────────────────────────────── */}
        <div className="vc-card vc-card-flush flex flex-col">
          <div className="vc-card-head">
            <div>
              <div className="vc-card-title">Connected accounts</div>
              <div className="vc-card-sub">
                {accounts.length} configured · {activeCount} active
              </div>
            </div>
            <button type="button" className="vc-btn" onClick={loadAccounts} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="vc-thead" style={{ gridTemplateColumns: ACCOUNT_COLS }}>
            <span>Client / account</span>
            <span>AWS ID</span>
            <span>Region</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>

          {loading ? (
            <div className="p-5"><div className="vc-skel h-14 w-full" /></div>
          ) : accounts.length === 0 ? (
            <div className="vc-empty">
              No accounts connected yet — fill in the panel on the left to add your first.
            </div>
          ) : (
            accounts.map(account => (
              <div
                key={account.id}
                className={`vc-tr${account.status?.toUpperCase() === "ERROR" ? " is-error" : ""}`}
                style={{ gridTemplateColumns: ACCOUNT_COLS }}
              >
                <div className="min-w-0">
                  <div className="vc-cell-strong truncate">{account.customer_name}</div>
                  <div className="vc-cell-sub truncate">{account.account_name}</div>
                </div>
                <span className="vc-mono truncate text-[11.5px] text-[var(--vc-text-2)]">{account.aws_account_id}</span>
                <span className="vc-cell">{account.region || "—"}</span>
                <span className={`text-[11.5px] font-semibold ${statusTone(account.status)}`}>
                  {statusLabel(account.status)}
                </span>
                <div className="flex justify-end gap-2">
                  <button type="button" className="vc-link !text-[var(--vc-muted)]" onClick={() => startEdit(account)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="vc-link"
                    onClick={() => testConnection(account.id)}
                    disabled={testingId === account.id}
                  >
                    {testingId === account.id ? "Testing…" : "Test"}
                  </button>
                  <button
                    type="button"
                    className="vc-link vc-sev-critical"
                    onClick={() => deleteAccount(account.id)}
                    disabled={deletingId === account.id}
                  >
                    {deletingId === account.id ? "…" : "Delete"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
