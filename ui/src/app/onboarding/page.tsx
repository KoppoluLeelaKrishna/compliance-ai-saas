"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { AuthMe } from "@/types";
import TopbarActions from "@/components/app/TopbarActions";

type Step = 1 | 2 | 3 | 4;

const STEPS: { num: Step; title: string; sub: string }[] = [
  { num: 1, title: "Create your workspace", sub: "Name the client and confirm your team" },
  { num: 2, title: "Deploy the read-only role", sub: "One IAM role in the client account" },
  { num: 3, title: "Run your first scan", sub: "Ten checks, about a minute" },
  { num: 4, title: "Review and share results", sub: "Fix guidance and audit-ready exports" },
];

const REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "ap-south-1", "ap-southeast-1", "ap-southeast-2",
  "ap-northeast-1", "eu-west-1", "eu-central-1",
];

const CHECKS = [
  "S3 public access", "IAM permissions", "IAM MFA", "Root access keys",
  "Security groups", "EBS encryption", "CloudTrail logging", "RDS encryption",
  "VPC flow logs", "KMS key rotation",
];

const ROLE_STEPS = [
  <>Open <strong>AWS Console → IAM → Roles → Create role</strong></>,
  <>Choose <strong>AWS account</strong> as the trusted entity and enter your account ID</>,
  <>Attach the AWS-managed <strong>SecurityAudit</strong> policy — read-only, no write access</>,
  <>Name the role <code className="vc-mono rounded bg-[var(--vc-chip)] px-1.5 py-0.5 text-xs">VigiliCloudRole</code></>,
  <>Copy the <strong>Role ARN</strong> from the role summary page</>,
];

