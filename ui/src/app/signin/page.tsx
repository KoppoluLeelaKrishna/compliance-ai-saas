"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";

export default function SignInPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [slowWarning, setSlowWarning] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSlowWarning(false);
    setLoading(true);
    const timer = setTimeout(() => setSlowWarning(true), 5000);
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
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
    <div className="flex min-h-[calc(100vh-140px)] items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-lg font-black text-emerald-400">
              V
            </div>
            <span className="text-xl font-black tracking-tight">VigiliCloud</span>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-neutral-400">Sign in to your workspace</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
          {slowWarning && (
            <div className="mb-5 rounded-2xl border border-yellow-800/60 bg-yellow-950/40 px-4 py-3 text-sm text-yellow-300">
              The server is starting up — this can take up to a minute on first use. Please wait&hellip;
            </div>
          )}

          {error && (
            <div className="mb-5 rounded-2xl border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-300">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-colors"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-300">
                Password
              </label>
              <div className="flex gap-2">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="rounded-2xl border border-white/10 px-4 text-sm text-neutral-400 hover:bg-white/5 transition-colors"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-2xl bg-emerald-500 px-5 py-3.5 font-semibold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-neutral-500">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
              Sign up
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-600">
          By signing in you agree to our terms of service.
        </p>
      </div>
    </div>
  );
}
