// Whether this deployment sends calendar invites, for the screens that tell
// a patient what to expect. The judgement and every sentence are in
// calendarInviteOutcome.ts; this is only the read.
//
// Same two facts createMeetEventForConfirmedAppointment acts on: Google's
// credentials present (System Health's not_configured test) and
// site_settings.google_meet_enabled. Read with whatever client the page
// already has -- the public pages use the anon client, which can read
// site_settings.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { googleCredentialsConfigured } from "@/lib/googleConnectionHealth";
import {
  inviteDeliveryFor,
  NO_INVITE_DELIVERY,
  type InviteDelivery,
} from "@/lib/calendarInviteOutcome";

export async function readInviteDelivery(client: SupabaseClient): Promise<InviteDelivery> {
  const googleConfigured = googleCredentialsConfigured();
  // Nothing to read when there is nothing to send with.
  if (!googleConfigured) return NO_INVITE_DELIVERY;
  try {
    // Isolated, one column, like every other migration-dependent setting.
    const { data, error } = await client
      .from("site_settings")
      .select("google_meet_enabled")
      .maybeSingle();
    const row = data as { google_meet_enabled?: boolean | null } | null;
    return inviteDeliveryFor({
      googleConfigured,
      meetEnabled: typeof row?.google_meet_enabled === "boolean" ? row.google_meet_enabled : null,
      settingsReadFailed: !!error,
    });
  } catch {
    return inviteDeliveryFor({ googleConfigured, meetEnabled: null, settingsReadFailed: true });
  }
}
