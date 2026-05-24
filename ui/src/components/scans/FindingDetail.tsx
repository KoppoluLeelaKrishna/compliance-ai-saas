"use client";

import { useState } from "react";
import { ApprovalEvent, ApprovalStatus, Finding, FixGuidance } from "@/types";
import { api, badgeClasses, fmtDate } from "@/lib/api";

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
