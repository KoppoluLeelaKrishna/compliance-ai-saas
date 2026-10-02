import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import LayoutShell from "@/components/LayoutShell";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["300", "400", "600", "700"],
});

export const metadata: Metadata = {
  title: "VigiliCloud",
  description: "AWS compliance scans, account-linked workflows, remediation tracking, and subscription-based access.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // data-theme is set by the boot script before hydration, so React must not
    // treat the attribute as a mismatch.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-[var(--vc-canvas)] text-[var(--vc-text)]">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}