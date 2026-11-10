"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * A small (i) that opens the explanatory paragraph a screen needs once and
 * then never again. Printed inline, four lines of "how this is calculated"
 * pushed the thing the screen is for (who needs paying) below the fold on a
 * phone; the same rule System Health's cards follow for their teaching text.
 * `label` names what the (i) explains, because a screen reader hearing
 * several "More information" buttons learns nothing.
 */
export default function InfoNote({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition hover:border-teal-500 hover:text-teal-700"
      >
        <span className="sr-only">{label}</span>
        <i aria-hidden className="fa-solid fa-info text-[11px]" />
      </button>
      {open && (
        <div id={id} className="basis-full text-[11px] leading-relaxed text-slate-500">
          {children}
        </div>
      )}
    </>
  );
}
