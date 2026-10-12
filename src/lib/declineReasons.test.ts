import { describe, it, expect } from "vitest";
import {
  parseDeclineReason,
  findPriorDecline,
  phoneKey,
  declineReasonLabel,
  DECLINE_REASONS_BY_KIND,
  DECLINE_REASON_LABELS,
  DECLINE_NOTE_MAX_LENGTH,
  type DeclinedApplication,
} from "./declineReasons";

describe("parseDeclineReason", () => {
  it("requires a reason", () => {
    expect(parseDeclineReason("patient", {}).ok).toBe(false);
    expect(parseDeclineReason("patient", { reasonCode: "" }).ok).toBe(false);
  });

  it("accepts a listed reason with no note", () => {
    expect(parseDeclineReason("therapist", { reasonCode: "credentials_unverified" })).toEqual({
      ok: true,
      reasonCode: "credentials_unverified",
      note: null,
    });
  });

  it("refuses a reason not offered for that kind", () => {
    // A hospital inquiry has no credentials to verify.
    expect(parseDeclineReason("hospital", { reasonCode: "credentials_unverified" }).ok).toBe(false);
    expect(parseDeclineReason("patient", { reasonCode: "made_up" }).ok).toBe(false);
  });

  it("needs ten characters of note for Other", () => {
    expect(parseDeclineReason("patient", { reasonCode: "other", note: "  no   " }).ok).toBe(false);
    expect(parseDeclineReason("patient", { reasonCode: "other", note: "Spam signup, fake name" })).toEqual({
      ok: true,
      reasonCode: "other",
      note: "Spam signup, fake name",
    });
  });

  it("trims the note and caps it", () => {
    const r = parseDeclineReason("patient", { reasonCode: "duplicate", note: "  same as last week  " });
    expect(r).toEqual({ ok: true, reasonCode: "duplicate", note: "same as last week" });
    expect(
      parseDeclineReason("patient", { reasonCode: "duplicate", note: "x".repeat(DECLINE_NOTE_MAX_LENGTH + 1) }).ok
    ).toBe(false);
    expect(parseDeclineReason("patient", { reasonCode: "duplicate", note: 42 }).ok).toBe(false);
  });

  it("offers every kind an Other, and labels every code", () => {
    for (const codes of Object.values(DECLINE_REASONS_BY_KIND)) {
      expect(codes).toContain("other");
      for (const code of codes) expect(DECLINE_REASON_LABELS[code]).toBeTruthy();
    }
  });
});

describe("declineReasonLabel", () => {
  it("labels a known code and passes an unknown one through", () => {
    expect(declineReasonLabel("duplicate")).toBe("Duplicate");
    expect(declineReasonLabel("legacy_code")).toBe("legacy_code");
    expect(declineReasonLabel(null)).toBe("No reason recorded");
  });
});

describe("phoneKey", () => {
  it("matches a number with and without its country code", () => {
    expect(phoneKey("+91 98765 43210")).toBe(phoneKey("9876543210"));
  });
  it("ignores numbers too short to mean anything", () => {
    expect(phoneKey("12345")).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });
});

function decline(over: Partial<DeclinedApplication>): DeclinedApplication {
  return {
    id: "d1",
    kind: "patient",
    source_id: "old-user",
    full_name: "Asha",
    email: "asha@example.test",
    phone: "+91 98765 43210",
    details: null,
    applied_at: null,
    reason_code: "incomplete_details",
    reason_note: null,
    declined_by: null,
    declined_at: "2026-09-01T10:00:00Z",
    ...over,
  };
}

describe("findPriorDecline", () => {
  it("matches on email regardless of case", () => {
    const d = decline({});
    expect(findPriorDecline({ email: "ASHA@example.test" }, [d], ["patient", "therapist"])).toBe(d);
  });

  it("matches on phone when the email differs", () => {
    const d = decline({ email: "other@example.test" });
    expect(findPriorDecline({ email: "new@example.test", phone: "9876543210" }, [d], ["patient"])).toBe(d);
  });

  it("picks the most recent of several", () => {
    const older = decline({ id: "a", declined_at: "2026-08-01T00:00:00Z" });
    const newer = decline({ id: "b", declined_at: "2026-09-15T00:00:00Z" });
    expect(findPriorDecline({ email: "asha@example.test" }, [older, newer], ["patient"])?.id).toBe("b");
  });

  it("only looks at the kinds asked for", () => {
    const d = decline({ kind: "hospital" });
    expect(findPriorDecline({ email: "asha@example.test" }, [d], ["patient", "therapist"])).toBeNull();
  });

  it("does not count the row's own decline as before", () => {
    const d = decline({ source_id: "lead-1", kind: "hospital" });
    expect(findPriorDecline({ id: "lead-1", email: "asha@example.test" }, [d], ["hospital"])).toBeNull();
  });

  it("returns null with nothing to match on", () => {
    expect(findPriorDecline({ email: null, phone: null }, [decline({})], ["patient"])).toBeNull();
  });
});
