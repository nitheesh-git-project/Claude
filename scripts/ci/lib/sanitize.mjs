// Scrubs credentials and personal data out of text the gate publishes: the
// job summary, summary.json and the failure bundle.
//
// Fixtures are synthetic and the stack's keys are the Supabase CLI's public
// demo keys, so most of what this removes would be harmless -- but the same
// code paths print whatever the app and the test hand them, and a habit of
// publishing raw output is how a real token ends up in a log one day. So it
// is applied to everything, and it errs towards removing too much.
//
// What it does NOT cover: Playwright traces and screenshots are binary and
// are not rewritten. They are uploaded as their own short-retention artifact
// (see docs/ci/QUALITY-GATE.md), and they only ever hold fixture data.

const RULES = [
  // Connection strings with a password: postgres://user:secret@host
  [/\b(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, "$1[REDACTED]@"],
  // JWTs (Supabase anon/service keys, access tokens): three base64url parts.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[REDACTED_JWT]"],
  // Supabase's newer key formats.
  [/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}/g, "[REDACTED_SUPABASE_KEY]"],
  // Supabase personal access tokens.
  [/\bsbp_[A-Za-z0-9]{20,}/g, "[REDACTED_SUPABASE_PAT]"],
  // Razorpay key ids, live or test, and anything after a *_SECRET= assignment.
  [/\brzp_(?:test|live)_[A-Za-z0-9]{6,}/g, "[REDACTED_RAZORPAY_KEY]"],
  // Google OAuth: refresh tokens, access tokens, client secrets.
  [/\b1\/\/[A-Za-z0-9_-]{20,}/g, "[REDACTED_GOOGLE_REFRESH]"],
  [/\bya29\.[A-Za-z0-9._-]{10,}/g, "[REDACTED_GOOGLE_TOKEN]"],
  [/\bGOCSPX-[A-Za-z0-9_-]{10,}/g, "[REDACTED_GOOGLE_SECRET]"],
  // KEY=value / "key": "value" for anything named like a secret.
  [
    /\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|SERVICE_ROLE_KEY|ANON_KEY|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*[=:]\s*)("?)[^\s"',;]+\2/g,
    "$1$2[REDACTED]$2",
  ],
  [
    /("(?:access_token|refresh_token|provider_token|password|secret|api_key|apikey|token|signature|razorpay_signature)"\s*:\s*")[^"]*(")/gi,
    "$1[REDACTED]$2",
  ],
  // HTTP auth and cookies, in header or object form.
  [/\b(authorization\s*[:=]\s*["']?)(?:bearer|basic)\s+[^\s"',]+/gi, "$1[REDACTED]"],
  [/\bbearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [REDACTED]"],
  [/\b((?:set-)?cookie\s*[:=]\s*["']?)[^\n"']*/gi, "$1[REDACTED]"],
  [/\b(sb-[a-z0-9-]+-auth-token(?:\.\d+)?=)[^;\s"']+/gi, "$1[REDACTED]"],
  [/\b(apikey\s*[:=]\s*["']?)[^\s"',]+/gi, "$1[REDACTED]"],
  // Signed storage URLs and any other token in a query string.
  [/([?&](?:token|access_token|refresh_token|signature|sig|X-Amz-Signature|X-Amz-Credential)=)[^&\s"'#]+/gi, "$1[REDACTED]"],
  // Email addresses that are not fixtures. Fixture mail is @example.test
  // (and the SQL checks' @example.invalid); anything else could be a person.
  [/\b[A-Za-z0-9._%+-]+@(?!example\.test\b|example\.invalid\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]"],
  // Indian mobile numbers in E.164 or bare ten-digit form.
  [/(?<![\w.+-])(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?![\w.-])/g, "[REDACTED_PHONE]"],
];

/** Returns `text` with every credential-shaped or personal substring removed. */
export function sanitize(text) {
  if (text === null || text === undefined) return text;
  let out = String(text);
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  return out;
}

/** Deep-sanitises every string in a JSON-shaped value. */
export function sanitizeDeep(value) {
  if (typeof value === "string") return sanitize(value);
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeDeep(v)]));
  }
  return value;
}

/** Bounds a string so one runaway error cannot fill a summary. */
export function truncate(text, max = 2000) {
  if (typeof text !== "string" || text.length <= max) return text;
  return `${text.slice(0, max)}\n… [truncated ${text.length - max} characters]`;
}
