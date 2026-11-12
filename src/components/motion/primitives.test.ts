import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Reveal, Stagger, StaggerItem } from "./primitives";

// Scroll-reveal is an enhancement over content that is already there: the
// server HTML must never carry a hidden block, or the page is blank until
// JavaScript arrives (and stays blank if it does not).
describe("scroll-reveal renders visible in the server HTML", () => {
  it("Reveal carries no opacity:0", () => {
    const html = renderToStaticMarkup(createElement(Reveal, null, "Hello"));
    expect(html).toContain("Hello");
    expect(html).not.toMatch(/opacity:\s*0(?![.\d])/);
  });

  it("Stagger and its items carry no opacity:0 either", () => {
    const html = renderToStaticMarkup(
      createElement(Stagger, null, createElement(StaggerItem, null, "Card one"), createElement(StaggerItem, null, "Card two"))
    );
    expect(html).toContain("Card one");
    expect(html).not.toMatch(/opacity:\s*0(?![.\d])/);
    expect(html).not.toMatch(/transform:\s*translateY\(24px\)/);
  });
});
