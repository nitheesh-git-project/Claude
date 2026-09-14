// The Business Health screen's own settings, read in their own call.
//
// Not through SITE_SETTINGS_SELECT, for the reason `care_plan_requires_approval`
// and the two acquisition switches are not: these are the newest columns on
// `site_settings`, and a shared select that fails on an unmigrated database
// takes every other setting down to its default with it.
//
// These fail to the **defaults**, which is the right direction here and is a
// different judgement from the discount switches' fail-closed. Nothing on this
// screen charges anybody anything: the worst a wrong default can do is report
// a margin the owner disagrees with, on a screen that states the reading it
// used and lets them change it. Refusing to show the figures at all would be
// the worse outcome.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_FINANCE_SETTINGS,
  isRunRateBasis,
  type FinanceSettings,
} from "@/lib/financeMetrics";

type AnyClient = SupabaseClient;

const FINANCE_SETTINGS_SELECT =
  "finance_cogs_therapist_share, finance_cogs_partner_share, finance_cogs_payment_fees, finance_include_app_balances, finance_break_even_price_paise, finance_break_even_variable_cost_paise, finance_run_rate_basis";

/** A nullable money column: null means "work it out from the sessions in
 *  view", so an unset one has to survive as null rather than becoming 0 --
 *  which would model a clinic that charges nothing. */
function optionalPaise(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

export async function readFinanceSettings(admin: AnyClient): Promise<FinanceSettings> {
  try {
    const { data, error } = await admin
      .from("site_settings")
      .select(FINANCE_SETTINGS_SELECT)
      .maybeSingle();
    if (error || !data) return DEFAULT_FINANCE_SETTINGS;
    const row = data as Record<string, unknown>;
    return {
      // `!== false` rather than `=== true`: these three default to on in the
      // column, so a database that has the column but a null in it (an older
      // row predating the default) should read as on, not off.
      cogsIncludesTherapistShare: row.finance_cogs_therapist_share !== false,
      cogsIncludesPartnerShare: row.finance_cogs_partner_share !== false,
      cogsIncludesPaymentFees: row.finance_cogs_payment_fees !== false,
      includeAppBalances: row.finance_include_app_balances !== false,
      breakEvenPricePaise: optionalPaise(row.finance_break_even_price_paise),
      breakEvenVariableCostPaise: optionalPaise(row.finance_break_even_variable_cost_paise),
      runRateBasis: isRunRateBasis(row.finance_run_rate_basis)
        ? row.finance_run_rate_basis
        : DEFAULT_FINANCE_SETTINGS.runRateBasis,
    };
  } catch {
    return DEFAULT_FINANCE_SETTINGS;
  }
}
