import type { createAdminClient } from "@/lib/supabase/admin";
import { retryDueMeetAccess, retryDueMeetSyncs } from "@/lib/retryDueMeetSyncs";
import { runRiskSweep } from "@/lib/riskDetectors";
import { TEMP_PASSWORD_VISIBLE_DAYS } from "@/lib/tempPassword";
import { expireDuePackagePurchases } from "@/lib/expirePackagePurchases";
import { expireDueHomeVisitPurchases } from "@/lib/expireHomeVisitPurchases";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";

/**
 * The housekeeping this deployment runs: programme expiry, Calendar/Meet retries, opening
 * Meet waiting rooms, the risk scan, the credential purge and removing abandoned
 * booking accounts.
 *
 * It used to run only from the admin dashboard's `after()`, so a failed
 * Meet link waited for somebody to open the back office -- overnight, at a
 * weekend, never. It now also runs from `/api/cron/maintenance` on a
 * schedule (see `.github/workflows/maintenance.yml`), and the dashboard keeps
 * calling it too. Every step is idempotent and bounded, so the two meeting
 * costs nothing; each step's failure is contained so the next still runs.
 */
export async function runMaintenanceSweep(
  admin: ReturnType<typeof createAdminClient>
): Promise<Record<string, "ok" | "failed">> {
  const steps: [string, () => Promise<unknown>][] = [
    // Programme expiry runs on every dashboard read too; here it also runs
    // when nobody is looking, so a lapsed programme stops reading active.
    ["packageExpiry", () => expireDuePackagePurchases(admin)],
    ["homeVisitExpiry", () => expireDueHomeVisitPurchases(admin)],
    ["meetSync", () => retryDueMeetSyncs(admin)],
    ["meetAccess", () => retryDueMeetAccess(admin)],
    ["riskSweep", () => runRiskSweep(admin)],
    [
      "tempPasswordPurge",
      async () => {
        const { error } = await admin.rpc("purge_expired_temp_passwords", {
          p_older_than_days: TEMP_PASSWORD_VISIBLE_DAYS,
        });
        if (error) throw error;
      },
    ],
    [
      // A booking-wizard account that never paid and never used up its
      // payment tries, older than the admin's window, is deleted with its
      // unpaid draft. The function re-checks every condition itself and
      // never touches a /patient/register signup (see schema.sql).
      "abandonedBookingAccounts",
      async () => {
        const { data, error: readError } = await admin
          .from("site_settings")
          .select(SITE_SETTINGS_SELECT)
          .maybeSingle();
        // A setting that could not be read is not a reason to delete with
        // the defaults: skip this run.
        if (readError || !data) throw readError ?? new Error("site_settings unreadable");
        const settings = parseAdminSettings(data);
        const { error } = await admin.rpc("purge_abandoned_booking_accounts", {
          p_days: settings.abandonedBookingAccountDays,
          p_try_limit: settings.paymentTriesBeforeAccess,
        });
        if (error) throw error;
      },
    ],
  ];
  const result: Record<string, "ok" | "failed"> = {};
  for (const [name, run] of steps) {
    try {
      await run();
      result[name] = "ok";
    } catch (err) {
      console.error(`maintenance sweep: ${name} failed`, err);
      result[name] = "failed";
    }
  }
  return result;
}
