// Turning an audit row's `details` blob into something a person can read.
//
// The Activity Log answered "who did what" and stopped there: tapping a row
// printed the raw JSON the route happened to write
// (`{"fromPercent":40,"toPercent":55}`), which is a developer's view of a
// record whose whole purpose is to be read later, by somebody asking what a
// colleague changed and what it used to be.
//
// Two jobs, and the first is the one that matters:
//
//   1. **Pair the before and the after.** Routes across this codebase name
//      that pair five different ways -- `from`/`to`, `fromPercent`/
//      `toPercent`, `oldExpiresAt`/`newExpiresAt`, `previousStatus` beside
//      `status`, `before`/`after` -- because each was written where it was
//      needed rather than to a convention. Recognising all five here is
//      cheaper and safer than rewriting twenty routes to agree, and it means
//      a route that follows any of those habits gets a readable change row
//      for free.
//   2. **Show everything else too, and never silently drop a key.** This is
//      an audit record: a field the humaniser does not recognise is exactly
//      the field somebody is looking for. Unpaired keys are listed as they
//      are, and the raw JSON stays available behind a toggle.

export type ActivityChange = {
  /** The field, in words. */
  label: string;
  /** What it was, already formatted. Null when the row records no prior value. */
  from: string | null;
  /** What it became, already formatted. */
  to: string;
};

export type ActivityFact = {
  label: string;
  value: string;
};

export type ReadableDetails = {
  /** Before/after pairs, the half of a log entry people actually come for. */
  changes: ActivityChange[];
  /** Everything else in the blob, nothing dropped. */
  facts: ActivityFact[];
};

/** `previousStatus` -> `status`, `oldExpiresAt` -> `expiresAt`, and the two
 *  plain words. The `to` half is looked up in the blob and, failing that,
 *  in the pair's own sibling prefix. */
const BEFORE_PREFIXES = ["previous", "old", "before", "from"] as const;
const AFTER_PREFIXES = ["", "new", "after", "to"] as const;

function lowerFirst(s: string) {
  return s.length > 0 ? s[0].toLowerCase() + s.slice(1) : s;
}

function upperFirst(s: string) {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/** The stem a before-key is about: `previousEnabled` -> `enabled`,
 *  `fromPercent` -> `percent`, `before` -> `` (the bare pair). */
function beforeStem(key: string): string | null {
  for (const prefix of BEFORE_PREFIXES) {
    if (key === prefix) return "";
    if (key.startsWith(prefix) && key.length > prefix.length) {
      const rest = key.slice(prefix.length);
      // Only a real camelCase boundary: `fromage` is not `from` + `age`.
      if (rest[0] === rest[0].toUpperCase()) return lowerFirst(rest);
    }
  }
  return null;
}

/** Candidate keys holding the value a before-key's stem became. */
function afterKeysFor(stem: string): string[] {
  if (stem === "") return ["after", "to", "new"];
  return AFTER_PREFIXES.map((prefix) =>
    prefix === "" ? stem : prefix + upperFirst(stem)
  );
}

/** camelCase / snake_case -> words a clinic owner reads. Known ids and
 *  units are named rather than spelled out, since "Paise" on screen is a
 *  storage detail nobody outside the code should meet. */
export function humaniseKey(key: string): string {
  const spaced = key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\bpaise\b/g, "")
    .replace(/\bid\b/g, "ID")
    .replace(/\biso\b/g, "")
    .trim();
  return upperFirst(spaced.replace(/\s{2,}/g, " "));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?/;

/** A value, formatted for reading rather than for parsing. */
export function humaniseValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (typeof value === "number") {
    // A money column is named as one. Nothing else in these blobs is stored
    // in hundredths, so the suffix is a reliable test.
    if (/paise$/i.test(key)) return `₹${(value / 100).toLocaleString("en-IN")}`;
    if (/percent$/i.test(key)) return `${value}%`;
    return String(value);
  }

  if (typeof value === "string") {
    if (ISO_DATE.test(value)) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        const hasTime = value.includes("T");
        return parsed.toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}),
          timeZone: "Asia/Kolkata",
        });
      }
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? "none" : value.map((v) => humaniseValue(key, v)).join(", ");
  }

  // An object inside details (a risk rule's config, a schedule) is rare and
  // has no general shape, so it is shown compactly rather than guessed at.
  return JSON.stringify(value);
}

/**
 * Splits a details blob into what changed and what else was recorded.
 *
 * Order is the blob's own: routes write the fields in the order they matter,
 * and re-sorting alphabetically would separate `oldExpiresAt` from the reason
 * beneath it.
 */
export function readableDetails(
  details: Record<string, unknown> | null | undefined
): ReadableDetails {
  if (!details) return { changes: [], facts: [] };

  const changes: ActivityChange[] = [];
  const used = new Set<string>();

  for (const [key, value] of Object.entries(details)) {
    if (used.has(key)) continue;
    const stem = beforeStem(key);
    if (stem === null) continue;

    let namedByAfterKey = false;
    let afterKey = afterKeysFor(stem).find(
      (candidate) => candidate !== key && candidate in details
    );

    // A before-key whose stem is only a unit -- `previousPaise` beside
    // `amountPaise`, which is what /api/admin/correct-cash-amount writes --
    // has no exact twin. Fall back to the one key that *ends* with the same
    // stem, which is the field the unit belongs to. Only when there is
    // exactly one: two candidates mean the pairing is a guess, and a guessed
    // before/after on an audit record is worse than two plain facts.
    if (!afterKey && stem !== "") {
      const suffix = upperFirst(stem);
      const tail = Object.keys(details).filter(
        (candidate) =>
          candidate !== key &&
          beforeStem(candidate) === null &&
          candidate.endsWith(suffix)
      );
      if (tail.length === 1) {
        afterKey = tail[0];
        // The stem was only a unit, so the after-key is the one that names
        // the field: "Amount", not "Paise".
        namedByAfterKey = true;
      }
    }

    if (!afterKey) continue;

    used.add(key);
    used.add(afterKey);
    changes.push({
      label: humaniseKey(stem === "" || namedByAfterKey ? afterKey : stem),
      from: humaniseValue(key, value),
      to: humaniseValue(afterKey, details[afterKey]),
    });
  }

  const facts: ActivityFact[] = Object.entries(details)
    .filter(([key]) => !used.has(key))
    .map(([key, value]) => ({ label: humaniseKey(key), value: humaniseValue(key, value) }));

  return { changes, facts };
}

/** True when a change row records something appearing for the first time --
 *  worth saying "was not set" rather than printing a dash that reads as a
 *  missing record. */
export function isFirstValue(change: ActivityChange): boolean {
  return change.from === null || change.from === "—";
}
