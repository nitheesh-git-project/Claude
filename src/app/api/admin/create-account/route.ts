import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminContextResult } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isValidEmail } from "@/lib/validateEmail";
import { isValidStoredPhone } from "@/lib/phoneNumber";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { ADMIN_SCOPES, type AdminScope } from "@/lib/adminScope";
import { storableSpecialty } from "@/lib/therapistSpecialties";
import {
  parseYearsExperience,
  YEARS_EXPERIENCE_ERROR,
} from "@/lib/therapistExperience";
import { serverError } from "@/lib/apiError";
import { issueSetPasswordLink, unknowablePassword } from "@/lib/accessLink";

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
// No password is generated for the person, stored or shown. The account is
// created with one nobody knows, and the admin is handed a one-time link
// (src/lib/accessLink.ts) to pass on, with which the person sets their own.
// The clinic used to keep the plaintext of a generated password in the
// `*_admin_notes` tables for up to fourteen days so an admin could read it
// back -- a working credential for every recent account, one service-role
// leak away. A lost link costs nothing: the person's page issues another.

type Body = {
  role?: string;
  fullName?: string;
  email?: string;
  phone?: string | null;
  credentials?: string | null;
  specialization?: string | null;
  // `number | string` deliberately: an admin form posts what is in the box,
  // and a blank number box arrives as "". Typing it as `number` would claim a
  // guarantee the request does not carry.
  yearsExperience?: number | string | null;
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

  // Optional here and required on the public application form, deliberately:
  // an admin creating an account on somebody's behalf may not have the figure
  // to hand, and a blank is honestly "not said" -- which every surface already
  // renders. A value that was *given* and cannot be used is refused rather
  // than quietly stored as a blank.
  const yearsExperience =
    role === "therapist" ? parseYearsExperience(body.yearsExperience) : null;
  if (yearsExperience === undefined) {
    return NextResponse.json({ error: YEARS_EXPERIENCE_ERROR }, { status: 400 });
  }

  const adminScope: AdminScope =
    role === "admin" && ADMIN_SCOPES.includes(body.adminScope as AdminScope)
      ? (body.adminScope as AdminScope)
      : "full";

  const admin = createAdminClient();
  const password = unknowablePassword();

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
      // Re-derived rather than stored as sent: the picker offers the eight
      // canonical labels, so anything else is either free text an admin
      // typed into the request by hand or nothing at all. Same rule every
      // other admin-configured value follows -- the browser names it, the
      // server decides what that name is worth.
      specialization: role === "therapist" ? storableSpecialty(body.specialization) : null,
      years_experience: yearsExperience,
      // An account an admin created by hand has already been vetted by the
      // act of creating it -- there is nothing for the approval queue to
      // add. This is the same judgement register-via-referral makes.
      approved: true,
      active: true,
      ...(role === "admin" ? { admin_scope: adminScope } : {}),
    })
    .eq("id", created.user.id);

  if (updateError) {
    // Release the account, exactly as onboard-hospital does and for the same
    // reason: `handle_new_user` has already given this a **patient** profile
    // (the trigger ignores a role from metadata by design), so this update is
    // what makes it the account the admin asked for. A failure leaves an
    // unusable patient row on the email address, and the next attempt fails
    // with "an account with that email already exists" -- which is true, and
    // useless, and points at nothing the admin can see.
    //
    // Safe: the account is seconds old with nothing pointing at it, which is
    // the "no history at all" case delete-account is deliberately narrow for.
    const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
    if (cleanupError) {
      console.error(
        "Could not release a half-provisioned account",
        created.user.id,
        cleanupError
      );
      return serverError("admin/create-account (stranded)", updateError, {
        message:
          "The account was created but could not be set up, and could not be removed either. That email cannot be used again until it is deleted - please pass this reference on.",
      });
    }
    return serverError("admin/create-account", updateError, {
      message: "The account could not be set up, so nothing has been created. Please try again.",
    });
  }

  // A therapist created here arrives approved, active and (by column
  // default) visible, so they belong on /team from this moment.
  if (role === "therapist") revalidatePath("/team");

  // The link the person sets their password with. Best-effort, and after
  // the profile update: an account that exists without a link is
  // recoverable from its own page (Send sign-in link), while failing the
  // whole request here would leave a created user behind with the admin
  // told it had failed.
  const link = await issueSetPasswordLink(admin, email);
  if (!link.ok) {
    console.error("create-account: sign-in link not issued", link.error);
  }

  // The link is deliberately NOT in the log -- it is a live credential and
  // admin_activity_log is readable by every admin. Who was created, by whom
  // and when is the part with audit value.
  await recordAdminActivity(admin, context.id, {
    action: "account.create",
    targetId: created.user.id,
    targetLabel: `${fullName} (${role})`,
    details: { role, adminScope: role === "admin" ? adminScope : null },
  });

  return NextResponse.json({
    success: true,
    userId: created.user.id,
    email,
    linkPath: link.ok ? link.path : null,
    ...(link.ok
      ? {}
      : { warning: "The account was created, but its sign-in link could not be made. Open their page and send a new one." }),
  });
}
