import "./globals.css";
import type { Metadata } from "next";
import AppTopNav from "@/components/AppTopNav";

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
        <div className="mx-auto max-w-7xl px-6 py-8">
          <AppTopNav />
          {children}
        </div>
      </body>
    </html>
  );
}