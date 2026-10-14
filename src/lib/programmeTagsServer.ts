// The programme ID of each purchase a dashboard already holds.
//
// `programme_code` is a new column (schema.sql, "Programme IDs"), so it is
// read in its own call, by id, and a failure is an empty map: the patient's
// and therapist's screens then show the old SP/HS code they always did,
// rather than losing the programme card. The ids passed in come from rows
// the caller already read under its own access rules, which is why the
// service-role client is fine here.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllRowsByIds } from "@/lib/supabase/readAllRows";
import { programmeTag, type ProgrammeTag } from "@/lib/programmeId";

export async function readProgrammeCodes(
  client: SupabaseClient,
  ids: { packages?: readonly string[]; homeVisits?: readonly string[] }
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const read = async (table: "patient_package_purchases" | "home_visit_package_purchases", list: readonly string[]) => {
    if (list.length === 0) return;
    try {
      const { rows, error } = await readAllRowsByIds<{ id: string; programme_code: string | null }>([...new Set(list)], (chunk) =>
        client.from(table).select("id, programme_code").in("id", chunk).order("id")
      );
      if (error) return;
      for (const r of rows) if (r.programme_code) out.set(r.id, r.programme_code);
    } catch {
      // The old code stands in; nothing else is lost.
    }
  };
  await Promise.all([read("patient_package_purchases", ids.packages ?? []), read("home_visit_package_purchases", ids.homeVisits ?? [])]);
  return out;
}

/** Tags for purchases, from their codes and the done/total each screen counts. */
export function tagsForPurchases(
  codes: Map<string, string>,
  purchases: readonly { id: string; legacyCode: string | null; done: number; total: number }[]
): Map<string, ProgrammeTag> {
  const out = new Map<string, ProgrammeTag>();
  for (const p of purchases) {
    const tag = programmeTag({ programmeCode: codes.get(p.id) ?? null, legacyCode: p.legacyCode, done: p.done, total: p.total });
    if (tag) out.set(p.id, tag);
  }
  return out;
}

/**
 * Tags for purchases a screen knows only by id -- the therapist's session
 * cards, where the programme's own row and its other sessions (run by
 * somebody else, perhaps) are not loaded. Reads each purchase's ID, size and
 * old code, and how many of its sessions are done across every therapist,
 * so "-2/6" means the programme's progress rather than this therapist's
 * share of it. Every read is tolerant: a failure costs the tag, never the
 * caller's screen.
 */
export async function loadProgrammeTags(
  admin: SupabaseClient,
  ids: { packages?: readonly string[]; homeVisits?: readonly string[] }
): Promise<Map<string, ProgrammeTag>> {
  const packages = [...new Set(ids.packages ?? [])];
  const homeVisits = [...new Set(ids.homeVisits ?? [])];
  const out = new Map<string, ProgrammeTag>();
  if (packages.length === 0 && homeVisits.length === 0) return out;
  try {
    const [codes, pkgRows, visitRows, pkgDone, visitDone] = await Promise.all([
      readProgrammeCodes(admin, { packages, homeVisits }),
      packages.length
        ? readAllRowsByIds<{ id: string; purchase_code: string | null; session_count: number }>(packages, (chunk) =>
            admin.from("patient_package_purchases").select("id, purchase_code, session_count").in("id", chunk).order("id")
          )
        : Promise.resolve({ rows: [], truncated: false, error: null }),
      homeVisits.length
        ? readAllRowsByIds<{ id: string; purchase_code: string | null; visit_count: number }>(homeVisits, (chunk) =>
            admin.from("home_visit_package_purchases").select("id, purchase_code, visit_count").in("id", chunk).order("id")
          )
        : Promise.resolve({ rows: [], truncated: false, error: null }),
      packages.length
        ? readAllRowsByIds<{ id: string; package_purchase_id: string | null }>(packages, (chunk) =>
            admin
              .from("appointments")
              .select("id, package_purchase_id")
              .in("package_purchase_id", chunk)
              .eq("status", "completed")
              .order("id")
          )
        : Promise.resolve({ rows: [], truncated: false, error: null }),
      homeVisits.length
        ? readAllRowsByIds<{ id: string; home_visit_purchase_id: string | null }>(homeVisits, (chunk) =>
            admin
              .from("appointments")
              .select("id, home_visit_purchase_id")
              .in("home_visit_purchase_id", chunk)
              .eq("status", "completed")
              .order("id")
          )
        : Promise.resolve({ rows: [], truncated: false, error: null }),
    ]);
    const done = new Map<string, number>();
    for (const r of pkgDone.rows) if (r.package_purchase_id) done.set(r.package_purchase_id, (done.get(r.package_purchase_id) ?? 0) + 1);
    for (const r of visitDone.rows) if (r.home_visit_purchase_id) done.set(r.home_visit_purchase_id, (done.get(r.home_visit_purchase_id) ?? 0) + 1);
    const tags = tagsForPurchases(codes, [
      ...pkgRows.rows.map((p) => ({ id: p.id, legacyCode: p.purchase_code, done: done.get(p.id) ?? 0, total: p.session_count })),
      ...visitRows.rows
        .filter((p) => p.visit_count >= 2 || codes.has(p.id))
        .map((p) => ({ id: p.id, legacyCode: p.purchase_code, done: done.get(p.id) ?? 0, total: p.visit_count })),
    ]);
    return tags;
  } catch {
    return out;
  }
}

