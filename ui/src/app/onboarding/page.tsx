"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { AuthMe } from "@/types";

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { num: 1, label: "Welcome" },
  { num: 2, label: "Connect AWS" },
  { num: 3, label: "Run Scan" },
  { num: 4, label: "See Results" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [userName, setUserName] = useState("there");
  const [loading, setLoading] = useState(true);

  // Step 2 — connect account form
  const [customerName, setCustomerName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [awsAccountId, setAwsAccountId] = useState("");
  const [roleArn, setRoleArn] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [connecting, setConnecting] = useState(false);
  const [connectedAccountId, setConnectedAccountId] = useState<number | null>(null);
  const [connectError, setConnectError] = useState("");

  // Step 3 — scan
  const [scanning, setScanning] = useState(false);
  const [scanId, setScanId] = useState("");
  const [scanCount, setScanCount] = useState(0);
  const [scanError, setScanError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const auth = await api<AuthMe>("/auth/me");
        if (!auth.authenticated) {
          router.push("/signin");
          return;
        }
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
        body: JSON.stringify({
          customer_name: customerName,
          account_name: accountName,
          aws_account_id: awsAccountId,
          role_arn: roleArn,
          region,
          is_active: true,
        }),
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

  const inputClass =
    "w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:border-emerald-500/50 focus:outline-none";

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="animate-pulse text-neutral-500">Loading...</div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-2xl py-10 pb-20">
      {/* Progress bar */}
      <div className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    step > s.num
                      ? "bg-emerald-500 text-black"
                      : step === s.num
                      ? "border-2 border-emerald-500 text-emerald-400"
                      : "border border-white/20 text-neutral-600"
                  }`}
                >
                  {step > s.num ? "✓" : s.num}
                </div>
                <span
                  className={`text-xs ${
                    step === s.num ? "text-emerald-400" : "text-neutral-600"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-2 mb-4 h-px w-16 transition-colors ${
                    step > s.num ? "bg-emerald-500" : "bg-white/10"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1 — Welcome */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <div className="mb-2 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
              Welcome to VigiliCloud
            </div>
            <h1 className="text-4xl font-bold">Hey {userName}, let's secure your AWS.</h1>
            <p className="mt-4 text-lg text-neutral-400">
              In the next 5 minutes you'll connect your AWS account, run your first security scan,
              and see every misconfiguration — with exact steps to fix each one.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { num: "01", title: "Connect your AWS account", desc: "Give VigiliCloud read-only access via an IAM role. We never touch your data." },
              { num: "02", title: "Run a security scan", desc: "We check 10 security areas — S3, IAM, EC2, RDS, CloudTrail, VPC, KMS and more." },
              { num: "03", title: "Fix what's wrong", desc: "Every finding comes with AWS console steps, CLI commands, and remediation notes." },
            ].map((item) => (
              <div key={item.num} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex gap-4">
                  <div className="text-xs font-bold text-emerald-500">{item.num}</div>
                  <div>
                    <div className="font-semibold">{item.title}</div>
                    <div className="mt-1 text-sm text-neutral-400">{item.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setStep(2)}
            className="w-full rounded-2xl bg-emerald-500 py-4 font-bold text-black hover:bg-emerald-400 transition-colors"
          >
            Get Started →
          </button>

          <p className="text-center text-sm text-neutral-600">
            Already set up?{" "}
            <Link href="/scans" className="text-emerald-400 hover:underline">
              Go to workspace
            </Link>
          </p>
        </div>
      )}

      {/* Step 2 — Connect AWS */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-4xl font-bold">Connect your AWS account</h1>
            <p className="mt-3 text-neutral-400">
              VigiliCloud uses an IAM role with read-only access. Create the role in AWS, then paste the ARN below.
            </p>
          </div>

          {/* IAM setup instructions */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-sm">
            <div className="mb-3 font-semibold text-emerald-300">Create the IAM role first (2 minutes)</div>
            <ol className="space-y-2 text-neutral-300">
              <li>1. Open <strong>AWS Console → IAM → Roles → Create role</strong></li>
              <li>2. Select <strong>AWS account</strong> as trusted entity</li>
              <li>3. Enter Account ID: <code className="rounded bg-white/10 px-1">your own account ID</code></li>
              <li>4. Attach policy: <strong>SecurityAudit</strong> (read-only)</li>
              <li>5. Name it: <code className="rounded bg-white/10 px-1">VigiliCloudRole</code></li>
              <li>6. Copy the <strong>Role ARN</strong> from the role details page</li>
            </ol>
          </div>

          {connectError && (
            <div className="rounded-2xl border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {connectError}
            </div>
          )}

          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm text-neutral-400">Your name / company</label>
              <input
                className={inputClass}
                placeholder="e.g. Acme Corp"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-neutral-400">Account label</label>
              <input
                className={inputClass}
                placeholder="e.g. Production Account"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-neutral-400">AWS Account ID (12 digits)</label>
              <input
                className={inputClass}
                placeholder="123456789012"
                value={awsAccountId}
                onChange={(e) => setAwsAccountId(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-neutral-400">IAM Role ARN</label>
              <input
                className={inputClass}
                placeholder="arn:aws:iam::123456789012:role/VigiliCloudRole"
                value={roleArn}
                onChange={(e) => setRoleArn(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-neutral-400">AWS Region</label>
              <select
                className={inputClass}
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                title="AWS Region"
                aria-label="AWS Region"
              >
                {[
                  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
                  "ap-south-1", "ap-southeast-1", "ap-southeast-2",
                  "ap-northeast-1", "eu-west-1", "eu-central-1",
                ].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 rounded-2xl border border-white/10 py-3 text-sm hover:bg-white/5 transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={connecting}
                className="flex-[2] rounded-2xl bg-emerald-500 py-3 font-bold text-black hover:bg-emerald-400 disabled:opacity-50 transition-colors"
              >
                {connecting ? "Connecting..." : "Connect Account →"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Step 3 — Run Scan */}
      {step === 3 && (
        <div className="space-y-6 text-center">
          <div>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-2xl">
              ✓
            </div>
            <h1 className="text-4xl font-bold">Account connected!</h1>
            <p className="mt-3 text-neutral-400">
              Now let's run your first security scan. This takes about 30-60 seconds.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left">
            <div className="mb-3 text-sm font-semibold text-neutral-400">What we'll check</div>
            <div className="grid grid-cols-2 gap-2 text-sm text-neutral-300">
              {[
                "S3 public access", "IAM permissions", "IAM MFA", "Root access keys",
                "Security groups", "EBS encryption", "CloudTrail", "RDS encryption",
                "VPC flow logs", "KMS rotation",
              ].map((check) => (
                <div key={check} className="flex items-center gap-2">
                  <span className="text-emerald-500">•</span> {check}
                </div>
              ))}
            </div>
          </div>

          {scanError && (
            <div className="rounded-2xl border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {scanError}
            </div>
          )}

          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            className="w-full rounded-2xl bg-emerald-500 py-4 font-bold text-black hover:bg-emerald-400 disabled:opacity-50 transition-colors"
          >
            {scanning ? "Scanning your AWS account..." : "Run First Scan →"}
          </button>

          {scanning && (
            <p className="text-sm text-neutral-500 animate-pulse">
              Checking 10 security areas — this usually takes 30-60 seconds
            </p>
          )}
        </div>
      )}

      {/* Step 4 — Results */}
      {step === 4 && (
        <div className="space-y-6 text-center">
          <div>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-3xl">
              🎯
            </div>
            <h1 className="text-4xl font-bold">Scan complete!</h1>
            <p className="mt-3 text-neutral-400">
              Found <span className="font-bold text-white">{scanCount} findings</span> in your AWS account.
              Each one has exact fix steps.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-sm text-emerald-200">
            Your first scan is done. Review findings, mark them as fixed as you remediate,
            and export evidence for audits or customer reviews.
          </div>

          <div className="space-y-3">
            <Link
              href="/scans"
              className="block w-full rounded-2xl bg-emerald-500 py-4 font-bold text-black hover:bg-emerald-400 transition-colors"
            >
              View Findings →
            </Link>
            <Link
              href="/findings"
              className="block w-full rounded-2xl border border-white/10 py-3 text-sm hover:bg-white/5 transition-colors"
            >
              All Findings Dashboard
            </Link>
            <Link
              href="/plans"
              className="block w-full rounded-2xl border border-white/10 py-3 text-sm hover:bg-white/5 transition-colors"
            >
              Upgrade Plan for More Accounts
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
