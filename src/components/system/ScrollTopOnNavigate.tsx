"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isFrontPageRoute } from "@/lib/dashboardShellRoutes";

/**
 * A public page opens at its very top.
 *
 * Next scrolls a new page's *segment* into view, which on these pages is the
 * content under the 106px header, so tapping a tab from far down the page
 * landed a header's height short of the top. Next 16 also stopped turning off
 * the site's `scroll-behavior: smooth` during navigation, so the trip there
 * was a two-second glide past every section of the old page (fixed by
 * `data-scroll-behavior="smooth"` on <html>). This sets the window to 0 once
 * the new page is in, instantly. A link to an anchor (`#section`) is left to
 * the browser.
 */
export default function ScrollTopOnNavigate() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    // The first render is a page load: the browser has already placed it
    // (including a restored position on Back), so leave it alone.
    if (first.current) {
      first.current = false;
      return;
    }
    if (!isFrontPageRoute(pathname) || window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
