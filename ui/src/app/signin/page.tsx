"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

const FEATURES = [
  "10 AWS security checks in one scan",
  "Fix guidance with exact CLI commands",
  "AI-powered security analysis",
  "PDF evidence packs for audits",
  "Email alerts on CRITICAL findings",
];

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [slowWarning, setSlowWarning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get("error");
    if (e === "github_failed") setError("GitHub sign-in failed. Please try again or use email.");
    if (e === "github_not_configured") setError("GitHub sign-in is not yet enabled.");
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSlowWarning(false);
    setLoading(true);
    const timer = setTimeout(() => setSlowWarning(true), 5000);
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      router.push("/scans");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      clearTimeout(timer);
      setLoading(false);
      setSlowWarning(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-80px)]">

      {/* ── Left panel (hidden on mobile) ──────────────────────────────── */}
      <div className="relative hidden overflow-hidden lg:flex lg:w-[42%] lg:flex-col lg:justify-between bg-gradient-to-b from-emerald-500/[0.07] via-transparent to-transparent border-r border-white/[0.06] p-10">
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/[0.07] blur-3xl" />
        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-base font-black text-emerald-400">V</div>
            <span className="text-lg font-black tracking-tight">VigiliCloud</span>
          </Link>
          <div className="mt-12">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-emerald-500">AWS Security Posture</div>
            <h2 className="text-3xl font-black leading-tight">Find misconfigurations before hackers do.</h2>
            <p className="mt-4 text-sm leading-6 text-neutral-500">Connect your AWS account, run a scan in 2 minutes, and get exact remediation steps for every finding.</p>
          </div>
          <ul className="mt-8 space-y-3">
            {FEATURES.map(f => (
              <li key={f} className="flex items-center gap-3 text-sm text-neutral-400">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[9px] text-emerald-400">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-xs text-neutral-700">© 2026 VigiliCloud</div>
      </div>

      {/* ── Right panel — form ──────────────────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">

          {/* Logo (mobile only) */}
          <div className="mb-8 lg:hidden text-center">
            <Link href="/" className="inline-flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-base font-black text-emerald-400">V</div>
              <span className="text-lg font-black tracking-tight">VigiliCloud</span>
            </Link>
          </div>

          <div className="mb-7">
            <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-neutral-500">Sign in to your workspace</p>
          </div>

          {slowWarning && (
            <div className="mb-5 rounded-2xl border border-yellow-500/20 bg-yellow-500/[0.07] px-4 py-3 text-sm text-yellow-300">
              Server is starting up — can take up to a minute on first use. Please wait…
            </div>
          )}

          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-sm text-red-300">
              <span className="mt-0.5">✕</span><span>{error}</span>
            </div>
          )}

          <a
            href={`${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"}/auth/github`}
            className="mb-4 flex w-full items-center justify-center gap-2.5 rounded-2xl border border-white/[0.10] bg-white/[0.04] py-3 text-sm font-medium text-white hover:bg-white/[0.08] transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Continue with GitHub
          </a>

          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-600">or</span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="w-full rounded-xl border border-white/[0.07] bg-black/40 px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-emerald-500/40 focus:outline-none transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Password</label>
              <div className="flex gap-2">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-white/[0.07] bg-black/40 px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-emerald-500/40 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="rounded-xl border border-white/[0.07] px-3 text-xs text-neutral-400 hover:bg-white/[0.05] hover:text-white transition-colors"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full rounded-2xl bg-emerald-500 py-3 font-bold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-neutral-500">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-emerald-400 hover:text-emerald-300 transition-colors">Sign up</Link>
          </p>
          <p className="mt-4 text-center text-xs text-neutral-700">By signing in you agree to our terms of service.</p>
        </div>
      </div>
    </div>
  );
}
