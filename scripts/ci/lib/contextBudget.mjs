// Keeps the files every Claude Code session loads on entry small.
//
// CLAUDE.md is read into every session's system prompt, and AGENTS.md sits
// beside it; whatever they hold is paid for on every request of every
// session, not once. The rules were moved into docs/rules/ (read on demand)
// for exactly that reason -- AGENTS.md was once 6,250 lines -- and this check
// is what stops them drifting back. It measures the repository's entry files,
// nothing else: it says nothing about a subscription's total usage.
//
// It fails when an entry file exceeds its byte budget, when one of them
// pulls another file in automatically (an `@path` import line, which Claude
// Code expands into the prompt), or when the project's .claude settings add
// a SessionStart hook -- the other way to load a document into every
// session unasked. graphify stays manual for the same reason.

export const BUDGETS = {
  "CLAUDE.md": 14_500,
  "AGENTS.md": 4_500,
};

/** An `@path/to/file` line that Claude Code would expand into the prompt. */
const IMPORT_LINE = /^\s*@[\w./~-]+\s*$/m;

/**
 * @param {Record<string, string|null>} files  entry file -> contents (null if absent)
 * @param {Record<string, string|null>} settings  .claude settings file -> contents
 * @param {Record<string, number>} [budgets]
 * @returns {{ok: boolean, findings: string[], sizes: Record<string, number>}}
 */
export function checkContextBudget(files, settings = {}, budgets = BUDGETS) {
  const findings = [];
  const sizes = {};
  for (const [name, limit] of Object.entries(budgets)) {
    const text = files[name];
    if (typeof text !== "string") {
      findings.push(`${name} is missing; the budget cannot be checked`);
      continue;
    }
    const bytes = Buffer.byteLength(text, "utf8");
    sizes[name] = bytes;
    if (bytes > limit) {
      findings.push(`${name} is ${bytes} bytes, over its ${limit}-byte budget -- move detail into docs/rules/ (read on demand)`);
    }
    const match = text.match(IMPORT_LINE);
    if (match) {
      findings.push(`${name} auto-imports "${match[0].trim()}"; an @-import is loaded into every session -- link the file instead`);
    }
  }
  for (const [name, text] of Object.entries(settings)) {
    if (typeof text !== "string") continue;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      findings.push(`${name} is not valid JSON`);
      continue;
    }
    if (parsed?.hooks?.SessionStart) {
      findings.push(`${name} adds a SessionStart hook; nothing may load documents into every session automatically`);
    }
  }
  return { ok: findings.length === 0, findings, sizes };
}
