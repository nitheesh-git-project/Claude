import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminContext } from "@/lib/supabase/requireAdmin";
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
// The temporary password is returned once, in this response, and never
// stored for patients/therapists -- the admin reads it out and the person
// changes it. Hospitals keep theirs in hospital_admin_notes because that
// flow needs it re-displayable; nothing here needs that.

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
  const context = await getAdminContext();
  if (!context) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  await recordAdminActivity(admin, context.id, {
    action: "account.create",
    targetId: created.user.id,
    targetLabel: `${fullName} (${role})`,
    details: { role, adminScope: role === "admin" ? adminScope : null },
  });

  return NextResponse.json({ success: true, userId: created.user.id, password });
}
