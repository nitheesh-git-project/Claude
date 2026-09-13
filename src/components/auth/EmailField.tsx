"use client";

import { useId, useState } from "react";
import { isValidEmail } from "@/lib/validateEmail";

// Mirrors ConfirmPasswordField's touched-on-blur inline-error pattern, so
// email format errors show the same way (below the field, on blur) instead
// of only surfacing after a submit/Next click.
//
// The label is tied to the input with a generated id rather than sitting
// beside it: a `<label>` that neither wraps its control nor carries
// `htmlFor` is a caption, not a label -- it looks right and announces as an
// unnamed text box, which on a sign-in form means a screen reader user is
// asked to type something into a field nothing has named. `useId` rather
// than a hand-written id because these fields render more than once on a
// page (sign in and register share a card) and a duplicate id silently
// points both labels at the first input.
//
// `autoComplete` is the other half of the same idea for everyone else: it
// is what lets a password manager or a phone's keychain fill and, more
// importantly, *save* the credential. Without it people fall back to a
// password they can retype from memory.
export default function EmailField({
  value,
  onChange,
  name = "email",
  label = "Email Address",
  labelClassName = "block font-semibold mb-1",
  autoComplete = "email",
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  label?: string;
  labelClassName?: string;
  autoComplete?: string;
}) {
  const [touched, setTouched] = useState(false);
  const id = useId();
  const errorId = `${id}-error`;
  const invalid = touched && value.length > 0 && !isValidEmail(value);

  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <input
        id={id}
        type="email"
        name={name}
        required
        maxLength={254}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        className={`w-full p-3 rounded-xl border ${
          invalid ? "border-red-400" : "border-slate-300"
        }`}
      />
      {invalid && (
        <p id={errorId} className="text-red-600 font-semibold mt-1">
          <i aria-hidden="true" className="fa-solid fa-circle-exclamation mr-1"></i>
          Enter a valid email address
        </p>
      )}
    </div>
  );
}
