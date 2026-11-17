import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllRows, readAllRowsByIds } from "@/lib/supabase/readAllRows";
import { toPromoClaim, type PromoClaim, type PromoClaimKind, type RawPromoClaimRow } from "@/lib/promoClaims";

type Code = { id: string; code: string; description: string | null };

/**
 * Every claim of these codes, across the three tables a code can land on,
 * with who, for what, how much off, and whether it was paid. Null when any
 * read failed: "could not be loaded" is a different answer from "nobody has
 * claimed one", and the list says which (promoClaims.ts for the shaping).
 */
export async function readPromoClaims(admin: SupabaseClient, codes: Code[]): Promise<PromoClaim[] | null> {
  if (codes.length === 0) return [];
  const codeIds = codes.map((c) => c.id);
  const [appointments, programmes, visits] = await Promise.all([
    readAllRows<Record<string, unknown>>(() =>
      admin
        .from("appointments")
        .select("id, promo_code_id, patient_id, promo_claimed_at, created_at, discount_paise, payment_status, status, category_id")
        .in("promo_code_id", codeIds)
        .order("id")
    ),
    readAllRows<Record<string, unknown>>(() =>
      admin
        .from("patient_package_purchases")
        .select("id, promo_code_id, patient_id, promo_claimed_at, created_at, discount_paise, payment_status, package_id")
        .in("promo_code_id", codeIds)
        .order("id")
    ),
    readAllRows<Record<string, unknown>>(() =>
      admin
        .from("home_visit_package_purchases")
        .select("id, promo_code_id, patient_id, promo_claimed_at, created_at, discount_paise, payment_status, status, package_id")
        .in("promo_code_id", codeIds)
        .order("id")
    ),
  ]);
  if (appointments.error || programmes.error || visits.error) return null;

  const ids = (rows: Record<string, unknown>[], key: string) =>
    [...new Set(rows.map((r) => r[key]).filter((v): v is string => typeof v === "string"))];
  const patientIds = [...new Set([...ids(appointments.rows, "patient_id"), ...ids(programmes.rows, "patient_id"), ...ids(visits.rows, "patient_id")])];
  const [people, codesOfPeople, categories, packages, visitPackages] = await Promise.all([
    readAllRowsByIds<{ id: string; full_name: string | null }>(patientIds, (chunk) =>
      admin.from("profiles").select("id, full_name").in("id", chunk)
    ),
    // patient_code is migration-dependent: its own read, and a failure only
    // drops the ID chip.
    readAllRowsByIds<{ id: string; patient_code: string | null }>(patientIds, (chunk) =>
      admin.from("profiles").select("id, patient_code").in("id", chunk)
    ),
    readAllRowsByIds<{ id: string; title: string | null }>(ids(appointments.rows, "category_id"), (chunk) =>
      admin.from("treatment_categories").select("id, title").in("id", chunk)
    ),
    readAllRowsByIds<{ id: string; title: string | null }>(ids(programmes.rows, "package_id"), (chunk) =>
      admin.from("treatment_category_packages").select("id, title").in("id", chunk)
    ),
    readAllRowsByIds<{ id: string; title: string | null }>(ids(visits.rows, "package_id"), (chunk) =>
      admin.from("home_visit_packages").select("id, title").in("id", chunk)
    ),
  ]);
  if (people.error) return null;

  const codeOf = new Map((codesOfPeople.error ? [] : codesOfPeople.rows).map((r) => [r.id, r.patient_code]));
  const lookups = {
    codes: new Map(codes.map((c) => [c.id, { code: c.code, description: c.description }])),
    people: new Map(people.rows.map((p) => [p.id, { name: p.full_name, patientCode: codeOf.get(p.id) ?? null }])),
  };
  const titleOf = (list: { rows: { id: string; title: string | null }[]; error: unknown }) =>
    new Map((list.error ? [] : list.rows).map((r) => [r.id, r.title]));
  const categoryTitle = titleOf(categories);
  const packageTitle = titleOf(packages);
  const visitTitle = titleOf(visits.rows.length ? visitPackages : { rows: [], error: null });

  const shape = (kind: PromoClaimKind, rows: Record<string, unknown>[], title: (r: Record<string, unknown>) => string | null) =>
    rows
      .map((r) =>
        toPromoClaim(kind, { ...(r as unknown as RawPromoClaimRow), title: title(r) }, lookups)
      )
      .filter((c): c is PromoClaim => c !== null);

  return [
    ...shape("session", appointments.rows, (r) => categoryTitle.get(r.category_id as string) ?? null),
    ...shape("programme", programmes.rows, (r) => packageTitle.get(r.package_id as string) ?? null),
    ...shape("home_visit_programme", visits.rows, (r) => visitTitle.get(r.package_id as string) ?? null),
  ];
}
