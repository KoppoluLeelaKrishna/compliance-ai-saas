import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}

export function Card({ children, className = "", title, subtitle }: CardProps) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-white/5 p-6 ${className}`}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-xl font-bold">{title}</h3>}
          {subtitle && <p className="text-sm text-neutral-400">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Badge({ children, className = "", variant = "neutral" }: { children: React.ReactNode, className?: string, variant?: string }) {
  const variants: Record<string, string> = {
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    yellow: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
    red: "border-red-500/30 bg-red-500/10 text-red-300",
    neutral: "border-white/10 bg-white/5 text-neutral-300",
  };

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs ${variants[variant] || variants.neutral} ${className}`}>
      {children}
    </span>
  );
}
