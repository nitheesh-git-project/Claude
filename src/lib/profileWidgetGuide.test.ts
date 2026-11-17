import { describe, expect, it } from "vitest";
import { widgetGuide, widgetsWithoutGuide } from "@/lib/profileWidgetGuide";
import { PROFILE_WIDGETS } from "@/lib/profileWidgets";

describe("Health Profile layout guides", () => {
  it("explains every option the screen can show", () => {
    expect(widgetsWithoutGuide()).toEqual([]);
  });
  it("says what, why and how for each, with a preview", () => {
    for (const w of PROFILE_WIDGETS) {
      const g = widgetGuide(w)!;
      expect(g.what.length, w.key).toBeGreaterThan(10);
      expect(g.why.length, w.key).toBeGreaterThan(10);
      expect(g.how.length, w.key).toBeGreaterThan(5);
      expect(g.preview, w.key).toBeTruthy();
    }
  });
});
