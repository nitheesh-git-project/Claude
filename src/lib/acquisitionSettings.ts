// The two switches behind the acquisition discounts that arrived last.
//
// Read in their own calls rather than through SITE_SETTINGS_SELECT, for the
// reason `care_plan_requires_approval` and `therapist_suggestions_enabled`
// are: these are the newest columns on `site_settings`, and a shared select
// that fails on an unmigrated database takes every other setting down to its
// default with it.
//
// Both fail **closed** -- an unreadable answer means no discount. Charging
// list price to somebody who was owed one is a complaint; discounting for
// everybody because a query failed is a hole in the revenue nobody notices
// for a month, which is the same reasoning the first-session offer's own
// eligibility lookup follows.

import type { SupabaseClient } from "@supabase/supabase-js";
import { INVITE_SETTINGS_DEFAULTS, type InviteSettings } from "@/lib/inviteRewards";

type AdminClient = SupabaseClient;

/** Whether the checkout shows a promo code field at all. */
export async function readPromoCodesEnabled(admin: AdminClient): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("site_settings")
      .select("promo_codes_enabled")
      .maybeSingle();
    if (error) return false;
    return data?.promo_codes_enabled === true;
  } catch {
    return false;
  }
}

export async function readInviteSettings(admin: AdminClient): Promise<InviteSettings> {
  try {
    const { data, error } = await admin
      .from("site_settings")
      .select(
        "invite_rewards_enabled, invite_reward_paise, invite_welcome_paise, invite_max_rewards_per_patient"
      )
      .maybeSingle();
    if (error || !data) return INVITE_SETTINGS_DEFAULTS;
    return {
      enabled: data.invite_rewards_enabled === true,
      rewardPaise:
        typeof data.invite_reward_paise === "number" ? data.invite_reward_paise : 0,
      welcomePaise:
        typeof data.invite_welcome_paise === "number" ? data.invite_welcome_paise : 0,
      maxRewardsPerPatient:
        typeof data.invite_max_rewards_per_patient === "number"
          ? data.invite_max_rewards_per_patient
          : INVITE_SETTINGS_DEFAULTS.maxRewardsPerPatient,
    };
  } catch {
    return INVITE_SETTINGS_DEFAULTS;
  }
}
