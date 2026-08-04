export type AdminSettings = {
  sessionPackagesVisible: boolean;
  sessionTimeoutMinutes: number;
  googleMeetEnabled: boolean;
  joinWindowMinutes: number;
};

export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  sessionPackagesVisible: true,
  sessionTimeoutMinutes: 0,
  googleMeetEnabled: true,
  joinWindowMinutes: 15,
};

type SiteSettingsRow = {
  session_packages_visible?: boolean | null;
  session_timeout_minutes?: number | null;
  google_meet_enabled?: boolean | null;
  join_window_minutes?: number | null;
};

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
  };
}
