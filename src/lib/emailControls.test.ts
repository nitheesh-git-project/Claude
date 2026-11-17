import { describe, expect, it } from "vitest";
import {
  DEFAULT_EMAIL_CONTROLS,
  applyKindSwitch,
  decideDelivery,
  isTestAddress,
  maskEmail,
  parseEmailControls,
  parseEmailControlsChange,
  type EmailControls,
} from "@/lib/emailControls";

const ok = (c: Partial<EmailControls> = {}) => ({ status: "ok" as const, controls: { ...DEFAULT_EMAIL_CONTROLS, ...c } });

describe("isTestAddress", () => {
  it("knows the reserved test domains", () => {
    for (const a of ["qa.patient.a@example.test", "x@example.com", "x@mail.example.org", "x@foo.invalid", "x@box.localhost", "x@a.example"]) {
      expect(isTestAddress(a), a).toBe(true);
    }
  });
  it("leaves real domains alone, including ones that only look similar", () => {
    for (const a of ["asha@gmail.com", "x@example.co.in", "x@myexample.com", "x@testing.in", "x@moverestorephysio.com"]) {
      expect(isTestAddress(a), a).toBe(false);
    }
  });
});

describe("decideDelivery", () => {
  it("never sends to a test address, whatever the switches say", () => {
    for (const kind of ["legal", "test"] as const) {
      expect(decideDelivery({ kind, to: "qa.admin@example.test", controls: ok() })).toEqual({ action: "skip", reason: "test_address" });
    }
  });

  it("sends as before when nothing is set", () => {
    expect(decideDelivery({ kind: "legal", to: "asha@gmail.com", controls: ok() })).toEqual({
      action: "send",
      to: "asha@gmail.com",
      subjectPrefix: null,
      redirected: false,
    });
  });

  it("does not let the master switch stop a legal email, only its own switch", () => {
    expect(decideDelivery({ kind: "legal", to: "asha@gmail.com", controls: ok({ sendingEnabled: false }) }).action).toBe("send");
    expect(decideDelivery({ kind: "legal", to: "asha@gmail.com", controls: ok({ disabledKinds: ["legal"] }) })).toEqual({
      action: "skip",
      reason: "kind_off",
    });
  });

  it("sends the test email while everything is off, but never redirects it", () => {
    const d = decideDelivery({ kind: "test", to: "me@gmail.com", controls: ok({ sendingEnabled: false, testInbox: "other@gmail.com" }) });
    expect(d).toEqual({ action: "send", to: "me@gmail.com", subjectPrefix: null, redirected: false });
  });

  it("redirects to the test inbox and names the real recipient", () => {
    expect(decideDelivery({ kind: "legal", to: "asha@gmail.com", controls: ok({ testInbox: "owner@gmail.com" }) })).toEqual({
      action: "send",
      to: "owner@gmail.com",
      subjectPrefix: "[Test, for asha@gmail.com]",
      redirected: true,
    });
  });

  it("an unreadable switch sends the legal email and skips the rest", () => {
    expect(decideDelivery({ kind: "legal", to: "asha@gmail.com", controls: { status: "unreadable" } }).action).toBe("send");
  });

  it("refuses something that is not an address", () => {
    expect(decideDelivery({ kind: "legal", to: "not an email", controls: ok() })).toEqual({ action: "skip", reason: "bad_address" });
  });
});

describe("maskEmail", () => {
  it("keeps the start and the domain", () => {
    expect(maskEmail("Asha.Rao@Gmail.com")).toBe("As***@gmail.com");
    expect(maskEmail("a@x.in")).toBe("a***@x.in");
    expect(maskEmail("nonsense")).toBe("***");
  });
});

describe("parseEmailControls", () => {
  it("falls back to the defaults and drops what it does not know", () => {
    expect(parseEmailControls(null)).toEqual(DEFAULT_EMAIL_CONTROLS);
    expect(parseEmailControls({ sending_enabled: false, test_inbox: "bad", disabled_kinds: ["legal", "legal", "nope", "test"] })).toEqual({
      sendingEnabled: false,
      testInbox: null,
      disabledKinds: ["legal"],
    });
  });
});

describe("parseEmailControlsChange", () => {
  it("takes exactly one change", () => {
    expect(parseEmailControlsChange({}).ok).toBe(false);
    expect(parseEmailControlsChange({ sendingEnabled: true, testInbox: null }).ok).toBe(false);
    expect(parseEmailControlsChange({ sendingEnabled: false })).toEqual({ ok: true, change: { field: "sending_enabled", value: false } });
  });
  it("clears test mode with blank or null, and refuses a test address as the inbox", () => {
    expect(parseEmailControlsChange({ testInbox: "  " })).toEqual({ ok: true, change: { field: "test_inbox", value: null } });
    expect(parseEmailControlsChange({ testInbox: " me@gmail.com " })).toEqual({ ok: true, change: { field: "test_inbox", value: "me@gmail.com" } });
    expect(parseEmailControlsChange({ testInbox: "qa@example.test" }).ok).toBe(false);
    expect(parseEmailControlsChange({ testInbox: "two@a.com, three@b.com" }).ok).toBe(false);
  });
  it("only switches a switchable kind", () => {
    expect(parseEmailControlsChange({ kind: "legal", enabled: false })).toEqual({ ok: true, change: { field: "kind", kind: "legal", enabled: false } });
    expect(parseEmailControlsChange({ kind: "test", enabled: false }).ok).toBe(false);
    expect(parseEmailControlsChange({ kind: "legal" }).ok).toBe(false);
  });
});

describe("applyKindSwitch", () => {
  it("adds and removes once", () => {
    expect(applyKindSwitch([], "legal", false)).toEqual(["legal"]);
    expect(applyKindSwitch(["legal"], "legal", false)).toEqual(["legal"]);
    expect(applyKindSwitch(["legal"], "legal", true)).toEqual([]);
  });
});
