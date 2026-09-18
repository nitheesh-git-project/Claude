import { createHash } from "node:crypto";

import { MEET_SPACE_SETTINGS_SCOPE } from "@/lib/googleMeetSpace";

/**
 * Answers one question the app previously could not answer at all: is the
 * Google account still connected?
 *
 * Every Calendar and Meet call in this app authenticates with one long-lived
 * refresh token (`GOOGLE_CALENDAR_REFRESH_TOKEN`). When that token dies --
 * revoked, the authorizing account's password changed, or, far and away the
 * commonest cause here, the OAuth consent screen left in "Testing", where
 * Google expires refresh tokens after **seven days** -- every session's event
 * creation fails at once with `invalid_grant`.
 *
 * What that looked like before this module: nothing anywhere said the
 * connection was broken. Each affected session appeared as its own row in
 * Settings -> System Health -> Sync Health, carrying a raw `invalid_grant`
 * string and a Retry button that could never succeed, so the honest reading
 * of the screen was "a few sessions failed" when the truth was "the
 * integration is down and no future session will get a link either". The one
 * line naming the actual remedy was a `console.error` in googleCalendar.ts,
 * which a clinic owner never reads.
 *
 * This is the same shape as the `RAZORPAY_WEBHOOK_SECRET` check beside it on
 * that screen -- an integration stating whether it is wired up -- except that
 * a refresh token can be present and still be dead, so presence is not the
 * test. The only test that means anything is spending it.
 */

export type GoogleConnectionStatus =
  // No credentials set at all. Not an error: an owner who has not wired
  // Google up yet gets sessions with no video link by choice.
  | { state: "not_configured"; missing: string[] }
  // The token was accepted. `meetScope` says whether the grant also covers
  // switching a meeting to open access -- a token minted before that scope
  // existed still creates events fine and 403s only on the waiting-room
  // patch, which is a materially different (and much smaller) problem.
  | { state: "connected"; meetScope: boolean }
  // The token was refused. `deadToken` distinguishes the one cause with a
  // known fix (re-authorize) from a transient network or Google-side fault,
  // because telling an owner to re-run a script over a blip wastes their
  // afternoon and teaches them to ignore the panel.
  | {
      state: "broken";
      deadToken: boolean;
      detail: string;
      /** What the server is actually holding, for the one question the error
       *  itself cannot answer. See describeCredential below. */
      credential: CredentialShape | null;
      /** The OAuth client the refused token was presented to. A refresh token
       *  is bound to the client that minted it, so a production deployment
       *  carrying a different client id is refused with `invalid_grant` for a
       *  perfectly good token -- same error, entirely different fix. */
      clientId: string | null;
    };

/**
 * Enough about the stored credential to tell three failures apart, and not one
 * character more of it.
 *
 * `invalid_grant` is returned for a token that has genuinely died **and** for a
 * server that is simply still holding the previous value -- somebody pasted a
 * new token into their hosting provider, redeployed, and met the identical red
 * card. The error cannot distinguish them and neither could this screen, so the
 * owner's only move was to paste it again and hope.
 *
 * Three facts settle it without printing a secret:
 *   length      -- compared against the value they pasted, by eye
 *   fingerprint -- changes when the value changes, so "did this deploy pick it
 *                  up?" is answerable by reloading and looking
 *   padded      -- a trailing newline survives a paste into most dashboards and
 *                  Google refuses it every time. This one needs no comparison
 *                  at all: it is a finding on its own.
 *
 * The fingerprint is the first 8 hex of SHA-256 over the **raw** value, not a
 * trimmed one -- trimming first would hide exactly the whitespace difference
 * `padded` exists to catch, and make two different values print the same
 * fingerprint. Eight hex of a hash over a 100-character high-entropy secret
 * identifies it without revealing any of it.
 */
export type CredentialShape = {
  length: number;
  fingerprint: string;
  padded: boolean;
};

export function describeCredential(raw: string | undefined | null): CredentialShape | null {
  if (!raw) return null;
  return {
    length: raw.length,
    fingerprint: createHash("sha256").update(raw).digest("hex").slice(0, 8),
    padded: raw.trim() !== raw,
  };
}

