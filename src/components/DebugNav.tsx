"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "@/lib/useRouter";
import { debugNow, getDebugNowOffsetMs, setDebugNowOffsetMs } from "@/lib/debugNow";
import DebugResetButton from "@/components/DebugResetButton";
import { MARKETING_PAGES } from "@/lib/marketingNav";

// datetime-local wants "YYYY-MM-DDTHH:mm" in the browser's local timezone,
// not an ISO/UTC string -- sliceing toISOString would silently shift the
// displayed value by the timezone offset.
function toLocalInputValue(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The public pages come from marketingNav.ts rather than being listed here.
// This list had gone stale — /faq and /home-visit were missing, so the two
// newest public pages were the two you could not jump to from the debug bar,
// which is exactly when you want it. Home Visit is included unconditionally:
// this is a developer tool, and seeing the 404 is the point when the master
// switch is off. Everything below the public pages is a route the marketing
// nav does not know about, so those stay written out. Their numbers start
// after MARKETING_PAGES' count (eight pages, numbered 1-8 above) -- adding a
// ninth public page means shifting this block down one, or two entries end
// up wearing the same number.
const routes = [
  ...MARKETING_PAGES.map((page, index) => ({
    value: page.href,
    label: `${index + 1}. ${page.label}`,
  })),
  { value: "/get-started", label: "9. Get Started Hub" },
  { value: "/book", label: "10. Booking Enquiry" },
  { value: "/book-home-visit", label: "10b. Home Visit Booking" },
  { value: "/patient/login", label: "11. Patient Login / Register" },
  { value: "/patient/dashboard", label: "11b. Patient Dashboard (protected)" },
  { value: "/therapist/login", label: "12. Therapist Login / Apply" },
  { value: "/therapist/dashboard", label: "12b. Therapist Dashboard (protected)" },
  { value: "/pending-approval", label: "13. Pending Approval" },
  { value: "/admin/login", label: "14. Admin Login" },
  { value: "/admin/dashboard", label: "14b. Admin Dashboard (protected)" },
  { value: "/hospital/login", label: "15. Partner (Hospital) Login" },
  { value: "/hospital/dashboard", label: "15b. Partner Dashboard (protected)" },
];

export default function DebugNav() {
  const router = useRouter();
  const pathname = usePathname();
  // Lazy read (once, on mount) -- this is a dev-only debug control, not a
  // rendering-correctness-sensitive value, so re-reading localStorage on
  // every render would be pure overhead for no benefit.
  const [simInput, setSimInput] = useState(() => toLocalInputValue(debugNow()));
  const [active, setActive] = useState(() => getDebugNowOffsetMs() !== 0);

  function applySimulatedTime() {
    const target = new Date(simInput).getTime();
    if (Number.isNaN(target)) return;
    setDebugNowOffsetMs(target - Date.now());
    setActive(true);
    // A full reload, not a soft re-render -- every component reading
    // debugNow() does so via a one-time lazy useState initializer (same
    // convention as this codebase's existing Date.now() reads), so only a
    // fresh page load picks up the new simulated clock everywhere at once.
    window.location.reload();
  }

  function resetSimulatedTime() {
    setDebugNowOffsetMs(null);
    setActive(false);
    window.location.reload();
  }

  return (
    <div className="bg-slate-950 text-white border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-2">
        <span className="bg-amber-500 text-slate-950 text-[10px] font-bold uppercase px-2 py-1 rounded">
          Debug
        </span>
        <span className="text-xs text-slate-400 hidden sm:inline">
          Jump to page:
        </span>
        <select
          value={pathname}
          onChange={(e) => router.push(e.target.value)}
          className="bg-slate-800 text-teal-300 text-xs font-mono py-1.5 px-2 rounded-lg border border-slate-700 focus:outline-none focus:border-teal-500"
        >
          {routes.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        <span className="text-xs text-slate-400 hidden md:inline ml-2">
          Simulate now:
        </span>
        <input
          type="datetime-local"
          value={simInput}
          onChange={(e) => setSimInput(e.target.value)}
          className="bg-slate-800 text-teal-300 text-xs font-mono py-1.5 px-2 rounded-lg border border-slate-700 focus:outline-none focus:border-teal-500"
        />
        <button
          type="button"
          onClick={applySimulatedTime}
          className="bg-teal-700 hover:bg-teal-800 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition"
        >
          Set
        </button>
        {active && (
          <button
            type="button"
            onClick={resetSimulatedTime}
            className="bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition"
          >
            Reset to Real Time
          </button>
        )}

        {/* Pre-launch only, like the bar itself. The server decides whether
            it actually works -- see DebugResetButton. */}
        <DebugResetButton />

        <span className="text-[11px] text-slate-500 ml-auto hidden sm:inline">
          Remove this bar before real launch
        </span>
      </div>
    </div>
  );
}
