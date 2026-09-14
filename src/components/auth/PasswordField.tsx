"use client";

import { useId, useState, type ReactNode } from "react";

const MIN_LENGTH = 6;

// Mirrors ConfirmPasswordField's touched-on-blur inline-error pattern for
// the minimum-length rule, so it shows the same way (below the field, on
// blur) instead of only surfacing after a submit/Next click.
//
// See EmailField for why the label carries a generated `htmlFor` and why
// `autoComplete` matters here. The default is "current-password" because
// signing in is the commoner case; a registration form passes
// "new-password", which is what tells a password manager to *offer* one
// rather than fill the last one it saw.
export default function PasswordField({
  value,
  onChange,
  name = "password",
  label = "Password",
  labelClassName = "block font-semibold mb-1",
  autoComplete = "current-password",
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  label?: ReactNode;
  labelClassName?: string;
  autoComplete?: string;
}) {
  const [touched, setTouched] = useState(false);
  const id = useId();
  const errorId = `${id}-error`;
  const tooShort = touched && value.length > 0 && value.length < MIN_LENGTH;

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
        minLength={MIN_LENGTH}
        maxLength={72}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={tooShort || undefined}
        aria-describedby={tooShort ? errorId : undefined}
        className={`w-full p-3 rounded-xl border ${
          tooShort ? "border-red-400" : "border-slate-300"
        }`}
      />
      {tooShort && (
        <p id={errorId} className="text-red-600 font-semibold mt-1">
          <i aria-hidden="true" className="fa-solid fa-circle-exclamation mr-1"></i>
          Password must be at least {MIN_LENGTH} characters
        </p>
      )}
    </div>
  );
}