const REQUIRED_ENV = [
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "GOOGLE_CALENDAR_REFRESH_TOKEN",
] as const;

// The probe is one outbound HTTPS call, and it runs from inside the admin
// dashboard's render -- the same place the Meet sync sweep runs, and bound by
// the same reasoning. Two caches keep it cheap. A success is held for long
// enough that an admin clicking around the back office pays for it once;
// a failure is re-checked far sooner, so an owner who has just re-run the
// token script sees the panel go green without waiting out a long cache.
const OK_TTL_MS = 10 * 60 * 1000;
const FAIL_TTL_MS = 60 * 1000;

// Google must not be able to hold the dashboard's first byte. Shorter than
// the sync sweep's own budget because this is a status line, not the work.
const PROBE_TIMEOUT_MS = 5000;

let cached: { at: number; status: GoogleConnectionStatus } | null = null;

/** Test seam: forget the memoized verdict. */
export function resetGoogleConnectionCache(): void {
  cached = null;
}

/** When the memoized verdict was actually worked out, or null if nothing has
 *  been probed yet. System Health prints it, because this is the one check
 *  whose answer can be up to ten minutes old -- an owner who has just re-run
 *  the token script and still sees red needs to know whether the screen is
 *  disagreeing with them or simply has not looked again. */
export function googleConnectionCheckedAt(): number | null {
  return cached?.at ?? null;
}

function missingEnv(): string[] {
  return REQUIRED_ENV.filter((key) => !process.env[key]);
}

/**
 * Exchanges the refresh token for an access token, which is the cheapest
 * call that actually proves the credential works, and reads the granted
 * scopes off the response so the Meet-scope question is answered by the same
 * round trip rather than a second one.
 *
 * Never throws: this is called from a page render, and a status panel that
 * can 500 the screen it sits on is worse than no status panel.
 */
export async function checkGoogleConnection(): Promise<GoogleConnectionStatus> {
  const missing = missingEnv();
  if (missing.length > 0) return { state: "not_configured", missing };

  const now = Date.now();
  if (cached) {
    const ttl = cached.status.state === "connected" ? OK_TTL_MS : FAIL_TTL_MS;
    if (now - cached.at < ttl) return cached.status;
  }

  const status = await probe();
  cached = { at: Date.now(), status };
  return status;
}

async function probe(): Promise<GoogleConnectionStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
        refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN!,
        grant_type: "refresh_token",
      }),
      signal: controller.signal,
    });

    const body = (await res.json().catch(() => ({}))) as {
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!res.ok) {
      // invalid_grant is the dead-token answer. Google also returns it for a
      // client id/secret that no longer match the token, which has the same
      // remedy, so the two are deliberately not split further.
      const deadToken = body.error === "invalid_grant";
      return {
        state: "broken",
        deadToken,
        detail: body.error_description || body.error || `HTTP ${res.status}`,
        credential: describeCredential(process.env.GOOGLE_CALENDAR_REFRESH_TOKEN),
        clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? null,
      };
    }

    return {
      state: "connected",
      meetScope: (body.scope ?? "").split(/\s+/).includes(MEET_SPACE_SETTINGS_SCOPE),
    };
  } catch (err) {
    // A timeout or a DNS failure is not a dead token, and must not be
    // reported as one.
    const detail = err instanceof Error ? err.message : String(err);
    // A timeout says nothing about the stored value, so the shape is reported
    // here too rather than left null -- it is the same environment either way,
    // and an owner mid-redeploy is exactly who reads this card.
    return {
      state: "broken",
      deadToken: false,
      detail,
      credential: describeCredential(process.env.GOOGLE_CALENDAR_REFRESH_TOKEN),
      clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * "Is it worth calling Google at all right now?" Used by the retry sweep: a
 * dead token cannot be fixed by trying again, and each attempt costs an
 * appointment one of its five capped tries. Burning those on a credential
 * that is down means that when the owner does re-authorize, the sessions
 * that most needed the sweep have already been retired to "needs attention".
 */
export async function googleCredentialsUsable(): Promise<boolean> {
  const status = await checkGoogleConnection();
  return status.state === "connected";
}
