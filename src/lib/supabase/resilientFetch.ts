/**
 * The one `fetch` every server-side Supabase client uses.
 *
 * Why this exists, precisely: a load test ran 40 concurrent admin dashboard
 * renders against a real project. The admin dashboard fires ~82 queries per
 * render, so that is ~3,300 HTTP requests in flight at once, against one
 * origin, through Node's global undici agent -- which by default opens as
 * many sockets as it is asked to. TLS handshakes queued behind each other
 * until they passed undici's 10-second connect timeout, and the render's own
 * guards then swallowed the failure. Measured: p50 went from 4.0s at 5
 * concurrent renders to 141s at 40, with a worst case of 244s, and fifteen
 * renders returned HTTP 200 having silently lost the appointments table --
 * the query that feeds Overview, Calendar, Sessions and every money figure.
 * The same run showed the database itself answering 400 concurrent requests
 * in 4.6s with no errors, so the origin was never the limit. The client was.
 *
 * Three rules, and each is a separate failure this prevents:
 *
 * 1. **A ceiling on in-flight requests.** Excess requests wait for a warm,
 *    kept-alive socket instead of opening a cold one. Waiting 200ms for a
 *    slot is strictly better than spending 10s on a handshake that then
 *    times out, and it is what turns a cliff into a queue. The cap is per
 *    server instance and tunable, because the right number depends on the
 *    database's own connection budget rather than on anything in this repo.
 *
 *    The default was measured, not guessed, and the measurement matters
 *    because a cap that is too *tight* is its own failure. At 40 concurrent
 *    admin renders: 48 gave a p50 of 130s, 96 gave 15.3s, and 192 gave
 *    16.4s. The reason a tight cap is so much worse than the arithmetic
 *    suggests is that a page render is not one batch of queries but a chain
 *    of them, and every sequential step pays the queue's full depth again.
 *    Past ~96 the database's own throughput is the limit (measured flat at
 *    ~290ms a query and ~330 queries a second across 8 to 96 concurrent),
 *    so a higher cap buys nothing and only widens the socket burst that
 *    this exists to stop.
 *
 * 2. **A deadline on every request.** undici's default body timeout is five
 *    minutes. Nothing a page render waits on is worth five minutes, and a
 *    socket stuck that long holds a slot the requests behind it need. The
 *    deadline covers the wait for a slot as well as the request, or a
 *    request could sit in the queue for longer than the deadline it was
 *    given.
 *
 * 3. **A retry, for reads only.** A connect or socket error on a GET is
 *    safe to repeat; on anything else it is not, because this client also
 *    carries `record_payment_capture`, `claim_promo_code` and the credit
 *    ledger's RPCs, and a request that failed *after* the server acted is
 *    indistinguishable from one that never arrived. Those are idempotent by
 *    construction, but the idempotency is keyed on ids this layer cannot
 *    see, so the decision belongs to the caller and the default here is not
 *    to repeat a write. An HTTP status is never retried either -- a 500
 *    from PostgREST is an answer, not a lost packet.
 */

const DEFAULT_MAX_IN_FLIGHT = 96;
const DEFAULT_TIMEOUT_MS = 20_000;

function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

const MAX_IN_FLIGHT = positiveIntFromEnv("SUPABASE_MAX_IN_FLIGHT", DEFAULT_MAX_IN_FLIGHT);
const TIMEOUT_MS = positiveIntFromEnv("SUPABASE_REQUEST_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);

let inFlight = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiting.push(() => {
      inFlight++;
      resolve();
    });
  });
}

function release(): void {
  inFlight--;
  const next = waiting.shift();
  if (next) next();
}

/** Observability for the health panel and for tests -- never used to decide anything. */
export function supabaseFetchPressure(): {
  inFlight: number;
  queued: number;
  maxInFlight: number;
  timeoutMs: number;
} {
  return { inFlight, queued: waiting.length, maxInFlight: MAX_IN_FLIGHT, timeoutMs: TIMEOUT_MS };
}

/**
 * A transport-level failure -- the request did not get an answer. An HTTP
 * error status is deliberately not one of these: PostgREST answering 400 is
 * the database's verdict, and repeating it just asks twice.
 */
function isRetryableTransportError(error: unknown): boolean {
  const code = (error as { cause?: { code?: string }; code?: string } | null)?.cause?.code
    ?? (error as { code?: string } | null)?.code;
  if (typeof code === "string") {
    return (
      code === "UND_ERR_CONNECT_TIMEOUT" ||
      code === "UND_ERR_SOCKET" ||
      code === "ECONNRESET" ||
      code === "ECONNREFUSED" ||
      code === "ETIMEDOUT" ||
      code === "EAI_AGAIN" ||
      code === "EPIPE"
    );
  }
  return false;
}

function isReadOnly(init: RequestInit | undefined, input: RequestInfo | URL): boolean {
  const method =
    init?.method ??
    (typeof input === "object" && "method" in input ? (input as Request).method : undefined) ??
    "GET";
  const upper = method.toUpperCase();
  return upper === "GET" || upper === "HEAD";
}

/**
 * Merges the caller's own AbortSignal with our deadline, so a Next.js
 * request that is cancelled still cancels the socket rather than holding a
 * slot until the deadline. `AbortSignal.any` exists in Node 20+.
 */
function withDeadline(existing: AbortSignal | null | undefined, ms: number) {
  const timeout = AbortSignal.timeout(ms);
  if (!existing) return { signal: timeout };
  return { signal: AbortSignal.any([existing, timeout]) };
}

export async function resilientSupabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const attempts = isReadOnly(init, input) ? 2 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    await acquire();
    try {
      const { signal } = withDeadline(init?.signal, TIMEOUT_MS);
      return await fetch(input, { ...init, signal });
    } catch (error) {
      lastError = error;
      const retryable = isRetryableTransportError(error);
      if (!retryable || attempt === attempts - 1) break;
    } finally {
      release();
    }
    // Small jittered pause so a burst that just exhausted the origin's
    // sockets does not re-arrive as one burst a millisecond later.
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
  }

  throw lastError;
}
