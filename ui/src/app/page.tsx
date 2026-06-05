"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { AuthMe } from "@/types";

/* ── Scroll-reveal (below-fold) ─── */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".ap-reveal");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("ap-visible"); }),
      { threshold: 0.07 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ── Counter animation ─── */
function useCounters() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-count]");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        const target = parseFloat(el.dataset.count ?? "0");
        const decimals = el.dataset.decimals ? parseInt(el.dataset.decimals) : 0;
        const suffix = el.dataset.suffix ?? "";
        const prefix = el.dataset.prefix ?? "";
        const duration = 1400;
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = prefix + (eased * target).toFixed(decimals) + suffix;
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        io.unobserve(el);
      });
    }, { threshold: 0.5 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ── Parallax on hero mockup ─── */
function useParallax() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onScroll = () => {
      if (!ref.current) return;
      ref.current.style.transform = `translateY(${window.scrollY * 0.12}px)`;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return ref;
}

/* ── Apple design tokens ─── */
const C = {
  primary:     "#0066cc",
  primaryDark: "#2997ff",
  ink:         "#1d1d1f",
  inkMuted:    "#6e6e73",
  inkSoft:     "#86868b",
  muted:       "#a1a1a6",
  onDark:      "#f5f5f7",
  canvas:      "#ffffff",
  parchment:   "#f5f5f7",
  tile1:       "#272729",
  tile2:       "#2a2a2c",
  tile3:       "#1c1c1e",
  black:       "#000000",
  hairline:    "#d2d2d7",
  divider:     "#f0f0f0",
};

const ff  = "var(--ff)";
const fft = "var(--fft)";

/* ── Data ─── */
const STEPS = [
  { num: "01", title: "Connect your AWS account",  desc: "Create a read-only IAM role and paste the ARN. We never store credentials — access is assumed temporarily per scan.", tag: "5 min · Any AWS account" },
  { num: "02", title: "Run a security scan",        desc: "Click Run Scan. VigiliCloud checks all 10 security areas and returns prioritized findings in approximately 2 minutes.", tag: "No agents · No installs" },
  { num: "03", title: "Fix what's wrong",           desc: "Every finding includes the exact AWS Console path, CLI commands, and step-by-step remediation guidance.", tag: "CSV / JSON export" },
];

const BENTO = [
  { title: "S3 Public Access",    desc: "Detects open buckets, public ACLs, and exposed bucket policies before attackers find them.",  sev: "Critical", bg: C.tile1,     text: "#ffffff", span: 2, height: 300 },
  { title: "Root Access Keys",    desc: "Alerts immediately if your root account has active access keys — the most dangerous risk.",    sev: "Critical", bg: C.tile2,     text: "#ffffff", span: 1, height: 300 },
  { title: "IAM Permissions",     desc: "Flags over-permissioned roles with unnecessary admin access.",                                 sev: "High",     bg: C.parchment,  text: C.ink,    span: 1, height: 240 },
  { title: "MFA Enforcement",     desc: "Checks every IAM user and root account for missing multi-factor authentication.",              sev: "High",     bg: C.canvas,     text: C.ink,    span: 1, height: 240 },
  { title: "Security Groups",     desc: "Finds EC2 security groups with ports open to the entire internet.",                            sev: "High",     bg: C.parchment,  text: C.ink,    span: 1, height: 240 },
  { title: "RDS Encryption",      desc: "Checks RDS instances for unencrypted storage and public accessibility.",                      sev: "High",     bg: C.canvas,     text: C.ink,    span: 2, height: 240 },
  { title: "EBS Encryption",      desc: "Identifies unencrypted EBS volumes and missing default encryption settings.",                  sev: "Medium",   bg: C.tile1,      text: "#ffffff", span: 1, height: 200 },
  { title: "CloudTrail Logging",  desc: "Verifies CloudTrail is active, multi-region, and has log validation enabled.",                sev: "Medium",   bg: C.tile2,      text: "#ffffff", span: 1, height: 200 },
  { title: "VPC Flow Logs",       desc: "Ensures network traffic is logged for security monitoring and forensics.",                     sev: "Medium",   bg: C.tile3,      text: "#ffffff", span: 1, height: 200 },
  { title: "KMS Key Rotation",    desc: "Checks that customer-managed KMS keys have automatic rotation enabled.",                      sev: "Medium",   bg: C.tile1,      text: "#ffffff", span: 1, height: 200 },
];

const PLANS = [
  { key: "starter", name: "Starter", usd: "$99",  inr: "₹8,299",  desc: "For solo consultants and small teams.",        hot: false, features: ["Up to 3 AWS accounts", "All 10 security checks", "Fix guidance & remediation", "CSV / JSON exports", "Email alerts"] },
  { key: "pro",     name: "Pro",     usd: "$299", inr: "₹24,999", desc: "For teams managing multiple AWS environments.", hot: true,  features: ["Up to 10 AWS accounts", "Everything in Starter", "AI security analysis", "Scheduled daily scans", "Priority support"] },
  { key: "msp",     name: "MSP",     usd: "$999", inr: "₹83,499", desc: "For agencies and managed service providers.",   hot: false, features: ["Unlimited AWS accounts", "Everything in Pro", "Multi-customer workflows", "High-volume scanning", "White-label ready"] },
];

const TESTIMONIALS = [
  { quote: "VigiliCloud found 6 critical misconfigurations in our production AWS account that we had no idea about. Fixed them all in an afternoon.", name: "Rahul M.", role: "CTO, SaaS Startup",  loc: "Bangalore, India" },
  { quote: "This cuts my security review from 2 days to 2 minutes. As an AWS consultant who scans client accounts regularly — game changer.",         name: "Priya S.", role: "AWS Consultant",      loc: "Hyderabad, India" },
  { quote: "We needed to pass a security audit for an enterprise deal. VigiliCloud gave us the evidence exports we needed to close.",                  name: "James T.", role: "VP Engineering",      loc: "Austin, Texas"    },
];

/* ── Severity badge ─── */
function SevBadge({ sev, onDark }: { sev: string; onDark?: boolean }) {
  const light: Record<string, { color: string; bg: string; border: string }> = {
    Critical: { color: "#dc2626", bg: "rgba(220,38,38,0.09)",  border: "rgba(220,38,38,0.22)" },
    High:     { color: "#ea580c", bg: "rgba(234,88,12,0.09)",  border: "rgba(234,88,12,0.22)" },
    Medium:   { color: "#b45309", bg: "rgba(180,83,9,0.09)",   border: "rgba(180,83,9,0.22)"  },
  };
  const dark: Record<string, { color: string; bg: string; border: string }> = {
    Critical: { color: "#f87171", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.25)" },
    High:     { color: "#fb923c", bg: "rgba(251,146,60,0.12)",  border: "rgba(251,146,60,0.25)"  },
    Medium:   { color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.25)"  },
  };
  const map = onDark ? dark : light;
  const s = map[sev] ?? map.Medium;
  return (
    <span style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 9999, fontFamily: fft, display: "inline-block", letterSpacing: "0.02em" }}>
      {sev}
    </span>
  );
}

