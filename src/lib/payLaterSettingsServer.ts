import type { createAdminClient } from "@/lib/supabase/admin";
import { readPatientOwed } from "@/lib/payLaterSettlementServer";
import {
  PAY_LATER_AGED_AFTER_DAYS,
  describeAgedAfterDays,
  type AgedAfterDays,
} from "@/lib/patientBalances";
import {
  decidePayLaterBooking,
  resolveMaxOwedPaise,
  type PayLaterDecision,
} from "@/lib/payLaterBooking";

type AdminClient = ReturnType<typeof createAdminClient>;

/** The ageing warning as the clinic has configured it, with the reason intact. */
export type PayLaterAgeSettings = AgedAfterDays & {
  /** Whether the clinic wants an ageing warning at all. */
  enabled: boolean;
};

/**
 * The built-in behaviour, and what an unreadable database resolves to.
 *
 * It falls back to the constant rather than to anything stricter, because
 * there is no safe direction to fail in here. This decides the colour of a
 * warning: too low and it is on permanently and stops being read, too high
 * and it never fires. Neither is "safe", so an unreadable setting means the
 * behaviour the clinic had before anybody set one -- warning on, at 60 days.
 */
const DEFAULT_PAY_LATER_AGE_SETTINGS: PayLaterAgeSettings = {
  days: PAY_LATER_AGED_AFTER_DAYS,
  source: "default",
  ignoredValue: null,
  enabled: true,
};

/**
 * How long a balance may sit before the clinic calls it worth chasing, and
 * whether it wants to be told at all.
 *
 * Read in its own call, per the migration-dependent-column rule: these are the
 * newest columns on `site_settings`, and putting them in SITE_SETTINGS_SELECT
 * means one unmigrated database takes **every** other setting down to its
 * default with it -- a large price for one number and one switch. Same
 * treatment `readCarePlanRequiresApproval` and the mission copy get. Both
 * columns travel in one query because they are one decision: a screen holding
 * a threshold it does not know is switched off would paint amber for a warning
 * nobody asked for.
 *
 * The judgement itself lives in `describeAgedAfterDays`, in the
 * dependency-free module, so it is unit-tested rather than only clicked --
 * this function is the fetch and nothing else.
 */
export async function readPayLaterAgeSettings(
  admin: AdminClient
): Promise<PayLaterAgeSettings> {
  try {
    const { data, error } = await admin
      .from("site_settings")
      .select("pay_later_aged_after_days, pay_later_age_warning_enabled")
      .maybeSingle();
    if (error) return DEFAULT_PAY_LATER_AGE_SETTINGS;
    return {
      ...describeAgedAfterDays(data?.pay_later_aged_after_days),
      // Anything but an explicit false is on: the column is NOT NULL with a
      // true default, so the only way to read something else is a database
      // that has not run the migration -- where the warning was always on.
      enabled: data?.pay_later_age_warning_enabled !== false,
    };
  } catch {
    return DEFAULT_PAY_LATER_AGE_SETTINGS;
  }
}

/**
 * Whether anybody may be treated on pay-later terms at all.
 *
 * Read in its own call for the same migration-dependent reason as the pair
 * above, and failing **CLOSED** -- the opposite direction from the ageing
 * threshold beside it, and deliberately so. That one decides the colour of a
 * warning, where neither direction is safe; this one decides whether a
 * session may be delivered without money, and an unreadable answer that
 * charges the patient is recoverable in a way the reverse is not.
 *
 * It gates NEW bookings only. Switching it off must never strand money
 * already owed: those sessions stay owed, stay listed and stay settleable,
 * because a stop that hides a debt is worse than no stop.
 */
export async function readPayLaterEnabled(admin: AdminClient): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("site_settings")
      .select("pay_later_enabled")
      .maybeSingle();
    if (error) return false;
    return data?.pay_later_enabled === true;
  } catch {
    return false;
  }
}

/**
 * The clinic's own ceiling on what one patient may owe, or null for none.
 *
 * Its own isolated read, per the migration-dependent-column rule: the newest
 * column on `site_settings`, and one an unmigrated database must not take
 * every other setting down with. It resolves to **null** -- no ceiling, the
 * original design -- when it cannot be read, because inventing a limit
 * nobody set would refuse somebody at the counter over a failed query.
 */
