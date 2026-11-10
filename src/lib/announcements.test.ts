import { describe, expect, it } from "vitest";
import {
  ANNOUNCEMENT_DESTINATIONS,
  ANNOUNCEMENT_MAX_LIVE_PER_AUDIENCE,
  announcementImagePath,
  announcementStatus,
  announcementsForDashboard,
  clinicInputToIso,
  describeMinutes,
  durationToMinutes,
  isoToClinicInput,
  parseAnnouncementInput,
  readCtaTargets,
  resolveCta,
  safeImageUrl,
  safeWebLink,
  stillLive,
  type AnnouncementRow,
} from "./announcements";

const NOW = Date.parse("2026-11-10T06:00:00Z");
const hour = 3600_000;

function row(over: Partial<AnnouncementRow> = {}): AnnouncementRow {
  return {
    id: "a1",
    title: "Happy Diwali",
    body: null,
    banner_image_url: null,
    popup_image_url: null,
    audiences: ["patient"],
    cta_label: null,
    cta_targets: {},
    published_at: new Date(NOW - hour).toISOString(),
    starts_at: new Date(NOW - hour).toISOString(),
    ends_at: new Date(NOW + hour).toISOString(),
    duration_minutes: 120,
    dismissible: true,
    auto_open: false,
    sort_order: 0,
    created_at: new Date(NOW - hour).toISOString(),
    updated_at: new Date(NOW - hour).toISOString(),
    ...over,
  };
}

describe("announcementStatus", () => {
  it("is a draft until published, then follows the clock", () => {
    expect(announcementStatus(row({ published_at: null }), NOW)).toBe("draft");
    expect(announcementStatus(row(), NOW)).toBe("live");
    expect(announcementStatus(row({ starts_at: new Date(NOW + 1).toISOString() }), NOW)).toBe("scheduled");
    expect(announcementStatus(row({ ends_at: new Date(NOW).toISOString() }), NOW)).toBe("ended");
  });

  it("never calls a published row it cannot date live", () => {
    expect(announcementStatus(row({ ends_at: null }), NOW)).toBe("ended");
    expect(announcementStatus(row({ starts_at: "not a date" }), NOW)).toBe("ended");
  });
});

describe("announcementsForDashboard", () => {
  it("shows a role only what is live and ticked for it", () => {
    const rows = [
      row({ id: "p", audiences: ["patient"] }),
      row({ id: "t", audiences: ["therapist"] }),
      row({ id: "draft", published_at: null }),
      row({ id: "later", starts_at: new Date(NOW + hour).toISOString(), ends_at: new Date(NOW + 2 * hour).toISOString() }),
      row({ id: "over", ends_at: new Date(NOW - 1).toISOString() }),
    ];
    expect(announcementsForDashboard(rows, [], "patient", NOW).map((a) => a.id)).toEqual(["p"]);
    expect(announcementsForDashboard(rows, [], "therapist", NOW).map((a) => a.id)).toEqual(["t"]);
    expect(announcementsForDashboard(rows, [], "hospital", NOW)).toEqual([]);
  });

  it("leaves out one the person closed, unless it may not be closed", () => {
    const receipts = [
      { announcement_id: "a", dismissed_at: "2026-11-10T05:00:00Z", popup_seen_at: null },
      { announcement_id: "b", dismissed_at: "2026-11-10T05:00:00Z", popup_seen_at: null },
    ];
    const rows = [row({ id: "a" }), row({ id: "b", dismissible: false })];
    // "b" was closed before the admin unticked the box: everyone must see it.
    expect(announcementsForDashboard(rows, receipts, "patient", NOW).map((a) => a.id)).toEqual(["b"]);
  });

  it("opens a pop-up by itself only when asked and not yet seen", () => {
    const rows = [row({ id: "a", auto_open: true }), row({ id: "b", auto_open: true }), row({ id: "c" })];
    const receipts = [{ announcement_id: "b", dismissed_at: null, popup_seen_at: "2026-11-10T05:00:00Z" }];
    const list = announcementsForDashboard(rows, receipts, "patient", NOW);
    expect(Object.fromEntries(list.map((a) => [a.id, a.autoOpen]))).toEqual({ a: true, b: false, c: false });
  });

  it("orders by the admin's order, then newest start, and caps the slot", () => {
    const rows = [
      row({ id: "second", sort_order: 2 }),
      row({ id: "first", sort_order: 1 }),
      row({ id: "tie-old", sort_order: 5, starts_at: new Date(NOW - 3 * hour).toISOString() }),
      row({ id: "tie-new", sort_order: 5, starts_at: new Date(NOW - 2 * hour).toISOString() }),
    ];
    expect(announcementsForDashboard(rows, [], "patient", NOW).map((a) => a.id)).toEqual([
      "first",
      "second",
      "tie-new",
      "tie-old",
    ]);
    const many = Array.from({ length: 20 }, (_, i) => row({ id: `n${String(i).padStart(2, "0")}`, sort_order: i }));
    expect(announcementsForDashboard(many, [], "patient", NOW)).toHaveLength(ANNOUNCEMENT_MAX_LIVE_PER_AUDIENCE);
  });

  it("resolves the button for the one role looking, and drops an unsafe picture", () => {
    const [a] = announcementsForDashboard(
      [
        row({
          audiences: ["patient", "therapist"],
          banner_image_url: "javascript:alert(1)",
          popup_image_url: "https://cdn.example.test/p.jpg",
          cta_label: "Open",
          cta_targets: { patient: { kind: "screen", key: "book" }, therapist: { kind: "screen", key: "availability" } },
        }),
      ],
      [],
      "therapist",
      NOW
    );
    expect(a.cta).toEqual({ label: "Open", href: "/therapist/dashboard/availability", external: false });
    expect(a.bannerImageUrl).toBeNull();
    expect(a.popupImageUrl).toBe("https://cdn.example.test/p.jpg");
  });

  it("stillLive drops one whose end has passed since the page rendered", () => {
    const list = announcementsForDashboard([row()], [], "patient", NOW);
    expect(stillLive(list, NOW + 30 * 60_000)).toHaveLength(1);
    expect(stillLive(list, NOW + hour)).toHaveLength(0);
  });
});

