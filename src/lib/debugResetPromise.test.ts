import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The reset button's warning is a promise, and this is what holds it.
 *
 * That copy used to say the reset deletes settings, and it did. It now says
 * the clinic's settings and website content survive, and they do -- but
 * nothing connected the sentence to the behaviour. Add a table back to the
 * `TRUNCATE` list later and the copy becomes a lie **on a control with no
 * undo**, which is the worst place in the product for one: somebody reads it,
 * believes their clinic name is safe, and presses the button.
 *
 * So the promise is asserted against the function itself. `schema.sql` carries
 * ten declarations of `debug_reset_all_data` and `create or replace` means the
 * **last** one wins -- reading any other would pass while the live function
 * did something else, which is exactly the mistake that shipped the first
 * attempt at this fix.
 */

const SCHEMA = path.join(process.cwd(), "supabase", "schema.sql");

/** The TRUNCATE list of the declaration that actually runs. */
function liveTruncateList(): string {
  const sql = readFileSync(SCHEMA, "utf8");
  const start = sql.lastIndexOf("create or replace function public.debug_reset_all_data()");
  expect(start, "debug_reset_all_data is not in schema.sql at all").toBeGreaterThan(-1);
  const body = sql.slice(start);
  const from = body.indexOf("truncate table");
  const to = body.indexOf("cascade;", from);
  expect(from, "the live reset has no TRUNCATE").toBeGreaterThan(-1);
  expect(to, "the live reset's TRUNCATE is unterminated").toBeGreaterThan(from);
  return body.slice(from, to);
}

/**
 * What the warning on the button promises survives. Each is here for its own
 * reason, never as a category: `site_settings` is configuration rather than
 * data, and the other four are things a person typed that no test generates
 * and that have to be retyped by hand.
 */
const PROMISED_TO_SURVIVE = [
  "site_settings",
  "risk_rules",
  "treatment_categories",
  "faqs",
  "testimonials",
  "mission_principles",
  // The developer's own leads from the footer credit's Say hello form.
  // Testing produces none of them. See devReachoutResetGuard.test.ts.
  "dev_reachouts",
];

describe("the reset keeps what its warning says it keeps", () => {
  it("truncates none of the tables the button promises survive", () => {
    const list = liveTruncateList();
    const broken = PROMISED_TO_SURVIVE.filter((t) =>
      new RegExp(`(^|[\\s,])${t}\\s*[,\\n]`).test(list)
    );
    expect(
      broken,
      `The Reset data button tells an admin these survive. Remove them from the ` +
        `TRUNCATE list, or change the warning in DebugResetButton.tsx -- a control ` +
        `with no undo must not promise something it no longer does.`
    ).toEqual([]);
  });

  it("still clears the test data it exists to clear", () => {
    // The other half. A guard that only checked the keeping would pass just
    // as well on a reset that had stopped resetting -- and this one empties
    // the database, so a silent no-op is the worse failure of the two.
    const list = liveTruncateList();
    for (const table of ["appointments", "payments", "patient_condition_profiles"]) {
      expect(list, `the reset no longer clears ${table}`).toContain(table);
    }
  });

  it("names the promise in the warning the admin actually reads", () => {
    const copy = readFileSync(
      path.join(process.cwd(), "src", "components", "DebugResetButton.tsx"),
      "utf8"
    );
    // Not the whole sentence -- wording should be free to improve. What must
    // not drift is that it says settings are kept rather than deleted.
    expect(copy).toMatch(/settings and website content/i);
    expect(copy).not.toMatch(/Deletes people, sessions, purchases, money and settings/i);
  });
});
