# Manual E2E test plan

`DrPoojaPhysio-E2E-Test-Plan.pdf` is the deliverable a tester executes.
`DrPoojaPhysio-E2E-Test-Plan.docx` is the editable copy. Both are generated —
**do not hand-edit them.**

## Source of truth

`src/*.md`, concatenated in filename order. Edit those, then rebuild:

```
python3 scripts/build-test-plan.py
```

That writes four files into this directory: the concatenated `.md`, an `.html`
(the PDF's intermediate, useful for reviewing in a browser), the `.pdf`, and
the `.docx`.

## What the build needs

* Python 3 with `python-docx` (`pip install python-docx`).
* A Chromium binary for the PDF. The script looks for Playwright's bundled one
  first (`/opt/pw-browsers/...`), then a system `chromium` or `google-chrome`.
  With none present it skips the PDF and still writes the other three.

The Markdown subset the sources use is deliberately small — headings, tables,
lists, fenced code, blockquotes, rules, and inline bold/italic/code/links — so
the converter is self-contained rather than another dependency, and the PDF and
the DOCX are built from **one** parse of **one** source. That is what stops the
two documents describing different content.

## Keeping it current

The plan quotes real behaviour: route paths, admin screen names, setting
defaults, and error strings taken verbatim from the route handlers. A change to
any of those makes a test case wrong. Treat it like the other three docs — see
"Keeping the docs current" in `AGENTS.md`.
