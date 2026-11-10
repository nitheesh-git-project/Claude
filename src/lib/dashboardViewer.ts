import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPERSONATION_COOKIE, isExpired, parseMarker } from "@/lib/impersonation";

/**
 * Who is looking at a dashboard, for the two things every dashboard now
 * carries (announcements and the notebook).
 *
 * Three answers, not two -- a check that could not be run is not a check
 * that came back negative:
 *   - `anonymous`: no session.
 *   - `unreadable`: there is a session, and the profile could not be read.
 *   - `ok`: the id, the role, whether the account is active, and whether an
 *     admin is signed in as this person.
 *
 * `impersonating` matters to both callers. An admin's visit must not use up
 * the person's "seen once" pop-up or close their banner, and it must never
 * open their notebook: the notebook's one promise is that only its owner
 * reads it, and a session swap is otherwise indistinguishable from the
 * owner.
 */
export type DashboardViewer =
  | { status: "anonymous" }
  | { status: "unreadable" }
  | {
      status: "ok";
      userId: string;
      role: string;
      active: boolean;
      impersonating: boolean;
      /** The person's own name, for their notebook's cover. */
      fullName: string | null;
    };

export async function readDashboardViewer(): Promise<DashboardViewer> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "anonymous" };

  const jar = await cookies();
  const marker = parseMarker(jar.get(IMPERSONATION_COOKIE)?.value);
  const impersonating = !!marker && !isExpired(marker, Date.now());

  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("role, active, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !data) return { status: "unreadable" };
  return {
    status: "ok",
    userId: user.id,
    role: data.role as string,
    active: data.active === true,
    impersonating,
    fullName: typeof data.full_name === "string" && data.full_name.trim() ? data.full_name.trim() : null,
  };
}
