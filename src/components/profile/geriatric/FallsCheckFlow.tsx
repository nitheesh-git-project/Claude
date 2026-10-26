"use client";

import { useState } from "react";
import RecordTestDialog from "@/components/profile/progress/RecordTestDialog";
import type { RecordSetup } from "@/components/profile/progress/RecordTestButton";
import { FALLS_CHECK_STEPS } from "@/lib/geriatricProfile";
import { EMPTY_CONDITION_DRAFT, type ConditionDraft } from "@/lib/recordTest";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";

/**
 * "Start the falls check": the four STEADI tests in the clinic's order (Timed
 * Up and Go, 30-second chair stand, 4-stage balance, 4-metre walk), each in
 * Record a test with the timer its own test gets, saved as it is done so the
 * tiles fill in as the check goes. A step can be left out ("Leave this one
 * out"); what is left out is simply not recorded, never saved as a blank. The
 * way the test was done (in person, the walking aid) carries to the next
 * step, so it is asked once.
 */
export default function FallsCheckFlow({ setup, walkingAid }: { setup: RecordSetup; walkingAid: string | null }) {
  const router = useRouter();
  const { show } = useToast();
  const [step, setStep] = useState<number | null>(null);
  const [saved, setSaved] = useState(0);
  const [cond, setCond] = useState<ConditionDraft | undefined>(undefined);

  function begin() {
    setSaved(0);
    setCond({ ...EMPTY_CONDITION_DRAFT, setting: "in_person", walkingAid: walkingAid ?? "" });
    setStep(0);
  }
  function next(wasSaved: boolean) {
    const done = saved + (wasSaved ? 1 : 0);
    setSaved(done);
    if (step === null || step + 1 >= FALLS_CHECK_STEPS.length) {
      setStep(null);
      show(done === 0 ? "The falls check ended with nothing recorded." : `Falls check done: ${done} of ${FALLS_CHECK_STEPS.length} tests recorded.`);
      router.refresh();
    } else {
      setStep(step + 1);
    }
  }

  const current = step !== null ? FALLS_CHECK_STEPS[step] : null;
  return (
    <>
      <button
        type="button"
        onClick={begin}
        data-testid="falls-check-start"
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 print:hidden"
      >
        <i aria-hidden className="fa-solid fa-person-walking text-xs" />
        Start the falls check
      </button>
      {current && step !== null && (
        <RecordTestDialog
          key={current.measureKey}
          patientId={setup.patientId}
          patientName={setup.patientName}
          profileKind={setup.profileKind}
          series={setup.series}
          enabledLicensed={setup.enabledLicensed}
          licenceUnreadable={setup.licenceUnreadable}
          asAdmin={setup.asAdmin}
          patient={setup.patient}
          initialMeasureKey={current.measureKey}
          lockedMeasure
          initialConditions={cond}
          flow={{ position: step + 1, of: FALLS_CHECK_STEPS.length, title: current.title, onSkip: () => next(false) }}
          onSaved={({ conditions }) => {
            setCond(conditions);
            next(true);
          }}
          onClose={() => {
            setStep(null);
            if (saved > 0) router.refresh();
          }}
        />
      )}
    </>
  );
}
