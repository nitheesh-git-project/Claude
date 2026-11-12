import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileKind } from "@/lib/outcomeMeasures";
import { resolveProfileWidgets, type ResolvedLayout, type WidgetChoicesRead } from "@/lib/profileWidgets";

// Reads of the clinic's Health Profile layout choices (profileWidgets.ts has
// the rules). Each its own call, in the outcomeServer.ts shape: a failed read
// is "unreadable" -- which the profile treats as "use the next layer" and the
// admin screen says as "we couldn't check" -- never "no choices". A database
// that has not got the table yet is the one honest empty list: nobody can
// have chosen anything there.
//
// Read with the service role after the page's own auth check (the tables'
// RLS is admin-read only), because the page -- not the browser -- decides
// what renders.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

function notMigrated(error: { code?: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205");
}

export type KindChoiceRow = { profileKind: ProfileKind; widgetKey: string; visible: boolean; setAt: string | null };
export type PatientOverrideRow = { widgetKey: string; visible: boolean; reason: string | null; setBy: string | null; setAt: string | null };

export async function loadKindChoices(
  client: AnyClient,
  kind?: ProfileKind
): Promise<{ status: "ok"; rows: KindChoiceRow[] } | { status: "unreadable" }> {
  try {
    let query = client.from("profile_widget_kind_settings").select("profile_kind, widget_key, visible, set_at");
    if (kind) query = query.eq("profile_kind", kind);
    const { data, error } = await query;
    if (notMigrated(error)) return { status: "ok", rows: [] };
    if (error) return { status: "unreadable" };
    return {
      status: "ok",
      rows: (data ?? []).map((r) => ({
        profileKind: r.profile_kind as ProfileKind,
        widgetKey: String(r.widget_key),
        visible: r.visible === true,
        setAt: typeof r.set_at === "string" ? r.set_at : null,
      })),
    };
  } catch {
    return { status: "unreadable" };
  }
}

export async function loadPatientOverrides(
  client: AnyClient,
  patientId: string
): Promise<{ status: "ok"; rows: PatientOverrideRow[] } | { status: "unreadable" }> {
  try {
    const { data, error } = await client
      .from("patient_profile_widget_overrides")
      .select("widget_key, visible, reason, set_by, set_at")
      .eq("patient_id", patientId);
    if (notMigrated(error)) return { status: "ok", rows: [] };
    if (error) return { status: "unreadable" };
    return {
      status: "ok",
      rows: (data ?? []).map((r) => ({
        widgetKey: String(r.widget_key),
        visible: r.visible === true,
        reason: typeof r.reason === "string" ? r.reason : null,
        setBy: typeof r.set_by === "string" ? r.set_by : null,
        setAt: typeof r.set_at === "string" ? r.set_at : null,
      })),
    };
  } catch {
    return { status: "unreadable" };
  }
}

function asChoices(read: { status: "ok"; rows: { widgetKey: string; visible: boolean }[] } | { status: "unreadable" }): WidgetChoicesRead {
  return read.status === "ok" ? { status: "ok", choices: read.rows.map((r) => ({ widgetKey: r.widgetKey, visible: r.visible })) } : { status: "unreadable" };
}

/** One patient's resolved layout, for the patient's page, the therapist's
 *  chart, the admin's record and the export. Both reads run together. */
export async function loadProfileLayout(client: AnyClient, patientId: string, kind: ProfileKind): Promise<ResolvedLayout> {
  const [kindRead, patientRead] = await Promise.all([loadKindChoices(client, kind), loadPatientOverrides(client, patientId)]);
  return resolveProfileWidgets({ kind, kindChoices: asChoices(kindRead), patientChoices: asChoices(patientRead) });
}

export { asChoices as widgetChoicesFromRead };
