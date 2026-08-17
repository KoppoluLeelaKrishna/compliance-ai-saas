"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Corner welcome panel for the marketing page.
 *
 * Deliberately not dressed up as a live human chat: there is nobody staffing an
 * inbox in real time, so every route here goes somewhere that genuinely works —
 * an anchor on the page, or an email that actually sends. Claiming otherwise
 * would mislead visitors at the exact moment they decide to trust the product.
 */

const CONTACT_EMAIL = "leelakrishna1739@gmail.com";

const ROUTES = [
  { label: "Book a demo", hint: "20 minutes, on your own AWS account", href: "#demo" },
  { label: "Which plan fits me?", hint: "Starter, Pro and MSP compared", href: "#pricing" },
  { label: "See the 10 checks", hint: "Every surface we scan", href: "#features" },
];

export default function WelcomeWidget() {
  const [open, setOpen] = useState(false);
  const [nudged, setNudged] = useState(false);
  const [message, setMessage] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Open itself once, a few seconds in — the way the reference does.
  useEffect(() => {
    if (nudged) return;
    const t = setTimeout(() => {
      setOpen(true);
      setNudged(true);
    }, 6000);
    return () => clearTimeout(t);
  }, [nudged]);

  // Escape closes; so does a click outside the panel.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = encodeURIComponent(message);
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("VigiliCloud enquiry")}&body=${body}`;
    setMessage("");
  }

  return (
    <div className="vc-welcome" ref={panelRef}>
      {open && (
        <div className="vc-welcome-panel" role="dialog" aria-label="Welcome to VigiliCloud">
          <button type="button" className="vc-welcome-close" onClick={() => setOpen(false)} aria-label="Close">
            ✕
          </button>

          <h3 className="vc-welcome-title">
            Welcome to VigiliCloud <span aria-hidden="true">👋</span>
          </h3>
          <p className="vc-welcome-copy">
            VigiliCloud scans your AWS account for the misconfigurations attackers look for —
            ten checks, about two minutes, with the exact fix for every finding and evidence
            you can hand an auditor.
          </p>

          <div className="vc-welcome-sub">How can we help you today?</div>

          <div className="vc-welcome-routes">
            {ROUTES.map((r) => (
              <a key={r.href} href={r.href} className="vc-welcome-route" onClick={() => setOpen(false)}>
                <span className="vc-welcome-route-label">{r.label}</span>
                <span className="vc-welcome-route-hint">{r.hint}</span>
              </a>
            ))}
          </div>

          <form className="vc-welcome-form" onSubmit={send}>
            <label className="vc-welcome-sub" htmlFor="vc-welcome-msg">
              Or send us a question
            </label>
            <div className="vc-welcome-inputrow">
              <input
                id="vc-welcome-msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ask anything about the product"
                required
              />
              <button type="submit" aria-label="Send">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>
              </button>
            </div>
            <p className="vc-welcome-fine">
              Opens your email app — we reply within 24 hours. No live agent is standing by.
            </p>
          </form>
        </div>
      )}

      <button
        type="button"
        className="vc-welcome-launcher"
        onClick={() => {
          setOpen((o) => !o);
          setNudged(true);
        }}
        aria-expanded={open}
        aria-label={open ? "Close welcome panel" : "Open welcome panel"}
      >
        {open ? "✕" : "V"}
      </button>
    </div>
  );
}
