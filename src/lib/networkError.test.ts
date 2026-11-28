import { describe, expect, it } from "vitest";
import {
  friendlyErrorMessage,
  isNetworkFailureMessage,
  OFFLINE_MESSAGE,
} from "./networkError";

describe("isNetworkFailureMessage", () => {
  it.each([
    "Load failed",
    "load failed",
    "Failed to fetch",
    "NetworkError when attempting to fetch resource.",
    "Network request failed",
    "The Internet connection appears to be offline.",
    "The network connection was lost.",
  ])("recognises %s", (m) => expect(isNetworkFailureMessage(m)).toBe(true));

  it.each([
    "Invalid login credentials",
    "Email not confirmed",
    "Load failed for patient 12",
    "",
    null,
    undefined,
    42,
  ])("leaves %s alone", (m) => expect(isNetworkFailureMessage(m)).toBe(false));
});

describe("friendlyErrorMessage", () => {
  it("replaces a browser network error with the offline wording", () => {
    expect(friendlyErrorMessage(new TypeError("Load failed"), "x")).toBe(OFFLINE_MESSAGE);
    expect(friendlyErrorMessage("Failed to fetch", "x")).toBe(OFFLINE_MESSAGE);
  });
  it("keeps a real message and falls back when there is none", () => {
    expect(friendlyErrorMessage(new Error("Invalid login credentials"), "x")).toBe(
      "Invalid login credentials",
    );
    expect(friendlyErrorMessage(undefined, "Could not save.")).toBe("Could not save.");
  });
});
