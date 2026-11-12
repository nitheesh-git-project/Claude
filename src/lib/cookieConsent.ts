// Cookie consent: what a visitor allowed, when to ask, and what a recorded
// choice may contain. Dependency-free so every rule here is unit-tested
// without a browser; the storage helpers at the bottom are the only part
// that touches `window`.
//
// Two optional categories. "Necessary" (sign-in, payment, security, the
// country picker) is always on and never asked about.
//  - analytics: Google Analytics on the public pages and the booking widget.
//  - marketing: ad pixels. Asked only once NEXT_PUBLIC_MARKETING_CONSENT_ENABLED
//    is "true" -- asking for consent to something the site does not do would
//    be misleading. The choice is stored either way, so the day a pixel is
//    added it reads a real answer.
//
// The rules the pop-up keeps (docs/rules/public-site.md, "Cookie consent"):
// nothing optional loads before a yes; Accept all and Reject all are the same
// size; an ignored pop-up rests for CONSENT_REST_MS before asking again; a
// new COOKIE_POLICY_VERSION asks everybody again.

export const COOKIE_CONSENT_KEY = "mr_cookie_consent";
/** The analytics-only choice the earlier banner stored. Read once, as a
 *  fallback, so nobody who already answered is treated as undecided. */
export const LEGACY_ANALYTICS_CONSENT_KEY = "mr_analytics_consent";
/** A random id for this browser, so repeat choices group together on the
 *  admin screen. Not linked to a person unless they are signed in. */
export const CONSENT_VISITOR_KEY = "mr_consent_visitor";
export const CONSENT_ASKED_AT_KEY = "mr_cookie_asked_at";
export const CONSENT_ASKED_TAB_KEY = "mr_cookie_asked_tab";

/** Bump when the Cookie policy changes in substance: everyone is asked again. */
export const COOKIE_POLICY_VERSION = "2026-11-12";

/** An ignored pop-up rests this long before it asks again. */
export const CONSENT_REST_MS = 24 * 60 * 60 * 1000;
/** How long after the page has fully loaded the pop-up opens, unless the
 *  visitor scrolls first. */
export const CONSENT_OPEN_DELAY_MS = 2000;

export const CONSENT_ACTIONS = ["accept_all", "reject_all", "save", "dismiss"] as const;
export type ConsentAction = (typeof CONSENT_ACTIONS)[number];

export type CookieConsent = {
  /** COOKIE_POLICY_VERSION at the time of the choice, or "legacy". */
  version: string;
  analytics: boolean;
  marketing: boolean;
  /** Epoch ms of the choice. */
  at: number;
};

export function marketingConsentEnabled(
  flag: string | undefined = process.env.NEXT_PUBLIC_MARKETING_CONSENT_ENABLED
): boolean {
  return (flag ?? "").trim().toLowerCase() === "true";
}

/** The stored choice, or null when there is none worth reading. */
export function parseStoredConsent(raw: string | null, legacy: string | null): CookieConsent | null {
  if (raw) {
    try {
      const v = JSON.parse(raw) as Partial<CookieConsent>;
      if (
        v &&
        typeof v.version === "string" &&
        typeof v.analytics === "boolean" &&
        typeof v.marketing === "boolean" &&
        typeof v.at === "number" &&
        Number.isFinite(v.at)
      ) {
        return { version: v.version, analytics: v.analytics, marketing: v.marketing, at: v.at };
      }
    } catch {
      // Unreadable: fall through to the legacy key, then to "undecided".
    }
  }
  if (legacy === "granted" || legacy === "denied") {
    return { version: "legacy", analytics: legacy === "granted", marketing: false, at: 0 };
  }
  return null;
}

/** A choice made under the current policy. An older one is still honoured
 *  until the visitor answers again, but it does not stop the pop-up. */
export function isCurrentConsent(consent: CookieConsent | null, version = COOKIE_POLICY_VERSION): boolean {
  return !!consent && consent.version === version;
}

