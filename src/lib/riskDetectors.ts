import type { createAdminClient } from "@/lib/supabase/admin";
import { computePerVisitFeePaise } from "@/lib/homeVisitPricing";
import {
  ruleNumber,
  belowRate,
  countPhrase,
  type RiskRule,
  type RiskSeverity,
  type RiskSubjectKind,
} from "@/lib/riskSignals";

type AdminClient = ReturnType<typeof createAdminClient>;

// The detectors, run as a lazy idempotent sweep at the top of the admin
// Today render -- the shape retryDueMeetSyncs and expirePackagePurchases
// already establish, because there is no cron in this deployment and there
// will not be one (see AGENTS.md).
//
// Unlike the Meet sweep this makes no outbound calls, so it needs no
// per-attempt timeout; unlike the expiry sweeps it runs several queries, so
// it still needs bounding. Three limits:
//
//   - a wall-clock budget for the whole sweep, checked between detectors,
//     so a slow database degrades into "fewer rules ran this render"
//     rather than a dashboard that will not paint;
//   - a minimum interval between sweeps, because the admin dashboard is
//     refreshed by realtime on every booking and re-running eight
//     aggregate queries each time would make the detector the most
//     expensive thing on the page;
//   - the one-open-per-subject unique index in the database, which is what
//     actually keeps the queue readable: a detector that keeps finding the
//     same thing writes one row, not one per render.
//
// Nothing here penalises anyone. A signal is a reason for a person to go
// and look, and every consequence flows from an admin acting deliberately
// through the ordinary routes.

const SWEEP_BUDGET_MS = 2500;
const MIN_SWEEP_INTERVAL_MS = 5 * 60_000;

/** Remembered per server instance. A restart simply sweeps once more. */
let lastSweepAtMs = 0;

type Candidate = {
  ruleKey: string;
  subjectKind: RiskSubjectKind;
  subjectId: string;
  severity: RiskSeverity;
  summary: string;
  evidence: Record<string, unknown>;
};

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * Runs the enabled detectors and records what they found.
 *
 * Never throws: this is called from a page render, and a dashboard that
 * fails to paint because a detector's query was rejected would be a far
 * worse outcome than a sweep that quietly did nothing this time.
 */
export async function runRiskSweep(admin: AdminClient): Promise<void> {
  try {
    const now = Date.now();
    if (now - lastSweepAtMs < MIN_SWEEP_INTERVAL_MS) return;

    const { data: settings } = await admin
      .from("site_settings")
      .select("risk_signals_enabled")
      .maybeSingle();
    if (settings?.risk_signals_enabled === false) return;

    const { data: ruleRows } = await admin
      .from("risk_rules")
      .select("rule_key, label, description, enabled, config")
      .eq("enabled", true);
    if (!ruleRows || ruleRows.length === 0) return;

    // Claimed before the work, not after. Two renders landing together
    // would otherwise both pass the interval check and both sweep.
    lastSweepAtMs = now;

    const rules: RiskRule[] = ruleRows.map((r) => ({
      ruleKey: r.rule_key,
      label: r.label,
      description: r.description,
      enabled: r.enabled,
      config: (r.config ?? {}) as Record<string, unknown>,
    }));

    const deadline = now + SWEEP_BUDGET_MS;
    const found: Candidate[] = [];

    for (const rule of rules) {
      if (Date.now() > deadline) break;
      const detector = DETECTORS[rule.ruleKey];
      if (!detector) continue;
      try {
        found.push(...(await detector(admin, rule)));
      } catch (error) {
        console.error("Risk detector failed", rule.ruleKey, error);
      }
    }

    await recordCandidates(admin, found);
  } catch (error) {
    console.error("Risk sweep failed", error);
  }
}

/**
 * Writes what the detectors found, one row at a time.
 *
 * Deliberately not a batch insert: the one-open-per-subject unique index
 * rejects a signal that is already waiting, and a batch would fail whole
 * where a per-row insert lets the genuinely new findings through. The 23505
 * is the expected case on a busy queue, not an error.
 */