/** One row of the step list: a numbered marker, the title, and its state. */
function StepMarker({ num, state }: { num: number; state: "done" | "active" | "todo" }) {
  if (state === "done") {
    return (
      <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[var(--vc-ok)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vc-canvas)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 5 5L20 7" />
        </svg>
      </div>
    );
  }
  return (
    <div
      className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-xs font-semibold ${
        state === "active"
          ? "border-2 border-[var(--vc-accent)] text-[var(--vc-accent-text)]"
          : "border border-[var(--vc-hairline-strong)] text-[var(--vc-muted)]"
      }`}
    >
      {num}
    </div>
  );
}

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <span className="vc-spinner !h-6 !w-6" />
        <div className="vc-sub">Loading…</div>
      </div>
    );
  }

  const heading = step === 1
    ? `Hey ${userName}, let's secure your AWS.`
    : step === 2
    ? "Connect your first AWS account"
    : step === 3
    ? "Run your first scan"
    : "Your first scan is done";

  const subheading = step === 1
    ? "Four steps, about five minutes. VigiliCloud assumes a read-only IAM role — no write permissions, no stored credentials, no agents to install."
    : step === 2
    ? "VigiliCloud assumes a read-only IAM role. No write permissions, no stored credentials, no agents to install."
    : step === 3
    ? "Ten checks across S3, IAM, EC2, RDS, CloudTrail, VPC, and KMS. It usually takes under a minute."
    : "Every finding ships with the Console path, the CLI command, and the Terraform to close it.";

  return (
    <>
      <TopbarActions>
        <span className="text-[12.5px] text-[var(--vc-muted)]">
          Step {step} of 4
        </span>
        <Link href="/dashboard" className="vc-btn">Skip for now</Link>
      </TopbarActions>

      <div className="mx-auto flex w-full max-w-[820px] flex-col gap-[22px] py-6">
        <div>
          <h1 className="vc-h1 vc-h1-lg">{heading}</h1>
          <p className="vc-sub vc-sub-lg max-w-[620px]">{subheading}</p>
        </div>

        {/* Progress — one bar per step */}
        <div className="flex gap-1.5">
          {STEPS.map(s => (
            <div
              key={s.num}
              className="h-[3px] flex-1 rounded-full"
              style={{ background: step >= s.num ? "var(--vc-accent)" : "var(--vc-chip)" }}
            />
          ))}
        </div>

        <div className="vc-card vc-card-flush">
          {STEPS.map(s => {
            const state = step > s.num ? "done" : step === s.num ? "active" : "todo";

            if (state !== "active") {
              return (
                <div
                  key={s.num}
                  className={`flex items-center gap-4 border-b border-[var(--vc-hairline-soft)] px-6 py-5 last:border-b-0 ${state === "todo" ? "opacity-50" : ""}`}
                >
                  <StepMarker num={s.num} state={state} />
                  <div className="flex-1">
                    <div className="vc-card-title">{s.title}</div>
                    <div className="vc-card-sub">{s.sub}</div>
                  </div>
                  {state === "done" && (
                    <button type="button" className="vc-link !text-[var(--vc-muted)]" onClick={() => setStep(s.num)}>
                      Revisit
                    </button>
                  )}
                </div>
              );
            }

            return (
              <div
                key={s.num}
                className="border-b border-[var(--vc-hairline-soft)] px-6 py-6 last:border-b-0"
                style={{ background: "rgba(0,102,204,0.04)" }}
              >
                <div className="mb-5 flex items-center gap-4">
                  <StepMarker num={s.num} state="active" />
                  <div className="flex-1">
                    <div className="vc-card-title">{s.title}</div>
                    <div className="vc-card-sub">{s.sub}</div>
                  </div>
                </div>

                <div className="ml-0 sm:ml-[42px]">
                  {/* ── Step 1 ─────────────────────────────────────────── */}
                  {s.num === 1 && (
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3">
                        {[
                          ["Connect an account", "A read-only IAM role in each AWS account you manage."],
                          ["Run a scan", "Ten checks across the surfaces attackers actually use."],
                          ["Fix what's wrong", "Console path, CLI command, and Terraform for every finding."],
                        ].map(([title, desc], i) => (
                          <div key={title} className="flex gap-3.5">
                            <span className="vc-mono w-6 flex-none text-xs text-[var(--vc-dim)]">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <div>
                              <div className="text-[13.5px] font-semibold text-[var(--vc-text)]">{title}</div>
                              <div className="mt-0.5 text-[12.5px] leading-[1.5] text-[var(--vc-muted)]">{desc}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2.5 pt-1">
                        <button type="button" className="vc-btn-primary vc-btn-lg" onClick={() => setStep(2)}>
                          Get started
                        </button>
                        <Link href="/dashboard" className="vc-btn-secondary vc-btn-lg !font-normal !text-[var(--vc-muted)]">
                          I&apos;m already set up
                        </Link>
                      </div>
                    </div>
                  )}

                  {/* ── Step 2 ─────────────────────────────────────────── */}
                  {s.num === 2 && (
                    <form onSubmit={handleConnect} className="flex flex-col gap-4">
                      <div className="rounded-xl border border-[var(--vc-hairline)] bg-[var(--vc-inset)] p-4">
                        <div className="vc-eyebrow mb-3">Create the role first — about two minutes</div>
                        <ol className="flex flex-col gap-2">
                          {ROLE_STEPS.map((content, i) => (
                            <li key={i} className="flex gap-2.5 text-[13px] leading-[1.5] text-[var(--vc-text-2)]">
                              <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[var(--vc-accent-wash)] text-[10px] font-semibold text-[var(--vc-accent-text)]">
                                {i + 1}
                              </span>
                              <span>{content}</span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      {connectError && <div className="vc-note vc-note-error">{connectError}</div>}

                      <div className="vc-grid vc-grid-2 !gap-3">
                        <div>
                          <label className="vc-label" htmlFor="ob-client">Client</label>
                          <input id="ob-client" className="vc-input" placeholder="Acme Retail" value={customerName} onChange={e => setCustomerName(e.target.value)} required />
                        </div>
                        <div>
                          <label className="vc-label" htmlFor="ob-account">Account name</label>
                          <input id="ob-account" className="vc-input" placeholder="Production" value={accountName} onChange={e => setAccountName(e.target.value)} required />
                        </div>
                        <div>
                          <label className="vc-label" htmlFor="ob-id">AWS account ID</label>
                          <input id="ob-id" className="vc-input vc-input-mono" placeholder="123456789012" inputMode="numeric" value={awsAccountId} onChange={e => setAwsAccountId(e.target.value)} required />
                        </div>
                        <div>
                          <label className="vc-label" htmlFor="ob-region">Region</label>
                          <select id="ob-region" className="vc-select" value={region} onChange={e => setRegion(e.target.value)}>
                            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="vc-label" htmlFor="ob-arn">Role ARN</label>
                        <input id="ob-arn" className="vc-input vc-input-mono" placeholder="arn:aws:iam::123456789012:role/VigiliCloudRole" value={roleArn} onChange={e => setRoleArn(e.target.value)} required />
                      </div>

                      <div className="flex flex-wrap gap-2.5 pt-1">
                        <button type="submit" className="vc-btn-primary vc-btn-lg" disabled={connecting}>
                          {connecting ? "Connecting…" : "Verify and continue"}
                        </button>
                        <button type="button" className="vc-btn-secondary vc-btn-lg !font-normal !text-[var(--vc-muted)]" onClick={() => setStep(1)}>
                          Back
                        </button>
                      </div>
                    </form>
                  )}

                  {/* ── Step 3 ─────────────────────────────────────────── */}
                  {s.num === 3 && (
                    <div className="flex flex-col gap-4">
                      <div className="rounded-xl border border-[var(--vc-hairline)] bg-[var(--vc-inset)] p-4">
                        <div className="vc-eyebrow mb-3">What we check</div>
                        <div className="grid grid-cols-2 gap-2">
                          {CHECKS.map(check => (
                            <div key={check} className="flex items-center gap-2.5 text-[13px] text-[var(--vc-text-2)]">
                              <span className="vc-dot text-[var(--vc-accent-text)]" />
                              {check}
                            </div>
                          ))}
                        </div>
                      </div>

                      {scanError && <div className="vc-note vc-note-error">{scanError}</div>}

                      <div className="flex flex-wrap items-center gap-2.5">
                        <button type="button" className="vc-btn-primary vc-btn-lg" onClick={handleScan} disabled={scanning}>
                          {scanning ? <><span className="vc-spinner !border-white/40 !border-t-white" /> Scanning…</> : "Run first scan"}
                        </button>
                        {scanning && (
                          <span className="text-[12.5px] text-[var(--vc-muted)]">
                            Checking 10 security areas — usually 30 to 60 seconds
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Step 4 ─────────────────────────────────────────── */}
                  {s.num === 4 && (
                    <div className="flex flex-col gap-4">
                      <div className="flex items-baseline gap-3">
                        <span className="text-[40px] font-semibold leading-none tracking-[-1.2px] text-[var(--vc-text)]">
                          {scanCount}
                        </span>
                        <span className="text-[13.5px] text-[var(--vc-muted)]">
                          finding{scanCount === 1 ? "" : "s"} across your first scan
                        </span>
                      </div>
                      {scanId && (
                        <div className="vc-mono text-[11.5px] text-[var(--vc-dim)]">Scan {scanId}</div>
                      )}
                      <div className="flex flex-wrap gap-2.5 pt-1">
                        <Link href="/scans" className="vc-btn-primary vc-btn-lg">View scan results</Link>
                        <Link href="/findings" className="vc-btn-secondary vc-btn-lg">All findings</Link>
                        <Link href="/plans" className="vc-btn-secondary vc-btn-lg !font-normal !text-[var(--vc-muted)]">
                          Add more accounts
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="vc-note items-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--vc-accent-text)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="flex-none">
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <span className="text-[13.5px] leading-[1.5]">
            The role grants <span className="font-semibold text-[var(--vc-text)]">SecurityAudit</span> and{" "}
            <span className="font-semibold text-[var(--vc-text)]">ViewOnlyAccess</span> only. You can revoke it
            from the client account at any time.
          </span>
        </div>
      </div>
    </>
  );
}
