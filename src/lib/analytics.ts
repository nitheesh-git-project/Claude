// Google Analytics, public pages and the booking widget only.
//
// This is the only module that talks to gtag. Everything that reaches
// Google passes through `sanitizeEvent`, which keeps an event only if it is
// on the list below, keeps a parameter only if that event lists it, and
// keeps a value only if it is a short token, a number or a boolean. A name,
// a phone number, an address, a condition or a promo code cannot be sent by
// accident because there is no parameter for it to travel in.
//
// The maths here has no dependencies so it is tested without a browser; the
// `track` function at the bottom is the only part that touches `window`.

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";

export const ANALYTICS_CONSENT_KEY = "mr_analytics_consent";

/** Dispatched by the footer link to ask for the consent card again. */
export const ANALYTICS_REOPEN_EVENT = "mr-analytics-reopen";

export type AnalyticsConsent = "granted" | "denied";

/** Route trees nothing is ever recorded on. `/hospital` is the referral
 *  dashboard tree; `/hospitals` is a public page and is not in it. */
const BLOCKED_ROOTS = [
  "admin",
  "dashboard",
  "patient",
  "therapist",
  "hospital",
  "api",
  "developer",
  "account-suspended",
  "pending-approval",
  "reset-password",
];

export function isTrackablePath(pathname: string | null | undefined): boolean {
  if (!pathname || !pathname.startsWith("/")) return false;
  const root = pathname.split("/")[1] ?? "";
  return !BLOCKED_ROOTS.includes(root);
}

const NUM = "number";
const STR = "string";
const BOOL = "boolean";
type ParamKind = typeof NUM | typeof STR | typeof BOOL;

/** event -> parameter -> kind. The whole of what can leave the browser. */
const EVENTS: Record<string, Record<string, ParamKind>> = {
  // Public pages
  cta_click: { location: STR, label: STR },
  contact_click: { channel: STR, location: STR },
  section_view: { section: STR },
  // Booking widget
  booking_start: { visit_mode: STR, entry_source: STR, service_preselected: BOOL },
  booking_step_view: { visit_mode: STR, step_name: STR, step_index: NUM },
  service_selected: { visit_mode: STR, service_id: STR, service_name: STR },
  slot_picked: { visit_mode: STR, days_ahead_bucket: STR, time_of_day: STR },
  promo_attempt: { visit_mode: STR, success: BOOL },
  service_area_check: { result: STR },
  begin_checkout: { visit_mode: STR, price_band: STR, currency: STR },
  checkout_stage: { visit_mode: STR, stage: STR },
  payment_dismissed: { visit_mode: STR, price_band: STR },
  payment_failed: { visit_mode: STR, price_band: STR },
  booking_error: { visit_mode: STR, step: NUM },
  booking_confirmed: { visit_mode: STR, settlement: STR },
  booking_exit: { visit_mode: STR, last_step: NUM },
  purchase: { visit_mode: STR, transaction_id: STR, value: NUM, currency: STR },
};

const TOKEN = /[^a-z0-9_.\-: ]/g;

function cleanToken(value: string): string {
  return value.toLowerCase().replace(TOKEN, "").trim().slice(0, 40);
}

/** What may be sent, or `null` when the event itself is not allowed. */
export function sanitizeEvent(
  name: string,
  params: Record<string, unknown> = {}
): { name: string; params: Record<string, string | number | boolean> } | null {
  const spec = EVENTS[name];
  if (!spec) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, kind] of Object.entries(spec)) {
    const v = params[key];
    if (kind === STR && typeof v === "string") {
      const token = cleanToken(v);
      if (token) out[key] = token;
    } else if (kind === NUM && typeof v === "number" && Number.isFinite(v)) {
      out[key] = v;
    } else if (kind === BOOL && typeof v === "boolean") {
      out[key] = v;
    }
  }
  return { name, params: out };
}

/** Rupee bands for a price in paise. The exact price never goes out. */
export function priceBand(paise: number): string {
  const rupees = paise / 100;
  if (!Number.isFinite(rupees) || rupees <= 0) return "free";
  if (rupees < 500) return "under_500";
  if (rupees < 1000) return "500_999";
  if (rupees < 2000) return "1000_1999";
  return "2000_plus";
}

/** Money is integer paise here; GA wants a decimal amount in the currency. */
export function paiseToAmount(paise: number): number {
  return Math.round(paise) / 100;
}

export function daysAheadBucket(days: number): string {
  if (days <= 1) return "0_1";
  if (days <= 3) return "2_3";
  if (days <= 7) return "4_7";
  return "8_plus";
}

export function timeOfDay(hour: number): string {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** The page address GA records: origin and path, never the query string or
 *  fragment, which can carry an invite code or a token. */
export function cleanPageLocation(origin: string, pathname: string): string {
  return `${origin}${pathname}`;
}

// --- browser side --------------------------------------------------------

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

export function readConsent(): AnalyticsConsent | null {
  try {
    const v = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function writeConsent(value: AnalyticsConsent): void {
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
  } catch {
    // Private window: the choice lasts until the tab closes.
  }
}

/** Fire-and-forget. Never throws and never waits, so analytics can not slow
 *  or break a booking or a payment. A no-op until GA has loaded, which only
 *  happens after consent. */
export function track(name: string, params?: Record<string, unknown>): void {
  try {
    if (typeof window === "undefined" || !window.gtag) return;
    if (readConsent() !== "granted") return;
    if (!isTrackablePath(window.location.pathname)) return;
    const event = sanitizeEvent(name, params);
    if (!event) return;
    window.gtag("event", event.name, event.params);
  } catch {
    // Analytics must never be the reason something fails.
  }
}

const SENT_KEY = "mr_ga_purchases";

async function opaqueId(raw: string): Promise<string> {
  const bytes = new TextEncoder().encode(raw);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** A paid booking, reported once per appointment per tab session. Call it
 *  only after the server has confirmed the payment. */
export async function trackPurchase(
  appointmentId: string,
  totalPaise: number,
  visitMode: "video" | "home" = "video"
): Promise<void> {
  try {
    const id = await opaqueId(appointmentId);
    let sent: string[] = [];
    try {
      sent = JSON.parse(window.sessionStorage.getItem(SENT_KEY) ?? "[]");
    } catch {
      sent = [];
    }
    if (sent.includes(id)) return;
    try {
      window.sessionStorage.setItem(SENT_KEY, JSON.stringify([...sent, id].slice(-20)));
    } catch {
      // Without storage a refresh could repeat it; better than losing it.
    }
    track("purchase", {
      visit_mode: visitMode,
      transaction_id: id,
      value: paiseToAmount(totalPaise),
      currency: "INR",
    });
  } catch {
    // See track().
  }
}

/** Switches Google's collection off (or back on) for this page load and, when
 *  off, removes the cookies it set. Google's own documented kill switch. */
export function withdrawGoogle(off: boolean): void {
  try {
    if (!GA_MEASUREMENT_ID) return;
    (window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`] = off;
    if (!off) return;
    for (const part of document.cookie.split(";")) {
      const name = part.split("=")[0].trim();
      if (name === "_ga" || name.startsWith("_ga_")) {
        document.cookie = `${name}=; Max-Age=0; path=/`;
      }
    }
  } catch {
    // Nothing to withdraw.
  }
}
