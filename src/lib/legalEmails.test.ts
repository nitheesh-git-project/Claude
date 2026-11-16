import { describe, expect, it } from "vitest";
import {
  deletionCompletedEmail,
  deletionDeclinedEmail,
  deletionRequestedEmail,
  escapeHtml,
  grievanceAcknowledgedEmail,
  grievanceReceivedEmail,
  grievanceResolvedEmail,
  officerAlertEmail,
} from "./legalEmails";

const brand = { siteName: "MoveRestore Physiotherapy", siteUrl: "https://moverestorephysio.com" };

describe("legal emails", () => {
  it("every email names its reference in the subject and both bodies", () => {
    const all = [
      grievanceReceivedEmail(brand, { name: "Asha", reference: "GRV-ABC234", category: "payment" }),
      grievanceAcknowledgedEmail(brand, { name: "Asha", reference: "GRV-ABC234" }),
      grievanceResolvedEmail(brand, { name: "Asha", reference: "GRV-ABC234", resolution: "Refunded" }),
      deletionRequestedEmail(brand, { name: "Asha", reference: "DEL-ABC234" }),
      deletionCompletedEmail(brand, { name: "Asha", reference: "DEL-ABC234" }),
      deletionDeclinedEmail(brand, { name: "Asha", reference: "DEL-ABC234", reason: "Unpaid balance" }),
    ];
    for (const e of all) {
      const ref = /(GRV|DEL)-ABC234/.exec(e.subject)?.[0];
      expect(ref).toBeTruthy();
      expect(e.text).toContain(ref!);
      expect(e.html).toContain(ref!);
    }
  });

  it("states the legal timelines", () => {
    const r = grievanceReceivedEmail(brand, { name: "Asha", reference: "GRV-ABC234", category: "service" });
    expect(r.text).toMatch(/48 hours/);
    expect(r.text).toMatch(/30 days/);
    expect(deletionRequestedEmail(brand, { name: "Asha", reference: "DEL-ABC234" }).text).toMatch(/30 days/);
  });

  it("escapes everything a person typed before it reaches HTML", () => {
    const evil = '<script>alert("x")</script>';
    const alert = officerAlertEmail(brand, {
      kind: "grievance",
      reference: "GRV-ABC234",
      name: evil,
      email: "a@b.co",
      category: "other",
      message: evil,
    });
    expect(alert.html).not.toContain("<script>");
    expect(alert.html).toContain("&lt;script&gt;");
    expect(grievanceResolvedEmail(brand, { name: evil, reference: "GRV-ABC234", resolution: evil }).html).not.toContain("<script>");
    expect(escapeHtml(`a&b"'`)).toBe("a&amp;b&quot;&#39;");
  });

  it("links the officer to the queue", () => {
    const a = officerAlertEmail(brand, { kind: "deletion", reference: "DEL-ABC234", name: "Asha", email: "a@b.co", role: "patient", reason: null });
    expect(a.text).toContain("https://moverestorephysio.com/admin/dashboard?section=people&tab=data-requests");
    expect(a.subject).toMatch(/30 days/);
  });
});
