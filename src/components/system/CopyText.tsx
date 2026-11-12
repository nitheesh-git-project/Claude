"use client";

import { useState } from "react";

/**
 * A reference (a Razorpay payment ID, an order ID) with a one-tap copy.
 *
 * The ID is what the clinic quotes to Razorpay and what a patient reads out
 * on the phone, so it is shown in full -- breaking anywhere rather than
 * pushing a phone screen sideways -- and copying it is one tap. The button
 * says it worked; a browser that refuses the clipboard leaves the text there
 * to select by hand.
 */
export default function CopyText({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  /** What is being copied, for the button's accessible name. */
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 2000);
  }
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 ${className}`}>
      <span className="font-mono [overflow-wrap:anywhere]" data-testid="copy-text-value">
        {value}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`${label}: ${value}`}
        title={label}
        className="inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
      >
        {state === "copied" ? (
          <span className="text-[11px] font-semibold text-teal-700">Copied</span>
        ) : state === "failed" ? (
          <span className="text-[11px] font-semibold text-slate-600">Select to copy</span>
        ) : (
          <i aria-hidden="true" className="fa-solid fa-copy text-xs"></i>
        )}
      </button>
    </span>
  );
}
