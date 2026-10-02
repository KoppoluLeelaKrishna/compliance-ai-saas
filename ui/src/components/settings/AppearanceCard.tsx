"use client";

import { useSyncExternalStore } from "react";
import { ThemePref, getThemePref, setThemePref } from "@/lib/theme";

/** Miniature app window drawn in a fixed palette, so each option previews itself. */
function Preview({ tone }: { tone: "dark" | "light" }) {
  const c = tone === "dark"
    ? { canvas: "#000000", side: "#0a0a0b", raised: "#1c1c1e", line: "rgba(255,255,255,0.10)", bar: "#3a3a3c" }
    : { canvas: "#f5f5f7", side: "#ffffff", raised: "#ffffff", line: "#e5e5e7", bar: "#d1d1d6" };
  return (
    <div className="flex h-full w-full" style={{ background: c.canvas }}>
      <div className="flex w-[30%] flex-col gap-1.5 p-2" style={{ background: c.side, borderRight: `1px solid ${c.line}` }}>
        <span className="h-1.5 w-3/4 rounded-full" style={{ background: "#0066cc" }} />
        <span className="h-1.5 w-2/3 rounded-full" style={{ background: c.bar }} />
        <span className="h-1.5 w-1/2 rounded-full" style={{ background: c.bar }} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <div className="flex-1 rounded-[5px] p-1.5" style={{ background: c.raised, border: `1px solid ${c.line}` }}>
          <span className="block h-1.5 w-1/2 rounded-full" style={{ background: c.bar }} />
        </div>
        <div className="flex-1 rounded-[5px]" style={{ background: c.raised, border: `1px solid ${c.line}` }} />
      </div>
    </div>
  );
}

const OPTIONS: { value: ThemePref; label: string; hint: string }[] = [
  { value: "dark",   label: "Dark",   hint: "The default" },
  { value: "light",  label: "Light",  hint: "Bright surfaces" },
  { value: "system", label: "System", hint: "Match your device" },
];

/** Tracks the stored preference; another tab changing it fires "storage". */
function subscribe(onChange: () => void) {
  window.addEventListener("vc-theme-change", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("vc-theme-change", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export default function AppearanceCard() {
  // null on the server: localStorage only exists in the browser.
  const pref = useSyncExternalStore<ThemePref | null>(subscribe, getThemePref, () => null);

  function choose(value: ThemePref) {
    setThemePref(value);
  }

  return (
    <section className="vc-elevate rounded-[18px] border border-[var(--vc-hairline)] bg-[var(--vc-raised)] p-6">
      <div className="mb-1 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[var(--vc-hairline)] bg-[var(--vc-fill)]">
          <svg className="h-4 w-4 text-[var(--vc-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1.5m0 15V21m9-9h-1.5M4.5 12H3m15.364 6.364l-1.06-1.06M6.697 6.697l-1.06-1.06m12.727 0l-1.06 1.06M6.697 17.303l-1.06 1.06M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold">Appearance</h2>
      </div>
      <p className="mb-5 ml-11 text-[12.5px] text-[var(--vc-muted)]">
        Choose how VigiliCloud looks in this browser.
      </p>

      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
        {OPTIONS.map(({ value, label, hint }) => {
          const on = pref === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(value)}
              className={`group rounded-[14px] border p-2 text-left transition-colors ${
                on
                  ? "border-[var(--vc-accent)] bg-[var(--vc-accent-wash)]"
                  : "border-[var(--vc-hairline-strong)] hover:border-[var(--vc-muted)]"
              }`}
            >
              <div className="aspect-[16/10] overflow-hidden rounded-[9px] border border-[var(--vc-hairline)]">
                {value === "system" ? (
                  <div className="relative h-full w-full">
                    <Preview tone="light" />
                    <div className="absolute inset-0" style={{ clipPath: "polygon(0 0, 50% 0, 50% 100%, 0 100%)" }}>
                      <Preview tone="dark" />
                    </div>
                  </div>
                ) : (
                  <Preview tone={value} />
                )}
              </div>
              <div className="mt-2.5 flex items-center gap-2 px-1">
                <span
                  className={`flex h-4 w-4 flex-none items-center justify-center rounded-full border ${
                    on ? "border-[var(--vc-accent)] bg-[var(--vc-accent)]" : "border-[var(--vc-hairline-strong)]"
                  }`}
                  aria-hidden
                >
                  {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                <span className="text-[13px] font-semibold text-[var(--vc-text)]">{label}</span>
              </div>
              <div className="mt-0.5 px-1 pl-7 text-[11.5px] text-[var(--vc-dim)]">{hint}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
