"use client";

import { useState, useRef } from "react";
import { ApprovalEvent, ApprovalStatus, Finding, FixGuidance } from "@/types";
import { API_BASE, api, badgeClasses, fmtDate } from "@/lib/api";
import ChatMarkdown from "@/components/chat/ChatMarkdown";

interface FindingDetailProps {
  finding: Finding | null;
  onClose: () => void;
  fixGuidance: FixGuidance | null;
  loadingGuidance: boolean;
  noteInput: string;
  setNoteInput: (val: string) => void;
  onSetAction: (action: "FIXED" | "IGNORED") => void;
  actionSaving: "FIXED" | "IGNORED" | null;
  approvalEvents?: ApprovalEvent[];
  onRequestFix?: (assigneeEmail: string, note: string) => Promise<void>;
  onApprove?: (note: string) => Promise<void>;
  onReject?: (note: string) => Promise<void>;
  approvalSaving?: boolean;
}

const approvalBadge: Record<ApprovalStatus, string> = {
  OPEN: "vc-neutral",
  FIX_REQUESTED: "vc-sev-high",
  APPROVED: "vc-ok",
  REJECTED: "vc-sev-critical",
};

const approvalLabel: Record<ApprovalStatus, string> = {
  OPEN: "Open",
  FIX_REQUESTED: "Fix Requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export function FindingDetail({
  finding,
  onClose,
  fixGuidance,
  loadingGuidance,
  noteInput,
  setNoteInput,
  onSetAction,
  actionSaving,
  approvalEvents = [],
  onRequestFix,
  onApprove,
  onReject,
  approvalSaving = false,
}: FindingDetailProps) {
  const [assigneeEmail, setAssigneeEmail] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [showAuditLog, setShowAuditLog] = useState(false);

  const [ticketFormat, setTicketFormat] = useState<"jira" | "github">("jira");
  const [ticket, setTicket] = useState("");
  const [generatingTicket, setGeneratingTicket] = useState(false);
  const [ticketCopied, setTicketCopied] = useState(false);

  const [creatingJira, setCreatingJira] = useState(false);
  const [jiraResult, setJiraResult] = useState<{ issue_key: string; issue_url: string } | null>(null);
  const [creatingGitHub, setCreatingGitHub] = useState(false);
  const [githubResult, setGithubResult] = useState<{ issue_number: number; issue_url: string } | null>(null);
  const [verifyingFix, setVerifyingFix] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState("");
  const [remediating, setRemediating] = useState(false);
  const [remediateConfirm, setRemediateConfirm] = useState(false);
  const [remediateResult, setRemediateResult] = useState<{ ok: boolean; message: string } | null>(null);

  type ChatMsg = { role: "user" | "assistant"; content: string };
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  if (!finding) return null;

  const approvalStatus: ApprovalStatus = finding.approval_status || "OPEN";

  async function generateTicket() {
    if (!finding) return;
    setGeneratingTicket(true);
    setTicket("");
    try {
      const params = new URLSearchParams({
        check_id: finding.check_id,
        resource_id: finding.resource_id,
        format: ticketFormat,
      });
      const data = await api<{ ticket: string }>(
        `/scans/${finding.scan_id}/ticket-draft?${params}`,
        { method: "POST" }
      );
      setTicket(data.ticket || "");
    } catch (e) {
      setTicket(`Failed to generate ticket: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGeneratingTicket(false);
    }
  }

  function copyTicket() {
    navigator.clipboard.writeText(ticket);
    setTicketCopied(true);
    setTimeout(() => setTicketCopied(false), 1800);
  }

  async function createJiraTicket() {
    if (!finding) return;
    setCreatingJira(true);
    setJiraResult(null);
    try {
      const params = new URLSearchParams({ check_id: finding.check_id, resource_id: finding.resource_id });
      const data = await api<{ ok: boolean; issue_key: string; issue_url: string }>(
        `/scans/${finding.scan_id}/create-jira-ticket?${params}`,
        { method: "POST" }
      );
      setJiraResult({ issue_key: data.issue_key, issue_url: data.issue_url });
    } catch (e) {
      setJiraResult({ issue_key: "", issue_url: `Error: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setCreatingJira(false);
    }
  }

  async function createGitHubIssue() {
    if (!finding) return;
    setCreatingGitHub(true);
    setGithubResult(null);
    try {
      const params = new URLSearchParams({ check_id: finding.check_id, resource_id: finding.resource_id });
      const data = await api<{ ok: boolean; issue_number: number; issue_url: string }>(
        `/scans/${finding.scan_id}/create-github-issue?${params}`,
        { method: "POST" }
      );
      setGithubResult({ issue_number: data.issue_number, issue_url: data.issue_url });
    } catch (e) {
      setGithubResult({ issue_number: 0, issue_url: `Error: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setCreatingGitHub(false);
    }
  }

  async function verifyFix() {
    if (!finding) return;
    setVerifyingFix(true);
    setVerifyMsg("");
    try {
      const data = await api<{ ok: boolean; message: string }>(
        `/scans/${finding.scan_id}/verify-fix`,
        { method: "POST" }
      );
      setVerifyMsg(data.message || "Verification scan started.");
    } catch (e) {
      setVerifyMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setVerifyingFix(false);
    }
  }

  async function sendChat() {
    if (!finding || !chatInput.trim() || chatStreaming) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    const history = [...chatMessages];
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setChatStreaming(true);

    try {
      const params = new URLSearchParams({ resource_id: finding.resource_id });
      const res = await fetch(
        `${API_BASE}/scans/${finding.scan_id}/findings/${finding.check_id}/chat?${params}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userMsg, history }),
        }
      );
      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => `HTTP ${res.status}`);
        setChatMessages(prev => [...prev, { role: "assistant", content: `Error: ${err}` }]);
        return;
      }

      setChatMessages(prev => [...prev, { role: "assistant", content: "" }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setChatMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: text };
          return copy;
        });
        chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    } catch (e) {
      setChatMessages(prev => [...prev, { role: "assistant", content: `Error: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setChatStreaming(false);
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }

  const REMEDIABLE = new Set([
    "S3_PUBLIC_ACCESS_BLOCK_OFF",
    "S3_BUCKET_ACL_PUBLIC",
    "EC2_EBS_DEFAULT_ENCRYPTION_OFF",
    "CLOUDTRAIL_NOT_LOGGING",
    "CLOUDTRAIL_LOG_VALIDATION_DISABLED",
    "GITHUB_ORG_MFA_NOT_REQUIRED",
  ]);

  async function handleAutoFix() {
    if (!finding) return;
    if (!remediateConfirm) {
      setRemediateConfirm(true);
      return;
    }
    setRemediating(true);
    setRemediateResult(null);
    try {
      const data = await api<{ status: string; action: string; detail: string }>(
        `/remediation/scans/${finding.scan_id}/findings/${finding.check_id}`,
        { method: "POST", body: JSON.stringify({ confirm: true }) }
      );
      setRemediateResult({ ok: true, message: `${data.action}: ${data.detail}` });
      setRemediateConfirm(false);
    } catch (e) {
      setRemediateResult({ ok: false, message: `Failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setRemediating(false);
    }
  }

  async function handleRequestFix() {
    if (!onRequestFix) return;
    await onRequestFix(assigneeEmail, approvalNote);
    setAssigneeEmail("");
    setApprovalNote("");
  }

  async function handleApprove() {
    if (!onApprove) return;
    await onApprove(approvalNote);
    setApprovalNote("");
  }

  async function handleReject() {
    if (!onReject) return;
    await onReject(approvalNote);
    setApprovalNote("");
  }

  return (
    <>
      {/* The panel is the one place the system allows elevation, so it gets a scrim. */}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Finding detail"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l border-[var(--vc-hairline)] bg-[var(--vc-canvas)] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.6)] md:w-2/3 lg:w-1/2"
      >
      <div className="mb-8 flex items-center justify-between">
        <h2 className="vc-eyebrow">Finding detail</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--vc-hairline)] text-[var(--vc-muted)] hover:bg-[var(--vc-chip)] hover:text-[var(--vc-text)]"
        >
          ✕
        </button>
      </div>

      <div className="space-y-8">
        <section>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <span className={badgeClasses(finding.severity)}>{finding.severity}</span>
            <span className={badgeClasses(finding.resolution || "OPEN")}>{finding.resolution || "OPEN"}</span>
            <span className={`vc-pill ${approvalBadge[approvalStatus]}`}>{approvalLabel[approvalStatus]}</span>
            <span className="vc-tag">{finding.service}</span>
          </div>
          <h1 className="vc-h1 vc-h1-lg">{finding.title}</h1>
          <p className="vc-mono mt-2 text-[12.5px] text-[var(--vc-muted)]">{finding.check_id}</p>
        </section>

        <section className="vc-card">
          <h3 className="vc-eyebrow mb-3">Resource</h3>
          <div className="vc-mono break-all text-[var(--vc-accent-text)]">{finding.resource_id}</div>
          <div className="mt-4 text-xs text-[var(--vc-muted)]">Detected {fmtDate(finding.created_at)}</div>
        </section>

        <section>
          <h3 className="vc-card-title mb-4">Fix guidance</h3>
          {loadingGuidance ? (
            <div className="animate-pulse space-y-3">
              <div className="h-4 w-3/4 rounded bg-[var(--vc-chip)]" />
              <div className="h-4 w-1/2 rounded bg-[var(--vc-chip)]" />
              <div className="h-20 w-full rounded bg-[var(--vc-chip)]" />
            </div>
          ) : fixGuidance ? (
            <div className="space-y-6">
              <p className="text-[var(--vc-text-2)]">{fixGuidance.summary}</p>
              <div>
                <h4 className="mb-2 font-semibold">Console Steps</h4>
                <ul className="list-inside list-disc space-y-2 text-sm text-[var(--vc-muted)]">
                  {fixGuidance.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ul>
              </div>
              {fixGuidance.cli && fixGuidance.cli.length > 0 && (
                <div>
                  <h4 className="mb-2 font-semibold">CLI Remediation</h4>
                  <pre className="overflow-auto rounded-[10px] bg-[var(--vc-inset)] p-4 font-mono text-xs text-[var(--vc-accent-text)]">
                    {fixGuidance.cli.join("\n")}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[var(--vc-muted)] italic">No remediation guidance available for this check yet.</p>
          )}
        </section>

        {/* Auto-Remediation */}
        {REMEDIABLE.has(finding.check_id) && finding.resolution !== "FIXED" && (
          <section className="rounded-[14px] border border-[var(--vc-hairline)] bg-[var(--vc-raised)] p-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--vc-hairline)] bg-[var(--vc-accent-wash)]">
                <svg className="h-3.5 w-3.5 text-[var(--vc-accent-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-[var(--vc-text-2)]">Auto-Remediation Available</h3>
            </div>
            <p className="text-sm text-[var(--vc-muted)]">
              VigiliCloud can apply this fix automatically using the same IAM role used for scanning.
            </p>
            {remediateResult ? (
              <div className={`rounded-[10px] border px-4 py-3 text-sm ${remediateResult.ok ? "vc-note-success" : "vc-note-error"}`}>
                {remediateResult.message}
              </div>
            ) : remediateConfirm ? (
              <div className="space-y-3">
                <div className="rounded-[10px] border border-[var(--vc-hairline)] px-4 py-3 text-sm text-[var(--vc-medium)]">
                  This will make a live change in your AWS account. Are you sure?
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAutoFix}
                    disabled={remediating}
                    className="rounded-[10px] vc-btn-primary vc-btn-lg"
                  >
                    {remediating ? "Applying…" : "Yes, apply fix"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemediateConfirm(false)}
                    className="rounded-[10px] border border-[var(--vc-hairline)] px-4 py-2 text-sm text-[var(--vc-text-2)] hover:bg-[var(--vc-chip)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleAutoFix}
                className="rounded-[10px] vc-btn-secondary vc-btn-lg"
              >
                Auto-Fix This Issue
              </button>
            )}
          </section>
        )}

        {/* AI Chat — placed early so it's visible without heavy scrolling */}
        <section className="rounded-[14px] border border-[var(--vc-hairline)] bg-[var(--vc-raised)] p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--vc-hairline)] bg-[var(--vc-accent-wash)]">
              <svg className="h-3.5 w-3.5 text-[var(--vc-accent-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-[var(--vc-text)]">Ask AI about this finding</h3>
          </div>
          <p className="text-xs text-[var(--vc-muted)]">Powered by Claude Haiku · grounded in this finding&apos;s evidence</p>

          {chatMessages.length > 0 && (
            <div className="max-h-80 overflow-y-auto space-y-3 rounded-[10px] border border-[var(--vc-hairline)] bg-[var(--vc-inset)] p-4">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--vc-hairline)] bg-[var(--vc-accent-wash)] text-[10px] font-bold text-[var(--vc-accent-text)]">AI</div>
                  )}
                  <div className={`max-w-[85%] rounded-[14px] px-3.5 py-2.5 ${
                    msg.role === "user"
                      ? "bg-[var(--vc-chip)] text-[var(--vc-text)] text-sm"
                      : "bg-[var(--vc-accent-wash)]"
                  }`}>
                    {msg.role === "user"
                      ? msg.content
                      : <ChatMarkdown text={msg.content} streaming={chatStreaming && i === chatMessages.length - 1} />
                    }
                  </div>
                  {msg.role === "user" && (
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--vc-hairline)] bg-[var(--vc-chip)] text-[10px] font-bold text-[var(--vc-muted)]">You</div>
                  )}
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat()}
              placeholder="Is this a false positive? How do I fix this in Terraform?…"
              disabled={chatStreaming}
              className="flex-1 rounded-[10px] border border-[var(--vc-hairline-strong)] bg-[var(--vc-fill)] px-4 py-2.5 text-sm text-[var(--vc-text)] placeholder-[var(--vc-dim)] focus:border-[var(--vc-accent)] focus:outline-none disabled:opacity-50 transition-colors"
            />
            <button
              type="button"
              onClick={sendChat}
              disabled={!chatInput.trim() || chatStreaming}
              className="shrink-0 rounded-[10px] bg-[var(--vc-accent)] px-4 py-2.5 text-sm font-medium text-[var(--vc-text)] hover:brightness-110 disabled:opacity-40 transition-colors"
            >
              {chatStreaming ? "…" : "Ask"}
            </button>
          </div>
        </section>

        {/* Approval Gate Section */}
        <section className="rounded-[14px] border border-[var(--vc-hairline)] bg-[var(--vc-chip)] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Approval Gate</h3>
            <span className={`vc-pill ${approvalBadge[approvalStatus]}`}>
              {approvalLabel[approvalStatus]}
            </span>
          </div>

          {approvalStatus === "OPEN" && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--vc-muted)]">Request a fix from your team. Optionally assign it to someone by email.</p>
              <input
                type="email"
                value={assigneeEmail}
                onChange={(e) => setAssigneeEmail(e.target.value)}
                placeholder="Assignee email (optional)"
                className="w-full rounded-[10px] border border-[var(--vc-hairline)] bg-[var(--vc-inset)] px-4 py-2 text-sm focus:border-[var(--vc-accent)] focus:outline-none"
              />
              <textarea
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Note (e.g. ticket ID, deadline)..."
                rows={2}
                className="w-full rounded-[10px] border border-[var(--vc-hairline)] bg-[var(--vc-inset)] px-4 py-2 text-sm focus:border-[var(--vc-accent)] focus:outline-none resize-none"
              />
              <button
                type="button"
                onClick={handleRequestFix}
                disabled={approvalSaving}
                className="w-full rounded-[10px] border border-[var(--vc-hairline)] py-2.5 text-sm font-semibold text-[var(--vc-medium)] hover:bg-yellow-500/20 disabled:opacity-50 transition-colors"
              >
                {approvalSaving ? "Requesting..." : "Request Fix"}
              </button>
            </div>
          )}

          {approvalStatus === "FIX_REQUESTED" && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--vc-muted)]">Fix has been requested. Approve once the fix is confirmed, or reject if it was not applied correctly.</p>
              <textarea
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Note (optional)..."
                rows={2}
                className="w-full rounded-[10px] border border-[var(--vc-hairline)] bg-[var(--vc-inset)] px-4 py-2 text-sm focus:border-[var(--vc-accent)] focus:outline-none resize-none"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                onClick={handleApprove}
                  disabled={approvalSaving}
                  className="flex-1 rounded-[10px] border border-[var(--vc-hairline)] bg-[var(--vc-accent-wash)] py-2.5 text-sm font-semibold text-[var(--vc-accent-text)] hover:bg-[var(--vc-accent)]/20 disabled:opacity-50 transition-colors"
                >
                  {approvalSaving ? "Saving..." : "Approve Fix"}
                </button>
                <button
                  type="button"
                onClick={handleReject}
                  disabled={approvalSaving}
                  className="flex-1 rounded-[10px] border border-[var(--vc-hairline)] bg-[color-mix(in_srgb,var(--vc-critical)_12%,transparent)] py-2.5 text-sm font-semibold text-[var(--vc-critical)] hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                >
                  {approvalSaving ? "Saving..." : "Reject"}
                </button>
              </div>
            </div>
          )}

          {approvalStatus === "APPROVED" && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--vc-accent-text)]">Fix has been approved.</p>
              <button
                type="button"
                onClick={handleRequestFix}
                disabled={approvalSaving}
                className="w-full rounded-[10px] border border-[var(--vc-hairline)] py-2.5 text-sm font-semibold text-[var(--vc-medium)] hover:bg-yellow-500/20 disabled:opacity-50 transition-colors"
              >
                Request Fix Again
              </button>
            </div>
          )}

          {approvalStatus === "REJECTED" && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--vc-critical)]">Fix was rejected. You can re-request once the issue is addressed.</p>
              <textarea
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Note (e.g. what needs to be done)..."
                rows={2}
                className="w-full rounded-[10px] border border-[var(--vc-hairline)] bg-[var(--vc-inset)] px-4 py-2 text-sm focus:border-[var(--vc-accent)] focus:outline-none resize-none"
              />
              <input
                type="email"
                value={assigneeEmail}
                onChange={(e) => setAssigneeEmail(e.target.value)}
                placeholder="Assignee email (optional)"
                className="w-full rounded-[10px] border border-[var(--vc-hairline)] bg-[var(--vc-inset)] px-4 py-2 text-sm focus:border-[var(--vc-accent)] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleRequestFix}
                disabled={approvalSaving}
                className="w-full rounded-[10px] border border-[var(--vc-hairline)] py-2.5 text-sm font-semibold text-[var(--vc-medium)] hover:bg-yellow-500/20 disabled:opacity-50 transition-colors"
              >
                {approvalSaving ? "Requesting..." : "Re-request Fix"}
              </button>
            </div>
          )}

          {/* Audit Trail */}
          {approvalEvents.length > 0 && (
            <div className="border-t border-[var(--vc-hairline)] pt-4">
              <button
                type="button"
                onClick={() => setShowAuditLog((v) => !v)}
                className="text-xs text-[var(--vc-muted)] hover:text-[var(--vc-text-2)] transition-colors"
              >
                {showAuditLog ? "Hide" : "Show"} audit log ({approvalEvents.length} event{approvalEvents.length !== 1 ? "s" : ""})
              </button>
              {showAuditLog && (
                <ol className="mt-3 space-y-2">
                  {approvalEvents.map((ev) => (
                    <li key={ev.id} className="flex gap-3 text-xs text-[var(--vc-muted)]">
                      <span className="shrink-0 text-[var(--vc-dim)]">{fmtDate(ev.created_at)}</span>
                      <span>
                        <span className="font-semibold text-[var(--vc-text)]">{ev.actor_name || ev.actor_email}</span>
                        {" "}
                        {ev.event_type === "FIX_REQUESTED" && (
                          <>requested fix{ev.assignee_email ? ` → ${ev.assignee_email}` : ""}</>
                        )}
                        {ev.event_type === "APPROVED" && "approved the fix"}
                        {ev.event_type === "REJECTED" && "rejected the fix"}
                        {ev.note && <span className="text-[var(--vc-muted)]"> — {ev.note}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h3 className="text-xl font-bold">Resolution Note</h3>
          <textarea
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Add a note about this resolution (e.g., ticket ID, exception reason)..."
            className="w-full rounded-[14px] border border-[var(--vc-hairline)] bg-[var(--vc-chip)] p-4 text-sm focus:border-[var(--vc-accent)] focus:outline-none"
            rows={4}
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onSetAction("FIXED")}
              disabled={!!actionSaving}
              className="vc-solid flex-1 rounded-[10px] bg-[var(--vc-accent)] px-6 py-3 font-semibold text-white hover:brightness-110"
            >
              {actionSaving === "FIXED" ? "Saving..." : "Mark as Fixed"}
            </button>
            <button
              type="button"
              onClick={() => onSetAction("IGNORED")}
              disabled={!!actionSaving}
              className="flex-1 rounded-[10px] border border-[var(--vc-hairline)] px-6 py-3 font-medium hover:bg-[var(--vc-chip)] disabled:opacity-50"
            >
              {actionSaving === "IGNORED" ? "Saving..." : "Mark as Ignored"}
            </button>
          </div>
        </section>

        {/* Ticket Draft Section */}
        <section className="rounded-[14px] border border-[var(--vc-hairline)] bg-[var(--vc-chip)] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Generate Ticket</h3>
            <div className="flex rounded-[10px] border border-[var(--vc-hairline)] overflow-hidden text-xs font-semibold">
              {(["jira", "github"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => { setTicketFormat(f); setTicket(""); }}
                  className={`px-3 py-1.5 transition-colors ${
                    ticketFormat === f
                      ? "bg-[var(--vc-accent)]/20 text-[var(--vc-accent-text)]"
                      : "text-[var(--vc-muted)] hover:text-[var(--vc-text-2)]"
                  }`}
                >
                  {f === "jira" ? "Jira" : "GitHub"}
                </button>
              ))}
            </div>
          </div>

          <p className="text-sm text-[var(--vc-muted)]">
            Generate a ready-to-paste {ticketFormat === "jira" ? "Jira" : "GitHub"} ticket with title, description, risk, fix steps, CLI, and acceptance criteria.
          </p>

          <button
            type="button"
            onClick={generateTicket}
            disabled={generatingTicket}
            className="w-full rounded-[10px] border border-[var(--vc-hairline)] bg-[var(--vc-accent-wash)] py-2.5 text-sm font-semibold text-[var(--vc-accent-text)] hover:bg-[var(--vc-accent)]/20 disabled:opacity-50 transition-colors"
          >
            {generatingTicket ? "Generating..." : `Generate ${ticketFormat === "jira" ? "Jira" : "GitHub"} Ticket`}
          </button>

          {ticket && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--vc-muted)]">Ready to paste</span>
                <button
                  type="button"
                  onClick={copyTicket}
                  className="rounded-lg border border-[var(--vc-hairline)] px-3 py-1 text-xs font-semibold hover:bg-[var(--vc-chip)] transition-colors"
                >
                  {ticketCopied ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="overflow-auto rounded-[10px] border border-[var(--vc-hairline)] bg-[var(--vc-inset)] p-4 text-xs text-[var(--vc-text-2)] whitespace-pre-wrap max-h-80">
                {ticket}
              </pre>
            </div>
          )}
        </section>

        {/* Create ticket / verify section — coming soon */}
        <section className="rounded-[14px] border border-[var(--vc-hairline-soft)] bg-[var(--vc-raised)] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[var(--vc-muted)]">Create Ticket &amp; Verify</h3>
            <span className="rounded-full border border-[var(--vc-hairline)] bg-[var(--vc-accent-wash)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--vc-accent-text)]">
              Coming Soon
            </span>
          </div>
          <p className="text-sm text-[var(--vc-dim)]">Push findings directly to Jira or GitHub Issues, then trigger a re-scan to confirm the fix — available in an upcoming release.</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 opacity-40 pointer-events-none select-none">
            <button type="button" disabled className="w-full rounded-[10px] border border-blue-500/30 bg-blue-500/10 py-2.5 text-sm font-semibold text-blue-300">
              Create Jira Ticket
            </button>
            <button type="button" disabled className="w-full rounded-[10px] border border-[var(--vc-hairline-strong)] bg-[var(--vc-chip)] py-2.5 text-sm font-semibold text-[var(--vc-text)]">
              Create GitHub Issue
            </button>
          </div>

          <div className="border-t border-[var(--vc-hairline-soft)] pt-3 opacity-40 pointer-events-none select-none">
            <button type="button" disabled className="w-full rounded-[10px] border border-[var(--vc-hairline)] bg-[var(--vc-accent)]/5 py-2.5 text-sm font-semibold text-[var(--vc-accent-text)]">
              Run Scan to Verify Fix
            </button>
          </div>
        </section>

        <section>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--vc-muted)]">Evidence</h3>
          <pre className="overflow-auto rounded-[14px] border border-[var(--vc-hairline)] bg-[var(--vc-inset)] p-4 font-mono text-xs text-[var(--vc-muted)]">
            {JSON.stringify(finding.evidence, null, 2)}
          </pre>
        </section>
      </div>
      </aside>
    </>
  );
}
