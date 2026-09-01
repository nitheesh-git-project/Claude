// Finds attempts to move a conversation off the platform, in text one role
// writes and another reads.
//
// The business problem is real and the temptation is obvious: a therapist
// and a patient who have met each other can agree to carry on privately at
// a lower price, and the clinic loses the patient, the revenue and any
// record that the care happened. Warnings and policy do not stop that. A
// technical control that makes it awkward and auditable does.
//
// The design constraint that shapes everything here is that this text is
// **clinical**. A physiotherapist writes "3 sets of 12, twice daily",
// "grade III mobilisation ×3", "call 108 if the numbness spreads", and a
// scanner that treats digits as suspicious would fire on all of it. A
// control that cries wolf is a control an admin stops reading, which is
// worse than no control. So there are two tiers and they behave differently:
//
//   block  Unambiguous. A UPI handle or a payment link has exactly one
//          purpose in a message to a patient, and none of them is clinical.
//          The write is refused.
//   flag   Suspicious but legitimately ambiguous -- a phone number, an
//          email, a social handle, a bare URL. Delivered, and recorded for
//          an admin to look at. Never blocked, because a clinic's own
//          landline in an instruction is a normal thing to write.
//
// Dependency-free per the business-math rule, so the routes, the admin
// screens and the tests all read one definition.

export type LeakTier = "block" | "flag";

export type LeakKind =
  | "upi_handle"
  | "payment_link"
  | "payment_app"
  | "phone"
  | "email"
  | "messaging_link"
  | "social_handle"
  | "url";

export type LeakFinding = {
  kind: LeakKind;
  tier: LeakTier;
  /** The matched text, kept so an admin reviewing this sees the evidence. */
  match: string;
};

export const LEAK_KIND_LABELS: Record<LeakKind, string> = {
  upi_handle: "UPI handle",
  payment_link: "Payment link",
  payment_app: "Payment app mentioned",
  phone: "Phone number",
  email: "Email address",
  messaging_link: "Messaging link",
  social_handle: "Social handle",
  url: "Web address",
};

/**
 * Normalises the obvious evasions before matching.
 *
 * Someone deliberately sharing a number does not type it plainly once they
 * know it is checked -- they space it, hyphen it, or spell it. Undoing that
 * costs one pass and removes the easiest way around this.
 *
 * Deliberately does NOT collapse all whitespace globally, which would join
 * unrelated numbers across a sentence ("take 2 tablets 3 times") into a
 * digit run long enough to look like a phone number.
 */
function normalise(text: string): string {
  let out = text.toLowerCase();
  // Spelled-out digits, which are how a number gets past a digit matcher.
  const words: Record<string, string> = {
    zero: "0", one: "1", two: "2", three: "3", four: "4",
    five: "5", six: "6", seven: "7", eight: "8", nine: "9",
    oh: "0", nought: "0", double: "",
  };
  out = out.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|oh|nought)\b/g,
    (m) => words[m] ?? m
  );
  // `at` / `dot` written out, the standard way of writing an email that a
  // filter will not see.
  out = out.replace(/\s*\(?\s*\bat\b\s*\)?\s*/g, "@");
  out = out.replace(/\s*\(?\s*\bdot\b\s*\)?\s*/g, ".");
  return out;
}

/** Digits with separators stripped, for phone detection only. */
function digitRuns(text: string): string[] {
  // A run of digits possibly broken by spaces, hyphens, dots or brackets --
  // but not by a letter or a newline, which would mean two separate things.
  const runs = text.match(/[\d][\d\s\-().]{6,}[\d]/g) ?? [];
  return runs.map((r) => r.replace(/\D/g, ""));
}

const UPI_HANDLE =
  /\b[a-z0-9._-]{2,}@(?:ok(?:hdfcbank|axis|icici|sbi)|ybl|paytm|apl|upi|ibl|axl|yapl|abfspay|airtel|freecharge|jupieraxis)\b/g;

const PAYMENT_LINK =
  /\b(?:razorpay\.me|rzp\.io|pay\.google\.com|gpay\.app\.goo\.gl|paytm\.me|phonepe\.com\/pay|pages\.razorpay\.com|paypal\.me|buymeacoffee\.com|wise\.com\/pay)\S*/g;

