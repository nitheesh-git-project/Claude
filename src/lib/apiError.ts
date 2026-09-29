import { NextResponse } from "next/server";

/**
 * A server-side failure, reported safely.
 *
 * 97 route handlers answered `{ error: error.message }` with whatever
 * Postgres had said. That is three separate problems in one line:
 *
 * 1. **It leaks the schema.** A constraint name, a column name, a table
 *    name, and -- on a NOT NULL violation -- PostgREST includes the entire
 *    failing row in the detail, which on `profiles` means somebody's name,
 *    email, phone and patient code. These routes answer patients and
 *    partner hospitals, not just admins.
 * 2. **Nobody can act on it.** "new row violates row-level security policy"
 *    and "duplicate key value violates unique constraint
 *    patient_addresses_one_default" are not sentences a patient can do
 *    anything with, and they arrive where a plain explanation should be.
 * 3. **It goes nowhere.** The real error was sent to the browser and never
 *    logged, so the one place it could have been diagnosed from did not
 *    have it.
 *
 * This is the same posture `RouteError` already takes for a thrown render --
 * show a reference, keep the detail server-side -- applied to the API half.
 *
 * The reference is short and speakable on purpose: the whole point is that
 * somebody can read it down a phone line to the clinic, and the clinic can
 * find the matching line in the server log. It is random rather than derived
 * from the error, so it identifies *this occurrence* rather than a class.
 */
function reference(): string {
  // Base36, uppercase, no vowels removed -- short enough to read aloud and
  // long enough not to collide within a log window anybody would search.
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export type ApiErrorOptions = {
  /** What the caller should see. Defaults to a neutral sentence. */
  message?: string;
  status?: number;
};

/**
 * Log the real failure, answer with a safe one.
 *
 * `context` names the operation, not the data -- it is written into the
 * server log beside the reference, and it is what makes the log line
 * findable. Never put a patient's details in it.
 */
export function serverError(
  context: string,
  cause: unknown,
  options: ApiErrorOptions = {}
): NextResponse {
  const ref = reference();
  // The full error, on the server, where it is useful and where it is not
  // being handed to whoever made the request.
  console.error(`[${ref}] ${context}:`, cause);

  return NextResponse.json(
    {
      error:
        options.message ??
        "Something went wrong on our side. Nothing you were doing has been lost - please try again.",
      reference: ref,
    },
    { status: options.status ?? 500 }
  );
}
