export type AdminSettings = {
  sessionPackagesVisible: boolean;
  sessionTimeoutMinutes: number;
  googleMeetEnabled: boolean;
  joinWindowMinutes: number;
  joinWindowAfterMinutes: number;
  bookingLanguages: string[];
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
};

type SiteSettingsRow = {
  session_packages_visible?: boolean | null;
  session_timeout_minutes?: number | null;
  google_meet_enabled?: boolean | null;
  join_window_minutes?: number | null;
  join_window_after_minutes?: number | null;
  booking_languages?: unknown;
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

// Turns the site_settings singleton row's Feature Control columns (see
// schema.sql's "Admin Feature Control" section) into a typed object,
// falling back to DEFAULT_ADMIN_SETTINGS when the row/columns are missing
// (e.g. the migration hasn't run yet). Every dashboard page calls this with
// its own regular (RLS-scoped) client -- site_settings is publicly
// readable -- so it degrades to defaults rather than erroring, matching
// this codebase's established migration-dependent-query convention.
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
  };
}
