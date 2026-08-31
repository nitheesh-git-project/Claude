// Masks a patient's contact details on the therapist's surfaces.
//
// Two facts make this worth doing. A therapist's dashboard loads every one
// of their patients' phone numbers and email addresses through the
// service-role client and prints them on every session card -- so a
// clinician who wanted to take a caseload off-platform could copy it in an
// afternoon, and nothing anywhere would record that they had. And the
// contact details are the whole mechanism: an off-platform arrangement
// needs a channel, and this is the app handing one over.
//
// The answer is not to withhold the number. A therapist running a session
// that will not start, or standing outside a patient's building, has a real
// need for it, and a control that gets in the way of care is a control that
// gets worked around. So the number stays available and the *asking*
// becomes visible: masked by default, revealed on request, and every reveal
// on the record in contact_reveal_log.
//
// Dependency-free so the loader, the route and the tests share one
// definition of what "masked" means.

/** How many trailing digits survive masking. Enough to confirm a number you
 *  already have, not enough to dial one you do not. */
const VISIBLE_TAIL = 3;

export type MaskedContact = {
  /** Safe to render anywhere: "+91 ••••• ••210". */
  masked: string;
  /** Whether there is anything behind the mask to reveal. */
  present: boolean;
};

/**
 * Masks a phone number, keeping its country prefix and last few digits.
 *
 * The prefix and the tail both stay for the same reason: a therapist
 * checking they are about to call the right person should not have to
 * reveal to find out, and that check is the overwhelmingly common reason
 * to look at the number at all.
 */
export function maskPhone(phone: string | null | undefined): MaskedContact {
  const raw = (phone ?? "").trim();
  if (!raw) return { masked: "No number on file", present: false };

  const digits = raw.replace(/\D/g, "");
  if (digits.length <= VISIBLE_TAIL) {
    // Too short to be a real number. Masked whole rather than shown, since
    // whatever it is, it is not something this surface needs to display.
    return { masked: "•••", present: true };
  }

  // A country code is only split off when there is a full national number
  // behind it, so a short or malformed entry masks whole rather than being
  // sliced into a prefix that is really part of the number.
  const hasCountryCode = raw.startsWith("+") && digits.length > 10;
  const country = hasCountryCode ? digits.slice(0, digits.length - 10) : "";
  const national = hasCountryCode ? digits.slice(-10) : digits;

  const tail = national.slice(-VISIBLE_TAIL);
  const dots = "•".repeat(national.length - VISIBLE_TAIL);
  return {
    masked: `${country ? `+${country} ` : ""}${dots}${tail}`,
    present: true,
  };
}

/**
 * Masks an email address to its first character and domain.
 *
 * Kept as a helper even though the therapist's surfaces no longer load
 * email at all: the admin's exports and any future surface that shows one
 * should mask the same way rather than inventing a second shape.
 */
export function maskEmail(email: string | null | undefined): MaskedContact {
  const raw = (email ?? "").trim();
  if (!raw || !raw.includes("@")) return { masked: "No email on file", present: false };
  const [local, domain] = raw.split("@");
  const head = local.slice(0, 1);
  return { masked: `${head}${"•".repeat(Math.max(local.length - 1, 3))}@${domain}`, present: true };
}

export type RevealWindowInput = {
  slotTimeMs: number;
  status: string;
  visitMode: "online" | "home_visit" | string;
  /** Minutes before the slot a reveal becomes allowed. */
  beforeMinutes: number;
  /** Minutes after the slot a reveal stops being allowed. */
  afterMinutes: number;
  nowMs: number;
};

export type RevealDecision =
  | { allowed: true; reason: string }
  | { allowed: false; message: string };

/**
 * Whether a therapist may unmask the number for a given session, right now.
 *
 * A home visit gets the whole calendar day rather than a window around the
 * slot: calling ahead to say you are twenty minutes away, or ringing from
 * the wrong gate, is normal practice and neither happens inside a
 * fifteen-minute join window. A video session gets the join window either
 * side of its slot, which is when a call that will not start needs
 * rescuing.
 *
 * A cancelled session never qualifies. That is the case this control
 * exists for: there is no clinical reason to need the number of someone
 * whose session is not happening.
 */
export function canRevealContact(input: RevealWindowInput): RevealDecision {
  if (input.status === "cancelled") {
    return {
      allowed: false,
      message: "That session was cancelled, so its contact details are closed.",
    };
  }

  if (input.visitMode === "home_visit") {
    const slot = new Date(input.slotTimeMs);
    const dayStart = new Date(slot);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(slot);
    dayEnd.setHours(23, 59, 59, 999);
    if (input.nowMs >= dayStart.getTime() && input.nowMs <= dayEnd.getTime()) {
      return { allowed: true, reason: "home visit on the day of the visit" };
    }
    return {
      allowed: false,
      message: "You can see this number on the day of the visit.",
    };
  }

  const opensAt = input.slotTimeMs - input.beforeMinutes * 60_000;
  const closesAt = input.slotTimeMs + input.afterMinutes * 60_000;
  if (input.nowMs >= opensAt && input.nowMs <= closesAt) {
    return { allowed: true, reason: "session join window" };
  }
  return {
    allowed: false,
    message: "You can see this number around the time of the session.",
  };
}
