"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { API_BASE, api } from "@/lib/api";
import ChatMarkdown from "@/components/chat/ChatMarkdown";

type Role = "user" | "assistant";
type Msg = { role: Role; content: string; tools?: string[]; error?: boolean };

/** Backend event frames on /assistant/chat (newline-delimited JSON). */
type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "error"; message: string }
  | { type: "done" };

const TOOL_LABELS: Record<string, string> = {
  get_posture_overview: "Reading your posture overview",
  list_aws_accounts: "Listing connected accounts",
  list_scans: "Looking up recent scans",
  search_findings: "Searching findings",
  get_finding_details: "Pulling finding evidence",
  get_remediation_guidance: "Fetching remediation guidance",
  get_compliance_mapping: "Mapping compliance controls",
  get_subscription_and_limits: "Checking your plan",
};

const SUGGESTIONS = [
  "What should I fix first?",
  "Summarise my posture across all accounts",
  "Which SOC 2 controls am I failing?",
  "Explain my critical findings",
];

function SparkIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  );
}

export default function AssistantWidget() {
  const pathname = usePathname();

  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await api<{ enabled: boolean }>("/assistant/config");
        if (!cancelled) setEnabled(cfg.enabled);
      } catch {
        // Signed out, or no ANTHROPIC_API_KEY — the launcher stays hidden.
        if (!cancelled) setEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTool]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // A request outliving its panel would keep writing into state nobody reads.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || streaming) return;

      const history = messages
        .filter(m => !m.error)
        .map(m => ({ role: m.role, content: m.content }));

      setInput("");
      setMessages(prev => [...prev, { role: "user", content: question }]);
      setStreaming(true);
      setActiveTool(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`${API_BASE}/assistant/chat`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: question, history, page: pathname }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          let detail = `Request failed: ${res.status}`;
          try {
            detail = (await res.json())?.detail || detail;
          } catch {}
          setMessages(prev => [...prev, { role: "assistant", content: detail, error: true }]);
          return;
        }

        setMessages(prev => [...prev, { role: "assistant", content: "", tools: [] }]);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const apply = (evt: StreamEvent) => {
          if (evt.type === "tool") setActiveTool(evt.name);
          setMessages(prev => {
            const next = [...prev];
            const last = { ...next[next.length - 1] };
            if (evt.type === "text") last.content += evt.text;
            else if (evt.type === "tool") last.tools = [...(last.tools || []), evt.name];
            else if (evt.type === "error") {
              // A mid-reply error is appended so the partial answer survives;
              // an error before any text becomes the message itself.
              last.error = !last.content;
              last.content = last.content ? `${last.content}\n\n_${evt.message}_` : evt.message;
            }
            next[next.length - 1] = last;
            return next;
          });
        };

        // NDJSON: frames can split across chunks, so only whole lines are
        // parsed and the trailing partial stays buffered for the next read.
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              apply(JSON.parse(line) as StreamEvent);
            } catch {
              // Skip a malformed frame rather than dropping the whole reply.
            }
          }
        }
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        setMessages(prev => [
          ...prev,
          { role: "assistant", content: e instanceof Error ? e.message : String(e), error: true },
        ]);
      } finally {
        abortRef.current = null;
        setStreaming(false);
        setActiveTool(null);
      }
    },
    [messages, pathname, streaming],
  );

  if (!enabled) return null;

  if (!open) {
    return (
      <button
        type="button"
        className="vc-assist-launcher"
        aria-label="Open the VigiliCloud assistant"
        onClick={() => setOpen(true)}
      >
        <SparkIcon />
      </button>
    );
  }

  return (
    <aside className="vc-assist-panel" role="dialog" aria-label="VigiliCloud assistant">
      <header className="vc-assist-head">
        <span className="vc-assist-mark">
          <SparkIcon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="vc-card-title">Assistant</p>
          <p className="vc-card-sub truncate">Answers from your accounts, scans and findings</p>
        </div>
        {messages.length > 0 && !streaming && (
          <button type="button" className="vc-assist-close" onClick={() => setMessages([])}>
            Clear
          </button>
        )}
        <button
          type="button"
          className="vc-assist-close"
          aria-label="Close the assistant"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </header>

      <div className="vc-assist-body">
        {messages.length === 0 && (
          <div>
            <p className="vc-assist-intro">
              Ask about your compliance posture. I read your connected accounts, scans, findings,
              remediation guidance and framework mappings — I can&apos;t change anything.
            </p>
            <div className="vc-assist-suggests">
              {SUGGESTIONS.map(s => (
                <button key={s} type="button" className="vc-assist-suggest" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`vc-assist-row${msg.role === "user" ? " vc-assist-row-me" : ""}`}>
            {msg.role === "assistant" && <span className="vc-assist-avatar">AI</span>}
            <div
              className={
                msg.role === "user"
                  ? "vc-assist-bubble vc-assist-bubble-me"
                  : `vc-assist-bubble${msg.error ? " vc-assist-bubble-err" : ""}`
              }
            >
              {msg.role === "user" ? (
                msg.content
              ) : (
                <>
                  {(msg.tools?.length ?? 0) > 0 && (
                    <div className="vc-assist-tools">
                      {[...new Set(msg.tools)].map(t => (
                        <span key={t} className="vc-assist-tool">
                          {TOOL_LABELS[t] || t}
                        </span>
                      ))}
                    </div>
                  )}
                  <ChatMarkdown text={msg.content} streaming={streaming && i === messages.length - 1} />
                </>
              )}
            </div>
            {msg.role === "user" && <span className="vc-assist-avatar vc-assist-avatar-me">You</span>}
          </div>
        ))}

        {activeTool && <p className="vc-assist-status">{TOOL_LABELS[activeTool] || activeTool}…</p>}
        <div ref={bottomRef} />
      </div>

      <div className="vc-assist-foot">
        <input
          ref={inputRef}
          type="text"
          className="vc-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask about your posture, findings, fixes…"
          disabled={streaming}
        />
        {streaming ? (
          <button type="button" className="vc-btn" onClick={() => abortRef.current?.abort()}>
            Stop
          </button>
        ) : (
          <button type="button" className="vc-btn-primary" onClick={() => send(input)} disabled={!input.trim()}>
            Ask
          </button>
        )}
      </div>
    </aside>
  );
}
