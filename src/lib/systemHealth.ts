import type { AccountingHealth } from "@/lib/accountingHealth";
import type { GoogleConnectionStatus } from "@/lib/googleConnectionHealth";

// What Settings -> System Health says, worked out here rather than inside the
// screen.
//
// The screen used to be five panels of prose, each explaining a subsystem in
// its own words and each leaving the reader to decide from a paragraph
// whether anything was actually wrong. An owner opening it could not answer
// "is my clinic healthy right now?" without reading all of it, and the one
// sentence naming the fix was buried in the middle of the explanation.
//
// So every check answers the same four things in the same order, and a
// screen renders them identically:
//   status   -- one word, colour-coded, never colour alone
//   headline -- what is true right now, in a clinic owner's words
//   fix      -- numbered steps the owner can do themselves (empty when healthy)
//   what/example -- the teaching half, behind an (i) so it costs no space
//
// It is dependency-free on purpose (the two imports are types, erased at
// compile time) so the judgement is unit-tested rather than eyeballed on a
// dashboard that needs a database, a Google token and a Razorpay key to
// render at all.

export type HealthStatus =
  // Working. Green.
  | "healthy"
  // Working, but something needs a person before it bites. Amber.
  | "attention"
  // Not working. Money or sessions are being lost right now. Red.
  | "broken"
  // Deliberately not set up. Slate -- an absence somebody chose is not a
  // fault, and colouring it red teaches an owner to ignore red.
  | "off"
  // Could not be determined on this render. Slate.
  | "unknown";

export type HealthCheckId =
  | "payments"
  | "google"
  | "sync"
  | "waiting_room"
  | "accounting"
  | "rate_limits"
  | "pay_later"
  | "referral_attribution"
  | "refunds"
  | "settlements"
  | "patient_files";

export type HealthCheck = {
  id: HealthCheckId;
  label: string;
  /** Font Awesome class, e.g. "fa-credit-card". */
  icon: string;
  status: HealthStatus;
  /** One line saying what is true right now. No jargon, no column names. */
  headline: string;
  /** How the owner fixes it themselves. Empty when there is nothing to do. */
  fix: string[];
  /** Behind the (i): what this check actually watches. */
  what: string;
  /** Behind the (i): one concrete thing that would happen if it broke. */
  example: string;
  /** Rows behind a non-healthy status, so a count can link to its own list. */
  count: number;
  /**
   * What the app can state about this failure that the failure itself does
   * not say -- facts, never advice, and never a secret.
   *
   * It exists for the case where one error message covers two different
   * problems with two different fixes, and the steps above are therefore
   * right for only one of them. Empty for every healthy check, and for every
   * check whose error already names its own cause.
   */
  evidence: string[];
};

/**
 * What the pay-later check reads. Absent (`null`) means the database has not
 * had the columns applied, and the check reports "Not set up" -- which is how
 * an unapplied migration becomes a line on a screen somebody already reads
 * rather than a failure discovered by a patient.
 */
export type PayLaterHealth = {
  /** How many patients the clinic has put on terms. */
  patientsOnTerms: number;
  /** The clinic-wide switch. */
  featureEnabled: boolean;
  totalOwedPaise: number;
  patientsOwing: number;
  /** The oldest unsettled session, in whole days. Null when nothing is owed. */
  oldestOwedAgeDays: number | null;
  /** Past this, the clinic calls a balance worth chasing. */
  agedAfterDays: number;
  ageWarningEnabled: boolean;
  patientsOwingAged: number;
  /** Sessions that have been and gone and were never marked completed. */
  unclosedSessions: number;
  /** Payments a patient says they have made, waiting for somebody to check
   *  the bank. Absent on a database predating the settlement table. */
  settlementsWaiting?: number;
  /** How long the one that has waited longest has waited, in whole days. */
  oldestSettlementWaitDays?: number | null;
  /** `sum(confirmed) - (sum(settled) + unallocated)`, in paise. Zero means
   *  the books agree; null means it could not be asked, which is not the
   *  same thing and must not read as agreement. */
  settlementDifferencePaise?: number | null;
  /** Refunds agreed on sessions a trusted patient had already settled, and
   *  not yet handed over. No gateway reverses these -- the money arrived as
   *  one payment covering several sessions -- so a person has to move them,
   *  and until somebody does the patient is out of pocket. */
  refundsToHandBack?: number;
  refundsToHandBackPaise?: number;
  /** `sum(written-off sessions) - sum(bad debt recorded)`, in paise. A
   *  written-off session with no cost row behind it overstates profit by
   *  exactly the amount forgiven and says so on no other screen. Null when it
   *  could not be asked -- a database without `source_appointment_id` has
   *  nothing to compare against, and reading that as agreement is the mistake
   *  this file corrects most often. */
  writeOffDifferencePaise?: number | null;
};

export type SystemHealthInput = {
  /** Whether RAZORPAY_WEBHOOK_SECRET is set in the server environment. */
  webhookSecretConfigured: boolean;
  /** Undefined when this render chose not to spend the Google token. */
  google?: GoogleConnectionStatus;
  /** Confirmed sessions with no calendar event / Meet link yet. */
  syncIssues: { autoRetryExhausted: boolean }[];
  /** Confirmed sessions whose meeting still holds both parties at the door. */
  waitingRoomIssues: { autoRetryExhausted: boolean }[];
  accounting: AccountingHealth;
  /** site_settings.meet_open_access_enabled. */
  openAccessEnabled: boolean;
  /**
   * What this server has seen about whether it can tell callers apart --
   * from `rateLimitIdentifierStats()`. Optional because a render that did
   * not ask should read "Not checked" rather than "Healthy".
   */
  rateLimitIdentity?: {
    observed: number;
    identified: number;
    anonymous: number;
    allOneCaller: boolean;
  };
  /** Null when the columns have not been applied -- see PayLaterHealth. */
  payLater?: PayLaterHealth | null;
  /**
   * Patients a partner referred whose profile does not say so.
   *
   * Null when it could not be asked, which the check reports as "could not
   * be checked" rather than as agreement -- a read that failed is not a read
   * that came back empty.
   */
  referralAttribution?: ReferralAttributionHealth | null;
  /**
   * Whether every refund sent to the gateway has a recorded outcome.
   *
   * Null when it could not be asked -- a database without `refund_attempts`
   * has nothing to compare against, and reading that as agreement is the
   * mistake this file corrects most often.
   */
  refunds?: RefundHealth | null;
  /**
   * Rows where the settlement record and the derivation disagree. `null` is
   * "could not be checked" -- a database without the table -- and is not the
   * same fact as zero.
   */
  settlementDisagreements?: number | null;
  /**
   * Patient files against the rows describing them.
   *
   * Null when it could not be asked -- on this check a zero reads as
   * "nothing to worry about" rather than "we did not look", and the thing
   * being counted is a medical record.
   */
  storage?: StorageHealth | null;
};

