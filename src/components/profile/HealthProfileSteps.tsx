import type { ConditionSpecialty } from "@/lib/conditionSpecialty";

/**
 * Three steps, once, at the top of the Health Profile.
 *
 * The confusion this answers is structural, not cosmetic: this screen
 * holds two different datasets written by two different people, and
 * nothing on the page used to say so. Patients read the therapist's half
 * as something they had failed to fill in.
 *
 * The authorship order has since inverted -- the therapist now fills the
 * record in at the first session and that is what unlocks the patient --
 * so this copy is what carries the change. Step one is no longer "you
 * answer"; a patient arriving before their first session has nothing to
 * do here and should be told so plainly rather than left looking for a
 * button.
 *
 * Step three differs by specialty because the examination layer does. The
 * body map is an ORTHOPAEDIC instrument; the neurological and paediatric
 * exam layers are not built yet, and the honest thing is to say where
 * those findings live in the meantime rather than to imply a chart that
 * will never fill in.
 */

type Step = { icon: string; title: string; body: string };

const STEP_ONE: Step = {
  icon: "fa-comment-medical",
  title: "Your therapist asks you",
  body: "At your first session they go through a short set of questions with you and write down your answers.",
};

const STEP_TWO: Step = {
  icon: "fa-lock-open",
  title: "It opens up to you",
  body: "Once it is on file you can read it, correct it and add to it. Your edits are checked by the clinic first.",
};

const STEP_THREE_BY_SPECIALTY: Record<ConditionSpecialty, Step> = {
  ortho: {
    icon: "fa-stethoscope",
    title: "Your therapist examines you",
    body: "After a session they record what they found on the body map. That part fills in on its own.",
  },
  neuro: {
    icon: "fa-notes-medical",
    title: "Your therapist tracks your progress",
    body: "How much you can manage on your own is re-asked over time — that is the line you will watch move.",
  },
  pediatrics: {
    icon: "fa-child-reaching",
    title: "Milestones get ticked off",
    body: "As your child manages more on their own, the milestone list grows. That is how progress is measured here.",
  },
};

export default function HealthProfileSteps({
  specialty = "ortho",
}: {
  specialty?: ConditionSpecialty;
}) {
  const steps: Step[] = [STEP_ONE, STEP_TWO, STEP_THREE_BY_SPECIALTY[specialty]];

  return (
    <ol className="grid gap-3 sm:grid-cols-3 print:hidden">
      {steps.map((step, index) => (
        <li key={step.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-50 text-[11px] font-bold text-teal-700">
              {index + 1}
            </span>
            <i aria-hidden className={`fa-solid ${step.icon} text-xs text-teal-600`} />
            <p className="text-sm font-bold text-slate-800">{step.title}</p>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}
