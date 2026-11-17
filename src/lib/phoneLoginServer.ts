import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { parsePhoneLoginControls, type PhoneLoginControls } from "@/lib/phoneLogin";

// The phone sign-in switch, read on its own (never through
// SITE_SETTINGS_SELECT). A database without the table is "off" -- the
// feature has never been switched on there. A failed read is "unreadable",
// which every caller treats as off: offering a sign-in method that may be
// switched off is the wrong way to fail.

export type PhoneLoginControlsRead = { status: "ok"; controls: PhoneLoginControls } | { status: "unreadable" };

export async function loadPhoneLoginControls(admin: ReturnType<typeof createAdminClient>): Promise<PhoneLoginControlsRead> {
  try {
    const { data, error } = await admin.from("phone_login_controls").select("enabled").eq("id", 1).maybeSingle();
    if (error?.code === "42P01" || error?.code === "PGRST205") return { status: "ok", controls: parsePhoneLoginControls(null) };
    if (error) return { status: "unreadable" };
    return { status: "ok", controls: parsePhoneLoginControls(data) };
  } catch {
    return { status: "unreadable" };
  }
}

/** True only when the switch reads on. */
export async function phoneLoginEnabled(admin: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const read = await loadPhoneLoginControls(admin);
  return read.status === "ok" && read.controls.enabled;
}

/** For a sign-in page: whether to offer the phone code. Reads at request
 *  time (`connection()`), never at build, and any failure -- no service key
 *  in a build, a failed read -- is simply "not offered". */
export async function phoneLoginOffered(): Promise<boolean> {
  try {
    const { connection } = await import("next/server");
    await connection();
    const { createAdminClient } = await import("@/lib/supabase/admin");
    return await phoneLoginEnabled(createAdminClient());
  } catch {
    return false;
  }
}
