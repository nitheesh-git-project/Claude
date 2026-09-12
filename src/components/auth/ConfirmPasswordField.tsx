"use client";

import { useId, useState } from "react";

// See EmailField for why the label carries a generated `htmlFor`. This one
// is always a retype, so `autoComplete` is "new-password" on every caller.
export default function ConfirmPasswordField({
  password,
  value,
  onChange,
  label = "Confirm Password",
  name = "confirmPassword",
  labelClassName = "block font-semibold mb-1",
  errorClassName = "",
}: {
  password: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  name?: string;
  labelClassName?: string;
  errorClassName?: string;
}) {
  const [touched, setTouched] = useState(false);
  const id = useId();
  const errorId = `${id}-error`;
  // Fires on blur (tapping away), or as soon as enough has been typed to
  // fully compare against the password — the latter means a complete wrong
  // retype shows the error immediately as typing finishes, without relying
  // on a blur event that a tap straight onto the submit button can race
  // against.
  const mismatched =
    value.length > 0 && password !== value && (touched || value.length >= password.length);

  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <input
        id={id}
        type="password"
        name={name}
        required
        minLength={6}
        maxLength={72}
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={mismatched || undefined}
        aria-describedby={mismatched ? errorId : undefined}
        className={`w-full p-3 rounded-xl border ${
          mismatched ? "border-red-400" : "border-slate-300"
        }`}
      />
      {mismatched && (
        <p id={errorId} className={`text-red-600 font-semibold mt-1 ${errorClassName}`}>
          <i aria-hidden="true" className="fa-solid fa-circle-exclamation mr-1"></i>
          Passwords do not match
        </p>
      )}
    </div>
  );
}
