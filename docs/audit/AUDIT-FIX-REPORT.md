# MoveRestore — Audit Fix Report

One entry per item in the 135-item audit, in the order they were raised.
Each says what was actually wrong (verified in the code, not assumed), what
was proposed, what was done and why, and how it was checked.

Where my fix differs from the proposal, the entry says so under **Call** and
gives the reasoning. A proposal was changed only when a different fix solved
the same complaint better, or when the proposal would have made something
else worse.

## Status key

- **Fixed** — code, schema and docs changed; verified.
- **Fixed (design differs)** — the complaint is resolved; the approach is not
  the one proposed. Reasoning given.
- **Already held** — the property was already true; a regression guard was
  added so it stays true.
- **Needs your decision** — cannot be closed in code alone. Named plainly,
  with what it needs.

---
