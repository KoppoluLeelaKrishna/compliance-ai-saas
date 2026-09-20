"use client";

/**
 * Minimal markdown renderer for streamed AI replies.
 *
 * Deliberately not a full markdown library: it handles the subset Claude emits
 * in chat (headings, bullets, fenced code, inline code, bold) and renders
 * partial input safely, so a half-arrived code fence still displays.
 */
export default function ChatMarkdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const lines = text.split("\n");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodes: any[] = [];
  let i = 0;

  function inlineRender(line: string) {
    const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((p, idx) => {
      if (p.startsWith("`") && p.endsWith("`") && p.length > 2)
        return <code key={idx} className="rounded bg-[var(--vc-inset)] px-1 py-0.5 font-mono text-[11px] text-[var(--vc-accent-text)]">{p.slice(1, -1)}</code>;
      if (p.startsWith("**") && p.endsWith("**") && p.length > 4)
        return <strong key={idx} className="font-semibold text-[var(--vc-text)]">{p.slice(2, -2)}</strong>;
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
        <pre key={i} className="overflow-x-auto rounded-[10px] bg-[var(--vc-inset)] border border-[var(--vc-hairline)] p-3 font-mono text-[11px] text-[var(--vc-accent-text)] my-2 whitespace-pre">
          {lang && <div className="mb-1 text-[9px] uppercase tracking-widest text-[var(--vc-dim)]">{lang}</div>}
          {codeLines.join("\n")}
        </pre>
      );
    } else if (line.startsWith("### ")) {
      nodes.push(<p key={i} className="mt-3 mb-1 text-xs font-bold uppercase tracking-wide text-[var(--vc-text-2)]">{line.slice(4)}</p>);
    } else if (line.startsWith("## ")) {
      nodes.push(<p key={i} className="mt-3 mb-1 text-sm font-bold text-[var(--vc-text)]">{line.slice(3)}</p>);
    } else if (line.startsWith("# ")) {
      nodes.push(<p key={i} className="mt-3 mb-1 text-base font-bold text-[var(--vc-text)]">{line.slice(2)}</p>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      nodes.push(<p key={i} className="flex gap-1.5 text-sm text-[var(--vc-text)]"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--vc-accent-text)]" /><span>{inlineRender(line.slice(2))}</span></p>);
    } else if (line.trim() === "") {
      nodes.push(<div key={i} className="h-1.5" />);
    } else {
      nodes.push(<p key={i} className="text-sm leading-relaxed text-[var(--vc-text)]">{inlineRender(line)}</p>);
    }
    i++;
  }

  return (
    <div className="space-y-0.5">
      {nodes}
      {streaming && <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-[var(--vc-accent-text)] align-middle" />}
    </div>
  );
}
