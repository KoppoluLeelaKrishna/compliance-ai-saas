"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AuthMe } from "@/types";

/* ── Scroll-reveal ─── */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".ap-reveal");
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("ap-visible");
        }),
      { threshold: 0.08 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ── Apple design tokens ─── */
const C = {
  primary: "#0066cc",
  primaryDark: "#2997ff",
  ink: "#1d1d1f",
  inkMuted: "#6e6e73",
  inkSoft: "#7a7a7a",
  canvas: "#ffffff",
  parchment: "#f5f5f7",
  tile1: "#272729",
  tile2: "#2a2a2c",
  black: "#000000",
  hairline: "#d2d2d7",
  divider: "#f0f0f0",
};

const ff = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif";
const fft = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";

/* ── Data ─── */
const FEATURES = [
  { title: "S3 Public Access",    desc: "Detects open buckets, public ACLs, and exposed bucket policies before attackers find them.", sev: "Critical" },
  { title: "Root Access Keys",    desc: "Alerts immediately if your root account has active access keys — the most dangerous misconfiguration.", sev: "Critical" },
  { title: "IAM Permissions",     desc: "Flags over-permissioned roles and users with unnecessary admin access.", sev: "High" },
  { title: "MFA Enforcement",     desc: "Checks every IAM user and root account for missing multi-factor authentication.", sev: "High" },
  { title: "Security Groups",     desc: "Finds EC2 security groups with ports open to the entire internet.", sev: "High" },
  { title: "RDS Encryption",      desc: "Checks RDS instances for unencrypted storage and public accessibility.", sev: "High" },
  { title: "EBS Encryption",      desc: "Identifies unencrypted EBS volumes and missing default encryption settings.", sev: "Medium" },
  { title: "CloudTrail Logging",  desc: "Verifies CloudTrail is active, multi-region, and has log validation enabled.", sev: "Medium" },
  { title: "VPC Flow Logs",       desc: "Ensures network traffic is being logged for security monitoring and forensics.", sev: "Medium" },
  { title: "KMS Key Rotation",    desc: "Checks that customer-managed KMS keys have automatic rotation enabled.", sev: "Medium" },
];

const STEPS = [
  { num: "01", title: "Connect your AWS account", desc: "Create a read-only IAM role and paste the ARN. We never store credentials — access is assumed temporarily per scan.", detail: "5 minutes · Any AWS account" },
  { num: "02", title: "Run a security scan",       desc: "VigiliCloud checks all 10 security areas and returns prioritized findings in approximately 2 minutes.", detail: "No agents · No installations" },
  { num: "03", title: "Fix what's wrong",          desc: "Every finding includes the exact AWS Console path, CLI commands, and step-by-step remediation guidance.", detail: "Export evidence as CSV or JSON" },
];

const PLANS = [
  { key: "starter", name: "Starter", usd: "$99",  inr: "₹8,299",  period: "/mo", desc: "For solo consultants and small teams.",           features: ["Up to 3 AWS accounts", "All 10 security checks", "Fix guidance & remediation", "CSV / JSON exports", "Email alerts"],                  cta: "Start Free Trial", hot: false },
  { key: "pro",     name: "Pro",     usd: "$299", inr: "₹24,999", period: "/mo", desc: "For teams managing multiple AWS environments.", features: ["Up to 10 AWS accounts", "Everything in Starter", "AI security analysis", "Scheduled daily scans", "Priority support"],             cta: "Start Free Trial", hot: true  },
  { key: "msp",     name: "MSP",     usd: "$999", inr: "₹83,499", period: "/mo", desc: "For agencies and managed service providers.",   features: ["Unlimited AWS accounts", "Everything in Pro", "Multi-customer workflows", "High-volume scanning", "White-label ready"], cta: "Contact Us",    hot: false },
];

const TESTIMONIALS = [
  { quote: "VigiliCloud found 6 critical misconfigurations in our production AWS account that we had no idea about. Fixed them all in an afternoon.", name: "Rahul M.", role: "CTO, SaaS Startup",  loc: "Bangalore, India" },
  { quote: "As an AWS consultant I scan client accounts regularly. This cuts my security review from 2 days to 2 minutes. Game changer.",            name: "Priya S.", role: "AWS Consultant",      loc: "Hyderabad, India" },
  { quote: "We needed to pass a security audit for an enterprise deal. VigiliCloud gave us the evidence exports we needed to close.",                 name: "James T.", role: "VP Engineering",      loc: "Austin, Texas"    },
];

/* ── Severity badge ─── */
function SevBadge({ sev }: { sev: string }) {
  const map: Record<string, { color: string; bg: string; border: string }> = {
    Critical: { color: "#dc2626", bg: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)" },
    High:     { color: "#ea580c", bg: "rgba(234,88,12,0.08)",  border: "1px solid rgba(234,88,12,0.2)"  },
    Medium:   { color: "#b45309", bg: "rgba(180,83,9,0.08)",   border: "1px solid rgba(180,83,9,0.2)"   },
  };
  const s = map[sev] ?? map.Medium;
  return (
    <span style={{ ...s, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 9999, fontFamily: fft, display: "inline-block", letterSpacing: 0 }}>
      {sev}
    </span>
  );
}

/* ── Pill button styles ─── */
const pillPrimary: React.CSSProperties = {
  display: "inline-block", background: C.primary, color: "#fff",
  fontSize: 17, fontFamily: fft, fontWeight: 400,
  padding: "11px 22px", borderRadius: 9999,
  letterSpacing: "-0.374px", textDecoration: "none",
  transition: "transform 0.15s",
};
const pillGhost: React.CSSProperties = {
  display: "inline-block", background: "transparent", color: C.primary,
  fontSize: 17, fontFamily: fft, fontWeight: 400,
  padding: "10px 22px", borderRadius: 9999,
  border: `1px solid ${C.primary}`,
  letterSpacing: "-0.374px", textDecoration: "none",
  transition: "transform 0.15s",
};
const pillPrimaryDark: React.CSSProperties = {
  ...pillPrimary,
};

/* ── Section label ─── */
function Label({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div style={{ fontFamily: fft, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: dark ? C.primaryDark : C.primary, marginBottom: 14 }}>
      {children}
    </div>
  );
}

/* ── Page ─── */
export default function HomePage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading]             = useState(true);
  const [contactSent, setContactSent]     = useState(false);
  const [email, setEmail]                 = useState("");
  const [message, setMessage]             = useState("");

  useReveal();

  useEffect(() => {
    api<AuthMe>("/auth/me")
      .then((a) => setAuthenticated(!!a.authenticated))
      .catch(() => setAuthenticated(false))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ background: C.canvas, color: C.ink, fontFamily: ff, overflowX: "hidden" }}>

      {/* ────────────────────────────────────────────────────────
          GLOBAL NAV  — true black, 44 px, sticky
      ──────────────────────────────────────────────────────── */}
      <nav style={{ background: C.black, height: 44, position: "sticky", top: 0, zIndex: 200, display: "flex", alignItems: "center" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", width: "100%", padding: "0 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* Logo */}
          <Link href="/" style={{ color: "#fff", fontSize: 15, fontWeight: 600, letterSpacing: "-0.3px", fontFamily: ff, textDecoration: "none" }}>
            VigiliCloud
          </Link>

          {/* Center links */}
          <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
            {[
              { label: "Features",      href: "#features" },
              { label: "How It Works",  href: "#how-it-works" },
              { label: "Pricing",       href: "#pricing" },
            ].map((l) => (
              <a key={l.label} href={l.href} style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: fft, letterSpacing: "-0.12px", textDecoration: "none" }}>
                {l.label}
              </a>
            ))}
          </div>

          {/* Right actions */}
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {!loading && (
              authenticated ? (
                <Link href="/scans" style={{ background: C.primary, color: "#fff", fontSize: 12, fontFamily: fft, padding: "6px 16px", borderRadius: 9999, textDecoration: "none" }}>
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link href="/signin" style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: fft, textDecoration: "none" }}>
                    Sign In
                  </Link>
                  <Link href="/signup" style={{ background: C.primary, color: "#fff", fontSize: 12, fontFamily: fft, padding: "6px 16px", borderRadius: 9999, textDecoration: "none" }}>
                    Get Started
                  </Link>
                </>
              )
            )}
          </div>
        </div>
      </nav>


      {/* ────────────────────────────────────────────────────────
          HERO TILE  — white canvas
      ──────────────────────────────────────────────────────── */}
      <section style={{ background: C.canvas, padding: "100px 22px 80px", textAlign: "center" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }} className="ap-reveal">

          {/* Eyebrow chip */}
          <div style={{ display: "inline-block", background: C.parchment, color: C.inkMuted, fontSize: 14, fontFamily: fft, padding: "8px 18px", borderRadius: 9999, marginBottom: 28, letterSpacing: "-0.224px" }}>
            AWS Cloud Security
          </div>

          {/* Hero headline */}
          <h1 style={{ fontFamily: ff, fontSize: "clamp(40px, 5.6vw, 56px)", fontWeight: 600, lineHeight: 1.07, letterSpacing: "-0.28px", color: C.ink, maxWidth: 800, margin: "0 auto 20px" }}>
            Find misconfigurations.<br />Before hackers do.
          </h1>

          {/* Tagline */}
          <p style={{ fontFamily: ff, fontSize: "clamp(19px, 2.2vw, 28px)", fontWeight: 400, lineHeight: 1.14, color: C.inkMuted, maxWidth: 560, margin: "0 auto 36px", letterSpacing: 0 }}>
            10 automated security checks. 2-minute scans. Zero setup.
          </p>

          {/* CTA row */}
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <Link href={authenticated ? "/scans" : "/signup"} style={pillPrimary}>
              {loading ? "Get Started Free" : authenticated ? "Go to Dashboard" : "Start Free Trial"}
            </Link>
            <a href="#how-it-works" style={pillGhost}>
              See How It Works
            </a>
          </div>

          {/* Fine print */}
          <p style={{ color: C.inkSoft, fontSize: 12, fontFamily: fft, letterSpacing: "-0.12px", marginBottom: 72 }}>
            Free 2-week trial · No credit card · Setup in 5 minutes
          </p>

          {/* ── Dashboard mockup — the "product image" ── */}
          <div style={{ maxWidth: 720, margin: "0 auto", background: C.canvas, borderRadius: 18, border: `1px solid ${C.hairline}`, boxShadow: "rgba(0,0,0,0.22) 3px 5px 30px 0", overflow: "hidden", textAlign: "left" }}>

            {/* Window chrome */}
            <div style={{ background: C.parchment, padding: "11px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${C.hairline}` }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57", flexShrink: 0 }} />
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e", flexShrink: 0 }} />
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840", flexShrink: 0 }} />
              <div style={{ flex: 1, marginLeft: 12, background: "rgba(0,0,0,0.06)", borderRadius: 6, padding: "4px 12px", fontSize: 11, color: C.inkMuted, fontFamily: fft }}>
                vigilicloud.com/scans/report
              </div>
            </div>

            {/* Scan header */}
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.divider}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, fontFamily: fft, letterSpacing: "-0.3px" }}>my-production-account</div>
                <div style={{ fontSize: 12, color: C.inkMuted, fontFamily: fft, marginTop: 2 }}>Scan completed · 1 min 48 sec · 10 checks run</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { label: "2 Critical", color: "#dc2626", bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.2)" },
                  { label: "4 High",     color: "#ea580c", bg: "rgba(234,88,12,0.08)",  border: "rgba(234,88,12,0.2)"  },
                  { label: "3 Medium",   color: "#b45309", bg: "rgba(180,83,9,0.08)",   border: "rgba(180,83,9,0.2)"   },
                ].map((b) => (
                  <span key={b.label} style={{ background: b.bg, border: `1px solid ${b.border}`, borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: b.color, fontFamily: fft }}>
                    {b.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Finding rows */}
            {[
              { dot: "#dc2626", label: "S3 bucket 'my-data-lake' is publicly accessible",  check: "S3 Public Access",  status: "FAIL", statusColor: "#dc2626" },
              { dot: "#dc2626", label: "Root account has active access keys",               check: "Root Access Keys",  status: "FAIL", statusColor: "#dc2626" },
              { dot: "#ea580c", label: "IAM role has AdministratorAccess policy attached",  check: "IAM Permissions",   status: "FAIL", statusColor: "#ea580c" },
              { dot: "#b45309", label: "EBS volume vol-0a1b2c3d is not encrypted",          check: "EBS Encryption",    status: "FAIL", statusColor: "#b45309" },
              { dot: "#16a34a", label: "MFA is enabled on all IAM users",                   check: "MFA Enforcement",   status: "PASS", statusColor: "#16a34a" },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 24px", borderBottom: i < 4 ? `1px solid ${C.divider}` : "none" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: row.dot, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: row.status === "FAIL" ? 500 : 400, color: C.ink, fontFamily: fft }}>{row.label}</div>
                  <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: fft, marginTop: 1 }}>{row.check}</div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: row.statusColor, fontFamily: fft, flexShrink: 0 }}>{row.status}</div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ────────────────────────────────────────────────────────
          STATS STRIP  — parchment
      ──────────────────────────────────────────────────────── */}
      <section style={{ background: C.parchment, padding: "64px 22px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }} className="ap-reveal">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 32, textAlign: "center" }}>
            {[
              { value: "10+",   label: "Security checks" },
              { value: "2 min", label: "Scan time" },
              { value: "100%",  label: "Read-only access" },
              { value: "24/7",  label: "Monitoring ready" },
            ].map((s) => (
              <div key={s.label}>
                <div style={{ fontFamily: ff, fontSize: 40, fontWeight: 600, lineHeight: 1.1, color: C.ink, letterSpacing: 0 }}>{s.value}</div>
                <div style={{ fontFamily: fft, fontSize: 14, color: C.inkMuted, marginTop: 6, letterSpacing: "-0.224px" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ────────────────────────────────────────────────────────
          HOW IT WORKS  — dark tile
      ──────────────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ background: C.tile1, padding: "80px 22px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>

          <div className="ap-reveal" style={{ textAlign: "center", marginBottom: 56 }}>
            <Label dark>How It Works</Label>
            <h2 style={{ fontFamily: ff, fontSize: "clamp(32px, 4vw, 40px)", fontWeight: 600, lineHeight: 1.1, letterSpacing: 0, color: "#ffffff", margin: "0 auto 16px", maxWidth: 560 }}>
              Up and running in 5 minutes.
            </h2>
            <p style={{ fontFamily: fft, fontSize: 17, fontWeight: 400, lineHeight: 1.47, color: "#a1a1a6", letterSpacing: "-0.374px" }}>
              No agents, no installations, no complex setup.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
            {STEPS.map((step, i) => (
              <div key={step.num} className={`ap-reveal ap-reveal-delay-${i + 1}`} style={{ padding: "40px 32px", background: i === 1 ? C.tile2 : C.tile1 }}>
                <div style={{ fontFamily: ff, fontSize: 56, fontWeight: 600, color: "rgba(255,255,255,0.1)", lineHeight: 1, marginBottom: 24, letterSpacing: "-0.28px" }}>
                  {step.num}
                </div>
                <h3 style={{ fontFamily: ff, fontSize: 21, fontWeight: 600, color: "#ffffff", lineHeight: 1.19, letterSpacing: "0.231px", marginBottom: 12 }}>
                  {step.title}
                </h3>
                <p style={{ fontFamily: fft, fontSize: 14, fontWeight: 400, lineHeight: 1.5, color: "#a1a1a6", letterSpacing: "-0.224px", marginBottom: 20 }}>
                  {step.desc}
                </p>
                <span style={{ display: "inline-block", background: "rgba(41,151,255,0.1)", border: "1px solid rgba(41,151,255,0.2)", borderRadius: 9999, padding: "5px 12px", fontSize: 11, color: C.primaryDark, fontFamily: fft }}>
                  {step.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ────────────────────────────────────────────────────────
          FEATURES  — white canvas
      ──────────────────────────────────────────────────────── */}
      <section id="features" style={{ background: C.canvas, padding: "80px 22px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>

          <div className="ap-reveal" style={{ textAlign: "center", marginBottom: 56 }}>
            <Label>Security Checks</Label>
            <h2 style={{ fontFamily: ff, fontSize: "clamp(32px, 4vw, 40px)", fontWeight: 600, lineHeight: 1.1, letterSpacing: 0, color: C.ink, margin: "0 auto 16px", maxWidth: 680 }}>
              10 checks. Every critical area.
            </h2>
            <p style={{ fontFamily: fft, fontSize: 17, fontWeight: 400, lineHeight: 1.47, color: C.inkMuted, letterSpacing: "-0.374px" }}>
              Every check includes fix guidance, console path, and CLI commands.
            </p>
          </div>

          {/* Feature grid — hairline borders as dividers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1, background: C.hairline }}>
            {FEATURES.map((f, i) => (
              <div key={f.title} className={`ap-reveal ap-reveal-delay-${(i % 3) + 1}`} style={{ background: C.canvas, padding: "28px 32px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontFamily: fft, fontSize: 11, fontWeight: 600, color: C.primary, letterSpacing: "0.08em", background: "rgba(0,102,204,0.07)", border: "1px solid rgba(0,102,204,0.14)", padding: "3px 8px", borderRadius: 5 }}>
                    AWS
                  </span>
                  <SevBadge sev={f.sev} />
                </div>
                <h3 style={{ fontFamily: ff, fontSize: 17, fontWeight: 600, color: C.ink, lineHeight: 1.24, letterSpacing: "-0.374px", marginBottom: 6 }}>
                  {f.title}
                </h3>
                <p style={{ fontFamily: fft, fontSize: 14, fontWeight: 400, lineHeight: 1.5, color: C.inkMuted, letterSpacing: "-0.224px" }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Power features strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: C.hairline, marginTop: 1 }}>
            {[
              { title: "AI Security Analysis", desc: "Claude AI summarizes your findings and prioritizes what to fix first.", href: "#" },
              { title: "Email Alerts",          desc: "Get notified immediately when critical issues are found in your account.", href: "#" },
              { title: "Compliance Exports",    desc: "Export as CSV or JSON for SOC2, ISO 27001, and audit evidence.", href: "#" },
            ].map((f) => (
              <div key={f.title} style={{ background: C.canvas, padding: "28px 32px" }}>
                <h3 style={{ fontFamily: ff, fontSize: 17, fontWeight: 600, color: C.ink, lineHeight: 1.24, letterSpacing: "-0.374px", marginBottom: 8 }}>
                  {f.title}
                </h3>
                <p style={{ fontFamily: fft, fontSize: 14, color: C.inkMuted, lineHeight: 1.5, letterSpacing: "-0.224px", marginBottom: 12 }}>
                  {f.desc}
                </p>
                <a href={f.href} style={{ color: C.primary, fontSize: 14, fontFamily: fft, textDecoration: "none", letterSpacing: "-0.224px" }}>
                  Learn more →
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ────────────────────────────────────────────────────────
          SECURITY INSIGHTS  — parchment
      ──────────────────────────────────────────────────────── */}
      <section id="stats" style={{ background: C.parchment, padding: "80px 22px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>

          <div className="ap-reveal" style={{ textAlign: "center", marginBottom: 56 }}>
            <Label>Security Insights</Label>
            <h2 style={{ fontFamily: ff, fontSize: "clamp(32px, 4vw, 40px)", fontWeight: 600, lineHeight: 1.1, letterSpacing: 0, color: C.ink, margin: "0 auto 16px" }}>
              What we find in a typical AWS scan.
            </h2>
            <p style={{ fontFamily: fft, fontSize: 17, fontWeight: 400, lineHeight: 1.47, color: C.inkMuted, letterSpacing: "-0.374px", maxWidth: 560, margin: "0 auto" }}>
              Real data from AWS accounts scanned by VigiliCloud — most have more issues than they think.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }} className="ap-reveal">
            {/* Donut chart */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <svg viewBox="0 0 120 120" style={{ width: 220, height: 220 }}>
                <circle cx="60" cy="60" r="45" fill="none" stroke={C.divider} strokeWidth="14" />
                <circle cx="60" cy="60" r="45" fill="none" stroke="#dc2626" strokeWidth="14" strokeLinecap="round" strokeDasharray="57.2 225.54"  strokeDashoffset="70.69"   />
                <circle cx="60" cy="60" r="45" fill="none" stroke="#ea580c" strokeWidth="14" strokeLinecap="round" strokeDasharray="93.96 188.78" strokeDashoffset="8.49"    />
                <circle cx="60" cy="60" r="45" fill="none" stroke="#b45309" strokeWidth="14" strokeLinecap="round" strokeDasharray="74.17 208.57" strokeDashoffset="-90.47"  />
                <circle cx="60" cy="60" r="45" fill="none" stroke="#9ca3af" strokeWidth="14" strokeLinecap="round" strokeDasharray="37.41 245.33" strokeDashoffset="-169.64" />
                <text x="60" y="54" textAnchor="middle" fill={C.ink}     fontSize="18" fontWeight="600" fontFamily={ff}>14</text>
                <text x="60" y="67" textAnchor="middle" fill={C.inkMuted} fontSize="7.5"               fontFamily={fft}>avg findings</text>
              </svg>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 28px", marginTop: 16, width: "100%", maxWidth: 260 }}>
                {[
                  { label: "Critical", pct: "22%", color: "#dc2626" },
                  { label: "High",     pct: "35%", color: "#ea580c" },
                  { label: "Medium",   pct: "28%", color: "#b45309" },
                  { label: "Low",      pct: "15%", color: "#9ca3af" },
                ].map((item) => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: item.color, fontFamily: fft }}>{item.label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: C.inkMuted, fontFamily: fft }}>{item.pct}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {[
                { v: "78%",    label: "Accounts with at least one critical finding",      icon: "⚠️" },
                { v: "14",     label: "Average security findings per account scan",        icon: "📊" },
                { v: "#1",     label: "S3 misconfiguration is the most common finding",   icon: "🪣" },
                { v: "~1 day", label: "Average fix time with step-by-step guidance",      icon: "⚡" },
              ].map((stat) => (
                <div key={stat.v} style={{ background: C.canvas, border: `1px solid ${C.hairline}`, borderRadius: 18, padding: "24px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{stat.icon}</div>
                  <div style={{ fontFamily: ff, fontSize: 28, fontWeight: 600, color: C.ink, letterSpacing: 0 }}>{stat.v}</div>
                  <p style={{ fontFamily: fft, fontSize: 12, color: C.inkMuted, lineHeight: 1.4, marginTop: 8, letterSpacing: "-0.12px" }}>{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>


      {/* ────────────────────────────────────────────────────────
          PRICING  — dark tile
      ──────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ background: C.tile1, padding: "80px 22px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>

          <div className="ap-reveal" style={{ textAlign: "center", marginBottom: 56 }}>
            <Label dark>Pricing</Label>
            <h2 style={{ fontFamily: ff, fontSize: "clamp(32px, 4vw, 40px)", fontWeight: 600, lineHeight: 1.1, letterSpacing: 0, color: "#ffffff", margin: "0 auto 16px" }}>
              Simple, transparent pricing.
            </h2>
            <p style={{ fontFamily: fft, fontSize: 17, fontWeight: 400, lineHeight: 1.47, color: "#a1a1a6", letterSpacing: "-0.374px" }}>
              2-week free trial on all plans. Billed in INR · USD shown for reference.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {PLANS.map((plan, i) => (
              <div key={plan.key} className={`ap-reveal ap-reveal-delay-${i + 1}`} style={{
                background: C.canvas, borderRadius: 18, padding: "32px 28px",
                border: plan.hot ? `2px solid ${C.primary}` : `1px solid ${C.hairline}`,
                position: "relative",
              }}>
                {plan.hot && (
                  <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", background: C.primary, color: "#fff", fontSize: 11, fontWeight: 600, padding: "4px 14px", borderRadius: 9999, fontFamily: fft, whiteSpace: "nowrap" }}>
                    Most Popular
                  </div>
                )}

                <div style={{ fontFamily: fft, fontSize: 12, fontWeight: 600, color: C.inkMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{plan.name}</div>

                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 4 }}>
                  <span style={{ fontFamily: ff, fontSize: 40, fontWeight: 600, color: C.ink, letterSpacing: 0 }}>{plan.usd}</span>
                  <span style={{ fontFamily: fft, fontSize: 17, color: C.inkMuted, marginBottom: 6 }}>{plan.period}</span>
                </div>
                <div style={{ fontFamily: fft, fontSize: 12, color: C.inkSoft, marginBottom: 12 }}>{plan.inr}/mo · INR approx.</div>

                <p style={{ fontFamily: fft, fontSize: 14, color: C.inkMuted, lineHeight: 1.5, marginBottom: 20, letterSpacing: "-0.224px" }}>{plan.desc}</p>

                <div style={{ borderTop: `1px solid ${C.divider}`, paddingTop: 20, marginBottom: 24 }}>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    {plan.features.map((f) => (
                      <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontFamily: fft, fontSize: 14, color: C.ink, letterSpacing: "-0.224px", lineHeight: 1.4 }}>
                        <span style={{ color: C.primary, fontWeight: 700, flexShrink: 0, fontSize: 13, marginTop: 1 }}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href={plan.key === "msp" ? "#contact" : "/signup"}
                  style={{
                    display: "block", textAlign: "center", textDecoration: "none",
                    background: plan.hot ? C.primary : "transparent",
                    color: plan.hot ? "#fff" : C.primary,
                    border: plan.hot ? "none" : `1px solid ${C.primary}`,
                    fontSize: 17, fontFamily: fft, fontWeight: 400,
                    padding: "11px 22px", borderRadius: 9999, letterSpacing: "-0.374px",
                  }}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ────────────────────────────────────────────────────────
          TESTIMONIALS  — white canvas
      ──────────────────────────────────────────────────────── */}
      <section id="testimonials" style={{ background: C.canvas, padding: "80px 22px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>

          <div className="ap-reveal" style={{ textAlign: "center", marginBottom: 56 }}>
            <Label>Testimonials</Label>
            <h2 style={{ fontFamily: ff, fontSize: "clamp(32px, 4vw, 40px)", fontWeight: 600, lineHeight: 1.1, letterSpacing: 0, color: C.ink }}>
              Trusted by AWS teams worldwide.
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: C.hairline }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={t.name} className={`ap-reveal ap-reveal-delay-${i + 1}`} style={{ background: C.canvas, padding: "40px 32px" }}>
                <div style={{ display: "flex", gap: 3, marginBottom: 20 }}>
                  {[...Array(5)].map((_, s) => (
                    <span key={s} style={{ color: C.primary, fontSize: 14 }}>★</span>
                  ))}
                </div>
                <p style={{ fontFamily: fft, fontSize: 17, fontWeight: 400, lineHeight: 1.47, color: C.ink, letterSpacing: "-0.374px", marginBottom: 24 }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 12, borderTop: `1px solid ${C.divider}`, paddingTop: 20 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.parchment, border: `1px solid ${C.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 15, fontWeight: 600, color: C.ink, fontFamily: ff }}>
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontFamily: fft, fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: "-0.224px" }}>{t.name}</div>
                    <div style={{ fontFamily: fft, fontSize: 12, color: C.inkMuted, letterSpacing: "-0.12px" }}>{t.role} · {t.loc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ────────────────────────────────────────────────────────
          DEMO + CONTACT  — parchment
      ──────────────────────────────────────────────────────── */}
      <section style={{ background: C.parchment, padding: "80px 22px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "start" }} className="ap-reveal">

          {/* Left — Book a demo */}
          <div id="demo">
            <Label>Book a Demo</Label>
            <h2 style={{ fontFamily: ff, fontSize: "clamp(28px, 3.5vw, 40px)", fontWeight: 600, lineHeight: 1.1, letterSpacing: 0, color: C.ink, marginBottom: 16 }}>
              See VigiliCloud live.
            </h2>
            <p style={{ fontFamily: fft, fontSize: 17, fontWeight: 400, lineHeight: 1.47, color: C.inkMuted, letterSpacing: "-0.374px", marginBottom: 24 }}>
              A free 25-minute demo — I&apos;ll walk you through connecting your AWS account, running a live scan, and reviewing your findings in real time.
            </p>
            <ul style={{ listStyle: "none", margin: "0 0 24px", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {["Live AWS scan on your account", "Walk through every critical finding", "Show you how to fix each issue", "Answer all your questions"].map((item) => (
                <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: fft, fontSize: 14, color: C.ink, letterSpacing: "-0.224px" }}>
                  <span style={{ color: C.primary, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", gap: 20, fontSize: 13, color: C.inkMuted, fontFamily: fft, flexWrap: "wrap", marginBottom: 28 }}>
              <span>Mon–Fri</span>
              <span>·</span>
              <span>9am–12pm CST</span>
              <span>·</span>
              <span>25 minutes</span>
              <span>·</span>
              <span>Google Meet</span>
            </div>
            <a href="https://calendly.com/leelakrishnakoppolu/vigilicloud-demo" target="_blank" rel="noopener noreferrer" style={pillPrimaryDark}>
              Book Free Demo
            </a>
          </div>

          {/* Right — Contact form */}
          <div id="contact">
            <Label>Get in Touch</Label>
            <h2 style={{ fontFamily: ff, fontSize: "clamp(28px, 3.5vw, 40px)", fontWeight: 600, lineHeight: 1.1, letterSpacing: 0, color: C.ink, marginBottom: 20 }}>
              Questions? We reply within 24 hours.
            </h2>

            {contactSent ? (
              <div style={{ background: "rgba(0,102,204,0.06)", border: "1px solid rgba(0,102,204,0.2)", borderRadius: 12, padding: 24, textAlign: "center", color: C.primary, fontFamily: fft, fontSize: 15, lineHeight: 1.5 }}>
                Thanks! We&apos;ll get back to you within 24 hours.
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); setContactSent(true); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontFamily: fft, fontSize: 14, color: C.inkMuted, marginBottom: 6, letterSpacing: "-0.224px" }}>Your email</label>
                  <input
                    type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    style={{ width: "100%", border: `1px solid ${C.hairline}`, background: C.canvas, borderRadius: 9999, padding: "12px 20px", fontSize: 17, color: C.ink, fontFamily: fft, outline: "none", letterSpacing: "-0.374px", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontFamily: fft, fontSize: 14, color: C.inkMuted, marginBottom: 6, letterSpacing: "-0.224px" }}>Message</label>
                  <textarea
                    required rows={4} value={message} onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us about your AWS setup or what you're looking for..."
                    style={{ width: "100%", border: `1px solid ${C.hairline}`, background: C.canvas, borderRadius: 12, padding: "12px 20px", fontSize: 17, color: C.ink, fontFamily: fft, outline: "none", letterSpacing: "-0.374px", resize: "none", boxSizing: "border-box" }}
                  />
                </div>
                <button type="submit" style={{ background: C.primary, color: "#fff", fontSize: 17, fontFamily: fft, fontWeight: 400, padding: "11px 22px", borderRadius: 9999, border: "none", cursor: "pointer", letterSpacing: "-0.374px", textAlign: "center" }}>
                  Send Message
                </button>
              </form>
            )}

            <p style={{ marginTop: 14, fontSize: 12, color: C.inkMuted, fontFamily: fft, letterSpacing: "-0.12px", textAlign: "center" }}>
              Or email:{" "}
              <a href="mailto:leelakrishnakoppolu@gmail.com" style={{ color: C.primary, textDecoration: "none" }}>
                leelakrishnakoppolu@gmail.com
              </a>
            </p>
          </div>
        </div>
      </section>


      {/* ────────────────────────────────────────────────────────
          CTA BANNER  — dark tile
      ──────────────────────────────────────────────────────── */}
      <section style={{ background: C.tile2, padding: "80px 22px", textAlign: "center" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }} className="ap-reveal">
          <h2 style={{ fontFamily: ff, fontSize: "clamp(32px, 4vw, 40px)", fontWeight: 600, lineHeight: 1.1, letterSpacing: 0, color: "#ffffff", marginBottom: 16 }}>
            Start securing your AWS today.
          </h2>
          <p style={{ fontFamily: fft, fontSize: 17, fontWeight: 400, lineHeight: 1.47, color: "#a1a1a6", letterSpacing: "-0.374px", marginBottom: 36 }}>
            Free 2-week trial · No credit card · Setup in 5 minutes
          </p>
          <Link href="/signup" style={pillPrimaryDark}>
            Start Free Trial
          </Link>
        </div>
      </section>


      {/* ────────────────────────────────────────────────────────
          FOOTER  — parchment
      ──────────────────────────────────────────────────────── */}
      <footer style={{ background: C.parchment, padding: "64px 22px 48px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 48, marginBottom: 48 }}>
            {/* Brand */}
            <div>
              <Link href="/" style={{ fontFamily: ff, fontSize: 17, fontWeight: 600, color: C.ink, textDecoration: "none", letterSpacing: "-0.374px", display: "block", marginBottom: 12 }}>
                VigiliCloud
              </Link>
              <p style={{ fontFamily: fft, fontSize: 14, color: C.inkMuted, lineHeight: 1.5, maxWidth: 280, letterSpacing: "-0.224px" }}>
                AWS security scanning for teams that can&apos;t afford to miss a misconfiguration.
              </p>
            </div>

            {/* Product */}
            <div>
              <div style={{ fontFamily: fft, fontSize: 12, fontWeight: 600, color: C.ink, letterSpacing: "-0.12px", marginBottom: 16 }}>Product</div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {[
                  { label: "Features",    href: "#features" },
                  { label: "Pricing",     href: "#pricing" },
                  { label: "Book a Demo", href: "#demo" },
                  { label: "Get Started", href: "/onboarding" },
                ].map((l) => (
                  <li key={l.label}>
                    <a href={l.href} style={{ fontFamily: fft, fontSize: 17, color: C.inkMuted, textDecoration: "none", lineHeight: 2.41, letterSpacing: 0, display: "block" }}>
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <div style={{ fontFamily: fft, fontSize: 12, fontWeight: 600, color: C.ink, letterSpacing: "-0.12px", marginBottom: 16 }}>Company</div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {[
                  { label: "About",    href: "#contact" },
                  { label: "Contact",  href: "#contact" },
                  { label: "Support",  href: "mailto:leelakrishnakoppolu@gmail.com" },
                  { label: "Sign In",  href: "/signin" },
                ].map((l) => (
                  <li key={l.label}>
                    <a href={l.href} style={{ fontFamily: fft, fontSize: 17, color: C.inkMuted, textDecoration: "none", lineHeight: 2.41, letterSpacing: 0, display: "block" }}>
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Legal row */}
          <div style={{ borderTop: `1px solid ${C.hairline}`, paddingTop: 24 }}>
            <p style={{ fontFamily: fft, fontSize: 12, color: "#7a7a7a", letterSpacing: "-0.12px" }}>
              © 2026 VigiliCloud. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
