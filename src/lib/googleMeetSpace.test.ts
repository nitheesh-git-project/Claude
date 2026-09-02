import { describe, it, expect } from "vitest";
import { meetingCodeFromLink } from "@/lib/googleMeetSpace";

describe("meetingCodeFromLink", () => {
  it("reads the code out of the link Calendar returns", () => {
    expect(meetingCodeFromLink("https://meet.google.com/abc-defg-hij")).toBe("abc-defg-hij");
  });

  it("lowercases, since the Meet API's code alias is case-insensitive", () => {
    expect(meetingCodeFromLink("https://meet.google.com/ABC-DEFG-HIJ")).toBe("abc-defg-hij");
  });

  it("ignores query strings and trailing path", () => {
    expect(meetingCodeFromLink("https://meet.google.com/abc-defg-hij?authuser=0")).toBe(
      "abc-defg-hij"
    );
  });

  // Null is the safe answer, not a fallback guess: the code addresses a
  // meeting, and a wrong one would point the access change at somebody
  // else's. A null skips the call and leaves the waiting room on, which is
  // the behaviour this feature replaces rather than a new failure.
  it("returns null for anything that is not the three-four-three shape", () => {
    expect(meetingCodeFromLink("https://meet.google.com/lookup/abcdefghij")).toBeNull();
    expect(meetingCodeFromLink("https://zoom.us/j/12345")).toBeNull();
    expect(meetingCodeFromLink("")).toBeNull();
    expect(meetingCodeFromLink(null)).toBeNull();
    expect(meetingCodeFromLink(undefined)).toBeNull();
  });
});
