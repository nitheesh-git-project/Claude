"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import OverlayPortal from "@/components/system/OverlayPortal";
import { describeValidity, tidyFieldLabel } from "@/lib/formValidationMessage";

// The browser's own validation bubble, replaced app-wide.
//
// Submitting a form with a blank `required` box pops a grey operating-system
// tooltip saying "Please fill out this field." -- unstyled, differently
// worded and differently placed on every browser, in a product where every
// other message is the clinic's own. It is also the one piece of UI here
// that no screen opted into: it comes free with the attribute.
//
// This is one listener at the root rather than a change to 34 forms, and
// that is the point: `invalid` is fired by the browser on every control it
// refuses, and it is the only event that fires for all of them. Calling
// `preventDefault` on it suppresses the native bubble and nothing else --
// the submit is still cancelled by the browser, exactly as before, so no
// form's own handling changes.
//
// Four things are load-bearing:
//
// 1. **`invalid` does not bubble, so the listener is a capture one.** A
//    listener on `document` in the bubble phase never hears it at all, which
//    is the silent way to ship half of this.
// 2. **The first refused control wins, and it is looked up rather than
//    inferred from the event.** The browser fires one event per invalid
//    control, and the events are separate dispatches -- a microtask
//    checkpoint runs between them, so a "first event of this burst" guard
//    is released before the second event arrives and the message ends up
//    describing the *last* refused control. A form of nine boxes with a
//    blank name at the top pointed at the price near the bottom. So the
//    handler asks the control's own form which of its fields is the first
//    invalid one, reading `validity.valid` rather than calling
//    `checkValidity()` -- that call fires `invalid` again, into this same
//    listener.
// 3. **It reads the control, never a form's own state.** The message is
//    built from `validity` plus the control's label, so a form that never
//    heard of this file still gets a sentence naming its own field.
// 4. **It clears itself the moment the reader acts.** On input, on a fresh
//    submit, on Escape, on a tap elsewhere, and when the control leaves the
//    page under it -- a red ring left behind on a corrected field is the
//    same lie as a stale error message.

type Anchored = {
  el: HTMLElement;
  message: string;
  /** Viewport coordinates, recomputed while the page moves under it. */
  rect: { top: number; left: number; width: number; height: number };
};

const INVALID_ATTR = "data-invalid";