export function shouldAskForCookieConsent(input: {
  consent: CookieConsent | null;
  askedAtMs: number | null;
  askedInThisTab: boolean;
  nowMs: number;
  version?: string;
}): boolean {
  if (isCurrentConsent(input.consent, input.version)) return false;
  if (input.askedInThisTab) return true;
  if (input.askedAtMs === null || !Number.isFinite(input.askedAtMs)) return true;
  // A clock moved backwards reads as "just asked": rest rather than nag.
  return input.nowMs - input.askedAtMs >= CONSENT_REST_MS;
}

/** Pages the pop-up never opens on by itself: interrupting a booking or a
 *  payment makes people tap whatever gets it out of the way. The footer link
 *  still opens it there. */
const NO_AUTO_OPEN_ROOTS = ["book", "book-home-visit"];

export function autoOpensOn(pathname: string | null | undefined): boolean {
  if (!pathname || !pathname.startsWith("/")) return false;
  return !NO_AUTO_OPEN_ROOTS.includes(pathname.split("/")[1] ?? "");
}

/** What each button stores. */
export function consentFor(
  action: ConsentAction,
  chosen: { analytics: boolean; marketing: boolean },
  marketingAsked: boolean,
  nowMs: number,
  version = COOKIE_POLICY_VERSION
): CookieConsent {
  const all = action === "accept_all";
  const none = action === "reject_all" || action === "dismiss";
  return {
    version,
    analytics: all ? true : none ? false : chosen.analytics,
    // Never true for a category the visitor was not shown.
    marketing: !marketingAsked ? false : all ? true : none ? false : chosen.marketing,
    at: nowMs,
  };
}

// --- the record the server keeps ---------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ConsentRecordInput = {
  visitorId: string;
  analytics: boolean;
  marketing: boolean;
  action: ConsentAction;
  policyVersion: string;
  pagePath: string | null;
};

/** Checks a POST body. Only shape is trusted from the client; who is signed
 *  in, the country and the time are worked out on the server. */
