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
import {
  computeClinicReceivable,
  computePatientBalance,
  isAgedBalance,
  isOpenPayLaterSession,
  oldestOwedAgeDays,
  type PayLaterAppointment,
} from "@/lib/patientBalances";
import { readPayLaterAgeSettings } from "@/lib/payLaterSettingsServer";

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
//     so a slow database degrades into "fewer rules ran this time" rather
//     than a sweep that never ends -- and the rules it did not reach are
//     named in the stored report (risk_sweep_runs), never skipped quietly;
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

// 8s rather than the 2.5s this started at. The sweep no longer runs inside
// the render: the dashboard starts it in `after()`, once the response has
// gone, and the scheduled job runs it with nobody waiting. At 2.5s, a real
// sweep with every rule switched on left three rules unreached on each run
// -- now said on the Risk screen, but better simply reached. A rule still
// unreached is reported, never silently skipped.
const SWEEP_BUDGET_MS = 8000;
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
 * How the last sweep actually went, so the Risk screen can tell "nothing
 * found" from "not everything was checked". Stored in `risk_sweep_runs`
 * (one row) because the sweep runs from the scheduled job and from the
 * dashboard on different server instances.
 */
export type RiskSweepReport = {
  finishedAt: string;
  /** Every enabled rule ran, no read failed or hit its cap, and every
   *  finding was recorded. */
  complete: boolean;
  failedRules: string[];
  unreachedRules: string[];
  truncatedRules: string[];
  unrecordedCount: number;
};

/**
 * Runs the enabled detectors and records what they found.
 *
 * Never throws: this is called from a page render, and a dashboard that
 * fails to paint because a detector's query was rejected would be a far
 * worse outcome than a sweep that did less this time. But it no longer
 * fails *quietly*: a detector whose read failed, a rule the time budget
 * did not reach, a read that hit its row cap and a finding that could not
 * be written are all kept in the report, and the report is stored, so the
 * Risk screen never says "Nothing waiting" on the strength of a scan that
 * did not happen.
 */
export async function runRiskSweep(admin: AdminClient): Promise<RiskSweepReport | null> {
  try {
    const now = Date.now();
    if (now - lastSweepAtMs < MIN_SWEEP_INTERVAL_MS) return null;

    const { data: settings } = await admin
      .from("site_settings")
      .select("risk_signals_enabled")
      .maybeSingle();
    if (settings?.risk_signals_enabled === false) return null;

    const { data: ruleRows, error: rulesError } = await admin
      .from("risk_rules")
      .select("rule_key, label, description, enabled, config")
      .eq("enabled", true);
    if (rulesError) {
      // Not a sweep at all: say so rather than leave the last good report up.
      return await storeSweepReport(admin, {
        finishedAt: new Date().toISOString(),
        complete: false,
        failedRules: ["(the rule list itself)"],
        unreachedRules: [],
        truncatedRules: [],
        unrecordedCount: 0,
      });
    }
    if (!ruleRows || ruleRows.length === 0) {
      // Every rule is switched off: there was nothing to run, and nothing
      // was missed. Recorded as complete so the screen does not warn about a
      // scan nobody asked for -- the rules panel already says they are off.
      lastSweepAtMs = now;
      return await storeSweepReport(admin, {
        finishedAt: new Date().toISOString(),
        complete: true,
        failedRules: [],
        unreachedRules: [],
        truncatedRules: [],
        unrecordedCount: 0,
      });
    }

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
    const failedRules: string[] = [];
    const unreachedRules: string[] = [];
    const truncatedRules: string[] = [];

    for (const rule of rules) {
      const detector = DETECTORS[rule.ruleKey];
      if (!detector) continue;
      if (Date.now() > deadline) {
        unreachedRules.push(rule.ruleKey);
        continue;
      }
      const ctx: SweepContext = { truncated: false };
      try {
        found.push(...(await detector(admin, rule, ctx)));
        if (ctx.truncated) truncatedRules.push(rule.ruleKey);
      } catch (error) {
        console.error("Risk detector failed", rule.ruleKey, error);
        failedRules.push(rule.ruleKey);
      }
    }

    const unrecordedCount = await recordCandidates(admin, found);

    return await storeSweepReport(admin, {
      finishedAt: new Date().toISOString(),
      complete:
        failedRules.length === 0 &&
        unreachedRules.length === 0 &&
        truncatedRules.length === 0 &&
        unrecordedCount === 0,
      failedRules,
      unreachedRules,
      truncatedRules,
      unrecordedCount,
    });
  } catch (error) {
    console.error("Risk sweep failed", error);
    return null;
  }
}

