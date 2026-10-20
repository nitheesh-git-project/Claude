import { describe, expect, it } from "vitest";
import { whereThingsStandByline, whereThingsStandView } from "@/lib/whereThingsStand";
import type { WrittenSummary } from "@/lib/careStatus";

const written: WrittenSummary = {
  text: "Walking further each week.\nNext: the stairs at home.",
  eventId: "e1",
  setAt: "2026-10-15T05:00:00.000Z",
  setBy: "t1",
  setByRole: "therapist",
  profileKind: "ortho",
  stale: false,
};

describe("whereThingsStandView", () => {
  it("shows the written summary when there is one, keeping the generated text only as a draft", () => {
    const v = whereThingsStandView({ written, generated: "Pain is down from 6 to 3.", draft: "Your pain is down from 6 to 3." });
    expect(v).toEqual({
      source: "written",
      text: written.text,
      setAt: written.setAt,
      setByRole: "therapist",
      authorName: null,
      stale: false,
      draft: "Your pain is down from 6 to 3.",
    });
  });

  it("falls back to the generated wording, labelled, when nothing is written", () => {
    const v = whereThingsStandView({ written: null, generated: "Pain is down from 6 to 3.", draft: "Your pain is down from 6 to 3." });
    expect(v).toEqual({ source: "generated", text: "Pain is down from 6 to 3.", draft: "Your pain is down from 6 to 3." });
    expect(whereThingsStandByline(v, "patient")).toMatch(/automatically/);
    expect(whereThingsStandByline(v, "clinician")).toMatch(/nobody has written/);
  });

  it("is empty when neither exists, and ignores a blank written text", () => {
    expect(whereThingsStandView({ written: null, generated: null, draft: null })).toEqual({ source: "none", draft: null });
    expect(whereThingsStandView({ written: { ...written, text: "  " }, generated: null, draft: null }).source).toBe("none");
  });

  it("names the clinic when an admin wrote it, and the physiotherapist by reader otherwise", () => {
    const byClinic = whereThingsStandView({ written: { ...written, setByRole: "admin" }, generated: null, draft: null });
    expect(whereThingsStandByline(byClinic, "patient")).toBe("The clinic");
    const byPhysio = whereThingsStandView({ written, generated: null, draft: null });
    expect(whereThingsStandByline(byPhysio, "patient")).toBe("Your physiotherapist");
    expect(whereThingsStandByline(byPhysio, "clinician")).toBe("The physiotherapist");
  });

  it("names the physiotherapist when the page looked the name up, and never for the clinic's own text", () => {
    const named = whereThingsStandView({ written, authorName: "  Dr Farhan Sheikh ", generated: null, draft: null });
    expect(named.source === "written" && named.authorName).toBe("Dr Farhan Sheikh");
    expect(whereThingsStandByline(named, "patient")).toBe("Dr Farhan Sheikh");
    expect(whereThingsStandByline(named, "clinician")).toBe("Dr Farhan Sheikh");
    // An admin's text is the clinic's even if a name is passed (privacy: no admin names).
    const byClinic = whereThingsStandView({ written: { ...written, setByRole: "admin" }, authorName: "An Admin", generated: null, draft: null });
    expect(byClinic.source === "written" && byClinic.authorName).toBeNull();
    expect(whereThingsStandByline(byClinic, "patient")).toBe("The clinic");
  });
});