async function recordCandidates(admin: AdminClient, candidates: Candidate[]): Promise<void> {
  for (const c of candidates) {
    const { error } = await admin.from("risk_signals").insert({
      rule_key: c.ruleKey,
      subject_kind: c.subjectKind,
      subject_id: c.subjectId,
      severity: c.severity,
      summary: c.summary,
      evidence: c.evidence,
    });
    if (error && error.code !== "23505") {
      console.error("Could not record risk signal", c.ruleKey, error.message);
    }
  }
}

type Detector = (admin: AdminClient, rule: RiskRule) => Promise<Candidate[]>;

// ---------------------------------------------------------------------
// The detectors themselves. Each one answers a question an admin would
// otherwise have to think to ask, and each one stores the ids behind its
// answer rather than a score.
// ---------------------------------------------------------------------

/**
 * A therapist whose messages carried payment details, or carried contact
 * details repeatedly.
 *
 * A single blocked attempt is worth a signal on its own -- there is no
 * innocent reading of a UPI handle in a message to a patient. Flag-tier
 * hits need a pattern, because a clinic's own landline in an instruction is
 * a normal thing to write once.
 */
const detectContactLeak: Detector = async (admin, rule) => {
  const windowDays = ruleNumber(rule.config, "flagWindowDays", 30);
  const threshold = ruleNumber(rule.config, "flagThreshold", 3);

  const { data: flags } = await admin
    .from("communication_flags")
    .select("id, author_id, author_role, tier, blocked, surface")
    .gte("created_at", daysAgoIso(windowDays))
    .eq("author_role", "therapist");
  if (!flags || flags.length === 0) return [];

  const byAuthor = new Map<string, typeof flags>();
  for (const f of flags) {
    if (!f.author_id) continue;
    const list = byAuthor.get(f.author_id) ?? [];
    list.push(f);
    byAuthor.set(f.author_id, list);
  }

  const out: Candidate[] = [];
  for (const [authorId, rows] of byAuthor) {
    const blocking = rows.filter((r) => r.tier === "block");
    if (blocking.length > 0) {
      out.push({
        ruleKey: rule.ruleKey,
        subjectKind: "therapist",
        subjectId: authorId,
        severity: "high",
        summary: `Payment details in ${countPhrase(blocking.length, "message")} to patients, refused at the point of writing.`,
        evidence: { flagIds: blocking.map((r) => r.id), windowDays },
      });
      continue;
    }
    if (rows.length >= threshold) {
      out.push({
        ruleKey: rule.ruleKey,
        subjectKind: "therapist",
        subjectId: authorId,
        severity: "medium",
        summary: `Contact details in ${countPhrase(rows.length, "message")} to patients in the last ${windowDays} days.`,
        evidence: { flagIds: rows.map((r) => r.id), windowDays, threshold },
      });
    }
  }
  return out;
};

/**
 * A completed session with no money and no programme behind it.
 *
 * The therapist's own route refuses this now, so a hit is either an admin
 * backfill (the common and legitimate case) or a session the clinic was
 * never paid for. The signal does not distinguish them, because that is the
 * judgement it is asking a person to make.
 */
const detectCompletionWithoutPayment: Detector = async (admin, rule) => {
  const lookbackDays = ruleNumber(rule.config, "lookbackDays", 30);

  const { data: rows } = await admin
    .from("appointments")
    .select(
      "id, session_code, therapist_id, patient_id, slot_time, payment_status, package_purchase_id, home_visit_purchase_id, cash_collected_at"
    )
    .eq("status", "completed")
    .neq("payment_status", "paid")
    .is("package_purchase_id", null)
    .is("home_visit_purchase_id", null)
    .is("cash_collected_at", null)
    .gte("slot_time", daysAgoIso(lookbackDays))
    .limit(50);
  if (!rows || rows.length === 0) return [];

  return rows.map((a) => ({
    ruleKey: rule.ruleKey,
    subjectKind: "appointment" as const,
    subjectId: a.id,
    severity: "high" as const,
    summary: `Session ${a.session_code ?? a.id.slice(0, 8)} was completed with no payment, no programme and no cash recorded.`,
    evidence: {
      appointmentId: a.id,
      therapistId: a.therapist_id,
      patientId: a.patient_id,
      slotTime: a.slot_time,
    },
  }));
};

