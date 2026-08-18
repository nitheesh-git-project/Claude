"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { debugNow, getDebugNowOffsetMs, setDebugNowOffsetMs } from "@/lib/debugNow";
import DebugResetButton from "@/components/DebugResetButton";

// datetime-local wants "YYYY-MM-DDTHH:mm" in the browser's local timezone,
// not an ISO/UTC string -- sliceing toISOString would silently shift the
// displayed value by the timezone offset.
function toLocalInputValue(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const routes = [
  { value: "/", label: "1. Home" },
  { value: "/conditions", label: "2. Conditions Treated" },
  { value: "/how-it-works", label: "3. How It Works" },
  { value: "/team", label: "4. Specialist Team" },
  { value: "/hospitals", label: "5. Hospitals (B2B)" },
  { value: "/get-started", label: "6. Get Started Hub" },
  { value: "/book", label: "7. Booking Enquiry" },
  { value: "/patient/login", label: "8. Patient Login / Register" },
  { value: "/patient/dashboard", label: "8b. Patient Dashboard (protected)" },
  { value: "/therapist/login", label: "9. Therapist Login / Apply" },
  { value: "/therapist/dashboard", label: "9b. Therapist Dashboard (protected)" },
  { value: "/pending-approval", label: "10. Pending Approval" },
  { value: "/admin/login", label: "11. Admin Login" },
  { value: "/admin/dashboard", label: "11b. Admin Dashboard (protected)" },
  { value: "/hospital/login", label: "12. Partner (Hospital) Login" },
  { value: "/hospital/dashboard", label: "12b. Partner Dashboard (protected)" },
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
