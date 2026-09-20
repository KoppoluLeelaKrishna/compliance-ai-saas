"""
VigiliCloud Team Presentation Generator — v4
Updated with: GitHub checks, auto-remediation, evidence timeline,
compliance coverage, risk scoring, auditor portal, RBAC, 31 tests.
"""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

# ── Color Palette ─────────────────────────────────────────────────────────────
BG_DARK   = RGBColor(0x0A, 0x0A, 0x0F)
BG_CARD   = RGBColor(0x10, 0x10, 0x1A)
EMERALD   = RGBColor(0x10, 0xB9, 0x81)
EMERALD_D = RGBColor(0x05, 0x96, 0x6B)
WHITE     = RGBColor(0xFF, 0xFF, 0xFF)
WHITE_60  = RGBColor(0x99, 0x99, 0xAA)
RED       = RGBColor(0xEF, 0x44, 0x44)
YELLOW    = RGBColor(0xF5, 0x9E, 0x0B)
BLUE      = RGBColor(0x3B, 0x82, 0xF6)
PURPLE    = RGBColor(0x8B, 0x5C, 0xF6)
SLATE     = RGBColor(0x1E, 0x29, 0x3B)
ORANGE    = RGBColor(0xF9, 0x73, 0x16)

SLIDE_W = Inches(13.33)
SLIDE_H = Inches(7.5)

prs = Presentation()
prs.slide_width  = SLIDE_W
prs.slide_height = SLIDE_H
blank_layout = prs.slide_layouts[6]


# ── Helpers ───────────────────────────────────────────────────────────────────