export async function readPayLaterCeilingPaise(
  admin: AdminClient
): Promise<number | null> {
  try {
    const { data, error } = await admin
      .from("site_settings")
      .select("pay_later_max_owed_paise")
      .maybeSingle();
    if (error) return null;
    return resolveMaxOwedPaise(data?.pay_later_max_owed_paise);
  } catch {
    return null;
  }
}

/**
 * May this patient book this session on terms?
 *
 * Both callers re-derive it here rather than trusting anything the browser
 * sent: the quote route, to decide whether to offer the choice at all, and
 * the confirmation route, which is the one that matters -- a request can be
 * posted directly, and "the patient said they were allowed to" is not a
 * check.
 *
 * The two reads are isolated from each other and from everything else. The
 * switch already fails closed; the patient's own grant does the same, since
 * an unreadable answer that let somebody be treated without paying is the
 * direction with no way back.
 */
export async function readPayLaterBookingEligibility(
  admin: AdminClient,
  args: {
    patientId: string;
    visitMode?: string | null;
    hasProgramme?: boolean;
    /** What this booking would add, so the ceiling can be applied to it. */
    bookingAmountPaise?: number;
  }
): Promise<PayLaterDecision> {
  const [featureEnabled, patientOnTerms, ceiling] = await Promise.all([
    readPayLaterEnabled(admin),
    (async () => {
      try {
        const { data, error } = await admin
          .from("profiles")
          .select("pay_later_enabled")
          .eq("id", args.patientId)
          .eq("role", "patient")
          .maybeSingle();
        if (error) return false;
        return data?.pay_later_enabled === true;
      } catch {
        return false;
      }
    })(),
    // The clinic's own ceiling, in its own isolated read -- newest column on
    // that table, and one an unmigrated database must not take the rest of
    // the settings down with. It resolves to **null** (no ceiling) when it
    // cannot be read, which is the original design rather than a bound: the
    // safe direction when the thing being decided is whether somebody is
    // refused at the counter is not to invent a limit nobody set.
    (async () => {
      try {
        const { data, error } = await admin
          .from("site_settings")
          .select("pay_later_max_owed_paise")
          .maybeSingle();
        if (error) return null;
        return resolveMaxOwedPaise(data?.pay_later_max_owed_paise);
      } catch {
        return null;
      }
    })(),
  ]);

  // Only asked when there is a ceiling to apply it to. Every booking is
  // otherwise unchanged, which is what keeps "no ceiling" free.
  let currentlyOwedPaise = 0;
  if (ceiling !== null) {
    // Both reads are checked and paged. They used to drop a returned error
    // (only a *thrown* one was caught), so a failed read became a balance of
    // zero and waved the booking through -- the one direction this ceiling
    // exists to stop -- and a patient with a long history was summed over
    // the first thousand rows PostgREST returns.
    const owed = await readOwedForCeiling(admin, args.patientId);
    // A balance that could not be read reads as "at the ceiling", so the
    // patient is asked to pay now and can still book.
    currentlyOwedPaise = owed === null ? ceiling : owed;
  }

  // The judgement itself is dependency-free and unit-tested; this function
  // is the fetch and nothing else.
  return decidePayLaterBooking({
    featureEnabled,
    patientOnTerms,
    visitMode: args.visitMode,
    hasProgramme: args.hasProgramme,
    currentlyOwedPaise,
    bookingAmountPaise: args.bookingAmountPaise,
    maxOwedPaise: ceiling,
  });
}

/**
 * What a patient owes right now, for the ceiling check -- or null when it
 * could not be read in full (readPatientOwed pages and refuses a partial
 * sum). An understated balance is exactly how a patient goes past a ceiling
 * the clinic set.
 */
async function readOwedForCeiling(admin: AdminClient, patientId: string): Promise<number | null> {
  const owed = await readPatientOwed(admin, patientId);
  return owed ? owed.owedPaise : null;
}
