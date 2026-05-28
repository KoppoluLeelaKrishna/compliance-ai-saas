# VigiliCloud — Complete Product Training Guide
## Everything You Need to Know to Pitch, Demo, and Support Clients

---

## 1. WHAT IS VIGILICLOUD? (The 30-Second Pitch)

**VigiliCloud is an AWS security scanning SaaS that finds misconfigurations in your AWS account in under 2 minutes and tells you exactly how to fix them.**

> "Connect your AWS account in 5 minutes. Run a scan. Get a prioritised list of every security gap — with exact fix steps, CLI commands, and compliance-ready evidence exports."

**Who it's for:**
- Solo AWS consultants scanning client accounts
- Startup CTOs who need to pass security audits
- DevOps / platform teams managing multiple AWS accounts
- MSPs and agencies offering security as a service

---

## 2. THE 10 SECURITY CHECKS — Know These Cold

| # | Check | Severity | What It Finds |
|---|-------|----------|---------------|
| 1 | **S3 Public Access** | 🔴 CRITICAL | Buckets accessible to the internet, public ACLs, exposed policies |
| 2 | **Root Access Keys** | 🔴 CRITICAL | Active programmatic keys on the root account — biggest single risk |
| 3 | **IAM Permissions** | 🟠 HIGH | Roles/users with admin access who don't need it (least privilege violations) |
| 4 | **MFA Enforcement** | 🟠 HIGH | IAM users and root account without multi-factor authentication enabled |
| 5 | **Security Groups** | 🟠 HIGH | EC2 security groups with ports 22/3389/0-65535 open to 0.0.0.0/0 |
| 6 | **RDS Encryption** | 🟠 HIGH | RDS databases without encryption at rest or publicly accessible |
| 7 | **EBS Encryption** | 🟡 MEDIUM | EC2 volumes unencrypted, missing account-level default encryption |
| 8 | **CloudTrail Logging** | 🟡 MEDIUM | CloudTrail not enabled, not multi-region, or log validation off |
| 9 | **VPC Flow Logs** | 🟡 MEDIUM | VPCs without flow logs — network traffic is invisible for forensics |
| 10 | **KMS Key Rotation** | 🟡 MEDIUM | Customer-managed KMS keys without auto-rotation enabled |

### Why These 10?
These cover the **CIS AWS Foundations Benchmark** — the industry standard referenced by SOC2, ISO 27001, and PCI DSS. If a client passes these 10 checks, they have a solid AWS security baseline.

---

## 3. HOW IT WORKS — Technical Detail

### Architecture
```
Client Browser → Next.js UI → FastAPI Backend → AWS STS AssumeRole → boto3 Checks → Results
```

