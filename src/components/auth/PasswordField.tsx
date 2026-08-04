"use client";

import { useState, type ReactNode } from "react";

const MIN_LENGTH = 6;

// Mirrors ConfirmPasswordField's touched-on-blur inline-error pattern for
// the minimum-length rule, so it shows the same way (below the field, on
// blur) instead of only surfacing after a submit/Next click.
export default function PasswordField({
  value,
  onChange,
  name = "password",
  label = "Password",
  labelClassName = "block font-semibold mb-1",
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  label?: ReactNode;
  labelClassName?: string;
}) {
  const [touched, setTouched] = useState(false);
  const tooShort = touched && value.length > 0 && value.length < MIN_LENGTH;

  return (
    <div>
      <label className={labelClassName}>{label}</label>
      <input
        type="password"
        name={name}
        required
        minLength={MIN_LENGTH}
        maxLength={72}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        className={`w-full p-3 rounded-xl border ${
          tooShort ? "border-red-400" : "border-slate-300"
        }`}
      />
      {tooShort && (
        <p className="text-red-600 font-semibold mt-1">
          <i className="fa-solid fa-circle-exclamation mr-1"></i>
          Password must be at least {MIN_LENGTH} characters
        </p>
      )}
    </div>
  );
}
