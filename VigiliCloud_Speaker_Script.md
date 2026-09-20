# VigiliCloud — Team Presentation Speaker Script
**Presenter:** Koppolu Leela Krishna  
**Date:** June 2026  
**Total time:** 30–35 minutes + Q&A  
**Deck:** VigiliCloud_Team_Presentation.pptx (15 slides)

---

## PRE-TALK CHECKLIST

Before the meeting starts:
- [ ] Browser tab open at `app.vigilicloud.com`, already signed in
- [ ] At least one connected AWS account visible on `/accounts`
- [ ] At least two scans in the system (so drift view is available)
- [ ] Test the AI Analysis button in advance — make sure `ANTHROPIC_API_KEY` is set
- [ ] Have a PDF export ready to open immediately
- [ ] Close all other browser tabs — clean screen

---

## SLIDE 1 — TITLE (2 min)

**Say:**

> "Good [morning/afternoon] everyone. Today I want to walk you through something I've been building — VigiliCloud. It's a product I've designed and shipped from the ground up, and I want to give you the full picture: what problem it solves, how it works, the business model, and where I'm taking it next.
>
> Let me start with a question. How long does it take to do a proper AWS security audit? If you're doing it right — checking IAM permissions, S3 bucket configurations, open security groups, database encryption, CloudTrail logging — a senior engineer needs 2 to 3 full days. And after all that work, the output is a PDF that's outdated the moment you send it.
>
> VigiliCloud takes that 2-day job and does it in 2 minutes. And it doesn't just find the problems — it tells you exactly how to fix every single one."

---

## SLIDE 2 — THE PROBLEM (2 min)

**Say:**

> "Let me be specific about the pain VigiliCloud is solving, because it's not just one problem — it's five.
>
> **Time.** A proper AWS audit covers IAM, S3, EC2, RDS, CloudTrail, KMS, and VPC. Done manually, that's 2 to 3 days of a senior engineer's time. That's time pulled away from product work.
>
> **Cost.** If you outsource it to a security firm, expect $5,000 to $20,000 per engagement. And for SOC2 compliance, you need quarterly audits. The math gets painful fast.
>
> **Staleness.** The PDF report you receive is already outdated. The day after it's sent, a developer might push a config change that opens an S3 bucket to the public. You won't know until the next audit.
>
> **No fix guidance.** Tools like AWS Config and native AWS Security Hub will tell you *what* is broken. They won't tell you *how* to fix it. So the engineer reads the finding, goes to Google, reads a Stack Overflow answer, and figures it out. That's expensive friction.
>
> **Enterprise-only pricing.** The good tools — Lacework, Orca, Wiz — are priced at $50,000+ per year, designed for Fortune 500 security teams. A 10-person startup doesn't even get a quote.
>
> VigiliCloud was built specifically for the teams that the enterprise tools ignore."

---

## SLIDE 3 — WHAT IS VIGICLOUD (2 min)

**Say:**

> "So what is VigiliCloud, precisely?
>
> It's a B2B SaaS product that connects to your AWS account via a read-only IAM role, runs 10 security checks in about 2 minutes, and returns a full findings report with actionable fix instructions for every issue found.
>
> The workflow is:
> One — you create a read-only IAM role in your AWS account. We provide a CloudFormation template. One click, about 3 minutes.
> Two — you paste the Role ARN into VigiliCloud.
> Three — you hit Run Scan.
> Four — in 2 minutes, you have a complete report: every misconfiguration, its severity, the specific AWS resource affected, and three ways to fix it: the AWS Console path, a CLI command, and Terraform code.
> Five — if you need an executive summary for a CTO or SOC2 auditor, one click generates an AI analysis using Claude.
>
> We serve four types of customers:
> AWS consultants who want to audit client accounts faster. Startup CTOs preparing for SOC2. DevOps teams who want continuous compliance monitoring. And MSPs who want to resell compliance scanning as a service to their clients."

