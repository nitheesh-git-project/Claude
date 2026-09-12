"use client";

import { useEffect, useState } from "react";
import { minutesLeft, type ImpersonationMarker } from "@/lib/impersonation";

// The bar that says you are not yourself.
//
// During an impersonation the browser genuinely is that patient: every
// screen, every control, every write. Nothing else on the page differs from
// what they see -- which is the point of the feature and exactly why this
// bar has to be impossible to miss. An admin who forgets which account they
// are in cancels a real session.
//
// Three things about it are deliberate. It is fixed to the top and pushes
// the page down rather than floating over it, so it cannot be scrolled past
// or covered by a sticky header. It counts the window down, because "you
// will be signed out at some point" is not something anyone can plan around.
// And Exit is the loudest thing on it: the way back has to be one tap from
// wherever the admin has wandered to.

export default function ImpersonationBanner({
  marker,
}: {
  marker: ImpersonationMarker;
}) {
  const [left, setLeft] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);

  // After mount only: minutes computed on the server are already wrong in the
  // browser, and rendering them in both places is a hydration mismatch.
  useEffect(() => {
    const tick = () => setLeft(minutesLeft(marker, Date.now()));
    tick();
    const timer = setInterval(tick, 20_000);
    return () => clearInterval(timer);
  }, [marker]);

  async function handleExit() {
    setLeaving(true);
    try {
      const res = await fetch("/api/admin/stop-impersonation", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { redirectTo?: string };
      // A hard navigation, not the router: the session cookies have just been
      // replaced, and a client-side transition would render the next screen
      // against the cache belonging to the account we have left.
      window.location.href = data.redirectTo ?? "/admin/dashboard";
    } catch {
      setLeaving(false);
    }
  }

  return (
    <div className="sticky top-0 z-50 border-b border-amber-300 bg-amber-100">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6">
        <i aria-hidden className="fa-solid fa-user-secret text-sm text-amber-700" />
        <p className="min-w-0 flex-1 text-xs leading-snug text-amber-900">
          <span className="font-bold">
            You are signed in as {marker.targetName}.
          </span>{" "}
          <span className="text-amber-800">
            Everything you do here is recorded as theirs — a booking, a
            cancellation, a payment.
          </span>
          {left !== null && (
            <span className="text-amber-700">
              {" "}
              {left > 0
                ? `Ends in ${left} minute${left === 1 ? "" : "s"}.`
                : "Ending now."}
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={handleExit}
          disabled={leaving}
          className="shrink-0 rounded-lg bg-amber-700 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-amber-800 disabled:opacity-60"
        >
          {leaving ? "Leaving…" : "Exit and go back to admin"}
        </button>
      </div>
    </div>
  );
}
