import { describe, expect, it } from "vitest";
import { issueSetPasswordLink, unknowablePassword } from "@/lib/accessLink";

function fakeAdmin(result: { data: unknown; error: unknown }) {
  return { auth: { admin: { generateLink: async () => result } } } as never;
}

describe("issueSetPasswordLink", () => {
  it("returns a path to the reset page carrying the one-time token, never a password", async () => {
    const out = await issueSetPasswordLink(
      fakeAdmin({ data: { properties: { hashed_token: "abc/def+1" } }, error: null }),
      "someone@example.com"
    );
    expect(out).toEqual({
      ok: true,
      path: "/reset-password?token_hash=abc%2Fdef%2B1&type=recovery",
    });
  });

  it("reports a failure rather than inventing a link", async () => {
    const out = await issueSetPasswordLink(
      fakeAdmin({ data: null, error: { message: "User not found" } }),
      "someone@example.com"
    );
    expect(out).toEqual({ ok: false, error: "User not found" });
  });
});

describe("unknowablePassword", () => {
  it("is long, random and different every time", () => {
    const a = unknowablePassword();
    const b = unknowablePassword();
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).not.toBe(b);
  });
});
