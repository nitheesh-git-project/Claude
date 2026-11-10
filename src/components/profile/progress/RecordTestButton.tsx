"use client";

import { useState } from "react";
import RecordTestDialog from "@/components/profile/progress/RecordTestDialog";
import type { OxygenStopLimit } from "@/lib/cardioSafety";
import type { ProfileKind } from "@/lib/outcomeMeasures";
import type { MeasureSeries } from "@/lib/outcomeSeries";
import type { SixMinuteWalkEquationRead } from "@/lib/sixMinuteWalkEquation";

/** What a button that opens "Record a test" needs to know: the same things
 *  ProfileProgressSection passes its own dialog. */
export type RecordSetup = {
  patientId: string;
  patientName?: string;
  profileKind: ProfileKind;
  /** The record so far, for "last time" beside the new reading. */
  series: MeasureSeries[];
  enabledLicensed: readonly string[];
  licenceUnreadable: boolean;
  asAdmin: boolean;
  /** For the six-minute walk's predicted distance. */
  patient?: { sex?: "female" | "male" | null; ageYears?: number | null; heightCm?: number | null; weightKg?: number | null } | null;
  walkEquation?: SixMinuteWalkEquationRead;
  /** The patient's own oxygen stop limit (heart and lung). */
  oxygenLimit?: OxygenStopLimit;
};

const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 print:hidden";

/**
 * A button on a card that opens "Record a test" at one measure ("Record the
 * home safety check", "Record height or weight"). Only mounted for a viewer
 * who may record (the page passes `setup` as null otherwise), so it is
 * absent, never disabled.
 */
export default function RecordTestButton({
  setup,
  measureKey,
  label,
  icon = "fa-ruler",
  locked = true,
  primary = false,
}: {
  setup: RecordSetup;
  measureKey: string;
  label: string;
  icon?: string;
  /** Hide the "Which test?" picker (a single-purpose button). */
  locked?: boolean;
  primary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${BUTTON} ${primary ? "bg-teal-700 text-white hover:bg-teal-800" : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"}`}
      >
        <i aria-hidden className={`fa-solid ${icon} text-xs`} />
        {label}
      </button>
      {open && (
        <RecordTestDialog
          patientId={setup.patientId}
          patientName={setup.patientName}
          profileKind={setup.profileKind}
          series={setup.series}
          enabledLicensed={setup.enabledLicensed}
          licenceUnreadable={setup.licenceUnreadable}
          asAdmin={setup.asAdmin}
          patient={setup.patient}
          walkEquation={setup.walkEquation}
          oxygenLimit={setup.oxygenLimit}
          initialMeasureKey={measureKey}
          lockedMeasure={locked}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