export type PersonProgramme = {
  purchaseId: string;
  kind: "package" | "home_visit";
  tag: ProgrammeTag;
  status: string;
  createdAt: string;
};

/**
 * One patient's programmes and which of their sessions belong to which, for
 * the admin's patient page. Owned purchases only (paid, or agreed at the
 * door): an abandoned checkout is not a programme. Tolerant throughout.
 */
export async function loadPatientProgrammes(
  admin: SupabaseClient,
  patientId: string
): Promise<{ programmes: PersonProgramme[]; tagByAppointment: Record<string, ProgrammeTag> }> {
  const empty = { programmes: [] as PersonProgramme[], tagByAppointment: {} as Record<string, ProgrammeTag> };
  try {
    const [{ data: pkgs }, { data: visits }, { data: sessions }] = await Promise.all([
      admin
        .from("patient_package_purchases")
        .select("id, status, payment_status, created_at")
        .eq("patient_id", patientId),
      admin
        .from("home_visit_package_purchases")
        .select("id, status, payment_status, payment_mode, visit_count, created_at")
        .eq("patient_id", patientId),
      admin
        .from("appointments")
        .select("id, package_purchase_id, home_visit_purchase_id")
        .eq("patient_id", patientId)
        .or("package_purchase_id.not.is.null,home_visit_purchase_id.not.is.null"),
    ]);
    const ownedPkgs = (pkgs ?? []).filter((p) => p.payment_status === "paid");
    const ownedVisits = (visits ?? []).filter(
      (v) =>
        (v.payment_status === "paid" || (v.payment_mode === "cash_on_visit" && v.payment_status !== "failed")) &&
        (v.visit_count ?? 0) >= 2
    );
    const tags = await loadProgrammeTags(admin, {
      packages: ownedPkgs.map((p) => p.id as string),
      homeVisits: ownedVisits.map((v) => v.id as string),
    });
    const programmes: PersonProgramme[] = [
      ...ownedPkgs.map((p) => ({ row: p, kind: "package" as const })),
      ...ownedVisits.map((v) => ({ row: v, kind: "home_visit" as const })),
    ]
      .filter(({ row }) => tags.has(row.id as string))
      .map(({ row, kind }) => ({
        purchaseId: row.id as string,
        kind,
        tag: tags.get(row.id as string)!,
        status: (row.status as string | null) ?? "active",
        createdAt: row.created_at as string,
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const tagByAppointment: Record<string, ProgrammeTag> = {};
    for (const s of sessions ?? []) {
      const purchaseId = (s.package_purchase_id ?? s.home_visit_purchase_id) as string | null;
      const tag = purchaseId ? tags.get(purchaseId) : undefined;
      if (tag) tagByAppointment[s.id as string] = tag;
    }
    return { programmes, tagByAppointment };
  } catch {
    return empty;
  }
}

/** The programme of each of these sessions, for a list that holds only the
 *  sessions (a therapist's page). Tolerant: a failure is an empty map. */
export async function loadProgrammeTagsForAppointments(
  admin: SupabaseClient,
  appointmentIds: readonly string[]
): Promise<Record<string, ProgrammeTag>> {
  const out: Record<string, ProgrammeTag> = {};
  const ids = [...new Set(appointmentIds)];
  if (ids.length === 0) return out;
  try {
    const { rows, error } = await readAllRowsByIds<{
      id: string;
      package_purchase_id: string | null;
      home_visit_purchase_id: string | null;
    }>(ids, (chunk) =>
      admin
        .from("appointments")
        .select("id, package_purchase_id, home_visit_purchase_id")
        .in("id", chunk)
        .or("package_purchase_id.not.is.null,home_visit_purchase_id.not.is.null")
        .order("id")
    );
    if (error) return out;
    const tags = await loadProgrammeTags(admin, {
      packages: rows.map((r) => r.package_purchase_id).filter((x): x is string => !!x),
      homeVisits: rows.map((r) => r.home_visit_purchase_id).filter((x): x is string => !!x),
    });
    for (const r of rows) {
      const tag = tags.get((r.package_purchase_id ?? r.home_visit_purchase_id) as string);
      if (tag) out[r.id] = tag;
    }
  } catch {
    // The rows keep their session codes; only the tag is lost.
  }
  return out;
}