/**
 * A session marked done materially before its slot.
 *
 * The therapist's route now refuses this outright, so anything found here
 * came through an admin path — which is exactly why it is worth surfacing
 * rather than assuming the block holds everywhere.
 */
const detectEarlyCompletion: Detector = async (admin, rule) => {
  const lookbackDays = ruleNumber(rule.config, "lookbackDays", 30);
  const minutesBefore = ruleNumber(rule.config, "minutesBefore", 30);

  // Reads completed_at, which complete-session stamps and nothing else
  // writes. Rows closed before that column existed carry null and are
  // skipped: a detector that treated a missing timestamp as an answer would
  // either flag the whole back catalogue or none of it, and neither is
  // information.
  const { data: rows } = await admin
    .from("appointments")
    .select("id, session_code, therapist_id, slot_time, completed_at")
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .gte("slot_time", daysAgoIso(lookbackDays))
    .limit(200);
  if (!rows || rows.length === 0) return [];

  const out: Candidate[] = [];
  for (const a of rows) {
    if (!a.completed_at || !a.slot_time) continue;
    const gapMinutes =
      (new Date(a.slot_time).getTime() - new Date(a.completed_at).getTime()) / 60_000;
    if (gapMinutes > minutesBefore) {
      out.push({
        ruleKey: rule.ruleKey,
        subjectKind: "appointment",
        subjectId: a.id,
        severity: "medium",
        summary: `Session ${a.session_code ?? a.id.slice(0, 8)} was closed ${Math.round(gapMinutes)} minutes before its start time.`,
        evidence: {
          appointmentId: a.id,
          therapistId: a.therapist_id,
          slotTime: a.slot_time,
          completedAt: a.completed_at,
        },
      });
    }
  }
  return out;
};

/**
 * Cash recorded at the door that is not what the visit was priced at.
 *
 * The therapist's route no longer lets them choose the figure, so a
 * variance now means either an admin correction (which carries its own
 * reason and audit row) or a visit priced differently from its purchase.
 * Both are worth a look and neither is wrongdoing on its face.
 */
const detectCashVariance: Detector = async (admin, rule) => {
  const lookbackDays = ruleNumber(rule.config, "lookbackDays", 60);
  const tolerancePaise = ruleNumber(rule.config, "tolerancePaise", 100);

  const { data: visits } = await admin
    .from("appointments")
    .select(
      "id, session_code, therapist_id, cash_collected_amount_paise, travel_fee_paise, home_visit_purchase_id, cash_collected_at"
    )
    .eq("visit_mode", "home_visit")
    .not("cash_collected_at", "is", null)
    .gte("cash_collected_at", daysAgoIso(lookbackDays))
    .limit(200);
  if (!visits || visits.length === 0) return [];

  const purchaseIds = [
    ...new Set(visits.map((v) => v.home_visit_purchase_id).filter((id): id is string => !!id)),
  ];
  const { data: purchases } = purchaseIds.length
    ? await admin
        .from("home_visit_package_purchases")
        .select("id, amount_paid_paise, visit_count")
        .in("id", purchaseIds)
    : { data: [] as { id: string; amount_paid_paise: number | null; visit_count: number }[] };
  const purchaseById = new Map((purchases ?? []).map((p) => [p.id, p]));

  const out: Candidate[] = [];
  for (const v of visits) {
    const purchase = v.home_visit_purchase_id
      ? purchaseById.get(v.home_visit_purchase_id)
      : undefined;
    if (!purchase) continue;
    const expected =
      computePerVisitFeePaise(purchase.amount_paid_paise, purchase.visit_count) +
      Math.max(0, v.travel_fee_paise ?? 0);
    const collected = v.cash_collected_amount_paise ?? 0;
    const difference = collected - expected;
    if (Math.abs(difference) > tolerancePaise) {
      out.push({
        ruleKey: rule.ruleKey,
        subjectKind: "appointment",
        subjectId: v.id,
        severity: Math.abs(difference) > expected / 2 ? "high" : "medium",
        summary: `Visit ${v.session_code ?? v.id.slice(0, 8)} recorded ₹${Math.round(collected / 100).toLocaleString("en-IN")} collected against ₹${Math.round(expected / 100).toLocaleString("en-IN")} expected.`,
        evidence: {
          appointmentId: v.id,
          therapistId: v.therapist_id,
          expectedPaise: expected,
          collectedPaise: collected,
          differencePaise: difference,
        },
      });
    }
  }
  return out;
};

