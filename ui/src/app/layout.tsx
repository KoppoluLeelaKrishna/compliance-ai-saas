import "./globals.css";
import type { Metadata } from "next";
import LayoutShell from "@/components/LayoutShell";

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
    <html lang="en">
      <body className="min-h-screen bg-black text-white">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}