describe("buttons", () => {
  it("accepts only a screen of that dashboard, or an https link", () => {
    expect(
      readCtaTargets({
        patient: { kind: "screen", key: "book" },
        // A patient screen is not a therapist destination.
        therapist: { kind: "screen", key: "book" },
        hospital: { kind: "web", url: "https://example.test/a" },
        admin: { kind: "screen", key: "home" },
      })
    ).toEqual({ patient: { kind: "screen", key: "book" }, hospital: { kind: "web", url: "https://example.test/a" } });
    expect(readCtaTargets("nonsense")).toEqual({});
  });

  it("has no button without both words and a destination", () => {
    expect(resolveCta("", { patient: { kind: "screen", key: "book" } }, "patient")).toBeNull();
    expect(resolveCta("Open", {}, "patient")).toBeNull();
    expect(resolveCta(" Open ", { patient: { kind: "web", url: "https://example.test" } }, "patient")).toEqual({
      label: "Open",
      href: "https://example.test",
      external: true,
    });
  });

  it("refuses links a browser should not follow from the clinic's own button", () => {
    expect(safeWebLink("https://example.test/path?x=1")).toBe("https://example.test/path?x=1");
    for (const bad of ["http://example.test", "javascript:alert(1)", "/patient/dashboard", "https://", "https://a b.test", "", 4]) {
      expect(safeWebLink(bad)).toBeNull();
    }
    expect(safeImageUrl("https://x.test/a.png?v=1")).toBe("https://x.test/a.png?v=1");
    expect(safeImageUrl("data:image/png;base64,AAAA")).toBeNull();
  });

  it("every destination is inside its own dashboard", () => {
    for (const [audience, list] of Object.entries(ANNOUNCEMENT_DESTINATIONS)) {
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list.map((d) => d.key)).size).toBe(list.length);
      for (const d of list) expect(d.href.startsWith(`/${audience}/dashboard`)).toBe(true);
    }
  });
});

