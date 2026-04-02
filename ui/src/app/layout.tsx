import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compliance AI SaaS",
  description: "AWS compliance scans, account-linked workflows, remediation tracking, and subscription-based access.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}