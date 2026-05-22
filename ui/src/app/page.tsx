"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { AuthMe } from "@/types";

/* ── Scroll-reveal hook ─────────────────────────────────── */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal,.reveal-zoom,.reveal-left,.reveal-right");
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.12 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

/* ── Data ───────────────────────────────────────────────── */
const FEATURES = [
  { icon: "🪣", title: "S3 Public Access",    desc: "Detects open buckets, public ACLs, and exposed bucket policies." },
  { icon: "🔐", title: "IAM Permissions",     desc: "Flags over-permissioned roles and users with unnecessary admin access." },
  { icon: "📱", title: "MFA Enforcement",     desc: "Checks every IAM user and root account for missing MFA." },
  { icon: "🔑", title: "Root Access Keys",    desc: "Alerts if root account has active access keys — a critical risk." },
  { icon: "🛡️", title: "Security Groups",    desc: "Finds EC2 security groups with ports open to the entire internet." },
  { icon: "💾", title: "EBS Encryption",      desc: "Identifies unencrypted EBS volumes and missing default encryption." },
  { icon: "🗄️", title: "RDS Encryption",     desc: "Checks RDS instances for unencrypted storage and public accessibility." },
  { icon: "📋", title: "CloudTrail Logging",  desc: "Verifies CloudTrail is active, multi-region, and log-validated." },
  { icon: "🌐", title: "VPC Flow Logs",       desc: "Ensures network traffic is logged for security and forensics." },
  { icon: "🔄", title: "KMS Key Rotation",    desc: "Checks that customer-managed KMS keys auto-rotate." },
];

const STEPS = [
  { num: "01", title: "Connect your AWS account",  desc: "Create a read-only IAM role and paste the ARN. We never store credentials — access is assumed temporarily per scan.", detail: "Takes 5 minutes. Any AWS account." },
  { num: "02", title: "Run a security scan",       desc: "Click Run Scan. VigiliCloud checks all 10 security areas and returns findings in ~2 minutes.", detail: "No agents. No installations." },
  { num: "03", title: "Fix what's wrong",          desc: "Every finding includes the exact AWS Console path, CLI commands, and step-by-step remediation.", detail: "Export evidence as CSV or JSON." },
];

const PLANS = [
  { key: "starter", name: "Starter", inr: "₹8,299", usd: "$99",  period: "/mo", desc: "For solo consultants and small teams.", features: ["Up to 3 AWS accounts", "All 10 security checks", "Fix guidance & remediation", "CSV / JSON exports", "Email alerts"], cta: "Start Free Trial", hot: false },
  { key: "pro",     name: "Pro",     inr: "₹24,999", usd: "$299", period: "/mo", desc: "For teams managing multiple AWS environments.", features: ["Up to 10 AWS accounts", "Everything in Starter", "AI security analysis", "Scheduled daily scans", "Priority support"], cta: "Start Free Trial", hot: true  },
  { key: "msp",     name: "MSP",     inr: "₹83,499", usd: "$999", period: "/mo", desc: "For agencies and managed service providers.", features: ["Unlimited AWS accounts", "Everything in Pro", "Multi-customer workflows", "High-volume scanning", "White-label ready"], cta: "Contact Us",    hot: false },
];

const TESTIMONIALS = [
  { quote: "VigiliCloud found 6 critical misconfigurations in our production AWS account that we had no idea about. Fixed them all in an afternoon.", name: "Rahul M.",  role: "CTO, SaaS Startup",    loc: "Bangalore, India" },
  { quote: "As an AWS consultant I scan client accounts regularly. This cuts my security review from 2 days to 2 minutes. Game changer.",            name: "Priya S.", role: "AWS Consultant",        loc: "Hyderabad, India" },
  { quote: "We needed to pass a security audit for an enterprise deal. VigiliCloud gave us the evidence exports we needed to close.",                  name: "James T.", role: "VP Engineering",        loc: "Austin, Texas"    },
];

const TICKER_ITEMS = ["S3 Public Access","IAM Permissions","MFA Enforcement","Root Access Keys","Security Groups","EBS Encryption","RDS Encryption","CloudTrail Logging","VPC Flow Logs","KMS Key Rotation"];

