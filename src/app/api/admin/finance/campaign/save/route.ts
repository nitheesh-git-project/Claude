import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isMarketingChannel } from "@/lib/financeMetrics";
import {
  parseDateInput,
  parseId,
  parseLabel,
  parseOptionalId,
  parseOptionalPaise,
  parseOptionalText,
  parsePaise,
} from "@/lib/financeInputs";

// What was spent on advertising, and what it can be traced to.
//
// Two rules are worth stating, because both are what keeps the return-on-ad-
// spend figure honest rather than merely present:
//
//  1. **The promo code is the attribution, and it is checked.** A campaign
//     pointing at a code that does not exist would produce a ratio against
//     revenue nobody could look up, so the code is verified here rather than
//     trusted from the form -- the screen offers a picker, but this route is
//     reachable with a session cookie.
//  2. **A hand-entered revenue is allowed and is never silently blended.** An
//     ad that makes the phone ring is real and this app cannot see it, so
//     refusing the figure would push an owner into inventing a promo code
//     that nobody ever typed. It is stored in its own column and labelled as
//     the owner's own figure everywhere it is shown.
export async function POST(request: NextRequest) {
  const context = await requireAdminScope("money");
  if (!context) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    id?: string | null;
    name?: string;
    channel?: string;
    startsOn?: string;
    endsOn?: string | null;
    spendPaise?: number;
    promoCodeId?: string | null;
    attributedRevenuePaise?: number | null;
    notes?: string;
  }>(request);
  if (parseError) return parseError;

  const name = parseLabel(body.name, "this campaign a name");
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });

  if (!isMarketingChannel(body.channel)) {
    return NextResponse.json({ error: "Pick where the ads ran." }, { status: 400 });
  }

  const startsOn = parseDateInput(body.startsOn, "the day the campaign started");
  if (!startsOn.ok) return NextResponse.json({ error: startsOn.error }, { status: 400 });

  // Null is meaningful: it means the campaign is still running, and its spend
  // is spread up to today rather than to a date somebody has to remember to
  // come back and set.
  let endsOn: string | null = null;
  if (body.endsOn) {
    const parsed = parseDateInput(body.endsOn, "the day it ended");
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (parsed.value < startsOn.value) {
      return NextResponse.json(
        { error: "The end date is before the start date." },
        { status: 400 }
      );
    }
    endsOn = parsed.value;
  }

  // Zero is allowed: a campaign with no spend yet is a row somebody is about
  // to fill in, and refusing it makes them wait rather than plan.
  const spend = parsePaise(body.spendPaise, "what it cost", { allowZero: true });
  if (!spend.ok) return NextResponse.json({ error: spend.error }, { status: 400 });

  const promoCodeId = parseOptionalId(body.promoCodeId);
  if (!promoCodeId.ok) return NextResponse.json({ error: promoCodeId.error }, { status: 400 });

  const attributed = parseOptionalPaise(
    body.attributedRevenuePaise,
    "what you believe it brought in"
  );
  if (!attributed.ok) return NextResponse.json({ error: attributed.error }, { status: 400 });

  const admin = createAdminClient();

  if (promoCodeId.value) {
    const { data: code } = await admin
      .from("promo_codes")
      .select("id")
      .eq("id", promoCodeId.value)
      .maybeSingle();
    if (!code) {
      return NextResponse.json(
        { error: "That promo code no longer exists - pick another, or leave it unlinked." },
        { status: 400 }
      );
    }
  }

  const row = {
    name: name.value,
    channel: body.channel,
    starts_on: startsOn.value,
    ends_on: endsOn,
    spend_paise: spend.value,
    promo_code_id: promoCodeId.value,
    attributed_revenue_paise: attributed.value,
    notes: parseOptionalText(body.notes),
  };

  if (body.id) {
    const id = parseId(body.id);
    if (!id.ok) return NextResponse.json({ error: id.error }, { status: 400 });

    const { data: updated, error } = await admin
      .from("marketing_campaigns")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", id.value)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated) {
      return NextResponse.json(
        { error: "That campaign is no longer there - somebody may have removed it." },
        { status: 409 }
      );
    }
    await recordAdminActivity(admin, context.id, {
      action: "finance.campaign_save",
      targetId: id.value,
      targetLabel: name.value,
      amountPaise: spend.value,
      details: { channel: body.channel, startsOn: startsOn.value, endsOn },
    });
    return NextResponse.json({ success: true, id: id.value });
  }

  const { data: created, error } = await admin
    .from("marketing_campaigns")
    .insert({ ...row, created_by: context.id })
    .select("id")
    .single();
  if (error || !created) {
    return NextResponse.json(
      { error: error?.message ?? "Could not save this campaign." },
      { status: 500 }
    );
  }

  await recordAdminActivity(admin, context.id, {
    action: "finance.campaign_save",
    targetId: created.id,
    targetLabel: name.value,
    amountPaise: spend.value,
    details: { channel: body.channel, startsOn: startsOn.value, endsOn },
  });

  return NextResponse.json({ success: true, id: created.id });
}
