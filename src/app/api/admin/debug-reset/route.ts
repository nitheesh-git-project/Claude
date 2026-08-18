import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

// Wipes the database back to "a fresh install with your admin accounts".
//
// This exists for the pre-launch testing period: filling the app with test
// patients, bookings and purchases is how you find out whether it works, and
// clearing them one by one is slow enough that people stop testing. It is
// the single most destructive thing in this codebase, so it is gated four
// separate ways and every one of them has to pass:
//
//   1. ALLOW_DEBUG_DATA_RESET must be exactly "true" in the server
//      environment. Deliberately NOT the NEXT_PUBLIC_SHOW_DEBUG_NAV flag
//      that shows the debug bar -- that one is public and is already set on
//      the deployed site, so reusing it would arm a data wipe for anyone who
//      can reach the page.
//   2. The caller must be a signed-in admin.
//   3. ...with `full` scope. An operations or clinical admin cannot do this.
//   4. The request must carry the exact confirmation phrase below, which the
//      UI makes the admin type by hand rather than sending automatically.
//
// REMOVE ALLOW_DEBUG_DATA_RESET FROM PRODUCTION BEFORE REAL PATIENTS EXIST.
// With it unset, this route answers 404 -- not 403 -- so a probe cannot even
// learn that a reset endpoint is here.

export const CONFIRMATION_PHRASE = "RESET ALL DATA";

type Body = { confirm?: string };

export async function POST(request: NextRequest) {
  if (process.env.ALLOW_DEBUG_DATA_RESET !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const context = await getAdminContext();
  if (!context) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // A real admin who simply lacks the scope gets told why -- they can act on
  // that. Anyone who isn't an admin at all keeps the bare "Forbidden" above,
  // since telling a stranger what kind of account would work is free
  // reconnaissance.
  if (context.scope !== "full") {
    return NextResponse.json(
      { error: "Only a full-access admin can reset data." },
      { status: 403 }
    );
  }

  const parsed = await parseJsonBody<Body>(request);
  if (parsed.error) return parsed.error;

  if (parsed.data.confirm !== CONFIRMATION_PHRASE) {
    return NextResponse.json(
      { error: `Type ${CONFIRMATION_PHRASE} exactly to confirm.` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // One database function, one transaction. Doing this as thirty deletes
  // from here would be thirty round trips that can fail halfway and leave a
  // half-emptied database -- and three of the tables have no `id` column,
  // which the client library needs for a filtered delete. The function also
  // refuses to run if it would leave no admin behind. See
  // debug_reset_all_data() in supabase/schema.sql.
  const { data, error } = await admin.rpc("debug_reset_all_data");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = (data ?? {}) as { admins_kept?: number; accounts_deleted?: number };
  return NextResponse.json({
    success: true,
    adminsKept: result.admins_kept ?? 0,
    accountsDeleted: result.accounts_deleted ?? 0,
  });
}