const pill = (bg: string, color: string, border?: string): React.CSSProperties => ({
  display: "inline-block", background: bg, color,
  fontSize: 17, fontFamily: fft, fontWeight: 400,
  padding: "11px 22px", borderRadius: 9999,
  border: border ? `1px solid ${border}` : "none",
  letterSpacing: "-0.374px", textDecoration: "none",
  cursor: "pointer",
});

function Label({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div style={{ fontFamily: fft, fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: dark ? C.primaryDark : C.primary, marginBottom: 16 }}>
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
  useCounters();
  const mockupRef = useParallax();

  useEffect(() => {
    api<AuthMe>("/auth/me")
      .then((a) => setAuthenticated(!!a.authenticated))
      .catch(() => setAuthenticated(false))
      .finally(() => setLoading(false));
  }, []);

  const Words = ({ text, baseDelay }: { text: string; baseDelay: number }) => (
    <>
      {text.split(" ").map((word, i) => (
        <span key={i} className="ap-word" style={{ animationDelay: `${baseDelay + i * 0.09}s` }}>
          {word}{" "}
        </span>
      ))}
    </>
  );

  return (
    <div style={{ background: C.black, color: C.onDark, fontFamily: ff, overflowX: "hidden" }}>

      {/* ══ NAV ══════════════════════════════════════════════════════ */}
      <nav style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "saturate(180%) blur(20px)", WebkitBackdropFilter: "saturate(180%) blur(20px)", height: 44, position: "sticky", top: 0, zIndex: 200, display: "flex", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", width: "100%", padding: "0 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ color: "#fff", fontSize: 15, fontWeight: 600, letterSpacing: "-0.3px", fontFamily: ff, textDecoration: "none" }}>
            VigiliCloud
          </Link>

          <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
            {[{ label: "Features", href: "#features" }, { label: "How It Works", href: "#how-it-works" }, { label: "Pricing", href: "#pricing" }].map((l) => (
              <a key={l.label} href={l.href} style={{ color: "rgba(255,255,255,0.72)", fontSize: 12, fontFamily: fft, letterSpacing: "-0.12px", textDecoration: "none" }}>
                {l.label}
              </a>
            ))}
          </div>

          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {!loading && (authenticated ? (
              <Link href="/scans" className="ap-btn" style={pill(C.primary, "#fff")}>Dashboard</Link>
            ) : (
              <>
                <Link href="/signin" style={{ color: "rgba(255,255,255,0.72)", fontSize: 12, fontFamily: fft, textDecoration: "none" }}>Sign In</Link>
                <Link href="/signup" className="ap-btn" style={{ ...pill(C.primary, "#fff"), fontSize: 12, padding: "6px 16px" }}>Get Started</Link>
              </>
            ))}
          </div>
        </div>
      </nav>

      {/* ══ HERO ═════════════════════════════════════════════════════ */}
      <section style={{ background: C.black, minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px 22px 60px", textAlign: "center", position: "relative", overflow: "hidden" }}>

        <div style={{ position: "absolute", top: "35%", left: "50%", transform: "translate(-50%, -50%)", width: 900, height: 600, background: "radial-gradient(ellipse at center, rgba(0,102,204,0.10) 0%, transparent 70%)", pointerEvents: "none", borderRadius: "50%" }} />

        <div style={{ maxWidth: 980, margin: "0 auto", width: "100%", position: "relative" }}>

          <div className="ap-hero-chip" style={{ display: "inline-block", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.72)", fontSize: 14, fontFamily: fft, padding: "8px 18px", borderRadius: 9999, marginBottom: 32, letterSpacing: "-0.224px", border: "1px solid rgba(255,255,255,0.12)" }}>
            AWS Cloud Security
          </div>

          <h1 style={{ fontFamily: ff, fontSize: "clamp(44px, 6vw, 64px)", fontWeight: 600, lineHeight: 1.07, letterSpacing: "-0.5px", color: "#ffffff", maxWidth: 820, margin: "0 auto 24px", overflow: "hidden" }}>
            <Words text="Find misconfigurations." baseDelay={0.18} />
            <br />
            <span style={{ color: "rgba(255,255,255,0.45)" }}>
              <Words text="Before hackers do." baseDelay={0.45} />
            </span>
          </h1>

          <p className="ap-hero-sub" style={{ fontFamily: ff, fontSize: "clamp(19px, 2.2vw, 24px)", fontWeight: 300, lineHeight: 1.5, color: C.muted, maxWidth: 540, margin: "0 auto 40px", letterSpacing: 0 }}>
            10 automated security checks. 2-minute scans. Zero setup.
          </p>

          <div className="ap-hero-ctas" style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <Link href={authenticated ? "/scans" : "/signup"} className="ap-btn" style={pill(C.primary, "#fff")}>
              {loading ? "Get Started Free" : authenticated ? "Go to Dashboard" : "Start Free Trial"}
            </Link>
            <a href="#how-it-works" className="ap-btn" style={pill("transparent", C.primaryDark, C.primaryDark)}>
              See How It Works
            </a>
          </div>

          <p className="ap-hero-fine" style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, fontFamily: fft, letterSpacing: "-0.12px", marginBottom: 72 }}>
            Free 2-week trial · No credit card · Setup in 5 minutes
          </p>

          {/* Dashboard mockup */}
          <div ref={mockupRef} className="ap-hero-mockup" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div className="ap-product-shadow" style={{ background: "#161617", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)", overflow: "hidden", textAlign: "left" }}>

              <div style={{ background: "#1c1c1e", padding: "12px 18px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
                <div style={{ flex: 1, marginLeft: 14, background: "rgba(255,255,255,0.06)", borderRadius: 7, padding: "4px 14px", fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: fft }}>
                  vigilicloud.com / scans / report
                </div>
              </div>

              <div style={{ padding: "22px 28px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", fontFamily: fft, letterSpacing: "-0.3px" }}>my-production-account</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: fft, marginTop: 3 }}>Scan completed · 1 min 48 sec · 10 checks</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[{ l: "2 Critical", c: "#f87171", b: "rgba(248,113,113,0.18)" }, { l: "4 High", c: "#fb923c", b: "rgba(251,146,60,0.18)" }, { l: "3 Medium", c: "#fbbf24", b: "rgba(251,191,36,0.18)" }].map((b) => (
                    <span key={b.l} style={{ background: b.b, color: b.c, borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, fontFamily: fft }}>{b.l}</span>
                  ))}
                </div>
              </div>

              {[
                { dot: "#f87171", label: "S3 bucket 'my-data-lake' is publicly accessible",  check: "S3 Public Access",  st: "FAIL", sc: "#f87171" },
                { dot: "#f87171", label: "Root account has active access keys",                check: "Root Access Keys",  st: "FAIL", sc: "#f87171" },
                { dot: "#fb923c", label: "IAM role has AdministratorAccess policy attached",  check: "IAM Permissions",   st: "FAIL", sc: "#fb923c" },
                { dot: "#fbbf24", label: "EBS volume vol-0a1b2c3d is not encrypted",          check: "EBS Encryption",    st: "FAIL", sc: "#fbbf24" },
                { dot: "#34d399", label: "MFA is enabled on all IAM users",                   check: "MFA Enforcement",   st: "PASS", sc: "#34d399" },
              ].map((row, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 28px", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: row.dot, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: row.st === "FAIL" ? 500 : 400, color: "#fff", fontFamily: fft }}>{row.label}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.36)", fontFamily: fft, marginTop: 2 }}>{row.check}</div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: row.sc, fontFamily: fft, flexShrink: 0 }}>{row.st}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="ap-scroll-caret" style={{ marginTop: 48, display: "flex", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 3v14M4 11l6 6 6-6" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </section>

      {/* ══ STATS STRIP ══════════════════════════════════════════════ */}
      <section style={{ background: C.parchment, padding: "72px 22px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }} className="ap-reveal">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 24, textAlign: "center" }}>
            {[
              { count: "10", suffix: "+",    label: "Security checks"  },
              { count: "2",  suffix: " min", label: "Scan time"        },
              { count: "100", suffix: "%",   label: "Read-only access" },
              { count: "24", suffix: "/7",   label: "Monitoring ready" },
            ].map((s) => (
              <div key={s.label}>
                <div style={{ fontFamily: ff, fontSize: 48, fontWeight: 600, lineHeight: 1, color: C.ink, letterSpacing: "-0.5px" }}>
                  <span data-count={s.count} data-suffix={s.suffix} data-decimals="0">{s.count}{s.suffix}</span>
                </div>
                <div style={{ fontFamily: fft, fontSize: 14, color: C.inkMuted, marginTop: 8, letterSpacing: "-0.224px" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ═════════════════════════════════════════════ */}
      <section id="how-it-works" style={{ background: C.canvas, padding: "120px 22px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div className="ap-reveal" style={{ textAlign: "center", marginBottom: 72 }}>
            <Label>How It Works</Label>
            <h2 style={{ fontFamily: ff, fontSize: "clamp(34px,4.4vw,48px)", fontWeight: 600, lineHeight: 1.08, letterSpacing: "-0.5px", color: C.ink, margin: "0 auto 18px", maxWidth: 560 }}>
              Up and running in 5 minutes.
            </h2>
            <p style={{ fontFamily: fft, fontSize: 17, fontWeight: 400, lineHeight: 1.47, color: C.inkMuted, letterSpacing: "-0.374px" }}>
              No agents, no installations, no complex setup.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: C.hairline }}>
            {STEPS.map((step, i) => (
              <div key={step.num} className={`ap-reveal ap-tile ap-d${i + 1}`} style={{ background: C.canvas, padding: "48px 36px" }}>
                <div style={{ fontFamily: ff, fontSize: 64, fontWeight: 700, color: "rgba(0,0,0,0.06)", lineHeight: 1, marginBottom: 28, letterSpacing: "-1px" }}>{step.num}</div>
                <h3 style={{ fontFamily: ff, fontSize: 21, fontWeight: 600, color: C.ink, lineHeight: 1.19, letterSpacing: "0.231px", marginBottom: 12 }}>{step.title}</h3>
                <p style={{ fontFamily: fft, fontSize: 15, fontWeight: 400, lineHeight: 1.55, color: C.inkMuted, letterSpacing: "-0.224px", marginBottom: 20 }}>{step.desc}</p>
                <span style={{ display: "inline-block", background: "rgba(0,102,204,0.07)", border: "1px solid rgba(0,102,204,0.18)", borderRadius: 9999, padding: "5px 13px", fontSize: 11, color: C.primary, fontFamily: fft, fontWeight: 500 }}>{step.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ BENTO GRID ═══════════════════════════════════════════════ */}
      <section id="features" style={{ background: C.black, padding: "120px 0 0" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 22px" }}>
          <div className="ap-reveal" style={{ textAlign: "center", marginBottom: 64 }}>
            <Label dark>Security Checks</Label>
            <h2 style={{ fontFamily: ff, fontSize: "clamp(34px,4.4vw,48px)", fontWeight: 600, lineHeight: 1.08, letterSpacing: "-0.5px", color: "#ffffff", margin: "0 auto 18px", maxWidth: 640 }}>
              10 checks. Every critical area.
            </h2>
            <p style={{ fontFamily: fft, fontSize: 17, fontWeight: 400, lineHeight: 1.47, color: C.muted, letterSpacing: "-0.374px" }}>
              Every check ships with fix guidance, the exact AWS Console path, and CLI commands.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1 }}>
          {BENTO.map((tile, i) => (
            <div key={tile.title} className={`ap-reveal ap-tile ap-d${(i % 5) + 1}`}
              style={{ gridColumn: `span ${tile.span}`, background: tile.bg, padding: "40px 36px", height: tile.height, display: "flex", flexDirection: "column", justifyContent: "space-between" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: fft, fontSize: 11, fontWeight: 600, color: tile.text === "#ffffff" ? C.primaryDark : C.primary, letterSpacing: "0.08em", background: tile.text === "#ffffff" ? "rgba(41,151,255,0.12)" : "rgba(0,102,204,0.08)", border: `1px solid ${tile.text === "#ffffff" ? "rgba(41,151,255,0.22)" : "rgba(0,102,204,0.16)"}`, padding: "3px 8px", borderRadius: 5 }}>
                  AWS
                </span>
                <SevBadge sev={tile.sev} onDark={tile.text === "#ffffff"} />
              </div>
              <div>
                <h3 style={{ fontFamily: ff, fontSize: 21, fontWeight: 600, color: tile.text, lineHeight: 1.19, letterSpacing: "0.231px", marginBottom: 10 }}>{tile.title}</h3>
                <p style={{ fontFamily: fft, fontSize: 14, fontWeight: 400, lineHeight: 1.5, color: tile.text === "#ffffff" ? "rgba(255,255,255,0.55)" : C.inkMuted, letterSpacing: "-0.224px" }}>{tile.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, marginTop: 1 }}>
          {[
            { title: "AI Security Analysis", desc: "Claude AI summarizes your findings and prioritizes what to fix first — in plain English.", bg: C.parchment, text: C.ink },
            { title: "Email Alerts",          desc: "Get notified the moment a critical misconfiguration is found in your account.",           bg: C.canvas,    text: C.ink },
            { title: "Compliance Exports",    desc: "Export findings as CSV or JSON for SOC2, ISO 27001, and audit evidence packages.",        bg: C.parchment, text: C.ink },
          ].map((f, i) => (
            <div key={f.title} className={`ap-reveal ap-tile ap-d${i + 1}`} style={{ background: f.bg, padding: "40px 36px", height: 220 }}>
              <h3 style={{ fontFamily: ff, fontSize: 21, fontWeight: 600, color: f.text, lineHeight: 1.19, letterSpacing: "0.231px", marginBottom: 10 }}>{f.title}</h3>
              <p style={{ fontFamily: fft, fontSize: 14, color: C.inkMuted, lineHeight: 1.5, letterSpacing: "-0.224px" }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══ SECURITY INSIGHTS ════════════════════════════════════════ */}
      <section id="stats" style={{ background: C.parchment, padding: "120px 22px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div className="ap-reveal" style={{ textAlign: "center", marginBottom: 72 }}>
            <Label>Security Insights</Label>
            <h2 style={{ fontFamily: ff, fontSize: "clamp(34px,4.4vw,48px)", fontWeight: 600, lineHeight: 1.08, letterSpacing: "-0.5px", color: C.ink, margin: "0 auto 18px" }}>
              What we find in a typical AWS scan.
            </h2>
            <p style={{ fontFamily: fft, fontSize: 17, fontWeight: 400, lineHeight: 1.47, color: C.inkMuted, letterSpacing: "-0.374px", maxWidth: 500, margin: "0 auto" }}>
              Most AWS accounts have more security gaps than they realize.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }} className="ap-reveal">
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <svg viewBox="0 0 120 120" style={{ width: 240, height: 240 }}>
                <circle cx="60" cy="60" r="45" fill="none" stroke={C.divider}  strokeWidth="15" />
                <circle cx="60" cy="60" r="45" fill="none" stroke="#dc2626" strokeWidth="15" strokeLinecap="round" strokeDasharray="57.2 225.54"  strokeDashoffset="70.69"   />
                <circle cx="60" cy="60" r="45" fill="none" stroke="#ea580c" strokeWidth="15" strokeLinecap="round" strokeDasharray="93.96 188.78" strokeDashoffset="8.49"    />
                <circle cx="60" cy="60" r="45" fill="none" stroke="#b45309" strokeWidth="15" strokeLinecap="round" strokeDasharray="74.17 208.57" strokeDashoffset="-90.47"  />
                <circle cx="60" cy="60" r="45" fill="none" stroke="#9ca3af" strokeWidth="15" strokeLinecap="round" strokeDasharray="37.41 245.33" strokeDashoffset="-169.64" />
                <text x="60" y="53" textAnchor="middle" fill={C.ink}     fontSize="20" fontWeight="600" fontFamily={ff}>14</text>
                <text x="60" y="67" textAnchor="middle" fill={C.inkMuted} fontSize="7.5"               fontFamily={fft}>avg findings</text>
              </svg>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 32px", marginTop: 20, width: "100%", maxWidth: 260 }}>
                {[{ l: "Critical", p: "22%", c: "#dc2626" }, { l: "High", p: "35%", c: "#ea580c" }, { l: "Medium", p: "28%", c: "#b45309" }, { l: "Low", p: "15%", c: "#9ca3af" }].map((item) => (
                  <div key={item.l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.c, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: item.c, fontFamily: fft }}>{item.l}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: C.inkMuted, fontFamily: fft }}>{item.p}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {[
                { v: "78%",    label: "Accounts with at least one critical finding",   icon: "⚠️" },
                { v: "14",     label: "Average security findings per account scan",     icon: "📊" },
                { v: "#1",     label: "S3 misconfiguration — the most common finding", icon: "🪣" },
                { v: "~1 day", label: "Average fix time with step-by-step guidance",   icon: "⚡" },
              ].map((stat, i) => (
                <div key={stat.v} className={`ap-reveal ap-tile ap-d${i + 1}`} style={{ background: C.canvas, border: `1px solid ${C.hairline}`, borderRadius: 18, padding: "28px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 26, marginBottom: 10 }}>{stat.icon}</div>
                  <div style={{ fontFamily: ff, fontSize: 32, fontWeight: 600, color: C.ink, letterSpacing: "-0.5px" }}>{stat.v}</div>
                  <p style={{ fontFamily: fft, fontSize: 12, color: C.inkMuted, lineHeight: 1.45, marginTop: 8, letterSpacing: "-0.12px" }}>{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ PRICING ══════════════════════════════════════════════════ */}
      <section id="pricing" style={{ background: C.tile1, padding: "120px 22px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div className="ap-reveal" style={{ textAlign: "center", marginBottom: 72 }}>
            <Label dark>Pricing</Label>
            <h2 style={{ fontFamily: ff, fontSize: "clamp(34px,4.4vw,48px)", fontWeight: 600, lineHeight: 1.08, letterSpacing: "-0.5px", color: "#ffffff", margin: "0 auto 18px" }}>
              Simple, transparent pricing.
            </h2>
            <p style={{ fontFamily: fft, fontSize: 17, fontWeight: 400, lineHeight: 1.47, color: C.muted, letterSpacing: "-0.374px" }}>
              2-week free trial on all plans. Billed in INR · USD shown for reference.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
            {PLANS.map((plan, i) => (
              <div key={plan.key} className={`ap-reveal ap-tile ap-d${i + 1}`} style={{ background: C.canvas, borderRadius: 20, padding: "36px 28px", border: plan.hot ? `2px solid ${C.primary}` : `1px solid ${C.hairline}`, position: "relative" }}>
                {plan.hot && (
                  <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", background: C.primary, color: "#fff", fontSize: 11, fontWeight: 600, padding: "4px 16px", borderRadius: 9999, fontFamily: fft, whiteSpace: "nowrap" }}>Most Popular</div>
                )}
                <div style={{ fontFamily: fft, fontSize: 12, fontWeight: 600, color: C.inkMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>{plan.name}</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 4 }}>
                  <span style={{ fontFamily: ff, fontSize: 44, fontWeight: 600, color: C.ink, letterSpacing: "-0.5px", lineHeight: 1 }}>{plan.usd}</span>
                  <span style={{ fontFamily: fft, fontSize: 17, color: C.inkMuted, marginBottom: 4 }}>/mo</span>
                </div>
                <div style={{ fontFamily: fft, fontSize: 12, color: C.inkSoft, marginBottom: 14 }}>{plan.inr}/mo · INR approx.</div>
                <p style={{ fontFamily: fft, fontSize: 14, color: C.inkMuted, lineHeight: 1.5, marginBottom: 24, letterSpacing: "-0.224px" }}>{plan.desc}</p>
                <div style={{ borderTop: `1px solid ${C.divider}`, paddingTop: 22, marginBottom: 28 }}>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                    {plan.features.map((f) => (
                      <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontFamily: fft, fontSize: 14, color: C.ink, letterSpacing: "-0.224px", lineHeight: 1.4 }}>
                        <span style={{ color: C.primary, fontWeight: 700, flexShrink: 0, fontSize: 13, marginTop: 1 }}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <Link href={plan.key === "msp" ? "#contact" : "/signup"} className="ap-btn" style={{ ...pill(plan.hot ? C.primary : "transparent", plan.hot ? "#fff" : C.primary, plan.hot ? undefined : C.primary), display: "block", textAlign: "center" }}>
                  {plan.key === "msp" ? "Contact Us" : "Start Free Trial"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ TESTIMONIALS ═════════════════════════════════════════════ */}
      <section id="testimonials" style={{ background: C.canvas, padding: "120px 22px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div className="ap-reveal" style={{ textAlign: "center", marginBottom: 72 }}>
            <Label>Testimonials</Label>
            <h2 style={{ fontFamily: ff, fontSize: "clamp(34px,4.4vw,48px)", fontWeight: 600, lineHeight: 1.08, letterSpacing: "-0.5px", color: C.ink }}>
              Trusted by AWS teams worldwide.
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: C.hairline }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={t.name} className={`ap-reveal ap-tile ap-d${i + 1}`} style={{ background: C.canvas, padding: "44px 36px" }}>
                <div style={{ display: "flex", gap: 3, marginBottom: 24 }}>
                  {[...Array(5)].map((_, s) => <span key={s} style={{ color: C.primary, fontSize: 15 }}>★</span>)}
                </div>
                <p style={{ fontFamily: fft, fontSize: 17, fontWeight: 400, lineHeight: 1.47, color: C.ink, letterSpacing: "-0.374px", marginBottom: 28 }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 14, borderTop: `1px solid ${C.divider}`, paddingTop: 24 }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.parchment, border: `1px solid ${C.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16, fontWeight: 600, color: C.ink, fontFamily: ff }}>
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

      {/* ══ DEMO + CONTACT ═══════════════════════════════════════════ */}
      <section style={{ background: C.parchment, padding: "120px 22px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "start" }} className="ap-reveal">

          <div id="demo">
            <Label>Book a Demo</Label>
            <h2 style={{ fontFamily: ff, fontSize: "clamp(28px,3.6vw,40px)", fontWeight: 600, lineHeight: 1.1, letterSpacing: "-0.5px", color: C.ink, marginBottom: 18 }}>
              See VigiliCloud live.
            </h2>
            <p style={{ fontFamily: fft, fontSize: 17, fontWeight: 400, lineHeight: 1.47, color: C.inkMuted, letterSpacing: "-0.374px", marginBottom: 28 }}>
              Free 25-minute walkthrough — live AWS scan, findings review, and remediation on your actual account.
            </p>
            <ul style={{ listStyle: "none", margin: "0 0 28px", padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {["Live AWS scan on your account", "Walk through every critical finding", "Show you how to fix each issue", "Answer all your questions"].map((item) => (
                <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: fft, fontSize: 15, color: C.ink, letterSpacing: "-0.224px" }}>
                  <span style={{ color: C.primary, fontWeight: 700, fontSize: 14, flexShrink: 0 }}>✓</span>{item}
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", gap: 16, fontSize: 13, color: C.inkMuted, fontFamily: fft, flexWrap: "wrap", marginBottom: 32 }}>
              {["Mon–Fri", "9am–12pm CST", "25 minutes", "Google Meet"].map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
            <a href="https://calendly.com/leelakrishnakoppolu/vigilicloud-demo" target="_blank" rel="noopener noreferrer" className="ap-btn" style={pill(C.primary, "#fff")}>
              Book Free Demo
            </a>
          </div>

          <div id="contact">
            <Label>Get in Touch</Label>
            <h2 style={{ fontFamily: ff, fontSize: "clamp(28px,3.6vw,40px)", fontWeight: 600, lineHeight: 1.1, letterSpacing: "-0.5px", color: C.ink, marginBottom: 24 }}>
              Questions? We reply within 24 hours.
            </h2>

            {contactSent ? (
              <div style={{ background: "rgba(0,102,204,0.06)", border: "1px solid rgba(0,102,204,0.2)", borderRadius: 14, padding: 28, textAlign: "center", color: C.primary, fontFamily: fft, fontSize: 15, lineHeight: 1.5 }}>
                Thanks! We&apos;ll get back to you within 24 hours.
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); setContactSent(true); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontFamily: fft, fontSize: 14, color: C.inkMuted, marginBottom: 7, letterSpacing: "-0.224px" }}>Your email</label>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
                    style={{ width: "100%", border: `1px solid ${C.hairline}`, background: C.canvas, borderRadius: 9999, padding: "13px 20px", fontSize: 17, color: C.ink, fontFamily: fft, outline: "none", letterSpacing: "-0.374px", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontFamily: fft, fontSize: 14, color: C.inkMuted, marginBottom: 7, letterSpacing: "-0.224px" }}>Message</label>
                  <textarea required rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us about your AWS setup..."
                    style={{ width: "100%", border: `1px solid ${C.hairline}`, background: C.canvas, borderRadius: 14, padding: "13px 20px", fontSize: 17, color: C.ink, fontFamily: fft, outline: "none", letterSpacing: "-0.374px", resize: "none", boxSizing: "border-box" }}
                  />
                </div>
                <button type="submit" className="ap-btn" style={{ ...pill(C.primary, "#fff"), border: "none", cursor: "pointer", textAlign: "center" }}>
                  Send Message
                </button>
              </form>
            )}

            <p style={{ marginTop: 16, fontSize: 12, color: C.inkMuted, fontFamily: fft, letterSpacing: "-0.12px", textAlign: "center" }}>
              Or email: <a href="mailto:leelakrishnakoppolu@gmail.com" style={{ color: C.primary }}>leelakrishnakoppolu@gmail.com</a>
            </p>
          </div>
        </div>
      </section>

      {/* ══ CTA BANNER ═══════════════════════════════════════════════ */}
      <section style={{ background: C.tile2, padding: "120px 22px", textAlign: "center" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }} className="ap-reveal">
          <h2 style={{ fontFamily: ff, fontSize: "clamp(34px,4.4vw,48px)", fontWeight: 600, lineHeight: 1.08, letterSpacing: "-0.5px", color: "#ffffff", marginBottom: 18 }}>
            Start securing your AWS today.
          </h2>
          <p style={{ fontFamily: fft, fontSize: 17, fontWeight: 400, lineHeight: 1.47, color: C.muted, letterSpacing: "-0.374px", marginBottom: 40 }}>
            Free 2-week trial · No credit card · Setup in 5 minutes
          </p>
          <Link href="/signup" className="ap-btn" style={pill(C.primary, "#fff")}>Start Free Trial</Link>
        </div>
      </section>

      {/* ══ FOOTER ═══════════════════════════════════════════════════ */}
      <footer style={{ background: C.parchment, padding: "64px 22px 48px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 48, marginBottom: 48 }}>
            <div>
              <Link href="/" style={{ fontFamily: ff, fontSize: 17, fontWeight: 600, color: C.ink, textDecoration: "none", letterSpacing: "-0.374px", display: "block", marginBottom: 12 }}>
                VigiliCloud
              </Link>
              <p style={{ fontFamily: fft, fontSize: 14, color: C.inkMuted, lineHeight: 1.5, maxWidth: 280, letterSpacing: "-0.224px" }}>
                AWS security scanning for teams that can&apos;t afford to miss a misconfiguration.
              </p>
            </div>
            {[
              { heading: "Product", links: [{ l: "Features", h: "#features" }, { l: "Pricing", h: "#pricing" }, { l: "Book a Demo", h: "#demo" }, { l: "Get Started", h: "/onboarding" }] },
              { heading: "Company", links: [{ l: "About", h: "#contact" }, { l: "Contact", h: "#contact" }, { l: "Support", h: "mailto:leelakrishnakoppolu@gmail.com" }, { l: "Sign In", h: "/signin" }] },
            ].map((col) => (
              <div key={col.heading}>
                <div style={{ fontFamily: fft, fontSize: 12, fontWeight: 600, color: C.ink, letterSpacing: "-0.12px", marginBottom: 16 }}>{col.heading}</div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {col.links.map((l) => (
                    <li key={l.l}>
                      <a href={l.h} style={{ fontFamily: fft, fontSize: 17, color: C.inkMuted, textDecoration: "none", lineHeight: 2.41, letterSpacing: 0, display: "block" }}>
                        {l.l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${C.hairline}`, paddingTop: 24 }}>
            <p style={{ fontFamily: fft, fontSize: 12, color: "#7a7a7a", letterSpacing: "-0.12px" }}>© 2026 VigiliCloud. All rights reserved.</p>
          </div>
        </div>
      </footer>

    </div>
  );
}
