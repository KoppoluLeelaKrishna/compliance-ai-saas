"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { AuthMe } from "@/types";

/* ════════════════════════════════════════════════════
   STARFIELD + SHOOTING STARS + CONSTELLATION
════════════════════════════════════════════════════ */
function CanvasParticles() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number, frame = 0, nextShoot = 180;
    let mx = -999, my = -999;

    const resize = () => {
      const { offsetWidth: w, offsetHeight: h } = canvas;
      if (w && h) { canvas.width = w; canvas.height = h; }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    canvas.parentElement?.addEventListener("mousemove", (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mx = e.clientX - r.left; my = e.clientY - r.top;
    }, { passive: true });

    interface Star { x: number; y: number; vx: number; vy: number; r: number; bright: number; ts: number; to: number; }
    interface Shooter { x: number; y: number; vx: number; vy: number; life: number; max: number; }

    const N = 140;
    const W = () => canvas.width  || 1400;
    const H = () => canvas.height || 900;
    const stars: Star[] = Array.from({ length: N }, () => ({
      x: Math.random() * W(), y: Math.random() * H(),
      vx: (Math.random() - 0.5) * 0.16, vy: (Math.random() - 0.5) * 0.16,
      r: Math.pow(Math.random(), 2.2) * 2.4 + 0.25,
      bright: Math.random() * 0.55 + 0.28,
      ts: Math.random() * 0.016 + 0.004,
      to: Math.random() * Math.PI * 2,
    }));

    const shooters: Shooter[] = [];
    const LINK = 115;

    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, W(), H());

      /* Shooting stars */
      if (--nextShoot <= 0) {
        shooters.push({ x: Math.random() * W() * 0.65, y: Math.random() * H() * 0.38, vx: 10 + Math.random() * 8, vy: 3 + Math.random() * 5, life: 0, max: 30 + Math.floor(Math.random() * 28) });
        nextShoot = 220 + Math.floor(Math.random() * 380);
      }
      for (let i = shooters.length - 1; i >= 0; i--) {
        const s = shooters[i];
        const a = Math.sin((s.life / s.max) * Math.PI) * 0.92;
        const len = 12;
        const g = ctx.createLinearGradient(s.x - s.vx * len, s.y - s.vy * len, s.x, s.y);
        g.addColorStop(0, "transparent");
        g.addColorStop(0.6, `rgba(180,220,255,${a * 0.5})`);
        g.addColorStop(1, `rgba(220,240,255,${a})`);
        ctx.beginPath();
        ctx.moveTo(s.x - s.vx * len, s.y - s.vy * len);
        ctx.lineTo(s.x, s.y);
        ctx.strokeStyle = g; ctx.lineWidth = 1.8; ctx.stroke();
        /* Head glow */
        const hg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 4);
        hg.addColorStop(0, `rgba(200,230,255,${a})`); hg.addColorStop(1, "transparent");
        ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); ctx.fillStyle = hg; ctx.fill();
        s.x += s.vx; s.y += s.vy; s.life++;
        if (s.life >= s.max) shooters.splice(i, 1);
      }

      /* Update stars */
      stars.forEach(p => {
        const dx = p.x - mx, dy = p.y - my, md = Math.hypot(dx, dy);
        if (md < 140 && md > 0) { p.vx += (dx / md) * 0.055; p.vy += (dy / md) * 0.055; }
        p.vx *= 0.975; p.vy *= 0.975;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 0.55) { p.vx *= 0.55 / sp; p.vy *= 0.55 / sp; }
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W(); else if (p.x > W()) p.x = 0;
        if (p.y < 0) p.y = H(); else if (p.y > H()) p.y = 0;
      });

      /* Constellation lines */
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const d = Math.hypot(stars[i].x - stars[j].x, stars[i].y - stars[j].y);
        if (d < LINK) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(100,160,255,${(1 - d / LINK) * 0.13})`;
          ctx.lineWidth = 0.55;
          ctx.moveTo(stars[i].x, stars[i].y); ctx.lineTo(stars[j].x, stars[j].y);
          ctx.stroke();
        }
      }

      /* Draw stars */
      stars.forEach(p => {
        const tw = (Math.sin(frame * p.ts + p.to) + 1) * 0.5;
        const op = p.bright * (0.32 + tw * 0.68);
        if (p.r > 1.1) {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
          g.addColorStop(0, `rgba(190,220,255,${op * 0.42})`);
          g.addColorStop(1, "transparent");
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
          ctx.fillStyle = g; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(215,230,255,${op})`; ctx.fill();
      });

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }} />;
}

/* ════════════════════════════════════════════════════
   3D TILT CARD
════════════════════════════════════════════════════ */
function TiltCard({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  const card  = useRef<HTMLDivElement>(null);
  const glare = useRef<HTMLDivElement>(null);

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = card.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top)  / r.height;
    el.style.transform = `perspective(700px) rotateX(${(0.5 - y) * 16}deg) rotateY(${(x - 0.5) * 16}deg) scale(1.02)`;
    const gr = glare.current;
    if (gr) { gr.style.opacity = "1"; gr.style.background = `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(255,255,255,0.11), transparent 58%)`; }
  }, []);

  const onLeave = useCallback(() => {
    const el = card.current;
    if (el) el.style.transform = "perspective(700px) rotateX(0deg) rotateY(0deg) scale(1)";
    const gr = glare.current;
    if (gr) gr.style.opacity = "0";
  }, []);

  return (
    <div ref={card} className={className} onMouseMove={onMove} onMouseLeave={onLeave}
      style={{ ...style, transition: "transform 0.12s cubic-bezier(0.22,1,0.36,1)", transformStyle: "preserve-3d", position: style?.position ?? "relative" }}>
      <div ref={glare} style={{ position: "absolute", inset: 0, borderRadius: "inherit", opacity: 0, transition: "opacity 0.25s", pointerEvents: "none", zIndex: 10 }} />
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   CURSOR GLOW
════════════════════════════════════════════════════ */
function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const move = (e: MouseEvent) => { el.style.left = `${e.clientX}px`; el.style.top = `${e.clientY}px`; el.style.opacity = "1"; };
    window.addEventListener("mousemove", move, { passive: true });
    return () => window.removeEventListener("mousemove", move);
  }, []);
  return <div ref={ref} className="ap-cursor-glow" style={{ opacity: 0, left: "-999px", top: "-999px" }} />;
}

/* ════════════════════════════════════════════════════
   SCROLL PROGRESS BAR
════════════════════════════════════════════════════ */
function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      el.style.width = max > 0 ? `${(window.scrollY / max) * 100}%` : "0%";
    };
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return <div ref={ref} className="ap-progress-bar" style={{ width: "0%" }} />;
}

