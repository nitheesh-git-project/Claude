"use client";

import { useState } from "react";
import { isValidPhoneNumber } from "libphonenumber-js/min";
import {
  COUNTRY_OPTIONS,
  composePhone,
  flagEmoji,
  splitStoredPhone,
  type CountryCode,
} from "@/lib/phoneNumber";

export default function PhoneNumberField({
  value,
  onChange,
  name = "phone",
  label = "Phone Number",
  required = false,
  labelClassName = "block font-semibold mb-1",
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  label?: string;
  required?: boolean;
  labelClassName?: string;
}) {
  // Lazy initializers seed from the stored/initial value once, on first
  // render only — after that this component owns country/national itself
  // and pushes composed changes back up via onChange, so re-deriving from
  // the value prop on every parent re-render would fight the user's own
  // in-progress edits.
  const [country, setCountry] = useState<CountryCode>(() => splitStoredPhone(value).country);
  const [national, setNational] = useState(() => splitStoredPhone(value).national);
  const [touched, setTouched] = useState(false);

  const invalid = touched && national.length > 0 && !isValidPhoneNumber(national, country);

  return (
    <div>
      {label && <label className={labelClassName}>{label}</label>}
      <div className="flex gap-2">
        <select
          value={country}
          onChange={(e) => {
            const next = e.target.value as CountryCode;
            setCountry(next);
            onChange(composePhone(next, national));
          }}
          aria-label="Country code"
          className="p-3 rounded-xl border border-slate-300 bg-white shrink-0 w-32 sm:w-40"
        >
          {COUNTRY_OPTIONS.map((c) => (
            // Intl.DisplayNames resolves country names from whatever ICU
            // data the runtime has, which can differ slightly between the
            // server (Node) and the client browser for a handful of
            // countries (e.g. Falkland Islands) — a harmless text
            // difference, not a real bug, so tell React not to discard
            // and re-render the whole subtree over it.
            <option key={c.code} value={c.code} suppressHydrationWarning>
              {flagEmoji(c.code)} {c.name} (+{c.dialCode})
            </option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="tel"
          required={required}
          value={national}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "");
            setNational(digits);
            onChange(composePhone(country, digits));
          }}
          onBlur={() => setTouched(true)}
          maxLength={15}
          className={`w-full p-3 rounded-xl border ${
            invalid ? "border-red-400" : "border-slate-300"
          }`}
        />
      </div>
      {/* Mirrors the composed E.164 value under the original field name so
          uncontrolled (FormData-based) forms keep working unchanged. */}
      <input type="hidden" name={name} value={composePhone(country, national)} />
      {invalid && (
        <p className="text-red-600 font-semibold mt-1 text-xs">
          <i className="fa-solid fa-circle-exclamation mr-1"></i>
          Enter a valid phone number for{" "}
          {COUNTRY_OPTIONS.find((c) => c.code === country)?.name ?? country}
        </p>
      )}
    </div>
  );
}