const PAYMENT_APP =
  /\b(?:gpay|google\s?pay|phonepe|phone\s?pe|paytm|bhim|upi\s?id|bank\s?transfer|neft|imps|account\s?number|ifsc)\b/g;

const EMAIL = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/g;

const MESSAGING_LINK =
  /\b(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|t\.me|telegram\.me|signal\.me|m\.me)\S*/g;

const SOCIAL_HANDLE =
  /\b(?:instagram\.com|facebook\.com|fb\.com|linkedin\.com\/in|twitter\.com|x\.com|youtube\.com)\/\S+/g;

const BARE_URL = /\bhttps?:\/\/\S+/g;

/**
 * Scans one piece of text.
 *
 * Order matters: the more specific patterns run first and their matches are
 * removed, so a UPI handle is not also reported as an email address and a
 * payment link is not also reported as a URL. One finding per real thing
 * keeps the admin's queue readable.
 */
export function scanForContactLeaks(text: string | null | undefined): LeakFinding[] {
  if (!text || !text.trim()) return [];
  const findings: LeakFinding[] = [];
  let working = normalise(text);

  const take = (pattern: RegExp, kind: LeakKind, tier: LeakTier) => {
    const matches = working.match(pattern);
    if (!matches) return;
    for (const m of matches) {
      findings.push({ kind, tier, match: m.trim() });
    }
    working = working.replace(pattern, " ");
  };

  // Blocking tier first, and consumed from the text, so nothing is counted
  // twice under a weaker label.
  take(UPI_HANDLE, "upi_handle", "block");
  take(PAYMENT_LINK, "payment_link", "block");
  take(MESSAGING_LINK, "messaging_link", "flag");
  take(SOCIAL_HANDLE, "social_handle", "flag");
  take(EMAIL, "email", "flag");
  take(BARE_URL, "url", "flag");
  take(PAYMENT_APP, "payment_app", "block");

  // Phones last, over whatever is left, and matched against the shape of an
  // Indian mobile specifically: exactly ten digits, starting 6-9, with an
  // optional 0 or 91 in front. This clinic is Indian throughout -- rupees,
  // Asia/Kolkata, libphonenumber's IN region -- so the narrower rule loses
  // nothing real and buys a lot of quiet.
  //
  // A looser "10 to 13 digits" rule flagged an order reference
  // ("order 2024-00123456") as a phone number, which is exactly the kind of
  // noise that gets a queue stopped being read. Dosages, dates and
  // measurements are shorter still and never reach here.
  for (const run of digitRuns(working)) {
    const stripped = run.replace(/^(?:0|91)/, "");
    if (/^[6-9]\d{9}$/.test(stripped)) {
      findings.push({ kind: "phone", tier: "flag", match: run });
    }
  }

  return findings;
}

/** Whether anything found is serious enough to refuse the write. */
export function hasBlockingLeak(findings: LeakFinding[]): boolean {
  return findings.some((f) => f.tier === "block");
}

/**
 * What to tell the writer when their text is refused.
 *
 * Names what was found and why, rather than a bare "not allowed": someone
 * writing a clinic's own payment details in good faith needs to understand
 * the rule, and someone doing it deliberately learns nothing they did not
 * already know.
 */
export function blockingLeakMessage(findings: LeakFinding[]): string {
  const kinds = [...new Set(findings.filter((f) => f.tier === "block").map((f) => f.kind))];
  const named = kinds.map((k) => LEAK_KIND_LABELS[k].toLowerCase()).join(" and ");
  return `This message looks like it contains ${named}. Payments for treatment are taken through the platform, so patients are never asked to pay another way — please take that out and send it again.`;
}

/** Compact summary for a risk row or an audit line. */
export function summariseFindings(findings: LeakFinding[]): string {
  if (findings.length === 0) return "";
  const counts = new Map<LeakKind, number>();
  for (const f of findings) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
  return [...counts.entries()]
    .map(([kind, n]) => (n > 1 ? `${LEAK_KIND_LABELS[kind]} ×${n}` : LEAK_KIND_LABELS[kind]))
    .join(", ");
}