---

## SLIDE 4 — HOW IT WORKS (3 min)

**Say:**

> "Let me walk through the full technical flow.
>
> **Step 1 — Connect AWS.**
> The customer creates an IAM role in their AWS account using our CloudFormation template. This role is read-only — it cannot create, modify, or delete anything. It trusts our VigiliCloud AWS account to assume it. We also use an External ID for extra security. Credentials are never stored — every scan uses STS AssumeRole, which returns temporary session tokens that expire in 1 hour.
>
> **Step 2 — Trigger Scan.**
> The user clicks 'Run Scan' in the dashboard. Pro and MSP customers can also trigger scans via our REST API, or set up scheduled daily scans.
>
> **Step 3 — 10 Checks Execute.**
> Our backend spawns a Python worker subprocess that runs all 10 compliance check modules. Each module uses the AWS boto3 SDK to query the relevant service — S3 for bucket configurations, IAM for user policies and MFA status, EC2 for security groups and EBS encryption, RDS for database exposure, CloudTrail for logging, VPC for flow logs, KMS for key rotation. The entire scan completes in about 2 minutes.
>
> **Step 4 — Findings with Fix Guidance.**
> Every finding comes with: the exact resource ID, a severity label (CRITICAL, HIGH, MEDIUM, LOW), the evidence snippet from the AWS API response, and three fix methods ready to copy-paste.
>
> **Step 5 — AI Summary.**
> One click. Claude Haiku reads all the findings and writes an executive summary in plain English — no AWS jargon — explaining the risk in business terms and ranking which issues to fix first.
>
> The three things I want you to remember about our security model: no agents installed on customer infrastructure, no AWS credentials ever stored, and session tokens that automatically expire after 1 hour."

---

## SLIDE 5 — THE 10 CHECKS (2 min)

**Say:**

> "We implement exactly 10 checks, all mapped to the CIS AWS Foundations Benchmark version 1.4. This is the industry-standard framework accepted by SOC2 Type II auditors, ISO 27001 certification bodies, and PCI DSS assessors.
>
> The four CRITICAL checks are where data breaches actually happen:
>
> **S3 Public Access** is the number one cause of AWS data breaches. A misconfigured bucket can expose your entire database to anyone on the internet.
>
> **IAM Root Access Keys** — AWS explicitly prohibits creating programmatic access keys on the root account. If someone gets those keys, they have God-mode access to everything in your AWS account — billing, EC2, S3, IAM, everything.
>
> **IAM Admin Permissions** — Over-permissioned roles are the second most common breach vector. Engineers often get AdministratorAccess 'temporarily' during setup and it never gets revoked.
>
> **MFA Enforcement** — Without MFA, a stolen password means a complete account takeover.
>
> The HIGH checks cover network and database exposure. The MEDIUM checks cover logging and key management — critical for compliance evidence and incident response even if they don't cause immediate breaches.
>
> Every check uses the official AWS API — no undocumented endpoints, no screen scraping. The results are defensible in a compliance audit."

---

## SLIDE 6 — TECH STACK (2 min)

**Say:**

> "The architecture is five layers. Let me go through each:
>
> **Frontend** — Next.js 16 with React 19 and TypeScript. Dark theme, emerald accents, Apple-inspired design with SF Pro fonts. Deployed on Render, auto-deploys on every push to main.
>
> **Backend** — FastAPI in Python 3.12. Eight dedicated routers: auth, scans, accounts, billing, fix guidance, integrations, approvals, developer API, and multi-tenant MSP mode. Session-cookie authentication with 12-hour TTL. Per-IP rate limiting on all sensitive endpoints — login, scans, billing, webhooks.
>
> **Worker Engine** — The compliance scanning logic lives in a separate Python module. The backend spawns it as a subprocess. It receives temporary AWS credentials as environment variables, runs the 10 checks via boto3, saves findings to the database, and returns a JSON summary to the backend.
>
> **Database** — PostgreSQL in production on Render, with SQLite as a local development fallback. Schema is auto-created on startup.
>
> **AI Layer** — Claude Haiku via the Anthropic Python SDK. One dedicated endpoint: POST /scans/{id}/ai-analysis. Requires the ANTHROPIC_API_KEY environment variable.
>
> The entire stack is on Render's infrastructure — frontend, backend, and database. Auto-deploys wired to the main branch. No manual deployment steps."