def add_rect(slide, x, y, w, h, fill=BG_DARK, line_color=None, line_width=Pt(0)):
    shape = slide.shapes.add_shape(1, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    if line_color:
        shape.line.color.rgb = line_color
        shape.line.width = line_width
    else:
        shape.line.fill.background()
    return shape


def add_text(slide, text, x, y, w, h, font_size=Pt(18), bold=False, color=WHITE,
             align=PP_ALIGN.LEFT, italic=False, wrap=True):
    txb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf  = txb.text_frame
    tf.word_wrap = wrap
    p   = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size  = font_size
    run.font.bold  = bold
    run.font.color.rgb = color
    run.font.italic = italic
    return txb


def add_text_lines(slide, lines, x, y, w, h, base_size=Pt(16), color=WHITE, align=PP_ALIGN.LEFT):
    txb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf  = txb.text_frame
    tf.word_wrap = True
    first = True
    for (txt, fs, bld, clr) in lines:
        if first:
            p = tf.paragraphs[0]; first = False
        else:
            p = tf.add_paragraph()
        p.alignment = align
        run = p.add_run()
        run.text = txt
        run.font.size  = fs or base_size
        run.font.bold  = bld
        run.font.color.rgb = clr or color
    return txb


def bg(slide):
    shape = slide.shapes.add_shape(1, 0, 0, SLIDE_W, SLIDE_H)
    shape.fill.solid()
    shape.fill.fore_color.rgb = BG_DARK
    shape.line.fill.background()


def emerald_bar(slide, y=0.0, h=0.07):
    bar = slide.shapes.add_shape(1, 0, Inches(y), SLIDE_W, Inches(h))
    bar.fill.solid()
    bar.fill.fore_color.rgb = EMERALD
    bar.line.fill.background()


def slide_header(slide, title, subtitle=None):
    emerald_bar(slide, 0, 0.07)
    add_text(slide, title, 0.4, 0.18, 12, 0.55, font_size=Pt(28), bold=True, color=WHITE)
    if subtitle:
        add_text(slide, subtitle, 0.4, 0.75, 12, 0.4, font_size=Pt(14), color=WHITE_60)


def add_speaker_notes(slide, notes_text):
    notes_slide = slide.notes_slide
    tf = notes_slide.notes_text_frame
    tf.text = notes_text


def card(slide, x, y, w, h, fill=BG_CARD, border=EMERALD):
    return add_rect(slide, x, y, w, h, fill=fill, line_color=border, line_width=Pt(1))


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 1 — Title
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(blank_layout)
bg(s)
emerald_bar(s, 0, 0.08)
emerald_bar(s, 7.42, 0.08)

add_rect(s, 0.5, 0.8, 2.6, 0.55, fill=EMERALD_D)
add_text(s, "VigiliCloud", 0.6, 0.82, 2.4, 0.48,
         font_size=Pt(20), bold=True, color=WHITE, align=PP_ALIGN.CENTER)

add_text(s, "AWS Compliance,\nMade Simple.", 0.5, 1.6, 8.5, 2.2,
         font_size=Pt(54), bold=True, color=WHITE)

add_text(s,
    "Connect AWS + GitHub → scan in 2 minutes → AI fix guidance + 1-click auto-remediation.\n"
    "SOC2 · ISO 27001 · PCI DSS · NIST — continuous evidence for real audits.",
    0.5, 3.85, 8, 0.9, font_size=Pt(17), color=WHITE_60)

card(s, 9.3, 1.3, 3.5, 5.5)
stats = [
    ("19+",    "Security Checks",   EMERALD, Pt(40)),
    ("4",      "Audit Frameworks",  BLUE,    Pt(40)),
    ("2 min",  "Average Scan Time", YELLOW,  Pt(40)),
    ("A→F",    "Risk Score Grade",  PURPLE,  Pt(40)),
]
for i, (val, lbl, clr, fs) in enumerate(stats):
    yy = 1.5 + i * 1.25
    add_text(s, val, 9.5, yy,      3.1, 0.65, font_size=fs,    bold=True,  color=clr,     align=PP_ALIGN.CENTER)
    add_text(s, lbl, 9.5, yy+0.6,  3.1, 0.4,  font_size=Pt(12), bold=False, color=WHITE_60, align=PP_ALIGN.CENTER)

add_text(s, "Presented by Koppolu Leela Krishna   |   June 2026",
         0.5, 7.05, 10, 0.35, font_size=Pt(11), color=WHITE_60)

add_speaker_notes(s,
"""SLIDE 1 — OPENING (2 min)

VigiliCloud: AWS + GitHub compliance scanning with AI-powered analysis, 1-click auto-remediation, and continuous SOC2 Type II evidence collection.

Open with the pain: "Drata costs $1,250/month and requires a sales call. AWS Security Hub takes weeks to set up and gives you zero fix guidance. We replace both — in 5 minutes, at a fraction of the cost, with AI summaries and 1-click fixes built in."

Key numbers to lead with: 19 security checks, 4 compliance frameworks (SOC2, ISO 27001, PCI DSS, NIST), 2-minute scan, A-to-F risk grade — all live on a real AWS + GitHub account.""")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 2 — The Problem
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(blank_layout)
bg(s)
slide_header(s, "The Problem", "AWS security compliance is broken for SMBs")

problems = [
    ("⏱", "2–3 Days",    "A manual AWS security audit takes a senior engineer 2–3 full days.",                             RED),
    ("💸", "Expensive",   "Drata/Vanta start at $800–1,250/month + sales call. Wiz is $15k+/year.",                       YELLOW),
    ("📄", "Stale",       "Point-in-time PDF reports. No re-scan, no drift tracking, no SOC2 Type II evidence.",           BLUE),
    ("🔧", "No Fix Help", "Most tools tell you WHAT is wrong but not HOW to fix it. Copy-paste Terraform? Nowhere.",      PURPLE),
    ("🏢", "Enterprise-Only", "AWS Security Hub, Lacework, Orca are priced and built for enterprises. SMBs are ignored.", WHITE_60),
]

for i, (icon, head, body, clr) in enumerate(problems):
    col = i % 3
    row = i // 3
    x = 0.35 + col * 4.35
    y = 1.4 + row * 2.55
    card(s, x, y, 4.1, 2.3, border=clr)
    add_text(s, icon,  x+0.15, y+0.12, 0.6, 0.55, font_size=Pt(24))
    add_text(s, head,  x+0.15, y+0.65, 3.7, 0.5,  font_size=Pt(16), bold=True, color=clr)
    add_text(s, body,  x+0.15, y+1.1,  3.7, 1.0,  font_size=Pt(12), color=WHITE_60)

add_speaker_notes(s,
"""SLIDE 2 — THE PROBLEM (2 min)

The five brutal realities for any SMB doing AWS compliance:

1. TIME: Manual audit = 2-3 senior engineer days.
2. COST: Drata starts at $1,250/month. Vanta $800/month. Wiz $15k+/year. All require a sales call.
3. STALENESS: Point-in-time reports are outdated the moment they're sent. SOC2 Type II requires 6-12 months of continuous evidence — no PDF covers that.
4. NO FIX GUIDANCE: Tools list problems but don't give you the CLI command or Terraform block to fix them.
5. ENTERPRISE-ONLY: Good tools (Lacework, Orca, Wiz) are $50k+/year for security teams of 50+. A 10-person startup is completely underserved.

This is the gap VigiliCloud fills.""")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 3 — What is VigiliCloud
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(blank_layout)
bg(s)
slide_header(s, "What is VigiliCloud?", "One-click compliance for teams that ship fast")

desc_lines = [
    ("VigiliCloud is a SaaS compliance platform that:", Pt(18), True,  WHITE),
    ("",                                                Pt(8),  False, WHITE),
    ("→  Connects AWS via read-only IAM role + GitHub via API token", Pt(15), False, WHITE_60),
    ("→  Runs 19+ checks across S3, IAM, EC2, RDS, CloudTrail, KMS, VPC, GitHub", Pt(15), False, WHITE_60),
    ("→  Maps every finding to SOC2 · ISO 27001 · PCI DSS · NIST controls", Pt(15), False, WHITE_60),
    ("→  Shows compliance coverage % per framework (not just a findings list)", Pt(15), False, WHITE_60),
    ("→  Auto-remediates supported findings with 1 click — in your AWS account", Pt(15), False, WHITE_60),
    ("→  Stores timestamped evidence for SOC2 Type II (6-12 month audit trail)", Pt(15), False, WHITE_60),
    ("→  AI executive summaries via Claude — shareable with auditors", Pt(15), False, WHITE_60),
    ("→  Scales from 1 account (free) to unlimited (MSP)", Pt(15), False, WHITE_60),
]
add_text_lines(s, desc_lines, 0.4, 1.3, 6.5, 5.5)

card(s, 7.2, 1.3, 5.7, 5.7)
add_text(s, "Who It's For", 7.4, 1.45, 5.3, 0.45, font_size=Pt(16), bold=True, color=EMERALD)
personas = [
    ("Startup CTOs",        "Pass SOC2 Type II with automated\nevidence collection — no consultant needed"),
    ("AWS Consultants",     "Scan 5–20 client accounts\ninstead of 2-day manual audits"),
    ("DevOps / Security",   "Continuous compliance posture +\nrisk score grade (A→F) on every scan"),
    ("MSPs & Agencies",     "Multi-tenant scanning; per-client\nrisk reports; auto-fix on behalf of clients"),
]
for i, (persona, desc) in enumerate(personas):
    y = 1.9 + i * 1.2
    add_text(s, persona, 7.4,  y,       3.2, 0.45, font_size=Pt(14), bold=True,  color=WHITE)
    add_text(s, desc,    7.4,  y+0.38,  5.3, 0.65, font_size=Pt(12), bold=False, color=WHITE_60)

add_speaker_notes(s,
"""SLIDE 3 — WHAT IS VIGICLOUD (2 min)

VigiliCloud is the compliance tool that Drata/Vanta users wish existed — at 1/10th the price with 1-click fixes built in.

The key differentiators vs every competitor:
1. Framework mapping: SOC2, ISO 27001, PCI DSS, NIST — every finding maps to specific controls. 22% SOC2 / 42% ISO 27001 — real compliance percentages, not a findings count.
2. GitHub + AWS in one scan: Checks org 2FA, branch protection, PR review requirements — the exact controls auditors ask about for SOC2 CC6.
3. Auto-remediation: S3 public access? EBS encryption? 1 button, live fix in your AWS account, with a confirm step.
4. SOC2 Type II evidence: Every scan stores timestamped evidence snapshots. Run daily → build 365 days of evidence automatically.""")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 4 — How It Works
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(blank_layout)
bg(s)
slide_header(s, "How It Works", "Scan completes in ~2 minutes — evidence stored automatically")

steps = [
    ("1", "Connect",       "Paste IAM Role ARN\n+ GitHub token\n(read-only, STS)",           EMERALD, 0.3),
    ("2", "Run Scan",      "Click 'Run Scan'\nor use REST API\nor scheduled daily",           BLUE,   2.6),
    ("3", "19+ Checks",    "boto3 + GitHub API\nS3, IAM, EC2, RDS,\nCloudTrail, KMS, VPC",   YELLOW, 4.9),
    ("4", "Findings+Fixes","Framework coverage %\nRisk grade A→F\n1-click auto-fix",          PURPLE, 7.2),
    ("5", "AI + Evidence", "Claude AI summary\nSOC2 Type II\nevidence timeline",              EMERALD, 9.5),
]

for (num, title, body, clr, x) in steps:
    card(s, x, 1.4, 2.4, 4.8, border=clr)
    add_text(s, num,   x+0.9,  1.55,  0.7, 0.7, font_size=Pt(32), bold=True, color=clr,     align=PP_ALIGN.CENTER)
    add_text(s, title, x+0.1,  2.3,   2.2, 0.6, font_size=Pt(15), bold=True, color=WHITE,   align=PP_ALIGN.CENTER)
    add_text(s, body,  x+0.1,  2.95,  2.2, 2.8, font_size=Pt(12), color=WHITE_60, align=PP_ALIGN.CENTER)

for xi in [2.75, 5.05, 7.35, 9.65]:
    add_text(s, "→", xi, 3.5, 0.4, 0.5, font_size=Pt(22), color=EMERALD, align=PP_ALIGN.CENTER)

add_text(s,
    "✓ No agents   ✓ Credentials never stored   ✓ 1-hr STS tokens   ✓ 31 automated tests   ✓ CORS-hardened API",
    0.4, 6.8, 12.5, 0.4, font_size=Pt(13), color=EMERALD, align=PP_ALIGN.CENTER)

add_speaker_notes(s,
"""SLIDE 4 — HOW IT WORKS (2 min)

Step 1: Connect. IAM Role ARN (CloudFormation 1-click) + optional GitHub personal access token with read:org + repo scope. Both stored encrypted (Fernet AES).

Step 2: Run Scan. UI button, REST API, or auto-scheduled (daily/weekly via APScheduler).

Step 3: 19+ checks. 10 AWS checks via boto3 + up to 5 GitHub checks via GitHub REST API. All checks run in a background subprocess — no HTTP timeouts, works on accounts with 200+ IAM roles.

Step 4: Framework coverage % per SOC2 / ISO / PCI / NIST. Risk grade A→F (0-100 score). 1-click auto-fix for S3, EBS, CloudTrail findings — with dry-run preview and confirm step.

Step 5: Claude AI writes executive summary. Every finding saves a timestamped evidence snapshot — run daily → SOC2 Type II evidence builds automatically.

Security: no stored credentials, 1-hour STS tokens, CORS hardened to specific origins, 31 automated tests all green.""")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 5 — The 19+ Compliance Checks
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(blank_layout)
bg(s)
slide_header(s, "19+ Security Checks — AWS + GitHub", "Mapped to SOC2 · ISO 27001 · PCI DSS · NIST")

checks = [
    ("S3 Public Access",        "S3",         "CRITICAL", RED,    "Public ACLs, block settings, bucket policies"),
    ("IAM Root Access Keys",    "IAM",        "CRITICAL", RED,    "Active programmatic keys on root account"),
    ("IAM Admin Permissions",   "IAM",        "CRITICAL", RED,    "Roles with AdministratorAccess attached"),
    ("MFA Enforcement",         "IAM",        "CRITICAL", RED,    "Root + all IAM users without MFA enabled"),
    ("GitHub: No 2FA Required", "GitHub",     "CRITICAL", RED,    "Org does not enforce 2FA for all members"),
    ("Open Security Groups",    "EC2",        "HIGH",     YELLOW, "SSH/RDP/all-traffic open to 0.0.0.0/0"),
    ("RDS Encryption",          "RDS",        "HIGH",     YELLOW, "Unencrypted or publicly accessible databases"),
    ("GitHub: No Branch Prot.", "GitHub",     "HIGH",     YELLOW, "Default branch missing protection rules"),
    ("EBS Encryption",          "EC2",        "MEDIUM",   BLUE,   "Volumes unencrypted; default encryption off"),
    ("CloudTrail Logging",      "CloudTrail", "MEDIUM",   BLUE,   "Multi-region logging + log file validation"),
    ("VPC Flow Logs",           "VPC",        "MEDIUM",   BLUE,   "Network traffic not captured for forensics"),
    ("KMS Key Rotation",        "KMS",        "MEDIUM",   BLUE,   "Customer-managed keys without auto-rotation"),
]

col_w = [3.5, 1.5, 1.5, 4.9]
col_x = [0.3, 3.9, 5.5, 7.1]
headers = ["Check Name", "Service", "Severity", "What It Detects"]

for ci, (hdr, cw) in enumerate(zip(headers, col_w)):
    add_rect(s, col_x[ci], 1.28, cw, 0.38, fill=EMERALD_D)
    add_text(s, hdr, col_x[ci]+0.05, 1.3, cw-0.1, 0.35,
             font_size=Pt(12), bold=True, color=WHITE, align=PP_ALIGN.CENTER)

for ri, (name, svc, sev, clr, what) in enumerate(checks):
    y   = 1.7 + ri * 0.465
    fill = BG_CARD if ri % 2 == 0 else RGBColor(0x14, 0x14, 0x22)
    for ci, (txt, cw) in enumerate(zip([name, svc, sev, what], col_w)):
        add_rect(s, col_x[ci], y, cw, 0.44, fill=fill)
        tc = clr if ci == 2 else (WHITE if ci != 3 else WHITE_60)
        add_text(s, txt, col_x[ci]+0.05, y+0.05, cw-0.1, 0.36,
                 font_size=Pt(10), color=tc, align=PP_ALIGN.CENTER if ci in (1,2) else PP_ALIGN.LEFT)

add_text(s, "■ CRITICAL", 0.3, 7.15, 1.8, 0.25, font_size=Pt(10), color=RED)
add_text(s, "■ HIGH",     2.1, 7.15, 1.2, 0.25, font_size=Pt(10), color=YELLOW)
add_text(s, "■ MEDIUM",   3.3, 7.15, 1.5, 0.25, font_size=Pt(10), color=BLUE)
add_text(s, "Frameworks: CIS AWS Foundations v1.4 + GitHub CIS Benchmark · SOC2 / ISO 27001 / PCI DSS / NIST SP 800-53",
         0.3, 7.22, 12.5, 0.25, font_size=Pt(10), color=WHITE_60, align=PP_ALIGN.RIGHT)

add_speaker_notes(s,
"""SLIDE 5 — CHECKS (2 min)

19+ checks split across AWS (15) and GitHub (4+):

AWS checks cover the CIS AWS Foundations Benchmark v1.4 — the gold standard accepted by SOC2, ISO 27001, and PCI DSS auditors.

GitHub checks cover the controls auditors actually ask about during SOC2 CC6 (Logical Access):
- Does your org require 2FA for all members? (SOC2 CC6.1, CC6.2)
- Do your repos have branch protection? (SOC2 CC8.1)
- Are PRs reviewed before merge? (SOC2 CC8.1)
- Can any member create a public repo? (SOC2 CC6.1)

This is the exact list Drata checks from GitHub. We do it in the same scan, same dashboard, same evidence export.""")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 6 — Framework Compliance Coverage
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(blank_layout)
bg(s)
slide_header(s, "Compliance Coverage by Framework", "Every finding maps to specific audit controls — not just a count")

# Example real scan data
card(s, 0.3, 1.28, 12.65, 0.72, border=EMERALD)
add_text(s, "Real scan result from a live AWS account:", 0.5, 1.38, 6, 0.35, font_size=Pt(13), bold=True, color=EMERALD)
add_text(s, "4 CRITICAL findings · 1 MEDIUM · Risk Grade: D (52/100)", 6.5, 1.38, 6.3, 0.35, font_size=Pt(13), color=WHITE_60)

frameworks = [
    ("SOC 2",       22,  "2/9 controls passing",  "CC6.1 CC6.6 CC6.7 CC6.3 CC7.1 CC8.1 CC9.1 — 7 failing", RED),
    ("ISO 27001",   42,  "5/12 controls passing", "A.9, A.10, A.12, A.13, A.14 — encryption + access controls failing", YELLOW),
    ("PCI DSS",     50,  "6/12 controls passing", "1.3, 3.4, 6.3, 8.3, 10.1 — firewall + encryption + access", YELLOW),
    ("NIST 800-53", 42,  "5/12 controls passing", "AC-3, IA-2, SC-7, SC-28, AU-2, CM-3 — failing", ORANGE),
]

for i, (fw, pct, ctrl_label, failing_note, clr) in enumerate(frameworks):
    y = 2.2 + i * 1.2
    card(s, 0.3, y, 12.65, 1.1, border=clr)
    add_text(s, fw,          0.5,  y+0.1, 2.0, 0.45, font_size=Pt(16), bold=True,  color=WHITE)
    add_text(s, ctrl_label,  0.5,  y+0.6, 2.5, 0.35, font_size=Pt(11), color=WHITE_60)
    # Progress bar background
    add_rect(s, 2.9, y+0.28, 8.5, 0.42, fill=RGBColor(0x1E, 0x29, 0x3B), line_color=None)
    # Progress bar fill
    bar_w = 8.5 * pct / 100
    add_rect(s, 2.9, y+0.28, bar_w if bar_w > 0.05 else 0.05, 0.42, fill=clr, line_color=None)
    add_text(s, f"{pct}%", 11.5, y+0.28, 0.9, 0.42, font_size=Pt(18), bold=True, color=clr, align=PP_ALIGN.RIGHT)
    add_text(s, failing_note, 0.5, y+0.78, 11.8, 0.28, font_size=Pt(10), color=WHITE_60)

add_text(s,
    "Fix 3 root causes → jump to 85%+ across all frameworks",
    0.3, 7.08, 12.65, 0.35, font_size=Pt(14), bold=True, color=EMERALD, align=PP_ALIGN.CENTER)

add_speaker_notes(s,
"""SLIDE 6 — COMPLIANCE COVERAGE (2 min)

This is what makes VigiliCloud look like Drata, not like a free scanner.

This is real data from my own AWS account. 4 critical findings drive 7 failing SOC2 controls.

The insight: it's not 4 separate problems. It's 3 root causes:
1. S3 Block Public Access is off → breaks CC6.1, CC6.6, CC6.7
2. EBS default encryption is off → breaks CC9.1, SC-28, A.10.1.1, 3.4
3. No GitHub 2FA requirement → breaks CC6.2, IA-2, A.9.4.2, 8.3

Fix those 3 things → re-scan → compliance jumps to 85%+ across all 4 frameworks. That's a meaningful statement for an auditor, not just "you have 4 findings."

This slide is what closes enterprise deals. The auditor doesn't care about findings — they care about control coverage.""")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 7 — Key Features
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(blank_layout)
bg(s)
slide_header(s, "Key Features", "Complete compliance workflow — scan to audit")

features = [
    ("🔧", "Auto-Remediation",    "1-click AWS fixes for S3, EBS, CloudTrail.\nDry-run preview → confirm → live fix → audit log.",   EMERALD, 0.30, 1.32),
    ("📊", "Risk Score A→F",      "0-100 score + letter grade on every scan.\nWeighted by severity — shows trend over time.",          BLUE,   4.59, 1.32),
    ("🗺", "Framework Coverage",  "SOC2 / ISO / PCI / NIST coverage % bars.\nEvery check_id mapped to exact audit controls.",          PURPLE, 8.88, 1.32),
    ("🐙", "GitHub Compliance",   "Org 2FA · branch protection · PR reviews.\nSame controls SOC2 auditors ask about.",                 YELLOW, 0.30, 3.07),
    ("📋", "Evidence Timeline",   "Timestamped snapshot per finding per scan.\nSOC2 Type II: 365 days of evidence auto-collected.",    RED,    4.59, 3.07),
    ("🤖", "AI Analysis",         "Claude writes exec summaries in plain English.\nChat with AI about any individual finding.",         EMERALD, 8.88, 3.07),
    ("🔑", "RBAC",                "Admin / User / Viewer roles enforced on every endpoint.\nInvite team, assign roles, restrict access.", BLUE,   0.30, 4.82),
    ("🔗", "Share Auditor Link",  "One-click share: 30-day public link for auditors.\nNo auditor login required to view evidence.",    YELLOW, 4.59, 4.82),
    ("🔀", "Drift Monitoring",    "NEW / UNCHANGED / REMEDIATED per scan.\nSee exactly what changed since last scan.",                 PURPLE, 8.88, 4.82),
]

CARD_W = 4.14
CARD_H = 1.55

for (icon, title, body, clr, x, y) in features:
    card(s, x, y, CARD_W, CARD_H, border=clr)
    add_text(s, icon,  x+0.15, y+0.1,  0.55, 0.48, font_size=Pt(20))
    add_text(s, title, x+0.72, y+0.1,  CARD_W-0.85, 0.45, font_size=Pt(13), bold=True, color=clr)
    add_text(s, body,  x+0.15, y+0.62, CARD_W-0.3,  0.82, font_size=Pt(11), color=WHITE_60)

add_speaker_notes(s,
"""SLIDE 7 — KEY FEATURES (3 min)

9 features — highlight these 4 as the ones that close deals:

AUTO-REMEDIATION: No other tool at our price point does this. S3 public access? Click "Auto-Fix." VigiliCloud calls put_public_access_block on your bucket in real time, marks the finding FIXED, and logs it to the audit trail. Dry-run preview before executing. This is what Wiz does at $15k/year — we do it at $99/month.

GITHUB COMPLIANCE: This is what auditors ask about on Day 1 of a SOC2 audit: "Does your org require 2FA? Do you review PRs before merging?" Previously you needed Drata for this. We now check it in the same scan as AWS.

EVIDENCE TIMELINE: Every scan stores timestamped evidence per control. Run daily → 365 days of evidence builds automatically. SOC2 Type II covers a 6-12 month period — we generate that evidence passively.

FRAMEWORK COVERAGE %: Competitors show you a findings list. We show you "SOC2: 22%. Fix these 3 things → 85%." That's what auditors and CTOs care about.

Other features worth mentioning: AI chat with individual findings, RBAC for team access control, shareable auditor portal links (no login required).""")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 8 — Auto-Remediation Detail
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(blank_layout)
bg(s)
slide_header(s, "Auto-Remediation Engine", "1-click fixes applied directly to your AWS account")

remediable = [
    ("S3_PUBLIC_ACCESS_BLOCK_OFF",    "Enable S3 Block Public Access",        "Enables all 4 BPA settings on the bucket",              "LOW",    EMERALD),
    ("S3_BUCKET_ACL_PUBLIC",          "Set S3 bucket ACL to private",          "Removes public grants from the bucket ACL",             "MEDIUM", YELLOW),
    ("EC2_EBS_DEFAULT_ENCRYPTION_OFF","Enable EBS default encryption",          "Enables EBS encryption by default in this region",      "LOW",    EMERALD),
    ("CLOUDTRAIL_NOT_LOGGING",        "Start CloudTrail logging",               "Calls StartLogging on the identified trail",             "LOW",    EMERALD),
    ("CLOUDTRAIL_LOG_VALIDATION_DISABLED","Enable log file validation",         "Enables log integrity validation on the trail",          "LOW",    EMERALD),
    ("GITHUB_ORG_MFA_NOT_REQUIRED",   "Enforce 2FA on GitHub org",             "Requires 2FA for all members (high impact — confirm!)",  "HIGH",   RED),
]

col_w = [3.5, 3.0, 3.5, 1.5]
col_x = [0.3, 3.9, 7.0, 10.6]
headers = ["Check ID", "Action", "What Happens", "Risk"]

for ci, (hdr, cw) in enumerate(zip(headers, col_w)):
    add_rect(s, col_x[ci], 1.28, cw, 0.38, fill=EMERALD_D)
    add_text(s, hdr, col_x[ci]+0.05, 1.3, cw-0.1, 0.35,
             font_size=Pt(12), bold=True, color=WHITE, align=PP_ALIGN.CENTER)

for ri, (check_id, action, what, risk, clr) in enumerate(remediable):
    y = 1.7 + ri * 0.56
    fill = BG_CARD if ri % 2 == 0 else RGBColor(0x14, 0x14, 0x22)
    row_data = [check_id, action, what, risk]
    for ci, (txt, cw) in enumerate(zip(row_data, col_w)):
        add_rect(s, col_x[ci], y, cw, 0.53, fill=fill)
        if ci == 3:
            rc = RED if risk == "HIGH" else (YELLOW if risk == "MEDIUM" else EMERALD)
            add_text(s, txt, col_x[ci]+0.05, y+0.08, cw-0.1, 0.38, font_size=Pt(11), bold=True, color=rc, align=PP_ALIGN.CENTER)
        elif ci == 0:
            add_text(s, txt, col_x[ci]+0.05, y+0.08, cw-0.1, 0.38, font_size=Pt(9),  color=EMERALD, align=PP_ALIGN.LEFT)
        else:
            add_text(s, txt, col_x[ci]+0.05, y+0.08, cw-0.1, 0.38, font_size=Pt(11), color=WHITE_60, align=PP_ALIGN.LEFT)

# Flow
card(s, 0.3, 5.15, 12.65, 2.1, border=EMERALD)
flow = [
    ("Click 'Auto-Fix'", "Dry-run preview shown:\naction + risk level"),
    ("Confirm",          "User clicks 'Yes, apply fix'\n(required — never silent)"),
    ("VigiliCloud calls", "boto3 write API called\nwith scoped credentials"),
    ("Finding → FIXED",  "Audit log entry created\nwith timestamp + user"),
    ("Re-scan",          "Next scan verifies\nthe fix held"),
]
for i, (title, body) in enumerate(flow):
    x = 0.5 + i * 2.52
    add_text(s, title, x, 5.3,  2.3, 0.4, font_size=Pt(12), bold=True, color=EMERALD, align=PP_ALIGN.CENTER)
    add_text(s, body,  x, 5.72, 2.3, 0.9, font_size=Pt(11), color=WHITE_60, align=PP_ALIGN.CENTER)
    if i < 4:
        add_text(s, "→", x+2.25, 5.9, 0.35, 0.4, font_size=Pt(18), color=EMERALD, align=PP_ALIGN.CENTER)

add_speaker_notes(s,
"""SLIDE 8 — AUTO-REMEDIATION (2 min)

This is the feature that moves us from 'scan and report' to 'scan and fix.'

Six supported fixes today. The most impactful:
- S3 Block Public Access: The #1 misconfiguration causing data breaches. One click enables all 4 Block Public Access settings.
- EBS default encryption: Ensures all future volumes are encrypted by default in your region.
- CloudTrail logging: If CloudTrail exists but is stopped (a common misconfig), we restart it.
- GitHub 2FA enforcement: High-risk because it removes org members who haven't set up 2FA — so we require extra confirmation.

Safety model: every remediation requires an explicit confirm=true. There's a dry-run preview first. Every action is logged in the audit trail with who triggered it and when. The same IAM role used for scanning is used for the fix — so it needs write permissions for the specific resource.

This is what Wiz's auto-remediation does. Wiz charges $15,000+/year for it.""")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 9 — Tech Stack
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(blank_layout)
bg(s)
slide_header(s, "Architecture & Tech Stack", "Lean, modern, production-grade — 31 tests all green")

layers = [
    ("Frontend",       "Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · dark theme + emerald accents", EMERALD, 0.35, 1.32, 12.6),
    ("Backend API",    "FastAPI (Python 3.12) · 14 Routers · Session Auth · RBAC · Rate Limiting · Fernet encryption", BLUE, 0.35, 2.22, 12.6),
    ("Worker Engine",  "Python 3.12 · boto3 · 10 AWS checks · GitHub REST API · Evidence snapshot storage",   PURPLE, 0.35, 3.12, 12.6),
    ("Database",       "PostgreSQL (Render) · SQLite fallback · evidence_snapshots table for SOC2 Type II",  YELLOW, 0.35, 4.02, 12.6),
    ("AI Layer",       "Anthropic Claude Haiku · /ai-analysis · per-finding chat (streaming SSE)",            EMERALD, 0.35, 4.92, 12.6),
]

for (label, desc, clr, x, y, w) in layers:
    card(s, x, y, w, 0.82, border=clr)
    add_text(s, label, x+0.2, y+0.08, 2.6, 0.38, font_size=Pt(14), bold=True, color=clr)
    add_text(s, desc,  x+3.0, y+0.08, 9.4, 0.7,  font_size=Pt(12), color=WHITE_60)

card(s, 0.35, 5.88, 6.1, 1.4, border=BLUE)
add_text(s, "Security Posture", 0.55, 5.95, 5.7, 0.35, font_size=Pt(12), bold=True, color=BLUE)
add_text(s,
    "CORS: specific origins only (no wildcard)\n"
    "Secrets: Fernet AES encrypted at rest\n"
    "Auth: session cookies, 12-hr TTL, rate-limited\n"
    "Tests: 31 automated tests, all passing",
    0.55, 6.32, 5.7, 0.9, font_size=Pt(11), color=WHITE_60)

card(s, 6.6, 5.88, 6.45, 1.4, border=PURPLE)
add_text(s, "Deployment", 6.8, 5.95, 6.0, 0.35, font_size=Pt(12), bold=True, color=PURPLE)
add_text(s,
    "Render.com · auto-deploy on push to main\n"
    "Backend: vigilicloud-api.onrender.com\n"
    "Frontend: vigilicloud-ui.onrender.com\n"
    "DB: Postgres (upgrade from free tier June 2026)",
    6.8, 6.32, 6.0, 0.9, font_size=Pt(11), color=WHITE_60)

add_speaker_notes(s,
"""SLIDE 9 — TECH STACK (2 min)

14 FastAPI routers: auth, accounts, scans, billing, compliance, integrations, approvals, fix_guidance, audit, developer, admin, msp, org_notes, remediation.

Key security decisions:
- CORS: specific allowed origins, not wildcard. allow_credentials=True is safe because origins are explicit.
- Secrets: GitHub tokens, Jira API tokens stored encrypted with Fernet (AES 128 GCM). SECRETS_ENCRYPTION_KEY env var.
- Rate limiting: per-IP, per-endpoint. Auth endpoints have stricter limits.
- RBAC: admin/user/viewer enforced on every endpoint with require_admin() / require_non_viewer() guards.

Evidence snapshots table stores: scan_id, check_id, resource_id, status (PASS/FAIL), evidence JSON, collected_at timestamp. Indexed on check_id + collected_at for fast control history queries.

31 tests: function-scoped TestClient (no cookie leakage between tests), SQLite WAL mode (no lock contention), rate-limit bypass in test mode.""")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 10 — Competitor Comparison
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(blank_layout)
bg(s)
slide_header(s, "Head-to-Head Comparison", "VigiliCloud vs Drata, Vanta, Secureframe, Wiz, Orca")

caps = [
    "AWS posture checks",
    "SOC2 control mapping",
    "ISO 27001 / PCI / NIST",
    "GitHub / SaaS checks",
    "Auto-remediation",
    "Evidence auto-collection",
    "Risk score (A–F)",
    "RBAC (admin/viewer)",
    "AI analysis",
    "IaC fix generation",
    "Self-serve signup",
    "Pricing / mo",
]

# VigiliCloud · Drata · Vanta · Secureframe · Wiz · Orca
TICK  = "✓"
CROSS = "✗"
SOME  = "~"

rows = [
    (TICK,  TICK,  TICK,  TICK,  TICK,  TICK),   # AWS checks
    (TICK,  TICK,  TICK,  TICK,  SOME,  SOME),   # SOC2 mapping
    (TICK,  TICK,  TICK,  TICK,  CROSS, CROSS),  # ISO/PCI/NIST
    (TICK,  TICK,  TICK,  TICK,  CROSS, CROSS),  # GitHub/SaaS
    (TICK,  SOME,  SOME,  SOME,  TICK,  TICK),   # Auto-remediation
    (TICK,  TICK,  TICK,  TICK,  CROSS, CROSS),  # Evidence
    (TICK,  SOME,  TICK,  TICK,  TICK,  TICK),   # Risk score
    (TICK,  TICK,  TICK,  TICK,  TICK,  TICK),   # RBAC
    (TICK,  CROSS, CROSS, CROSS, SOME,  CROSS),  # AI analysis
    (TICK,  CROSS, CROSS, CROSS, SOME,  CROSS),  # IaC fix gen
    (TICK,  CROSS, CROSS, CROSS, CROSS, CROSS),  # Self-serve
    ("$99", "$1,250","$800","$600","$15k+","$25k+"),  # Pricing
]

vendors = ["VigiliCloud", "Drata", "Vanta", "Secureframe", "Wiz", "Orca"]
col_x2 = [0.28, 3.3, 5.35, 7.4, 9.45, 11.0, 12.15]
col_w2 = [2.95, 1.95, 1.95, 1.95, 1.45, 1.1]

# Header
add_rect(s, 0.28, 1.28, 2.95, 0.44, fill=BG_CARD)
for vi, (vendor, cw) in enumerate(zip(vendors, col_w2)):
    clr_v = EMERALD if vi == 0 else WHITE_60
    bg_v  = EMERALD_D if vi == 0 else BG_CARD
    add_rect(s, col_x2[vi+1], 1.28, cw, 0.44, fill=bg_v)
    add_text(s, vendor, col_x2[vi+1], 1.3, cw, 0.4,
             font_size=Pt(10), bold=True, color=clr_v, align=PP_ALIGN.CENTER)

for ri, (cap, row_vals) in enumerate(zip(caps, rows)):
    y = 1.75 + ri * 0.4
    fill = BG_CARD if ri % 2 == 0 else RGBColor(0x14, 0x14, 0x22)
    add_rect(s, 0.28, y, 2.95, 0.38, fill=fill)
    add_text(s, cap, 0.35, y+0.05, 2.8, 0.3, font_size=Pt(10), color=WHITE_60)
    for vi, (val, cw) in enumerate(zip(row_vals, col_w2)):
        add_rect(s, col_x2[vi+1], y, cw, 0.38, fill=fill)
        vc = EMERALD if val == TICK else (RED if val == CROSS else YELLOW)
        fs = Pt(10) if val in (TICK, CROSS, SOME) else Pt(9)
        add_text(s, val, col_x2[vi+1], y+0.05, cw, 0.3,
                 font_size=fs, bold=(val in (TICK, CROSS)), color=vc, align=PP_ALIGN.CENTER)

add_speaker_notes(s,
"""SLIDE 10 — COMPETITOR COMPARISON (2 min)

Where VigiliCloud wins clearly:
- AI analysis: nobody at our price point has Claude generating exec summaries and per-finding chat.
- IaC fix generation: Terraform + CDK snippets for every finding — no competitor does this.
- Self-serve signup: Drata, Vanta, Secureframe all require a sales call to get started. We're instant.
- Auto-remediation: We now match Wiz/Orca on this. Drata/Vanta/Secureframe only have partial auto-fix.
- Pricing: $99/mo vs $800-1,250/mo for Drata/Vanta. 10x cheaper.

Where we're still catching up:
- SaaS integrations (Okta, Google Workspace, HR tools) — Drata has 100+. We have GitHub + AWS.
- Continuous evidence collection: our evidence_snapshots now match what they do, but we need more SaaS coverage.

The honest pitch: "If your compliance scope is AWS-only + GitHub, VigiliCloud covers 80% of what Drata does at 10% of the cost, plus AI features Drata doesn't have." """)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 11 — Pricing Plans
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(blank_layout)
bg(s)
slide_header(s, "Pricing Plans", "Flat pricing — not per-finding; 2-week free trial on all plans")

plans = [
    ("Free",    "₹0",       "$0",      "1 acct",      WHITE_60),
    ("Starter", "₹8,299",   "~$99",    "3 accts",     BLUE),
    ("Pro",     "₹24,999",  "~$299",   "10 accts",    EMERALD),
    ("MSP",     "₹83,499+", "~$999+",  "Unlimited",   PURPLE),
]
features_rows = [
    ("19+ Security Checks",      ["✓","✓","✓","✓"]),
    ("Framework Coverage %",     ["✓","✓","✓","✓"]),
    ("Fix Guidance (CLI/TF)",    ["✓","✓","✓","✓"]),
    ("Risk Score (A–F)",         ["✓","✓","✓","✓"]),
    ("Auto-Remediation",         ["✗","✓","✓","✓"]),
    ("CSV / JSON / PDF Export",  ["✗","✓","✓","✓"]),
    ("AI Executive Summary",     ["✗","✗","✓","✓"]),
    ("Scheduled Daily Scans",    ["✗","✗","✓","✓"]),
    ("Drift Monitoring",         ["✓","✓","✓","✓"]),
    ("Evidence Timeline",        ["✗","✓","✓","✓"]),
    ("Approval Workflows",       ["✗","✗","✓","✓"]),
    ("Jira + GitHub Sync",       ["✗","✗","✓","✓"]),
    ("Multi-Tenant (MSP)",       ["✗","✗","✗","✓"]),
    ("Support",                  ["Email","Email","Email","Priority"]),
]

col_xs = [0.25, 3.45, 5.75, 8.05, 10.35]
col_w  = [3.1, 2.2, 2.2, 2.2, 2.2]

for i, (name, inr, usd, accts, clr) in enumerate(plans):
    x = col_xs[i+1]
    w = col_w[i+1]
    add_rect(s, x, 1.28, w, 1.4, fill=BG_CARD, line_color=clr, line_width=Pt(1.5))
    add_text(s, name,                    x, 1.3,   w, 0.38, font_size=Pt(15), bold=True, color=clr,     align=PP_ALIGN.CENTER)
    add_text(s, inr,                     x, 1.65,  w, 0.42, font_size=Pt(20), bold=True, color=WHITE,   align=PP_ALIGN.CENTER)
    add_text(s, f"{usd}/mo  ·  {accts}", x, 2.08,  w, 0.35, font_size=Pt(10), color=WHITE_60, align=PP_ALIGN.CENTER)

add_text(s, "Feature", col_xs[0]+0.1, 1.3, col_w[0]-0.2, 1.4, font_size=Pt(13), bold=True, color=WHITE_60)

for ri, (feat, vals) in enumerate(features_rows):
    y    = 2.68 + ri * 0.33
    fill = BG_CARD if ri % 2 == 0 else RGBColor(0x14, 0x14, 0x22)
    add_rect(s, col_xs[0], y, col_w[0], 0.32, fill=fill)
    add_text(s, feat, col_xs[0]+0.1, y+0.04, col_w[0]-0.15, 0.26, font_size=Pt(10), color=WHITE_60)
    for ci, (val, (_, _, _, _, clr)) in enumerate(zip(vals, plans)):
        add_rect(s, col_xs[ci+1], y, col_w[ci+1], 0.32, fill=fill)
        vc = EMERALD if val == "✓" else (RED if val == "✗" else YELLOW)
        add_text(s, val, col_xs[ci+1], y+0.04, col_w[ci+1], 0.26,
                 font_size=Pt(11), color=vc, bold=(val in ("✓","✗")), align=PP_ALIGN.CENTER)

add_speaker_notes(s,
"""SLIDE 11 — PRICING (2 min)

Flat-rate pricing. No per-finding, no per-resource surprises.

FREE: 1 account, all checks, fix guidance, risk score, framework coverage. No credit card.

STARTER $99/mo: 3 accounts + auto-remediation + exports. The SMB tier. A startup with dev/staging/prod accounts can fully comply for less than they spend on a single AWS bill line item.

PRO $299/mo: 10 accounts + AI analysis + scheduled daily scans + evidence timeline for SOC2 Type II. This is the compliance-team tier.

MSP $999+/mo: Unlimited accounts, multi-tenant, priority support. For agencies charging clients per-account.

Key comparison: Drata starts at $1,250/month for 1 environment and requires a sales call. We're at $99/month, self-serve, with a 2-week free trial. That's the opening.""")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 12 — Roadmap
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(blank_layout)
bg(s)
slide_header(s, "Roadmap & Vision", "Phase 1 live and complete · Phase 2 in progress · Phase 3 is the big bet")

phases = [
    ("Phase 1\n(Live Now)", "NOW",
     [
         "✓ 19+ checks: AWS + GitHub",
         "✓ SOC2 / ISO / PCI / NIST mapping",
         "✓ Framework coverage % bars",
         "✓ Risk score A→F grade",
         "✓ Auto-remediation (6 fixes)",
         "✓ Evidence timeline (SOC2 II)",
         "✓ Share report / auditor portal",
         "✓ RBAC: admin/user/viewer",
         "✓ AI summaries + per-finding chat",
         "✓ Approval workflows + drift",
         "✓ Jira + GitHub + Slack + REST API",
         "✓ MSP multi-tenant mode",
         "✓ 31 automated tests, all green",
         "✓ Razorpay billing (3 plans)",
     ],
     EMERALD),
    ("Phase 2\n(2026 H2)", "6 MO",
     [
         "→ Google Workspace integration",
         "   (2FA, SSO, Drive sharing checks)",
         "→ Okta + Jira SaaS checks",
         "→ Azure CIS Benchmark",
         "→ GCP security scanning",
         "→ HIPAA + PCI custom frameworks",
         "→ White-label MSP branding",
         "→ Upgrade DB (Render → RDS)",
         "→ More auto-remediation fixes",
         "→ SIEM integrations (Splunk, DD)",
     ],
     BLUE),
    ("Phase 3\n(2027+)", "FUTURE",
     [
         "★ MCP AI Execution Engine",
         "   detect → propose → approve → fix",
         "   Claude proposes, human approves,",
         "   AWS executes — fully audited",
         "",
         "★ Multi-Cloud Unified Dashboard",
         "   AWS + Azure + GCP side-by-side",
         "",
         "★ 24/7 Real-Time Monitoring",
         "   CloudTrail event stream alerting",
         "   Sub-minute breach detection",
     ],
     PURPLE),
]

for i, (title, badge, items, clr) in enumerate(phases):
    x = 0.3 + i * 4.35
    card(s, x, 1.35, 4.1, 5.9, border=clr)
    add_rect(s, x+0.1, 1.45, 3.0, 0.5, fill=clr)
    add_text(s, title, x+0.1, 1.45, 3.0, 0.5, font_size=Pt(13), bold=True, color=BG_DARK, align=PP_ALIGN.CENTER)
    add_rect(s, x+3.2, 1.48, 0.75, 0.42, fill=BG_DARK)
    add_text(s, badge, x+3.2, 1.48, 0.75, 0.42, font_size=Pt(10), bold=True, color=clr, align=PP_ALIGN.CENTER)
    for j, item in enumerate(items):
        y = 2.05 + j * 0.36
        add_text(s, item, x+0.15, y, 3.8, 0.34,
                 font_size=Pt(10), color=WHITE_60 if not item.startswith("★") else WHITE,
                 bold=item.startswith("★"))

add_speaker_notes(s,
"""SLIDE 12 — ROADMAP (2 min)

PHASE 1 is done — 14 items shipped and running in production, including the new auto-remediation, GitHub compliance, evidence timeline, RBAC, and SOC2/ISO/PCI/NIST coverage mapping. 31 tests all green.

PHASE 2 focus: SaaS integrations. The single biggest gap vs Drata/Vanta is SaaS coverage — Google Workspace, Okta, Jira. Google Workspace alone covers 30%+ of SOC2 CC6 (SSO enforcement, 2FA for all users, Drive sharing settings). Adding this + Azure = we can credibly replace Drata for AWS+GCP shops.

PHASE 3 vision: MCP AI Execution Engine. Claude doesn't just analyze — it proposes specific fixes, a human approves each one, and VigiliCloud executes them via AWS SDK. Full audit trail. This is the "self-healing cloud" vision that no tool at any price point fully delivers today.""")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 13 — Live Demo Flow
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(blank_layout)
bg(s)
slide_header(s, "Live Demo Walkthrough", "What to show in 5–7 minutes")

demo_steps = [
    ("1", "Sign In + Dashboard",   "Login as admin\nSee risk grade D·52/100 and compliance bars",            EMERALD),
    ("2", "Run Scan",              "Connect account → Run Scan\nWatch: 2-minute async scan with progress",    BLUE),
    ("3", "Compliance Coverage",   "Show SOC2 22% / ISO 42% / PCI 50% / NIST 42%\nExplain 3 root causes",   PURPLE),
    ("4", "Finding + Auto-Fix",    "Click S3_PUBLIC_ACCESS_BLOCK_OFF\nShow Auto-Fix button → dry-run → confirm", YELLOW),
    ("5", "GitHub Findings",       "Show GITHUB_ORG_MFA_NOT_REQUIRED finding\nMap to SOC2 CC6.1/CC6.2",      RED),
    ("6", "Drift View",            "Compare to prev scan\nNew issues red · Fixed green",                      EMERALD),
    ("7", "AI Analysis",           "Generate executive summary\nShow per-finding AI chat",                    BLUE),
    ("8", "Share Auditor Report",  "Click Share → copy 30-day link\nOpen in incognito — auditor view",        PURPLE),
]

for i, (num, title, steps, clr) in enumerate(demo_steps):
    col = i % 2
    row = i // 2
    x = 0.3  + col * 6.55
    y = 1.38 + row * 1.5
    card(s, x, y, 6.3, 1.4, border=clr)
    add_text(s, num,   x+0.12, y+0.1, 0.5, 0.5, font_size=Pt(22), bold=True, color=clr)
    add_text(s, title, x+0.65, y+0.1, 5.5, 0.45, font_size=Pt(14), bold=True, color=WHITE)
    add_text(s, steps, x+0.65, y+0.6, 5.5, 0.72, font_size=Pt(11), color=WHITE_60)

add_speaker_notes(s,
"""SLIDE 13 — DEMO NOTES

Before presenting: sign in, have a completed scan with findings, have GitHub token configured in Settings.

Step 3 is the anchor: "Most tools say 'you have 4 findings.' We say 'you're 22% compliant with SOC2. Here's the exact list of failing controls. Fix these 3 things and you jump to 85%.'" Let that land.

Step 4 is the showstopper: click Auto-Fix on S3_PUBLIC_ACCESS_BLOCK_OFF, show the dry-run preview, click confirm, show the success message. "That just ran put_public_access_block on your AWS bucket. Live. In your account. Wiz does this for $15k/year."

Step 8: open the share link in incognito to show the auditor view — no login required, read-only evidence.""")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 14 — Summary & Next Steps
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(blank_layout)
bg(s)
slide_header(s, "Summary & Next Steps", "What we built, where we're going, how you can help")

card(s, 0.3, 1.35, 7.9, 3.9, border=EMERALD)
add_text(s, "Key Takeaways", 0.5, 1.5, 7.5, 0.45, font_size=Pt(15), bold=True, color=EMERALD)
takeaways = [
    "✓  Live production SaaS — not a prototype",
    "✓  19+ checks: AWS (CIS v1.4) + GitHub org compliance",
    "✓  SOC2 / ISO 27001 / PCI DSS / NIST framework coverage %",
    "✓  Auto-remediation: 1-click S3, EBS, CloudTrail, GitHub fixes",
    "✓  SOC2 Type II: continuous evidence snapshots per control",
    "✓  AI: executive summaries + per-finding chat (streaming)",
    "✓  RBAC, approval workflows, auditor share portal",
    "✓  31 automated tests · CORS-hardened · secrets encrypted",
    "✓  3 billing tiers: $99 → $299 → $999+ (INR pricing via Razorpay)",
]
for i, t in enumerate(takeaways):
    add_text(s, t, 0.5, 2.05 + i*0.38, 7.6, 0.36, font_size=Pt(12), color=WHITE_60)

card(s, 8.4, 1.35, 4.6, 3.9, border=BLUE)
add_text(s, "Next Actions", 8.6, 1.5, 4.2, 0.45, font_size=Pt(15), bold=True, color=BLUE)
actions = [
    ("🔴", "Upgrade DB",          "Render DB expires 2026-06-03"),
    ("🟡", "Google Workspace",    "Add to Phase 2 — closes SaaS gap"),
    ("🟡", "Azure checks",        "Start CIS Azure Benchmark checks"),
    ("🟢", "Demo prep",           "Seed demo account + findings"),
    ("🟢", "Pricing review",      "USD pricing page for global"),
    ("🟢", "Marketing site",      "vigilicloud.com landing page"),
]
for i, (dot, act, note) in enumerate(actions):
    y = 2.0 + i * 0.52
    add_text(s, dot,  8.5,  y,      0.35, 0.45, font_size=Pt(14))
    add_text(s, act,  8.85, y,      2.2,  0.35, font_size=Pt(12), bold=True, color=WHITE)
    add_text(s, note, 8.85, y+0.28, 3.9,  0.26, font_size=Pt(10), color=WHITE_60)

card(s, 0.3, 5.35, 12.65, 1.4, border=EMERALD)
add_text(s,
    "\"From 2-day manual audits → 2-minute automated compliance scans.\n"
    "Auto-remediation + AI summaries + continuous SOC2 evidence — at 1/10th the price of Drata.\n"
    "VigiliCloud is the compliance tool AWS SMBs have been waiting for.\"",
    0.5, 5.45, 12.2, 1.2,
    font_size=Pt(14), italic=True, color=WHITE, align=PP_ALIGN.CENTER)

add_text(s, "app.vigilicloud.com  ·  vigilicloud-api.onrender.com  ·  leelakrishna1739@gmail.com",
         0.3, 6.9, 12.65, 0.35, font_size=Pt(12), color=WHITE_60, align=PP_ALIGN.CENTER)

add_speaker_notes(s,
"""SLIDE 14 — CLOSING (2 min)

Three things to remember:
1. This is a complete product. 19+ checks, 4 frameworks, auto-remediation, AI analysis, evidence collection — all deployed, all tested, all live.
2. We now match Drata/Vanta on compliance framework coverage, and beat them on auto-remediation + AI features. At 10x lower price.
3. The gap to close is SaaS integrations (Google Workspace, Okta) — that's a 2-3 week build that would let us fully replace Drata for AWS-only companies.

Immediate next: upgrade the Render DB (expires June 3), then start Google Workspace integration.""")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 15 — Q&A
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(blank_layout)
bg(s)
emerald_bar(s, 0, 0.08)
emerald_bar(s, 7.42, 0.08)

add_text(s, "Questions?", 1, 2.0, 11.33, 1.4,
         font_size=Pt(72), bold=True, color=WHITE, align=PP_ALIGN.CENTER)
add_text(s, "Thank you for your time.", 1, 3.5, 11.33, 0.7,
         font_size=Pt(22), color=WHITE_60, align=PP_ALIGN.CENTER)

links = [
    ("Product",   "app.vigilicloud.com"),
    ("API",       "vigilicloud-api.onrender.com"),
    ("Contact",   "leelakrishna1739@gmail.com"),
    ("Code",      "github.com/KoppoluLeelaKrishna\ncompliance-ai-saas"),
]
for i, (label, val) in enumerate(links):
    x = 1.5 + i * 2.6
    card(s, x, 4.6, 2.3, 1.5, border=EMERALD)
    add_text(s, label, x, 4.7,  2.3, 0.45, font_size=Pt(13), bold=True, color=EMERALD, align=PP_ALIGN.CENTER)
    add_text(s, val,   x, 5.15, 2.3, 0.8,  font_size=Pt(10), color=WHITE_60, align=PP_ALIGN.CENTER)

add_text(s, "VigiliCloud — AWS + GitHub Compliance, Made Simple.", 1, 6.9, 11.33, 0.4,
         font_size=Pt(13), italic=True, color=WHITE_60, align=PP_ALIGN.CENTER)

add_speaker_notes(s,
"""Q&A PREP:

Q: How does auto-remediation work safely?
A: Dry-run preview first — shows what will change. Requires explicit confirm=true. Uses the same scoped IAM role. Every action logged with timestamp and user. The user can re-scan immediately to verify the fix held.

Q: Does GitHub scanning require admin access?
A: The token needs read:org + repo scope. For branch protection checks it needs admin:org. We never store the token in plaintext — it's Fernet-encrypted at rest.

Q: How does SOC2 Type II evidence work?
A: Every scan stores a timestamped snapshot per finding (check_id + resource_id + status + evidence JSON). Run daily via APScheduler → 365 days of evidence accumulates passively. The /remediation/controls/{check_id}/history endpoint shows the full pass/fail timeline — that's what you export for an auditor.

Q: What's the Google Workspace gap?
A: Org-level 2FA enforcement, SSO configuration, external Drive sharing settings — these cover SOC2 CC6 controls auditors check. A 2-3 week build using Google Admin SDK.

Q: Self-host?
A: Docker-compose works locally. We could add self-hosted enterprise tier in Phase 2.""")


# ── Save ──────────────────────────────────────────────────────────────────────
output_path = r"c:\Users\leela\compliance-ai-saas\VigiliCloud_Team_Presentation_v4.pptx"
prs.save(output_path)
print(f"Saved: {output_path}")
print(f"Slides: {len(prs.slides)}")
