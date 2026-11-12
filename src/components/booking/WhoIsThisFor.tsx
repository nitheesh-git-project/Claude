"use client";

import type { SomeoneWithThem } from "@/lib/bookingFor";

export type WhoIsThisForState = {
  who: "me" | "family";
  name: string;
  /** Typed into a text box, so a string until the server reads it. */
  age: string;
  relationship: string;
  someoneWithThem: SomeoneWithThem | "";
};

export const EMPTY_WHO_IS_THIS_FOR: WhoIsThisForState = {
  who: "me",
  name: "",
  age: "",
  relationship: "",
  someoneWithThem: "",
};

const INPUT = "w-full min-h-12 rounded-xl border border-slate-300 p-3 text-base";
const LABEL = "block font-semibold mb-1.5 text-slate-900";

function Choice({
  checked,
  onSelect,
  children,
  name,
  value,
}: {
  checked: boolean;
  onSelect: () => void;
  children: React.ReactNode;
  name: string;
  value: string;
}) {
  return (
    <label
      className={`flex min-h-12 flex-1 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-base font-semibold transition ${
        checked
          ? "border-teal-600 bg-teal-50 text-teal-900"
          : "border-slate-300 bg-white text-slate-800 hover:border-teal-400"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="h-5 w-5 accent-teal-700"
      />
      {children}
    </label>
  );
}

/**
 * "Who is this for?" on the booking wizard's details step.
 *
 * Me, or someone in the patient's family. The family answer is the person's
 * name, age, how they are related, and whether another adult will be beside
 * them on the video call - what the physiotherapist needs before the call.
 * It is state only: the wizard sends it and the server validates it
 * (src/lib/bookingFor.ts). No account is made for the family member; the
 * booking is, as always, the signed-in patient's.
 */
export default function WhoIsThisFor({
  value,
  onChange,
}: {
  value: WhoIsThisForState;
  onChange: (next: WhoIsThisForState) => void;
}) {
  const patch = (p: Partial<WhoIsThisForState>) => onChange({ ...value, ...p });
  return (
    <fieldset className="m-0 min-w-0 space-y-3 border-0 p-0" data-testid="who-is-this-for">
      <legend className="mb-1.5 block font-semibold text-slate-900">Who is this for?</legend>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Choice name="bw-for-who" value="me" checked={value.who === "me"} onSelect={() => patch({ who: "me" })}>
          Me
        </Choice>
        <Choice
          name="bw-for-who"
          value="family"
          checked={value.who === "family"}
          onSelect={() => patch({ who: "family" })}
        >
          Someone in my family
        </Choice>
      </div>

      {value.who === "family" && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="block">
            <span className={LABEL}>Their name</span>
            <input
              id="bw-for-name"
              type="text"
              value={value.name}
              maxLength={80}
              autoComplete="off"
              onChange={(e) => patch({ name: e.target.value })}
              className={INPUT}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={LABEL}>Their age</span>
              <input
                id="bw-for-age"
                type="text"
                inputMode="numeric"
                value={value.age}
                maxLength={3}
                autoComplete="off"
                onChange={(e) => patch({ age: e.target.value.replace(/\D/g, "") })}
                className={INPUT}
              />
            </label>
            <label className="block">
              <span className={LABEL}>How are they related to you?</span>
              <input
                id="bw-for-relationship"
                type="text"
                value={value.relationship}
                maxLength={40}
                placeholder="For example, my mother"
                autoComplete="off"
                onChange={(e) => patch({ relationship: e.target.value })}
                className={INPUT}
              />
            </label>
          </div>
          <fieldset className="m-0 min-w-0 space-y-2 border-0 p-0">
            <legend className={LABEL}>Will someone be with them on the call?</legend>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Choice
                name="bw-for-with"
                value="yes"
                checked={value.someoneWithThem === "yes"}
                onSelect={() => patch({ someoneWithThem: "yes" })}
              >
                Yes
              </Choice>
              <Choice
                name="bw-for-with"
                value="no"
                checked={value.someoneWithThem === "no"}
                onSelect={() => patch({ someoneWithThem: "no" })}
              >
                No
              </Choice>
            </div>
          </fieldset>
          <p className="text-sm leading-relaxed text-slate-600">
            Your physiotherapist will see this before the call. The booking, the payment and the
            video link stay on your account.
          </p>
        </div>
      )}
    </fieldset>
  );
}