/* ── Page ───────────────────────────────────────────────── */
export default function HomePage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contactSent, setContactSent] = useState(false);
  const [email, setEmail] = useState("");

  useReveal();

  useEffect(() => {
    api<AuthMe>("/auth/me")
      .then((a) => setAuthenticated(!!a.authenticated))
      .catch(() => setAuthenticated(false))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-black text-white">

      {/* ── HERO ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 pb-28 pt-20 text-center">
        {/* animated background glow */}
        <div className="hero-glow pointer-events-none absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-emerald-500 blur-[120px]" />

        <div className="relative mx-auto max-w-5xl">
          <div className="reveal glow-badge mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-sm text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Now live — 10 AWS security checks, zero setup
          </div>

          <h1 className="reveal delay-100 mx-auto max-w-4xl text-5xl font-black leading-tight tracking-tight md:text-7xl">
            Find AWS misconfigurations
            <br />
            <span className="glow-text text-emerald-400">before hackers do</span>
          </h1>

          <p className="reveal delay-200 mx-auto mt-6 max-w-2xl text-lg leading-8 text-neutral-400">
            VigiliCloud scans your AWS account in 2 minutes and shows every security gap — with exact fix steps, CLI commands, and exportable compliance evidence.
          </p>

          <div className="reveal delay-300 mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href={authenticated ? "/scans" : "/signup"}
              className="glow-btn rounded-2xl bg-emerald-500 px-8 py-4 text-lg font-bold text-black transition-all hover:bg-emerald-400"
            >
              {loading ? "Get Started Free →" : authenticated ? "Go to Dashboard →" : "Start Free Trial →"}
            </Link>
            <a href="#how-it-works" className="rounded-2xl border border-white/15 px-8 py-4 text-lg font-medium hover:bg-white/5 transition-colors">
              See How It Works
            </a>
          </div>
          <p className="reveal delay-400 mt-4 text-sm text-neutral-600">Free 2-week trial · No credit card · Setup in 5 minutes</p>

          {/* Stats */}
          <div className="reveal delay-500 mt-16 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[{ v: "10+", l: "Security checks" },{ v: "2 min", l: "Scan time" },{ v: "100%", l: "Read-only access" },{ v: "24/7", l: "Monitoring" }].map((s) => (
              <div key={s.l} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 backdrop-blur-sm">
                <div className="text-3xl font-black text-emerald-400">{s.v}</div>
                <div className="mt-1 text-sm text-neutral-500">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GLOW DIVIDER ──────────────────────────────────── */}
      <div className="px-6"><hr className="glow-line" /></div>

      {/* ── TICKER ────────────────────────────────────────── */}
      <div className="border-y border-white/10 bg-white/[0.02] py-4 overflow-hidden">
        <div className="marquee-track flex gap-8 whitespace-nowrap w-max">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="text-sm font-medium text-neutral-500 flex items-center gap-2">
              <span className="text-emerald-500">✓</span> {item}
            </span>
          ))}
        </div>
      </div>

      {/* ── HOW IT WORKS ──────────────────────────────────── */}
      <section id="how-it-works" className="scroll-mt-8 border-t border-white/10 px-6 py-28">
        <div className="mx-auto max-w-5xl">
          <div className="reveal text-center">
            <div className="glow-text-sm mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-400">How It Works</div>
            <h2 className="text-4xl font-black md:text-5xl">Up and running in 5 minutes</h2>
            <p className="mx-auto mt-4 max-w-xl text-neutral-400">No agents, no installations, no complex setup.</p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div
                key={step.num}
                className={`reveal-zoom glow-card delay-${(i + 1) * 100} relative rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-transparent p-8`}
              >
                <div className="mb-4 text-6xl font-black text-emerald-500/20">{step.num}</div>
                <h3 className="text-xl font-bold">{step.title}</h3>
                <p className="mt-3 leading-7 text-neutral-400">{step.desc}</p>
                <p className="mt-4 text-sm font-medium text-emerald-400">{step.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────── */}
      <section id="features" className="scroll-mt-8 border-t border-white/10 bg-white/[0.02] px-6 py-28">
        <div className="mx-auto max-w-5xl">
          <div className="reveal text-center">
            <div className="glow-text-sm mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-400">Security Checks</div>
            <h2 className="text-4xl font-black md:text-5xl">10 checks across your entire AWS account</h2>
            <p className="mx-auto mt-4 max-w-xl text-neutral-400">Every check comes with fix guidance, console path, and CLI commands.</p>
          </div>

          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`reveal delay-${Math.min((i % 3 + 1) * 100, 300)} group rounded-2xl border border-white/10 bg-black p-6 hover:border-emerald-500/40 hover:bg-emerald-500/[0.04] transition-all`}
              >
                <div className="mb-3 text-3xl transition-transform group-hover:scale-110">{f.icon}</div>
                <h3 className="font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-400">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Extra features */}
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              { icon: "🤖", title: "AI Security Analysis",  desc: "Claude AI summarizes findings and prioritizes what to fix first." },
              { icon: "📧", title: "Email Alerts",          desc: "Get notified immediately when critical issues are found." },
              { icon: "📁", title: "Compliance Exports",    desc: "Export as CSV or JSON for SOC2, ISO 27001, and audit evidence." },
            ].map((f, i) => (
              <div key={f.title} className={`reveal-zoom delay-${(i + 1) * 100} rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6`}>
                <div className="mb-3 text-3xl">{f.icon}</div>
                <h3 className="font-bold text-emerald-300">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────── */}
      <section id="pricing" className="scroll-mt-8 border-t border-white/10 px-6 py-28">
        <div className="mx-auto max-w-5xl">
          <div className="reveal text-center">
            <div className="glow-text-sm mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-400">Pricing</div>
            <h2 className="text-4xl font-black md:text-5xl">Simple, transparent pricing</h2>
            <p className="mx-auto mt-4 max-w-xl text-neutral-400">
              2-week free trial on all plans. Billed in INR · USD shown for reference.
            </p>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {PLANS.map((plan, i) => (
              <div
                key={plan.key}
                className={`reveal-zoom delay-${(i + 1) * 100} relative rounded-3xl border p-8 transition-all ${
                  plan.hot ? "glow-border-strong border-emerald-500/50 bg-gradient-to-b from-emerald-500/10 to-transparent" : "glow-card border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                {plan.hot && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-1 text-xs font-bold text-black shadow-lg shadow-emerald-500/30">
                    Most Popular
                  </div>
                )}
                <div className="text-sm font-semibold text-neutral-400">{plan.name}</div>
                <div className="mt-2 flex items-end gap-1">
                  <span className="text-4xl font-black">{plan.usd}</span>
                  <span className="mb-1 text-neutral-500">{plan.period}</span>
                </div>
                <div className="text-xs text-neutral-600">{plan.inr}/mo · billed in INR · approx.</div>
                <p className="mt-4 text-sm text-neutral-400">{plan.desc}</p>
                <ul className="mt-6 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-neutral-300">
                      <span className="mt-0.5 text-emerald-400">✓</span>{f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.key === "msp" ? "#contact" : "/signup"}
                  className={`mt-8 block w-full rounded-2xl py-3 text-center font-bold transition-all ${
                    plan.hot ? "bg-emerald-500 text-black hover:bg-emerald-400 shadow-lg shadow-emerald-500/20" : "border border-white/20 hover:bg-white/10"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ──────────────────────────────────── */}
      <section id="testimonials" className="scroll-mt-8 border-t border-white/10 bg-white/[0.02] px-6 py-28">
        <div className="mx-auto max-w-5xl">
          <div className="reveal text-center">
            <div className="glow-text-sm mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-400">Testimonials</div>
            <h2 className="text-4xl font-black md:text-5xl">Trusted by AWS teams worldwide</h2>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <div
                key={t.name}
                className={`reveal delay-${(i + 1) * 100} rounded-3xl border border-white/10 bg-black p-8 hover:border-white/20 transition-colors`}
              >
                <div className="mb-4 text-3xl text-emerald-500">"</div>
                <p className="italic leading-7 text-neutral-300">"{t.quote}"</p>
                <div className="mt-6 border-t border-white/10 pt-4">
                  <div className="font-bold">{t.name}</div>
                  <div className="text-sm text-neutral-500">{t.role}</div>
                  <div className="mt-0.5 text-xs text-neutral-600">{t.loc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTACT ───────────────────────────────────────── */}
      <section id="contact" className="scroll-mt-8 border-t border-white/10 px-6 py-28">
        <div className="mx-auto max-w-2xl">
          <div className="reveal text-center">
            <div className="glow-text-sm mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-400">Contact</div>
            <h2 className="text-4xl font-black md:text-5xl">Get in touch</h2>
            <p className="mt-4 text-neutral-400">Questions, demo requests, or custom plans — we reply within 24 hours.</p>
          </div>

          <div className="reveal mt-10 rounded-3xl border border-white/10 bg-white/5 p-8">
            {contactSent ? (
              <div className="rounded-2xl border border-emerald-700 bg-emerald-950/40 p-6 text-center text-emerald-300">
                Thanks! We'll get back to you within 24 hours.
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); setContactSent(true); }} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm text-neutral-400">Your email</label>
                  <input
                    type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder-neutral-600 focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-neutral-400">Message</label>
                  <textarea
                    required rows={4} placeholder="Tell us about your AWS setup or what you're looking for..."
                    className="w-full resize-none rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder-neutral-600 focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>
                <button type="submit" className="w-full rounded-2xl bg-emerald-500 py-3 font-bold text-black hover:bg-emerald-400 transition-colors">
                  Send Message
                </button>
              </form>
            )}
            <p className="mt-6 text-center text-sm text-neutral-600">
              Or email:{" "}
              <a href="mailto:leelakrishnakoppolu@gmail.com" className="text-emerald-400 hover:underline">
                leelakrishnakoppolu@gmail.com
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-white/10 px-6 py-24 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(16,185,129,0.07)_0%,_transparent_60%)]" />
        <div className="reveal relative mx-auto max-w-3xl">
          <h2 className="text-4xl font-black md:text-5xl">Start securing your AWS today</h2>
          <p className="mt-4 text-neutral-400">Free 2-week trial · No credit card · Setup in 5 minutes</p>
          <Link
            href="/signup"
            className="glow-btn mt-8 inline-block rounded-2xl bg-emerald-500 px-10 py-4 text-lg font-bold text-black transition-all hover:bg-emerald-400"
          >
            Start Free Trial →
          </Link>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────── */}
      <footer className="border-t border-white/10 bg-black px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-10 md:grid-cols-[2fr_1fr_1fr]">
            {/* Brand */}
            <div>
              <Link href="/" className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-base font-black text-emerald-400">V</div>
                <div>
                  <div className="text-lg font-black tracking-tight leading-none">VigiliCloud</div>
                  <div className="text-[9px] uppercase tracking-widest text-neutral-500 font-semibold">AWS Compliance</div>
                </div>
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-6 text-neutral-600">
                AWS security scanning for teams that can't afford to miss a misconfiguration.
              </p>
              <p className="mt-6 text-xs text-neutral-700">© 2026 VigiliCloud. All rights reserved.</p>
            </div>

            {/* Product */}
            <div>
              <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-500">Product</div>
              <ul className="space-y-3 text-sm text-neutral-400">
                <li><a href="#features"      className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing"       className="hover:text-white transition-colors">Pricing</a></li>
                <li><Link href="/scans"      className="hover:text-white transition-colors">Dashboard</Link></li>
                <li><Link href="/onboarding" className="hover:text-white transition-colors">Get Started</Link></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-500">Company</div>
              <ul className="space-y-3 text-sm text-neutral-400">
                <li><a href="#contact"                                 className="hover:text-white transition-colors">About</a></li>
                <li><a href="#contact"                                 className="hover:text-white transition-colors">Contact</a></li>
                <li><a href="mailto:leelakrishnakoppolu@gmail.com"     className="hover:text-white transition-colors">Support</a></li>
                <li><Link href="/signin"                               className="hover:text-white transition-colors">Sign In</Link></li>
              </ul>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
