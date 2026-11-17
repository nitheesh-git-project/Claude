import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { validatePasswordChange } from "@/lib/passwordChange";

/**
 * Change password from the profile: the current password is required and
 * checked here (src/lib/passwordChange.ts says why). The reset link is the
 * other way in, for somebody who no longer knows it.
 *
 * The check is a sign-in on a throwaway client that never touches this
 * request's cookies, signed out again at once, so the person's own session
 * is untouched and nothing is left behind. Rate-limited per account, closed
 * on failure: it is the only bound on guessing from a borrowed session.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Your session has expired. Sign in again and retry." }, { status: 401 });
  }

  const limited = await enforceRateLimit(request, "passwordChange", { identifier: `user:${user.id}` });
  if (limited) return limited;

  const { data: body, error: parseError } = await parseJsonBody<{ currentPassword?: unknown; newPassword?: unknown }>(
    request
  );
  if (parseError) return parseError;
  const verdict = validatePasswordChange(body.currentPassword, body.newPassword);
  if (!verdict.ok) return NextResponse.json({ error: verdict.error, field: verdict.field }, { status: 400 });

  const checker = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { error: signInError } = await checker.auth.signInWithPassword({
    email: user.email,
    password: verdict.current,
  });
  if (signInError) {
    // A wrong password and a refusal for any other reason are different
    // answers; only the first is the person's to fix.
    const wrong = /invalid login credentials/i.test(signInError.message);
    if (!wrong) {
      return NextResponse.json(
        { error: "Could not check your current password just now. Please try again." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "That is not your current password.", field: "current" }, { status: 400 });
  }
  await checker.auth.signOut({ scope: "local" }).catch(() => {});

  const { error: updateError } = await createAdminClient().auth.admin.updateUserById(user.id, {
    password: verdict.next,
  });
  if (updateError) return serverError("change-password", updateError);

  return NextResponse.json({ success: true });
}