---

## SLIDE 7 — KEY FEATURES (3 min)

**Say:**

> "Beyond the scanning itself, VigiliCloud has eight features that make it a complete compliance workflow — not just a scanner.
>
> **Fix Guidance** — this is our single biggest differentiator. Competitors scan and report. We go further: click any finding and see three fix methods: the step-by-step AWS Console navigation path, a copy-paste CLI command, and a ready-to-use Terraform block. No Googling.
>
> **Drift Monitoring** — after your second scan, VigiliCloud compares to the previous one automatically. You see which issues are new since last scan, which ones you've fixed, and which are unchanged. This is what transforms a one-time audit into continuous compliance monitoring.
>
> **AI Analysis** — one click generates a Claude-written executive summary. Written in plain English for a CTO or board member, not a security engineer. This is the feature consultants use to justify their engagement fees — they scan a client account and email the AI summary the same day.
>
> **Evidence Exports** — CSV, JSON, and PDF exports accepted by SOC2 auditors as compliance evidence. The PDF includes scan metadata, timestamps, and all findings with their severity and status.
>
> **Integrations** — Jira can auto-create tickets for findings. GitHub can draft PRs with remediation code. Slack and Teams webhooks alert on new critical findings. And our REST API lets CI/CD pipelines trigger scans automatically.
>
> **Approval Workflows** — for teams where one engineer shouldn't make infrastructure changes unilaterally, we have a full approval gate. A team member requests a change, the designated approver reviews and approves or rejects, and every decision is logged in an immutable audit trail.
>
> **MSP Multi-Tenant Mode** — agencies and consultancies can group accounts by client, see aggregate risk per customer, and bulk-scan all clients at once.
>
> **Scheduled Scans** — set a daily or weekly schedule and forget it. You get an email the moment a new critical finding appears."

---

## SLIDE 8 — AI ANALYSIS DEEP DIVE (2 min)

**Say:**

> "Let me spend a moment on the AI integration because it's more than a marketing feature.
>
> The technical flow: after a scan completes and findings are saved, the user clicks 'AI Analysis'. This triggers a backend call to our /scans/{id}/ai-analysis endpoint. The backend queries all findings for that scan, builds a structured prompt that includes the check names, severities, affected resources, and evidence snippets. This prompt goes to Claude Haiku via the Anthropic SDK.
>
> What comes back is a 3-to-4 paragraph executive summary that contains:
>
> First — an executive overview: something like 'Your AWS environment has 3 critical misconfigurations that could expose customer data to the public internet.'
>
> Second — the top 3 priorities: exactly which findings to fix first and why, ranked by business impact and ease of exploitation.
>
> Third — compliance impact: which SOC2 controls or ISO 27001 clauses are at risk based on the specific findings.
>
> Fourth — a suggested timeline: which fixes are 10-minute quick wins and which require a planned change window.
>
> For a consultant, this replaces 2 to 3 hours of writing a security report. They scan a client account, click AI Analysis, and they have a board-ready document in seconds."

---

## SLIDE 9 — PRICING (2 min)

**Say:**

