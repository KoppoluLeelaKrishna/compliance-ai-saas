"use client";

import { FormEvent, useState } from "react";
import { api } from "@/lib/api";

type AgentType = "frontend" | "backend" | "database";

interface Message {
  role: "user" | "agent";
  text: string;
}

const AGENTS: { id: AgentType; label: string; color: string; icon: string; description: string }[] = [
  {
    id: "frontend",
    label: "AI_Frontend",
    color: "blue",
    icon: "◈",
    description: "Next.js, React, TypeScript, Tailwind, UI design, components",
  },
  {
    id: "backend",
    label: "AI_Backend",
    color: "emerald",
    icon: "◉",
    description: "FastAPI, Python, auth, security, Stripe, boto3 AWS",
  },
  {
    id: "database",
    label: "AI_Database",
    color: "amber",
    icon: "◎",
    description: "SQLite, PostgreSQL, schema design, queries, migrations",
  },
];

const COLOR_MAP = {
  blue: {
    tab: "border-blue-500/40 bg-blue-500/10 text-blue-300",
    tabActive: "border-blue-400 bg-blue-500/20 text-blue-200",
    icon: "text-blue-400",
    bubble: "border-blue-500/20 bg-blue-500/10 text-blue-100",
    badge: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  },
  emerald: {
    tab: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    tabActive: "border-emerald-400 bg-emerald-500/20 text-emerald-200",
    icon: "text-emerald-400",
    bubble: "border-emerald-500/20 bg-emerald-500/10 text-emerald-100",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  amber: {
    tab: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    tabActive: "border-amber-400 bg-amber-500/20 text-amber-200",
    icon: "text-amber-400",
    bubble: "border-amber-500/20 bg-amber-500/10 text-amber-100",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
};

export default function AgentsPage() {
  const [activeAgent, setActiveAgent] = useState<AgentType>("frontend");
  const [chats, setChats] = useState<Record<AgentType, Message[]>>({
    frontend: [],
    backend: [],
    database: [],
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const agent = AGENTS.find((a) => a.id === activeAgent)!;
  const colors = COLOR_MAP[agent.color as keyof typeof COLOR_MAP];
  const messages = chats[activeAgent];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setError("");
    setChats((prev) => ({
      ...prev,
      [activeAgent]: [...prev[activeAgent], { role: "user", text: question }],
    }));
    setLoading(true);

    try {
      const data = await api<{ answer: string }>("/agents/query", {
        method: "POST",
        body: JSON.stringify({ agent: activeAgent, question }),
      });
      setChats((prev) => ({
        ...prev,
        [activeAgent]: [...prev[activeAgent], { role: "agent", text: data.answer }],
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setChats((prev) => ({
        ...prev,
        [activeAgent]: prev[activeAgent].slice(0, -1),
      }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="pb-20">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">AI Agents</h1>
        <p className="mt-1 text-neutral-400 text-sm">
          Three specialized agents that know the VigiliCloud codebase. Ask them anything about their domain.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {AGENTS.map((a) => {
          const c = COLOR_MAP[a.color as keyof typeof COLOR_MAP];
          const isActive = activeAgent === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => { setActiveAgent(a.id); setError(""); }}
              className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                isActive ? c.tabActive : c.tab + " hover:opacity-80"
              }`}
            >
              <span className={isActive ? c.icon : ""}>{a.icon}</span>
              {a.label}
              {chats[a.id].length > 0 && (
                <span className="ml-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-neutral-300">
                  {chats[a.id].filter((m) => m.role === "user").length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
        <div className={`flex items-center justify-between border-b border-white/10 px-5 py-3`}>
          <div className="flex items-center gap-2">
            <span className={`text-lg ${colors.icon}`}>{agent.icon}</span>
            <div>
              <div className="font-bold text-sm">{agent.label}</div>
              <div className="text-[11px] text-neutral-500">{agent.description}</div>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setChats((prev) => ({ ...prev, [activeAgent]: [] }))}
              className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        <div className="min-h-[360px] max-h-[520px] overflow-y-auto p-5 space-y-4">
          {messages.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
              <span className={`text-4xl ${colors.icon}`}>{agent.icon}</span>
              <div>
                <div className="font-semibold text-neutral-300">{agent.label} is ready</div>
                <div className="mt-1 text-sm text-neutral-600 max-w-sm">
                  Ask anything about {agent.description.toLowerCase()}.
                </div>
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {getExamples(agent.id).map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setInput(ex)}
                    className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-neutral-400 hover:bg-white/5 hover:text-white transition-colors text-left"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "agent" && (
                  <span className={`mr-2 mt-1 text-sm flex-shrink-0 ${colors.icon}`}>{agent.icon}</span>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-white/10 text-white"
                      : `border ${colors.bubble}`
                  }`}
                >
                  <pre className="whitespace-pre-wrap font-sans">{msg.text}</pre>
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex justify-start">
              <span className={`mr-2 mt-1 text-sm ${colors.icon}`}>{agent.icon}</span>
              <div className={`rounded-2xl border px-4 py-3 text-sm ${colors.bubble}`}>
                <span className="animate-pulse">Thinking...</span>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/10 p-4">
          {error && (
            <div className="mb-3 rounded-xl border border-red-800/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask ${agent.label} anything...`}
              disabled={loading}
              className="flex-1 rounded-2xl border border-white/10 bg-black/60 px-4 py-2.5 text-sm outline-none placeholder:text-neutral-600 focus:border-white/20 disabled:opacity-50 transition-colors"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className={`rounded-2xl border px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 ${colors.badge} hover:opacity-80`}
            >
              Ask
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function getExamples(agent: AgentType): string[] {
  if (agent === "frontend") return [
    "How do I add a new page to the app?",
    "What Tailwind classes should I use for a warning card?",
    "How do I fetch data from the API in a component?",
  ];
  if (agent === "backend") return [
    "How do I add a new protected endpoint?",
    "How does the session auth work?",
    "How do I add a new compliance check?",
  ];
  return [
    "How do I add a new column to the users table?",
    "How do I write a safe query for production?",
    "What's the schema for scans and findings?",
  ];
}
