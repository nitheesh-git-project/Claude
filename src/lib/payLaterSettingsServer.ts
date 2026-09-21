import type { createAdminClient } from "@/lib/supabase/admin";
import { PAY_LATER_AGED_AFTER_DAYS, resolveAgedAfterDays } from "@/lib/patientBalances";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * How long a balance may sit before the clinic calls it worth chasing.
 *
 * Read in its own call, per the migration-dependent-column rule: this is the
 * newest column on `site_settings`, and putting it in SITE_SETTINGS_SELECT
 * means one unmigrated database takes **every** other setting down to its
 * default with it -- a large price for one number. Same treatment
 * `readCarePlanRequiresApproval` and the mission copy get.
 *
 * It falls back to the constant rather than to anything stricter, because
 * there is no safe direction to fail in here. This decides the colour of a
 * warning: too low and it is on permanently and stops being read, too high
 * and it never fires. Neither is "safe", so an unreadable setting means the
 * behaviour the clinic had before anybody set one.
 *
 * The judgement itself lives in `resolveAgedAfterDays`, in the
 * dependency-free module, so it is unit-tested rather than only clicked --
 * this function is the fetch and nothing else.
 */
export async function readPayLaterAgedAfterDays(admin: AdminClient): Promise<number> {
  try {
    const { data, error } = await admin
      .from("site_settings")
      .select("pay_later_aged_after_days")
      .maybeSingle();
    if (error) return PAY_LATER_AGED_AFTER_DAYS;
    return resolveAgedAfterDays(data?.pay_later_aged_after_days);
  } catch {
    return PAY_LATER_AGED_AFTER_DAYS;
  }
}
