import { describe, expect, it } from "vitest";
import {
  DEV_REACHOUT_STATUSES,
  MAX_DEV_REACHOUT_MESSAGE_LENGTH,
  MAX_DEV_REACHOUT_NAME_LENGTH,
  MAX_DEV_REACHOUT_NOTE_LENGTH,
  devContactFromRow,
  firstName,
  isDevReachoutStatus,
  validateDevReachout,
} from "./devReachout";

const valid = {
  name: "Priya Nair",
  email: "priya@example.com",
  phone: "+919876543210",
  message: "Loved the app. Could the booking page show therapist photos?",
};

function failure(input: unknown): string {
  const result = validateDevReachout(input);
  if (result.ok) throw new Error("expected a refusal");
  return result.error;
}

describe("validateDevReachout", () => {
  it("accepts a complete, valid submission and trims it", () => {
    const result = validateDevReachout({
      ...valid,
      name: "  Priya Nair  ",
      message: "  hello  ",
    });
    expect(result).toEqual({
      ok: true,
      spam: false,
      value: { ...valid, name: "Priya Nair", message: "hello" },
    });
  });

  it("treats the phone as optional", () => {
    for (const phone of [undefined, null, "", "   "]) {
      const result = validateDevReachout({ ...valid, phone });
      expect(result.ok && !result.spam && result.value.phone).toBeNull();
    }
  });

  it("asks for each missing required field by name", () => {
    expect(failure({ ...valid, name: "" })).toMatch(/name/i);
    expect(failure({ ...valid, email: "" })).toMatch(/email/i);
    expect(failure({ ...valid, message: "" })).toMatch(/words/i);
    expect(failure({ ...valid, name: undefined })).toMatch(/name/i);
  });

  it("treats whitespace-only input as missing", () => {
    expect(failure({ ...valid, name: "   " })).toMatch(/name/i);
    expect(failure({ ...valid, email: " \t " })).toMatch(/email/i);
    expect(failure({ ...valid, message: "\n\n  " })).toMatch(/words/i);
  });

  it("refuses over-long text with the limit in the sentence", () => {
    expect(failure({ ...valid, name: "a".repeat(MAX_DEV_REACHOUT_NAME_LENGTH + 1) })).toContain(
      String(MAX_DEV_REACHOUT_NAME_LENGTH)
    );
    expect(
      failure({ ...valid, message: "a".repeat(MAX_DEV_REACHOUT_MESSAGE_LENGTH + 1) })
    ).toContain(String(MAX_DEV_REACHOUT_MESSAGE_LENGTH));
    expect(failure({ ...valid, email: `${"a".repeat(250)}@b.co` })).toMatch(/email/i);
  });

  it("accepts text exactly at the limit", () => {
    const result = validateDevReachout({
      ...valid,
      name: "a".repeat(MAX_DEV_REACHOUT_NAME_LENGTH),
      message: "b".repeat(MAX_DEV_REACHOUT_MESSAGE_LENGTH),
    });
    expect(result.ok).toBe(true);
  });

  it("refuses a malformed email", () => {
    for (const email of ["nope", "a@b", "a b@c.com", "@c.com", "a@@c.com"]) {
      expect(failure({ ...valid, email }), email).toMatch(/email/i);
    }
  });

  it("refuses a phone that cannot be dialled, but only when one is given", () => {
    expect(failure({ ...valid, phone: "+91123" })).toMatch(/number/i);
    expect(failure({ ...valid, phone: "abc" })).toMatch(/number/i);
  });

  it("reports a filled honeypot as spam, not as an error", () => {
    expect(validateDevReachout({ ...valid, website: "http://spam.example" })).toEqual({
      ok: true,
      spam: true,
    });
    // Even when the rest is unusable: a bot gets no hint about what failed.
    expect(validateDevReachout({ website: "x" })).toEqual({ ok: true, spam: true });
  });

  it("ignores a blank honeypot", () => {
    const result = validateDevReachout({ ...valid, website: "   " });
    expect(result.ok && !result.spam).toBe(true);
  });

  it("does not throw on a body that is not an object", () => {
    for (const body of [null, undefined, "x", 42, []]) {
      expect(validateDevReachout(body).ok).toBe(false);
    }
  });

  it("writes errors that do not blame the visitor", () => {
    const sentences = [
      failure({}),
      failure({ ...valid, email: "x" }),
      failure({ ...valid, phone: "abc" }),
      failure({ ...valid, message: "" }),
    ];
    for (const sentence of sentences) {
      expect(sentence).not.toMatch(/\b(invalid|wrong|illegal|failed|you (must|did))\b/i);
      expect(sentence.endsWith(".")).toBe(true);
    }
  });
});

describe("firstName", () => {
  it("takes the first word", () => {
    expect(firstName("Priya Nair")).toBe("Priya");
    expect(firstName("  Priya   ")).toBe("Priya");
  });

  it("never leaves the success line with a hole in it", () => {
    expect(firstName("")).toBe("there");
    expect(firstName("   ")).toBe("there");
  });
});

describe("statuses and limits", () => {
  it("knows exactly two statuses", () => {
    expect([...DEV_REACHOUT_STATUSES]).toEqual(["new", "contacted"]);
    expect(isDevReachoutStatus("new")).toBe(true);
    expect(isDevReachoutStatus("contacted")).toBe(true);
    expect(isDevReachoutStatus("declined")).toBe(false);
    expect(isDevReachoutStatus(undefined)).toBe(false);
  });

  it("keeps the note limit equal to the column's CHECK", () => {
    expect(MAX_DEV_REACHOUT_NOTE_LENGTH).toBe(2000);
  });
});

describe("devContactFromRow", () => {
  it("defaults to on with no address when the row cannot be read", () => {
    expect(devContactFromRow(null)).toEqual({ enabled: true, email: "" });
    expect(devContactFromRow(undefined)).toEqual({ enabled: true, email: "" });
    expect(devContactFromRow({})).toEqual({ enabled: true, email: "" });
  });

  it("honours an explicit off", () => {
    expect(devContactFromRow({ dev_contact_enabled: false }).enabled).toBe(false);
  });

  it("keeps a usable address and drops a blank or malformed one", () => {
    expect(devContactFromRow({ dev_contact_email: " me@example.com " }).email).toBe(
      "me@example.com"
    );
    expect(devContactFromRow({ dev_contact_email: "" }).email).toBe("");
    expect(devContactFromRow({ dev_contact_email: "not an email" }).email).toBe("");
  });
});