/**
 * A therapist who unmasked an unusual number of patients' contacts.
 *
 * Revealing is legitimate and this must never read as though it is not --
 * the wording says so. What the signal is about is the *shape*: a clinician
 * reveals the number of the patient they are with, a few times a week; a
 * caseload being copied looks nothing like that.
 */
const detectContactRevealVolume: Detector = async (admin, rule) => {
  const windowDays = ruleNumber(rule.config, "windowDays", 7);
  const threshold = ruleNumber(rule.config, "threshold", 15);

  const { data: reveals } = await admin
    .from("contact_reveal_log")
    .select("id, therapist_id, patient_id")
    .gte("created_at", daysAgoIso(windowDays))
    .limit(1000);
  if (!reveals || reveals.length === 0) return [];

  const byTherapist = new Map<string, { ids: string[]; patients: Set<string> }>();
  for (const r of reveals) {
    const entry = byTherapist.get(r.therapist_id) ?? { ids: [], patients: new Set<string>() };
    entry.ids.push(r.id);
    entry.patients.add(r.patient_id);
    byTherapist.set(r.therapist_id, entry);
  }

  const out: Candidate[] = [];
  for (const [therapistId, entry] of byTherapist) {
    // Counted by distinct patients rather than by reveals: a therapist who
    // re-checked one number five times outside a building is not the thing
    // being looked for.
    if (entry.patients.size >= threshold) {
      out.push({
        ruleKey: rule.ruleKey,
        subjectKind: "therapist",
        subjectId: therapistId,
        severity: "medium",
        summary: `Contact details shown for ${countPhrase(entry.patients.size, "patient")} in ${windowDays} days.`,
        evidence: {
          revealIds: entry.ids.slice(0, 50),
          distinctPatients: entry.patients.size,
          windowDays,
          threshold,
        },
      });
    }
  }
  return out;
};

/**
 * An admin making an unusual number of free-form credit adjustments.
 *
 * Here because the override lane should be visible to the people who hold
 * it. An admin can grant any balance with a reason, which is the right
 * design for the incident it exists for and the wrong thing to have no
 * visibility over at all.
 */
const detectManualAdjustmentVolume: Detector = async (admin, rule) => {
  const windowDays = ruleNumber(rule.config, "windowDays", 30);
  const threshold = ruleNumber(rule.config, "threshold", 20);

  const { data: entries } = await admin
    .from("session_credit_ledger")
    .select("id, actor_id, actor_role")
    .eq("entry_type", "admin_adjust")
    .gte("created_at", daysAgoIso(windowDays))
    .limit(1000);
  if (!entries || entries.length === 0) return [];

  const byActor = new Map<string, string[]>();
  for (const e of entries) {
    if (!e.actor_id) continue;
    const list = byActor.get(e.actor_id) ?? [];
    list.push(e.id);
    byActor.set(e.actor_id, list);
  }

  const out: Candidate[] = [];
  for (const [actorId, ids] of byActor) {
    if (ids.length >= threshold) {
      out.push({
        ruleKey: rule.ruleKey,
        subjectKind: "admin",
        subjectId: actorId,
        severity: "low",
        summary: `${countPhrase(ids.length, "manual credit adjustment")} in the last ${windowDays} days.`,
        evidence: { ledgerEntryIds: ids.slice(0, 50), windowDays, threshold },
      });
    }
  }
  return out;
};

/**
 * A therapist whose recommendations are rarely bought.
 *
 * Ships disabled, and should stay so until this clinic has a baseline. A
 * conversion floor invented before anyone knows the normal rate either
 * fires on every therapist or on none, and the first of those is how a
 * queue stops being read. The maths is here so turning it on is an admin
 * edit rather than a release.
 */
