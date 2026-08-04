import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}

export function Card({ children, className = "", title, subtitle }: CardProps) {
  return (
    <div className={`vc-card ${className}`}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="vc-card-title">{title}</h3>}
          {subtitle && <p className="vc-card-sub">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Status pill. Variants name a meaning, not a colour — the tone class maps onto
 * the design tokens. The legacy palette names stay as aliases so existing
 * callers keep working.
 */
export function Badge({
  children,
  className = "",
  variant = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: string;
}) {
  const tones: Record<string, string> = {
    accent: "text-[var(--vc-accent-text)]",
    success: "vc-ok",
    warning: "vc-sev-high",
    danger: "vc-sev-critical",
    neutral: "vc-neutral",
    // legacy aliases
    emerald: "vc-ok",
    yellow: "vc-sev-high",
    red: "vc-sev-critical",
  };

  return <span className={`vc-pill ${tones[variant] ?? tones.neutral} ${className}`}>{children}</span>;
}