/* ════════════════════════════════════════════════════
   HOOKS
════════════════════════════════════════════════════ */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".ap-reveal,.ap-reveal-left,.ap-reveal-right,.ap-reveal-scale,.ap-reveal-blur,.ap-pop");
    const io  = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("ap-visible"); }),
      { threshold: 0.06 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function useCounters() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-count]");
    const io  = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        const target = parseFloat(el.dataset.count ?? "0");
        const dec = parseInt(el.dataset.decimals ?? "0");
        const sfx = el.dataset.suffix ?? "";
        const t0 = performance.now(), dur = 1700;
        const tick = (now: number) => {
          const p = Math.min((now - t0) / dur, 1);
          el.textContent = (( 1 - Math.pow(1 - p, 3)) * target).toFixed(dec) + sfx;
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

function useParallax() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = () => { if (ref.current) ref.current.style.transform = `translateY(${window.scrollY * 0.10}px)`; };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return ref;
}

/* ════════════════════════════════════════════════════
   DESIGN TOKENS
════════════════════════════════════════════════════ */
const C = {
  primary: "#0066cc", primaryDark: "#2997ff",
  ink: "#1d1d1f", inkMuted: "#6e6e73", inkSoft: "#86868b",
  muted: "#a1a1a6", onDark: "#f5f5f7",
  canvas: "#ffffff", parchment: "#f5f5f7",
  tile1: "#272729", tile2: "#2a2a2c", tile3: "#1c1c1e",
  black: "#000000", hairline: "#d2d2d7", divider: "#f0f0f0",
};
const ff = "var(--ff)", fft = "var(--fft)";

/* ── Data ─── */
const STEPS = [
  { num: "01", title: "Connect your AWS account",  desc: "Create a read-only IAM role and paste the ARN. We never store credentials — access is assumed temporarily per scan.", tag: "5 min · Any AWS account" },
  { num: "02", title: "Run a security scan",        desc: "Click Run Scan. VigiliCloud checks all 10 security areas and returns prioritized findings in approximately 2 minutes.", tag: "No agents · No installs" },
  { num: "03", title: "Fix what's wrong",           desc: "Every finding includes the exact AWS Console path, CLI commands, and step-by-step remediation guidance.", tag: "CSV / JSON export" },
];

const BENTO = [
  { title: "S3 Public Access",   desc: "Detects open buckets, public ACLs, and exposed policies before attackers find them.", sev: "Critical", bg: C.tile1,    txt: "#fff", span: 2, h: 300 },
  { title: "Root Access Keys",   desc: "Alerts immediately if your root account has active access keys — the most dangerous risk.", sev: "Critical", bg: C.tile2, txt: "#fff", span: 1, h: 300 },
  { title: "IAM Permissions",    desc: "Flags over-permissioned roles with unnecessary admin access.",                           sev: "High",     bg: C.parchment, txt: C.ink, span: 1, h: 240 },
  { title: "MFA Enforcement",    desc: "Checks every IAM user and root account for missing multi-factor authentication.",        sev: "High",     bg: C.canvas,    txt: C.ink, span: 1, h: 240 },
  { title: "Security Groups",    desc: "Finds EC2 security groups with ports open to the entire internet.",                      sev: "High",     bg: C.parchment, txt: C.ink, span: 1, h: 240 },
  { title: "RDS Encryption",     desc: "Checks RDS instances for unencrypted storage and public accessibility.",                 sev: "High",     bg: C.canvas,    txt: C.ink, span: 2, h: 240 },
  { title: "EBS Encryption",     desc: "Identifies unencrypted EBS volumes and missing default encryption.",                     sev: "Medium",   bg: C.tile1,    txt: "#fff", span: 1, h: 200 },
  { title: "CloudTrail Logging", desc: "Verifies CloudTrail is active, multi-region, with log validation enabled.",             sev: "Medium",   bg: C.tile2,    txt: "#fff", span: 1, h: 200 },
  { title: "VPC Flow Logs",      desc: "Ensures network traffic is logged for security monitoring and forensics.",               sev: "Medium",   bg: C.tile3,    txt: "#fff", span: 1, h: 200 },
  { title: "KMS Key Rotation",   desc: "Checks that customer-managed KMS keys have automatic rotation enabled.",                 sev: "Medium",   bg: C.tile1,    txt: "#fff", span: 1, h: 200 },
];

