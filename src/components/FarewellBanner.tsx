"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

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
  // Read straight from the URL on first render instead of via an effect +
  // setState - avoids the extra cascading render, and this only ever needs
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

  // The owner's call: the address keeps `?farewell=1` for exactly as long
  // as the goodbye is on screen, and goes back to the bare page the moment
  // it leaves -- by its own timer or the X. Not before (a refresh while it
  // shows says goodbye again, which is honest), and never left behind after
  // it (a later refresh or shared link would say goodbye to nobody).
  //
  // history.replaceState, not router.replace: dropping the marker changes
  // nothing on the page, so there is nothing to fetch. (Next 16.2 also never
  // completed that navigation; 16.3 does, but the fetch is still waste.)
  // Next keeps usePathname/useSearchParams in step with replaceState.
  function dismiss() {
    setDismissed(true);
    const params = new URLSearchParams(window.location.search);
    if (params.get("farewell") !== "1") return;
    params.delete("farewell");
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`
    );
  }

  // Only armed once, when the banner is actually on screen. Cleared on
  // unmount so a navigation part-way through the countdown cannot fire a
  // state update into a component that is gone.
  useEffect(() => {
    if (!visible || dismissed || autoDismissSeconds <= 0) return;
    const timer = window.setTimeout(dismiss, autoDismissSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [visible, dismissed, autoDismissSeconds]);

  if (!visible || dismissed) return null;

  return (
    <div className="bg-teal-800 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3 text-xs">
        <span>
          <i className="fa-solid fa-heart mr-1.5"></i>
          Sad to see you go! You&apos;ve been signed out - we hope to see you back
          soon.
        </span>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-white/80 hover:text-white shrink-0"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>
  );
}
