import { DEFAULT_PAYMENT_GATEWAY_FEE_PERCENT } from "@/lib/operatingCosts";
import {
  DEFAULT_SPLASH_HOLD_SECONDS,
  DEFAULT_SPLASH_PHRASE,
  DEFAULT_SPLASH_REVISIT_MINUTES,
} from "@/lib/splashScreen";
export type AdminSettings = {
  sessionPackagesVisible: boolean;
  sessionTimeoutMinutes: number;
  /** Seconds the post-logout banner stays up. 0 = until dismissed. */
  farewellBannerSeconds: number;
  googleMeetEnabled: boolean;
  joinWindowMinutes: number;
  joinWindowAfterMinutes: number;
  // The longer boundary the join control reads: how many minutes after a
  // session's scheduled start it stops offering a call and says "Session
  // Completed" instead. Not the same thing as joinWindowAfterMinutes, which
  // is the short grace period for a late arrival.
  sessionCompletedAfterMinutes: number;
  bookingLanguages: string[];
  packageDefaultValidityDays: number;
  packageTherapistLockEnabled: boolean;
  packageBulkScheduleMax: number;
  packageExpiryReminderDays: number;
  siteName: string;
  siteTagline: string;
  siteDescription: string;
  contactEmail: string;
  whatsappNumber: string;
  contactPhone: string;
  footerCopyrightText: string;
  homeVisitEnabled: boolean;
  homeVisitCashEnabled: boolean;
  homeVisitLeadTimeHours: number;
  homeVisitCancellationRefundHours: number;
  homeVisitDefaultValidityDays: number;
  homeVisitBulkScheduleMax: number;
  homeVisitTravelBufferMinutes: number;
  homeVisitPageHeading: string;
  homeVisitPageSubheading: string;
  // The online equivalents of the two home-visit rules above. They used to
  // be constants in bookingSlots.ts / pricing.ts while the home-visit ones
  // were already settings -- the same decision at two different levels of
  // control, so changing the online refund window needed a deploy. The
  // constants remain as the defaults here, so nothing moves until an admin
  // edits them.
  onlineBookingLeadTimeHours: number;
  onlineCancellationRefundHours: number;
  /** Payment-gateway cut of everything collected online, as a percentage.
   *  Drives the automatic cost line on the Money screens. */
  paymentGatewayFeePercent: number;
  // How long each step of the home page's "Booking to recovery" walkthrough
  // holds before the next one takes over. 0 means it doesn't advance on its
  // own -- same "0 is off" convention as sessionTimeoutMinutes.
  journeyStepSeconds: number;
  // The opening splash: whether it runs at all, the line it says, how long
  // it holds, and how long a tab must sit in the background before coming
  // back to it earns a second greeting. 0 minutes means "first load only" --
  // there is deliberately no way to configure "every time the tab is
  // focused", see splashScreen.ts.
  splashEnabled: boolean;
  splashPhrase: string;
  splashHoldSeconds: number;
  splashRevisitMinutes: number;
};

// The sole hardcoded language in the app, and only as the fallback for an
// unconfigured/emptied list -- the real list is admin-managed in Feature
// Control → Booking Languages. Booking must never present an empty language
// picker, so an empty stored list degrades to this rather than to nothing.
export const DEFAULT_BOOKING_LANGUAGES = ["English"];

// Brand & Contact Details' defaults -- the literal strings the Navbar,
// Footer, and checkout previously hardcoded, kept here as the fallback for
// a database that hasn't run the migration adding these columns yet.
export const DEFAULT_SITE_NAME = "Dr. Pooja's Physio";
export const DEFAULT_SITE_TAGLINE = "Global Telehealth Platform";
export const DEFAULT_SITE_DESCRIPTION =
  "Certified global telehealth physical therapy practice, restoring mobility from home.";
export const DEFAULT_CONTACT_EMAIL = "hello@drpoojaphysio.com";
export const DEFAULT_WHATSAPP_NUMBER = "+91 XXXXX XXXXX";
export const DEFAULT_CONTACT_PHONE = "+91 XXXXX XXXXX";
export const DEFAULT_FOOTER_COPYRIGHT_TEXT = "Dr. Pooja's Physio. All rights reserved.";

// Home Visit's own defaults. The master switch is OFF: this feature needs
// service areas and a package catalogue configured before it means
// anything, so a database that has merely run the migration must not
// suddenly start advertising home visits it cannot staff.
export const DEFAULT_HOME_VISIT_PAGE_HEADING = "Physiotherapy at your doorstep";
export const DEFAULT_HOME_VISIT_PAGE_SUBHEADING =
  "A certified physiotherapist visits you at home, with the same assessment and recovery plan you would get in clinic.";

