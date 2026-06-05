"use client";

import { usePathname } from "next/navigation";
import AppTopNav from "@/components/AppTopNav";
import KeepAlive from "@/components/KeepAlive";

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/") {
    return (
      <>
        <KeepAlive />
        {children}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <KeepAlive />
      <AppTopNav />
      {children}
    </div>
  );
}
