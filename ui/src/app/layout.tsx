import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import LayoutShell from "@/components/LayoutShell";

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
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-black text-white">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}