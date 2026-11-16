"use client";

/**
 * The signup forms' "I agree to the Terms of use and Privacy policy" tick
 * box. Required: every form refuses to create the account until it is
 * ticked, and then sends `signupTermsMetadata()` with the signup so the
 * database records which version was agreed to (policy_acceptances).
 * The links open in a new tab so a half-filled form is not lost.
 */
export default function TermsCheckbox({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-left text-sm leading-relaxed text-slate-700">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 flex-none accent-teal-700"
      />
      <span>
        I agree to the{" "}
        <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-700 underline underline-offset-2">
          Terms of use<span className="sr-only"> (opens in a new tab)</span>
        </a>{" "}
        and{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-700 underline underline-offset-2">
          Privacy policy<span className="sr-only"> (opens in a new tab)</span>
        </a>
        .
      </span>
    </label>
  );
}

/** The message every signup form shows when the box is not ticked. */
export const TERMS_REQUIRED_MESSAGE = "Please agree to the Terms of use and Privacy policy to create your account.";
