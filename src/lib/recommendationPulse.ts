// What the clinic's recommendations are doing, for the admin's Today screen.
//
// A recommendation is where most of the clinic's revenue starts - one
// session turns into a programme - and Today only ever said "N waiting for
// approval". A recommendation the patient paid for, turned down, or let
// lapse happened silently; an admin learned of it only by opening Sessions
// -> Recommendations and reading every card. This turns each plan into the
// one event its current state is, dated from the row (never from render), so
// Today can show the pulse and the feed can pin what needs a person.
//
// Two states are urgent and pin to the top of the feed (`needsYou`):
// waiting for the clinic's approval, and paid with nothing booked for
// PAID_UNBOOKED_AFTER_MS - money taken for treatment that is not happening.
// A recommendation about to lapse is a warning, not a task: the patient's
// answer is theirs to give.
//
// Dependency-free so it can be tested without rendering.

import { carePlanState, type CarePlanStatus } from "./carePlans";
import type { FeedItem, FeedTone } from "./dashboardFeed";
import { formatRupees } from "./formatMoney";

/** Paid this long ago with nothing booked, the clinic should ring. */
export const PAID_UNBOOKED_AFTER_MS = 2 * 86_400_000;
/** An open recommendation lapsing within this is flagged. */
export const LAPSING_SOON_MS = 3 * 86_400_000;
/** Settled events older than this drop off Today (the screen keeps them). */
export const PULSE_WINDOW_MS = 14 * 86_400_000;

export type RecommendationPulseRow = {
  id: string;
  status: string;
  patientName: string;
  therapistName: string;
  conditionTitle: string;
  sessionCount: number;
  /** The offer's price; null when the snapshot could not be read. */
  pricePaise: number | null;
  isHomeVisit: boolean;
  createdAt: string;
  submittedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  /** The current version's offer expiry. */
  expiresAt: string | null;
  /** The paid purchase, when there is one. */
  purchase: { amountPaise: number | null; paidAt: string | null; booked: number } | null;
  /** The programme's ID with its progress (PED_PKG001-0/6), when it has
   *  one. Leads every event's detail, so the ID an admin reads on Today is
   *  the one they search for on Programmes. */
  programmeDisplay?: string | null;
  /** The programme's ID alone, for the event's link. */
  programmeCode?: string | null;
};

export type RecommendationPulseCounts = {
  waitingApproval: number;
  withPatients: number;
  lapsingSoon: number;
  paidInWindow: number;
  paidInWindowPaise: number;
  paidUnbooked: number;
  declinedInWindow: number;
};

export type RecommendationPulse = {
  counts: RecommendationPulseCounts;
  /** Newest first, urgent ones first of all. */
  events: FeedItem[];
};

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const n = new Date(iso).getTime();
  return Number.isNaN(n) ? null : n;
}

