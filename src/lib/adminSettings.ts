export type AdminSettings = {
  sessionPackagesVisible: boolean;
  sessionTimeoutMinutes: number;
  googleMeetEnabled: boolean;
  joinWindowMinutes: number;
  joinWindowAfterMinutes: number;
  bookingLanguages: string[];
  packageDefaultValidityDays: number;
  packageTherapistLockEnabled: boolean;
  packageBulkScheduleMax: number;
  packageExpiryReminderDays: number;
};

// The sole hardcoded language in the app, and only as the fallback for an
// unconfigured/emptied list -- the real list is admin-managed in Feature
// Control → Booking Languages. Booking must never present an empty language
// picker, so an empty stored list degrades to this rather than to nothing.
export const DEFAULT_BOOKING_LANGUAGES = ["English"];

export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  sessionPackagesVisible: true,
  sessionTimeoutMinutes: 0,
  googleMeetEnabled: true,
  joinWindowMinutes: 15,
  joinWindowAfterMinutes: 15,
  bookingLanguages: DEFAULT_BOOKING_LANGUAGES,
  packageDefaultValidityDays: 90,
  packageTherapistLockEnabled: true,
  packageBulkScheduleMax: 8,
  packageExpiryReminderDays: 14,
};

// The one column list every dashboard page selects from the site_settings
// singleton before calling parseAdminSettings() below. Used to live
// copy-pasted (and slightly drifted) across seven pages -- admin, patient
// x2, therapist x2, hospital x2 -- so a new Feature Control / Session
// Manager setting silently read as its default on whichever page's copy
// forgot to list it. Every one of those pages now imports this constant
// instead. Selecting a couple of columns a given page doesn't render
// (e.g. booking_languages on the therapist dashboard) is a non-issue --
// site_settings is a single-row table, so the extra columns cost nothing
// worth special-casing per page.
// A single literal (no string concatenation) matters here, not just style:
// supabase-js parses a select string's *literal* type to infer the
// returned row shape, and the `+` operator's return type is always the
// widened `string` even when both operands are literals -- concatenating
// pieces (or .join()-ing an array) would make every
// .select(SITE_SETTINGS_SELECT) call fall back to an unusable
// GenericStringError result type instead of a real row shape.
export const SITE_SETTINGS_SELECT =
  "session_packages_visible, session_timeout_minutes, google_meet_enabled, join_window_minutes, join_window_after_minutes, booking_languages, package_default_validity_days, package_therapist_lock_enabled, package_bulk_schedule_max, package_expiry_reminder_days";

type SiteSettingsRow = {
  session_packages_visible?: boolean | null;
  session_timeout_minutes?: number | null;
  google_meet_enabled?: boolean | null;
  join_window_minutes?: number | null;
  join_window_after_minutes?: number | null;
  booking_languages?: unknown;
  package_default_validity_days?: number | null;
  package_therapist_lock_enabled?: boolean | null;
  package_bulk_schedule_max?: number | null;
  package_expiry_reminder_days?: number | null;
};

// Normalizes the stored jsonb array: drops non-strings and blanks, trims,
// and de-duplicates case-insensitively so admin can't create two chips that
// look identical to a patient. Any shape that isn't a usable list falls
// back to DEFAULT_BOOKING_LANGUAGES.
export function parseBookingLanguages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return DEFAULT_BOOKING_LANGUAGES;
  const seen = new Set<string>();
  const languages: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    languages.push(trimmed);
  }
  return languages.length > 0 ? languages : DEFAULT_BOOKING_LANGUAGES;
}

// Turns the site_settings singleton row's Feature Control / Session
// Manager columns (see schema.sql's "Admin Feature Control" and "Session
// Packages v2" sections) into a typed object, falling back to
// DEFAULT_ADMIN_SETTINGS when the row/columns are missing (e.g. the
// migration hasn't run yet). Every dashboard page calls this with its own
// regular (RLS-scoped) client -- site_settings is publicly readable -- so
// it degrades to defaults rather than erroring, matching this codebase's
// established migration-dependent-query convention.
export function parseAdminSettings(row: SiteSettingsRow | null | undefined): AdminSettings {
  return {
    sessionPackagesVisible:
      typeof row?.session_packages_visible === "boolean"
        ? row.session_packages_visible
        : DEFAULT_ADMIN_SETTINGS.sessionPackagesVisible,
    sessionTimeoutMinutes:
      typeof row?.session_timeout_minutes === "number"
        ? row.session_timeout_minutes
        : DEFAULT_ADMIN_SETTINGS.sessionTimeoutMinutes,
    googleMeetEnabled:
      typeof row?.google_meet_enabled === "boolean"
        ? row.google_meet_enabled
        : DEFAULT_ADMIN_SETTINGS.googleMeetEnabled,
    joinWindowMinutes:
      typeof row?.join_window_minutes === "number"
        ? row.join_window_minutes
        : DEFAULT_ADMIN_SETTINGS.joinWindowMinutes,
    joinWindowAfterMinutes:
      typeof row?.join_window_after_minutes === "number"
        ? row.join_window_after_minutes
        : DEFAULT_ADMIN_SETTINGS.joinWindowAfterMinutes,
    bookingLanguages: parseBookingLanguages(row?.booking_languages),
    packageDefaultValidityDays:
      typeof row?.package_default_validity_days === "number"
        ? row.package_default_validity_days
        : DEFAULT_ADMIN_SETTINGS.packageDefaultValidityDays,
    packageTherapistLockEnabled:
      typeof row?.package_therapist_lock_enabled === "boolean"
        ? row.package_therapist_lock_enabled
        : DEFAULT_ADMIN_SETTINGS.packageTherapistLockEnabled,
    packageBulkScheduleMax:
      typeof row?.package_bulk_schedule_max === "number"
        ? row.package_bulk_schedule_max
        : DEFAULT_ADMIN_SETTINGS.packageBulkScheduleMax,
    packageExpiryReminderDays:
      typeof row?.package_expiry_reminder_days === "number"
        ? row.package_expiry_reminder_days
        : DEFAULT_ADMIN_SETTINGS.packageExpiryReminderDays,
  };
}
