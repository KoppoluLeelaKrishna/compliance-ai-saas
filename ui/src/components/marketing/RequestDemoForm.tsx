"use client";

import { useId, useState } from "react";

/**
 * Lead-capture card for the marketing page.
 *
 * There is no leads endpoint on the API, so rather than collect details and
 * drop them, submitting hands everything to the real Calendly booking page:
 * name and email use Calendly's native prefill, and the qualifying answers go
 * into its first custom question. Nothing the visitor types is discarded.
 */

const CALENDLY = "https://calendly.com/leelakrishnakoppolu/vigilicloud-demo";

const HEADCOUNT = ["1–10", "11–50", "51–200", "201–1,000", "1,000+"];

const COUNTRIES = [
  "India", "United States", "United Kingdom", "Canada", "Australia",
  "Germany", "Singapore", "United Arab Emirates", "Other",
];

const INTERESTS = [
  "AWS posture scanning",
  "Remediation workflow",
  "SOC 2 / ISO evidence",
  "Multi-client (MSP)",
  "Questionnaire autofill",
  "Continuous monitoring",
];

const SOURCES = ["Search", "LinkedIn", "Referral", "AWS Marketplace", "Conference", "Other"];

export default function RequestDemoForm({ compact = false }: { compact?: boolean }) {
  const uid = useId();
  const [sent, setSent] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);

  function toggle(value: string) {
    setInterests((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const first = String(f.get("first") ?? "");
    const last = String(f.get("last") ?? "");

    const notes = [
      `Company: ${f.get("company")}`,
      `Job title: ${f.get("title")}`,
      `Headcount: ${f.get("headcount")}`,
      `HQ country: ${f.get("country")}`,
      `Interested in: ${interests.join(", ") || "not specified"}`,
      `Heard about us via: ${f.get("source") || "not specified"}`,
    ].join("\n");

    const url = new URL(CALENDLY);
    url.searchParams.set("name", `${first} ${last}`.trim());
    url.searchParams.set("email", String(f.get("email") ?? ""));
    url.searchParams.set("a1", notes);

    window.open(url.toString(), "_blank", "noopener,noreferrer");
    setSent(true);
  }

  if (sent) {
    return (
      <div className="vc-demo-card" data-compact={compact ? "" : undefined}>
        <div className="vc-demo-done">
          <div className="vc-demo-done-mark" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12 5 5L20 7" />
            </svg>
          </div>
          <h3 className="vc-demo-title">Pick a time that suits you</h3>
          <p className="vc-demo-done-copy">
            We opened the booking page in a new tab with your details filled in. If it was blocked,
            you can open it directly.
          </p>
          <a className="vc-demo-submit" href={CALENDLY} target="_blank" rel="noopener noreferrer">
            Open the booking page
          </a>
          <button type="button" className="vc-demo-reset" onClick={() => setSent(false)}>
            Edit my details
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="vc-demo-card" data-compact={compact ? "" : undefined} onSubmit={handleSubmit}>
      <h3 className="vc-demo-title">Request a demo to get started</h3>

      <input className="vc-demo-input" name="email" type="email" required placeholder="Work email*" autoComplete="email" />

      <div className="vc-demo-row">
        <input className="vc-demo-input" name="first" required placeholder="First name*" autoComplete="given-name" />
        <input className="vc-demo-input" name="last" required placeholder="Last name*" autoComplete="family-name" />
      </div>

      <div className="vc-demo-row">
        <input className="vc-demo-input" name="company" required placeholder="Company name*" autoComplete="organization" />
        <input className="vc-demo-input" name="title" required placeholder="Job title*" autoComplete="organization-title" />
      </div>

      <label className="vc-demo-label" htmlFor={`${uid}-headcount`}>Company headcount*</label>
      <select className="vc-demo-input vc-demo-select" id={`${uid}-headcount`} name="headcount" required defaultValue="">
        <option value="" disabled>Please select</option>
        {HEADCOUNT.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>

      <label className="vc-demo-label" htmlFor={`${uid}-country`}>Company HQ country*</label>
      <select className="vc-demo-input vc-demo-select" id={`${uid}-country`} name="country" required defaultValue="">
        <option value="" disabled>Please select</option>
        {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <fieldset className="vc-demo-fieldset">
        <legend className="vc-demo-label">How can VigiliCloud support your business?</legend>
        <div className="vc-demo-checks">
          {INTERESTS.map((item) => (
            <label key={item} className="vc-demo-check">
              <input type="checkbox" checked={interests.includes(item)} onChange={() => toggle(item)} />
              <span>{item}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="vc-demo-label" htmlFor={`${uid}-source`}>How did you hear about us?</label>
      <select className="vc-demo-input vc-demo-select" id={`${uid}-source`} name="source" defaultValue="">
        <option value="" disabled>Please select</option>
        {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <p className="vc-demo-fine">
        By submitting, you agree to be contacted about your demo. We never share your details.
      </p>

      <button type="submit" className="vc-demo-submit">Request a demo</button>
    </form>
  );
}
