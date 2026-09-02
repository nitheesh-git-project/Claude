# Manual E2E test plan, and the audit of it

Two generated documents live here. **Do not hand-edit either** — or their
`.md`/`.html` companions, which are build products too.

| Document | Sources | What it is |
| --- | --- | --- |
| `DrPoojaPhysio-E2E-Test-Plan.{pdf,docx}` | `src/*.md` | The plan a tester executes: feature guide plus click-by-click suite |
| `DrPoojaPhysio-QA-Audit-Report.{pdf,docx}` | `audit-src/*.md` | A static audit of the product against that plan, plus a product review. It records what was **executed** here and what could only be **verified in source** — it is not a record of the plan having been run |

## Rebuilding

```
python3 scripts/build-test-plan.py          # both documents
python3 scripts/build-test-plan.py plan     # just the test plan
python3 scripts/build-test-plan.py audit    # just the audit report
```

Each build writes four files per document: the concatenated `.md`, an `.html`
(the PDF's intermediate, and the quickest way to review a change in a
browser), the `.pdf`, and the `.docx`.

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
