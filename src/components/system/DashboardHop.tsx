"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import RouteLoading from "@/components/system/RouteLoading";

/**
 * The last step of "Go to Dashboard": the word-roll loader, held on screen while the browser moves on to the address /dashboard worked out on
 * the server. `replace`, so Back returns to the page the button was on
 * rather than to this hop.
 */
export default function DashboardHop({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [router, href]);
  return <RouteLoading label="Opening your dashboard…" fullScreen />;
}
