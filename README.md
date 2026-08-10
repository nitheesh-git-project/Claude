# Dr. Pooja's Physio

Production website for a global virtual physical therapy practice. Built with Next.js (App Router), TypeScript, and Tailwind CSS.

## Status

**Phase 2 complete:** public marketing pages (Home, Conditions Treated, How It Works, Specialist Team, For Hospitals, Get Started, Booking Enquiry) are live, matching the original design prototype.

**Not yet built:** real patient/therapist accounts, admin portal, and online payment — currently stubbed with "coming soon" pages and lead-capture forms. See project tasks for the full roadmap.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view it.

### Knowledge graph (optional, one-time)

`graphify-out/graph.json` and `GRAPH_REPORT.md` are committed and refreshed by
CI on every merge to `main`, so a fresh clone already has a current graph. To
also refresh it locally whenever you merge into `main`:

```bash
pip install graphifyy               # the graphify CLI
git config core.hooksPath .githooks # enables .githooks/post-merge
```

Git hooks aren't shared by a clone, so this is per-machine. Skipping it costs
nothing — the graph still arrives with the next `git pull`.

## Tech Stack

- [Next.js](https://nextjs.org) (App Router)
- TypeScript
- Tailwind CSS v4
- Font Awesome (icons)