### The IAM Role (Key to Understanding the Product)
- Clients create a **read-only IAM role** in their AWS account
- They give VigiliCloud's AWS account permission to **assume** that role
- We use `sts:AssumeRole` to temporarily get credentials — **credentials are never stored**
- The role has **SecurityAudit** managed policy (AWS's own read-only audit policy)
- After the scan, the temporary credentials expire automatically

**This is the #1 trust question clients ask: "Can you see/change my data?"**
Answer: *"No. We use a read-only role. We can see configuration — not your data. We cannot make changes. Credentials are never stored."*

### What Happens During a Scan
1. User clicks "Run Scan" in the UI
2. Backend assumes the client's IAM role via STS
3. 10 worker checks run in parallel using boto3 (AWS Python SDK)
4. Each check returns `PASS` or `FAIL` findings with resource IDs
5. Findings are saved to the database with severity levels
6. AI analysis (Claude Haiku) generates an executive summary
7. Email alert sent if any CRITICAL findings are found

---

## 4. KEY DIFFERENTIATORS — What Makes Us Different

### vs AWS Security Hub
| AWS Security Hub | VigiliCloud |
|-----------------|-------------|
| Requires enabling multiple AWS services | Single IAM role, done |
| $0.001 per finding/check (adds up fast) | Flat monthly price |
| No remediation guidance | Full fix steps for every finding |
| No AI analysis | Claude AI executive summary |
| Complex setup — needs AWS expertise | Works in 5 minutes |

### vs Prowler (Open Source)
| Prowler | VigiliCloud |
|---------|-------------|
| CLI tool — needs developer to run | Web UI — anyone can use |
| No UI, no reports | Dashboard + exports |
| No fix guidance | Exact CLI fix commands included |
| Self-hosted, self-maintained | Fully managed SaaS |
| Free but costs your time | $99/mo saves 2+ days per month |

### vs Lacework / Orca Security
| Enterprise Tools | VigiliCloud |
|-----------------|-------------|
| $5,000–$50,000+/month | $99–$999/month |
| 2–4 week POC/sales process | 5-minute self-service |
| Overkill for SMBs | Purpose-built for SMBs |
| Runtime agents required (some) | Zero agents |

---

## 5. PRICING — Know This for Sales Conversations

| Plan | Price (USD) | Price (INR) | Best For |
|------|-------------|-------------|---------|
| **Starter** | $99/mo | ₹8,299/mo | Consultants with 1–3 client accounts |
| **Pro** | $299/mo | ₹24,999/mo | Teams, includes AI analysis + scheduled scans |
| **MSP** | $999/mo | ₹83,499/mo | Agencies managing 10+ accounts |

**Key selling points:**
- 2-week free trial on all plans
- No credit card needed to start
- Billed in INR (Indian customers pay in rupees — no forex hassle)
- Cancel anytime

**ROI Calculation to share with clients:**
> "One data breach costs an average of $4.5M (IBM 2024). VigiliCloud Pro is $299/month. If we prevent one incident per year, that's 1,256x ROI."

---

## 6. COMMON CLIENT OBJECTIONS — And How to Answer

### "We already have AWS Config / Security Hub"
*"Great — VigiliCloud is complementary, not competing. We add AI-powered plain English summaries, guided remediation with exact commands, and compliance evidence exports in one click. Security Hub gives you alerts; we tell you how to fix them."*

### "Is it safe to give you access to our AWS account?"
*"Absolutely. We use a read-only IAM role — we can see configuration, not data. We cannot make any changes. Your credentials are never stored. The access is temporary per scan via AWS STS. This is the same mechanism AWS themselves recommend for auditing."*

### "We have a DevOps team — we can do this ourselves"
*"Your DevOps team's time costs $100–200/hour. A manual security audit takes 2–3 days. VigiliCloud does it in 2 minutes for $99/month. Your team can focus on building, not auditing."*

### "We're too small to need this"
*"82% of breaches happen to companies with fewer than 500 employees. Attackers don't target size — they target exposed S3 buckets and weak IAM. Small companies are actually more at risk because they have fewer security resources."*

### "Can I try it before paying?"
*"Yes — 2-week free trial, no credit card. You can connect your AWS account and run a real scan in 5 minutes completely free."*

---

## 7. DEMO SCRIPT — How to Show the Product Live

### Before the Demo
- Have a test AWS account ready with a few issues (open S3 bucket, IAM user without MFA)
- Open app.vigilicloud.com in a clean browser tab
- Be logged into a Pro account so they see AI analysis

### Demo Flow (12 minutes)

**Step 1 — Dashboard (1 min)**
Show the clean dashboard. Mention "this is what your team sees every day."

**Step 2 — Connect Account (3 min)**
Walk through the 3-step IAM role setup. Emphasise: *"This is the entire setup. Once. No maintenance."*

**Step 3 — Run Scan (2 min)**
Click "Run Scan". While it runs (30–90 seconds), say: *"In a traditional audit, a consultant would be on day 1 of a 3-day engagement right now."*

**Step 4 — Findings (4 min)**
Show the findings list. Click a CRITICAL finding. Show:
- The resource ID (exact bucket/role/instance affected)
- The severity and why it matters
- The fix guidance with AWS Console path and CLI command

**Step 5 — AI Analysis (1 min)**
Show the Claude AI executive summary. Say: *"This is the report you give your CTO or board. One paragraph, plain English, prioritised."*

**Step 6 — Export (1 min)**
Click "Export CSV". Say: *"This is your SOC2 audit evidence. Download, attach to email, done."*

---

## 8. TARGET CUSTOMER PROFILES

### Profile 1: The AWS Consultant
- Manages 5–20 client AWS accounts
- Needs to deliver security reports but doesn't have time for manual audits
- **Pain:** Takes 2 days per client for manual review
- **Value:** Scan all clients in 2 minutes each, deliver polished reports
- **Best plan:** Pro or MSP

### Profile 2: The Startup CTO
- 10–50 person company, AWS account with 2–3 years of accumulated configuration
- Needs to pass SOC2 for an enterprise deal
- **Pain:** Doesn't know what they don't know; no security team
- **Value:** Find and fix issues before the auditor does
- **Best plan:** Starter or Pro

### Profile 3: The DevOps Lead
- Enterprise team, knows they have issues but no time to audit
- Uses AWS internally but doesn't have a dedicated security function
- **Pain:** Manual audits are slow; Security Hub is complex
- **Value:** Ongoing automated scanning, scheduled daily checks
- **Best plan:** Pro

### Profile 4: The MSP / Agency
- Manages cloud infrastructure for multiple clients
- Needs to offer "security monitoring" as a service
- **Pain:** Doing it manually per client doesn't scale
- **Value:** One platform, all clients, white-label-ready
- **Best plan:** MSP

---

## 9. MARKETING MESSAGES BY AUDIENCE

### For CTOs / Founders
*"Your AWS account has security gaps. Most do. The question is whether you find them before an attacker does. VigiliCloud tells you in 2 minutes."*

### For DevOps / Engineering
*"Automated AWS security scanning with exact CLI fix commands. No agents. 5-minute setup. Integrate into your workflow, not replace it."*

### For Consultants
*"Turn a 2-day manual AWS security review into a 2-minute scan. Deliver polished reports to every client. Scale your practice without scaling your hours."*

### For Compliance / Audit
*"SOC2 and ISO 27001 evidence in one click. CSV exports of every finding, every scan, every fix. Audit-ready in minutes."*

---

## 10. QUICK FACTS TO REMEMBER

- **URL:** app.vigilicloud.com
- **Scan time:** ~2 minutes for a full 10-check scan
- **Setup time:** ~5 minutes (IAM role creation)
- **Access type:** Read-only IAM role via STS (no stored credentials)
- **AI model:** Claude (Anthropic) for security analysis
- **Email alerts:** Triggered on any CRITICAL finding
- **Exports:** CSV and JSON
- **Avg findings:** 14 per typical AWS account scan
- **% with CRITICAL issues:** 78% of scanned accounts
- **Most common finding:** S3 public access misconfiguration
- **Trial:** 2 weeks free, no credit card
- **Payment:** Razorpay (INR) — USD pricing shown for reference
- **Backend:** FastAPI (Python) on Render
- **Frontend:** Next.js on Render
- **Checks framework:** CIS AWS Foundations Benchmark v1.4

---

## 11. LINKEDIN / EMAIL OUTREACH TEMPLATES

### LinkedIn Connection Message
*"Hi [Name], I noticed you work in cloud/AWS at [Company]. I built VigiliCloud — it scans AWS accounts for security misconfigs in 2 minutes and gives exact fix steps. Would love your feedback as someone in the space."*

### Cold Email Subject Lines That Work
- "Found 6 critical issues in your AWS account type in 2 mins"
- "Your AWS account probably has these 3 security gaps"
- "How [Similar Company] cut their audit time from 2 days to 2 minutes"

### Follow-Up After Demo
*"Thanks for your time today. As promised — your free trial link: app.vigilicloud.com. Takes 5 minutes to connect your first AWS account. Happy to answer any questions — just reply here."*
