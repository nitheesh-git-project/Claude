import { describe, expect, it } from "vitest";
import {
  DEFAULT_WHATSAPP_CONTROLS,
  applyWhatsAppKindSwitch,
  decideWhatsApp,
  hasConsent,
  isStopMessage,
  maskNumber,
  parseWhatsAppControls,
  parseWhatsAppControlsChange,
  toWhatsAppNumber,
  type WhatsAppControls,
} from "@/lib/whatsappRules";
import {
  WHATSAPP_TEMPLATES,
  bookingCancelledMessage,
  bookingConfirmedMessage,
  param,
  reminderMessage,
  renderTemplate,
} from "@/lib/whatsappTemplates";
import type { BookingFacts } from "@/lib/bookingEmails";

const on = (c: Partial<WhatsAppControls> = {}) => ({ status: "ok" as const, controls: { ...DEFAULT_WHATSAPP_CONTROLS, sendingEnabled: true, ...c } });
const base = { kind: "booking" as const, phone: "+91 98765 43210", testAccount: false, consented: true };

describe("toWhatsAppNumber", () => {
  it("reads the ways a number is stored", () => {
    expect(toWhatsAppNumber("+91 98765 43210")).toBe("919876543210");
    expect(toWhatsAppNumber("9876543210")).toBe("919876543210");
    expect(toWhatsAppNumber("919876543210")).toBe("919876543210");
    expect(toWhatsAppNumber("+44 7700 900123")).toBe("447700900123");
  });
  it("refuses what it cannot be sure of", () => {
    for (const v of [null, "", "12345", "0123456789", "+1", "abc"]) expect(toWhatsAppNumber(v), String(v)).toBeNull();
  });
});

describe("decideWhatsApp", () => {
  it("starts off: the default switches send nothing", () => {
    expect(decideWhatsApp({ ...base, controls: { status: "ok", controls: DEFAULT_WHATSAPP_CONTROLS } })).toEqual({ action: "skip", reason: "switched_off" });
  });
  it("needs the patient's yes", () => {
    expect(decideWhatsApp({ ...base, consented: false, controls: on() })).toEqual({ action: "skip", reason: "no_consent" });
  });
  it("never messages a test account, or a number it cannot read", () => {
    expect(decideWhatsApp({ ...base, testAccount: true, controls: on() })).toEqual({ action: "skip", reason: "test_account" });
    expect(decideWhatsApp({ ...base, phone: "12", controls: on() })).toEqual({ action: "skip", reason: "bad_number" });
  });
  it("skips on unreadable switches and on a kind switched off", () => {
    expect(decideWhatsApp({ ...base, controls: { status: "unreadable" } })).toEqual({ action: "skip", reason: "controls_unreadable" });
    expect(decideWhatsApp({ ...base, controls: on({ disabledKinds: ["booking"] }) })).toEqual({ action: "skip", reason: "kind_off" });
  });
  it("sends when everything says yes, and redirects in test mode", () => {
    expect(decideWhatsApp({ ...base, controls: on() })).toEqual({ action: "send", to: "919876543210", redirected: false });
    expect(decideWhatsApp({ ...base, controls: on({ testNumber: "919999988888" }) })).toEqual({ action: "send", to: "919999988888", redirected: true });
  });
});

describe("consent and STOP", () => {
  it("takes the latest choice, and none is no", () => {
    expect(hasConsent([])).toBe(false);
    expect(hasConsent([{ choice: "granted", created_at: "2026-11-01T00:00:00Z" }])).toBe(true);
    expect(
      hasConsent([
        { choice: "granted", created_at: "2026-11-01T00:00:00Z" },
        { choice: "withdrawn", created_at: "2026-11-02T00:00:00Z" },
      ])
    ).toBe(false);
  });
  it("hears STOP in its usual forms", () => {
    for (const t of ["STOP", "stop", " Stop. ", "UNSUBSCRIBE", "band karo", "बंद"]) expect(isStopMessage(t), t).toBe(true);
    for (const t of ["stop by at 5?", "please don't stop", "", null]) expect(isStopMessage(t), String(t)).toBe(false);
  });
});

