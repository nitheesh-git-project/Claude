import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";

// Tuning a detector.
//
// The thresholds live in `risk_rules` rather than in the detector code for
// one reason: several of them have no defensible value until this clinic
// has a baseline. A conversion floor invented before anyone knows the
// normal rate fires on every therapist or on none, and the first of those
// is how a queue stops being read. So the rules ship mostly disabled and
// turning one on is an admin's judgement, made here, not a release.
//
// `full` scope only, matching the review route: a rule decides which of
// your colleagues gets looked at.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("today");
  if (!adminUser || adminUser.scope !== "full") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    ruleKey?: string;
    enabled?: boolean;
    config?: Record<string, unknown>;
  }>(request);
  if (parseError) return parseError;

  const ruleKey = body.ruleKey?.trim();
  if (!ruleKey) {
    return NextResponse.json({ error: "Missing rule." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: rule } = await admin
    .from("risk_rules")
    .select("rule_key, label, enabled, config")
    .eq("rule_key", ruleKey)
    .maybeSingle();
  if (!rule) {
    return NextResponse.json({ error: "Unknown rule." }, { status: 404 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.enabled === "boolean") update.enabled = body.enabled;

  if (body.config !== undefined) {
    if (typeof body.config !== "object" || body.config === null || Array.isArray(body.config)) {
      return NextResponse.json({ error: "Settings must be a set of values." }, { status: 400 });
    }
    // Merged onto what is there, and only over keys the rule already
    // defines. A detector reads its config by name, so an unknown key is
    // either a typo that would silently do nothing or a value the detector
    // will never see -- both are better refused than stored.
    const existing = (rule.config ?? {}) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...existing };
    for (const [key, value] of Object.entries(body.config)) {
      if (!(key in existing)) {
        return NextResponse.json(
          { error: `This rule has no setting called "${key}".` },
          { status: 400 }
        );
      }
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return NextResponse.json(
          { error: `"${key}" must be a number of zero or more.` },
          { status: 400 }
        );
      }
      merged[key] = value;
    }
    update.config = merged;
  }

  const { error } = await admin.from("risk_rules").update(update).eq("rule_key", ruleKey);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "setting.update",
    targetId: null,
    targetLabel: `Risk rule — ${rule.label}`,
    details: {
      ruleKey,
      previousEnabled: rule.enabled,
      enabled: update.enabled ?? rule.enabled,
      previousConfig: rule.config,
      config: update.config ?? rule.config,
    },
  });

  return NextResponse.json({ success: true });
}
