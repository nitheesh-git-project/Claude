import { isValidStoredPhone } from "@/lib/phoneNumber";
import { specialtyDef, MAX_SPECIALTY_LENGTH } from "@/lib/therapistSpecialties";

/**
 * What a gated profile change may set, value by value.
 *
 * A change request is written by the person it describes, straight into
 * `profile_change_requests` through their own token, so its `changes` jsonb
 * is whatever they chose to send. The approve route checked field *names*
 * against `GATED_PROFILE_FIELDS` and then wrote the values as they were --
 * so a crafted request could put negative or absurd experience, an
 * unbounded credentials string, a specialty no screen knows, an empty name
 * or a malformed phone number in front of an admin, one click from live.
 *
 * Returns the normalised values to write, or the first problem in words an
 * admin can act on. Dependency-free so every rule is unit-tested.
 */
export const GENDER_OPTIONS = ["Female", "Male", "Other", "Prefer not to say"] as const;
export const MAX_NAME_LENGTH = 100;
export const MAX_ORGANIZATION_LENGTH = 150;
export const MAX_CREDENTIALS_LENGTH = 300;
export const MAX_YEARS_EXPERIENCE = 60;

export type ProfileChangeVerdict =
  | { ok: true; values: Record<string, string | number | null> }
  | { ok: false; error: string };

export function validateProfileChanges(
  changes: Record<string, unknown>,
  nowMs: number = Date.now()
): ProfileChangeVerdict {
  const values: Record<string, string | number | null> = {};
  for (const [field, raw] of Object.entries(changes)) {
    const verdict = validateField(field, raw, nowMs);
    if (!verdict.ok) return verdict;
    values[field] = verdict.value;
  }
  return { ok: true, values };
}

function text(raw: unknown): string | null {
  return typeof raw === "string" ? raw.trim() : null;
}

function validateField(
  field: string,
  raw: unknown,
  nowMs: number
): { ok: true; value: string | number | null } | { ok: false; error: string } {
  switch (field) {
    case "full_name": {
      const v = text(raw);
      if (!v || v.length < 2) return { ok: false, error: "The new name is empty or too short." };
      if (v.length > MAX_NAME_LENGTH) return { ok: false, error: "The new name is too long." };
      return { ok: true, value: v };
    }
    case "organization_name": {
      const v = text(raw);
      if (!v || v.length < 2) return { ok: false, error: "The new organisation name is empty or too short." };
      if (v.length > MAX_ORGANIZATION_LENGTH) return { ok: false, error: "The new organisation name is too long." };
      return { ok: true, value: v };
    }
    case "phone": {
      const v = text(raw);
      if (!v || !isValidStoredPhone(v)) return { ok: false, error: "The new phone number isn't a valid number." };
      return { ok: true, value: v };
    }
    case "credentials": {
      if (raw === null) return { ok: true, value: null };
      const v = text(raw);
      if (v === null) return { ok: false, error: "The new credentials aren't text." };
      if (v.length > MAX_CREDENTIALS_LENGTH) return { ok: false, error: "The new credentials are too long." };
      return { ok: true, value: v || null };
    }
    case "specialization": {
      if (raw === null) return { ok: true, value: null };
      const v = text(raw);
      if (v === null) return { ok: false, error: "The new specialty isn't text." };
      if (!v) return { ok: true, value: null };
      // Only a specialty the product knows: it decides which patients a
      // therapist is matched to and is printed on every public profile.
      const def = specialtyDef(v);
      if (!def) return { ok: false, error: "The new specialty isn't one the clinic offers." };
      return { ok: true, value: def.label.slice(0, MAX_SPECIALTY_LENGTH) };
    }
    case "years_experience": {
      // Clearing the figure is allowed; a figure that is set must be real.
      if (raw === null || (typeof raw === "string" && !raw.trim())) return { ok: true, value: null };
      const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
      if (!Number.isInteger(n) || n < 0 || n > MAX_YEARS_EXPERIENCE) {
        return { ok: false, error: `Years of experience must be a whole number from 0 to ${MAX_YEARS_EXPERIENCE}.` };
      }
      return { ok: true, value: n };
    }
    case "date_of_birth": {
      const v = text(raw);
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, error: "The new date of birth isn't a valid date." };
      const ms = Date.parse(`${v}T00:00:00Z`);
      if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== v) {
        return { ok: false, error: "The new date of birth isn't a valid date." };
      }
      if (ms > nowMs) return { ok: false, error: "The new date of birth is in the future." };
      if (nowMs - ms > 120 * 365.25 * 86_400_000) return { ok: false, error: "The new date of birth is too far in the past." };
      return { ok: true, value: v };
    }
    case "gender": {
      const v = text(raw);
      if (!v || !(GENDER_OPTIONS as readonly string[]).includes(v)) {
        return { ok: false, error: "The new gender isn't one of the options offered." };
      }
      return { ok: true, value: v };
    }
    default:
      return { ok: false, error: "This request contains fields that can't be applied." };
  }
}
