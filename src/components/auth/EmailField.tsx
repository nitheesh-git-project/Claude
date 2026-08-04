"use client";

import { useState } from "react";
import { isValidEmail } from "@/lib/validateEmail";

// Mirrors ConfirmPasswordField's touched-on-blur inline-error pattern, so
// email format errors show the same way (below the field, on blur) instead
// of only surfacing after a submit/Next click.
export default function EmailField({
  value,
  onChange,
  name = "email",
  label = "Email Address",
  labelClassName = "block font-semibold mb-1",
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  label?: string;
  labelClassName?: string;
}) {
  const [touched, setTouched] = useState(false);
  const invalid = touched && value.length > 0 && !isValidEmail(value);

  return (
    <div>
      <label className={labelClassName}>{label}</label>
      <input
        type="email"
        name={name}
        required
        maxLength={254}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        className={`w-full p-3 rounded-xl border ${
          invalid ? "border-red-400" : "border-slate-300"
        }`}
      />
      {invalid && (
        <p className="text-red-600 font-semibold mt-1">
          <i className="fa-solid fa-circle-exclamation mr-1"></i>
          Enter a valid email address
        </p>
      )}
    </div>
  );
}