function rectOf(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function labelTextFor(el: HTMLElement): string | undefined {
  const labelled = el as HTMLInputElement & { labels?: NodeListOf<HTMLLabelElement> };
  const fromLabel = labelled.labels?.[0]?.textContent;
  const tidyLabel = tidyFieldLabel(fromLabel);
  if (tidyLabel) return tidyLabel;
  const aria = tidyFieldLabel(el.getAttribute("aria-label"));
  if (aria) return aria;
  const describedBy = el.getAttribute("aria-labelledby");
  if (describedBy) {
    const target = document.getElementById(describedBy.split(/\s+/)[0]);
    const fromRef = tidyFieldLabel(target?.textContent);
    if (fromRef) return fromRef;
  }
  // A placeholder is a last resort: it is often an example rather than a
  // name ("e.g. 9876543210"), so it is used only where nothing else named
  // the field at all.
  return tidyFieldLabel(el.getAttribute("placeholder"));
}

function messageFor(el: HTMLElement): string {
  const control = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const v = control.validity;
  return describeValidity({
    customError: v.customError ? control.validationMessage : undefined,
    valueMissing: v.valueMissing,
    typeMismatch: v.typeMismatch,
    patternMismatch: v.patternMismatch,
    tooShort: v.tooShort,
    tooLong: v.tooLong,
    rangeUnderflow: v.rangeUnderflow,
    rangeOverflow: v.rangeOverflow,
    stepMismatch: v.stepMismatch,
    badInput: v.badInput,
    type: (control as HTMLInputElement).type,
    tag: control.tagName.toLowerCase() as "input" | "select" | "textarea",
    label: labelTextFor(el),
    minLength: "minLength" in control && control.minLength >= 0 ? control.minLength : undefined,
    maxLength: "maxLength" in control && control.maxLength >= 0 ? control.maxLength : undefined,
    min: el.getAttribute("min") ?? undefined,
    max: el.getAttribute("max") ?? undefined,
    step: el.getAttribute("step") ?? undefined,
    title: el.getAttribute("title") ?? undefined,
  });
}

/** The first field this form refuses, in document order.
 *
 *  Read off `validity.valid` and never `checkValidity()`: that call fires
 *  an `invalid` event of its own, which this file is listening for. */
function firstInvalidIn(fired: HTMLElement): HTMLElement {
  const form = (fired as HTMLInputElement).form;
  if (!form) return fired;
  for (const candidate of Array.from(form.elements)) {
    const control = candidate as HTMLInputElement;
    if (!control.willValidate) continue;
    if (!control.validity.valid) return control as unknown as HTMLElement;
  }
  return fired;
}

export default function FormValidationChrome() {
  const [shown, setShown] = useState<Anchored | null>(null);
  // The control being complained about, kept outside state so the listeners
  // below can read it without being re-bound on every message.
  const targetRef = useRef<HTMLElement | null>(null);
  // The message currently on screen, so the four-or-five events one submit
  // produces do not each set state for the same answer.
  const messageRef = useRef<string | null>(null);

  const clear = useCallback(() => {
    const el = targetRef.current;
    if (el) el.removeAttribute(INVALID_ATTR);
    targetRef.current = null;
    messageRef.current = null;
    setShown(null);
  }, []);

  useEffect(() => {
    function onInvalid(event: Event) {
      const el = event.target as HTMLElement | null;
      if (!el || !(el instanceof HTMLElement)) return;
      // Suppress the browser's own bubble. The submit stays cancelled --
      // that is the browser's doing, not the bubble's.
      event.preventDefault();

      // The one the person is sent to is the first refused field on the
      // form, whichever of them fired this particular event.
      const subject = firstInvalidIn(el);
      const message = messageFor(subject);
      if (targetRef.current === subject && messageRef.current === message) return;

      const previous = targetRef.current;
      if (previous && previous !== subject) previous.removeAttribute(INVALID_ATTR);
      subject.setAttribute(INVALID_ATTR, "true");
      targetRef.current = subject;
      messageRef.current = message;
      setShown({ el: subject, message, rect: rectOf(subject) });
      const el2 = subject;

      // A refused control below the fold is a form that appears to have
      // done nothing at all.
      el2.scrollIntoView({ block: "center", behavior: "smooth" });
      // focus() on a control inside a dialog is safe: the dialog's own focus
      // trap allows it, since the control is inside the trap.
      if (typeof (el2 as HTMLInputElement).focus === "function") {
        (el2 as HTMLInputElement).focus({ preventScroll: true });
      }
    }

    document.addEventListener("invalid", onInvalid, true);
    return () => document.removeEventListener("invalid", onInvalid, true);
  }, []);

  useEffect(() => {
    if (!shown) return;
    const el = shown.el;

    const reposition = () => {
      // The control can be refreshed away under an open message -- a
      // router.refresh() re-renders the screen it sat on.
      if (!el.isConnected) {
        clear();
        return;
      }
      setShown((s) => (s && s.el === el ? { ...s, rect: rectOf(el) } : s));
    };
    const onInput = () => clear();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && el.contains(e.target)) return;
      clear();
    };

    el.addEventListener("input", onInput);
    el.addEventListener("change", onInput);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown, true);
    // Cheap safety net for the cases no event covers: a panel collapsing, a
    // list re-paging, the control being replaced by a refresh.
    const timer = window.setInterval(reposition, 250);

    return () => {
      el.removeEventListener("input", onInput);
      el.removeEventListener("change", onInput);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.clearInterval(timer);
    };
  }, [shown, clear]);

  if (!shown) return null;

  const { rect, message } = shown;
  // Below the control where there is room, above it where there is not --
  // the message must never cover the box the reader is about to type in.
  const below = rect.top + rect.height + 8;
  const placeAbove = below + 72 > window.innerHeight && rect.top > 96;
  const top = placeAbove ? Math.max(8, rect.top - 8) : below;
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - 328));

  return (
    <OverlayPortal>
      <div
        // Above every dialog in the app (z-50), since the control it points
        // at is usually inside one.
        className="pointer-events-none fixed z-[60] w-[min(20rem,calc(100vw-1rem))]"
        style={{ top, left, transform: placeAbove ? "translateY(-100%)" : undefined }}
      >
        <div
          role="alert"
          className="form-validation-message pointer-events-auto flex items-start gap-2 rounded-xl border border-red-200 bg-white px-3 py-2.5 text-xs font-semibold text-red-700 shadow-lg shadow-red-900/5"
        >
          <i aria-hidden className="fa-solid fa-circle-exclamation mt-0.5 text-[11px]" />
          <span>{message}</span>
        </div>
      </div>
    </OverlayPortal>
  );
}