async function storeSweepReport(admin: AdminClient, report: RiskSweepReport): Promise<RiskSweepReport> {
  const { error } = await admin.from("risk_sweep_runs").upsert({
    id: 1,
    finished_at: report.finishedAt,
    complete: report.complete,
    failed_rules: report.failedRules,
    unreached_rules: report.unreachedRules,
    truncated_rules: report.truncatedRules,
    unrecorded_count: report.unrecordedCount,
  });
  if (error) console.error("Could not store the risk sweep report", error.message);
  return report;
}

/**
 * The last sweep's report, for the Risk screen. `null` when none has been
 * stored yet, or the read failed -- the screen treats both as "we can't say
 * the scan was complete", never as complete.
 */
export async function readLastRiskSweep(
  admin: AdminClient
): Promise<{ report: RiskSweepReport | null; readFailed: boolean }> {
  const { data, error } = await admin
    .from("risk_sweep_runs")
    .select("finished_at, complete, failed_rules, unreached_rules, truncated_rules, unrecorded_count")
    .eq("id", 1)
    .maybeSingle();
  if (error) return { report: null, readFailed: true };
  if (!data) return { report: null, readFailed: false };
  return {
    readFailed: false,
    report: {
      finishedAt: data.finished_at,
      complete: data.complete,
      failedRules: data.failed_rules ?? [],
      unreachedRules: data.unreached_rules ?? [],
      truncatedRules: data.truncated_rules ?? [],
      unrecordedCount: data.unrecorded_count ?? 0,
    },
  };
}

/**
 * Writes what the detectors found, one row at a time.
 *
 * Deliberately not a batch insert: the one-open-per-subject unique index
 * rejects a signal that is already waiting, and a batch would fail whole
 * where a per-row insert lets the genuinely new findings through. The 23505
 * is the expected case on a busy queue, not an error.
 */
async function recordCandidates(admin: AdminClient, candidates: Candidate[]): Promise<number> {
  let unrecorded = 0;
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
      unrecorded += 1;
    }
  }
  return unrecorded;
}

/** What one detector learned about its own reads, beyond what it found. */
type SweepContext = { truncated: boolean };

type Detector = (admin: AdminClient, rule: RiskRule, ctx: SweepContext) => Promise<Candidate[]>;

/** PostgREST's own ceiling on a select with no `.limit()`. */
const PAGE_CAP = 1000;

class DetectorReadError extends Error {}

/**
 * Every detector read goes through this. A failed read used to destructure
 * as `data: null` and return "no findings" -- so a database error read on
 * the Risk screen as "Nothing waiting". It now throws, and the sweep counts
 * that rule as failed. A read that came back exactly at its row cap may
 * have more behind it; that is recorded too, so a capped scan is not
 * presented as a complete one.
 */
function checkRead(
  ctx: SweepContext,
  error: { message?: string } | null | undefined,
  rows: unknown[] | null | undefined,
  cap: number,
  label: string
): void {
  if (error) throw new DetectorReadError(`${label}: ${error.message ?? "read failed"}`);
  if ((rows?.length ?? 0) >= cap) ctx.truncated = true;
}

