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
  | "accounting";

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
  };
}

function googleCheck(google: GoogleConnectionStatus | undefined): HealthCheck {
  const base = {
    id: "google" as const,
    label: "Google Connection",
    icon: "fa-plug",
    what: "Every video session gets a calendar invite and a Meet link from one Google account this app signs in as. That sign-in is a saved permission, and it can expire or be withdrawn without anybody touching the app.",
    example:
      "If the permission dies on a Tuesday, every session booked from then on has no link at all — and each one looks like its own unlucky failure until you read this panel.",
  };

  if (!google) {
    return {
      ...base,
      status: "unknown",
      headline: "Not checked on this page load.",
      fix: [],
      count: 0,
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
    };
  }

  if (google.state === "connected") {
    return {
      ...base,
      status: google.meetScope ? "healthy" : "attention",
      headline: google.meetScope
        ? "Connected. Invites and video links are being created, and nobody waits to be let in."
        : "Connected, but this account cannot open meetings up — so you have to admit each patient and therapist by hand.",
      fix: google.meetScope
        ? []
        : [
            "Run scripts/get-google-refresh-token.mjs again and accept the Google Meet permission it asks for.",
            "Save the new GOOGLE_CALENDAR_REFRESH_TOKEN in the server environment and redeploy.",
            "Come back here and press Open on anything listed under Waiting Room.",
          ],
      count: 0,
    };
  }

  return {
    ...base,
    status: "broken",
    headline: google.deadToken
      ? "The Google account is no longer connected. Every new session will fail to get a video link until this is fixed."
      : `Google could not be reached. This may be temporary — the check runs again every minute. (${google.detail})`,
    fix: google.deadToken
      ? [
          "In the Google Cloud console, set the OAuth consent screen to In production. Left on Testing, Google expires the permission every seven days — this is nearly always the cause.",
          "Run scripts/get-google-refresh-token.mjs and save the new GOOGLE_CALENDAR_REFRESH_TOKEN in the server environment.",
          "Redeploy, then press Retry on the sessions listed under Session Links below.",
        ]
      : [
          "Wait a minute and reload — this check re-runs on its own.",
          "If it stays red, check that the server can reach the internet.",
        ],
    count: 1,
  };
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
        "Fix Google Connection above first — Retry cannot work until it is green.",
        "Then press Retry on each session here.",
      ],
      count: issues.length,
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
            "If Retry keeps failing with the same message, the cause is the Google connection rather than the session — check the panel above.",
          ]
        : ["Nothing to do yet — come back in a few minutes and check they cleared."],
    count: issues.length,
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
    what: "Google Meet holds anyone it does not recognise at the door until somebody lets them in. This app opens each new session's meeting so the patient and the therapist walk straight in. These are the meetings where that did not work — the link and the invite are fine, only the door is.",
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
    };
  }

  if (issues.length === 0) {
    return {
      ...base,
      status: "healthy",
      headline: "Nobody is being held at the door.",
      fix: [],
      count: 0,
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
            "Press Open on each session here, or wait — the app is still retrying these on its own.",
          ],
    count: issues.length,
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
      headline: "Cannot be checked — this database has not had the latest tables applied yet.",
      fix: [
        "Run scripts/run-schema.mjs against this database, or push to main, which applies it for you.",
        "Reload this page. The check starts reporting straight away.",
      ],
      count: 0,
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
      headline: `All clear across ${plural(health.entitlementCount, "programme", "programmes")} — balances, payments and delivered sessions all agree.`,
      fix: [],
      count: 0,
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
      "Payments: find each one in your Razorpay dashboard. It is usually a checkout that died halfway — either attach it to the booking it was for, or refund it."
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
    headline: `${parts.join(", ")} — something here does not add up.`,
    fix,
    count: total,
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
        ? "Start at the top — the ones below often clear on their own once it is fixed."
        : "Everything else is running normally.";
  } else if (notChecked.length > 0) {
    headline = "Nothing is broken";
    blurb = `${plural(notChecked.length, "check is", "checks are")} switched off or could not be checked. That is not a fault — open it to see why.`;
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
    `${check.label} — ${STATUS_LABEL[check.status]}`,
    "",
    check.headline,
  ];
  if (check.fix.length > 0) {
    lines.push("", "Steps:");
    check.fix.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  }
  lines.push("", "(From Dr. Pooja's Physio → Settings → System Health)");
  return lines.join("\n");
}