export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  sessionPackagesVisible: true,
  sessionTimeoutMinutes: 0,
  // Long enough to read a one-line goodbye, short enough that the next
  // person on a shared machine never sees it.
  farewellBannerSeconds: 6,
  googleMeetEnabled: true,
  joinWindowMinutes: 15,
  joinWindowAfterMinutes: 15,
  sessionCompletedAfterMinutes: 60,
  bookingLanguages: DEFAULT_BOOKING_LANGUAGES,
  packageDefaultValidityDays: 90,
  packageTherapistLockEnabled: true,
  packageBulkScheduleMax: 8,
  packageExpiryReminderDays: 14,
  siteName: DEFAULT_SITE_NAME,
  siteTagline: DEFAULT_SITE_TAGLINE,
  siteDescription: DEFAULT_SITE_DESCRIPTION,
  contactEmail: DEFAULT_CONTACT_EMAIL,
  whatsappNumber: DEFAULT_WHATSAPP_NUMBER,
  contactPhone: DEFAULT_CONTACT_PHONE,
  footerCopyrightText: DEFAULT_FOOTER_COPYRIGHT_TEXT,
  homeVisitEnabled: false,
  homeVisitCashEnabled: true,
  // Deliberately longer than BOOKING_LEAD_TIME_HOURS (12) in
  // src/lib/bookingSlots.ts: an online session only needs a therapist to be
  // free, a home visit needs one who can physically get to the address.
  homeVisitLeadTimeHours: 24,
  homeVisitCancellationRefundHours: 24,
  homeVisitDefaultValidityDays: 90,
  homeVisitBulkScheduleMax: 8,
  homeVisitTravelBufferMinutes: 45,
  homeVisitPageHeading: DEFAULT_HOME_VISIT_PAGE_HEADING,
  homeVisitPageSubheading: DEFAULT_HOME_VISIT_PAGE_SUBHEADING,
  // Must stay equal to BOOKING_LEAD_TIME_HOURS and
  // CANCELLATION_FULL_REFUND_HOURS in bookingSlots.ts / pricing.ts -- those
  // constants are still the fallback for every caller that has no settings
  // row to hand, so a mismatch here would make the same rule resolve two
  // different ways depending on which path asked.
  onlineBookingLeadTimeHours: 12,
  onlineCancellationRefundHours: 24,
  paymentGatewayFeePercent: DEFAULT_PAYMENT_GATEWAY_FEE_PERCENT,
  journeyStepSeconds: 4,
  splashEnabled: true,
  splashPhrase: DEFAULT_SPLASH_PHRASE,
  splashHoldSeconds: DEFAULT_SPLASH_HOLD_SECONDS,
  splashRevisitMinutes: DEFAULT_SPLASH_REVISIT_MINUTES,
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
  "session_packages_visible, session_timeout_minutes, google_meet_enabled, join_window_minutes, join_window_after_minutes, session_completed_after_minutes, booking_languages, package_default_validity_days, package_therapist_lock_enabled, package_bulk_schedule_max, package_expiry_reminder_days, site_name, site_tagline, site_description, contact_email, whatsapp_number, contact_phone, footer_copyright_text, home_visit_enabled, home_visit_cash_enabled, home_visit_lead_time_hours, home_visit_cancellation_refund_hours, home_visit_default_validity_days, home_visit_bulk_schedule_max, home_visit_travel_buffer_minutes, home_visit_page_heading, home_visit_page_subheading, online_booking_lead_time_hours, online_cancellation_refund_hours, payment_gateway_fee_percent, farewell_banner_seconds, journey_step_seconds, splash_enabled, splash_phrase, splash_hold_seconds, splash_revisit_minutes";

