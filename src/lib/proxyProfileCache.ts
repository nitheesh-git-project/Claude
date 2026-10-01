/**
 * A signed, short-lived cache of the three profile fields the proxy gates on.
 *
 * ## Why
 *
 * `src/lib/supabase/proxy.ts` runs on every request under the four dashboard
 * route trees -- which means every client-side navigation, not just every
 * full page load. It makes two network calls to Supabase, one after the
 * other: `auth.getUser()`, then a `profiles` select for `role`, `approved`
 * and `active`. The second one asks the same question and gets the same
 * answer dozens of times while somebody clicks around their dashboard.
 *
 * `getUser()` stays as it is -- it refreshes the access token, and the
 * cookies it writes through the `setAll` callback are load-bearing (the
 * comment above `redirectTo` in proxy.ts explains the sign-in loop that
 * happens when they are lost). This module removes the *second* call.
 *
 * ## How
 *
 * The three fields are written into a cookie alongside the user id they
 * belong to and an expiry, HMAC-signed with a server-only secret. The proxy
 * reads it, verifies the signature, checks it has not expired and checks it
 * belongs to the user `getUser()` just returned -- and only then skips the
 * database.
 *
 * The signature is what makes this safe. The cookie says "this user is an
 * admin"; without a signature that is a sentence the browser gets to write.
 * With one, forging it requires the secret, which never leaves the server.
 * Verification is a constant-time comparison so a wrong signature leaks
 * nothing through how long it took to reject.
 *
 * ## The trade-off, stated plainly
 *
 * For up to {@link PROFILE_CACHE_TTL_SECONDS} seconds, a session that is
 * **already open** keeps the role, approval and active flag it had when the
 * cookie was written. Suspending an account, demoting an admin or revoking
 * an approval therefore takes up to that long to lock out a tab that is
 * already sitting on a dashboard. A new sign-in is unaffected, and anything
 * that signs the user out -- including the impersonation window expiring --
 * clears the cookie immediately, so the paths that need to be instant are.
 *
 * Sixty seconds was chosen as the longest window that is still shorter than
 * a person noticing and acting. It is deliberately not minutes.
 *
 * ## Degradation
 *
 * With no secret configured this module does nothing at all: `issue` returns
 * null and `read` returns null, so the proxy falls through to the database
 * read it has always done. A missing environment variable makes the app
 * slower, never wrong, and never open.
 */

/** How long an issued cookie is trusted. See the trade-off note above. */
export const PROFILE_CACHE_TTL_SECONDS = 60;

export const PROFILE_CACHE_COOKIE = "mr_profile_cache";

export type CachedProfile = {
  role: string;
  approved: boolean;
  active: boolean;
};

/**
 * Server-only. Never prefix this with `NEXT_PUBLIC_`: the whole guarantee
 * here is that a browser cannot produce a valid signature, and a published
 * secret is not a secret. Absent means "no caching", not "no signing".
 */
function secret(): string | null {
  const value = process.env.PROXY_PROFILE_CACHE_SECRET;
  return value && value.length > 0 ? value : null;
}

const encoder = new TextEncoder();

/** Web Crypto, not node:crypto -- the proxy runs on the Edge runtime, where
 *  the node builtin is not available. */
async function sign(payload: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(payload));
  return base64url(new Uint8Array(mac));
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Length-independent, then constant-time over the compared bytes. A plain
 * `===` on a signature returns as soon as two characters differ, which times
 * how much of a guess was right.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The signed payload. The user id is in it deliberately: without it a cookie
 * minted for one account would be accepted for another after a sign-out and
 * sign-in on the same browser, which is the whole attack this is otherwise
 * inviting.
 */
function encodePayload(
  userId: string,
  profile: CachedProfile,
  expiresAtMs: number
): string {
  return [
    userId,
    profile.role,
    profile.approved ? "1" : "0",
    profile.active ? "1" : "0",
    String(expiresAtMs),
  ].join("|");
}

/**
 * Builds the cookie value for a freshly-read profile, or null when no secret
 * is configured. `nowMs` is a parameter rather than a `Date.now()` call so
 * the expiry logic is testable without waiting a minute.
 */
export async function issueProfileCookie(
  userId: string,
  profile: CachedProfile,
  nowMs: number = Date.now()
): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const payload = encodePayload(
    userId,
    profile,
    nowMs + PROFILE_CACHE_TTL_SECONDS * 1000
  );
  return `${payload}.${await sign(payload, key)}`;
}

/**
 * Returns the cached profile when the cookie is present, correctly signed,
 * unexpired and issued for this exact user -- and null in every other case,
 * including a malformed value. Null means "ask the database", never "let
 * them through".
 */
export async function readProfileCookie(
  cookieValue: string | undefined,
  userId: string,
  nowMs: number = Date.now()
): Promise<CachedProfile | null> {
  const key = secret();
  if (!key || !cookieValue) return null;

  // rsplit on the final separator: the payload's own fields are "|"-joined,
  // so only the signature follows the last ".".
  const split = cookieValue.lastIndexOf(".");
  if (split <= 0) return null;
  const payload = cookieValue.slice(0, split);
  const signature = cookieValue.slice(split + 1);

  const expected = await sign(payload, key);
  if (!timingSafeEqual(signature, expected)) return null;

  const [cookieUserId, role, approved, active, expiresAt] = payload.split("|");
  if (!cookieUserId || !role || !expiresAt) return null;
  if (cookieUserId !== userId) return null;

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= nowMs) return null;

  return { role, approved: approved === "1", active: active === "1" };
}