const detectPlanConversionLow: Detector = async (admin, rule) => {
  const windowDays = ruleNumber(rule.config, "windowDays", 30);
  const minPlans = ruleNumber(rule.config, "minPlans", 5);
  const minConversion = ruleNumber(rule.config, "minConversion", 0.2);

  const { data: plans } = await admin
    .from("care_plans")
    .select("id, therapist_id, status")
    .gte("created_at", daysAgoIso(windowDays))
    .limit(1000);
  if (!plans || plans.length === 0) return [];

  const byTherapist = new Map<string, { total: number; accepted: number; ids: string[] }>();
  for (const p of plans) {
    const entry = byTherapist.get(p.therapist_id) ?? { total: 0, accepted: 0, ids: [] };
    entry.total += 1;
    if (p.status === "accepted") entry.accepted += 1;
    entry.ids.push(p.id);
    byTherapist.set(p.therapist_id, entry);
  }

  const out: Candidate[] = [];
  for (const [therapistId, entry] of byTherapist) {
    if (belowRate(entry.accepted, entry.total, minPlans, minConversion)) {
      out.push({
        ruleKey: rule.ruleKey,
        subjectKind: "therapist",
        subjectId: therapistId,
        severity: "low",
        summary: `${entry.accepted} of ${entry.total} recommendations were taken up in the last ${windowDays} days.`,
        evidence: {
          carePlanIds: entry.ids.slice(0, 50),
          accepted: entry.accepted,
          total: entry.total,
          windowDays,
        },
      });
    }
  }
  return out;
};

/**
 * Patients who complete one session with a therapist and never return.
 *
 * Also disabled by default, and for a subtler reason than the rule above: a
 * consultation-first clinic *expects* a proportion of one-off consultations,
 * so the number that matters is this therapist against the clinic's own
 * mean rather than against any fixed rate. Until that mean exists the
 * threshold is a guess.
 */
const detectPostConsultationDropout: Detector = async (admin, rule) => {
  const windowDays = ruleNumber(rule.config, "windowDays", 90);
  const minPatients = ruleNumber(rule.config, "minPatients", 5);
  const maxDropoutRate = ruleNumber(rule.config, "maxDropoutRate", 0.7);

  const { data: sessions } = await admin
    .from("appointments")
    .select("id, therapist_id, patient_id, status")
    .eq("status", "completed")
    .gte("slot_time", daysAgoIso(windowDays))
    .limit(2000);
  if (!sessions || sessions.length === 0) return [];

  const perTherapist = new Map<string, Map<string, number>>();
  for (const s of sessions) {
    if (!s.therapist_id || !s.patient_id) continue;
    const patients = perTherapist.get(s.therapist_id) ?? new Map<string, number>();
    patients.set(s.patient_id, (patients.get(s.patient_id) ?? 0) + 1);
    perTherapist.set(s.therapist_id, patients);
  }

  const out: Candidate[] = [];
  for (const [therapistId, patients] of perTherapist) {
    const total = patients.size;
    if (total < minPatients) continue;
    const onceOnly = [...patients.values()].filter((n) => n === 1).length;
    if (onceOnly / total > maxDropoutRate) {
      out.push({
        ruleKey: rule.ruleKey,
        subjectKind: "therapist",
        subjectId: therapistId,
        severity: "low",
        summary: `${onceOnly} of ${total} patients seen in the last ${windowDays} days did not come back.`,
        evidence: { onceOnly, totalPatients: total, windowDays, maxDropoutRate },
      });
    }
  }
  return out;
};

const DETECTORS: Record<string, Detector> = {
  contact_leak: detectContactLeak,
  completion_without_payment: detectCompletionWithoutPayment,
  early_completion: detectEarlyCompletion,
  cash_variance: detectCashVariance,
  contact_reveal_volume: detectContactRevealVolume,
  manual_adjustment_volume: detectManualAdjustmentVolume,
  plan_conversion_low: detectPlanConversionLow,
  post_consultation_dropout: detectPostConsultationDropout,
};
