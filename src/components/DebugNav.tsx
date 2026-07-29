"use client";

import { useRouter, usePathname } from "next/navigation";

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
];

export default function DebugNav() {
  const router = useRouter();
  const pathname = usePathname();

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
        <span className="text-[11px] text-slate-500 ml-auto hidden sm:inline">
          Remove this bar before real launch
        </span>
      </div>
    </div>
  );
}