> "Pricing is flat-rate monthly — not per-finding, not per-resource, not per-check. This is intentional. Compliance teams shouldn't be penalized for having a larger AWS environment.
>
> **Free tier** — 1 AWS account, all 10 checks, fix guidance, drift monitoring. Enough for a solo developer to assess their own account. No credit card required, 2-week trial.
>
> **Starter at ₹8,299 a month, about $99** — up to 3 accounts. Adds CSV, JSON, and PDF exports for SOC2 evidence. Good for a small startup with dev, staging, and production accounts.
>
> **Pro at ₹24,999 a month, about $299** — up to 10 accounts. Unlocks AI analysis, scheduled daily scans, approval workflows, Jira and GitHub sync, and Slack alerts. This is our most popular tier — for growing engineering teams who need continuous compliance, not just quarterly audits.
>
> **MSP at ₹83,499 and up, about $999+** — unlimited accounts, multi-tenant client grouping, priority support. Built for agencies managing 20 to 200 client AWS accounts.
>
> All plans include a 2-week free trial with no credit card required. Payments go through Razorpay — we're India-first, priced in INR, though we plan to add a USD pricing page for global expansion.
>
> To put our pricing in perspective: Lacework and Orca start at $50,000 per year for enterprise contracts. We're at $1,200 per year for a full-featured Starter plan."

---

## SLIDE 10 — COMPETITIVE POSITIONING (2 min)

**Say:**

> "Let me compare VigiliCloud to the four alternatives teams are using today.
>
> **AWS Security Hub** — the native AWS tool. The setup alone takes weeks: you have to enable it in every region, set up cross-region aggregation, and configure findings standards. It gives you a findings list but zero fix guidance. The pricing model is per-finding per region — expensive and completely unpredictable. No AI analysis.
>
> **Prowler** — the open-source CLI scanner. A great tool for a security engineer comfortable with the command line. But there's no UI, no scheduling, no reports, no billing integration. You run it manually, parse JSON output, and write the report yourself. Not suitable for non-technical stakeholders or client-facing use.
>
> **Lacework, Orca, Wiz** — the enterprise tools. Excellent products, but they start at $50,000 per year and require a 2-to-4 week proof-of-concept process. A 15-person startup can't get a quote, let alone afford them.
>
> **Manual audit** — the status quo. 2-3 days of a senior engineer's time or $5,000 to $20,000 for a consultant. The resulting PDF is immediately outdated.
>
> VigiliCloud's three advantages that no competitor at our price point can match:
>
> One: **Fix Guidance** — we don't just say 'this is broken'; we say 'here's the exact CLI command to fix it right now.'
>
> Two: **AI Summaries** — Claude generates board-ready reports instantly. No other SMB compliance tool has AI-generated analysis built in.
>
> Three: **5-Minute Onboarding** — one CloudFormation template, paste the Role ARN, you're scanning. No agents, no enterprise procurement process, no 2-week POC."

---

## SLIDE 11 — DEPLOYMENT (1.5 min)

**Say:**

> "The deployment setup is simple and cost-effective.
>
> All three components — frontend, backend, database — run on Render.com. Auto-deploy is wired to the main branch, so every push to main triggers a new build and deployment automatically. No manual steps.
>
> For local development, a single 'docker compose up --build' spins up the full stack. The default admin account is seeded automatically on first startup.
>
> There's one important infrastructure note: our PostgreSQL database on Render is on the free tier and it expires in June 2026. That's a known action item — we're upgrading to a paid Render database or migrating to RDS or Supabase before the expiry date.
>
> The customer-side infrastructure is a single CloudFormation template in our infra directory. Customers run it in their AWS account with one click. It creates the read-only IAM role and takes about 3 minutes. The role has zero write permissions — it cannot create, modify, or delete any AWS resources."

---

## SLIDE 12 — ROADMAP (2 min)

**Say:**

