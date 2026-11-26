import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";
import { testimonialActivationBlock } from "@/lib/testimonialTrust";
import { auditChanges } from "@/lib/auditChanges";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    id?: string;
    patientName?: string;
    quote?: string;
    rating?: number | string;
    conditionLabel?: string;
    avatarUrl?: string;
    // The admin form posts an empty string for a blank number box.
    displayOrder?: number | string;
    active?: boolean;
    /** The patient's written consent to publish is on file. Left out, the
     *  story keeps the consent it has. */
    consentGiven?: boolean;
    consentNote?: string;
  }>(request);
  if (parseError) return parseError;
  const { id, patientName, quote, rating, conditionLabel, avatarUrl, displayOrder, active } = body;
  if (!id || !patientName || !quote) {
    return NextResponse.json({ error: "Missing id, patientName, or quote" }, { status: 400 });
  }

  let ratingValue: number | null = null;
  if (rating !== undefined && rating !== null && rating !== "") {
    ratingValue = Number(rating);
    if (Number.isNaN(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return NextResponse.json({ error: "Rating must be between 1 and 5" }, { status: 400 });
    }
  }

  const order = displayOrder === undefined || displayOrder === "" ? 0 : Number(displayOrder);
  if (Number.isNaN(order)) {
    return NextResponse.json({ error: "Order must be a number" }, { status: 400 });
  }

  const admin = createAdminClient();
  // The story as it is, for the consent rule and the log's before/after.
  const { data: before, error: readError } = await admin
    .from("testimonials")
    .select("patient_name, quote, rating, condition_label, avatar_url, display_order, active, consent_recorded_at, consent_note")
    .eq("id", id)
    .maybeSingle();
  if (readError) return serverError("admin/update-testimonial read", readError);
  if (!before) return NextResponse.json({ error: "That story no longer exists. Refresh the list." }, { status: 404 });

  const hadConsent = !!before.consent_recorded_at;
  const consentGiven = body.consentGiven === undefined ? hadConsent : body.consentGiven === true;
  const consentNote =
    typeof body.consentNote === "string" ? body.consentNote.trim() : ((before.consent_note as string | null) ?? "");
  // Switching a story on needs consent on file. A story that loses its
  // consent (the patient withdrew it) goes hidden with it, below.
  const block = testimonialActivationBlock({ active: active === true, consentGiven, consentNote });
  if (block) return NextResponse.json({ error: block }, { status: 400 });

  // Absence means "leave it alone", never "switch it on" -- see the same
  // correction on update-treatment-category. A default of `true` here meant
  // an admin fixing a typo silently republished an entry they had retired.
  const patch: Record<string, unknown> = {
    patient_name: patientName,
    quote,
    rating: ratingValue,
    condition_label: conditionLabel || null,
    avatar_url:
      typeof avatarUrl === "string" && avatarUrl.trim() ? avatarUrl.trim() : null,
    display_order: Math.round(order),
  };
  if (active !== undefined) {
    patch.active = Boolean(active);
  }
  if (!consentGiven) patch.active = false;
  if (consentGiven !== hadConsent || (consentGiven && consentNote !== (before.consent_note ?? ""))) {
    patch.consent_recorded_at = consentGiven ? (hadConsent ? before.consent_recorded_at : new Date().toISOString()) : null;
    patch.consent_note = consentGiven ? consentNote : null;
    patch.consent_recorded_by = consentGiven ? adminUser.id : null;
  }

  const { error } = await admin.from("testimonials").update(patch).eq("id", id);

  if (error) {
    return serverError("admin/update-testimonial", error);
  }

  // Catalog rows decide what is sold and at what price, so every
  // create/update/delete belongs in the same log every other admin
  // action is read from.
  await recordAdminActivity(admin, adminUser.id, {
    action: "catalog.update",
    targetId: id,
    targetLabel: `Patient story: ${patientName}`,
    details: auditChanges(before as Record<string, unknown>, patch, [
      "patient_name",
      "quote",
      "rating",
      "condition_label",
      "avatar_url",
      "display_order",
      "active",
      "consent_note",
    ]),
  });

  // One component serves the testimonial band on both pages, and both are
  // ISR-cached (revalidate = 300) -- so both have to be invalidated or the
  // two bands disagree until the window expires.
  revalidatePath("/");
  revalidatePath("/mission");

  return NextResponse.json({ success: true });
}