const GALLERY = [
  { cat: "S3 Buckets",         title: "Public access,\ndetected instantly.", sub: "Every S3 bucket scanned for public ACLs, missing encryption, and misconfigured policies — in seconds.",           accent: "#2997ff" },
  { cat: "IAM Roles",          title: "Least privilege,\nenforced.",          sub: "Detect over-permissioned roles and wildcard policies before they become your biggest attack surface.",             accent: "#a855f7" },
  { cat: "Security Groups",    title: "Every port,\nevery protocol.",          sub: "Find open security group rules exposing your EC2 instances to the entire internet — before attackers do.",         accent: "#f97316" },
  { cat: "CloudTrail Logging", title: "Every action,\naudited.",               sub: "Verify CloudTrail is active and multi-region, with log file validation and S3 delivery confirmed.",               accent: "#14b8a6" },
  { cat: "RDS & EBS",          title: "Encryption,\nnot optional.",            sub: "Check databases and volumes for unencrypted storage — and get the exact remediation command to fix it.",          accent: "#22c55e" },
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

/* ── Helpers ─── */
function SevBadge({ sev, dark }: { sev: string; dark?: boolean }) {
  const lm: Record<string, [string, string, string]> = {
    Critical: ["#dc2626", "rgba(220,38,38,0.10)", "rgba(220,38,38,0.24)"],
    High:     ["#ea580c", "rgba(234,88,12,0.10)",  "rgba(234,88,12,0.24)"],
    Medium:   ["#b45309", "rgba(180,83,9,0.10)",   "rgba(180,83,9,0.24)"],
  };
  const dm: Record<string, [string, string, string]> = {
    Critical: ["#f87171", "rgba(248,113,113,0.14)", "rgba(248,113,113,0.30)"],
    High:     ["#fb923c", "rgba(251,146,60,0.14)",  "rgba(251,146,60,0.30)"],
    Medium:   ["#fbbf24", "rgba(251,191,36,0.14)",  "rgba(251,191,36,0.30)"],
  };
  const [color, bg, border] = (dark ? dm : lm)[sev] ?? lm.Medium;
  return <span style={{ background: bg, border: `1px solid ${border}`, color, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 9999, fontFamily: fft, display: "inline-block", letterSpacing: "0.02em" }}>{sev}</span>;
}

const pill = (bg: string, color: string, border?: string): React.CSSProperties => ({
  display: "inline-block", background: bg, color, fontSize: 17, fontFamily: fft, fontWeight: 400,
  padding: "11px 22px", borderRadius: 9999, border: border ? `1px solid ${border}` : "none",
  letterSpacing: "-0.374px", textDecoration: "none", cursor: "pointer",
});

function Label({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return <div style={{ fontFamily: fft, fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: dark ? C.primaryDark : C.primary, marginBottom: 16 }}>{children}</div>;
}

function H2({ children, dark, center, maxW }: { children: React.ReactNode; dark?: boolean; center?: boolean; maxW?: number }) {
  return (
    <h2 style={{ fontFamily: ff, fontSize: "clamp(34px,4.4vw,48px)", fontWeight: 600, lineHeight: 1.08, letterSpacing: "-0.5px", color: dark ? "#fff" : C.ink, margin: center ? "0 auto 18px" : "0 0 18px", maxWidth: maxW, textAlign: center ? "center" : "left" }}>
      {children}
    </h2>
  );
}

/* ════════════════════════════════════════════════════
   SCROLL GALLERY (Apple sticky-scroll style)
   Uses position:fixed panel shown/hidden via scroll
   because overflow-x:hidden on root breaks sticky.
════════════════════════════════════════════════════ */
function ScrollGallery() {
  const outerRef   = useRef<HTMLDivElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const accentRef  = useRef(GALLERY[0].accent);
  const [on,        setOn]        = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [txtVis,    setTxtVis]    = useState(true);

  /* ── Scroll tracking ── */
  useEffect(() => {
    let lastIdx = 0;
    const onScroll = () => {
      const el = outerRef.current;
      if (!el) return;
      const rect  = el.getBoundingClientRect();
      const total = el.offsetHeight - window.innerHeight;
      // Panel is "on" while outer div occupies the sticky zone
      setOn(rect.top <= 44 && rect.bottom >= window.innerHeight);
      if (total <= 0) return;
      const scrolled = Math.min(-rect.top, total);
      const progress = Math.max(0, Math.min(0.9999, scrolled / total));
      const newIdx = Math.min(GALLERY.length - 1, Math.floor(progress * GALLERY.length));
      if (newIdx !== lastIdx) {
        lastIdx = newIdx;
        setTxtVis(false);
        setTimeout(() => {
          setActiveIdx(newIdx);
          accentRef.current = GALLERY[newIdx].accent;
          setTxtVis(true);
        }, 240);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ── Canvas: rotating particle sphere that shifts accent color ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const hexToRgb = (hex: string) => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];

    const resize = () => {
      const w = canvas.parentElement?.clientWidth  || window.innerWidth;
      const h = canvas.parentElement?.clientHeight || window.innerHeight;
      canvas.width = w; canvas.height = h;
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    interface Pt { x: number; y: number; z: number; vx: number; vy: number; vz: number; r: number; }
    const N = 220;
    const pts: Pt[] = Array.from({ length: N }, () => {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const rad   = 130 + Math.random() * 90;
      return {
        x: rad * Math.sin(phi) * Math.cos(theta),
        y: rad * Math.sin(phi) * Math.sin(theta),
        z: rad * Math.cos(phi),
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        vz: (Math.random() - 0.5) * 0.28,
        r:  Math.random() * 2 + 0.5,
      };
    });

    let raf: number, frame = 0;
    let color = hexToRgb(GALLERY[0].accent).map(Number);

    const tick = () => {
      frame++;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const target = hexToRgb(accentRef.current);
      color = color.map((c, i) => c + (target[i] - c) * 0.025);
      const [cr, cg, cb] = color;

      const cx = W * 0.36, cy = H * 0.5;
      const angle = frame * 0.0018;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);

      const proj = pts.map(p => {
        const rx = p.x * cosA + p.z * sinA;
        const rz = -p.x * sinA + p.z * cosA;
        const sc = 700 / (700 + rz + 200);
        return { sx: cx + rx * sc, sy: cy + p.y * sc, sz: rz, sc, r: p.r * sc };
      }).sort((a, b) => a.sz - b.sz);

      /* Connection lines */
      const LINK = 80;
      for (let i = 0; i < proj.length; i++) {
        for (let j = i + 1; j < proj.length; j++) {
          const dx = proj[i].sx - proj[j].sx, dy = proj[i].sy - proj[j].sy;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d < LINK) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(1 - d / LINK) * 0.18 * proj[i].sc})`;
            ctx.lineWidth   = 0.5;
            ctx.moveTo(proj[i].sx, proj[i].sy);
            ctx.lineTo(proj[j].sx, proj[j].sy);
            ctx.stroke();
          }
        }
      }

      /* Dots + glow */
      proj.forEach(({ sx, sy, r, sz }) => {
        const depth = Math.max(0, Math.min(1, (sz + 250) / 500));
        const alpha = 0.18 + depth * 0.78;
        if (r > 1.4) {
          const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 7);
          glow.addColorStop(0, `rgba(${cr},${cg},${cb},${alpha * 0.28})`);
          glow.addColorStop(1, "transparent");
          ctx.beginPath(); ctx.arc(sx, sy, r * 7, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.3, r), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`; ctx.fill();
      });

      /* Drift + spring back toward origin */
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.z += p.vz;
        const d = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
        if (d > 250) { p.vx -= p.x * 0.0006; p.vy -= p.y * 0.0006; p.vz -= p.z * 0.0006; }
        p.vx *= 0.99; p.vy *= 0.99; p.vz *= 0.99;
      });

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  const panel = GALLERY[activeIdx];

  return (
    <>
      {/* ── Scroll spacer — 5 × 100vh tall ── */}
      <div ref={outerRef} style={{ height: `${GALLERY.length * 100}vh` }} />

      {/* ── Fixed panel — shown while spacer is in sticky zone ── */}
      <div style={{
        position: "fixed",
        top: 44, left: 0, right: 0, bottom: 0,
        background: "#020408",
        zIndex: on ? 150 : -1,
        opacity: on ? 1 : 0,
        transition: "opacity 0.3s ease",
        pointerEvents: on ? "auto" : "none",
      }}>
        {/* Particle canvas — full fixed panel */}
        <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }} />

        {/* Right-side gradient — keeps text legible */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(to right, transparent 30%, #020408 65%)", pointerEvents: "none" }} />

        {/* Top + bottom vignette */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(to bottom, rgba(2,4,8,0.5) 0%, transparent 15%, transparent 75%, rgba(2,4,8,0.8) 100%)", pointerEvents: "none" }} />

        {/* Accent glow behind text */}
        <div style={{ position: "absolute", right: 0, top: "20%", width: 500, height: 500,
          background: `radial-gradient(circle at 80% 50%, ${panel.accent}1a, transparent 70%)`,
          filter: "blur(70px)", pointerEvents: "none", transition: "background 0.8s ease" }} />

        {/* Section label — top left */}
        <div style={{ position: "absolute", top: 32, left: 44, color: "rgba(255,255,255,0.28)", fontFamily: fft, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          Security Checks
        </div>

        {/* Progress pills — right edge */}
        <div style={{ position: "absolute", right: 28, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 10 }}>
          {GALLERY.map((g, i) => (
            <div key={g.cat} style={{
              width: 3, borderRadius: 9999,
              height: i === activeIdx ? 32 : 8,
              background: i === activeIdx ? panel.accent : "rgba(255,255,255,0.18)",
              transition: "all 0.45s cubic-bezier(0.22,1,0.36,1)",
            }} />
          ))}
        </div>

        {/* Text — bottom right */}
        <div style={{
          position: "absolute", right: 64, bottom: 88, maxWidth: 480,
          opacity:   txtVis ? 1 : 0,
          transform: txtVis ? "translateY(0)" : "translateY(28px)",
          transition: "opacity 0.5s cubic-bezier(0.22,1,0.36,1), transform 0.5s cubic-bezier(0.22,1,0.36,1)",
        }}>
          <div style={{ color: panel.accent, fontSize: 11, fontWeight: 700, fontFamily: fft, letterSpacing: "0.13em", textTransform: "uppercase", marginBottom: 16 }}>
            {panel.cat}
          </div>
          <h2 style={{ fontFamily: ff, fontSize: "clamp(34px,4vw,56px)", fontWeight: 700, color: "#fff", lineHeight: 1.05, letterSpacing: "-0.5px", marginBottom: 20, whiteSpace: "pre-line" }}>
            {panel.title}
          </h2>
          <p style={{ fontFamily: fft, fontSize: 17, color: "rgba(255,255,255,0.50)", lineHeight: 1.62, letterSpacing: "-0.2px" }}>
            {panel.sub}
          </p>
        </div>

        {/* Counter — bottom left */}
        <div style={{ position: "absolute", bottom: 88, left: 44, color: "rgba(255,255,255,0.16)", fontFamily: "monospace", fontSize: 11, letterSpacing: "0.1em" }}>
          {String(activeIdx + 1).padStart(2, "0")} — {String(GALLERY.length).padStart(2, "0")}
        </div>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════
   PAGE
════════════════════════════════════════════════════ */
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

  const Words = ({ text, base, color }: { text: string; base: number; color?: string }) => (
    <>
      {text.split(" ").map((w, i) => (
        <span key={i} className="ap-word" style={{ animationDelay: `${base + i * 0.09}s`, ...(color ? { color } : {}) }}>{w}</span>
      ))}
    </>
  );

  return (
    <div style={{ background: C.black, color: C.onDark, fontFamily: ff, overflowX: "hidden" }}>
      <CursorGlow />
      <ScrollProgress />

      {/* ══ NAV ══ */}
      <nav style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "saturate(180%) blur(24px)", WebkitBackdropFilter: "saturate(180%) blur(24px)", height: 44, position: "sticky", top: 0, zIndex: 200, display: "flex", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", width: "100%", padding: "0 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ color: "#fff", fontSize: 15, fontWeight: 600, letterSpacing: "-0.3px", fontFamily: ff, textDecoration: "none" }}>
            VigiliCloud
          </Link>
          <div style={{ display: "flex", gap: 32 }}>
            {[["Features","#features"],["How It Works","#how-it-works"],["Pricing","#pricing"]].map(([l,h]) => (
              <a key={l} href={h} style={{ color: "rgba(255,255,255,0.68)", fontSize: 12, fontFamily: fft, textDecoration: "none" }}>{l}</a>
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {!loading && (authenticated
              ? <Link href="/scans" className="ap-btn" style={pill(C.primary, "#fff")}>Dashboard</Link>
              : <>
                  <Link href="/signin" style={{ color: "rgba(255,255,255,0.68)", fontSize: 12, fontFamily: fft, textDecoration: "none" }}>Sign In</Link>
                  <Link href="/signup" className="ap-btn" style={{ ...pill(C.primary, "#fff"), fontSize: 12, padding: "6px 16px" }}>Get Started</Link>
                </>
            )}
          </div>
        </div>
      </nav>

      {/* ══ HERO ══ */}
      <section style={{ background: "#040a14", minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px 22px 60px", textAlign: "center", position: "relative", overflow: "hidden" }}>

        {/* Starfield canvas */}
        <CanvasParticles />

        {/* Premium aurora blobs — purple / electric-blue / teal */}
        <div className="ap-morph" style={{ position: "absolute", width: 820, height: 820, top: "-18%", left: "-18%", background: "radial-gradient(circle at 40% 50%, rgba(120,40,255,0.22) 0%, rgba(60,0,180,0.10) 45%, transparent 70%)", filter: "blur(80px)", pointerEvents: "none", zIndex: 0 }} />
        <div className="ap-morph" style={{ position: "absolute", width: 700, height: 700, top: "5%", right: "-14%", background: "radial-gradient(circle at 55% 45%, rgba(0,140,255,0.20) 0%, rgba(0,80,200,0.08) 50%, transparent 70%)", filter: "blur(75px)", pointerEvents: "none", zIndex: 0, animationDelay: "-6s" }} />
        <div className="ap-morph" style={{ position: "absolute", width: 600, height: 600, bottom: "0%", left: "28%", background: "radial-gradient(circle at 50% 55%, rgba(0,200,210,0.12) 0%, rgba(0,160,180,0.06) 50%, transparent 70%)", filter: "blur(90px)", pointerEvents: "none", zIndex: 0, animationDelay: "-11s" }} />
        <div className="ap-morph" style={{ position: "absolute", width: 500, height: 500, top: "25%", left: "18%", background: "radial-gradient(circle at 50% 50%, rgba(180,0,255,0.07) 0%, transparent 65%)", filter: "blur(100px)", pointerEvents: "none", zIndex: 0, animationDelay: "-3s" }} />

        {/* Fine dot-grid overlay */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(120,160,255,0.07) 1px, transparent 1px)", backgroundSize: "44px 44px", pointerEvents: "none", zIndex: 0 }} />

        {/* Floating wireframe hexagons */}
        <svg className="ap-geo-1" viewBox="0 0 200 200" fill="none" style={{ position: "absolute", top: "8%", right: "4%", width: 260, height: 260, opacity: 0.055, pointerEvents: "none", zIndex: 0 }}>
          <polygon points="100,10 182,55 182,145 100,190 18,145 18,55" stroke="rgba(140,180,255,1)" strokeWidth="0.8"/>
          <polygon points="100,38 158,70 158,130 100,162 42,130 42,70"  stroke="rgba(140,180,255,1)" strokeWidth="0.5"/>
          <line x1="100" y1="10"  x2="100" y2="38"  stroke="rgba(140,180,255,1)" strokeWidth="0.4"/>
          <line x1="182" y1="55"  x2="158" y2="70"  stroke="rgba(140,180,255,1)" strokeWidth="0.4"/>
          <line x1="182" y1="145" x2="158" y2="130" stroke="rgba(140,180,255,1)" strokeWidth="0.4"/>
          <line x1="100" y1="190" x2="100" y2="162" stroke="rgba(140,180,255,1)" strokeWidth="0.4"/>
          <line x1="18"  y1="145" x2="42"  y2="130" stroke="rgba(140,180,255,1)" strokeWidth="0.4"/>
          <line x1="18"  y1="55"  x2="42"  y2="70"  stroke="rgba(140,180,255,1)" strokeWidth="0.4"/>
        </svg>

        <svg className="ap-geo-2" viewBox="0 0 200 200" fill="none" style={{ position: "absolute", bottom: "10%", left: "2%", width: 200, height: 200, opacity: 0.045, pointerEvents: "none", zIndex: 0 }}>
          <polygon points="100,10 182,55 182,145 100,190 18,145 18,55" stroke="rgba(100,200,255,1)" strokeWidth="0.8"/>
          <circle cx="100" cy="100" r="52" stroke="rgba(100,200,255,1)" strokeWidth="0.4" strokeDasharray="4 6"/>
        </svg>

        <svg className="ap-geo-3" viewBox="0 0 160 160" fill="none" style={{ position: "absolute", top: "40%", left: "5%", width: 140, height: 140, opacity: 0.04, pointerEvents: "none", zIndex: 0 }}>
          <rect x="20" y="20" width="120" height="120" stroke="rgba(180,140,255,1)" strokeWidth="0.8" transform="rotate(45 80 80)"/>
          <rect x="40" y="40" width="80"  height="80"  stroke="rgba(180,140,255,1)" strokeWidth="0.5" transform="rotate(45 80 80)"/>
        </svg>

        {/* 3D perspective grid */}
        <div className="ap-perspective-grid" />

        {/* Content */}
        <div style={{ maxWidth: 980, margin: "0 auto", width: "100%", position: "relative", zIndex: 2 }}>

          <div className="ap-hero-chip" style={{ display: "inline-block", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.72)", fontSize: 14, fontFamily: fft, padding: "8px 18px", borderRadius: 9999, marginBottom: 32, letterSpacing: "-0.224px", border: "1px solid rgba(255,255,255,0.11)" }}>
            AWS Cloud Security
          </div>

          <h1 style={{ fontFamily: ff, fontSize: "clamp(44px,6vw,66px)", fontWeight: 600, lineHeight: 1.08, letterSpacing: "-0.5px", maxWidth: 820, margin: "0 auto 16px" }}>
            <div style={{ overflow: "hidden" }}>
              <Words text="Find misconfigurations." base={0.18} color="#ffffff" />
            </div>
            <div style={{ overflow: "hidden" }}>
              <Words text="Before hackers do." base={0.45} color="rgba(255,255,255,0.44)" />
            </div>
          </h1>

          <p className="ap-hero-sub" style={{ fontFamily: ff, fontSize: "clamp(19px,2.2vw,24px)", fontWeight: 300, lineHeight: 1.5, color: C.muted, maxWidth: 520, margin: "0 auto 32px" }}>
            10 automated security checks. 2-minute scans. Zero setup.
          </p>

          <div className="ap-hero-ctas" style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <Link href={authenticated ? "/scans" : "/signup"} className="ap-btn" style={pill(C.primary, "#fff")}>
              {loading ? "Get Started Free" : authenticated ? "Go to Dashboard" : "Start Free Trial"}
            </Link>
            <a href="#how-it-works" className="ap-btn" style={pill("transparent", C.primaryDark, C.primaryDark)}>See How It Works</a>
          </div>

          <p className="ap-hero-fine" style={{ color: "rgba(255,255,255,0.28)", fontSize: 12, fontFamily: fft, marginBottom: 48 }}>
            Free 2-week trial · No credit card · Setup in 5 minutes
          </p>

          {/* Floating security badges */}
          <div className="ap-hero-badges" style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginBottom: 60 }}>
            {[["🔒","SOC 2"],["📋","ISO 27001"],["🛡️","AWS Security"],["✅","GDPR Ready"],["🔍","CIS Benchmark"]].map(([icon, label], i) => (
              <span key={label} className={i % 2 === 0 ? "ap-float" : "ap-float-r"} style={{ animationDelay: `${i * 0.6}s`, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 9999, padding: "6px 14px", fontSize: 12, fontFamily: fft, color: "rgba(255,255,255,0.65)" }}>
                <span>{icon}</span>{label}
              </span>
            ))}
          </div>

          {/* Dashboard mockup */}
          <div ref={mockupRef} className="ap-hero-mockup" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div className="ap-product-shadow" style={{ background: "#161617", borderRadius: 20, border: "1px solid rgba(255,255,255,0.10)", overflow: "hidden", textAlign: "left" }}>
              {/* Chrome */}
              <div style={{ background: "#1c1c1e", padding: "12px 18px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["#ff5f57","#febc2e","#28c840"].map((c) => <div key={c} style={{ width: 12, height: 12, borderRadius: "50%", background: c }} />)}
                <div style={{ flex: 1, marginLeft: 14, background: "rgba(255,255,255,0.06)", borderRadius: 7, padding: "4px 14px", fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: fft }}>
                  vigilicloud.com / scans / report
                </div>
              </div>
              {/* Header */}
              <div style={{ padding: "22px 28px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", fontFamily: fft }}>my-production-account</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: fft, marginTop: 3 }}>Scan completed · 1 min 48 sec · 10 checks</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["2 Critical","#f87171","rgba(248,113,113,0.18)"],["4 High","#fb923c","rgba(251,146,60,0.18)"],["3 Medium","#fbbf24","rgba(251,191,36,0.18)"]].map(([l,c,b]) => (
                    <span key={l} style={{ background: b, color: c, borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, fontFamily: fft }}>{l}</span>
                  ))}
                </div>
              </div>
              {/* Rows */}
              {[
                ["#f87171","S3 bucket 'my-data-lake' is publicly accessible","S3 Public Access","FAIL","#f87171"],
                ["#f87171","Root account has active access keys","Root Access Keys","FAIL","#f87171"],
                ["#fb923c","IAM role has AdministratorAccess policy attached","IAM Permissions","FAIL","#fb923c"],
                ["#fbbf24","EBS volume vol-0a1b2c3d is not encrypted","EBS Encryption","FAIL","#fbbf24"],
                ["#34d399","MFA is enabled on all IAM users","MFA Enforcement","PASS","#34d399"],
              ].map(([dot, label, check, st, sc], i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 28px", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: st === "FAIL" ? 500 : 400, color: "#fff", fontFamily: fft }}>{label}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: fft, marginTop: 2 }}>{check}</div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: sc, fontFamily: fft }}>{st}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Scroll caret */}
          <div className="ap-scroll-caret" style={{ marginTop: 52, display: "flex", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 3v16M4 12l7 7 7-7" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </section>

      {/* ══ STATS STRIP ══ */}
      <section className="ap-animated-bg" style={{ padding: "80px 22px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div className="ap-reveal" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 32, textAlign: "center" }}>
            {[
              { count: "10", suffix: "+",    label: "Security checks",   icon: "🔍" },
              { count: "2",  suffix: " min", label: "Average scan time", icon: "⚡" },
              { count: "100",suffix: "%",    label: "Read-only access",  icon: "🔒" },
              { count: "24", suffix: "/7",   label: "Monitoring ready",  icon: "📡" },
            ].map((s, i) => (
              <div key={s.label} className={`ap-reveal-scale ap-d${i + 1}`}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
                <div style={{ fontFamily: ff, fontSize: 52, fontWeight: 600, lineHeight: 1, color: C.ink, letterSpacing: "-0.5px" }}>
                  <span data-count={s.count} data-suffix={s.suffix} data-decimals="0">{s.count}{s.suffix}</span>
                </div>
                <div style={{ fontFamily: fft, fontSize: 14, color: C.inkMuted, marginTop: 10, letterSpacing: "-0.224px" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ══ */}
      <section id="how-it-works" style={{ background: C.canvas, padding: "120px 22px", position: "relative", overflow: "hidden" }}>
        {/* Subtle bg orb */}
        <div style={{ position: "absolute", top: "30%", right: "-10%", width: 500, height: 500, background: "radial-gradient(circle, rgba(0,102,204,0.04), transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div className="ap-reveal" style={{ textAlign: "center", marginBottom: 72 }}>
            <Label>How It Works</Label>
            <H2 center maxW={540}>Up and running in 5 minutes.</H2>
            <p style={{ fontFamily: fft, fontSize: 17, color: C.inkMuted, lineHeight: 1.47, letterSpacing: "-0.374px" }}>No agents, no installations, no complex setup.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: C.hairline }}>
            {STEPS.map((step, i) => (
              <TiltCard key={step.num} className={`ap-reveal${i === 0 ? "-left" : i === 2 ? "-right" : ""} ap-d${i + 1}`} style={{ background: C.canvas, padding: "48px 36px", height: "100%" }}>
                <div style={{ fontFamily: ff, fontSize: 68, fontWeight: 700, color: "rgba(0,0,0,0.05)", lineHeight: 1, marginBottom: 28, letterSpacing: "-2px" }}>{step.num}</div>
                <h3 style={{ fontFamily: ff, fontSize: 21, fontWeight: 600, color: C.ink, lineHeight: 1.19, letterSpacing: "0.231px", marginBottom: 12 }}>{step.title}</h3>
                <p style={{ fontFamily: fft, fontSize: 15, color: C.inkMuted, lineHeight: 1.55, letterSpacing: "-0.224px", marginBottom: 20 }}>{step.desc}</p>
                <span style={{ display: "inline-block", background: "rgba(0,102,204,0.07)", border: "1px solid rgba(0,102,204,0.18)", borderRadius: 9999, padding: "5px 13px", fontSize: 11, color: C.primary, fontFamily: fft, fontWeight: 500 }}>{step.tag}</span>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* ══ SCROLL GALLERY ══ */}
      <ScrollGallery />

      {/* ══ BENTO GRID ══ */}
      <section id="features" style={{ background: C.black, padding: "120px 0 0", position: "relative" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 22px" }}>
          <div className="ap-reveal" style={{ textAlign: "center", marginBottom: 64 }}>
            <Label dark>Security Checks</Label>
            <H2 dark center maxW={640}>10 checks. Every critical area.</H2>
            <p style={{ fontFamily: fft, fontSize: 17, color: C.muted, lineHeight: 1.47, letterSpacing: "-0.374px" }}>
              Every check ships with fix guidance, the exact AWS Console path, and CLI commands.
            </p>
          </div>
        </div>

        {/* Main bento tiles — ap-pop for entrance, TiltCard for hover */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1 }}>
          {(() => {
            let col = 0;
            return BENTO.map((t) => {
              const startCol = col;
              col += t.span;
              if (col >= 3) col = 0;
              const delay = parseFloat(((startCol / 3) * 0.16).toFixed(3));
              return (
                <div key={t.title} className="ap-pop" style={{ gridColumn: `span ${t.span}`, transitionDelay: `${delay}s`, minHeight: t.h }}>
                  <TiltCard style={{ background: t.bg, padding: "40px 36px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: fft, fontSize: 11, fontWeight: 600, color: t.txt === "#fff" ? C.primaryDark : C.primary, background: t.txt === "#fff" ? "rgba(41,151,255,0.12)" : "rgba(0,102,204,0.08)", border: `1px solid ${t.txt === "#fff" ? "rgba(41,151,255,0.22)" : "rgba(0,102,204,0.16)"}`, padding: "3px 8px", borderRadius: 5, letterSpacing: "0.08em" }}>AWS</span>
                      <SevBadge sev={t.sev} dark={t.txt === "#fff"} />
                    </div>
                    <div>
                      <h3 style={{ fontFamily: ff, fontSize: 21, fontWeight: 600, color: t.txt, lineHeight: 1.19, letterSpacing: "0.231px", marginBottom: 10 }}>{t.title}</h3>
                      <p style={{ fontFamily: fft, fontSize: 14, color: t.txt === "#fff" ? "rgba(255,255,255,0.52)" : C.inkMuted, lineHeight: 1.5, letterSpacing: "-0.224px" }}>{t.desc}</p>
                    </div>
                  </TiltCard>
                </div>
              );
            });
          })()}
        </div>

        {/* Extra feature tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, marginTop: 1 }}>
          {[
            { title: "AI Security Analysis", desc: "Claude AI summarizes your findings and prioritizes what to fix first — in plain English.", bg: C.parchment },
            { title: "Email Alerts",          desc: "Get notified the moment a critical misconfiguration is found in your account.",           bg: C.canvas    },
            { title: "Compliance Exports",    desc: "Export findings as CSV or JSON for SOC2, ISO 27001, and audit evidence packages.",        bg: C.parchment },
          ].map((f, i) => (
            <div key={f.title} className="ap-pop" style={{ transitionDelay: `${i * 0.12}s` }}>
              <TiltCard style={{ background: f.bg, padding: "40px 36px", height: 220 }}>
                <h3 style={{ fontFamily: ff, fontSize: 21, fontWeight: 600, color: C.ink, lineHeight: 1.19, letterSpacing: "0.231px", marginBottom: 10 }}>{f.title}</h3>
                <p style={{ fontFamily: fft, fontSize: 14, color: C.inkMuted, lineHeight: 1.5, letterSpacing: "-0.224px" }}>{f.desc}</p>
              </TiltCard>
            </div>
          ))}
        </div>
      </section>

      {/* ══ SECURITY INSIGHTS ══ */}
      <section id="stats" style={{ background: C.parchment, padding: "120px 22px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "50%", left: "-5%", width: 600, height: 600, background: "radial-gradient(circle, rgba(0,102,204,0.05), transparent 70%)", borderRadius: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div className="ap-reveal" style={{ textAlign: "center", marginBottom: 72 }}>
            <Label>Security Insights</Label>
            <H2 center>What we find in a typical AWS scan.</H2>
            <p style={{ fontFamily: fft, fontSize: 17, color: C.inkMuted, lineHeight: 1.47, letterSpacing: "-0.374px", maxWidth: 460, margin: "0 auto" }}>
              Most AWS accounts have more security gaps than they realize.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>
            {/* Donut */}
            <div className="ap-reveal-left" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <svg viewBox="0 0 120 120" style={{ width: 260, height: 260 }}>
                <circle cx="60" cy="60" r="45" fill="none" stroke={C.divider}  strokeWidth="16" />
                <circle cx="60" cy="60" r="45" fill="none" stroke="#dc2626" strokeWidth="16" strokeLinecap="round" strokeDasharray="62  220" strokeDashoffset="70.7" />
                <circle cx="60" cy="60" r="45" fill="none" stroke="#ea580c" strokeWidth="16" strokeLinecap="round" strokeDasharray="99  183" strokeDashoffset="3.1" />
                <circle cx="60" cy="60" r="45" fill="none" stroke="#b45309" strokeWidth="16" strokeLinecap="round" strokeDasharray="79  203" strokeDashoffset="-100.5" />
                <circle cx="60" cy="60" r="45" fill="none" stroke="#9ca3af" strokeWidth="16" strokeLinecap="round" strokeDasharray="42  240" strokeDashoffset="-184.5" />
                <text x="60" y="54" textAnchor="middle" fill={C.ink}     fontSize="21" fontWeight="600" fontFamily={ff}>14</text>
                <text x="60" y="68" textAnchor="middle" fill={C.inkMuted} fontSize="7.5"               fontFamily={fft}>avg findings</text>
              </svg>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 32px", marginTop: 20, width: "100%", maxWidth: 280 }}>
                {[["Critical","22%","#dc2626"],["High","35%","#ea580c"],["Medium","28%","#b45309"],["Low","15%","#9ca3af"]].map(([l,p,c]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: c, fontFamily: fft }}>{l}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: C.inkMuted, fontFamily: fft }}>{p}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {[
                { v: "78%",    l: "Accounts with at least one critical finding",   e: "⚠️" },
                { v: "14",     l: "Average security findings per account scan",     e: "📊" },
                { v: "#1",     l: "S3 misconfiguration — the most common finding", e: "🪣" },
                { v: "~1 day", l: "Average fix time with step-by-step guidance",   e: "⚡" },
              ].map((s, i) => (
                <TiltCard key={s.v} className={`ap-reveal-right ap-d${i + 1}`} style={{ background: C.canvas, border: `1px solid ${C.hairline}`, borderRadius: 18, padding: "28px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>{s.e}</div>
                  <div style={{ fontFamily: ff, fontSize: 32, fontWeight: 600, color: C.ink, letterSpacing: "-0.5px" }}>{s.v}</div>
                  <p style={{ fontFamily: fft, fontSize: 12, color: C.inkMuted, lineHeight: 1.45, marginTop: 8, letterSpacing: "-0.12px" }}>{s.l}</p>
                </TiltCard>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ PRICING ══ */}
      <section id="pricing" style={{ background: C.tile1, padding: "120px 22px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", width: 800, height: 600, background: "radial-gradient(ellipse, rgba(0,102,204,0.08), transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ maxWidth: 980, margin: "0 auto", position: "relative" }}>
          <div className="ap-reveal" style={{ textAlign: "center", marginBottom: 72 }}>
            <Label dark>Pricing</Label>
            <H2 dark center>Simple, transparent pricing.</H2>
            <p style={{ fontFamily: fft, fontSize: 17, color: C.muted, lineHeight: 1.47, letterSpacing: "-0.374px" }}>2-week free trial on all plans. Billed in INR · USD shown for reference.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
            {PLANS.map((plan, i) => (
              <div key={plan.key} className={`ap-reveal ap-d${i + 1} ${plan.hot ? "ap-glow-border" : ""}`}
                style={{ background: C.canvas, borderRadius: 20, padding: "36px 28px", border: plan.hot ? "none" : `1px solid ${C.hairline}`, position: "relative", zIndex: 1, transition: "transform 0.12s cubic-bezier(0.22,1,0.36,1)", transformStyle: "preserve-3d" }}
                onMouseMove={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  const r  = el.getBoundingClientRect();
                  const x  = (e.clientX - r.left) / r.width;
                  const y  = (e.clientY - r.top)  / r.height;
                  el.style.transform = `perspective(700px) rotateX(${(0.5 - y) * 14}deg) rotateY(${(x - 0.5) * 14}deg) scale(1.02)`;
                }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "perspective(700px) rotateX(0deg) rotateY(0deg) scale(1)"; }}>
                {plan.hot && <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", background: C.primary, color: "#fff", fontSize: 11, fontWeight: 600, padding: "4px 16px", borderRadius: 9999, fontFamily: fft, whiteSpace: "nowrap", zIndex: 11 }}>Most Popular</div>}
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
                        <span style={{ color: C.primary, fontWeight: 700, flexShrink: 0, fontSize: 13, marginTop: 1 }}>✓</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
                <Link href={plan.key === "msp" ? "#contact" : "/signup"} className="ap-btn"
                  style={{ ...pill(plan.hot ? C.primary : "transparent", plan.hot ? "#fff" : C.primary, plan.hot ? undefined : C.primary), display: "block", textAlign: "center" }}>
                  {plan.key === "msp" ? "Contact Us" : "Start Free Trial"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ TESTIMONIALS ══ */}
      <section id="testimonials" style={{ background: C.canvas, padding: "120px 22px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div className="ap-reveal" style={{ textAlign: "center", marginBottom: 72 }}>
            <Label>Testimonials</Label>
            <H2 center>Trusted by AWS teams worldwide.</H2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: C.hairline }}>
            {TESTIMONIALS.map((t, i) => (
              <TiltCard key={t.name} className={`ap-reveal ap-d${i + 1}`} style={{ background: C.canvas, padding: "44px 36px" }}>
                <div style={{ display: "flex", gap: 3, marginBottom: 24 }}>
                  {[...Array(5)].map((_, s) => <span key={s} style={{ color: C.primary, fontSize: 15 }}>★</span>)}
                </div>
                <p style={{ fontFamily: fft, fontSize: 17, lineHeight: 1.47, color: C.ink, letterSpacing: "-0.374px", marginBottom: 28 }}>&ldquo;{t.quote}&rdquo;</p>
                <div style={{ display: "flex", alignItems: "center", gap: 14, borderTop: `1px solid ${C.divider}`, paddingTop: 24 }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.parchment, border: `1px solid ${C.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600, color: C.ink, fontFamily: ff, flexShrink: 0 }}>
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontFamily: fft, fontSize: 14, fontWeight: 600, color: C.ink }}>{t.name}</div>
                    <div style={{ fontFamily: fft, fontSize: 12, color: C.inkMuted }}>{t.role} · {t.loc}</div>
                  </div>
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* ══ DEMO + CONTACT ══ */}
      <section style={{ background: C.parchment, padding: "120px 22px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "start" }}>

          <div id="demo" className="ap-reveal-left">
            <Label>Book a Demo</Label>
            <H2 maxW={400}>See VigiliCloud live.</H2>
            <p style={{ fontFamily: fft, fontSize: 17, color: C.inkMuted, lineHeight: 1.47, letterSpacing: "-0.374px", marginBottom: 28 }}>
              Free 25-minute walkthrough — live AWS scan, findings review, and remediation on your actual account.
            </p>
            <ul style={{ listStyle: "none", margin: "0 0 28px", padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {["Live AWS scan on your account","Walk through every critical finding","Show you how to fix each issue","Answer all your questions"].map((item) => (
                <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: fft, fontSize: 15, color: C.ink }}>
                  <span style={{ color: C.primary, fontWeight: 700, fontSize: 14, flexShrink: 0 }}>✓</span>{item}
                </li>
              ))}
            </ul>
            <a href="https://calendly.com/leelakrishnakoppolu/vigilicloud-demo" target="_blank" rel="noopener noreferrer" className="ap-btn" style={pill(C.primary, "#fff")}>
              Book Free Demo
            </a>
          </div>

          <div id="contact" className="ap-reveal-right">
            <Label>Get in Touch</Label>
            <H2>Questions? We reply within 24 hours.</H2>
            {contactSent ? (
              <div style={{ background: "rgba(0,102,204,0.06)", border: "1px solid rgba(0,102,204,0.2)", borderRadius: 14, padding: 28, textAlign: "center", color: C.primary, fontFamily: fft, fontSize: 15, lineHeight: 1.5 }}>
                Thanks! We&apos;ll get back to you within 24 hours.
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); setContactSent(true); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontFamily: fft, fontSize: 14, color: C.inkMuted, marginBottom: 7 }}>Your email</label>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
                    style={{ width: "100%", border: `1px solid ${C.hairline}`, background: C.canvas, borderRadius: 9999, padding: "13px 20px", fontSize: 17, color: C.ink, fontFamily: fft, outline: "none", letterSpacing: "-0.374px", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontFamily: fft, fontSize: 14, color: C.inkMuted, marginBottom: 7 }}>Message</label>
                  <textarea required rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us about your AWS setup..."
                    style={{ width: "100%", border: `1px solid ${C.hairline}`, background: C.canvas, borderRadius: 14, padding: "13px 20px", fontSize: 17, color: C.ink, fontFamily: fft, outline: "none", letterSpacing: "-0.374px", resize: "none", boxSizing: "border-box" }} />
                </div>
                <button type="submit" className="ap-btn" style={{ ...pill(C.primary, "#fff"), border: "none", cursor: "pointer", textAlign: "center" }}>Send Message</button>
              </form>
            )}
            <p style={{ marginTop: 16, fontSize: 12, color: C.inkMuted, fontFamily: fft, textAlign: "center" }}>
              Or email: <a href="mailto:leelakrishnakoppolu@gmail.com" style={{ color: C.primary }}>leelakrishnakoppolu@gmail.com</a>
            </p>
          </div>
        </div>
      </section>

      {/* ══ CTA BANNER ══ */}
      <section style={{ background: C.tile2, padding: "120px 22px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div className="ap-morph" style={{ position: "absolute", top: "50%", left: "20%", transform: "translateY(-50%)", width: 500, height: 500, background: "radial-gradient(circle, rgba(0,102,204,0.12), transparent 70%)", filter: "blur(70px)", pointerEvents: "none" }} />
        <div className="ap-morph" style={{ position: "absolute", top: "50%", right: "15%", transform: "translateY(-50%)", width: 400, height: 400, background: "radial-gradient(circle, rgba(41,151,255,0.09), transparent 70%)", filter: "blur(70px)", pointerEvents: "none", animationDelay: "-7s" }} />
        <div style={{ maxWidth: 640, margin: "0 auto", position: "relative" }} className="ap-reveal-scale">
          <h2 style={{ fontFamily: ff, fontSize: "clamp(34px,4.4vw,52px)", fontWeight: 600, lineHeight: 1.08, letterSpacing: "-0.5px", color: "#fff", marginBottom: 18 }}>
            Start securing your AWS today.
          </h2>
          <p style={{ fontFamily: fft, fontSize: 17, color: C.muted, lineHeight: 1.47, letterSpacing: "-0.374px", marginBottom: 40 }}>
            Free 2-week trial · No credit card · Setup in 5 minutes
          </p>
          <Link href="/signup" className="ap-btn" style={pill(C.primary, "#fff")}>Start Free Trial</Link>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer style={{ background: C.parchment, padding: "64px 22px 48px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 48, marginBottom: 48 }}>
            <div>
              <Link href="/" style={{ fontFamily: ff, fontSize: 17, fontWeight: 600, color: C.ink, textDecoration: "none", letterSpacing: "-0.374px", display: "block", marginBottom: 12 }}>VigiliCloud</Link>
              <p style={{ fontFamily: fft, fontSize: 14, color: C.inkMuted, lineHeight: 1.5, maxWidth: 280, letterSpacing: "-0.224px" }}>
                AWS security scanning for teams that can&apos;t afford to miss a misconfiguration.
              </p>
            </div>
            {[
              { heading: "Product", links: [["Features","#features"],["Pricing","#pricing"],["Book a Demo","#demo"],["Get Started","/onboarding"]] },
              { heading: "Company", links: [["About","#contact"],["Contact","#contact"],["Support","mailto:leelakrishnakoppolu@gmail.com"],["Sign In","/signin"]] },
            ].map((col) => (
              <div key={col.heading}>
                <div style={{ fontFamily: fft, fontSize: 12, fontWeight: 600, color: C.ink, letterSpacing: "-0.12px", marginBottom: 16 }}>{col.heading}</div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {col.links.map(([l, h]) => (
                    <li key={l}><a href={h} style={{ fontFamily: fft, fontSize: 17, color: C.inkMuted, textDecoration: "none", lineHeight: 2.41, display: "block" }}>{l}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${C.hairline}`, paddingTop: 24 }}>
            <p style={{ fontFamily: fft, fontSize: 12, color: "#7a7a7a" }}>© 2026 VigiliCloud. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
