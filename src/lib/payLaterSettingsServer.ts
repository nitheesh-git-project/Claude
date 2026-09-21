import type { createAdminClient } from "@/lib/supabase/admin";
import {
  PAY_LATER_AGED_AFTER_DAYS,
  describeAgedAfterDays,
  type AgedAfterDays,
} from "@/lib/patientBalances";

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