type SiteSettingsRow = {
  session_packages_visible?: boolean | null;
  session_timeout_minutes?: number | null;
  google_meet_enabled?: boolean | null;
  join_window_minutes?: number | null;
  join_window_after_minutes?: number | null;
  session_completed_after_minutes?: number | null;
  booking_languages?: unknown;
  package_default_validity_days?: number | null;
  package_therapist_lock_enabled?: boolean | null;
  package_bulk_schedule_max?: number | null;
  package_expiry_reminder_days?: number | null;
  home_visit_enabled?: boolean | null;
  home_visit_cash_enabled?: boolean | null;
  home_visit_lead_time_hours?: number | null;
  home_visit_cancellation_refund_hours?: number | null;
  home_visit_default_validity_days?: number | null;
  home_visit_bulk_schedule_max?: number | null;
  home_visit_travel_buffer_minutes?: number | null;
  payment_gateway_fee_percent?: number | null;
  home_visit_page_heading?: string | null;
  home_visit_page_subheading?: string | null;
  online_booking_lead_time_hours?: number | null;
  online_cancellation_refund_hours?: number | null;
  farewell_banner_seconds?: number | null;
  journey_step_seconds?: number | null;
  splash_enabled?: boolean | null;
  splash_phrase?: string | null;
  splash_hold_seconds?: number | null;
  splash_revisit_minutes?: number | null;
  site_name?: string | null;
  site_tagline?: string | null;
  site_description?: string | null;
  contact_email?: string | null;
  whatsapp_number?: string | null;
  contact_phone?: string | null;
  footer_copyright_text?: string | null;
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

// A stored-but-blank string (e.g. a field an admin cleared and never
// re-filled) should still fall back to the default rather than rendering an
// empty brand name in the Navbar/Footer -- unlike the numeric/boolean
// settings above, `typeof === "string"` alone would accept "".
function stringOrDefault(value: string | null | undefined, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
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
    farewellBannerSeconds:
      typeof row?.farewell_banner_seconds === "number"
        ? row.farewell_banner_seconds
        : DEFAULT_ADMIN_SETTINGS.farewellBannerSeconds,
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
    sessionCompletedAfterMinutes:
      typeof row?.session_completed_after_minutes === "number"
        ? row.session_completed_after_minutes
        : DEFAULT_ADMIN_SETTINGS.sessionCompletedAfterMinutes,
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
    siteName: stringOrDefault(row?.site_name, DEFAULT_SITE_NAME),
    siteTagline: stringOrDefault(row?.site_tagline, DEFAULT_SITE_TAGLINE),
    siteDescription: stringOrDefault(row?.site_description, DEFAULT_SITE_DESCRIPTION),
    contactEmail: stringOrDefault(row?.contact_email, DEFAULT_CONTACT_EMAIL),
    whatsappNumber: stringOrDefault(row?.whatsapp_number, DEFAULT_WHATSAPP_NUMBER),
    contactPhone: stringOrDefault(row?.contact_phone, DEFAULT_CONTACT_PHONE),
    footerCopyrightText: stringOrDefault(row?.footer_copyright_text, DEFAULT_FOOTER_COPYRIGHT_TEXT),
    homeVisitEnabled:
      typeof row?.home_visit_enabled === "boolean"
        ? row.home_visit_enabled
        : DEFAULT_ADMIN_SETTINGS.homeVisitEnabled,
    homeVisitCashEnabled:
      typeof row?.home_visit_cash_enabled === "boolean"
        ? row.home_visit_cash_enabled
        : DEFAULT_ADMIN_SETTINGS.homeVisitCashEnabled,
    homeVisitLeadTimeHours:
      typeof row?.home_visit_lead_time_hours === "number"
        ? row.home_visit_lead_time_hours
        : DEFAULT_ADMIN_SETTINGS.homeVisitLeadTimeHours,
    homeVisitCancellationRefundHours:
      typeof row?.home_visit_cancellation_refund_hours === "number"
        ? row.home_visit_cancellation_refund_hours
        : DEFAULT_ADMIN_SETTINGS.homeVisitCancellationRefundHours,
    homeVisitDefaultValidityDays:
      typeof row?.home_visit_default_validity_days === "number"
        ? row.home_visit_default_validity_days
        : DEFAULT_ADMIN_SETTINGS.homeVisitDefaultValidityDays,
    homeVisitBulkScheduleMax:
      typeof row?.home_visit_bulk_schedule_max === "number"
        ? row.home_visit_bulk_schedule_max
        : DEFAULT_ADMIN_SETTINGS.homeVisitBulkScheduleMax,
    homeVisitTravelBufferMinutes:
      typeof row?.home_visit_travel_buffer_minutes === "number"
        ? row.home_visit_travel_buffer_minutes
        : DEFAULT_ADMIN_SETTINGS.homeVisitTravelBufferMinutes,
    homeVisitPageHeading: stringOrDefault(
      row?.home_visit_page_heading,
      DEFAULT_HOME_VISIT_PAGE_HEADING
    ),
    homeVisitPageSubheading: stringOrDefault(
      row?.home_visit_page_subheading,
      DEFAULT_HOME_VISIT_PAGE_SUBHEADING
    ),
    onlineBookingLeadTimeHours:
      typeof row?.online_booking_lead_time_hours === "number"
        ? row.online_booking_lead_time_hours
        : DEFAULT_ADMIN_SETTINGS.onlineBookingLeadTimeHours,
    onlineCancellationRefundHours:
      typeof row?.online_cancellation_refund_hours === "number"
        ? row.online_cancellation_refund_hours
        : DEFAULT_ADMIN_SETTINGS.onlineCancellationRefundHours,
    // A fee of exactly 0 is a real answer (a clinic on a zero-fee plan), so
    // this checks the type rather than truthiness -- `|| default` would
    // silently overwrite a deliberate zero with 2%.
    paymentGatewayFeePercent:
      typeof row?.payment_gateway_fee_percent === "number"
        ? row.payment_gateway_fee_percent
        : DEFAULT_ADMIN_SETTINGS.paymentGatewayFeePercent,
    journeyStepSeconds:
      typeof row?.journey_step_seconds === "number"
        ? row.journey_step_seconds
        : DEFAULT_ADMIN_SETTINGS.journeyStepSeconds,
    splashEnabled: row?.splash_enabled ?? DEFAULT_ADMIN_SETTINGS.splashEnabled,
    splashPhrase: stringOrDefault(row?.splash_phrase, DEFAULT_ADMIN_SETTINGS.splashPhrase),
    splashHoldSeconds:
      typeof row?.splash_hold_seconds === "number"
        ? row.splash_hold_seconds
        : DEFAULT_ADMIN_SETTINGS.splashHoldSeconds,
    splashRevisitMinutes:
      typeof row?.splash_revisit_minutes === "number"
        ? row.splash_revisit_minutes
        : DEFAULT_ADMIN_SETTINGS.splashRevisitMinutes,
  };
}
