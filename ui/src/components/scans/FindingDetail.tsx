"use client";

import { useState, useRef } from "react";
import { ApprovalEvent, ApprovalStatus, Finding, FixGuidance } from "@/types";
import { API_BASE, api, badgeClasses, fmtDate } from "@/lib/api";

function ChatMarkdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  function inlineRender(line: string): React.ReactNode {
    const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((p, idx) => {
      if (p.startsWith("`") && p.endsWith("`") && p.length > 2)
        return <code key={idx} className="rounded bg-black/50 px-1 py-0.5 font-mono text-[11px] text-emerald-300">{p.slice(1, -1)}</code>;
      if (p.startsWith("**") && p.endsWith("**") && p.length > 4)
        return <strong key={idx} className="font-semibold text-white">{p.slice(2, -2)}</strong>;
      return p;
    });
  }

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <pre key={i} className="overflow-x-auto rounded-xl bg-black/60 border border-white/[0.07] p-3 font-mono text-[11px] text-emerald-300 my-2 whitespace-pre">
          {lang && <div className="mb-1 text-[9px] uppercase tracking-widest text-neutral-600">{lang}</div>}
          {codeLines.join("\n")}
        </pre>
      );
    } else if (line.startsWith("### ")) {
      nodes.push(<p key={i} className="mt-3 mb-1 text-xs font-bold uppercase tracking-wide text-neutral-300">{line.slice(4)}</p>);
    } else if (line.startsWith("## ")) {
      nodes.push(<p key={i} className="mt-3 mb-1 text-sm font-bold text-white">{line.slice(3)}</p>);
    } else if (line.startsWith("# ")) {
      nodes.push(<p key={i} className="mt-3 mb-1 text-base font-bold text-white">{line.slice(2)}</p>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      nodes.push(<p key={i} className="flex gap-1.5 text-sm text-neutral-200"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400" /><span>{inlineRender(line.slice(2))}</span></p>);
    } else if (line.trim() === "") {
      nodes.push(<div key={i} className="h-1.5" />);
    } else {
      nodes.push(<p key={i} className="text-sm leading-relaxed text-neutral-200">{inlineRender(line)}</p>);
    }
    i++;
  }

  return (
    <div className="space-y-0.5">
      {nodes}
      {streaming && <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-violet-400 align-middle" />}
    </div>
  );
}

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
  OPEN: "border-neutral-700 bg-neutral-800/50 text-neutral-400",
  FIX_REQUESTED: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  APPROVED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  REJECTED: "border-red-500/40 bg-red-500/10 text-red-300",
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
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl border-l border-white/10 bg-black p-8 shadow-2xl md:w-2/3 lg:w-1/2 overflow-y-auto">
      <div className="mb-8 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Finding Detail</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/10 p-2 hover:bg-white/5"
        >
          ✕
        </button>
      </div>

      <div className="space-y-8">
        <section>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${badgeClasses(finding.severity)}`}>
              {finding.severity}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${badgeClasses(finding.resolution || "OPEN")}`}>
              {finding.resolution || "OPEN"}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${approvalBadge[approvalStatus]}`}>
              {approvalLabel[approvalStatus]}
            </span>
            <span className="text-sm text-neutral-500">{finding.service}</span>
          </div>
          <h1 className="text-3xl font-bold leading-tight">{finding.title}</h1>
          <p className="mt-2 text-sm text-neutral-400">ID: {finding.check_id}</p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">Resource</h3>
          <div className="font-mono text-emerald-400 break-all">{finding.resource_id}</div>
          <div className="mt-4 text-xs text-neutral-500">Detected at: {fmtDate(finding.created_at)}</div>
        </section>

        <section>
          <h3 className="mb-4 text-xl font-bold">Fix Guidance</h3>
          {loadingGuidance ? (
            <div className="animate-pulse space-y-3">
              <div className="h-4 w-3/4 rounded bg-white/5" />
              <div className="h-4 w-1/2 rounded bg-white/5" />
              <div className="h-20 w-full rounded bg-white/5" />
            </div>
          ) : fixGuidance ? (
            <div className="space-y-6">
              <p className="text-neutral-300">{fixGuidance.summary}</p>
              <div>
                <h4 className="mb-2 font-semibold">Console Steps</h4>
                <ul className="list-inside list-disc space-y-2 text-sm text-neutral-400">
                  {fixGuidance.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ul>
              </div>
              {fixGuidance.cli && fixGuidance.cli.length > 0 && (
                <div>
                  <h4 className="mb-2 font-semibold">CLI Remediation</h4>
                  <pre className="overflow-auto rounded-xl bg-neutral-900 p-4 font-mono text-xs text-emerald-400">
                    {fixGuidance.cli.join("\n")}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <p className="text-neutral-500 italic">No remediation guidance available for this check yet.</p>
          )}
        </section>

        {/* AI Chat — placed early so it's visible without heavy scrolling */}
        <section className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10">
              <svg className="h-3.5 w-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-violet-200">Ask AI about this finding</h3>
          </div>
          <p className="text-xs text-neutral-500">Powered by Claude Haiku · grounded in this finding&apos;s evidence</p>

          {chatMessages.length > 0 && (
            <div className="max-h-80 overflow-y-auto space-y-3 rounded-xl border border-white/[0.06] bg-black/30 p-4">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10 text-[10px] font-bold text-violet-400">AI</div>
                  )}
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                    msg.role === "user"
                      ? "bg-white/10 text-white text-sm"
                      : "bg-violet-500/10"
                  }`}>
                    {msg.role === "user"
                      ? msg.content
                      : <ChatMarkdown text={msg.content} streaming={chatStreaming && i === chatMessages.length - 1} />
                    }
                  </div>
                  {msg.role === "user" && (
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] font-bold text-neutral-400">You</div>
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
              className="flex-1 rounded-xl border border-white/[0.07] bg-black/40 px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-violet-500/40 focus:outline-none disabled:opacity-50 transition-colors"
            />
            <button
              type="button"
              onClick={sendChat}
              disabled={!chatInput.trim() || chatStreaming}
              className="shrink-0 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
            >
              {chatStreaming ? "…" : "Ask"}
            </button>
          </div>
        </section>

        {/* Approval Gate Section */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Approval Gate</h3>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${approvalBadge[approvalStatus]}`}>
              {approvalLabel[approvalStatus]}
            </span>
          </div>

          {approvalStatus === "OPEN" && (
            <div className="space-y-3">
              <p className="text-sm text-neutral-400">Request a fix from your team. Optionally assign it to someone by email.</p>
              <input
                type="email"
                value={assigneeEmail}
                onChange={(e) => setAssigneeEmail(e.target.value)}
                placeholder="Assignee email (optional)"
                className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-2 text-sm focus:border-emerald-500/50 focus:outline-none"
              />
              <textarea
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Note (e.g. ticket ID, deadline)..."
                rows={2}
                className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-2 text-sm focus:border-emerald-500/50 focus:outline-none resize-none"
              />
              <button
                type="button"
                onClick={handleRequestFix}
                disabled={approvalSaving}
                className="w-full rounded-xl border border-yellow-500/30 bg-yellow-500/10 py-2.5 text-sm font-semibold text-yellow-300 hover:bg-yellow-500/20 disabled:opacity-50 transition-colors"
              >
                {approvalSaving ? "Requesting..." : "Request Fix"}
              </button>
            </div>
          )}

          {approvalStatus === "FIX_REQUESTED" && (
            <div className="space-y-3">
              <p className="text-sm text-neutral-400">Fix has been requested. Approve once the fix is confirmed, or reject if it was not applied correctly.</p>
              <textarea
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Note (optional)..."
                rows={2}
                className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-2 text-sm focus:border-emerald-500/50 focus:outline-none resize-none"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                onClick={handleApprove}
                  disabled={approvalSaving}
                  className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                >
                  {approvalSaving ? "Saving..." : "Approve Fix"}
                </button>
                <button
                  type="button"
                onClick={handleReject}
                  disabled={approvalSaving}
                  className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                >
                  {approvalSaving ? "Saving..." : "Reject"}
                </button>
              </div>
            </div>
          )}

          {approvalStatus === "APPROVED" && (
            <div className="space-y-3">
              <p className="text-sm text-emerald-400">Fix has been approved.</p>
              <button
                type="button"
                onClick={handleRequestFix}
                disabled={approvalSaving}
                className="w-full rounded-xl border border-yellow-500/30 bg-yellow-500/10 py-2.5 text-sm font-semibold text-yellow-300 hover:bg-yellow-500/20 disabled:opacity-50 transition-colors"
              >
                Request Fix Again
              </button>
            </div>
          )}

          {approvalStatus === "REJECTED" && (
            <div className="space-y-3">
              <p className="text-sm text-red-400">Fix was rejected. You can re-request once the issue is addressed.</p>
              <textarea
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Note (e.g. what needs to be done)..."
                rows={2}
                className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-2 text-sm focus:border-emerald-500/50 focus:outline-none resize-none"
              />
              <input
                type="email"
                value={assigneeEmail}
                onChange={(e) => setAssigneeEmail(e.target.value)}
                placeholder="Assignee email (optional)"
                className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-2 text-sm focus:border-emerald-500/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleRequestFix}
                disabled={approvalSaving}
                className="w-full rounded-xl border border-yellow-500/30 bg-yellow-500/10 py-2.5 text-sm font-semibold text-yellow-300 hover:bg-yellow-500/20 disabled:opacity-50 transition-colors"
              >
                {approvalSaving ? "Requesting..." : "Re-request Fix"}
              </button>
            </div>
          )}

          {/* Audit Trail */}
          {approvalEvents.length > 0 && (
            <div className="border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setShowAuditLog((v) => !v)}
                className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                {showAuditLog ? "Hide" : "Show"} audit log ({approvalEvents.length} event{approvalEvents.length !== 1 ? "s" : ""})
              </button>
              {showAuditLog && (
                <ol className="mt-3 space-y-2">
                  {approvalEvents.map((ev) => (
                    <li key={ev.id} className="flex gap-3 text-xs text-neutral-400">
                      <span className="shrink-0 text-neutral-600">{fmtDate(ev.created_at)}</span>
                      <span>
                        <span className="font-semibold text-neutral-200">{ev.actor_name || ev.actor_email}</span>
                        {" "}
                        {ev.event_type === "FIX_REQUESTED" && (
                          <>requested fix{ev.assignee_email ? ` → ${ev.assignee_email}` : ""}</>
                        )}
                        {ev.event_type === "APPROVED" && "approved the fix"}
                        {ev.event_type === "REJECTED" && "rejected the fix"}
                        {ev.note && <span className="text-neutral-500"> — {ev.note}</span>}
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
            className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            rows={4}
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onSetAction("FIXED")}
              disabled={!!actionSaving}
              className="flex-1 rounded-xl bg-white px-6 py-3 font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
            >
              {actionSaving === "FIXED" ? "Saving..." : "Mark as Fixed"}
            </button>
            <button
              type="button"
              onClick={() => onSetAction("IGNORED")}
              disabled={!!actionSaving}
              className="flex-1 rounded-xl border border-white/10 px-6 py-3 font-medium hover:bg-white/5 disabled:opacity-50"
            >
              {actionSaving === "IGNORED" ? "Saving..." : "Mark as Ignored"}
            </button>
          </div>
        </section>

        {/* Ticket Draft Section */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Generate Ticket</h3>
            <div className="flex rounded-xl border border-white/10 overflow-hidden text-xs font-semibold">
              {(["jira", "github"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => { setTicketFormat(f); setTicket(""); }}
                  className={`px-3 py-1.5 transition-colors ${
                    ticketFormat === f
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {f === "jira" ? "Jira" : "GitHub"}
                </button>
              ))}
            </div>
          </div>

          <p className="text-sm text-neutral-400">
            Generate a ready-to-paste {ticketFormat === "jira" ? "Jira" : "GitHub"} ticket with title, description, risk, fix steps, CLI, and acceptance criteria.
          </p>

          <button
            type="button"
            onClick={generateTicket}
            disabled={generatingTicket}
            className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
          >
            {generatingTicket ? "Generating..." : `Generate ${ticketFormat === "jira" ? "Jira" : "GitHub"} Ticket`}
          </button>

          {ticket && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">Ready to paste</span>
                <button
                  type="button"
                  onClick={copyTicket}
                  className="rounded-lg border border-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/5 transition-colors"
                >
                  {ticketCopied ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="overflow-auto rounded-xl border border-white/10 bg-black p-4 text-xs text-neutral-300 whitespace-pre-wrap max-h-80">
                {ticket}
              </pre>
            </div>
          )}
        </section>

        {/* Create ticket / verify section */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
          <h3 className="text-lg font-bold">Create Ticket &amp; Verify</h3>
          <p className="text-sm text-neutral-400">Push this finding directly to Jira or GitHub, then trigger a re-scan to confirm the fix.</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Jira */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={createJiraTicket}
                disabled={creatingJira}
                className="w-full rounded-xl border border-blue-500/30 bg-blue-500/10 py-2.5 text-sm font-semibold text-blue-300 hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
              >
                {creatingJira ? "Creating…" : "Create Jira Ticket"}
              </button>
              {jiraResult && (
                jiraResult.issue_url.startsWith("Error") ? (
                  <p className="text-xs text-red-400">{jiraResult.issue_url}</p>
                ) : (
                  <p className="text-xs text-blue-300">
                    Created <a href={jiraResult.issue_url} target="_blank" rel="noopener noreferrer" className="underline font-mono">{jiraResult.issue_key}</a>
                  </p>
                )
              )}
            </div>

            {/* GitHub */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={createGitHubIssue}
                disabled={creatingGitHub}
                className="w-full rounded-xl border border-white/20 bg-white/5 py-2.5 text-sm font-semibold text-neutral-200 hover:bg-white/10 disabled:opacity-50 transition-colors"
              >
                {creatingGitHub ? "Creating…" : "Create GitHub Issue"}
              </button>
              {githubResult && (
                githubResult.issue_url.startsWith("Error") ? (
                  <p className="text-xs text-red-400">{githubResult.issue_url}</p>
                ) : (
                  <p className="text-xs text-neutral-300">
                    Created <a href={githubResult.issue_url} target="_blank" rel="noopener noreferrer" className="underline font-mono">#{githubResult.issue_number}</a>
                  </p>
                )
              )}
            </div>
          </div>

          {/* Verify fix */}
          <div className="border-t border-white/10 pt-3 space-y-2">
            <button
              type="button"
              onClick={verifyFix}
              disabled={verifyingFix}
              className="w-full rounded-xl border border-emerald-500/20 bg-emerald-500/5 py-2.5 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
            >
              {verifyingFix ? "Starting scan…" : "Run Scan to Verify Fix"}
            </button>
            {verifyMsg && (
              <p className={`text-xs ${verifyMsg.startsWith("Error") ? "text-red-400" : "text-emerald-300"}`}>{verifyMsg}</p>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500">Evidence</h3>
          <pre className="overflow-auto rounded-2xl border border-white/10 bg-black p-4 font-mono text-xs text-neutral-400">
            {JSON.stringify(finding.evidence, null, 2)}
          </pre>
        </section>
      </div>
    </div>
  );
}
