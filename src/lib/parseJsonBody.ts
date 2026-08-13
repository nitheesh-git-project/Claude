import { NextRequest, NextResponse } from "next/server";

// request.json() throws on a missing/malformed body, and that throw isn't
// caught anywhere by default — it surfaces as a generic 500 instead of a
// clean 400. Routes that mutate state (most of this app's API surface) all
// need the same guard, so it lives here once instead of being copy-pasted.
export async function parseJsonBody<T>(
  request: NextRequest
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  try {
    const data = await request.json();
    // Syntactically valid JSON can still be `null`, an array, or a
    // primitive -- none of those are a throw, but every call site
    // destructures the result as an object, so let them through here
    // (as the same 400 shape a parse failure returns) rather than as an
    // uncaught TypeError further down in the route.
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return {
        data: null,
        error: NextResponse.json({ error: "Invalid request body." }, { status: 400 }),
      };
    }
    return { data: data as T, error: null };
  } catch {
    return {
      data: null,
      error: NextResponse.json({ error: "Invalid request body." }, { status: 400 }),
    };
  }
}
