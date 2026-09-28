"use client";

import { useEffect } from "react";
import {
  minAllowsNegative,
  shouldBlockNumericInsert,
  stepAllowsDecimal,
} from "@/lib/numericInputGuard";

// A number box takes digits, and nothing else.
//
// `<input type="number">` does not do that on its own: every browser also
// accepts `e` and `E` for scientific notation, plus `+`, and Chromium keeps
// the character on screen while reporting `value` as the empty string. So
// typing a letter into the condition form's Order box left an "e" sitting
// in the field, refused everything typed after it, and then submitted as
// though the box had been left blank -- a form that looks filled in and
// arrives empty. Nothing this clinic sells is priced at 1e5.
//
// One listener at the root, the same shape as `FormValidationChrome` and
// for the same reason: this is a rule about what a control accepts, and
// there are 26 number boxes in the app today. Leaving it to each of them is
// leaving it to whoever writes the 27th.
//
// Three things are load-bearing:
//
// 1. **`beforeinput`, not `keydown`.** It is the one event that covers
//    typing, pasting and drag-and-drop alike, and it carries the text being
//    inserted rather than a key name -- so a pasted "₹1,200" is judged by
//    the same rule as a typed comma, and a keyboard layout nobody tested is
//    not a hole.
// 2. **The judgement is on the resulting string, not the keystroke.** A
//    minus is meaningful in front and meaningless in the middle; one
//    decimal point is fine where a second is not. `shouldBlockNumericInsert`
//    holds that, with its own tests.
// 3. **What the field itself allows is read off the field.** `step` decides
//    whether a fraction is legitimate and `min` whether a minus is, so a
//    price still takes 499.50 and a field with no floor still takes -1.
//    Inventing a stricter rule here would be this file overriding forms it
//    knows nothing about.

export default function NumericInputGuard() {
  useEffect(() => {
    function onBeforeInput(event: Event) {
      const el = event.target as HTMLInputElement | null;
      if (!el || el.tagName !== "INPUT" || el.type !== "number") return;

      const input = event as InputEvent;
      // Deletions, undo and redo carry no data and are never the problem.
      if (input.data == null) return;

      // Chromium reports `value` as "" once the box holds something it
      // cannot parse -- which is exactly the state this guard exists to
      // prevent, so the raw text is preferred where the browser exposes it.
      const current = el.value;
      const selection =
        el.selectionStart != null && el.selectionEnd != null
          ? { start: el.selectionStart, end: el.selectionEnd }
          : undefined;

      const blocked = shouldBlockNumericInsert({
        data: input.data,
        current,
        selection,
        allowsDecimal: stepAllowsDecimal(el.getAttribute("step")),
        allowsNegative: minAllowsNegative(el.getAttribute("min")),
      });
      if (blocked) event.preventDefault();
    }

    document.addEventListener("beforeinput", onBeforeInput, true);
    return () => document.removeEventListener("beforeinput", onBeforeInput, true);
  }, []);

  return null;
}
