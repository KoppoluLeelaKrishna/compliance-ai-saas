"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ApiKey, AuthMe, BillingMe } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type ScanSchedule = { enabled: boolean; interval_hours: number; plan_supports: boolean };
type SlackConfig = { configured: boolean; webhook_url_masked: string };
type JiraConfig = { jira_url: string; jira_email: string; jira_api_token_set: boolean; jira_project_key: string };
type GitHubConfig = { github_token_set: boolean; github_default_repo: string };

export default function SettingsPage() {
  const [user, setUser] = useState<AuthMe["user"] | null>(null);
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [schedule, setSchedule] = useState<ScanSchedule | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [runNowLoading, setRunNowLoading] = useState(false);
  const [slack, setSlack] = useState<SlackConfig | null>(null);
  const [slackInput, setSlackInput] = useState("");
  const [slackSaving, setSlackSaving] = useState(false);
  const [slackTesting, setSlackTesting] = useState(false);

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKeySecret, setNewKeySecret] = useState("");
  const [newKeyCopied, setNewKeyCopied] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<number | null>(null);

  const [jira, setJira] = useState<JiraConfig | null>(null);
  const [jiraInput, setJiraInput] = useState({ url: "", email: "", token: "", project_key: "" });
  const [jiraSaving, setJiraSaving] = useState(false);

  const [github, setGithub] = useState<GitHubConfig | null>(null);
  const [githubInput, setGithubInput] = useState({ token: "", repo: "" });
  const [githubSaving, setGithubSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const auth = await api<AuthMe>("/auth/me");
        if (auth.authenticated && auth.user) {
          setUser(auth.user);
          const [billingData, scheduleData, slackData, keysData, integrationData] = await Promise.all([
            api<BillingMe>("/billing/me"),
            api<ScanSchedule>("/settings/scan-schedule"),
            api<SlackConfig>("/settings/slack-webhook"),
            api<{ keys: ApiKey[] }>("/developer/api-keys"),
            api<{ jira: JiraConfig; github: GitHubConfig }>("/integrations/config"),
          ]);
          setBilling(billingData);
          setSchedule(scheduleData);
          setSlack(slackData);
          setApiKeys(keysData.keys || []);
          setJira(integrationData.jira);
          setGithub(integrationData.github);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggleSchedule() {
    if (!schedule) return;
    setScheduleLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await api<{ ok: boolean; enabled: boolean }>("/settings/scan-schedule", {
        method: "PUT",
        body: JSON.stringify({ enabled: !schedule.enabled }),
      });
      setSchedule(prev => prev ? { ...prev, enabled: data.enabled } : prev);
      setMessage(data.enabled ? "Scheduled scans enabled." : "Scheduled scans disabled.");
      setTimeout(() => setMessage(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update schedule");
    } finally {
      setScheduleLoading(false);
    }
  }

  async function saveSlack() {
    setSlackSaving(true);
    setError("");
    setMessage("");
    try {
      const data = await api<{ ok: boolean; configured: boolean }>("/settings/slack-webhook", {
        method: "PUT",
        body: JSON.stringify({ webhook_url: slackInput }),
      });
      setSlack(prev => prev ? { ...prev, configured: data.configured, webhook_url_masked: slackInput.slice(0, 40) + (slackInput.length > 40 ? "…***" : "") } : prev);
      setSlackInput("");
      setMessage(data.configured ? "Slack webhook saved." : "Slack webhook removed.");
      setTimeout(() => setMessage(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save webhook");
    } finally {
      setSlackSaving(false);
    }
  }

  async function removeSlack() {
    setSlackSaving(true);
    setError("");
    try {
      await api<{ ok: boolean }>("/settings/slack-webhook", { method: "DELETE" });
      setSlack({ configured: false, webhook_url_masked: "" });
      setSlackInput("");
      setMessage("Slack webhook removed.");
      setTimeout(() => setMessage(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove webhook");
    } finally {
      setSlackSaving(false);
    }
  }

  async function testSlack() {
    setSlackTesting(true);
    setError("");
    setMessage("");
    try {
      await api<{ ok: boolean }>("/settings/test-slack", { method: "POST" });
      setMessage("Test alert sent! Check your Slack channel.");
      setTimeout(() => setMessage(""), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed — check your webhook URL");
    } finally {
      setSlackTesting(false);
    }
  }

  async function createApiKey() {
    if (!newKeyLabel.trim() || creatingKey) return;
    setCreatingKey(true);
    setError("");
    setMessage("");
    try {
      const data = await api<{ id: number; key: string; key_prefix: string; label: string; created_at: string }>(
        "/developer/api-keys",
        { method: "POST", body: JSON.stringify({ label: newKeyLabel.trim() }) }
      );
      setNewKeySecret(data.key);
      setNewKeyLabel("");
      const newKey: ApiKey = { id: data.id, key_prefix: data.key_prefix, label: data.label, created_at: data.created_at, last_used_at: "", is_active: 1 };
      setApiKeys(prev => [newKey, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create API key");
    } finally {
      setCreatingKey(false);
    }
  }

  async function revokeApiKey(keyId: number) {
    setRevokingKeyId(keyId);
    try {
      await api<{ ok: boolean }>(`/developer/api-keys/${keyId}`, { method: "DELETE" });
      setApiKeys(prev => prev.filter(k => k.id !== keyId));
      setMessage("API key revoked.");
      setTimeout(() => setMessage(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke key");
    } finally {
      setRevokingKeyId(null);
    }
  }

  function copyNewKey() {
    navigator.clipboard.writeText(newKeySecret);
    setNewKeyCopied(true);
    setTimeout(() => setNewKeyCopied(false), 1800);
  }

  async function saveJira() {
    setJiraSaving(true);
    setError("");
    setMessage("");
    try {
      await api<{ ok: boolean }>("/integrations/jira", {
        method: "PUT",
        body: JSON.stringify({
          jira_url: jiraInput.url,
          jira_email: jiraInput.email,
          jira_api_token: jiraInput.token,
          jira_project_key: jiraInput.project_key,
        }),
      });
      setJira({
        jira_url: jiraInput.url,
        jira_email: jiraInput.email,
        jira_api_token_set: !!(jiraInput.url && jiraInput.email && jiraInput.token),
        jira_project_key: jiraInput.project_key,
      });
      setJiraInput({ url: "", email: "", token: "", project_key: "" });
      setMessage("Jira integration saved.");
      setTimeout(() => setMessage(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save Jira config");
    } finally {
      setJiraSaving(false);
    }
  }

  async function saveGitHub() {
    setGithubSaving(true);
    setError("");
    setMessage("");
    try {
      await api<{ ok: boolean }>("/integrations/github", {
        method: "PUT",
        body: JSON.stringify({ github_token: githubInput.token, github_default_repo: githubInput.repo }),
      });
      setGithub({ github_token_set: !!githubInput.token, github_default_repo: githubInput.repo });
      setGithubInput({ token: "", repo: "" });
      setMessage("GitHub integration saved.");
      setTimeout(() => setMessage(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save GitHub config");
    } finally {
      setGithubSaving(false);
    }
  }

  async function runNow() {
    setRunNowLoading(true);
    setError("");
    setMessage("");
    try {
      await api<{ ok: boolean }>("/settings/run-now", { method: "POST" });
      setMessage("Scans started in background. Check the Scans page in a few minutes.");
      setTimeout(() => setMessage(""), 6000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start scans");
    } finally {
      setRunNowLoading(false);
    }
  }

  async function syncBilling() {
    setSyncLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await api<BillingMe>("/billing/sync", { method: "POST" });
      setBilling(data);
      setMessage("Billing synced successfully.");
      setTimeout(() => setMessage(""), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Billing sync failed");
    } finally {
      setSyncLoading(false);
    }
  }

  async function openPortal() {
    setPortalLoading(true);
    setError("");
    try {
      const data = await api<{ url: string }>("/billing/portal", {
        method: "POST",
        body: JSON.stringify({ return_url: `${window.location.origin}/settings` }),
      });
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open billing portal");
      setPortalLoading(false);
    }
  }

  const currentPlan = (billing?.subscription_status || "free").toUpperCase();
  const isPaidPlan = billing?.subscription_status?.toLowerCase() !== "free";
  const accountsUsed = billing?.connected_accounts_used ?? 0;
  const accountLimit = billing?.account_limit ?? 1;
  const usagePct = accountLimit > 0 ? Math.round((accountsUsed / accountLimit) * 100) : 0;

  const NAV_LINKS = [
    { href: "/scans",    label: "Scans & Findings",   desc: "Run scans and review AWS posture findings",    icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" },
    { href: "/accounts", label: "Connected Accounts",  desc: "Manage AWS account connections",               icon: "M3 7h18M3 12h18M3 17h18" },
    { href: "/findings", label: "All Findings",        desc: "Aggregated view across all scans",            icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" },
    { href: "/plans",    label: "Plans & Billing",     desc: "Upgrade plan or manage your subscription",    icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" },
  ];

  return (
    <main className="space-y-5 pb-24">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-white/[0.04] via-transparent to-sky-500/[0.02] p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-sky-500/[0.05] blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-500/25 bg-sky-500/10">
            <svg className="h-5 w-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="mt-0.5 text-sm text-neutral-500">Manage your VigiliCloud profile, billing, and workspace</p>
          </div>
        </div>
      </div>

      {/* ── Status ─────────────────────────────────────────────────────── */}
      {(message || error) && (
        <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${error ? "border-red-500/20 bg-red-500/[0.07] text-red-300" : "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"}`}>
          <span className="mt-0.5">{error ? "✕" : "✓"}</span>
          <span>{error || message}</span>
        </div>
      )}

      {/* ── Stat tiles ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Current Plan",   value: loading ? "…" : currentPlan,              color: isPaidPlan ? "text-emerald-400" : "text-neutral-300" },
          { label: "Account Usage",  value: loading ? "…" : `${accountsUsed}/${accountLimit}`, color: usagePct >= 100 ? "text-red-400" : "text-white" },
          { label: "Exports",        value: loading ? "…" : billing?.capabilities?.exports ? "Enabled" : "Locked", color: billing?.capabilities?.exports ? "text-emerald-400" : "text-yellow-400" },
          { label: "Role",           value: loading ? "…" : (user?.role ?? "—"),     color: "text-sky-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</div>
            <div className={`mt-2 text-2xl font-bold capitalize ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">

        {/* ── Account Profile ──────────────────────────────────────────── */}
        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
              <svg className="h-4 w-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold">Account Profile</h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />)}
            </div>
          ) : !user ? (
            <div className="rounded-xl border border-dashed border-white/[0.07] p-8 text-center">
              <p className="text-sm text-neutral-500">Not authenticated. <Link href="/signin" className="text-emerald-400 hover:underline">Sign in</Link></p>
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { label: "Name",    value: user.name,  mono: false },
                { label: "Email",   value: user.email, mono: false },
                { label: "Role",    value: user.role,  mono: false },
                { label: "User ID", value: String(user.id), mono: true },
              ].map(({ label, value, mono }) => (
                <div key={label} className="rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</div>
                  <div className={`mt-1 ${mono ? "font-mono text-sm text-neutral-300" : "font-medium text-white capitalize"}`}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Billing & Plan ───────────────────────────────────────────── */}
        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
              <svg className="h-4 w-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold">Billing & Plan</h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />)}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Subscription Status</div>
                <div className={`mt-1 text-xl font-bold ${isPaidPlan ? "text-emerald-400" : "text-neutral-300"}`}>{currentPlan}</div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Account Usage</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className={`text-xl font-bold ${usagePct >= 100 ? "text-red-400" : usagePct >= 75 ? "text-yellow-400" : "text-emerald-400"}`}>
                    {accountsUsed}/{accountLimit}
                  </span>
                  <span className="text-xs text-neutral-500">accounts used</span>
                </div>
              </div>

              {!isPaidPlan && (
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.05] px-4 py-3 text-sm text-yellow-200">
                  Upgrade your plan to unlock account-linked scans and exports.{" "}
                  <Link href="/plans" className="font-medium underline">View Plans →</Link>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={syncBilling}
                  disabled={syncLoading}
                  className="rounded-xl border border-white/[0.07] px-4 py-2 text-sm text-neutral-400 hover:bg-white/[0.05] hover:text-white disabled:opacity-40 transition-colors"
                >
                  {syncLoading ? "Syncing…" : "↺ Sync Billing"}
                </button>
                {isPaidPlan ? (
                  <button
                    type="button"
                    onClick={openPortal}
                    disabled={portalLoading}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-40 transition-colors"
                  >
                    {portalLoading ? "Opening…" : "Manage Billing"}
                  </button>
                ) : (
                  <Link href="/plans" className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400 transition-colors">
                    Upgrade Plan
                  </Link>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── Plan Capabilities ────────────────────────────────────────── */}
        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
              <svg className="h-4 w-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold">Plan Capabilities</h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {[
                {
                  label: "Account-Linked Scans",
                  desc: "Run scans tied to specific connected AWS accounts",
                  enabled: billing?.capabilities?.account_linked_scans ?? false,
                },
                {
                  label: "Exports (JSON, CSV, PDF)",
                  desc: "Download findings as structured exports and evidence packs",
                  enabled: billing?.capabilities?.exports ?? false,
                },
                {
                  label: "Connected Accounts",
                  desc: `${accountsUsed} of ${accountLimit} slot${accountLimit !== 1 ? "s" : ""} used`,
                  enabled: true,
                },
              ].map(cap => (
                <div key={cap.label} className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                  <div>
                    <div className="font-medium text-white">{cap.label}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">{cap.desc}</div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${cap.enabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"}`}>
                    {cap.enabled ? "Enabled" : "Locked"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Scheduled Scans ──────────────────────────────────────────── */}
        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
              <svg className="h-4 w-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold">Scheduled Scans</h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />)}
            </div>
          ) : !schedule?.plan_supports ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.05] px-4 py-3 text-sm text-yellow-200">
                Scheduled scans require a paid plan with account-linked scans enabled.{" "}
                <Link href="/plans" className="font-medium underline">Upgrade →</Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                <div>
                  <div className="font-medium text-white">Auto-scan every {schedule?.interval_hours ?? 24} hours</div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    Runs a scan on all active accounts on your schedule
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleSchedule}
                  disabled={scheduleLoading}
                  title={schedule?.enabled ? "Disable scheduled scans" : "Enable scheduled scans"}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${schedule?.enabled ? "bg-emerald-500" : "bg-white/10"}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${schedule?.enabled ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Status</div>
                <div className={`mt-1 font-medium ${schedule?.enabled ? "text-emerald-400" : "text-neutral-400"}`}>
                  {schedule?.enabled ? "Active — scans run automatically" : "Inactive — manual scans only"}
                </div>
              </div>

              <button
                type="button"
                onClick={runNow}
                disabled={runNowLoading}
                className="w-full rounded-xl border border-white/[0.07] px-4 py-2.5 text-sm font-medium text-neutral-300 hover:bg-white/[0.05] hover:text-white disabled:opacity-40 transition-colors"
              >
                {runNowLoading ? "Starting scans…" : "▶ Run All Accounts Now"}
              </button>
            </div>
          )}
        </section>

        {/* ── Slack Alerts ──────────────────────────────────────────────── */}
        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
              <svg className="h-4 w-4 text-neutral-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
              </svg>
            </div>
            <h2 className="text-lg font-bold">Slack Alerts</h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {slack?.configured && (
                <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Configured webhook</div>
                    <div className="mt-0.5 font-mono text-xs text-emerald-300">{slack.webhook_url_masked}</div>
                  </div>
                  <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400">Active</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                  {slack?.configured ? "Replace webhook URL" : "Slack incoming webhook URL"}
                </label>
                <input
                  type="url"
                  value={slackInput}
                  onChange={e => setSlackInput(e.target.value)}
                  placeholder="https://hooks.slack.com/services/T.../B.../..."
                  className="w-full rounded-xl border border-white/[0.07] bg-black/40 px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-emerald-500/40 focus:outline-none transition-colors"
                />
                <p className="text-[10px] text-neutral-600">
                  In Slack: Apps → Incoming Webhooks → Add New Webhook → copy URL
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveSlack}
                  disabled={!slackInput.trim() || slackSaving}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:opacity-40 transition-colors"
                >
                  {slackSaving ? "Saving…" : "Save Webhook"}
                </button>
                {slack?.configured && (
                  <>
                    <button
                      type="button"
                      onClick={testSlack}
                      disabled={slackTesting}
                      className="rounded-xl border border-white/[0.07] px-4 py-2 text-sm text-neutral-400 hover:bg-white/[0.05] hover:text-white disabled:opacity-40 transition-colors"
                    >
                      {slackTesting ? "Sending…" : "Test Alert"}
                    </button>
                    <button
                      type="button"
                      onClick={removeSlack}
                      disabled={slackSaving}
                      className="rounded-xl border border-red-500/20 px-4 py-2 text-sm text-red-400 hover:bg-red-500/[0.07] disabled:opacity-40 transition-colors"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>

              {!slack?.configured && (
                <p className="text-xs text-neutral-600">
                  Once configured, CRITICAL findings will be posted to your Slack channel immediately after each scan.
                </p>
              )}
            </div>
          )}
        </section>

        {/* ── Jira Integration ─────────────────────────────────────────── */}
        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-blue-500/25 bg-blue-500/10">
              <svg className="h-4 w-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.004-1.005zm5.723-5.756H5.757a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.762a1.005 1.005 0 0 0-1.022-1.005zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24.018 12.49V1.005A1.005 1.005 0 0 0 23.013 0z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold">Jira Integration</h2>
              <p className="text-xs text-neutral-500">Create Jira tickets directly from findings</p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-white/[0.04]" />)}</div>
          ) : (
            <div className="space-y-3">
              {jira?.jira_url && (
                <div className="flex items-center justify-between rounded-xl border border-blue-500/20 bg-blue-500/[0.05] px-4 py-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Connected workspace</div>
                    <div className="mt-0.5 text-sm text-blue-300 font-mono">{jira.jira_url}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">{jira.jira_email} · Project: {jira.jira_project_key || "SEC"}</div>
                  </div>
                  <span className="shrink-0 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold text-blue-400">Active</span>
                </div>
              )}
              <div className="space-y-2">
                {[
                  { key: "url" as const, label: "Jira URL", placeholder: "https://yourorg.atlassian.net", type: "url" },
                  { key: "email" as const, label: "Email", placeholder: "you@company.com", type: "email" },
                  { key: "token" as const, label: "API Token", placeholder: "Atlassian API token", type: "password" },
                  { key: "project_key" as const, label: "Project Key", placeholder: "SEC", type: "text" },
                ].map(field => (
                  <div key={field.key}>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{field.label}</label>
                    <input
                      type={field.type}
                      value={jiraInput[field.key]}
                      onChange={e => setJiraInput(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="mt-1 w-full rounded-xl border border-white/[0.07] bg-black/40 px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-blue-500/40 focus:outline-none transition-colors"
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={saveJira}
                disabled={!jiraInput.url.trim() || !jiraInput.email.trim() || !jiraInput.token.trim() || jiraSaving}
                className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
              >
                {jiraSaving ? "Saving…" : jira?.jira_url ? "Update Jira Config" : "Connect Jira"}
              </button>
              <p className="text-[10px] text-neutral-600">Generate an Atlassian API token at id.atlassian.com → Security → API tokens</p>
            </div>
          )}
        </section>

        {/* ── GitHub Integration ───────────────────────────────────────── */}
        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
              <svg className="h-4 w-4 text-neutral-300" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12"/>
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold">GitHub Integration</h2>
              <p className="text-xs text-neutral-500">Create GitHub Issues directly from findings</p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-white/[0.04]" />)}</div>
          ) : (
            <div className="space-y-3">
              {github?.github_default_repo && (
                <div className="flex items-center justify-between rounded-xl border border-white/20 bg-white/[0.04] px-4 py-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Default repository</div>
                    <div className="mt-0.5 font-mono text-sm text-neutral-200">{github.github_default_repo}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">Token {github.github_token_set ? "configured ✓" : "not set"}</div>
                  </div>
                  <span className="shrink-0 rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-neutral-300">Active</span>
                </div>
              )}
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Personal Access Token</label>
                  <input
                    type="password"
                    value={githubInput.token}
                    onChange={e => setGithubInput(prev => ({ ...prev, token: e.target.value }))}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className="mt-1 w-full rounded-xl border border-white/[0.07] bg-black/40 px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-white/20 focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Default Repository</label>
                  <input
                    type="text"
                    value={githubInput.repo}
                    onChange={e => setGithubInput(prev => ({ ...prev, repo: e.target.value }))}
                    placeholder="owner/repository"
                    className="mt-1 w-full rounded-xl border border-white/[0.07] bg-black/40 px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-white/20 focus:outline-none transition-colors"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={saveGitHub}
                disabled={!githubInput.token.trim() || !githubInput.repo.trim() || githubSaving}
                className="w-full rounded-xl bg-neutral-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-600 disabled:opacity-40 transition-colors"
              >
                {githubSaving ? "Saving…" : github?.github_default_repo ? "Update GitHub Config" : "Connect GitHub"}
              </button>
              <p className="text-[10px] text-neutral-600">Create a token at github.com → Settings → Developer settings → Personal access tokens. Needs <span className="font-mono">repo</span> scope.</p>
            </div>
          )}
        </section>

        {/* ── Developer API Keys ───────────────────────────────────────── */}
        <section className="col-span-1 xl:col-span-2 rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
              <svg className="h-4 w-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold">Developer API Keys</h2>
              <p className="text-xs text-neutral-500">Use API keys to call VigiliCloud programmatically. Pass as <span className="font-mono">Authorization: Bearer vc_…</span></p>
            </div>
          </div>

          {newKeySecret && (
            <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4">
              <div className="mb-1 text-xs font-bold text-emerald-400">Key created — copy it now, it won&apos;t be shown again</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-lg bg-black/40 px-3 py-2 font-mono text-xs text-emerald-300">{newKeySecret}</code>
                <button type="button" onClick={copyNewKey} className="shrink-0 rounded-lg border border-emerald-500/30 px-3 py-2 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                  {newKeyCopied ? "Copied ✓" : "Copy"}
                </button>
              </div>
              <button type="button" onClick={() => setNewKeySecret("")} className="mt-2 text-xs text-neutral-600 hover:text-neutral-400 transition-colors">Dismiss</button>
            </div>
          )}

          {loading ? (
            <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-white/[0.04]" />)}</div>
          ) : (
            <div className="space-y-3">
              {apiKeys.filter(k => k.is_active).length > 0 && (
                <div className="space-y-2">
                  {apiKeys.filter(k => k.is_active).map(key => (
                    <div key={key.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                      <div className="min-w-0">
                        <div className="font-medium text-white truncate">{key.label}</div>
                        <div className="mt-0.5 flex items-center gap-3 text-xs text-neutral-500">
                          <span className="font-mono">{key.key_prefix}</span>
                          <span>Created {new Date(key.created_at).toLocaleDateString()}</span>
                          {key.last_used_at && <span>Last used {new Date(key.last_used_at).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => revokeApiKey(key.id)}
                        disabled={revokingKeyId === key.id}
                        className="shrink-0 rounded-xl border border-red-500/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/[0.07] disabled:opacity-40 transition-colors"
                      >
                        {revokingKeyId === key.id ? "Revoking…" : "Revoke"}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKeyLabel}
                  onChange={e => setNewKeyLabel(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && createApiKey()}
                  placeholder="Key label (e.g. GitHub Actions, CI pipeline)"
                  className="flex-1 rounded-xl border border-white/[0.07] bg-black/40 px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-emerald-500/40 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={createApiKey}
                  disabled={!newKeyLabel.trim() || creatingKey}
                  className="shrink-0 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-black hover:bg-emerald-400 disabled:opacity-40 transition-colors"
                >
                  {creatingKey ? "Creating…" : "+ New Key"}
                </button>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Usage example</div>
                <code className="block text-xs font-mono text-neutral-400 whitespace-pre-wrap">{"curl -H \"Authorization: Bearer vc_YOUR_KEY\" \\\n  " + API_BASE + "/scans"}</code>
              </div>
            </div>
          )}
        </section>

        {/* ── Quick Navigation ─────────────────────────────────────────── */}
        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
              <svg className="h-4 w-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold">Quick Navigation</h2>
          </div>

          <div className="space-y-2">
            {NAV_LINKS.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3 hover:bg-white/[0.04] hover:border-white/[0.10] transition-colors"
              >
                <svg className="h-4 w-4 shrink-0 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                <div className="min-w-0">
                  <div className="font-medium text-white">{item.label}</div>
                  <div className="text-xs text-neutral-500">{item.desc}</div>
                </div>
                <svg className="ml-auto h-3.5 w-3.5 shrink-0 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">API Endpoint</div>
            <div className="mt-1 break-all font-mono text-xs text-neutral-400">{API_BASE}</div>
          </div>
        </section>

      </div>
    </main>
  );
}
