import { describe, expect, it } from "vitest";
import {
  MAX_SOCIAL_URL_LENGTH,
  SOCIAL_LINKS,
  SOCIAL_LINKS_SELECT,
  footerSocialLinks,
  normaliseSocialUrl,
} from "./socialLinks";

describe("normaliseSocialUrl", () => {
  it("reads blank as 'no link', so the icon is hidden", () => {
    for (const raw of ["", "   ", null, undefined]) {
      expect(normaliseSocialUrl("instagram", raw)).toEqual({ ok: true, value: null });
    }
  });

  it("keeps a proper profile link", () => {
    expect(normaliseSocialUrl("instagram", "https://www.instagram.com/moverestore")).toEqual({
      ok: true,
      value: "https://www.instagram.com/moverestore",
    });
    expect(normaliseSocialUrl("youtube", "https://youtu.be/abc123").ok).toBe(true);
    expect(normaliseSocialUrl("whatsapp", "https://wa.me/919876543210").ok).toBe(true);
    expect(normaliseSocialUrl("whatsapp", "https://whatsapp.com/channel/0029Va").ok).toBe(true);
    expect(normaliseSocialUrl("facebook", "https://m.facebook.com/clinic").ok).toBe(true);
    expect(normaliseSocialUrl("linkedin", "https://in.linkedin.com/company/clinic").ok).toBe(true);
  });

  it("adds https to a pasted bare address and upgrades http", () => {
    expect(normaliseSocialUrl("instagram", "instagram.com/clinic")).toEqual({
      ok: true,
      value: "https://instagram.com/clinic",
    });
    expect(normaliseSocialUrl("facebook", "  http://facebook.com/clinic ")).toEqual({
      ok: true,
      value: "https://facebook.com/clinic",
    });
  });

  it("refuses anything that would run instead of link", () => {
    for (const raw of ["javascript:alert(1)", "data:text/html,hi", "mailto:a@b.co", "ftp://instagram.com/x"]) {
      expect(normaliseSocialUrl("instagram", raw).ok, raw).toBe(false);
    }
  });

  it("refuses a link to the wrong site, including lookalike domains", () => {
    expect(normaliseSocialUrl("facebook", "https://www.youtube.com/@clinic").ok).toBe(false);
    expect(normaliseSocialUrl("instagram", "https://instagram.com.evil.example/clinic").ok).toBe(false);
    expect(normaliseSocialUrl("instagram", "https://notinstagram.com/clinic").ok).toBe(false);
    const wrong = normaliseSocialUrl("linkedin", "https://facebook.com/clinic");
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error).toContain("LinkedIn");
  });

  it("refuses credentials, ports, spaces and over-long links", () => {
    expect(normaliseSocialUrl("instagram", "https://user:pw@instagram.com/x").ok).toBe(false);
    expect(normaliseSocialUrl("instagram", "https://instagram.com:8443/x").ok).toBe(false);
    expect(normaliseSocialUrl("instagram", "https://instagram.com/my clinic").ok).toBe(false);
    const long = `https://instagram.com/${"a".repeat(MAX_SOCIAL_URL_LENGTH)}`;
    expect(normaliseSocialUrl("instagram", long).ok).toBe(false);
  });

  it("refuses a value that is not text", () => {
    expect(normaliseSocialUrl("youtube", 42).ok).toBe(false);
  });
});

describe("footerSocialLinks", () => {
  it("draws only the links that are filled in, in a fixed order", () => {
    const links = footerSocialLinks({
      social_youtube_url: "https://youtube.com/@clinic",
      social_instagram_url: "https://instagram.com/clinic",
      social_facebook_url: "",
      social_linkedin_url: null,
    });
    expect(links.map((l) => l.platform)).toEqual(["instagram", "youtube"]);
  });

  it("drops a stored value that would not pass the check today", () => {
    expect(
      footerSocialLinks({
        social_instagram_url: "javascript:alert(1)",
        social_facebook_url: "https://youtube.com/x",
      })
    ).toEqual([]);
  });

  it("shows nothing for a missing row (columns not migrated yet)", () => {
    expect(footerSocialLinks(null)).toEqual([]);
    expect(footerSocialLinks(undefined)).toEqual([]);
  });
});

describe("SOCIAL_LINKS", () => {
  it("covers the five networks, each with its own column", () => {
    expect(SOCIAL_LINKS.map((l) => l.platform)).toEqual([
      "instagram",
      "facebook",
      "linkedin",
      "youtube",
      "whatsapp",
    ]);
    expect(new Set(SOCIAL_LINKS.map((l) => l.column)).size).toBe(5);
    expect(SOCIAL_LINKS_SELECT.split(", ")).toHaveLength(5);
  });

  it("offers an example that passes its own check", () => {
    for (const link of SOCIAL_LINKS) {
      const example = link.example.split(" ")[0];
      expect(normaliseSocialUrl(link.platform, example).ok, link.platform).toBe(true);
    }
  });
});
