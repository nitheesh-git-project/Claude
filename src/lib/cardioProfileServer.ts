import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadCareStatus,
  loadEnabledLicensedMeasures,
  loadGoalAndMilestones,
  loadMeasurements,
  loadSixMinuteWalkEquation,
} from "@/lib/outcomeServer";
import { loadDiaryEntries } from "@/lib/patientDiaryServer";
import { loadSummaryAuthorName } from "@/lib/careStatusAuthor";
import { loadIntakeHistory, loadPersonFacts } from "@/lib/profileReadsServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { clinicDateKey } from "@/lib/clinicWeek";
import type { CardioReads } from "@/lib/cardioProfile";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = SupabaseClient<any, any, any>;

/**
 * The reads behind the Heart and lung rehabilitation Health Profile (phase
 * 6a), each its own call and run together: the recorded measurements (the
 * six-minute walk, the vitals, breathlessness, the talk test), the goal and
 * steps, the phase and status history, the diary (active minutes), the
 * intake history, the licence switch, the date of birth and gender, and the
 * clinic's six-minute walk equation (an unreadable setting is "we couldn't
 * check", never the placeholder read as "not chosen"). Same client rule as
 * loadGeriatricReads.
 *
 * Cardiopulmonary pages only (the two-phase rule).
 */
export async function loadCardioReads(client: AnyClient, patientId: string): Promise<CardioReads> {
  const admin = createAdminClient();
  const [measurements, goals, careStatus, diary, intakeHistory, licence, person, equation] = await Promise.all([
    loadMeasurements(client, patientId),
    loadGoalAndMilestones(client, patientId),
    loadCareStatus(client, patientId, { profileKind: "cardiopulmonary" }),
    loadDiaryEntries(client, patientId),
    loadIntakeHistory(client, patientId),
    loadEnabledLicensedMeasures(admin),
    loadPersonFacts(admin, patientId),
    loadSixMinuteWalkEquation(admin),
  ]);
  const summaryAuthorName =
    careStatus.status === "ok" ? await loadSummaryAuthorName(admin, careStatus.events, "cardiopulmonary") : null;
  const nowMs = Date.now();
  return {
    measurements,
    goals,
    careStatus: careStatus.status === "ok" ? { status: "ok", events: careStatus.events } : { status: "unreadable" },
    diary: diary.status === "ok" ? { status: "ok", entries: diary.entries } : { status: "unreadable" },
    intakeHistory,
    licence: licence.status === "ok" ? { status: "ok", keys: licence.keys } : { status: "unreadable" },
    person,
    summaryAuthorName,
    nowMs,
    todayIso: clinicDateKey(nowMs),
    equation,
  };
}
