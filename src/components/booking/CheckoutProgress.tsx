"use client";

import Spinner from "@/components/system/Spinner";

// What the payment step shows between the Pay tap and the Razorpay sheet.
//
// The tap used to swap the button's label to "Please wait..." and nothing
// else, for anything up to several seconds -- indistinguishable from a
// frozen page on a phone, and the moment a patient most needs to trust that
// their money is being handled. This names each stage as it happens, ticks
// off the ones that are done, and covers the form so a second tap cannot
// land on it. It is a status, not a dialog: nothing in it takes focus, and
// it is announced politely.

export type CheckoutProgressStage = "account" | "slot" | "opening" | "paying";

const STEPS: { stage: Exclude<CheckoutProgressStage, "paying">; label: string }[] = [
  { stage: "account", label: "Creating your account" },
  { stage: "slot", label: "Securing your slot" },
  { stage: "opening", label: "Opening secure payment" },
];

export default function CheckoutProgress({
  stage,
  includeAccount,
}: {
  stage: CheckoutProgressStage;
  /** Whether "Creating your account" is a step at all -- only for a patient
   *  signing up inside the wizard. */
  includeAccount: boolean;
}) {
  const steps = STEPS.filter((s) => includeAccount || s.stage !== "account");
  const currentIndex =
    stage === "paying" ? steps.length : steps.findIndex((s) => s.stage === stage);

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-white/90 px-6 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-xs space-y-4 text-center">
        <p className="font-display text-base font-bold text-slate-900">
          {stage === "paying" ? "Complete your payment in the secure window" : "Almost there"}
        </p>
        <ol className="space-y-2.5 text-left text-sm">
          {steps.map((s, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex;
            return (
              <li
                key={s.stage}
                className={`flex items-center gap-3 ${
                  done ? "text-teal-700" : active ? "font-semibold text-slate-900" : "text-slate-400"
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center">
                  {done ? (
                    <i aria-hidden className="fa-solid fa-circle-check" />
                  ) : active ? (
                    <Spinner size={16} className="text-teal-700" />
                  ) : (
                    <i aria-hidden className="fa-solid fa-circle text-[8px]" />
                  )}
                </span>
                <span>
                  {s.label}
                  {done && <span className="sr-only"> - done</span>}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-slate-500">
          <i aria-hidden className="fa-solid fa-lock mr-1" />
          Payments are handled by Razorpay. Please don&apos;t close this page.
        </p>
      </div>
    </div>
  );
}