describe("the switches", () => {
  it("parse from the row, defaulting to off", () => {
    expect(parseWhatsAppControls(null)).toEqual(DEFAULT_WHATSAPP_CONTROLS);
    expect(parseWhatsAppControls({ sending_enabled: true, test_number: "919876543210", disabled_kinds: ["reminder", "nope", "reminder"] })).toEqual({
      sendingEnabled: true,
      testNumber: "919876543210",
      disabledKinds: ["reminder"],
    });
  });
  it("take one change at a time", () => {
    expect(parseWhatsAppControlsChange({}).ok).toBe(false);
    expect(parseWhatsAppControlsChange({ sendingEnabled: true })).toEqual({ ok: true, change: { field: "sending_enabled", value: true } });
    expect(parseWhatsAppControlsChange({ testNumber: "+91 98765 43210" })).toEqual({ ok: true, change: { field: "test_number", value: "919876543210" } });
    expect(parseWhatsAppControlsChange({ testNumber: "" })).toEqual({ ok: true, change: { field: "test_number", value: null } });
    expect(parseWhatsAppControlsChange({ testNumber: "call me" }).ok).toBe(false);
    expect(parseWhatsAppControlsChange({ kind: "legal", enabled: false }).ok).toBe(false);
    expect(applyWhatsAppKindSwitch([], "reminder", false)).toEqual(["reminder"]);
  });
  it("mask a number for the log", () => {
    expect(maskNumber("919876543210")).toBe("+91 ***** **210");
  });
});

const facts: BookingFacts = {
  name: "Asha Rao",
  when: "24 Nov 2026, 6:00 pm IST",
  durationMinutes: 45,
  mode: "online",
  therapistName: "Dr. Meera",
  payment: { kind: "paid", amountPaise: 49900 },
  dashboardUrl: "https://moverestorephysio.com/patient/dashboard",
};

describe("templates", () => {
  it("fill every placeholder each template has, with one-line values Meta accepts", () => {
    const messages = [
      bookingConfirmedMessage(facts),
      bookingCancelledMessage({ ...facts, refund: { kind: "refunded", amountPaise: 49900 } }),
      reminderMessage(facts, "reminder_24h"),
      reminderMessage({ ...facts, mode: "home_visit" }, "reminder_1h"),
    ];
    for (const m of messages) {
      const placeholders = WHATSAPP_TEMPLATES[m.template].body.match(/\{\{\d+\}\}/g) ?? [];
      expect(m.params, m.template).toHaveLength(placeholders.length);
      for (const p of m.params) {
        expect(p.length).toBeGreaterThan(0);
        expect(p).not.toMatch(/[\n\t]| {5}/);
      }
      expect(renderTemplate(m)).not.toMatch(/\{\{/);
    }
    expect(renderTemplate(bookingConfirmedMessage(facts))).toBe(
      "Hello Asha, your 45-minute video session on 24 Nov 2026, 6:00 pm IST with Dr. Meera is confirmed. Paid: ₹499. You can join or manage it from your dashboard: https://moverestorephysio.com/patient/dashboard See you then."
    );
  });

  it("each sample matches its parameters, ready for the Meta submission form", () => {
    for (const t of Object.values(WHATSAPP_TEMPLATES)) {
      const n = (t.body.match(/\{\{\d+\}\}/g) ?? []).length;
      expect(t.params, t.name).toHaveLength(n);
      expect(t.sample, t.name).toHaveLength(n);
      expect(t.name).toMatch(/^[a-z0-9_]+$/);
      // Meta refuses a body that starts or ends with a variable.
      expect(t.body.trim(), t.name).not.toMatch(/^\{\{|\}\}$/);
    }
  });

  it("clean a parameter", () => {
    expect(param("a\nb\t c      d")).toBe("a b c d");
    expect(param("   ")).toBe("-");
    expect(param(null, "there")).toBe("there");
  });
});
