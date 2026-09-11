import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminContextResult } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isValidEmail } from "@/lib/validateEmail";
import { isValidStoredPhone } from "@/lib/phoneNumber";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { ADMIN_SCOPES, type AdminScope } from "@/lib/adminScope";

// Creates a patient, therapist or admin account by hand.
//
// Every account used to arrive one of two ways: self-signup, or a hospital
// invite. So a walk-in patient had to be talked through registering
// themselves, a therapist hired offline had to sign up and then wait to be
// approved, and a second admin could only be made by editing the database
// directly. This is the third door, and it is deliberately the same shape as
// the hospital onboarding route that already existed: create the auth user
// with a generated password, then set the role service-side rather than
// trusting user_metadata (the handle_new_user trigger ignores anything but
// 'therapist' there on purpose).
//
// The temporary password is **persisted**, in the same per-role
// `*_admin_notes` table the three reset-password routes already write to,
// and returned in this response as well.
//
// It used to be returned and nothing else -- shown once on the User Access
// screen and held in React state alone. That made losing it a matter of
// timing rather than of carelessness: this route inserts a `profiles` row,
// `profiles` is one of the admin dashboard's realtime tables, and the
// resulting `router.refresh()` lands while the admin is still reading the
// password out. The hospital table above was added for exactly this failure
// on exactly this kind of control; this is the same fix for the last role
// that lacked it.
//
// The row is cleared the moment that person sets their own password
// (/api/clear-temp-password), so "still on the password we issued" stays a
// true statement rather than a stale one. A password the *user* chose is
// never recoverable and is never stored: Supabase keeps a bcrypt hash, and
// the honest answer for an account in that state is to reset it.

function generatePassword() {
  return crypto.randomBytes(9).toString("base64url");
}

type Body = {
  role?: string;
  fullName?: string;
  email?: string;
  phone?: string | null;
  credentials?: string | null;
  adminScope?: string;
};

export async function POST(request: NextRequest) {
  // Three outcomes, not one. This route answered a flat 403 "Forbidden" for
  // all of them, and the one an admin actually met was the session refresh
  // race: the dashboard fires many requests at once, Supabase rotates
  // refresh tokens, and the one carrying a token another request has just
  // rotated comes back with no user. Telling a Master Admin they are not
  // allowed to create an account -- intermittently, on a control they use
  // every day -- is both false and unactionable. 401 and 503 are retryable
  // and say so; 403 stays opaque, so a limited admin still cannot map what
  // exists beyond their access.
  const guard = await getAdminContextResult();
  if (!guard.ok) {
    if (guard.reason === "unauthenticated") {
      return NextResponse.json(
        { error: "Your session has expired. Sign in again and retry.", retryable: true },
        { status: 401 }
      );
    }
    if (guard.reason === "unavailable") {
      return NextResponse.json(
        { error: "Could not check your access just now. Please try again.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const context = guard.context;

  const parsed = await parseJsonBody<Body>(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const role = body.role?.trim();
  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();
  const phone = body.phone?.trim() || null;

  if (role !== "patient" && role !== "therapist" && role !== "admin") {
    return NextResponse.json({ error: "Pick patient, therapist or admin." }, { status: 400 });
  }
  // Only a full-access admin can mint another admin -- otherwise a limited
  // scope could create a full-access account and hand itself the keys.
  if (role === "admin" && context.scope !== "full") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Everything else is an operations action; a finance-only admin has no
  // business creating patient records.
  if (role !== "admin" && context.scope !== "full" && context.scope !== "operations") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!fullName) {
    return NextResponse.json({ error: "Enter a name." }, { status: 400 });
  }
  if (fullName.length > 120) {
    return NextResponse.json({ error: "That name is too long." }, { status: 400 });
  }
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  // Blank is fine (a patient who only ever books online may not give one);
  // a malformed one is not, since it gets used to call them.
  if (phone && !isValidStoredPhone(phone)) {
    return NextResponse.json({ error: "That phone number isn't valid." }, { status: 400 });
  }

  const adminScope: AdminScope =
    role === "admin" && ADMIN_SCOPES.includes(body.adminScope as AdminScope)
      ? (body.adminScope as AdminScope)
      : "full";

  const admin = createAdminClient();
  const password = generatePassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created.user) {
    // Supabase reports an existing address as a create failure; say so in
    // words rather than passing the raw message through.
    const message = createError?.message ?? "Could not create the account.";
    const duplicate = /already|exists|registered/i.test(message);
    return NextResponse.json(
      {
        error: duplicate
          ? "An account with that email already exists."
          : message,
      },
      { status: duplicate ? 409 : 500 }
    );
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      role,
      full_name: fullName,
      phone,
      credentials: role === "therapist" ? body.credentials?.trim() || null : null,
      // An account an admin created by hand has already been vetted by the
      // act of creating it -- there is nothing for the approval queue to
      // add. This is the same judgement register-via-referral makes.
      approved: true,
      active: true,
      ...(role === "admin" ? { admin_scope: adminScope } : {}),
    })
    .eq("id", created.user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Best-effort, and deliberately after the profile update: an account that
  // exists with an unreadable password is recoverable by resetting it, while
  // failing the whole request here would leave a created auth user behind
  // with the caller told it had failed. The response still carries the
  // password, so the admin in front of the screen is not affected either way.
  const notesTable =
    role === "patient"
      ? "patient_admin_notes"
      : role === "therapist"
        ? "therapist_admin_notes"
        : "admin_account_notes";
  const notesKey =
    role === "patient" ? "patient_id" : role === "therapist" ? "therapist_id" : "admin_id";
  const { error: noteError } = await admin.from(notesTable).upsert({
    [notesKey]: created.user.id,
    temp_password: password,
    temp_password_set_at: new Date().toISOString(),
  });
  if (noteError) {
    console.error("create-account: temp password not persisted", noteError.message);
  }

  // The generated password is deliberately NOT in the log -- it is a live
  // credential and admin_activity_log is readable by every admin. Who was
  // created, by whom and when is the part with audit value.
  await recordAdminActivity(admin, context.id, {
    action: "account.create",
    targetId: created.user.id,
    targetLabel: `${fullName} (${role})`,
    details: { role, adminScope: role === "admin" ? adminScope : null },
  });

  return NextResponse.json({ success: true, userId: created.user.id, password });
}