export type StorageHealth = {
  /** Files in the bucket that no metadata row describes. */
  filesWithNoRow: number;
  /** Rows whose file is not in the bucket -- listed to the patient, and the
   *  view route mints a signed URL for something that is not there. */
  rowsWithNoFile: number;
  /** Whether the walk hit its own cap, so this is part of the bucket rather
   *  than all of it. A partial clean result is not a clean result. */
  truncated: boolean;
};

export type RefundHealth = {
  /** Refunds sent to Razorpay whose answer was never recorded. */
  stuckCount: number;
  /** How long ago the oldest of those was sent, in whole hours. A number
   *  rather than a date, so this module stays dependency-free and the
   *  sentence it produces is the one a person actually wants -- how long the
   *  money has been unaccounted for. */
  oldestStuckHours?: number | null;
  /** Refunds the gateway accepted whose own session or purchase carries no
   *  refund id -- money that went back and is not on the screen it belongs
   *  on. */
  unrecordedCount: number;
};

export type ReferralAttributionHealth = {
  /** Referrals that converted into a patient whose profile has no partner. */
  orphanedCount: number;
  /** ...of which this many have already had a session completed. */
  withCompletedSessions: number;
};

const STATUS_RANK: Record<HealthStatus, number> = {
  broken: 4,
  attention: 3,
  unknown: 2,
  off: 1,
  healthy: 0,
};

export const STATUS_LABEL: Record<HealthStatus, string> = {
  healthy: "Healthy",
  attention: "Needs a look",
  broken: "Needs you now",
  off: "Not set up",
  unknown: "Not checked",
};

/** True when this check is asking for a person. `off` and `unknown` are not:
 *  an owner who has not wired Google up has not got a problem, and a probe
 *  that did not run is not evidence of one. */
