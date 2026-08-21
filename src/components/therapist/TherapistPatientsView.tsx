"use client";

import { useState, type ReactNode } from "react";
import TherapistProgrammePatients, {
  type ProgrammePatientRow,
} from "@/components/packages/TherapistProgrammePatients";

/**
 * My Patients, by person or by programme.
 *
 * Programmes was its own sidebar entry, but a programme is a package
 * patient's arc of care — the same people, grouped by purchase instead of
 * by name. Two entries meant a therapist had to know which of the two
 * lists a given patient lived in before they could look anything up. Same
 * rule as Sessions: one destination, a view switch on top.
 *
 * The by-person list is server-rendered and passed in as `children`, since
 * it reads patient charts the browser has no business fetching itself.
 */
export default function TherapistPatientsView({
  children,
  patientCount,
  programmes,
}: {
  children: ReactNode;
  patientCount: number;
  programmes: ProgrammePatientRow[];
}) {
  const [view, setView] = useState<"patients" | "programmes">("patients");

  return (
    <div>
      {/* No switch at all when there is nothing to switch to -- a therapist
          with no package patients should not be offered an empty view. */}
      {programmes.length > 0 && (
        <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1">
          {(
            [
              ["patients", "Patients", patientCount],
              ["programmes", "Programmes", programmes.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                view === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
              <span className="ml-1.5 text-[10px] font-bold text-slate-400">{count}</span>
            </button>
          ))}
        </div>
      )}

      {view === "patients" ? (
        children
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-500">
            Package purchases locked to you for their whole programme — tap one for the full
            completed/upcoming/pending picture.
          </p>
          <TherapistProgrammePatients purchases={programmes} />
        </>
      )}
    </div>
  );
}
