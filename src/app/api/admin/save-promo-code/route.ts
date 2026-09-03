import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import {
  isWellFormedPromoCode,
  normalizePromoCode,
  PROMO_CODE_KINDS,
  type PromoCodeKind,
} from "@/lib/promoCodes";

// Creating and re-pricing a campaign.
//
// `money` scope, not `catalog`. The capability decides the section, not
// where the button sits: this sets what every patient who types the code
// pays, which is a money decision however much it reads like catalog data.
//
// Everything is re-derived and re-validated here rather than trusted, for
// the ordinary reason -- but note what is *not* here. There is no way to
// apply a code to a patient, no way to set an amount on a booking, and no
// way to grant a redemption. An admin sets up a rule; the patient claims it
// at checkout under a lock, or does not.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("money");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    id?: string;
    code?: string;
    kind?: string;
    value?: number;
    active?: boolean;
    startsAt?: string | null;
    endsAt?: string | null;
    maxRedemptions?: number | null;
    maxPerPatient?: number;
    minSpendPaise?: number;
    firstSessionOnly?: boolean;
    description?: string | null;
  }>(request);
  if (parseError) return parseError;

  const id = body.id?.trim() || null;
  const code = normalizePromoCode(body.code);
  if (!isWellFormedPromoCode(code)) {
    return NextResponse.json(
      { error: "A code is 3-24 letters and digits, with no spaces or punctuation." },
      { status: 400 }
    );
  }

  const kind = body.kind as PromoCodeKind;
  if (!PROMO_CODE_KINDS.includes(kind)) {
    return NextResponse.json({ error: "Choose an amount off or a percentage." }, { status: 400 });
  }

  const value = Math.floor(Number(body.value));
  if (!Number.isFinite(value) || value <= 0) {
    return NextResponse.json({ error: "Enter how much this code takes off." }, { status: 400 });
  }
  if (kind === "percent_off" && value > 100) {
    return NextResponse.json({ error: "A percentage cannot be over 100." }, { status: 400 });
  }

  const maxRedemptions =
    body.maxRedemptions === null || body.maxRedemptions === undefined
      ? null
      : Math.floor(Number(body.maxRedemptions));
  if (maxRedemptions !== null && (!Number.isFinite(maxRedemptions) || maxRedemptions < 1)) {
    return NextResponse.json(
      { error: "Leave the total blank for unlimited, or enter 1 or more." },
      { status: 400 }
    );
  }

  const maxPerPatient = Math.floor(Number(body.maxPerPatient ?? 1));
  if (!Number.isFinite(maxPerPatient) || maxPerPatient < 1) {
    return NextResponse.json({ error: "A patient may claim a code at least once." }, { status: 400 });
  }

  const minSpendPaise = Math.floor(Number(body.minSpendPaise ?? 0));
  if (!Number.isFinite(minSpendPaise) || minSpendPaise < 0) {
    return NextResponse.json({ error: "A minimum spend cannot be negative." }, { status: 400 });
  }

  const startsAt = normalizeInstant(body.startsAt);
  const endsAt = normalizeInstant(body.endsAt);
  // Checked here as well as by the column's own constraint, so an admin gets
  // a sentence rather than a 500 from a raised constraint.
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    return NextResponse.json({ error: "The end has to come after the start." }, { status: 400 });
  }

  const row = {
    code,
    kind,
    value,
    active: body.active !== false,
    starts_at: startsAt,
    ends_at: endsAt,
    max_redemptions: maxRedemptions,
    max_per_patient: maxPerPatient,
    min_spend_paise: minSpendPaise,
    first_session_only: body.firstSessionOnly === true,
    description: body.description?.trim() || null,
  };

  const admin = createAdminClient();
  if (id) {
    const { error } = await admin
      .from("promo_codes")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: duplicateOr(error.message) }, { status: 400 });
    }
    await recordAdminActivity(admin, adminUser.id, {
      action: "promo.update",
      targetId: id,
      targetLabel: code,
      details: row,
    });
    return NextResponse.json({ success: true, id });
  }

  const { data: created, error } = await admin
    .from("promo_codes")
    .insert({ ...row, created_by: adminUser.id })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: duplicateOr(error.message) }, { status: 400 });
  }
  await recordAdminActivity(admin, adminUser.id, {
    action: "promo.create",
    targetId: created?.id ?? null,
    targetLabel: code,
    details: row,
  });
  return NextResponse.json({ success: true, id: created?.id });
}

/** A blank field means "no bound that way", not the epoch. */
function normalizeInstant(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function duplicateOr(message: string): string {
  // The unique index on `code` is the one failure an admin will actually
  // hit, and Postgres's own wording for it is not a sentence.
  return message.includes("promo_codes_code_key") || message.includes("duplicate key")
    ? "There is already a code with that name."
    : "Could not save that code. Please check the values and try again.";
}