function failIfError(error: { message?: string } | null | undefined, label: string): void {
  if (error) throw new DetectorReadError(`${label}: ${error.message ?? "read failed"}`);
}

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
const detectContactLeak: Detector = async (admin, rule, ctx) => {
  const windowDays = ruleNumber(rule.config, "flagWindowDays", 30);
  const threshold = ruleNumber(rule.config, "flagThreshold", 3);

  const { data: flags, error: flagsError } = await admin
    .from("communication_flags")
    .select("id, author_id, author_role, tier, blocked, surface")
    .gte("created_at", daysAgoIso(windowDays))
    .eq("author_role", "therapist");
  checkRead(ctx, flagsError, flags, PAGE_CAP, "flags");
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
const detectCompletionWithoutPayment: Detector = async (admin, rule, ctx) => {
  const lookbackDays = ruleNumber(rule.config, "lookbackDays", 30);

  const { data: rows, error: rowsError } = await admin
    .from("appointments")
    .select(
      "id, session_code, therapist_id, patient_id, slot_time, payment_status, payment_terms, package_purchase_id, home_visit_purchase_id, cash_collected_at"
    )
    .eq("status", "completed")
    .neq("payment_status", "paid")
    // A session on pay-later terms IS backed: the sale is recorded, the
    // revenue is counted and the debt is on Money -> Owed by Patients. This
    // rule's whole meaning is "the clinic was never paid and has no record of
    // selling it", which is false here -- so without this line every session
    // one of these patients ever has raises a high-severity signal, and the
    // queue stops being read.
    .neq("payment_terms", "pay_later")
    .is("package_purchase_id", null)
    .is("home_visit_purchase_id", null)
    .is("cash_collected_at", null)
    .gte("slot_time", daysAgoIso(lookbackDays))
    .limit(50);
  checkRead(ctx, rowsError, rows, 50, "rows");
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
 * came through an admin path - which is exactly why it is worth surfacing
 * rather than assuming the block holds everywhere.
 */
const detectEarlyCompletion: Detector = async (admin, rule, ctx) => {
  const lookbackDays = ruleNumber(rule.config, "lookbackDays", 30);
  const minutesBefore = ruleNumber(rule.config, "minutesBefore", 30);

  // Reads completed_at, which complete-session stamps and nothing else
  // writes. Rows closed before that column existed carry null and are
  // skipped: a detector that treated a missing timestamp as an answer would
  // either flag the whole back catalogue or none of it, and neither is
  // information.
  const { data: rows, error: rowsError } = await admin
    .from("appointments")
    .select("id, session_code, therapist_id, slot_time, completed_at")
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .gte("slot_time", daysAgoIso(lookbackDays))
    .limit(200);
  checkRead(ctx, rowsError, rows, 200, "rows");
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
const detectCashVariance: Detector = async (admin, rule, ctx) => {
  const lookbackDays = ruleNumber(rule.config, "lookbackDays", 60);
  const tolerancePaise = ruleNumber(rule.config, "tolerancePaise", 100);

  const { data: visits, error: visitsError } = await admin
    .from("appointments")
    .select(
      "id, session_code, therapist_id, cash_collected_amount_paise, travel_fee_paise, home_visit_purchase_id, cash_collected_at"
    )
    .eq("visit_mode", "home_visit")
    .not("cash_collected_at", "is", null)
    .gte("cash_collected_at", daysAgoIso(lookbackDays))
    .limit(200);
  checkRead(ctx, visitsError, visits, 200, "visits");
  if (!visits || visits.length === 0) return [];

  const purchaseIds = [
    ...new Set(visits.map((v) => v.home_visit_purchase_id).filter((id): id is string => !!id)),
  ];
  const { data: purchases, error: purchasesError } = purchaseIds.length
    ? await admin
        .from("home_visit_package_purchases")
        .select("id, amount_paid_paise, visit_count")
        .in("id", purchaseIds)
    : { data: [] as { id: string; amount_paid_paise: number | null; visit_count: number }[], error: null };
  failIfError(purchasesError, "home-visit purchases");
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
const detectContactRevealVolume: Detector = async (admin, rule, ctx) => {
  const windowDays = ruleNumber(rule.config, "windowDays", 7);
  const threshold = ruleNumber(rule.config, "threshold", 15);

  const { data: reveals, error: revealsError } = await admin
    .from("contact_reveal_log")
    .select("id, therapist_id, patient_id")
    .gte("created_at", daysAgoIso(windowDays))
    .limit(1000);
  checkRead(ctx, revealsError, reveals, 1000, "reveals");
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
const detectManualAdjustmentVolume: Detector = async (admin, rule, ctx) => {
  const windowDays = ruleNumber(rule.config, "windowDays", 30);
  const threshold = ruleNumber(rule.config, "threshold", 20);

  const { data: entries, error: entriesError } = await admin
    .from("session_credit_ledger")
    .select("id, actor_id, actor_role")
    .eq("entry_type", "admin_adjust")
    .gte("created_at", daysAgoIso(windowDays))
    .limit(1000);
  checkRead(ctx, entriesError, entries, 1000, "entries");
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
const detectPlanConversionLow: Detector = async (admin, rule, ctx) => {
  const windowDays = ruleNumber(rule.config, "windowDays", 30);
  const minPlans = ruleNumber(rule.config, "minPlans", 5);
  const minConversion = ruleNumber(rule.config, "minConversion", 0.2);

  const { data: plans, error: plansError } = await admin
    .from("care_plans")
    .select("id, therapist_id, status")
    .gte("created_at", daysAgoIso(windowDays))
    .limit(1000);
  checkRead(ctx, plansError, plans, 1000, "plans");
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
const detectPostConsultationDropout: Detector = async (admin, rule, ctx) => {
  const windowDays = ruleNumber(rule.config, "windowDays", 90);
  const minPatients = ruleNumber(rule.config, "minPatients", 5);
  const maxDropoutRate = ruleNumber(rule.config, "maxDropoutRate", 0.7);

  const { data: sessions, error: sessionsError } = await admin
    .from("appointments")
    .select("id, therapist_id, patient_id, status")
    .eq("status", "completed")
    .gte("slot_time", daysAgoIso(windowDays))
    .limit(2000);
  checkRead(ctx, sessionsError, sessions, 2000, "sessions");
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

/**
 * A trusted patient who has owed for longer than the clinic's own threshold.
 *
 * The only automatic warning an arrangement with no ceiling has, which is why
 * this one ships **enabled** where the two rules with no baseline ship off:
 * the population is tiny and hand-picked, so a threshold cannot fire on
 * everyone, and the alternative is that nothing watches at all.
 *
 * It reads the admin's own number rather than carrying a threshold in its
 * config, so the amber on Money -> Owed by Patients and the signal here can
 * never disagree about what "a while" means.
 *
 * A flag is not an accusation and carries no penalty. Nothing is suspended,
 * held or hidden because this fired; it links to the sessions behind it and
 * an admin decides, if at all, through the ordinary screens.
 */
const detectPayLaterAged: Detector = async (admin, _rule, ctx) => {
  const [{ days, enabled }, { data: rows, error: rowsError }] = await Promise.all([
    readPayLaterAgeSettings(admin),
    admin
      .from("appointments")
      .select("id, patient_id, slot_time, status, payment_status, payment_terms, amount_due_paise, pay_later_outcome")
      .eq("payment_terms", "pay_later")
      .eq("status", "completed")
      .neq("payment_status", "paid"),
  ]);
  // The clinic switched the warning off. A detector that fires anyway would
  // be a second opinion on a question an admin has already answered.
  if (!enabled) return [];
  checkRead(ctx, rowsError, rows, PAGE_CAP, "rows");
  if (!rows || rows.length === 0) return [];

  const now = Date.now();
  const byPatient = new Map<string, PayLaterAppointment[]>();
  for (const a of rows as PayLaterAppointment[]) {
    if (!isOpenPayLaterSession(a)) continue;
    byPatient.set(a.patient_id, [...(byPatient.get(a.patient_id) ?? []), a]);
  }

  const out: Candidate[] = [];
  for (const [patientId, sessions] of byPatient) {
    const age = oldestOwedAgeDays(sessions, now);
    if (!isAgedBalance(age, { days, enabled })) continue;
    const { owedPaise, owedCount } = computePatientBalance(patientId, sessions);
    if (owedPaise <= 0) continue;
    out.push({
      ruleKey: "pay_later_aged",
      subjectKind: "patient",
      subjectId: patientId,
      severity: "medium",
      summary: `A trusted patient has owed ₹${Math.round(owedPaise / 100).toLocaleString("en-IN")} across ${countPhrase(owedCount, "session", "sessions")} for ${age} days.`,
      // The rows behind it, never a score: an admin who can only see a
      // verdict cannot disagree with it.
      evidence: {
        patientId,
        oldestAgeDays: age,
        thresholdDays: days,
        owedPaise,
        appointmentIds: sessions.map((a) => a.id),
      },
    });
  }
  return out;
};

/**
 * One trusted patient owing far more than a configured figure.
 *
 * Ships **disabled**: nobody knows the normal balance for this clinic yet,
 * and a threshold invented before anyone does fires on everyone or on
 * nobody -- the first of which is how a queue stops being read.
 */
const detectPayLaterBalanceHigh: Detector = async (admin, rule, ctx) => {
  const ceilingPaise = ruleNumber(rule.config, "balancePaise", 5_000_000);

  const { data: rows, error: rowsError } = await admin
    .from("appointments")
    .select("id, patient_id, slot_time, status, payment_status, payment_terms, amount_due_paise, pay_later_outcome")
    .eq("payment_terms", "pay_later")
    .eq("status", "completed")
    .neq("payment_status", "paid");
  checkRead(ctx, rowsError, rows, PAGE_CAP, "rows");
  if (!rows || rows.length === 0) return [];

  const { balances } = computeClinicReceivable(rows as PayLaterAppointment[]);
  return balances
    .filter((b) => b.owedPaise >= ceilingPaise)
    .map((b) => ({
      ruleKey: rule.ruleKey,
      subjectKind: "patient" as const,
      subjectId: b.patientId,
      severity: "medium" as const,
      summary: `A trusted patient owes ₹${Math.round(b.owedPaise / 100).toLocaleString("en-IN")} across ${countPhrase(b.owedCount, "session", "sessions")}.`,
      evidence: {
        patientId: b.patientId,
        owedPaise: b.owedPaise,
        thresholdPaise: ceilingPaise,
      },
    }));
};

/**
 * A patient whose declared payments keep being turned down.
 *
 * Held back until now on purpose: it counts rejected declarations, and
 * `pay_later_payments` did not exist, so a rule that could never fire would
 * have been a queue nobody reads.
 *
 * Enabled, at two. One rejection is ordinary -- a reference typed wrong, a
 * transfer that had not landed when somebody looked. Two is a pattern, and
 * the pattern it most often is, is a patient who believes they have paid and
 * a clinic that cannot find the money: the person who most needs a phone call
 * and is least likely to get one, because from the clinic's side nothing has
 * changed except a figure that will not go down.
 *
 * Like every rule here it carries no penalty. Nothing is suspended, held or
 * hidden; an admin rings them, or does not.
 */
const detectPayLaterDeclarationRejected: Detector = async (admin, rule, ctx) => {
  const threshold = Math.max(2, ruleNumber(rule.config, "rejections", 2));

  const { data: rows, error: rowsError } = await admin
    .from("pay_later_payments")
    .select("id, patient_id, amount_paise, declared_at")
    .eq("status", "rejected")
    .order("declared_at", { ascending: false })
    .limit(500);

  checkRead(ctx, rowsError, rows, 500, "rows");
  if (!rows || rows.length === 0) return [];

  const byPatient = new Map<string, { ids: string[]; totalPaise: number }>();
  for (const r of rows as { id: string; patient_id: string; amount_paise: number | null }[]) {
    const entry = byPatient.get(r.patient_id) ?? { ids: [], totalPaise: 0 };
    entry.ids.push(r.id);
    entry.totalPaise += Math.max(0, r.amount_paise ?? 0);
    byPatient.set(r.patient_id, entry);
  }

  const out: Candidate[] = [];
  for (const [patientId, entry] of byPatient) {
    if (entry.ids.length < threshold) continue;
    out.push({
      ruleKey: "pay_later_declaration_rejected",
      subjectKind: "patient",
      subjectId: patientId,
      severity: "medium",
      summary: `${countPhrase(entry.ids.length, "payment", "payments")} this patient said they had made could not be found.`,
      evidence: {
        patientId,
        rejectedCount: entry.ids.length,
        thresholdRejections: threshold,
        totalDeclaredPaise: entry.totalPaise,
        paymentIds: entry.ids,
      },
    });
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
  pay_later_aged: detectPayLaterAged,
  pay_later_balance_high: detectPayLaterBalanceHigh,
  pay_later_declaration_rejected: detectPayLaterDeclarationRejected,
};