> "Let me walk through where this product is going in three phases.
>
> **Phase 1 is everything live today.** The core compliance platform is fully operational: 10 CIS checks, fix guidance, AI analysis, drift monitoring, multi-account management, Razorpay billing across three plan tiers, scheduled daily scans, MSP multi-tenant mode, approval workflows, Jira and GitHub and Slack integrations, and a REST API with API keys. This is a complete, paying product.
>
> **Phase 2 — second half of 2026 — is multi-cloud and framework expansion.** The single most requested feature from consultants is Azure support. A large percentage of their clients use Azure alongside AWS. We'll add Azure CIS Benchmark checks using the same architecture: different SDK, same check structure, same UI. GCP follows. We'll also add HIPAA and PCI-specific framework mappings for customers in regulated industries. On the infrastructure side, Phase 2 includes upgrading the database — that's a critical path item before June 2026 — and splitting the backend into proper FastAPI routers as it passes 2000 lines.
>
> **Phase 3 — 2027 and beyond — is where it gets really interesting.** The vision is an MCP Execution Engine. Today, VigiliCloud detects issues and tells you how to fix them. In Phase 3, Claude will propose the fix, a human approver reviews and approves it, and Claude executes the remediation via the AWS SDK. VigiliCloud then re-scans to verify the fix worked. AI-powered remediation with explicit human approval gates — detect, propose, approve, fix, verify. Never auto-executing without consent.
>
> The second big Phase 3 bet is a unified multi-cloud dashboard: AWS, Azure, and GCP compliance posture in one view."

---

## SLIDE 13 — DEMO FLOW (5–7 min)

**Say:**

> "Let me show you the live product. I'm going to walk through a real scan."

**Demo script:**

1. **Sign In** — "This is app.vigilicloud.com. Already signed in."

2. **Connected Accounts** — Navigate to `/accounts`. "Here are connected AWS accounts. Each one shows status — Active means we've successfully tested the IAM role connection. Adding a new account takes about 3 minutes using our CloudFormation template."

3. **Run Scan** — Navigate to `/scans`, click Run Scan. "I'll kick off a scan now. Watch — about 2 minutes." While waiting, continue talking about findings from an existing scan.

4. **Review Findings** — Click into a completed scan. Filter to CRITICAL. "Here's what a finding looks like. I'll click this S3 public access finding." Show the fix guidance panel: "Three tabs — Console shows you the exact AWS Console pages to navigate to. CLI gives you a copy-paste command. Terraform gives you the infrastructure-as-code block. No Googling required."

5. **Drift View** — "If I switch to Drift, I can see what changed since the previous scan. Green items were fixed. Red items are new issues that appeared since the last scan."

6. **AI Analysis** — Click AI Analysis button. "This is Claude generating an executive summary right now. Watch — [pause for response]. This is what I send to a client or a CTO. No technical jargon. Plain English risk explanation."

7. **Export** — Click Export → PDF. "One click. Here's the PDF — audit-ready, timestamped, with all findings and metadata. SOC2 auditors accept this as compliance evidence."

8. **Settings** — Navigate to `/settings`. "For Pro users, this is where you configure daily scheduled scans, Jira integration so findings become tickets automatically, and API keys for triggering scans from a CI/CD pipeline."

> "That's the full workflow. Any questions on what you just saw before I wrap up?"

---

## SLIDE 14 — SUMMARY & NEXT STEPS (2 min)

**Say:**

> "Let me summarize.
>
> VigiliCloud is a live, deployed SaaS product — not a proof of concept. It handles real AWS accounts, processes real payments, and runs real scans. The core product is complete.
>
> Three things I want you to remember:
>
> **First** — it replaces a 2-day manual audit with a 2-minute automated scan. That's not a marginal improvement — it's a 1000x difference in time.
>
> **Second** — the AI integration is more than a marketing feature. The executive summary generated by Claude saves consultants 2 to 3 hours of report writing per client. That's directly recoverable time that goes back into billable work.
>
> **Third** — the roadmap is ambitious but grounded in real customer requests. Phase 2 is multi-cloud — the top ask from consultants. Phase 3 is AI-powered remediation with human approval gates — the logical evolution of 'detect and report' to 'detect, propose, approve, and fix.'
>
> The immediate action items:
>
> Red priority — upgrade the Render database before it expires on June 3rd, 2026.
>
> Yellow priority — start splitting the backend monolith as it approaches 2000 lines. The router structure is ready; it's a refactor, not a redesign.
>
> Green priorities — Azure SDK research for Phase 2, a seeded demo environment for investor and client demos, and a USD pricing page for global expansion.
>
> Questions?"

