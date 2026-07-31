"use client";

import { useState } from "react";

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
  // Fires on blur (tapping away), or as soon as enough has been typed to
  // fully compare against the password — the latter means a complete wrong
  // retype shows the error immediately as typing finishes, without relying
  // on a blur event that a tap straight onto the submit button can race
  // against.
  const mismatched =
    value.length > 0 && password !== value && (touched || value.length >= password.length);

  return (
    <div>
      <label className={labelClassName}>{label}</label>
      <input
        type="password"
        name={name}
        required
        minLength={6}
        maxLength={72}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        className={`w-full p-3 rounded-xl border ${
          mismatched ? "border-red-400" : "border-slate-300"
        }`}
      />
      {mismatched && (
        <p className={`text-red-600 font-semibold mt-1 ${errorClassName}`}>
          <i className="fa-solid fa-circle-exclamation mr-1"></i>
          Passwords do not match
        </p>
      )}
    </div>
  );
}