describe("parseAnnouncementInput", () => {
  const base = { title: "  Happy   Diwali ", audiences: ["therapist", "patient", "admin"], durationMinutes: 60 };

  it("publishes now for the given time, in a fixed audience order", () => {
    const parsed = parseAnnouncementInput(base, NOW);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.value.title).toBe("Happy Diwali");
    expect(parsed.value.audiences).toEqual(["patient", "therapist"]);
    expect(parsed.value.published_at).toBe(new Date(NOW).toISOString());
    expect(parsed.value.starts_at).toBe(new Date(NOW).toISOString());
    expect(parsed.value.ends_at).toBe(new Date(NOW + hour).toISOString());
    expect(parsed.value.duration_minutes).toBe(60);
    expect(parsed.value.dismissible).toBe(true);
    expect(parsed.value.auto_open).toBe(false);
  });

  it("keeps a draft's duration without dating it, so publishing later runs the full time", () => {
    const parsed = parseAnnouncementInput({ ...base, publish: false }, NOW);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.value.published_at).toBeNull();
    expect(parsed.value.starts_at).toBeNull();
    expect(parsed.value.ends_at).toBeNull();
    expect(parsed.value.duration_minutes).toBe(60);
  });

  it("schedules from a chosen start, and an exact end wins over a duration", () => {
    const startsAt = new Date(NOW + 24 * hour).toISOString();
    const scheduled = parseAnnouncementInput({ ...base, startsAt }, NOW);
    if (!scheduled.ok) throw new Error(scheduled.error);
    expect(scheduled.value.starts_at).toBe(startsAt);
    expect(scheduled.value.ends_at).toBe(new Date(NOW + 25 * hour).toISOString());

    const endsAt = new Date(NOW + 5 * hour).toISOString();
    const until = parseAnnouncementInput({ ...base, endsAt }, NOW);
    if (!until.ok) throw new Error(until.error);
    expect(until.value.ends_at).toBe(endsAt);
    expect(until.value.duration_minutes).toBeNull();
  });

  it("an edit of a published one keeps its publication time and cannot become a draft", () => {
    const publishedAt = "2026-11-01T00:00:00.000Z";
    const edit = parseAnnouncementInput(base, NOW, publishedAt);
    if (!edit.ok) throw new Error(edit.error);
    expect(edit.value.published_at).toBe(publishedAt);
    const back = parseAnnouncementInput({ ...base, publish: false }, NOW, publishedAt);
    expect(back.ok).toBe(false);
  });

  it("says what is wrong in a sentence", () => {
    const errors = (input: Record<string, unknown>) => {
      const parsed = parseAnnouncementInput(input, NOW);
      return parsed.ok ? "" : parsed.error;
    };
    expect(errors({ ...base, title: " " })).toMatch(/title/i);
    expect(errors({ ...base, title: "x".repeat(81) })).toMatch(/80/);
    expect(errors({ ...base, audiences: ["admin"] })).toMatch(/at least one dashboard/);
    expect(errors({ title: "t", audiences: ["patient"] })).toMatch(/how long/);
    expect(errors({ ...base, durationMinutes: 2 })).toMatch(/at least 5 minutes/);
    expect(errors({ ...base, durationMinutes: 400 * 24 * 60 })).toMatch(/one year/);
    expect(errors({ ...base, durationMinutes: undefined, endsAt: new Date(NOW - 1).toISOString() })).toMatch(/after it starts|already passed/);
    expect(errors({ ...base, startsAt: "soon" })).toMatch(/could not be read/);
    expect(errors({ ...base, bannerImageUrl: "ftp://x" })).toMatch(/banner picture/);
    expect(errors({ ...base, ctaLabel: "Go", ctaTargets: { patient: { kind: "screen", key: "book" } } })).toMatch(
      /Therapists/
    );
    expect(
      errors({
        ...base,
        audiences: ["patient"],
        ctaLabel: "Go",
        ctaTargets: { patient: { kind: "web", url: "http://x.test" } },
      })
    ).toMatch(/https/);
    expect(errors({ ...base, body: "plain string" })).toMatch(/could not be read/);
  });

  it("drops destinations when there are no button words, and keeps a table in the body", () => {
    const parsed = parseAnnouncementInput(
      {
        ...base,
        ctaLabel: "  ",
        ctaTargets: { patient: { kind: "screen", key: "book" } },
        body: {
          type: "doc",
          content: [
            {
              type: "table",
              content: [
                { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Day" }] }] }] },
              ],
            },
          ],
        },
      },
      NOW
    );
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.value.cta_label).toBeNull();
    expect(parsed.value.cta_targets).toEqual({});
    expect(parsed.value.body).toContain('"table"');
  });
});

describe("times and pictures", () => {
  it("reads the form's date boxes as clinic time, both ways", () => {
    expect(clinicInputToIso("2026-11-14T21:00")).toBe("2026-11-14T15:30:00.000Z");
    expect(isoToClinicInput("2026-11-14T15:30:00.000Z")).toBe("2026-11-14T21:00");
    expect(clinicInputToIso("14/11/2026 9pm")).toBeNull();
    expect(isoToClinicInput(null)).toBe("");
  });

  it("describes a length of time the way a person would", () => {
    expect(durationToMinutes(4, "days")).toBe(5760);
    expect(durationToMinutes(20, "hours")).toBe(1200);
    expect(describeMinutes(5760)).toBe("4 days");
    expect(describeMinutes(24 * 60)).toBe("1 day");
    expect(describeMinutes(1200)).toBe("20 hours");
    expect(describeMinutes(60)).toBe("1 hour");
    expect(describeMinutes(45)).toBe("45 minutes");
    expect(describeMinutes(-5)).toBe("0 minutes");
  });

  it("stores a picture under the draft's own folder, named for its slot and type", () => {
    expect(announcementImagePath("abc12345", "banner", "image/png")).toBe("announcements/abc12345/banner.png");
    expect(announcementImagePath("abc12345", "popup", "image/jpeg")).toBe("announcements/abc12345/popup.jpg");
  });
});
