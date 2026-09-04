"use client";

import { useEffect, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { useRouter } from "@/lib/useRouter";

export default function FarewellBanner({
  /** Seconds to stay up before clearing itself. 0 means "until dismissed",
   *  which is what this did before it was configurable -- on a shared
   *  machine that means the next person reads the last person's goodbye.
   *  Admin-controlled: Settings -> Booking Rules. */
  autoDismissSeconds,
}: {
  autoDismissSeconds: number;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Read straight from the URL on first render instead of via an effect +
  // setState — avoids the extra cascading render, and this only ever needs
  // to reflect whatever query param the page loaded with.
  //
  // window.location, not just useSearchParams: the pages this banner lands
  // on are statically prerendered, so on the render that decides this the
  // hook can still be reporting the empty params the HTML was built with,
  // and the banner would never appear at all. The hook is still what the
  // effect below rewrites the URL with.
  const [visible] = useState(
    () =>
      searchParams.get("farewell") === "1" ||
      (typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("farewell") === "1")
  );
  const [dismissed, setDismissed] = useState(false);

  // Strip the marker so a refresh (or a shared link) doesn't say goodbye
  // again. Reads window.location for the same reason the state above does.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("farewell") !== "1") return;
    params.delete("farewell");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only armed once, when the banner is actually on screen. Cleared on
  // unmount so a navigation part-way through the countdown cannot fire a
  // state update into a component that is gone.
  useEffect(() => {
    if (!visible || dismissed || autoDismissSeconds <= 0) return;
    const timer = window.setTimeout(() => setDismissed(true), autoDismissSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [visible, dismissed, autoDismissSeconds]);

  if (!visible || dismissed) return null;

  return (
    <div className="bg-teal-800 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3 text-xs">
        <span>
          <i className="fa-solid fa-heart mr-1.5"></i>
          Sad to see you go! You&apos;ve been signed out — we hope to see you back
          soon.
        </span>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="text-white/80 hover:text-white shrink-0"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>
  );
}
