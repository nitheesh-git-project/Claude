import { describe, expect, it } from "vitest";
import { checkContextBudget } from "./contextBudget.mjs";

const budgets = { "CLAUDE.md": 100, "AGENTS.md": 50 };
const ok = { "CLAUDE.md": "# Rules\nSee docs/rules/booking.md.\n", "AGENTS.md": "# Agents\n" };

describe("checkContextBudget", () => {
  it("passes small entry files with no imports and no hooks", () => {
    const r = checkContextBudget(ok, { ".claude/settings.json": '{"permissions":{}}' }, budgets);
    expect(r.ok).toBe(true);
    expect(r.sizes["CLAUDE.md"]).toBeGreaterThan(0);
  });

  it("fails a file over its byte budget, counting bytes not characters", () => {
    const r = checkContextBudget({ ...ok, "AGENTS.md": "é".repeat(30) }, {}, budgets);
    expect(r.ok).toBe(false);
    expect(r.findings.join()).toMatch(/AGENTS\.md is 60 bytes, over its 50-byte budget/);
  });

  it("fails an @-import line, which Claude Code would load into every session", () => {
    const r = checkContextBudget({ ...ok, "CLAUDE.md": "# Rules\n@docs/rules/booking.md\n" }, {}, budgets);
    expect(r.ok).toBe(false);
    expect(r.findings.join()).toMatch(/auto-imports "@docs\/rules\/booking\.md"/);
  });

  it("does not mistake an @mention inside prose for an import", () => {
    expect(checkContextBudget({ ...ok, "CLAUDE.md": "Ask @owner before merging.\n" }, {}, budgets).ok).toBe(true);
  });

  it("fails a missing entry file rather than skipping it", () => {
    const r = checkContextBudget({ "CLAUDE.md": ok["CLAUDE.md"] }, {}, budgets);
    expect(r.ok).toBe(false);
    expect(r.findings.join()).toMatch(/AGENTS\.md is missing/);
  });

  it("fails a SessionStart hook in project settings", () => {
    const settings = { ".claude/settings.json": JSON.stringify({ hooks: { SessionStart: [{ hooks: [] }] } }) };
    expect(checkContextBudget(ok, settings, budgets).ok).toBe(false);
  });

  it("fails unparseable settings rather than ignoring them", () => {
    expect(checkContextBudget(ok, { ".claude/settings.json": "{" }, budgets).ok).toBe(false);
  });

  it("ignores absent settings files", () => {
    expect(checkContextBudget(ok, { ".claude/settings.local.json": null }, budgets).ok).toBe(true);
  });
});
