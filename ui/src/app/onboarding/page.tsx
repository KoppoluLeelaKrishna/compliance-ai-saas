"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { AuthMe } from "@/types";

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { num: 1 as Step, label: "Welcome" },
  { num: 2 as Step, label: "Connect AWS" },
  { num: 3 as Step, label: "Run Scan" },
  { num: 4 as Step, label: "Results" },
];

const REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "ap-south-1", "ap-southeast-1", "ap-southeast-2",
  "ap-northeast-1", "eu-west-1", "eu-central-1",
];

const inputCls = "w-full rounded-xl border border-white/[0.07] bg-black/40 px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-emerald-500/40 focus:outline-none transition-colors";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [userName, setUserName] = useState("there");
  const [loading, setLoading] = useState(true);

  const [customerName, setCustomerName]   = useState("");
  const [accountName, setAccountName]     = useState("");
  const [awsAccountId, setAwsAccountId]   = useState("");
  const [roleArn, setRoleArn]             = useState("");
  const [region, setRegion]               = useState("us-east-1");
  const [connecting, setConnecting]       = useState(false);
  const [connectedAccountId, setConnectedAccountId] = useState<number | null>(null);
  const [connectError, setConnectError]   = useState("");

  const [scanning, setScanning]   = useState(false);
  const [scanId, setScanId]       = useState("");
  const [scanCount, setScanCount] = useState(0);
  const [scanError, setScanError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const auth = await api<AuthMe>("/auth/me");
        if (!auth.authenticated) { router.push("/signin"); return; }
        setUserName(auth.user?.name?.split(" ")[0] || "there");
      } catch {
        router.push("/signin");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleConnect(e: FormEvent) {
    e.preventDefault();
    setConnecting(true);
    setConnectError("");
    try {
      const data = await api<{ account: { id: number } }>("/accounts", {
        method: "POST",
        body: JSON.stringify({ customer_name: customerName, account_name: accountName, aws_account_id: awsAccountId, role_arn: roleArn, region, is_active: true }),
      });
      setConnectedAccountId(data.account.id);
      setStep(3);
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : "Failed to connect account");
    } finally {
      setConnecting(false);
    }
  }

  async function handleScan() {
    setScanning(true);
    setScanError("");
    try {
      const data = await api<{ scan_id: string; count: number }>("/scans/run", {
        method: "POST",
        body: JSON.stringify({ account_id: connectedAccountId }),
      });
      setScanId(data.scan_id);
      setScanCount(data.count);
      setStep(4);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <div className="text-sm text-neutral-500">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-2xl pb-24 pt-8">

      {/* ── Step progress ───────────────────────────────────────────────── */}
      <div className="mb-10">
        <div className="flex items-center">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                  step > s.num
                    ? "bg-emerald-500 text-black"
                    : step === s.num
                    ? "border-2 border-emerald-500 text-emerald-400"
                    : "border border-white/[0.10] text-neutral-600"
                }`}>
                  {step > s.num ? (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : s.num}
                </div>
                <span className={`text-[10px] font-medium transition-colors ${step === s.num ? "text-emerald-400" : "text-neutral-600"}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`mx-1 mb-4 h-px flex-1 transition-colors duration-500 ${step > s.num ? "bg-emerald-500" : "bg-white/[0.07]"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Step 1 — Welcome ─────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-white/[0.04] via-transparent to-emerald-500/[0.03] p-8">
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-emerald-500/[0.06] blur-3xl" />
            <div className="relative">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                Welcome to VigiliCloud
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Hey {userName}, let&apos;s secure your AWS.</h1>
              <p className="mt-3 text-neutral-400 leading-relaxed">
                In the next 5 minutes you&apos;ll connect your AWS account, run your first compliance scan,
                and see every misconfiguration — with exact steps to fix each one.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {[
              {
                num: "01",
                title: "Connect your AWS account",
                desc: "Give VigiliCloud read-only access via an IAM role. We never touch your data.",
                icon: "M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z",
              },
              {
                num: "02",
                title: "Run a security scan",
                desc: "We check 10 security areas — S3, IAM, EC2, RDS, CloudTrail, VPC, KMS and more.",
                icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
              },
              {
                num: "03",
                title: "Fix what's wrong",
                desc: "Every finding comes with AWS console steps, CLI commands, and remediation notes.",
                icon: "M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z",
              },
            ].map(item => (
              <div key={item.num} className="flex gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04]">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
                  <svg className="h-4.5 w-4.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-emerald-500">{item.num}</span>
                    <span className="font-semibold text-white">{item.title}</span>
                  </div>
                  <div className="mt-0.5 text-sm text-neutral-500">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setStep(2)}
            className="w-full rounded-2xl bg-emerald-500 py-3.5 font-bold text-black hover:bg-emerald-400 transition-colors"
          >
            Get Started →
          </button>

          <p className="text-center text-sm text-neutral-600">
            Already set up?{" "}
            <Link href="/scans" className="text-emerald-400 hover:underline">Go to workspace</Link>
          </p>
        </div>
      )}

      {/* ── Step 2 — Connect AWS ─────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Connect your AWS account</h1>
            <p className="mt-2 text-neutral-500">VigiliCloud uses an IAM role with read-only access. No write permissions, ever.</p>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-5 text-sm">
            <div className="mb-3 font-semibold text-emerald-300">Create the IAM role first (2 minutes)</div>
            <ul className="space-y-2 text-neutral-300">
              {[
                { text: "Open ", bold: "AWS Console → IAM → Roles → Create role", after: "" },
                { text: "Select ", bold: "AWS account", after: " as trusted entity, enter your Account ID" },
                { text: "Attach policy: ", bold: "SecurityAudit", after: " (AWS managed, read-only)" },
                { text: "Name it: ", code: "VigiliCloudRole", after: "" },
                { text: "Copy the ", bold: "Role ARN", after: " from the role summary page" },
              ].map((s, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400">{i + 1}</span>
                  <span>
                    {s.text}
                    {s.bold && <strong className="text-white">{s.bold}</strong>}
                    {s.code && <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">{s.code}</code>}
                    {s.after}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {connectError && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.07] p-4 text-sm text-red-300">
              <span className="mt-0.5">✕</span><span>{connectError}</span>
            </div>
          )}

          <form onSubmit={handleConnect} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Customer / Company Name</label>
              <input className={inputCls} placeholder="e.g. Acme Corp" value={customerName} onChange={e => setCustomerName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Account Label</label>
              <input className={inputCls} placeholder="e.g. Production Account" value={accountName} onChange={e => setAccountName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">AWS Account ID (12 digits)</label>
              <input className={inputCls} placeholder="123456789012" value={awsAccountId} onChange={e => setAwsAccountId(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">IAM Role ARN</label>
              <input className={inputCls} placeholder="arn:aws:iam::123456789012:role/VigiliCloudRole" value={roleArn} onChange={e => setRoleArn(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">AWS Region</label>
              <select className={inputCls} value={region} onChange={e => setRegion(e.target.value)} aria-label="AWS Region">
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 rounded-2xl border border-white/[0.07] py-3 text-sm text-neutral-400 hover:bg-white/[0.05] hover:text-white transition-colors"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={connecting}
                className="flex-[2] rounded-2xl bg-emerald-500 py-3 font-bold text-black hover:bg-emerald-400 disabled:opacity-40 transition-colors"
              >
                {connecting ? "Connecting…" : "Connect Account →"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Step 3 — Run Scan ────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5 text-center">
          <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-transparent p-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/[0.07] blur-3xl" />
            <div className="relative">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
                <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Account connected!</h1>
              <p className="mt-2 text-neutral-400">Now let&apos;s run your first security scan. Takes about 30–60 seconds.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-left">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-neutral-500">What we&apos;ll check</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                "S3 public access", "IAM permissions", "IAM MFA", "Root access keys",
                "Security groups", "EBS encryption", "CloudTrail", "RDS encryption",
                "VPC flow logs", "KMS key rotation",
              ].map(check => (
                <div key={check} className="flex items-center gap-2 text-sm text-neutral-400">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  {check}
                </div>
              ))}
            </div>
          </div>

          {scanError && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.07] p-4 text-sm text-red-300 text-left">
              <span className="mt-0.5">✕</span><span>{scanError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            className="w-full rounded-2xl bg-emerald-500 py-3.5 font-bold text-black hover:bg-emerald-400 disabled:opacity-40 transition-colors"
          >
            {scanning ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                Scanning your AWS account…
              </span>
            ) : "Run First Scan →"}
          </button>

          {scanning && (
            <p className="text-sm text-neutral-500">Checking 10 security areas — this usually takes 30–60 seconds</p>
          )}
        </div>
      )}

      {/* ── Step 4 — Results ────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-5 text-center">
          <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-transparent p-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/[0.07] blur-3xl" />
            <div className="relative">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
                <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Scan complete!</h1>
              <p className="mt-2 text-neutral-400">
                Found <span className="font-bold text-white">{scanCount} findings</span> in your AWS account. Each one has exact fix steps.
              </p>
              {scanId && <p className="mt-1 font-mono text-[10px] text-neutral-600">Scan ID: {scanId}</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 text-sm text-emerald-200 text-left">
            Your first scan is complete. Review findings, mark them as fixed as you remediate, and export evidence packs for audits.
          </div>

          <div className="space-y-3">
            <Link
              href="/scans"
              className="block w-full rounded-2xl bg-emerald-500 py-3.5 font-bold text-black hover:bg-emerald-400 transition-colors"
            >
              View Scan Results →
            </Link>
            <Link
              href="/findings"
              className="block w-full rounded-2xl border border-white/[0.07] py-3 text-sm text-neutral-400 hover:bg-white/[0.04] hover:text-white transition-colors"
            >
              All Findings Dashboard
            </Link>
            <Link
              href="/plans"
              className="block w-full rounded-2xl border border-white/[0.07] py-3 text-sm text-neutral-400 hover:bg-white/[0.04] hover:text-white transition-colors"
            >
              Upgrade Plan for More Accounts
            </Link>
          </div>
        </div>
      )}

    </main>
  );
}