---

## SLIDE 15 — Q&A

**Anticipated questions and answers:**

**Q: How does VigiliCloud compare to AWS Config?**
> A: "AWS Config tracks configuration changes continuously, but setting it up correctly requires weeks of work — enabling it per region, configuring aggregation, writing rules. VigiliCloud is opinionated: we've pre-built the 10 most impactful checks and wrapped them in a UI with fix guidance. Think of us as 'AWS Config with a UX and a remediation guide', priced for SMBs."

**Q: What happens to our AWS credentials?**
> A: "We never store them. We use STS AssumeRole — your account grants our scanning role temporary access for the duration of the scan, maximum 1 hour. After that, the credentials expire automatically. Your permanent IAM access keys never leave your AWS account."

**Q: Can we self-host VigiliCloud?**
> A: "Not as a supported offering today, but the Docker Compose setup works for local use. An enterprise self-hosted tier is something we'd add in Phase 2 if there's demand."

**Q: How do you handle false positives?**
> A: "Users can mark any finding as 'Ignored' with a note explaining why — for example, 'this S3 bucket is intentionally public for our static website.' This is logged in the audit trail and excluded from future reports unless the underlying configuration changes."

**Q: What's the latency on the AI analysis?**
> A: "Claude Haiku is fast — typically 3 to 8 seconds for a scan with 50 findings. The prompt includes all findings structured as JSON, and we get back a formatted executive summary."

**Q: Will you add more compliance checks?**
> A: "Yes. The architecture makes adding a check straightforward — create a new Python module in worker/src, register it in the runner. Phase 2 will add 20+ more checks covering Azure and custom frameworks like HIPAA and PCI."

**Q: What's the go-to-market strategy?**
> A: "Initial focus is AWS consultants — word-of-mouth in consultant communities where a trusted recommendation carries a lot of weight. Then startup CTOs preparing for SOC2 audits via content marketing and compliance communities. Then MSPs via the white-label route in Phase 3."

**Q: Why Razorpay and not Stripe?**
> A: "We're India-first. Razorpay handles INR pricing natively and has better UPI and local payment method support. We'll add Stripe for USD billing when we go global in Phase 2."

---

## TIMING GUIDE

| Slide | Topic | Time |
|-------|-------|------|
| 1 | Title & hook | 2 min |
| 2 | The problem | 2 min |
| 3 | What is VigiliCloud | 2 min |
| 4 | How it works | 3 min |
| 5 | 10 compliance checks | 2 min |
| 6 | Tech stack | 2 min |
| 7 | Key features | 3 min |
| 8 | AI analysis | 2 min |
| 9 | Pricing | 2 min |
| 10 | Competitive positioning | 2 min |
| 11 | Deployment | 1.5 min |
| 12 | Roadmap | 2 min |
| 13 | Live demo | 5–7 min |
| 14 | Summary & next steps | 2 min |
| 15 | Q&A | Open |
| **Total** | | **~35 min + Q&A** |

---

## KEY PHRASES TO INTERNALIZE

- "2-day audit to 2-minute scan."
- "We don't just find problems — we tell you exactly how to fix them."
- "No agents. No stored credentials. Read-only, always."
- "Claude writes the executive summary so you don't have to."
- "Flat pricing — not per-finding. You shouldn't be penalized for having a bigger environment."
- "5-minute onboarding: one CloudFormation click, paste the ARN, scan."

---

*Good luck with the presentation. You built something real — let the product speak for itself.*