export function needsPerson(status: HealthStatus): boolean {
  return status === "broken" || status === "attention";
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function paymentsCheck(configured: boolean): HealthCheck {
  return {
    id: "payments",
    label: "Payment Confirmations",
    icon: "fa-credit-card",
    status: configured ? "healthy" : "broken",
    headline: configured
      ? "A patient who pays and closes the tab is still confirmed."
      : "Payments are confirmed by the patient's browser alone. Money can arrive against a booking that stays unpaid.",
    fix: configured
      ? []
      : [
          "Open your Razorpay dashboard and go to Settings → Webhooks.",
          "Add a webhook pointing at https://<your site>/api/razorpay/webhook, with a secret you choose.",
          "Put that same secret in the server environment as RAZORPAY_WEBHOOK_SECRET, then redeploy.",
        ],
    what: "Razorpay tells this app that a payment went through in two ways at once: the patient's own browser, and a direct call from Razorpay's servers. The second one is the safety net, and it needs a shared secret to be trusted.",
    example:
      "A patient pays ₹1,200 on her phone and the call drops before the page reloads. With the safety net on, the booking is confirmed anyway. Without it, the money is in your Razorpay account and the session still reads as unpaid.",
    count: configured ? 0 : 1,
    evidence: [],
  };
}

function googleCheck(google: GoogleConnectionStatus | undefined): HealthCheck {
  const base = {
    id: "google" as const,
    label: "Google Connection",
    icon: "fa-plug",
    what: "Every video session gets a calendar invite and a Meet link from one Google account this app signs in as. That sign-in is a saved permission, and it can expire or be withdrawn without anybody touching the app.",
    example:
      "If the permission dies on a Tuesday, every session booked from then on has no link at all - and each one looks like its own unlucky failure until you read this panel.",
  };

  if (!google) {
    return {
      ...base,
      status: "unknown",
      headline: "Not checked on this page load.",
      fix: [],
      count: 0,
      evidence: [],
    };
  }

  if (google.state === "not_configured") {
    return {
      ...base,
      status: "off",
      headline:
        "Google is not connected. Sessions are booked and paid for normally, but none of them gets a calendar invite or a video link.",
      fix: [
        `Set ${google.missing.join(", ")} in the server environment.`,
        "Run scripts/get-google-refresh-token.mjs and save the token it prints.",
        "Redeploy. This panel turns green once the app can sign in.",
      ],
      count: 0,
      evidence: [],
    };
  }

  if (google.state === "connected") {
    return {
      ...base,
      status: google.meetScope ? "healthy" : "attention",
      headline: google.meetScope
        ? "Connected. Invites and video links are being created, and nobody waits to be let in."
        : "Connected, but this account cannot open meetings up - so you have to admit each patient and therapist by hand.",
      fix: google.meetScope
        ? []
        : [
            "Run scripts/get-google-refresh-token.mjs again and accept the Google Meet permission it asks for.",
            "Save the new GOOGLE_CALENDAR_REFRESH_TOKEN in the server environment and redeploy.",
            "Come back here and press Open on anything listed under Waiting Room.",
          ],
      count: 0,
      evidence: [],
    };
  }

  return {
    ...base,
    status: "broken",
    headline: google.deadToken
      ? "The Google account is no longer connected. Every new session will fail to get a video link until this is fixed."
      : `Google could not be reached. This may be temporary - the check runs again every minute. (${google.detail})`,
    fix: google.deadToken
      ? [
          "Check the permission this server is using is the one you last saved - the line under this card says which. If it did not change after your last deploy, the server is still on the old value and the steps below will not help.",
          "In the Google Cloud console, set the OAuth consent screen to In production. Left on Testing, Google expires the permission every seven days.",
          "Run scripts/get-google-refresh-token.mjs and save the new GOOGLE_CALENDAR_REFRESH_TOKEN in the server environment.",
          "Redeploy, then press Retry on the sessions listed under Session Links below.",
        ]
      : [
          "Wait a minute and reload - this check re-runs on its own.",
          "If it stays red, check that the server can reach the internet.",
        ],
    count: 1,
    evidence: googleEvidence(google),
  };
}

/**
 * The facts the refusal itself withholds.
 *
 * Google answers `invalid_grant` both for a permission that has genuinely
 * died and for a server still holding the value you replaced -- and the
 * numbered steps above are the fix for only the first. An owner who pastes a
 * new token, redeploys and meets the same red card has no way to tell which
 * of the two they are looking at, so they paste it again. These lines end
 * that loop: the fingerprint changes when the stored value changes, so one
 * reload answers "did this deploy pick it up?", and the client id is the
 * other cause entirely -- a token is bound to the client that minted it, and
 * a deployment carrying a different one is refused identically.
 *
 * Facts only. No secret, and no advice: the advice is the `fix` list, and
 * the whole point here is that it may be the wrong list.
 */
function googleEvidence(google: Extract<GoogleConnectionStatus, { state: "broken" }>): string[] {
  const lines: string[] = [];
  if (google.credential) {
    lines.push(
      `The permission this server is using: ${plural(google.credential.length, "character", "characters")} long, fingerprint ${google.credential.fingerprint}. That fingerprint changes whenever the saved value does, so if it is the same after a redeploy, the new value never reached the server.`
    );
    if (google.credential.padded) {
      // Stated on its own because, unlike the fingerprint, it needs nothing
      // to compare against: a stray newline survives a paste into most
      // hosting dashboards and Google refuses it every single time.
      lines.push(
        "That saved value has a space or a line break around it. Google refuses it for that alone - paste it again with nothing either side."
      );
    }
  }
  if (google.clientId) {
    lines.push(
      `It is being presented to Google app ${google.clientId}. A permission only works with the app that issued it, so if that is not the app you got the permission from, that is the reason rather than anything above.`
    );
  }
  return lines;
}

function syncCheck(
  issues: { autoRetryExhausted: boolean }[],
  googleDown: boolean
): HealthCheck {
  const stuck = issues.filter((i) => i.autoRetryExhausted).length;
  const base = {
    id: "sync" as const,
    label: "Session Links",
    icon: "fa-video",
    what: "Confirmed sessions that do not have their calendar event or video link yet. The app keeps trying these on its own a few times; after that it stops and waits for you.",
    example:
      "A session is booked and paid for at 9 AM, Google refuses the invite, and the patient turns up at 5 PM with no link to click. This list is how you catch that before they do.",
  };

  if (issues.length === 0) {
    return {
      ...base,
      status: "healthy",
      headline: "Every confirmed session has its link.",
      fix: [],
      count: 0,
      evidence: [],
    };
  }

  // A dead Google credential fails every one of these identically, and
  // retrying spends the session's capped attempts for nothing. Say so here
  // rather than letting the owner press Retry down the list.
  if (googleDown) {
    return {
      ...base,
      status: "broken",
      headline: `${plural(issues.length, "session has", "sessions have")} no link, and none of them can be fixed while the Google connection is down.`,
      fix: [
        "Fix Google Connection above first - Retry cannot work until it is green.",
        "Then press Retry on each session here.",
      ],
      count: issues.length,
      evidence: [],
    };
  }

  return {
    ...base,
    status: stuck > 0 ? "broken" : "attention",
    headline:
      stuck > 0
        ? `${plural(stuck, "session has", "sessions have")} stopped retrying and will not fix themselves.`
        : `${plural(issues.length, "session is", "sessions are")} still being retried automatically.`,
    fix:
      stuck > 0
        ? [
            "Press Retry on each session marked Stopped retrying.",
            "If Retry keeps failing with the same message, the cause is the Google connection rather than the session - check the panel above.",
          ]
        : ["Nothing to do yet - come back in a few minutes and check they cleared."],
    count: issues.length,
    evidence: [],
  };
}

function waitingRoomCheck(
  issues: { autoRetryExhausted: boolean }[],
  openAccessEnabled: boolean
): HealthCheck {
  const stuck = issues.filter((i) => i.autoRetryExhausted).length;
  const base = {
    id: "waiting_room" as const,
    label: "Waiting Room",
    icon: "fa-door-open",
    what: "Google Meet holds anyone it does not recognise at the door until somebody lets them in. This app opens each new session's meeting so the patient and the therapist walk straight in. These are the meetings where that did not work - the link and the invite are fine, only the door is.",
    example:
      "A patient clicks her link at 6 PM and sits on a 'Asking to be let in' screen, while the therapist sits on another one. Nobody joins unless your clinic's own Google account is watching.",
  };

  if (!openAccessEnabled) {
    return {
      ...base,
      status: "off",
      headline:
        "Turned off. Somebody signed in to your clinic's Google account has to admit each patient and therapist by hand.",
      fix: [
        "Turn Join Without Approval back on under Settings → Booking Rules to stop the knocking.",
      ],
      count: 0,
      evidence: [],
    };
  }

  if (issues.length === 0) {
    return {
      ...base,
      status: "healthy",
      headline: "Nobody is being held at the door.",
      fix: [],
      count: 0,
      evidence: [],
    };
  }

  return {
    ...base,
    status: stuck > 0 ? "attention" : "attention",
    headline: `${plural(issues.length, "session is", "sessions are")} still holding both people at the door.`,
    fix:
      stuck > 0
        ? [
            "The usual cause is your saved Google permission predating this feature: run scripts/get-google-refresh-token.mjs, save the new token, redeploy.",
            "Then press Open on each session listed here.",
          ]
        : [
            "Press Open on each session here, or wait - the app is still retrying these on its own.",
          ],
    count: issues.length,
    evidence: [],
  };
}

function accountingCheck(health: AccountingHealth): HealthCheck {
  const base = {
    id: "accounting" as const,
    label: "Books & Sessions Agree",
    icon: "fa-scale-balanced",
    what: "Three questions asked of your own data: do the session balances on a programme match their history, is every payment attached to something, and does every delivered session have a payment, a programme or cash behind it.",
    example:
      "A patient's programme says 4 sessions left while its history says 3. One of the two is wrong, and whichever it is, somebody gets a session they did not pay for or loses one they did.",
  };

  if (!health.available) {
    return {
      ...base,
      status: "unknown",
      headline: "Cannot be checked - this database has not had the latest tables applied yet.",
      fix: [
        "Run scripts/run-schema.mjs against this database, or push to main, which applies it for you.",
        "Reload this page. The check starts reporting straight away.",
      ],
      count: 0,
      evidence: [],
    };
  }

  const balance = health.balanceMismatches.length;
  const payments = health.unmatchedPayments.length;
  const sessions = health.sessionsWithoutBacking.length;
  const total = balance + payments + sessions;

  if (total === 0) {
    return {
      ...base,
      status: "healthy",
      headline: `All clear across ${plural(health.entitlementCount, "programme", "programmes")} - balances, payments and delivered sessions all agree.`,
      fix: [],
      count: 0,
      evidence: [],
    };
  }

  const parts: string[] = [];
  if (balance > 0) parts.push(plural(balance, "balance", "balances"));
  if (payments > 0) parts.push(plural(payments, "payment", "payments"));
  if (sessions > 0) parts.push(plural(sessions, "session", "sessions"));

  const fix: string[] = [];
  if (balance > 0) {
    fix.push(
      "Balances: do not switch the programme balance setting over to the new ledger until this reads zero. Open each programme listed and check what the patient has actually used."
    );
  }
  if (payments > 0) {
    fix.push(
      "Payments: find each one in your Razorpay dashboard. It is usually a checkout that died halfway - either attach it to the booking it was for, or refund it."
    );
  }
  if (sessions > 0) {
    fix.push(
      "Sessions: open each one and either record how it was paid for, or mark it cancelled if it never happened."
    );
  }

  return {
    ...base,
    // A balance that disagrees with its own history is the one finding that
    // makes a number in the product wrong, rather than merely untidy.
    status: balance > 0 ? "broken" : "attention",
    headline: `${parts.join(", ")} - something here does not add up.`,
    fix,
    count: total,
    evidence: [],
  };
}

/**
 * Whether the public doors are actually throttled, which is not the same
 * question as whether the limiter is installed.
 *
 * `enforceRateLimit` allows a request it cannot attribute -- deliberately,
 * because inventing a key would put every visitor on earth in one bucket and
 * let the first thirty lock out the thirty-first. The cost of that correct
 * decision is that a deployment behind a host which sets neither `x-real-ip`
 * nor `x-forwarded-for` has every limit switched off and no symptom: no 429,
 * no log line, no counter row. A load test is what found it -- the same
 * burst that produced 40 allowed and 252 refused with a header produced
 * nothing at all without one -- and a burst is not something an owner runs.
 *
 * So the app states it. `off` rather than `broken`, because nothing is
 * failing: the app is doing what it was told, and the fix is one setting on
 * the host rather than anything in here. A mixture is `attention`, since a
 * host that sets the header on some routes and not others is the case most
 * likely to be a misconfiguration somebody can still correct.
 */
function rateLimitCheck(
  stats:
    | { observed: number; identified: number; anonymous: number; allOneCaller: boolean }
    | undefined
): HealthCheck {
  const base = {
    id: "rate_limits" as const,
    label: "Public doors",
    icon: "fa-shield-halved",
    what:
      "Whether this server can tell one visitor from another. Every public form and lookup is capped per visitor, and a cap can only be applied to somebody the server can recognise.",
    example:
      "Someone runs a script against the pincode lookup or the partner-hospital enquiry form. With this healthy they are stopped after their share; without it, either nothing stops them or the whole internet shares one allowance and ordinary visitors get refused.",
    evidence: [] as string[],
  };

  if (!stats || stats.observed === 0) {
    return {
      ...base,
      status: "unknown",
      headline:
        "Nothing has used a capped page yet on this server, so there is nothing to judge.",
      fix: [],
      count: 0,
    };
  }

  const hostingSteps = [
    "Open your hosting dashboard and turn on the setting that passes the visitor's own IP address through to the app. It is usually called forwarded headers, real IP, or client IP.",
    "If the site sits behind your own proxy or load balancer, set it to send an X-Real-IP header carrying the visitor's address rather than its own.",
    "Reload this screen afterwards. It reads what this server has actually received, so it will change on its own once the next visitors come through.",
  ];

  if (stats.anonymous > 0) {
    const allAnonymous = stats.identified === 0;
    return {
      ...base,
      // Nothing is failing: the app is doing exactly what it was told, and
      // the fix is a setting on the host rather than anything in here.
      // Painting that red is how red stops meaning anything.
      status: allAnonymous ? "off" : "attention",
      headline: allAnonymous
        ? `No visitor could be told apart, so nothing is being capped (${plural(stats.anonymous, "request", "requests")} checked).`
        : `${plural(stats.anonymous, "request", "requests")} of ${stats.observed} arrived with no way to tell who was asking, so those were not capped.`,
      fix: hostingSteps,
      count: stats.anonymous,
      evidence: [
        `Requests seen on this server: ${stats.observed}. Recognised: ${stats.identified}. Not recognised: ${stats.anonymous}.`,
        "Counted since this server last restarted, on the machine that drew this screen.",
      ],
    };
  }

  if (stats.allOneCaller) {
    return {
      ...base,
      // The dangerous one, and the one that looks healthy from the inside:
      // everybody is being capped, together, out of a single allowance.
      status: "attention",
      headline: `Every visitor is arriving as the same person, so they are sharing one allowance between them (${plural(stats.observed, "request", "requests")} checked).`,
      fix: hostingSteps,
      count: stats.observed,
      evidence: [
        `All ${stats.observed} requests seen on this server carried one and the same address.`,
        "That is what a proxy passing on its own address rather than the visitor's looks like. It can also mean one person is doing all the testing.",
        "Counted since this server last restarted, on the machine that drew this screen.",
      ],
    };
  }

  return {
    ...base,
    status: "healthy",
    headline: `Visitors are being told apart, so the caps are doing their job (${plural(stats.identified, "request", "requests")} checked).`,
    fix: [],
    count: 0,
  };
}


/**
 * Patients the clinic has agreed to be paid by afterwards.
 *
 * Three things decide the shape, and all three are the same rule: **owing
 * money is not a fault**. A patient on terms owing a large sum is the
 * arrangement working, so it is never red; the only red here is an internal
 * inconsistency, and there is exactly one that matters at this stage -- a
 * session that has been and gone and was never closed, because debt, revenue
 * and the therapist's own pay all appear at completion and none of the three
 * exists until somebody taps it.
 *
 * `off` is not a fault either. An owner who has not switched this on, or has
 * nobody on terms, has not got a problem, and painting that red is how red
 * stops meaning anything.
 */
/**
 * Partner attribution that went missing.
 *
 * A referral that converts writes `profiles.referred_by_hospital_id` on the
 * new patient, and that column is what every commission figure reads. The
 * write was best-effort with a console.error behind it, so a failure meant
 * the partner silently earned nothing on that patient -- not on the first
 * session, not on any of them -- and nothing in the product noticed. The
 * comment on that line said as much and left it there.
 *
 * `patient_referrals.converted_patient_id` is the durable record that makes
 * this detectable: the referral knows who it became. This is the check that
 * asks, so the gap surfaces on a screen somebody reads instead of in a log
 * nobody does.
 *
 * Amber rather than red when nothing has been delivered yet: no money has
 * been mis-split, and putting a partner back is one edit. Red once a session
 * has completed, because at that point a commission has genuinely been
 * computed without them and the books are wrong.
 */
function referralAttributionCheck(
  health: ReferralAttributionHealth | null
): HealthCheck {
  const base = {
    id: "referral_attribution" as const,
    label: "Partner attribution",
    icon: "fa-handshake",
    what: "Patients a partner hospital referred, who registered, and whose account does not record which partner sent them. That link is what every commission figure is worked out from.",
    example:
      "A hospital refers a patient, the patient registers and has six sessions. The link between them was never written, so the partner's Earnings screen shows nothing for any of it and the clinic's own books hand them no commission - with no error anywhere, because the registration itself worked.",
  };

  if (!health) {
    return {
      ...base,
      status: "unknown",
      headline: "Could not be checked just now.",
      fix: [
        "Reload this page. If it keeps saying this, the referrals table could not be read.",
      ],
      count: 0,
      evidence: [],
    };
  }

  if (health.orphanedCount === 0) {
    return {
      ...base,
      status: "healthy",
      headline: "Every referred patient's account names the partner who sent them.",
      fix: [],
      count: 0,
      evidence: [],
    };
  }

  const delivered = health.withCompletedSessions;
  return {
    ...base,
    status: delivered > 0 ? "broken" : "attention",
    headline:
      delivered > 0
        ? `${plural(health.orphanedCount, "referred patient", "referred patients")} have no partner recorded, and ${plural(delivered, "has", "have")} already had a session delivered - so a commission has been worked out without them.`
        : `${plural(health.orphanedCount, "referred patient", "referred patients")} have no partner recorded. No sessions have been delivered yet, so no money has been mis-split.`,
    fix: [
      "Open People -> Partners -> Patient Referrals and find the referral marked Registered.",
      "Open the patient it converted to, and set the partner that referred them on their profile.",
      "Their commission then applies to sessions from that point. Sessions already delivered keep the split that was recorded on the day.",
    ],
    count: health.orphanedCount,
    evidence: [
      `${plural(health.orphanedCount, "patient", "patients")} with no partner recorded`,
      delivered > 0
        ? `${plural(delivered, "patient", "patients")} already have a delivered session`
        : "None have had a session delivered yet",
    ],
  };
}

/**
 * Refunds: did what we asked the gateway for actually happen.
 *
 * Every gateway refund claims its local row first and calls Razorpay second,
 * so a refusal leaves no trace claiming money went back. The opposite failure
 * had nothing watching it at all: Razorpay accepts the refund and the write
 * recording it fails, which leaves the money gone, `refund_id` null, and the
 * session looking exactly like one that was claimed and never sent. In all
 * four refund writers the only thing that noticed was a `console.error`.
 *
 * `refund_attempts` records the intent before the call, so both disagreements
 * are now askable, and they are different questions. A refund still in flight
 * long after it was sent is money whose fate is unknown -- red, because
 * nothing automatic will resolve it and the patient is waiting. A succeeded
 * refund whose subject row has no id is money that went back and is not on
 * the screen it belongs on -- also red, since every figure reading that row
 * is now wrong.
 *
 * Reported, never repaired: this screen cannot know whether Razorpay took the
 * money, and guessing on a money record is how a discrepancy becomes
 * permanent.
 */
/**
 * The settlement record against the derivation every money figure still
 * reads.
 *
 * `session_settlements` is written alongside that derivation and nothing
 * reads it to decide what anybody is paid -- which is exactly why this check
 * exists. It is the thing that has to be green before anything *does*: a
 * shadow record nobody reconciles is a second set of books, and the first
 * time the two disagree the new one is the one nobody trusts.
 *
 * `off` rather than `healthy` when there is nothing to compare: a clinic that
 * has not completed a session since this shipped has no disagreement and no
 * agreement either, and painting that green claims a reconciliation that
 * never ran.
 */
function settlementsCheck(disagreements: number | null): HealthCheck {
  const base = {
    id: "settlements" as const,
    label: "Settlement record",
    icon: "fa-scale-balanced",
    what: "Every delivered session now writes down what it was worth and how it was split, beside the figures the Money screens work out for themselves. This watches whether the two ever disagree.",
    example:
      "A session is completed and recorded as \u20b91,200 split three ways. If the Money screens later work that same session out differently - a rate read at the wrong moment, a rounding difference - this says so, before anybody is paid on the wrong one.",
  };

  if (disagreements === null) {
    return {
      ...base,
      status: "unknown",
      headline: "Cannot be checked - this database has not had the latest changes applied yet.",
      fix: ["Apply `supabase/schema.sql` to this project, then reload this page."],
      count: 0,
      evidence: [],
    };
  }

  if (disagreements === 0) {
    return {
      ...base,
      status: "healthy",
      headline: "Every recorded settlement agrees with the figures on the Money screens.",
      fix: [],
      count: 0,
      evidence: [],
    };
  }

  return {
    ...base,
    status: "broken",
    headline: `${plural(disagreements, "session", "sessions")} where the recorded settlement and the Money screens do not agree.`,
    fix: [
      "Nothing here is paid from the recorded settlement yet, so no money has moved on the wrong figure.",
      "Open Money -> Summary and compare the sessions named below against what they were recorded as worth.",
      "Send this to your developer before anything is settled on these sessions.",
    ],
    count: disagreements,
    evidence: [
      `${plural(disagreements, "session", "sessions")} disagree`,
      "Reported, never repaired - two money records that disagree need a person to decide which is right",
    ],
  };
}

function refundsCheck(health: RefundHealth | null): HealthCheck {
  const base = {
    id: "refunds" as const,
    label: "Refunds",
    icon: "fa-rotate-left",
    what: "Refunds this clinic asked Razorpay for, and whether each one's answer was written down. A refund can go through at the gateway in the moment the app fails to record it, and that leaves money returned with nothing on any screen saying so.",
    example:
      "You refund a session, Razorpay sends the money back, and the connection drops before the app writes it down. The patient has their money, the session still reads as refundable, and every revenue figure counts the full amount - so this names it instead of leaving it to be found in a bank statement.",
  };

  if (!health) {
    return {
      ...base,
      status: "unknown",
      headline: "Cannot be checked - this database has not had the latest changes applied yet.",
      fix: [
        "Apply `supabase/schema.sql` to this project, then reload this page.",
      ],
      count: 0,
      evidence: [],
    };
  }

  if (health.stuckCount === 0 && health.unrecordedCount === 0) {
    return {
      ...base,
      status: "healthy",
      headline: "Every refund sent to Razorpay has a recorded outcome.",
      fix: [],
      count: 0,
      evidence: [],
    };
  }

  const evidence: string[] = [];
  if (health.stuckCount > 0) {
    evidence.push(
      `${plural(health.stuckCount, "refund", "refunds")} sent with no recorded answer`
    );
    const hours = health.oldestStuckHours;
    if (hours !== null && hours !== undefined) {
      evidence.push(
        hours < 1
          ? "Oldest sent less than an hour ago"
          : `Oldest sent about ${plural(hours, "hour", "hours")} ago`
      );
    }
  }
  if (health.unrecordedCount > 0) {
    evidence.push(
      `${plural(health.unrecordedCount, "refund", "refunds")} went through but are not recorded on the session or purchase`
    );
  }

  return {
    ...base,
    status: "broken",
    headline:
      health.stuckCount > 0
        ? `${plural(health.stuckCount, "refund", "refunds")} were sent to Razorpay and we never recorded what came back - check whether the money actually left.`
        : `${plural(health.unrecordedCount, "refund", "refunds")} went through at Razorpay and are not recorded against the session or purchase they belong to.`,
    fix: [
      "Open the Refunds section of your Razorpay dashboard and find the refunds from around the time shown here.",
      "For each one, check whether Razorpay actually processed it.",
      "Where it did, record it against the session or purchase from the admin screens so the money figures agree.",
      "Where it did not, the refund can simply be issued again - nothing here has to be undone first.",
    ],
    count: health.stuckCount + health.unrecordedCount,
    evidence,
  };
}

/**
 * Patient files: the row and the file agreeing.
 *
 * `patient_medical_documents` holds metadata only, so the two can come apart
 * in either direction and nothing looked. It **lists and never deletes** --
 * `docs/DATA-POLICY.md` §5 -- because a sweep that removes a file it could
 * not find a row for is one bad query away from deleting a patient's scan.
 *
 * A row with no file is the worse half and the one that decides the colour:
 * the document is on the patient's own health profile and the view route
 * mints a signed URL for something that is not there, so the patient meets
 * the failure. A file with no row is amber -- nothing is broken for anybody,
 * but a scan report the patient believes they deleted is still in a bucket.
 */
function patientFilesCheck(health: StorageHealth | null): HealthCheck {
  const base = {
    id: "patient_files" as const,
    label: "Patient files",
    icon: "fa-folder-open",
    what: "The scans and reports patients upload, checked against the records that describe them. The file lives in storage and the description lives in the database, so the two can come apart - a file nothing points at, or a record whose file is missing.",
    example:
      "A patient deletes a report, the record goes and the file does not - so a scan they believe they removed is still stored. Or the reverse: their health profile lists a report that will not open, because the file is gone and only the record is left.",
  };

  if (!health) {
    return {
      ...base,
      status: "unknown",
      headline: "Could not be checked just now.",
      fix: ["Reload this page. If it keeps saying this, the file store could not be read."],
      count: 0,
      evidence: [],
    };
  }

  const evidence: string[] = [];
  if (health.rowsWithNoFile > 0) {
    evidence.push(
      `${plural(health.rowsWithNoFile, "record", "records")} whose file is missing`
    );
  }
  if (health.filesWithNoRow > 0) {
    evidence.push(`${plural(health.filesWithNoRow, "file", "files")} nothing points at`);
  }
  // Said whenever it applies, including on an otherwise clean result: a
  // partial clean result is not a clean result, and this is the sentence
  // that stops it being read as one.
  if (health.truncated) {
    evidence.push("Only part of the file store was checked on this pass");
  }

  if (health.rowsWithNoFile === 0 && health.filesWithNoRow === 0) {
    return {
      ...base,
      status: health.truncated ? "unknown" : "healthy",
      headline: health.truncated
        ? "Only part of the file store could be checked on this pass."
        : "Every patient file has a record, and every record has its file.",
      fix: health.truncated
        ? ["Nothing is known to be wrong. Reload later to check the rest."]
        : [],
      count: 0,
      evidence,
    };
  }

  return {
    ...base,
    status: health.rowsWithNoFile > 0 ? "broken" : "attention",
    headline:
      health.rowsWithNoFile > 0
        ? `${plural(health.rowsWithNoFile, "patient record", "patient records")} point at a file that is not there - the patient sees it listed and it will not open.`
        : `${plural(health.filesWithNoRow, "patient file", "patient files")} are stored with nothing pointing at them.`,
    fix: [
      "Nothing here is deleted automatically, and nothing should be - a file removed because a record could not be found is a patient's scan.",
      "For a record whose file is missing: ask the patient to upload it again, then delete the empty record.",
      "For a file nothing points at: it is almost always a delete that half-finished. Leave it unless you are certain, and ask an engineer to confirm before removing anything.",
      "Before launch there is one ordinary cause: Reset data empties the records and cannot reach the stored files, so every reset leaves its uploads behind. On a database with no real patients those are safe to clear.",
    ],
    count: health.rowsWithNoFile + health.filesWithNoRow,
    evidence,
  };
}

function payLaterCheck(health: PayLaterHealth | null): HealthCheck {
  const base = {
    id: "pay_later" as const,
    label: "Pay Later",
    icon: "fa-handshake-angle",
    what: "Patients you have allowed to pay after their sessions: how much they owe, how long it has been owed, and any session that has happened but was never marked done - which is the one case where nothing is recorded anywhere at all.",
    example:
      "A session on Tuesday was delivered and nobody closed it. The patient is not billed for it, the clinic counts no revenue for it, and the therapist is not paid for it - and no screen has anything to show, because as far as the app knows it never happened.",
  };

  if (!health) {
    return {
      ...base,
      status: "unknown",
      headline: "Cannot be checked - this database has not had the latest columns applied yet.",
      fix: [
        "Run scripts/run-schema.mjs against this database, or push to main, which applies it for you.",
        "Reload this page. The check starts reporting straight away.",
      ],
      count: 0,
      evidence: [],
    };
  }

  const money = `₹${Math.round(health.totalOwedPaise / 100).toLocaleString("en-IN")}`;
  const evidence = [
    `${plural(health.patientsOnTerms, "patient", "patients")} allowed to pay later`,
    `${money} owed by ${plural(health.patientsOwing, "patient", "patients")}`,
    health.oldestOwedAgeDays === null
      ? "Nothing outstanding"
      : `Oldest unsettled session: ${plural(health.oldestOwedAgeDays, "day", "days")}`,
    health.ageWarningEnabled
      ? `Worth chasing after ${plural(health.agedAfterDays, "day", "days")}`
      : "Ageing warnings are switched off",
    `${plural(health.settlementsWaiting ?? 0, "payment", "payments")} waiting to be checked`,
    `${plural(health.refundsToHandBack ?? 0, "refund", "refunds")} agreed and not yet handed back`,
    // Facts, never advice: this line is what decides whether the steps above
    // it apply, which is why it renders above them.
    health.settlementDifferencePaise === null || health.settlementDifferencePaise === undefined
      ? "Money in against money accounted for: could not be checked"
      : health.settlementDifferencePaise === 0
        ? "Money in matches money accounted for"
        : `Money in and money accounted for differ by ₹${Math.abs(
            Math.round(health.settlementDifferencePaise / 100)
          ).toLocaleString("en-IN")}`,
    health.writeOffDifferencePaise === null || health.writeOffDifferencePaise === undefined
      ? "Written-off sessions against the cost recorded for them: could not be checked"
      : health.writeOffDifferencePaise === 0
        ? "Every written-off session has its loss recorded as a cost"
        : `Written-off sessions and the cost recorded for them differ by ₹${Math.abs(
            Math.round(health.writeOffDifferencePaise / 100)
          ).toLocaleString("en-IN")}`,
  ];

  if (!health.featureEnabled && health.patientsOnTerms === 0) {
    return {
      ...base,
      status: "off",
      headline: "Pay later is not in use.",
      fix: [],
      count: 0,
      evidence: [],
    };
  }

  // The one genuinely red state in this whole feature, and it is the only
  // one: the money that came in and the money accounted for disagree. Either
  // a delivered session was closed by money that never arrived, or money
  // arrived and closed nothing -- and both mean a figure somebody is chasing
  // people from is wrong. Checked first, because it outranks any queue.
  //
  // It **reports and never repairs**: a silent auto-fix on a money record is
  // how a discrepancy becomes permanent, the same posture
  // `verify_entitlement_balances` takes.
  // `null` is not `0`. The reconciliation returns null when it could not be
  // asked, and reading that as "the books agree" is the exact mistake this
  // codebase corrects most often -- a read that failed is not a read that
  // came back empty. It is amber rather than red: nothing is known to be
  // wrong, and the honest state is "we could not check", not "something is".
  // `undefined` is different again and correctly silent: an unmigrated
  // database has no settlements to reconcile.
  if (health.settlementDifferencePaise === null) {
    return {
      ...base,
      status: "attention",
      headline: "The money received from patients on pay later could not be checked against the sessions it closed.",
      fix: [
        "Reload this page - a single failed read usually clears on its own.",
        "If it keeps saying this, use Copy for my developer at the foot of this card and send that text on.",
      ],
      count: 1,
      evidence,
    };
  }

  const difference = health.settlementDifferencePaise ?? 0;
  if (difference !== 0) {
    const gap = `₹${Math.abs(Math.round(difference / 100)).toLocaleString("en-IN")}`;
    return {
      ...base,
      status: "broken",
      headline: `Money received from patients on pay later and money accounted for differ by ${gap}.`,
      fix: [
        "Do not change anything by hand - the figures are the evidence, and editing them loses it.",
        "Open Money -> Owed by Patients and use Copy for my developer at the foot of this card.",
        "Send that text on. It names every payment and every session involved.",
      ],
      count: 1,
      evidence,
    };
  }

  // The other half of the same question, one direction over: a session the
  // clinic decided to stop chasing, with nothing recording the loss. It
  // overstates profit by exactly the amount forgiven, and no other screen
  // would say so -- the write-off route reverts itself precisely to make this
  // impossible, so if it ever fires something got past that.
  //
  // `null` is amber and not red for the reason above it: not knowing is not
  // the same as knowing something is wrong. `undefined` stays silent, which
  // is a database with no write-offs to reconcile.
  if (health.writeOffDifferencePaise === null) {
    return {
      ...base,
      status: "attention",
      headline:
        "Sessions written off could not be checked against the cost recorded for them.",
      fix: [
        "Reload this page - a single failed read usually clears on its own.",
        "If it keeps saying this, use Copy for my developer at the foot of this card and send that text on.",
      ],
      count: 1,
      evidence,
    };
  }

  const writeOffGap = health.writeOffDifferencePaise ?? 0;
  if (writeOffGap !== 0) {
    const gap = `₹${Math.abs(Math.round(writeOffGap / 100)).toLocaleString("en-IN")}`;
    return {
      ...base,
      status: "broken",
      headline: `Sessions written off and the cost recorded for them differ by ${gap}.`,
      fix: [
        "Do not change anything by hand - the figures are the evidence, and editing them loses it.",
        "Open Money -> Owed by Patients and use Copy for my developer at the foot of this card.",
        "Send that text on. Every write-off should have one Bad debt cost against it on Money -> Costs.",
      ],
      count: 1,
      evidence,
    };
  }

  // Money the clinic has agreed to give back and has not given back. Checked
  // before the queues below it because the patient here is out of pocket
  // rather than waiting on an answer, and nothing automatic is ever going to
  // move it.
  if ((health.refundsToHandBack ?? 0) > 0) {
    const owed = health.refundsToHandBackPaise
      ? ` (₹${Math.round(health.refundsToHandBackPaise / 100).toLocaleString("en-IN")})`
      : "";
    return {
      ...base,
      status: "attention",
      headline: `${plural(health.refundsToHandBack ?? 0, "refund is", "refunds are")} owed back to a patient and not yet sent${owed}.`,
      fix: [
        "Open Money -> Owed by Patients. They are listed under 'Refunds to hand back'.",
        "Send the money the way they paid it - there is no card payment to reverse, so nothing happens on its own.",
        "Tap Confirm handed back, which is what takes it off this list.",
      ],
      count: health.refundsToHandBack ?? 0,
      evidence,
    };
  }

  // Work delivered that produced no record of itself anywhere. Amber rather
  // than red -- it asks for a person, and a person can fix it in one tap.
  if (health.unclosedSessions > 0) {
    return {
      ...base,
      status: "attention",
      headline: `${plural(health.unclosedSessions, "session", "sessions")} happened and were never marked done, so nothing has been recorded for them.`,
      fix: [
        "Open Money -> Owed by Patients. The sessions are listed under 'Sessions that were never closed'.",
        "Open each one on All Sessions and mark it done, once you are sure it went ahead.",
        "The money appears everywhere at once - what the patient owes, your revenue, and the therapist's share.",
      ],
      count: health.unclosedSessions,
      evidence,
    };
  }

  // Somebody has handed money over and heard nothing. Their own figure still
  // says they owe it, and the clinic's says the same -- so until this is
  // checked, both screens overstate what is owed and the patient cannot tell
  // "being checked" from "forgotten".
  if ((health.settlementsWaiting ?? 0) > 0) {
    const waited = health.oldestSettlementWaitDays;
    return {
      ...base,
      status: "attention",
      headline:
        waited === null || waited === undefined
          ? `${plural(health.settlementsWaiting ?? 0, "payment is", "payments are")} waiting to be checked.`
          : `${plural(health.settlementsWaiting ?? 0, "payment is", "payments are")} waiting to be checked, the oldest for ${plural(waited, "day", "days")}.`,
      fix: [
        "Open Money -> Owed by Patients. They are listed under 'Payments waiting'.",
        "Find each one and its reference in your bank statement.",
        "Tap Confirm, or Reject with a reason the patient will read.",
      ],
      count: health.settlementsWaiting ?? 0,
      evidence,
    };
  }

  if (health.ageWarningEnabled && health.patientsOwingAged > 0) {
    return {
      ...base,
      status: "attention",
      headline: `${plural(health.patientsOwingAged, "patient has", "patients have")} owed for longer than ${plural(health.agedAfterDays, "day", "days")}.`,
      fix: [
        "Open Money -> Owed by Patients. The patients are at the top of the list, in amber.",
        "Give them a call. These are people you chose to trust, so this is a reminder rather than a concern.",
        "If somebody has stopped paying altogether, turn pay later off on their profile. What they already owe stays owed.",
      ],
      count: health.patientsOwingAged,
      evidence,
    };
  }

  return {
    ...base,
    status: "healthy",
    headline:
      health.patientsOwing === 0
        ? `${plural(health.patientsOnTerms, "patient", "patients")} can pay later, and nobody owes anything.`
        : `${money} owed by ${plural(health.patientsOwing, "patient", "patients")}, all within ${plural(health.agedAfterDays, "day", "days")}.`,
    fix: [],
    count: 0,
    // Empty, like every other healthy check: evidence exists to decide
    // whether the steps above apply, and a healthy check has no steps.
    evidence: [],
  };
}

export function buildSystemHealth(input: SystemHealthInput): HealthCheck[] {
  const googleDown = input.google?.state === "broken";
  return [
    paymentsCheck(input.webhookSecretConfigured),
    googleCheck(input.google),
    syncCheck(input.syncIssues, googleDown),
    waitingRoomCheck(input.waitingRoomIssues, input.openAccessEnabled),
    accountingCheck(input.accounting),
    rateLimitCheck(input.rateLimitIdentity),
    payLaterCheck(input.payLater ?? null),
    referralAttributionCheck(input.referralAttribution ?? null),
    refundsCheck(input.refunds ?? null),
    settlementsCheck(input.settlementDisagreements ?? null),
    patientFilesCheck(input.storage ?? null),
  ];
}

export type HealthSummary = {
  total: number;
  healthy: number;
  /** Checks asking for a person: broken + attention. */
  needsPerson: number;
  worst: HealthStatus;
  /** The one line at the top of the screen. */
  headline: string;
  blurb: string;
  /** Which checks to offer as jump chips. Same rows the count counted. */
  attention: HealthCheck[];
};

export function summarizeHealth(checks: HealthCheck[]): HealthSummary {
  const attention = checks.filter((c) => needsPerson(c.status));
  const healthy = checks.filter((c) => c.status === "healthy").length;
  const worst = checks.reduce<HealthStatus>(
    (acc, c) => (STATUS_RANK[c.status] > STATUS_RANK[acc] ? c.status : acc),
    "healthy"
  );
  const notChecked = checks.filter((c) => c.status === "unknown" || c.status === "off");

  let headline: string;
  let blurb: string;
  if (attention.length > 0) {
    headline = `${plural(attention.length, "check needs", "checks need")} you`;
    blurb =
      attention.length === checks.length
        ? "Start at the top - the ones below often clear on their own once it is fixed."
        : "Everything else is running normally.";
  } else if (notChecked.length > 0) {
    headline = "Nothing is broken";
    blurb = `${plural(notChecked.length, "check is", "checks are")} switched off or could not be checked. That is not a fault - open it to see why.`;
  } else {
    headline = `All ${checks.length} checks healthy`;
    blurb = "Bookings, payments, video links and the books are all behaving.";
  }

  return {
    total: checks.length,
    healthy,
    needsPerson: attention.length,
    worst,
    headline,
    blurb,
    attention,
  };
}

/** The checks that are actually red. Amber is "look at this today"; red is
 *  "something is being lost while you read this", and only red earns a place
 *  on a screen the admin did not open to see it. */
export function criticalChecks(checks: HealthCheck[]): HealthCheck[] {
  return checks.filter((c) => c.status === "broken");
}

/** The line Today carries when something is red, or null when it is not.
 *
 *  System Health only helps somebody who opens it, and nobody opens it until
 *  they already suspect trouble -- which is the wrong order for a payment
 *  safety net that is silently switched off. Today is opened daily, so the
 *  red ones come to the reader instead. */
export function healthBannerText(
  checks: HealthCheck[]
): { title: string; detail: string } | null {
  const red = criticalChecks(checks);
  if (red.length === 0) return null;
  const names = red.map((c) => c.label);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return {
    title: names.length === 1 ? `${list} needs you` : `${list} need you`,
    // The first red check's own headline, because "something is wrong" sends
    // the reader looking and a sentence saying what is wrong sends them to
    // the fix.
    detail: red[0].headline,
  };
}

/** How long ago an answer was worked out, in words.
 *
 *  Two of these checks are cached (the Google probe is one outbound call, held
 *  for ten minutes on success and one minute on failure), so a card can be
 *  showing an answer from before the owner's fix. Without this the screen
 *  looks broken twice over: once for still being red, and once for being
 *  green when it is not. */
export function formatCheckedAgo(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return "just now";
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "over an hour ago";
  if (hours < 24) return `${hours} hours ago`;
  return "more than a day ago";
}

/** What the Copy button hands over.
 *
 *  Every fix on this screen names an environment variable, a script or a
 *  Google console setting, and the owner reading it is often not the person
 *  who can do those. Retyping a Google error into a message is how the error
 *  arrives wrong. */
export function copyTextFor(check: HealthCheck): string {
  const lines = [
    `${check.label} - ${STATUS_LABEL[check.status]}`,
    "",
    check.headline,
  ];
  // Before the steps, deliberately: where evidence exists it is the thing
  // that decides whether those steps are the right ones at all.
  if (check.evidence.length > 0) {
    lines.push("", "What the app can see:");
    check.evidence.forEach((line) => lines.push(`- ${line}`));
  }
  if (check.fix.length > 0) {
    lines.push("", "Steps:");
    check.fix.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  }
  lines.push("", "(From MoveRestore Physiotherapy → Settings → System Health)");
  return lines.join("\n");
}
