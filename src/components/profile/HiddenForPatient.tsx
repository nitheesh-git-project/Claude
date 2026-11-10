import type { ReactNode } from "react";
import { hiddenForPatientText } from "@/lib/profileWidgets";

/**
 * The sections the clinic hides from this patient's own Health Profile, on a
 * clinician's screen: never removed, so no clinician is ever blind to a
 * reading. The therapist's chart draws them collapsed ("2 sections hidden for
 * this patient - show"); the admin's record draws them open, under a heading
 * saying they are hidden for the patient. Graph lines hidden from the patient
 * stay on the clinician's graph and are named here.
 */
export default function HiddenForPatient({
  names,
  graphLines = [],
  open = false,
  children,
}: {
  /** The hidden sections' labels. */
  names: readonly string[];
  graphLines?: readonly string[];
  open?: boolean;
  children?: ReactNode;
}) {
  if (names.length === 0 && graphLines.length === 0) return null;
  const lines = graphLines.length > 0 ? ` Graph lines hidden for the patient (still on your graph): ${graphLines.join(", ")}.` : "";
  return (
    <details open={open} className="group rounded-2xl border border-dashed border-slate-300 bg-slate-50/60" data-testid="hidden-for-patient">
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <i aria-hidden className="fa-solid fa-eye-slash mr-2 text-slate-600" />
          {names.length > 0 ? hiddenForPatientText(names.length) : "Graph lines hidden for this patient"}
          <span className="font-normal text-slate-600"> - {open ? "shown here, marked" : "show"}</span>
        </span>
        <i aria-hidden className="fa-solid fa-chevron-down shrink-0 text-xs text-slate-600 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t border-slate-200 p-3 sm:p-4">
        <p className="text-sm text-slate-700">
          {names.length > 0 ? `The clinic has hidden these from the patient's own Health Profile: ${names.join(", ")}. They are recorded as usual.` : ""}
          {lines}
        </p>
        {children}
      </div>
    </details>
  );
}
