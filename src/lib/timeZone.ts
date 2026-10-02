/**
 * Whether a string names a real IANA timezone, by asking the runtime's own
 * timezone database -- no bundled list, no pattern to keep up to date.
 *
 * Abbreviations and offsets ("IST", "GMT+5:30") are refused: they are not
 * zone names, and Google Calendar rejects them outright.
 */
export function isValidTimeZone(value: string): boolean {
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$/.test(value) && value !== "UTC") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
