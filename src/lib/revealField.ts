// Takes a person to the field that needs their attention.
//
// A rule a form checks in JavaScript (a name that is blank, two passwords that
// differ, a box that must be ticked) can only say so in a message, and the
// message usually sits at the top of the form -- which, on a phone, is above
// the fold of where the person is looking. They tap Continue, nothing seems to
// happen, and the page looks broken. Native `required` already scrolls to and
// focuses the refused control (FormValidationChrome keeps that); this is the
// same behaviour for the rules the browser cannot see.
//
// Accepts the control itself, or any element that contains one (a wrapper
// around a composite field), by element or by id. Marks it with the same
// `data-invalid` ring the native path paints, and removes the mark the moment
// the reader changes it -- a red ring left on a corrected field is the same
// lie as a stale message.

const INVALID_ATTR = "data-invalid";
const CONTROL_SELECTOR = "input:not([type=hidden]), select, textarea, button";

function resolve(target: string | HTMLElement | null | undefined): HTMLElement | null {
  const el = typeof target === "string" ? document.getElementById(target) : target;
  return el instanceof HTMLElement ? el : null;
}

export function revealField(target: string | HTMLElement | null | undefined): boolean {
  if (typeof document === "undefined") return false;
  const container = resolve(target);
  if (!container) return false;
  const control = container.matches(CONTROL_SELECTOR)
    ? container
    : container.querySelector<HTMLElement>(CONTROL_SELECTOR);
  const el = control ?? container;

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  el.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  if (typeof el.focus === "function") el.focus({ preventScroll: true });

  // A checkbox is small and often unlabelled-looking, so the ring goes on
  // the nearest row that holds it rather than on the 16px box itself.
  const ringed =
    el instanceof HTMLInputElement && el.type === "checkbox"
      ? (el.parentElement ?? el)
      : el;
  ringed.setAttribute(INVALID_ATTR, "true");
  const clear = () => {
    ringed.removeAttribute(INVALID_ATTR);
    el.removeEventListener("input", clear);
    el.removeEventListener("change", clear);
  };
  el.addEventListener("input", clear);
  el.addEventListener("change", clear);
  return true;
}