function rupees(paise: number): string {
  return `₹${formatRupees(paise)}`;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function buildRecommendationPulse(
  rows: RecommendationPulseRow[],
  nowMs: number,
  {
    href,
    hrefFor,
    showMoney,
  }: {
    /** Where an event links when `hrefFor` has nothing better. */
    href: string;
    /** Where one event links -- the programme itself, or the approval
     *  queue for one waiting on the clinic. */
    hrefFor?: (row: RecommendationPulseRow, kind: string) => string | undefined;
    /** False for an admin whose scope cannot open Money: amounts are left
     *  out of the wording and the counts. */
    showMoney: boolean;
  }
): RecommendationPulse {
  const counts: RecommendationPulseCounts = {
    waitingApproval: 0,
    withPatients: 0,
    lapsingSoon: 0,
    paidInWindow: 0,
    paidInWindowPaise: 0,
    paidUnbooked: 0,
    declinedInWindow: 0,
  };
  const events: FeedItem[] = [];
  const inWindow = (at: number | null) => at !== null && nowMs - at <= PULSE_WINDOW_MS;

  for (const r of rows) {
    const state = carePlanState(
      { status: r.status as CarePlanStatus },
      { expires_at: r.expiresAt },
      nowMs
    );
    const what = `${r.programmeDisplay ? `${r.programmeDisplay} · ` : ""}${plural(r.sessionCount, r.isHomeVisit ? "home visit" : "session")} of ${r.conditionTitle}`;
    const price = showMoney && r.pricePaise !== null ? ` (${rupees(r.pricePaise)})` : "";
    const who = `${r.therapistName} for ${r.patientName}`;
    const push = (suffix: string, at: string | null, icon: string, tone: FeedTone, title: string, detail: string, needsYou = false) => {
      if (!at) return;
      events.push({ id: `rec-${suffix}-${r.id}`, at, icon, tone, title, detail, href: hrefFor?.(r, suffix) ?? href, needsYou });
    };

    switch (state) {
      case "pending_review": {
        counts.waitingApproval += 1;
        push(
          "review",
          r.submittedAt ?? r.createdAt,
          "fa-stamp",
          "warn",
          `Recommendation waiting for your approval - ${r.patientName}`,
          `${what}${price} · by ${r.therapistName}`,
          true
        );
        break;
      }
      case "awaiting_patient": {
        counts.withPatients += 1;
        const expires = ms(r.expiresAt);
        const lapsing = expires !== null && expires - nowMs <= LAPSING_SOON_MS;
        if (lapsing) {
          counts.lapsingSoon += 1;
          const days = Math.max(0, Math.ceil((expires! - nowMs) / 86_400_000));
          push(
            "lapsing",
            r.expiresAt,
            "fa-hourglass-half",
            "warn",
            `Recommendation lapses ${days <= 0 ? "today" : `in ${plural(days, "day")}`} - ${r.patientName} hasn't answered`,
            `${what}${price} · ${who}`
          );
        } else {
          push(
            "sent",
            r.submittedAt ?? r.createdAt,
            "fa-paper-plane",
            "info",
            `Recommendation with ${r.patientName} - waiting on their answer`,
            `${what}${price} · by ${r.therapistName}`
          );
        }
        break;
      }
      case "accepted": {
        const paidAt = r.purchase?.paidAt ?? r.acceptedAt;
        const paidMs = ms(paidAt);
        const amount = r.purchase?.amountPaise ?? r.pricePaise;
        if (inWindow(paidMs)) {
          counts.paidInWindow += 1;
          counts.paidInWindowPaise += amount ?? 0;
        }
        const unbooked =
          r.purchase !== null &&
          r.purchase.booked === 0 &&
          paidMs !== null &&
          nowMs - paidMs >= PAID_UNBOOKED_AFTER_MS;
        if (unbooked) {
          counts.paidUnbooked += 1;
          push(
            "unbooked",
            paidAt,
            "fa-calendar-xmark",
            "warn",
            `Paid but nothing booked - ${r.patientName}`,
            `${what} · paid ${Math.floor((nowMs - paidMs!) / 86_400_000)} days ago · ring to schedule`,
            true
          );
        } else if (inWindow(paidMs)) {
          push(
            "paid",
            paidAt,
            "fa-indian-rupee-sign",
            "good",
            `${r.patientName} accepted and paid${showMoney && amount !== null ? ` ${rupees(amount)}` : ""}`,
            `${what} · ${r.therapistName}`
          );
        }
        break;
      }
      case "declined": {
        const at = r.declinedAt ?? r.createdAt;
        if (!inWindow(ms(at))) break;
        counts.declinedInWindow += 1;
        push(
          "declined",
          at,
          "fa-circle-xmark",
          "bad",
          `${r.patientName} declined a recommendation`,
          `${what}${price}${r.declineReason ? ` · "${r.declineReason}"` : " · no reason given"} · ${r.therapistName}`
        );
        break;
      }
      case "lapsed": {
        if (!inWindow(ms(r.expiresAt))) break;
        push(
          "lapsed",
          r.expiresAt,
          "fa-hourglass-end",
          "neutral",
          `Recommendation lapsed - ${r.patientName} never answered`,
          `${what}${price} · ${who}`
        );
        break;
      }
      default:
        // Rejected, withdrawn and superseded are the clinic's own decisions,
        // already in the audit log the feed reads.
        break;
    }
  }

  events.sort((a, b) => {
    if (!!a.needsYou !== !!b.needsYou) return a.needsYou ? -1 : 1;
    return a.at < b.at ? 1 : a.at > b.at ? -1 : 0;
  });
  return { counts, events };
}
