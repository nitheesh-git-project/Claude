"use client";

/**
 * The notebook's own three-step tip, shown the first time it opens (and again
 * from its "?" button). Each step names one real thing and the notebook
 * rings that control while the step is up -- writing, the page buttons, the
 * save line -- so it is learned by looking at the notebook, not at a picture
 * of one. Remembered in this browser (localStorage, a per-person
 * convenience: losing it only means seeing three short tips again).
 */
export const NOTEBOOK_TOUR_KEY = "mr-notebook-tour-v1";

export const NOTEBOOK_TOUR_STEPS = [
  {
    target: "writing",
    title: "Write anything",
    body: "Notes for yourself - what your physio said, how today felt, a question for next time. Only you can read it.",
  },
  {
    target: "pages",
    title: "Pages, like a real notebook",
    body: "New page starts a fresh one. The arrows turn back and forward, and the list shows them all.",
  },
  {
    target: "save",
    title: "It saves itself",
    body: "Every word is kept as you type - watch for Saved here. Close it any time.",
  },
] as const;

export type NotebookTourTarget = (typeof NOTEBOOK_TOUR_STEPS)[number]["target"];

export function notebookTourSeen(): boolean {
  try {
    return window.localStorage.getItem(NOTEBOOK_TOUR_KEY) === "seen";
  } catch {
    return false;
  }
}

export function markNotebookTourSeen() {
  try {
    window.localStorage.setItem(NOTEBOOK_TOUR_KEY, "seen");
  } catch {
    // Storage blocked: the tips simply show again next time.
  }
}

export default function NotebookTour({
  step,
  onStep,
  onDone,
}: {
  step: number;
  onStep: (next: number) => void;
  onDone: () => void;
}) {
  const s = NOTEBOOK_TOUR_STEPS[step];
  const last = step === NOTEBOOK_TOUR_STEPS.length - 1;
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="How the notebook works"
      data-testid="notebook-tour"
      // Never over what it points at. On a phone the writing step sits low
      // and the two about the buttons at the foot sit high; on a laptop the
      // left-hand page is free, so every tip sits there.
      className={`absolute inset-x-3 z-20 mx-auto max-w-sm rounded-2xl bg-[#1f2a44] p-4 text-white shadow-2xl ${
        s.target === "writing" ? "bottom-24" : "top-12"
      } lg:inset-x-auto lg:bottom-auto lg:left-[5%] lg:top-1/3 lg:w-[40%] lg:max-w-none`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-200">
        Tip {step + 1} of {NOTEBOOK_TOUR_STEPS.length}
      </p>
      <p className="mt-1 text-base font-bold">{s.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-slate-200">{s.body}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex gap-1.5" aria-hidden="true">
          {NOTEBOOK_TOUR_STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 w-5 rounded-full ${i === step ? "bg-teal-300" : "bg-white/25"}`} />
          ))}
        </div>
        <div className="flex gap-2">
          {!last && (
            <button type="button" onClick={onDone} className="min-h-10 rounded-full px-3 text-sm font-semibold text-slate-200 hover:bg-white/10">
              Skip
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? onDone() : onStep(step + 1))}
            className="min-h-10 rounded-full bg-teal-500 px-4 text-sm font-bold text-white hover:bg-teal-400"
          >
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
