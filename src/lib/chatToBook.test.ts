import { describe, expect, it } from "vitest";
import { chatBookingHref, chatCareOptions } from "./chatToBook";

describe("chatBookingHref", () => {
  it("opens the video wizard with the care chosen", () => {
    expect(chatBookingHref({ categoryId: "c1", mode: "video", therapistId: null })).toBe("/book?from=dashboard&category=c1");
  });
  it("carries a physiotherapist request to the video wizard", () => {
    expect(chatBookingHref({ categoryId: "c1", mode: "video", therapistId: "t9" })).toBe(
      "/book?from=dashboard&category=c1&therapist=t9"
    );
  });
  it("opens the home-visit wizard, which takes no physiotherapist request", () => {
    expect(chatBookingHref({ categoryId: "c 1", mode: "home", therapistId: "t9" })).toBe("/book-home-visit?category=c%201");
  });
});

describe("chatCareOptions", () => {
  it("keeps the hub's order and adds a home-visit price where there is one", () => {
    const opts = chatCareOptions(
      [
        { id: "a", title: "Orthopaedic care", price_paise: 199900, image_url: "/a.jpg" },
        { id: "b", title: "Neurological care", price_paise: 249900 },
      ],
      [{ id: "a", price_paise: 249900 }]
    );
    expect(opts.map((o) => o.id)).toEqual(["a", "b"]);
    expect(opts[0].homeVisit).toEqual({ pricePaise: 249900 });
    expect(opts[1].homeVisit).toBeNull();
    expect(opts[1].imageUrl).toBeNull();
  });
});
