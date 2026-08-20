const STEPS = [
  {
    icon: "fa-comment-medical",
    title: "You answer",
    body: "Seven short questions in a pop-up, one at a time. About two minutes.",
  },
  {
    icon: "fa-user-shield",
    title: "The clinic checks it",
    body: "An admin reads it before it goes into your chart — that's why edits take a moment to appear.",
  },
  {
    icon: "fa-stethoscope",
    title: "Your therapist examines you",
    body: "After a session they record what they found on the body map. That part fills in on its own.",
  },
];

/**
 * Three steps, once, at the top of the Health Profile.
 *
 * The confusion this answers is structural, not cosmetic: this screen
 * holds two different datasets written by two different people (the
 * patient's own answers, the therapist's exam) with an admin review in
 * between, and nothing on the page used to say so. Patients read the
 * therapist's half as something they had failed to fill in.
 */
export default function HealthProfileSteps() {
  return (
    <ol className="grid gap-3 sm:grid-cols-3 print:hidden">
      {STEPS.map((step, index) => (
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
