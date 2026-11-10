import { describe, expect, it } from "vitest";
import {
  digitsOnly,
  hasRealPhone,
  publicContactLinks,
  telHref,
  whatsappHref,
} from "./contactLinks";

describe("contact links are only ever real", () => {
  it("never links the shipped placeholder", () => {
    expect(hasRealPhone("+91 XXXXX XXXXX")).toBe(false);
    expect(whatsappHref("+91 XXXXX XXXXX")).toBeNull();
    expect(telHref("+91 XXXXX XXXXX")).toBeNull();
    expect(publicContactLinks({ whatsappNumber: "", contactPhone: null })).toEqual({
      whatsapp: null,
      call: null,
    });
  });

  it("builds wa.me from digits only, with an optional greeting", () => {
    expect(whatsappHref("+91 98765 43210")).toBe("https://wa.me/919876543210");
    expect(whatsappHref("+91 98765 43210", "Hi there")).toBe(
      "https://wa.me/919876543210?text=Hi%20there"
    );
  });

  it("keeps the plus on a tel link", () => {
    expect(telHref("+91 98765 43210")).toBe("tel:+919876543210");
    expect(digitsOnly("98765-43210")).toBe("9876543210");
  });

  it("offers each action independently", () => {
    const links = publicContactLinks({ whatsappNumber: "+91 98765 43210", contactPhone: "" });
    expect(links.whatsapp).toContain("wa.me/919876543210");
    expect(links.call).toBeNull();
  });
});
