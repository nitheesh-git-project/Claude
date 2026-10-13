"use client";

import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";

// Every password box in the app, with the eye toggle that shows what was
// typed. Mistyping a password you cannot see is the commonest reason a
// sign-in or a registration fails on a phone keyboard, so every field gets
// one - sign-in, registration, reset and both booking wizards alike.
//
// A drop-in for `<input type="password">`: every other prop passes straight
// through (id, name, autoComplete, value/onChange, aria-*), so callers keep
// their own labels, validation and error rings.
//
// The box goes back to hidden when its form submits. A password manager
// decides whether to offer "save this password" by the field's type at
// submit time, and a password left showing as plain text is also the one
// someone reads over a shoulder after the tap on Sign In.
export default function PasswordInput({
  className = "",
  id,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const hide = () => setShown(false);
    form.addEventListener("submit", hide, true);
    return () => form.removeEventListener("submit", hide, true);
  }, []);

  return (
    <div className="relative">
      <input
        {...props}
        ref={inputRef}
        id={inputId}
        type={shown ? "text" : "password"}
        // Keeps a shown password out of the keyboard's suggestion strip and
        // out of spellcheck's red underline.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`${className} pr-12`}
      />
      <button
        type="button"
        onClick={() => {
          setShown((s) => !s);
          // Keeps the keyboard up on a phone and the caret where it was.
          inputRef.current?.focus();
        }}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        aria-controls={inputId}
        title={shown ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-500 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500"
      >
        <i aria-hidden="true" className={`fa-solid ${shown ? "fa-eye-slash" : "fa-eye"}`}></i>
      </button>
    </div>
  );
}