export function validateConsentRecord(
  body: unknown
): { ok: true; value: ConsentRecordInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request." };
  const b = body as Record<string, unknown>;
  if (typeof b.visitorId !== "string" || !UUID.test(b.visitorId)) {
    return { ok: false, error: "Invalid visitor." };
  }
  if (typeof b.analytics !== "boolean" || typeof b.marketing !== "boolean") {
    return { ok: false, error: "Invalid choice." };
  }
  if (typeof b.action !== "string" || !(CONSENT_ACTIONS as readonly string[]).includes(b.action)) {
    return { ok: false, error: "Invalid action." };
  }
  if (typeof b.policyVersion !== "string" || !/^[0-9a-z.-]{1,32}$/i.test(b.policyVersion)) {
    return { ok: false, error: "Invalid policy version." };
  }
  let pagePath: string | null = null;
  if (typeof b.pagePath === "string" && b.pagePath.startsWith("/")) {
    // The path only: never a query string or fragment, which can carry a token.
    pagePath = b.pagePath.split(/[?#]/)[0].slice(0, 200);
  }
  const action = b.action as ConsentAction;
  // The buttons decide the answer; a body that disagrees with its own button
  // is refused rather than stored as something nobody chose.
  if (action === "accept_all" && !b.analytics) return { ok: false, error: "Invalid choice." };
  if ((action === "reject_all" || action === "dismiss") && (b.analytics || b.marketing)) {
    return { ok: false, error: "Invalid choice." };
  }
  return {
    ok: true,
    value: {
      visitorId: b.visitorId.toLowerCase(),
      analytics: b.analytics,
      marketing: b.marketing,
      action,
      policyVersion: b.policyVersion,
      pagePath,
    },
  };
}

// --- the admin summary --------------------------------------------------

export type ConsentRow = {
  action: ConsentAction;
  analytics: boolean;
  marketing: boolean;
};

export type ConsentSummary = {
  total: number;
  acceptAll: number;
  rejectAll: number;
  custom: number;
  dismissed: number;
  analyticsOn: number;
  marketingOn: number;
};

export function summariseConsents(rows: ConsentRow[]): ConsentSummary {
  const s: ConsentSummary = {
    total: rows.length,
    acceptAll: 0,
    rejectAll: 0,
    custom: 0,
    dismissed: 0,
    analyticsOn: 0,
    marketingOn: 0,
  };
  for (const r of rows) {
    if (r.action === "accept_all") s.acceptAll += 1;
    else if (r.action === "reject_all") s.rejectAll += 1;
    else if (r.action === "save") s.custom += 1;
    else if (r.action === "dismiss") s.dismissed += 1;
    if (r.analytics) s.analyticsOn += 1;
    if (r.marketing) s.marketingOn += 1;
  }
  return s;
}

/** A whole-number percentage, 0 when there is nothing to divide. */
export function percentOf(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export const CONSENT_ACTION_LABELS: Record<ConsentAction, string> = {
  accept_all: "Accepted all",
  reject_all: "Rejected all",
  save: "Chose their own",
  dismiss: "Closed it",
};

// --- browser side ---------------------------------------------------------

/** Fired on this tab when the choice changes. */
export const COOKIE_CONSENT_EVENT = "mr-cookie-consent";

export function readCookieConsent(): CookieConsent | null {
  let raw: string | null = null;
  let legacy: string | null = null;
  try {
    raw = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    legacy = window.localStorage.getItem(LEGACY_ANALYTICS_CONSENT_KEY);
  } catch {
    return null;
  }
  return parseStoredConsent(raw, legacy);
}

export function writeCookieConsent(consent: CookieConsent): void {
  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
    window.localStorage.removeItem(LEGACY_ANALYTICS_CONSENT_KEY);
  } catch {
    // Private window: the choice lasts until the tab closes.
  }
  try {
    window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
  } catch {
    // No window events: the next page load reads storage anyway.
  }
}

export function readConsentAskState(): { askedAtMs: number | null; askedInThisTab: boolean } {
  let askedAtMs: number | null = null;
  let askedInThisTab = false;
  try {
    const raw = window.localStorage.getItem(CONSENT_ASKED_AT_KEY);
    askedAtMs = raw ? Number(raw) : null;
  } catch {
    askedAtMs = null;
  }
  try {
    askedInThisTab = window.sessionStorage.getItem(CONSENT_ASKED_TAB_KEY) === "1";
  } catch {
    askedInThisTab = false;
  }
  return { askedAtMs, askedInThisTab };
}

/** The pop-up is in front of someone who has not answered: start the rest
 *  for every other tab. The tab it was shown in keeps asking. */
export function noteConsentAsked(nowMs: number): void {
  try {
    if (window.sessionStorage.getItem(CONSENT_ASKED_TAB_KEY) === "1") return;
    window.sessionStorage.setItem(CONSENT_ASKED_TAB_KEY, "1");
  } catch {
    // No session storage: the rest still applies to new tabs.
  }
  try {
    window.localStorage.setItem(CONSENT_ASKED_AT_KEY, String(nowMs));
  } catch {
    // Private window: nothing to remember it in, so it may ask again.
  }
}

/** This browser's random id, made on first use. */
export function consentVisitorId(): string {
  try {
    const existing = window.localStorage.getItem(CONSENT_VISITOR_KEY);
    if (existing && UUID.test(existing)) return existing;
    const id = window.crypto.randomUUID();
    window.localStorage.setItem(CONSENT_VISITOR_KEY, id);
    return id;
  } catch {
    try {
      return window.crypto.randomUUID();
    } catch {
      return "00000000-0000-4000-8000-000000000000";
    }
  }
}

/** Records the choice on the server. Fire-and-forget: a failed record never
 *  blocks the visitor or undoes their choice. */
export function recordCookieConsent(action: ConsentAction, consent: CookieConsent, pagePath: string): void {
  try {
    void fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        visitorId: consentVisitorId(),
        analytics: consent.analytics,
        marketing: consent.marketing,
        action,
        policyVersion: consent.version,
        pagePath,
      }),
    }).catch(() => undefined);
  } catch {
    // Recording is evidence, not a gate.
  }
}
