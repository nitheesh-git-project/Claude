import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SETTING_MESSAGES, settingSavedMessage } from "@/lib/settingMessages";

describe("settingSavedMessage", () => {
  it("names the thing and its new state, not that a save happened", () => {
    expect(settingSavedMessage("home_visit_enabled", true)).toContain("Home visits are on");
    expect(settingSavedMessage("home_visit_enabled", false)).toContain("Home visits are off");
    // The complaint this module answers: "Saved" tells somebody a request
    // finished, which they could already see.
    for (const key of Object.keys(SETTING_MESSAGES)) {
      expect(settingSavedMessage(key, 1), key).not.toBe("Saved.");
    }
  });

  it("spells out the unit on a number, and pluralises it", () => {
    expect(settingSavedMessage("online_booking_lead_time_hours", 12)).toContain("12 hours");
    expect(settingSavedMessage("online_booking_lead_time_hours", 1)).toContain("1 hour");
    expect(settingSavedMessage("online_booking_lead_time_hours", 1)).not.toContain("1 hours");
  });

  it("reads money as rupees, never paise", () => {
    const message = settingSavedMessage("invite_welcome_paise", 20000);
    expect(message).toContain("₹200");
    expect(message.toLowerCase()).not.toContain("paise");
  });

  // Zero means "don't" for these two, and a sentence saying "every 0 seconds"
  // would be nonsense on the one setting whose zero is a real value.
  it("reads the two zeroes that mean 'never' as words", () => {
    expect(settingSavedMessage("journey_step_seconds", 0)).toMatch(/no longer rotates/i);
    expect(settingSavedMessage("splash_revisit_minutes", 0)).toMatch(/first load only/i);
  });

  it("falls back rather than throwing on a key it has never seen", () => {
    expect(settingSavedMessage("something_new_enabled", true)).toBe("Saved.");
  });

  it("never leaks a column name into a sentence somebody reads", () => {
    for (const key of Object.keys(SETTING_MESSAGES)) {
      for (const value of [true, false, 2, "x"]) {
        const message = settingSavedMessage(key, value);
        expect(message, `${key} -> ${message}`).not.toContain("_");
      }
    }
  });
});

// The fallback exists so a new setting still confirms something. Reaching it
// means somebody skipped a step, so this fails rather than letting a screen
// quietly go back to saying nothing.
describe("coverage", () => {
  function settingKeysWrittenByTheUI(): string[] {
    const dir = join(process.cwd(), "src/components/admin");
    const keys = new Set<string>();
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".tsx")) continue;
      const source = readFileSync(join(dir, file), "utf8");
      for (const match of source.matchAll(/settingKey="([a-z0-9_]+)"/g)) keys.add(match[1]);
      for (const match of source.matchAll(/saveSetting\(\s*"([a-z0-9_]+)"/g)) keys.add(match[1]);
    }
    return [...keys].sort();
  }

  it("has a sentence for every setting an admin screen can write", () => {
    const missing = settingKeysWrittenByTheUI().filter((key) => !SETTING_MESSAGES[key]);
    expect(missing).toEqual([]);
  });

  it("found the keys at all, so the check cannot pass by reading nothing", () => {
    const keys = settingKeysWrittenByTheUI();
    expect(keys.length).toBeGreaterThan(30);
    expect(keys).toContain("home_visit_enabled");
  });
});
