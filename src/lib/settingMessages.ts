// What a saved setting says back to the owner.
//
// The confirmation has to name the thing that changed and its new state --
// "Home visits are on", not "Saved". A message that does not name the thing
// is a spinner that stopped: it tells somebody a request finished, which
// they could already see, and nothing about what is now true. That is the
// whole complaint this module answers -- a toggle flips, the page re-renders
// into a state that looks identical, and the person is left guessing.
//
// It lives in one module rather than at each call site for the reason
// `moneyTerms.ts` does: eight settings screens writing their own wording
// produce eight vocabularies for one product, and the screen an owner opens
// least often is the one that ends up saying "Updated successfully".
//
// The words are the clinic owner's, not the column's. `home_visit_enabled`
// is a column name; "Home visits are on" is the sentence somebody reads.

/** A setting whose value is a plain on/off. */
type BooleanSetting = { kind: "boolean"; on: string; off: string };
/** A setting carrying a number, with the unit spelled out. */
type NumberSetting = { kind: "number"; describe: (value: number) => string };
/** Anything else -- text, a list, a mode. The value is rarely worth
 *  repeating back, so most of these just name what was changed. */
type TextSetting = { kind: "text"; describe: (value: string) => string };

export type SettingMessage = BooleanSetting | NumberSetting | TextSetting;

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export const SETTING_MESSAGES: Record<string, SettingMessage> = {
  // --- Home visits -------------------------------------------------------
  home_visit_enabled: {
    kind: "boolean",
    on: "Home visits are on. The public page, the nav link and the booking wizard are live.",
    off: "Home visits are off. The public page and the booking wizard are hidden.",
  },
  home_visit_cash_enabled: {
    kind: "boolean",
    on: "Patients can now pay the therapist at the door.",
    off: "Cash on visit is off. Home visits must be prepaid.",
  },
  home_visit_lead_time_hours: {
    kind: "number",
    describe: (v) => `Home visits must now be booked at least ${plural(v, "hour", "hours")} ahead.`,
  },
  home_visit_cancellation_refund_hours: {
    kind: "number",
    describe: (v) =>
      `A home visit cancelled more than ${plural(v, "hour", "hours")} ahead is now refunded in full.`,
  },
  home_visit_default_validity_days: {
    kind: "number",
    describe: (v) => `New home-visit packages now last ${plural(v, "day", "days")}.`,
  },
  home_visit_bulk_schedule_max: {
    kind: "number",
    describe: (v) => `A patient can now book ${plural(v, "visit", "visits")} at a time.`,
  },
  home_visit_travel_buffer_minutes: {
    kind: "number",
    describe: (v) =>
      `Therapists now get ${plural(v, "minute", "minutes")} either side of a home visit to travel.`,
  },
  home_visit_page_heading: { kind: "text", describe: () => "The Home Visit page heading is updated." },
  home_visit_page_subheading: {
    kind: "text",
    describe: () => "The Home Visit page subheading is updated.",
  },

  // --- Booking a single session -----------------------------------------
  online_booking_lead_time_hours: {
    kind: "number",
    describe: (v) => `Sessions must now be booked at least ${plural(v, "hour", "hours")} ahead.`,
  },
  online_cancellation_refund_hours: {
    kind: "number",
    describe: (v) =>
      `A session cancelled more than ${plural(v, "hour", "hours")} ahead is now refunded in full.`,
  },
  join_window_minutes: {
    kind: "number",
    describe: (v) => `Patients can now join ${plural(v, "minute", "minutes")} before their session.`,
  },
  join_window_after_minutes: {
    kind: "number",
    describe: (v) => `The join link now stays open ${plural(v, "minute", "minutes")} after the start.`,
  },
  session_completed_after_minutes: {
    kind: "number",
    describe: (v) =>
      `A session now reads as completed ${plural(v, "minute", "minutes")} after its start time.`,
  },
  booking_languages: { kind: "text", describe: () => "The booking languages are updated." },
  google_meet_enabled: {
    kind: "boolean",
    on: "Sessions now get a Google Meet link.",
    off: "Google Meet is off. Sessions get a calendar invite with no video link.",
  },
  meet_open_access_enabled: {
    kind: "boolean",
    on: "New meetings now open without a waiting room.",
    off: "New meetings keep their waiting room. Someone must let each person in.",
  },
  auto_assign_therapist_enabled: {
    kind: "boolean",
    on: "Paid sessions now assign themselves when exactly one therapist is free.",
    off: "Paid sessions now wait in the admin queue for a therapist.",
  },
  therapist_suggestions_enabled: {
    kind: "boolean",
    on: "Therapists can now propose the next session on a programme.",
    off: "Therapists can no longer propose sessions.",
  },

  // --- Programmes and recommendations -----------------------------------
  care_plan_requires_approval: {
    kind: "boolean",
    on: "Recommendations now wait for your approval before the patient sees them.",
    off: "Recommendations now reach the patient as soon as a therapist writes one.",
  },
  care_plan_default_expiry_days: {
    kind: "number",
    describe: (v) => `An approved recommendation now holds for ${plural(v, "day", "days")}.`,
  },
  care_plan_max_frequency_per_week: {
    kind: "number",
    describe: (v) =>
      `Clinicians can now ask for at most ${plural(v, "session", "sessions")} a week.`,
  },
  package_default_validity_days: {
    kind: "number",
    describe: (v) => `New programmes now last ${plural(v, "day", "days")}.`,
  },
  package_bulk_schedule_max: {
    kind: "number",
    describe: (v) => `A patient can now book ${plural(v, "session", "sessions")} at a time.`,
  },
  package_expiry_reminder_days: {
    kind: "number",
    describe: (v) => `Patients are now reminded ${plural(v, "day", "days")} before a programme ends.`,
  },
  package_therapist_lock_enabled: {
    kind: "boolean",
    on: "A programme now stays with the therapist who ran its first session.",
    off: "A programme's sessions can now go to any therapist.",
  },
  entitlement_ledger_authoritative: {
    kind: "boolean",
    on: "Session balances now come from the credit ledger.",
    off: "Session balances now come from the older counters.",
  },

  // --- Offers and discounts ---------------------------------------------
  first_session_offer_enabled: {
    kind: "boolean",
    on: "New patients now get money off their first session.",
    off: "The first-session offer is off. New patients pay list price.",
  },
  first_session_offer_type: {
    kind: "text",
    describe: () => "The first-session offer now takes a different kind of discount.",
  },
  first_session_offer_value: {
    kind: "number",
    describe: () => "The first-session offer amount is updated.",
  },
  promo_codes_enabled: {
    kind: "boolean",
    on: "Patients can now type a promo code at checkout.",
    off: "Promo codes are off. The code field is hidden at checkout.",
  },
  invite_rewards_enabled: {
    kind: "boolean",
    on: "Patients can now invite a friend and both get money off.",
    off: "Patient invites are off. Rewards already promised are still honoured.",
  },
  invite_welcome_paise: {
    kind: "number",
    describe: (v) => `An invited friend now gets ₹${(v / 100).toLocaleString("en-IN")} off.`,
  },
  invite_reward_paise: {
    kind: "number",
    describe: (v) => `An inviter now gets ₹${(v / 100).toLocaleString("en-IN")} off their next session.`,
  },
  invite_max_rewards_per_patient: {
    kind: "number",
    describe: (v) => `One patient can now earn at most ${plural(v, "reward", "rewards")}.`,
  },

  // --- Team, access and contact -----------------------------------------
  contact_masking_enabled: {
    kind: "boolean",
    on: "A patient's phone number is now masked on therapist screens.",
    off: "Therapists now see patients' full phone numbers.",
  },
  contact_scan_mode: {
    kind: "text",
    describe: (v) =>
      v === "off"
        ? "Message scanning is off. Nothing is checked or recorded."
        : v === "flag_only"
          ? "Messages are now recorded when they carry contact details, and nothing is refused."
          : "Payment handles and links are now refused, and contact details recorded.",
  },
  session_timeout_minutes: {
    kind: "number",
    describe: (v) => `People are now signed out after ${plural(v, "minute", "minutes")} of inactivity.`,
  },
  farewell_banner_seconds: {
    kind: "number",
    describe: (v) => `The goodbye message now shows for ${plural(v, "second", "seconds")}.`,
  },

  // --- Clinical ----------------------------------------------------------
  enabled_intake_specialties: {
    kind: "text",
    describe: () => "The condition types a therapist can triage into are updated.",
  },
  risk_signals_enabled: {
    kind: "boolean",
    on: "Risk checks are on. Findings appear on Today → Risk.",
    off: "Risk checks are off. Nothing new will be flagged.",
  },

  // --- Brand and the public site ----------------------------------------
  site_name: { kind: "text", describe: () => "Your clinic's name is updated across the site." },
  site_tagline: { kind: "text", describe: () => "Your tagline is updated." },
  site_description: { kind: "text", describe: () => "Your site description is updated." },
  contact_email: { kind: "text", describe: () => "Your contact email is updated." },
  contact_phone: { kind: "text", describe: () => "Your contact phone number is updated." },
  whatsapp_number: { kind: "text", describe: () => "Your WhatsApp number is updated." },
  footer_copyright_text: { kind: "text", describe: () => "The footer text is updated." },
  journey_step_seconds: {
    kind: "number",
    describe: (v) =>
      v === 0
        ? "The home page walkthrough no longer rotates by itself."
        : `The home page walkthrough now moves on every ${plural(v, "second", "seconds")}.`,
  },
  splash_enabled: {
    kind: "boolean",
    on: "The opening greeting is on.",
    off: "The opening greeting is off.",
  },
  splash_brand_line: {
    kind: "text",
    describe: (v) =>
      v.trim() === ""
        ? "The greeting now uses your clinic's name."
        : "The name on the greeting is updated.",
  },
  splash_phrase: { kind: "text", describe: () => "The greeting's line is updated." },
  splash_hold_seconds: {
    kind: "number",
    describe: (v) => `The greeting now holds for ${v} ${v === 1 ? "second" : "seconds"}.`,
  },
  splash_revisit_minutes: {
    kind: "number",
    describe: (v) =>
      v === 0
        ? "The greeting now shows on a first load only."
        : `A tab away for more than ${plural(v, "minute", "minutes")} is now greeted again.`,
  },
};

/**
 * The sentence for one saved setting, or a plain fallback.
 *
 * The fallback exists so a setting added without an entry still confirms
 * *something* rather than silently going back to the behaviour this module
 * replaced -- but `settingMessages.test.ts` fails when a key the UI writes
 * has no entry, so reaching it means somebody skipped a step rather than
 * that the fallback is the design.
 */
export function settingSavedMessage(key: string, value: unknown): string {
  const entry = SETTING_MESSAGES[key];
  if (!entry) return "Saved.";

  if (entry.kind === "boolean") {
    return value ? entry.on : entry.off;
  }
  if (entry.kind === "number") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "Saved.";
    return entry.describe(n);
  }
  return entry.describe(typeof value === "string" ? value : String(value ?? ""));
}
