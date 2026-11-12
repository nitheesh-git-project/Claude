# The public site

Eight pages from one design system, the word budgets, why every photograph carries a device and a face, catalog cards, mission and vision, and the opening splash.

**Mostly lives in:** src/lib/marketingNav.ts · marketingPhotos.ts · mission.ts · splashScreen.ts · src/components/marketing/

> Part of `docs/rules/`. `CLAUDE.md` says which file a task needs; this one
> is the detail. Keep it current in the same change that makes it wrong --
> see the docs rule in `docs/rules/testing.md`.

---

- **The splash greets a cold open, and nothing else.** The teal sheet the
  root layout paints over the site for a beat
  (`src/components/system/SplashScreen.tsx`, everything it needs defined once
  in `src/lib/splashScreen.ts`) shows on the first load of a browser tab and
  again when a tab that has been in the background for longer than
  `SPLASH_REVISIT_AWAY_MS` is returned to. **Its hold is the stylesheet's, not
  a timer, and on a public page hold + fade stay under ~600ms**
  (`SPLASH_PUBLIC_TOTAL_MS`): the boot script writes `--splash-hold` /
  `--splash-fade` on `<html>` before first paint (the hold clipped by
  `splashTimings()` on every path outside the signed-in workspaces, which keep
  the admin's full hold), and `html[data-splash="on"] .splash-screen` runs one
  `splash-leave` animation with the hold as its delay. A timer that started
  after hydration left the sheet up for as long as the page took to load; the
  component now only clears the attribute once the animation has certainly
  finished, which is also what lets a replay restart it. Under reduced motion
  the sheet is `display: none`, not frozen on screen. It deliberately does **not** show
  on every navigation, every reload or every tab focus: a patient paying by
  UPI leaves the tab for their bank's app and comes back mid-checkout, and
  splashing over a payment in progress is the one thing this must never do.
  Three details are load-bearing and easy to undo. The decision is made by
  an inline blocking script in the document head, not by an effect - an
  effect runs after first paint, so the greeting would land on top of a page
  the visitor can already read, which looks like a fault. The overlay's
  markup is in every page's HTML and never changes; visibility is entirely a
  `data-splash` attribute on `<html>` read by CSS, because deciding it in
  React state is a hydration mismatch on every page of the app (that
  attribute is also why `<html>` carries `suppressHydrationWarning` - it
  covers that one element, never a descendant). And the fade duration is
  `SPLASH_FADE_MS`, handed to the stylesheet as `--splash-fade` (the CSS keeps
  a matching fallback, which `splashScreen.test.ts` pins), so the clearing
  timer and the animation cannot drift apart. Anyone who has asked for
  reduced motion is skipped outright - it is decoration over content that is
  already rendered, so the honest answer to "don't animate" is not to show
  it. The name line, the wording, the hold and the away threshold are
  admin-configurable
  (`site_settings.splash_*`, Settings → Public Site → Opening Splash), and
  `splash_brand_line` is blank by default and falls back to `site_name`, so
  the greeting and the navbar say one thing until an admin deliberately
  parts them - it is the one text setting where blank is a value rather than
  an error, since blank is how the override is undone.
  `splash_revisit_minutes = 0` means "greet the first load only" - there is
  deliberately **no** value meaning "greet on every tab focus", because that
  is the setting that would splash over a checkout in progress. The fade
  length stays a constant for the reason above: it is the same duration
  written in two places, so it is a design decision rather than a policy an
  admin should be able to desynchronise.
  `e2e/splash-screen.spec.ts` holds these rules.

- **The developer pages carry no site chrome.** `isDeveloperRoute`
  (`src/lib/dashboardShellRoutes.ts`) hides the Navbar, Footer and debug bar on
  `/developer*`, and `src/app/developer/layout.tsx` draws the one "Back to
  home" button, fixed bottom right. Do not add another way out to either page.
- **The developer pages are deliberately outside `MARKETING_PAGES`.**
  `/developer` ("Say hello!") and `/developer/lets-talk` are not marketing
  pages: they are a credit for whoever built the app, reached only by the
  "Contact me" link in the footer's second line, so they are not in
  `src/lib/marketingNav.ts` and nothing -- the navbar, the Explore connector
  grid, a "where next" band, the closing CTA -- advertises them. They carry no
  `PageHero`, no photograph and none of the word budgets below; they are a
  white card on a slate-50 band (a line-art SVG with `aria-hidden`, a heading,
  one sentence, a pill button), and that is the whole of the design. Because
  their existence is a switch (`site_settings.dev_contact_enabled`, Settings ->
  Dev Reachouts) they render per request with `dynamic = "force-dynamic"` and
  `notFound()` while it is off, for the reason `/book-home-visit` does, and the
  footer line is hidden by the same flag so it never links to a 404. The
  published email is `dev_contact_email`, **blank by default** -- no address is
  committed -- and the "Prefer email?" row is hidden while it is blank. The
  form's honeypot is off-screen rather than visible; see `ops-security.md`.
- **The eight public pages are one template, not eight layouts.** `/`,
  `/conditions`, `/how-it-works`, `/home-visit`, `/team`, `/mission`, `/faq`
  and `/hospitals` all assemble from `src/components/marketing/`: a `PageHero`
  (photo right, one headline, one sentence, up to two CTAs), `TrustBar`, some
  `Section` bands, an `ExploreSection`, and a `ClosingCta`. Every page ends
  the same way on purpose - wherever a visitor stops reading, the next step
  is in the same place. Before adding a bespoke block to one page, check
  whether a `Section` plus `PhotoTile`/`IconCard`/`SplitFeature` already says
  it; the old pages each grew their own hero and their own closing block,
  and the result read as seven different sites.
- **The closing band asks for the sale, so it shows the sale.** `ClosingCta`
  is the last thing on seven of the eight pages (`/hospitals` ends on its
  referral form instead), and it was the only band made of nothing but text
  on a dark panel - a wall of words at the exact moment somebody is deciding
  whether to spend money. It carries a photograph like every other band, and
  the photograph is deliberately **not** of treatment: it is of the thing
  being asked for, someone at home smiling as she books on her phone. What a
  visitor is being asked to do is two minutes on a screen, and showing that
  argues better than another sentence saying it. The confirmation chip over
  it is the same argument once more - it shows what the next screen gives
  back rather than asking anyone to imagine it, and it labels itself an
  example **in the component**, so no page can render it as a real booking.
  Three rules keep it honest. **Each page names its own photograph, and the
  band has its own set of them** - the seven `cta-*` files in
  `marketingPhotos.ts`, which nothing else uses. The band's shape is
  identical everywhere, so the invitation is still one invitation and only
  the face changes; one image repeated seven times read as a template
  stamped on the end of each page, and reusing the *existing* photographs
  instead was no better, since those were shot for the heroes and the care
  bands and a visitor met a face they had already scrolled past. Each one
  answers that page's own question: `/team` a clinician opening a session,
  `/home-visit` a couple booking from their front room, `/faq` a patient
  reading her phone. The component's default is the fallback for a page that
  names nothing, not the house style. The image gets a **fixed** aspect
  (`4/3`, `5/4` at lg) rather than the photograph's own, or a portrait crop
  leaves the band mostly empty teal beside four lines of copy. And the
  assurance lines under the buttons are the **non-numeric** trust points
  only: a session's length is per-category and the cancellation window is an
  admin setting, so printing either as a fixed number in the one band that
  reads as a promise is the "don't hardcode admin-configurable behaviour"
  rule broken where it costs most.
- **One idea per band, and a hard word budget.** The rewrite exists because
  visitors could not tell what the site was, and the second round of feedback
  was that there was still too much to read. So the budgets are numbers, not
  a vibe, and they are the tightest thing on the site:

  | Slot | Budget |
  | --- | --- |
  | Hero subtitle | 12 words |
  | `Section` lede | 9 words - and drop it entirely when the heading already says it |
  | `IconCard` / `StepStrip` / `SplitFeature` body | 10 words |
  | `SplitFeature` bullet, `CareArea` check | 5 words |
  | `CareArea` blurb | 8 words · `detail` | 14 words |
  | `MarketingPage` blurb | 8 words |
  | `ClosingCta` body | 12 words |
  | Mission / vision sentence | 15 words |

  `Section` takes an eyebrow, a heading of a few words and **one** `lede`, and
  has no slot for a second paragraph. A lede that restates its heading is
  worse than no lede - several were deleted outright rather than shortened.
  If a card needs a paragraph it is a band of its own; if a band needs two
  ideas it is two bands. Don't reintroduce prose by passing a long string to
  `lede`.

- **The photograph is load-bearing, not decoration.** A visitor should be
  able to tell what a page is about with the text blurred out, which is why
  `PageHero` requires `photo` and `alt` rather than accepting a page with no
  image. Every photo is a static import through `src/lib/marketingPhotos.ts`
  (real dimensions at build time, generated blur placeholder, a missing file
  is a compile error) - never a `/photos/x.jpg` string, and never a remote
  URL. Pages name a `PhotoId`; only that one module imports the files. The
  images under `public/photos/` are licence-free stock and are meant to be
  replaced with the clinic's own photography: drop a file of roughly the same
  aspect ratio over the existing name and nothing else changes.
- **Every photograph shows a screen, except the two home-visit ones.** This
  clinic sells video consultations; home visits are the one in-person mode.
  The first pass used clinic photography throughout and the whole site read
  as a walk-in practice, which is the opposite of what it is. So every image
  has a laptop, tablet or phone in frame - a patient exercising to a laptop,
  a clinician with the patient live on screen, a scan marked up on a tablet -
  and only `hero-home-visit` and `mode-home-visit` show hands-on treatment.
  A new photo that cannot show a device is the wrong photo for this site.
  Crops are the trap: `public/photos/` files are pre-cropped, and a source
  with the laptop low in frame loses it to a centre crop, which silently
  turns an online photo back into a clinic one. Check the cropped file, not
  the original.
- **Every photograph shows a face, and the face is glad to be there.** Stock
  read as untrustworthy while the shots were backs of heads, hands on a
  phone, and an empty desk with a laptop on it - a patient cannot tell what a
  service is from a photo with nobody in it. So each image shows a real
  person, face visible, in a warm expression: a patient mid-session who looks
  glad to be there, or the clinician they are talking to. The one exception
  is the clinician reading a scan (`reports`), who is concentrating, because
  a physiotherapist grinning at an X-ray is the opposite of reassuring. A
  cropped-off head or a torso-only frame fails this rule as surely as a
  missing device does - check both in the cropped file.
- **`photoAlt` describes the picture; `blurb` describes the page.** Both
  `MarketingPage` and `CareArea` carry the two separately because the grids
  used to pass the blurb as `alt`, which announced the same sentence twice to
  a screen reader and said nothing about the image itself.
- **Every Explore band ends on booking, and its rows square up.**
  `BOOK_CONNECTOR` was on the home page's grid alone, so the six inner pages
  ended their index on another page to read -- the one band still answering
  "what now?" with "here is more to look at", on a site whose whole shape is
  that the next step is always in the same place. `exploreConnectors()` is
  the one list both use now.
  The tiles above it are squared up by arithmetic rather than by a
  hand-placed exception (`src/lib/exploreGridSpans.ts`), because the count
  moves: the page being read is always missing and Home Visit drops out when
  the switch is off, so which row ends short is not something a fixed rule
  can know. Seven tiles in three columns left the seventh alone beside two
  dead cells. Two details are load-bearing. The large breakpoint is a
  **six**-column grid with tiles spanning two -- the same three-across
  layout, but two leftover tiles can then take half the row each, where a
  literal three-column grid would need 1.5 columns and could only offer a
  gap. And `wide` (photo beside text) is applied only when a tile fills the
  row at **every** multi-column breakpoint: one that is full width on a
  tablet and half width on a desktop would change shape between them and
  read as two designs.
- **The site's own index lives in `src/lib/marketingNav.ts`.** The header
  nav, the footer's Explore column, the home page's connector grid and the
  "Where to go next" strip on the other six pages all read that one array, so
  a page cannot exist in the header and be missing from the index, and a
  renamed page cannot leave a stale description behind. It is the public-site
  counterpart of `adminNav.ts`. `blurb` is one short line in a patient's
  words - a page whose blurb needs two sentences is doing two jobs. Home
  Visit carries `requiresHomeVisit`, because `/home-visit` 404s while the
  admin master switch is off and every surface listing pages has to drop it
  rather than link into a dead end (`readHomeVisitEnabled()` in
  `src/lib/homeVisitFlag.ts`, read on its own for the usual
  migration-tolerance reason and failing closed).
- **Show one photograph at a time when six would say the same thing.**
  "What we treat" has been through both failure modes and the result is worth
  keeping. Six photo tiles at once was the busiest band on the page while
  saying the least: a picture of a patient exercising at home cannot
  distinguish back pain from knee pain, so all six said the same sentence and
  filled most of each card. Stripping the photography out fixed the density
  and threw away what makes this site legible at a glance. `CareAreaShowcase` (since replaced; see the next rule)
  does neither - photograph left, the answer right, the other five one tap
  away and costing no vertical space. Because only one panel is on screen, the
  copy can be a real answer (`detail` plus three `checks` in `careAreas.ts`)
  rather than the six words a card could fit. Reach for this shape whenever a
  grid's images would be interchangeable; reach for a grid when they would
  not. Because no photograph can show *where* it hurts (a person in pain
  breaks the "glad to be there" rule), the area is drawn instead. Each tile
  in the picker, which sits above the photograph, shows a small `BodyFocus`
  figure with its area lit (`CareArea.body`), and a card on the photograph
  repeats it. There the area glows ("Where it hurts"), then cools to teal
  ("What we work on"), replayed on each pick. It names an area, never a
  structure.
- **A hero's figures sit on one line.** `PageHero` draws its stats as one
  strip of equal cells (`HeroStats`). Each cell is a reversed flex column, so
  it needs `justify-end`: without it the column stacked from the bottom, and a
  label that wrapped lifted its own value above the others (the "price, time
  and rating not in a straight line" report). Labels stay short enough not to
  wrap at 360px ("Each session", "Starting price", "N ratings"). From lg the
  strip closes the copy column, and the photograph keeps its own landscape
  shape, centred against it. A stretched crop lost the laptop, which every
  photo here must show. On a phone the order is words, photograph, figures.
  The short phone band anchors its crop low (`object-[50%_68%]`) so the
  screen stays in frame.
- **The home page's programme cards are the compact ones.** `ProgramCards
  compact` gives `CatalogCard` a two-line summary, no bullet points (they are
  in "View full details"), and the length and price on one line at the
  card's foot, so a row of cards ends on one baseline. `/conditions` keeps
  the full card.
- **The header and the sticky bar never cut a word off.** The header keeps
  the full brand name and tagline at every width (see the header rule
  below); from 1024 to 1279px Our team moves into More to make room, where
  the name used to be truncated ("MoveResto..."). Below 420px the phone's
  booking bar drops its two lines of text (they could only read "Video or a
  visit a...") and the button takes the width.
- **"What treatment works towards" replaced "Find what hurts", on `/` and
  `/conditions`.** `TreatmentGoals` shows one kind of care at a time as a
  before and after. A divider sweeps across the card: the first visit (grey
  photo, rose figure, three things that are hard today) becomes the goal
  (colour, teal figure, three goals and the goal in the patient's words). The
  six kinds of care are the five health profiles plus desk and posture care,
  in `src/lib/treatmentGoals.ts`. Four rules hold it:
  1. **Goals, never promises.** Every story is a made-up sample patient,
     named as one, with "Typical goals; results vary with every person."
     beside it. The headline figures equal the health-profile samples'
     (`treatmentGoals.test.ts`), and the words are tested for promises
     ("cure", "guarantee", "pain-free").
  2. **It never advances on its own.** The sweep plays once when the band
     comes into view and again when a kind of care is picked. "Play all six"
     walks through every one, but only when tapped. Under reduced motion the
     goal side shows at once.
  3. **Its photographs show the care, not a screen**: the one exception to
     the screen rule above, because what changes here is the body. There is
     one photograph per kind of care (`goal-*` in `marketingPhotos.ts`, free
     Pexels licence), each with a `focus` so a phone crop stays on the person.
  4. **Its tablist is "Goals by kind of care"**, distinct from the recovery
     story's "Kinds of care" and the walkthrough's "How the process works".
  Guards: `e2e/treatment-goals.spec.ts` TG-001..003.
- **A carousel that moves on its own is a carousel nobody can read.**
  `TreatmentGoals` (and `CareAreaShowcase` before it) never advances by itself: the home page already carries
  the auto-rotating `JourneySteps`, and a second thing moving while you read
  the first is worse than either alone. Swipe, the arrow buttons and the
  picker all go through one `select()` so they cannot disagree about what is
  showing, and the picker is a real tablist with roving focus and arrow keys.
  Its `aria-label` is "Goals by kind of care" and must stay distinct from
  JourneySteps' "How the process works" - `e2e/journey-pace.spec.ts` finds
  that widget by its label, and two tablists sharing a name makes both
  unfindable.

- **A section rail entry must match a section that renders, in DOM order.**
  Each public page still passes `SectionNav` a list built from what actually
  rendered - several bands are conditional on admin-controlled catalog data -
  and the bottom-right scroll arrow walks that list top to bottom, so an
  entry out of order sends the arrow backwards. `e2e/section-nav.spec.ts`
  reads the rail's own buttons rather than a hardcoded list, which is what
  lets these pages change shape without the spec changing with them.
  The lit pill is the section crossing the viewport's centre, none at the
  very top, and - scrolled to the end, where the 44px-row footer is taller
  than half a laptop screen and holds the centre - the last section still on
  screen (`src/lib/sectionNavActive.ts`).

- **A public page opens at its very top, and the arrow brings you back up.**
  Next 16 no longer turns off `scroll-behavior: smooth` while it navigates,
  and it scrolls the new *segment* into view, which is under the 106px
  header: a tab tapped from the footer glided for two seconds and stopped
  short. `<html data-scroll-behavior="smooth">` restores Next's override and
  `ScrollTopOnNavigate` sets the window to 0 after each public navigation
  (not on a page load or Back, and not for a `#` link). `ScrollHint` hops
  while there is more below and, at the foot of the page, turns into "Back
  to top". Guards: `e2e/section-nav.spec.ts` SN-003 and SN-008.
- **Every catalog card has a cover slot, and one component owns the empty
  state.** Programmes, session packages and home-visit packages are all
  admin-created rows with a nullable `image_url`, so all three need an answer
  for "no photo yet" - and all three had a different one, at different
  heights, which read as three components rather than one catalog.
  `CatalogImage` is now that slot: the photo when set, otherwise the same
  tinted panel at the same height with the row's own illustration. A card with
  no photograph must look like one whose photo has not been chosen yet, never
  like one whose image failed to load. `treatment_categories.image_url` is the
  newest of the three (end of `schema.sql`), so it is read in its own isolated
  query on `/`, `/conditions` and the admin dashboard and merged in - the
  admin's batch is one `Promise.all` of ~40 queries, where an unknown-column
  error would blank the dashboard rather than one cover. The field is a plain
  URL an admin pastes, not a Storage object: these are public marketing images
  with nothing to sign, and a bucket would mean an upload pipeline to
  maintain. Rendered through a plain `<img>`, since optimising it would need a
  `remotePatterns` allowlist for every host an admin might paste from.
- **A catalog cover is uploaded, and positioned rather than cropped.** The
  three catalog tables carried `image_url` as a text box an admin pasted a
  link into, and that cost twice: in practice nobody pastes links, so the live
  site shipped with no photographs and the cards read as unfinished -- and
  every cover that did exist depended on a host this clinic does not control,
  on pages selling medical care. Uploads land in the clinic's own public
  `catalog-images` bucket through `/api/admin/upload-catalog-image`.
  Four things are load-bearing:
  1. **It is a route, not a browser-side upload.** `avatars` is written from
     the owner's browser because the owner is the only person allowed to write
     there and a storage policy can say exactly that. A catalog cover has no
     such owner -- the rule is "an admin who can manage the catalogue", a
     scope this app enforces in routes and not in RLS. The route is what makes
     the upload scope-guarded, size- and type-checked against one shared
     definition (`src/lib/catalogImage.ts`), and audited. The bucket
     accordingly carries **no insert policy at all**, only a public select.
  2. **A focal point, never a crop.** `image_focal_x` / `image_focal_y` (0-100,
     default 50) render as `object-position`. A cover is drawn with
     `object-fit: cover`, and the card is 4:3 where the detail dialog is 16:9
     -- so a photograph whose subject was not dead centre lost a head to one
     of them, which is what "the images look badly aligned" was. Cropping
     would bake one ratio into the file and make the other wrong, and changing
     either shape later would mean re-uploading the whole catalogue; two
     percentages are correct at every ratio, including ratios added after the
     upload. Default 50/50 is exactly what `object-fit` already does, so the
     migration moves no existing pixel.
  3. **`clampFocal` checks null and `""` before `Number()`.** Both become `0`
     rather than `NaN`, so without that an unset column would not centre a
     picture -- it would pin it to the top-left corner. That is the precise
     failure the function exists to prevent, arriving through its commonest
     input, and its own test is what caught it.
  4. **The upload clears all three extensions before writing.** Upsert alone
     overwrites a JPG with a JPG and leaves a stale PNG beside it, and then
     one row owns two covers with nothing ever removing the loser. There is no
     sweeper in this deployment to tidy that up later.
  The focal columns are written through `writeCatalogFocal`'s own isolated
  call and read in their own queries, **split from `image_url` rather than
  sharing one**: they are newer, so a single query would lose the photographs
  as well as their positions on a database mid-migration.
- **One card for everything the clinic sells, and one dialog header.**
  `CatalogCard` renders the programme cards on `/` and `/conditions`, the
  home-visit cards on `/home-visit`, and the patient dashboard's booking
  screen -- which was a text-only list before, so a patient who had already
  signed up met a plainer catalogue than a stranger did. The cover is an inset
  4:3 rather than a 104px full-bleed strip (a strip that shallow cannot hold a
  photograph of a person, which is why covers looked mis-cropped however they
  were shot); the meta chips are a **promotion, not an addition**, since
  duration, visit count, travel and therapist lock already existed on the row
  and were readable only by opening the dialog; the price sits on `mt-auto` so
  cards in a row align however long their titles run; and the two actions
  differ by weight rather than being two similar links. A field a row does not
  have simply does not render, which is what lets one component serve a
  treatment category, a multi-visit home package and a dashboard tile with no
  variants. It links with **`ProgressLink`, not `next/link`** -- the booking
  hub used it, and a Link click never touches `useRouter`, so plain `next/link`
  would have left the hub tapping through to the wizard with no teal bar.
  `CatalogDialogHeader` is the other half and fixes a real gap: the programme
  dialog never read `image_url` **at all** -- it drew a teal panel and a vector
  illustration -- so the moment admins could upload photographs, a card would
  show one and its own dialog a cartoon, one tap apart. The home-visit dialog
  did show the picture but laid its heading over it, which costs a scrim dark
  enough for any image and a heading sized to fight it. Now the photograph
  gets the full 16:9 with **nothing on top** and the heading sits on its own
  band below, so a bright cover and a dark one are equally safe and an admin
  can upload whatever they have. The badge moves into that band: it gains
  contrast and loses a little prominence, which is what the clean picture
  costs. `e2e/catalog-cover-image.spec.ts` asserts the heading sits below the
  image **geometrically** rather than by class name, so a restyle that puts
  text back over the photograph fails even if the markup changes shape.
- **The home page leads with four, and the full list is one tap away.** It
  rendered every active condition -- ten cards and climbing -- so the page
  whose job is to say what this clinic *is* spent most of its length being an
  index of itself. `treatment_categories.featured` picks which four lead,
  ticked on the admin's Conditions screen, and `/home-visit` puts the same
  ticked conditions first (`home_visit_packages.featured` is no longer read:
  home-visit cards are conditions now); `pickFeatured()` in
  `src/lib/catalogFeatured.ts` is the rule, dependency-free so a judgement
  about what a visitor sees is unit-tested rather than only clicked. Five
  things hold it:
  1. **Admin-chosen, never computed from sales.** "Most bought" is the
     intention, but a home page that rearranges itself when a booking lands
     changes without anybody deciding, and a newly added condition could
     never reach it until it had already sold -- backwards for the page that
     exists to sell it.
  2. **Nothing ticked falls back to the first four.** An empty band reads as
     the clinic having shut, not as a setting nobody has set; it is also what
     makes shipping the column and the UI in one change safe, since every row
     is `false` until an admin opens the screen.
  3. **More ticked than the limit is not an error**, and the cap is stated on
     the screen that sets it rather than discovered on the live site.
  4. **The two pages differ because their lists do.** `/` links on to
     `/conditions`, which still shows everything; `/home-visit` shows every
     condition, featured ones first, because it *is* its own full list and has
     nowhere to send anybody. (It used to lead with four and reveal the rest,
     and the revealed cards never appeared: `Stagger` animates its children
     once, so cards added later stayed hidden -- key it on the reveal if a
     reveal ever comes back.) `hasMore`
     gates the home page's link -- a control opening a list identical to the
     one above it is a dead end with a label on it.
  5. **`featured` is not `highlight`.** The old home-visit package form had a
     control labelled "Feature this package" that drew the teal ring; it
     read "Highlight with a ring" until that form went. Two controls called Feature, meaning
     different things, is the one-word-one-concept rule broken in the one
     place an admin meets both.
  The patient dashboard's booking hub deliberately keeps showing everything:
  it is the screen somebody opens *to* book, so trimming it hides what they
  came for.
  **A revalidate belongs after the isolated writes, not before them.** The
  old home-visit catalog routes called `revalidatePath("/home-visit")` before
  `writeCatalogFocal`, so the page was rebuilt from the row as it was a
  moment earlier and a repositioned cover waited out the full ISR window --
  the exact failure the revalidate exists to prevent, in the call that exists
  to prevent it. `/api/admin/set-home-visit-price` revalidates after its last
  write for the same reason.

- **A home-visit card is a condition, sold as one visit.** `/home-visit`
  and the patient booking hub list every active condition at its home-visit
  price (`src/lib/homeVisitRates.ts`: its own price, else the clinic-wide
  one), with the condition's photo, copy and points, through
  `HomeVisitConditions` and `homeVisitConditionOption` -- the same mapping
  the wizard's picker reads, so card, dialog and picker cannot describe one
  visit three ways. Nothing on them carries a count ("Single visit", "4
  visits", "each"), a validity or a day: one visit, and "if you need more,
  your therapist will recommend them". Book links
  `/book-home-visit?category=<id>`. A condition with no price (no own price
  and no clinic-wide one) is left out rather than shown at a guess, and the
  old multi-visit rows are never cards.

- **Ordering a list is one save of the whole list, never a pairwise swap.**
  The Conditions screen moved a category by swapping two rows'
  `display_order` values. Two rows holding the *same* order swapped to the
  same two numbers, so the write succeeded and changed nothing - and the
  admin create form defaulted Order to `0`, which made equal orders the norm
  rather than the exception. The optimistic list showed the move, the next
  render put it back, and the public pages never changed. The arrows now
  rearrange client-side only and **Save order** posts the whole id list to
  `/api/admin/reorder-treatment-categories`, which renumbers `1..n` by array
  position in `set_treatment_category_order()` - a total order ties cannot
  express. Three rules came out of it: the button is **always rendered and
  only enabled when something moved**, so saving is visibly the step that
  publishes; the route **refuses a list that does not cover every row**
  (409), since renumbering a subset collides with the rows it never saw --
  and so does `set_treatment_category_order()` itself, because that route
  check is true only for as long as every caller remembers it and the
  function is reachable by the service-role client and by hand in the SQL
  editor; reordering one of two categories left both at 1 on a scratch
  database, which is the tie the whole change removes, put back; and
  a new category is created at `max(display_order) + 1` rather than `0`, so
  it appends instead of landing on top of everything at the same number.
  Build a future reorder control the same way rather than reintroducing a
  swap.
- **A delete that removed nothing is not a success.** `supabase-js` reports
  no error when a DELETE matches zero rows, so
  `/api/admin/delete-treatment-category` answered `{ success: true }` for a
  refusal, for a row somebody else had already deleted, and for a real
  deletion alike -- and the screen, told it had worked, refreshed and painted
  the condition still sitting there. "Delete does nothing and nothing says
  why" is the least actionable failure a screen can produce. Three rules,
  and they apply to any delete of a row other rows point at:
  1. **Count the blockers first, and name them.** The foreign keys here
     (`appointments`, `patient_package_purchases`, `home_visit_packages`,
     `appointment_reassignment_log`) carry no ON DELETE behaviour, so
     Postgres refuses outright. `describeCategoryBlockers()` in
     `src/lib/categoryDeletion.ts` turns the counts into the sentence, with
     the alternative (turn it off) named -- "it has bookings" sends an admin
     to delete sessions and be refused a second time by something they were
     never told about. The condition's own home-visit price rows are removed
     with it when nobody bought one (no screen but Conditions -> Home visits
     shows them); a purchase against one is named as a home-visit purchase.
  2. **Ask for the row back** (`.delete().eq(...).select("id")`), so
     "removed nothing" is distinguishable from "removed it". Nothing removed
     and nothing blocking is a 500 saying so, never a success: at that point
     the app does not know what happened and must not claim it worked.
  3. **A refusal that is a paragraph belongs in a dialog.** This one was an
     11px line clipped to 160px beside the button, which is how a refusal
     that did fire gets reported as a delete that did nothing. The `fetch`
     is wrapped too -- a request dying on a bad connection threw inside the
     transition and put nothing on screen at all.

- **`/team` is a public page too, and three more routes change it.** The
  rule below was applied to catalog and content edits and missed the one
  table whose *account* state decides what the public sees:
  `public_therapist_profiles` requires `approved and active and
  visible_on_team`, so suspending a therapist takes them off `/team` -- but
  `set-therapist-active` never invalidated it, and the page went on serving
  a suspended clinician until the ISR window happened to lapse. `approve-
  account` and `create-account` have the same reach in the other direction,
  since `visible_on_team` defaults to true and a therapist created or
  approved belongs there at once. All three call `revalidatePath("/team")`
  now, the two shared routes only when the row is a therapist -- a patient
  would throw away a cached page for nothing. `decline-account` deliberately
  does not: a declined account is still unapproved, so it was never on that
  page to remove.
  **A control that cannot change what anyone sees says so.** The same three
  columns mean the "Hide from /team page" button is only the deciding one
  while the other two hold. It is disabled for a suspended or unapproved
  therapist and names which of the two is the reason, rather than offering
  an action that would change nothing. The stored setting is left untouched,
  so restoring the account brings the therapist back to whatever the admin
  had chosen rather than to a default.
- **Formatted public copy is an allow-listed document, never HTML.** A
  therapist's bio and the admin's display content were printed into a
  plain `<p>`, so every Enter collapsed into one line on `/team` while the
  admin's own preview (which kept line breaks) looked fine. Both are now
  written in `RichTextEditor` and stored as its JSON. Three rules:
  1. **`src/lib/richText.ts` decides what reaches a page.** A stored value
     is rebuilt node by node from its allow-list - unknown nodes, marks and
     attributes are dropped, a link keeps only an http(s), mailto or tel
     target - by the writing route *and* again at render, since the bio's
     column is reachable from the therapist's own session.
  2. **`RichTextView` builds React elements.** No `dangerouslySetInnerHTML`;
     typography comes from the container, so the admin's grey saved view and
     the public popup share one renderer and cannot disagree.
  3. **Old values still read.** Anything that is not a stored document is
     earlier plain text and becomes paragraphs and line breaks as written.
  The bio now saves through `/api/therapist/update-bio` rather than a browser
  RLS update, which is also what lets it revalidate `/team`. The formatting
  set is brand-safe by decision: no colours, fonts or sizes. Guard:
  `e2e/rich-text-profile.spec.ts`.
  **Tables are opt-in, and a public bio does not get them.** An announcement
  and a notebook page may hold a table; every entry point
  (`parseRichText`, `sanitizeRichDoc`, `parseRichTextInput`, `RichTextView`'s
  `options`, `RichTextEditor`'s `tables`) takes `{ tables: true }` from the
  caller that wants them, and without it a table node is dropped like any
  other unknown one. The editor offering tables and the route allowing them
  must both say so, or a table is lost on save. A table is plain -- no merged
  cells, no widths, no table in a table, at most 30 rows by 8 columns -- and
  the view scrolls it inside its own box so it can never widen a page.
- **An admin write that a public page renders must invalidate that page.**
  `/`, `/conditions`, `/book`, `/faq`, `/mission` and `/team` are ISR-cached
  (`export const revalidate = 300`), so a catalog or content edit was
  invisible on the live site for up to five minutes - which reads as a save
  that silently failed, and is how the same edit gets made twice. Every
  admin route writing `treatment_categories`, `faqs`, `testimonials` or the
  rating-visibility settings now calls `revalidatePath` for each page that
  reads it, the way the home-visit routes always have. Adding a public
  surface for an admin-editable table means adding its path to those routes
  in the same change; the ISR window is a cache, not a publishing delay
  anyone chose.
- **The public pages promise the patient a summary, never "session notes".**
  The therapist's session note is clinician-only (`docs/rules/clinical.md`)
  and a patient never reads it, so copy that offered "each session's notes"
  or "a written record, updated every session" promised something that did
  not exist. What a patient does get is **a short summary after each
  session and their exercise plan** -- the `session_summaries` row their
  therapist writes beside the note, shown on their session card -- and that
  is the wording on How it works, the Why choose us / Real benefits cards
  (`src/lib/whyChooseUs.ts`, home and `/mission`) and the health-profile
  showcase. Copy may still say the physiotherapist's *own* notes shape the
  next session; it must not offer them to the reader.
- **The health profile is shown through the real components, never with a
  real patient's data.** `HealthProfileShowcase` draws one tab per condition
  type the clinic offers, each for an invented patient, under the patient's
  own name for the care (*Orthopaedic care*, *Neurological care*,
  *Paediatric physiotherapy*, *Strength and balance care*, *Heart and lung
  rehabilitation*; never "specialty", "triage", "case" or "geriatric").
  Every tab carries who it is for (one line), what it watches (three lines
  naming the measures in plain words), the headline change (from -> to), the
  condition picture (body map and knee dial; walking ladder and
  examination; milestone windows; fall-risk dial and the four tests; the
  six-minute walk and the oxygen bar), the real `ProgressGraph` with its
  goal band and the real `MilestoneCards` (reached / working on / planned),
  so a visitor sees what the profile is for: how the patient is now, how
  they improved, and which milestones were planned and achieved. Beside
  every profile sits *Sample patient - figures are made up*.
  The data is `src/lib/healthProfileSamples.ts`: raw measurement rows,
  exams, goal and milestones (copied from `milestoneTemplates.ts`) fed
  through the product's own `shapeOrthoView` / `shapeNeuroView` /
  `shapePedsView` / `shapeGeriatricView` / `shapeCardioView`, with fixed
  dates, so nothing is typed in twice and the server and browser draw the
  same output. `healthProfileShowcase.test.ts` holds each headline to what
  its chart draws, every measure to the registry (none licensed), every
  threshold to the registry, the paediatric windows to the WHO table and the
  corrected age to the weeks at birth. Figures agree with the clinical
  modules: Strength and balance is High because of 3 falls whatever the
  tests show, with "tests in the safer range 3 of 4" apart; Heart and lung
  shows the patient's *own* oxygen limit (set by their doctor) and no
  expected distance (the formula is the clinic's choice); Parkinson's is
  tested in ON time. Parkinson's is an *example inside* the neurological tab
  (a pair of buttons), not a sixth tab. Wording says what the profile
  **shows**, never what treatment will achieve.
  **Which tabs appear:** `enabledShowcaseProfiles(enabled_intake_specialties)`.
  Orthopaedic always; neurological and paediatric with their switch (on by
  default); Strength and balance care and Heart and lung rehabilitation
  appear on their own once an admin ticks them (Settings -> Clinical
  Questions) and vanish when unticked. With only the original three the band
  is three tabs; it is never empty.
  **Weight and layout:** only the active tab's panel is rendered, each panel
  its own lazily loaded chunk (`next/dynamic`); the tab row scrolls sideways
  inside its own container on a phone (44px targets, arrow keys, Home/End);
  while the tour can still rotate the frame keeps the tallest height any
  profile has drawn at that width, so the page below does not move. On
  `/how-it-works` it sits above the five-step strip (profile, goal and
  milestones, scores after each session, reviews, the PDF record). **The home
  page does not carry the tour**: it tells one recovery story at a time
  (`RecoveryGist`, `recovery/RecoveryStory`). The sample's drawn figure
  (`BodyFocus`) glows rose where it hurts and cools to teal, the headline
  figure counts from the first visit to the latest review, the bar refills,
  four review dots light in turn, and the tools that profile uses
  (`ShowcaseProfile.tools`) arrive one by one. `meter` is the headline as
  numbers, and `healthProfileShowcase.test.ts` holds it to the printed
  headline. It plays when it comes into view and when a kind of care is
  picked, and **never rotates on its own**. "See the full health profile"
  opens a sheet (`RecoveryTourSheet`) with every enabled kind of care, each
  with its story, what it watches and its tools. The sheet ends on the
  unlock: your own profile opens with your first booking (Book a video
  session), and the real screens are at `/how-it-works#health-profile`.
  Every story carries the sample note. The wording says what a profile
  shows, never what treatment will achieve. Guards: HPS-003 and HPS-004.
  **It is the one public widget that moves on its own**, every five seconds,
  which the carousel rule below otherwise forbids, so the movement is held
  to the reader: only while its frame is at least half on screen - or fills
  half the window, for a frame taller than it (`showcaseFrameInView`; the
  desktop frame is ~1,500px, so "half the frame" alone never let it move on
  a 720px laptop screen) - never alongside `JourneySteps`, never while hovered, focused or touched, never
  again once a tab or the Parkinson's example is picked, never under reduced
  motion, and always with a pause button
  (`e2e/health-profile-showcase.spec.ts`).
- **Why choose us is a bento grid of drawn vignettes, Real benefits a
  photograph beside illustrated rows.** The vignettes are built from the
  site's own UI parts rather than stock art, and the language tile reads
  `booking_languages`, so it never names a language the booking form does
  not offer.
- **The home page's mission band steps from the concrete to the why: Why
  choose us, then The real benefits, then mission and vision.** Six reasons
  as icon cards and six numbered outcomes, one line each on the home page
  (`WhyChooseUsGrid compact` / `RealBenefitsList compact`), and in full on
  `/mission` in the same order, each card adding how the platform does it.
  The copy is `src/lib/whyChooseUs.ts`, and every line is something the
  product keeps (a profile per specialty, the Pain Map, the language picked
  at booking, the price before paying) -- distinct from "What we promise",
  which are rules the platform enforces. No admin-set figure is written
  into it: the refund window and lead time live in `site_settings`, and a
  number in marketing copy is the first thing to go stale.
- **A connector shows the whole of what is short and the headline of what is
  long.** The home page's mission band gives the mission and vision in full -
  they are two sentences, and paraphrasing them into a teaser would leave the
  home page making a weaker version of the same claim - while the four
  promises appear as titles only, each linking to
  `/mission#what-we-promise`. Both halves come from one resolution --
  `readMissionCopy()` over `resolveMissionCopy()` in `src/lib/mission.ts` --
  and reach `MissionPreview` as props rather than being fetched inside it, the
  same rule the Navbar's brand strings follow, so the home page cannot quote a
  mission the mission page has since reworded. Get that split wrong in either
  direction and you have a duplicate page or a band that says nothing.
- **The mission and the vision are an admin setting, and blank is the undo.**
  `site_settings.mission_statement` / `vision_statement`, written on Settings
  -> Public Site -> Mission & Vision. They were constants, which made the copy
  most likely to be argued over the copy only a developer could change. Four
  rules:
  1. **The constants in `src/lib/mission.ts` stay, as the default.** A blank
     or null column resolves to them, which is how an admin undoes an edit
     without retyping the original out of a file they cannot read -- the same
     rule `splash_brand_line` follows -- and it is why a database that has not
     run the migration renders exactly what it rendered before.
  2. **Read on its own, and deliberately not in `SITE_SETTINGS_SELECT`.**
     These are the newest columns on that table, and that shared select is the
     one whose failure takes every other setting down to its default with it.
     `readMissionCopy()` swallows its own error and falls back to the
     constants, because an empty mission card reads as a broken page on the
     one band whose job is to say who this clinic is.
  3. **Saving invalidates `/` and `/mission`.** Both are ISR-cached, so
     without it an owner rewords the sentence the site leads with and watches
     the old one stay up for five minutes -- which reads as a save that
     failed.
  4. **The word budget is advice; the character cap is the limit.** The form
     warns past fifteen words and still saves; `MAX_MISSION_LENGTH` /
     `MAX_VISION_LENGTH` are mirrored by the columns' CHECK constraints and
     re-checked in the route, because that pair is about the card these lines
     render in rather than about the writing.
- **The promises and the limits are rows, and an empty table is not an empty
  band.** `mission_principles` (`kind` = `promise` | `limit`, title, body,
  icon, `display_order`, `active`), one table and one manager
  (`MissionPrincipleManager`, rendered twice) for both bands, on Settings ->
  Public Site. Same shape as `faqs` and `testimonials`, and five rules:
  1. **An empty table falls back to `PRINCIPLES` / `COMMITMENTS` in
     `src/lib/mission.ts`**, per band rather than per table, because writing
     the promises must not empty the limits. It covers a database that has not
     run `schema.sql`, one the debug reset has just truncated, and a clinic
     that has not opened the screen -- and on `/mission` these two bands *are*
     the page, so a heading with nothing under it is the outcome worth a
     fallback. Deleting the last row is allowed and the screen says the
     shipped wording comes back, since otherwise a delete whose visible effect
     is the original text reappearing reads as a failed delete.
  2. **Every row switched off is respected, not fallen back on.** That is a
     decision somebody made, where an empty table is a state nobody chose --
     so both pages drop the band *and* its section-rail entry, per the
     "a rail entry must match a section that renders" rule.
  3. **Ordering is one save of the whole band.** The arrows rearrange in the
     browser, **Save order** posts every id of that one `kind`, and
     `set_mission_principle_order(text, uuid[])` renumbers 1..n and refuses a
     partial list itself -- the same tie bug, and the same reasoning, as
     `set_treatment_category_order`. A new row is appended at `max + 1`, never
     0.
  4. **The icon is a picker over `MISSION_ICONS`**, checked in the route, with
     `missionIcon()` answering for a retired name. Free text there is a way to
     put an empty square on the mission page, and a blank box does not say
     whether the icon or the row failed.
  5. **A delete or an edit that matched nothing answers 404**, never success:
     supabase-js reports no error for either, and the screen would refresh
     into an unchanged list it had just been told was saved.
  No heading counts the cards. "Four things, every patient" over three cards
  is the tell-someone-something-untrue rule broken by a number nobody
  remembered to change, so that title says what the band is instead.
- **Testimonials are the one place the site quotes a person, so treat them
  as evidence.** One `Testimonials` component serves Home and `/mission`,
  because the two bands make the same claim and a visitor may see both in one
  session. `testimonials.avatar_url` is migration-dependent, so every caller
  reads it in an isolated query and falls back to the patient's initial - a
  generic silhouette is a worse signal than no photo.
  **The five rows `schema.sql` seeds are illustrative copy, not real
  patients**, seeded only into an empty table and never re-seeded once it has
  any row. They exist so the band can be reviewed populated before launch, and
  **the public pages never render them**: there is no flag column, so
  `publicTestimonials()` (`src/lib/testimonialTrust.ts`) recognises a seeded
  row by its exact quote (a test pins the list to `schema.sql`). With only
  those in the table the Reviews band and its rail entry are not drawn; a row
  whose words an admin has rewritten counts as theirs. Never add a testimonial
  that reads as a real patient without consent for both the words and the
  face - the admin form says as much at the point of entry, and
  `public_rating_summary` stays the only place a *real* number is quoted.
- **A public catalog card opens a dialog; booking is its own button.** The
  session-package, home-visit-package and programme cards all follow one
  contract: the card body is a single tap target that opens a detail dialog
  (`src/components/Modal.tsx`, shared with `TeamTherapistPopup`), and a
  **Book …** link sits below it on the card and again at the foot of the
  dialog. The card used to be one big link to checkout, which left no way to
  read the rules - validity, one-therapist lock, minimum gap - before paying.
  Keep the booking link outside the tap-target button: a link nested inside a
  button is invalid markup and behaves differently per browser. Programme
  cards are one component (`src/components/catalog/ProgramCards.tsx`) used by
  both `/` and `/conditions`; the dialogs' shared visual pieces (session
  dots, savings meter, stat tiles) live in
  `src/components/catalog/CatalogVisuals.tsx` and are fed already-computed
  numbers, since the arithmetic belongs in `src/lib/`.
- **A session's length is the category's, on every screen, or no number at
  all.** `treatment_categories.duration_minutes` is what `/book`, checkout
  and the appointment row use, and the programme band's lede, the programme
  dialog's footnote and the home hero's figure each printed a fixed "60"
  beside it - so a 30-minute category was promised as 60 minutes one tap
  before the wizard said 30. Every sentence that names a length is built by
  `src/lib/sessionLengthCopy.ts` from the rows the page already reads ("Same
  N-minute assessment" only when every category shares N; a range or no
  figure otherwise), and a page that reads no categories (`/hospitals`, the
  journey strip, the therapist popup) names no length. Its test walks those
  files and fails on a literal minute count. `e2e/catalog-detail.spec.ts`
  CD-009 seeds a 35-minute category and reads it back.
- **The footer's social icons are only the ones an admin filled in, and each
  opens in a new tab.** Five optional `site_settings` columns
  (Settings -> Brand & Contact -> Social Media Links); blank hides that icon,
  and none filled in draws no row at all - an icon leading nowhere is worse
  than no icon, the same reading the footer gives a placeholder phone
  number. `src/lib/socialLinks.ts` is the one rule (https only, on the
  network's own domain) and the footer re-applies it to what it reads, so a
  value written straight into the table is dropped rather than rendered as
  an `href`. A link that leaves the site for another app - these and the
  footer's WhatsApp number - carries `target="_blank"` with
  `rel="noopener noreferrer"` and says "(opens in a new tab)" in its
  accessible name; `mailto:` and `tel:` stay as they are. The icons are
  inline SVG in `BrandGlyphs.tsx`, not the fa-brands webfont, in 44px
  circles like every other footer target (`mobile-smoke` MOB-003).

- **The header changes by width, and booking is always one tap away.** Below
  `lg` the page links are in the menu and every marketing page has a sticky
  **Book a video session** bar at the foot of the screen (`PublicBookBar`,
  shown where `isBookBarRoute` says -- not on `/get-started`, the wizard, an
  auth card or a dashboard). From `lg` the header shows Conditions, How it
  works, Home visit, Team and FAQ with Mission and Hospitals under **More**,
  then Sign In and the Book button; from `2xl` every page is in the row. There
  is **no Get Started in the header**: that hub is a switchboard (patient,
  therapist, hospital sign-ins), so the phone menu's one primary button is
  Book a video session and the hub's other doors live in the footer under
  "For clinicians and partners". The brand is the **full name with its tagline at
  every width**, never the short name and never an ellipsis: on a phone the name
  scales with the screen (15px at 360px), and from 1024 to 1279px it is 16px,
  the bar's gaps tighten and Our team steps into More (`LAPTOP_MORE_KEYS`). Menu rows
  and footer links are 44px targets. The WhatsApp / Call chip in the menu and
  the icon beside the sticky bar's Book button exist only for numbers an admin
  has filled in (`contactLinks.ts`; the shipped "+91 XXXXX XXXXX" is not one),
  and on `/home-visit` (while bookable) the bar reads "Check my pincode" and
  goes to `/book-home-visit`. Home is the logo at every width. The Book label is
  `BOOK_CONNECTOR.label`, so it names the mode wherever it appears.

- **A public price is a `<Price>`, never a formatted string.** The public
  pages are statically cached for everybody, so their HTML carries rupees.
  `PricingProvider` (root layout) reads the visitor's country from cookies
  after mount and every `<Price>` / `usePricing()` re-renders in the local
  currency; a head script hides `[data-price]` for a non-Indian cookie until
  then (3 s backstop), so a foreign visitor never sees the rupee figure
  flash. Display only - the checkout prices the request again on the server
  (`payments.md`). Home-visit prices pass `rupeesOnly`. The footer's
  country picker shows only when local prices and the picker are both on;
  the debug bar's Country dropdown forces any country while the bar exists.

- **The FAQ never carries coverage or a price as typed text.** FAQ rows are
  admin-written and nothing re-reads them when Catalog moves: staging's
  answered "do you visit me?" with `600020` and ₹499 + ₹100 travel long after
  coverage was `600017` and the visit ₹1,500 + ₹150. While Home Visit is on
  and an area is active, `/faq` appends an answer built from
  `home_visit_areas` (`src/lib/faqLiveFacts.ts`): the cities served, the
  pincode check, and "prices are on the Home Visit page" - no pincode and no
  rupee figure, since a public price is a `<Price>` and a visit's price
  depends on the condition and the area. The three service-area routes
  revalidate `/faq` with `/home-visit`. The FAQ form shows an amber note
  (`quotesDriftingFigure`) while an answer quotes a pincode or a ₹ amount -
  said, not refused. The home-visit wizard's pincode placeholder is
  "6-digit pincode", not a real one: an example pincode reads as a served
  one.

- **On /conditions the programmes come first, the areas of practice
  second.** What a visitor can book today ("Structured programmes") leads;
  "Areas of practice" sits below it and answers "what if mine is not one of
  those". The section rail follows the same order.
- **The sign-in pages keep the nav's whole signed-out cluster** - Sign In,
  Get Started, Book - so tapping Sign In does not appear to break the nav.
  `isAuthCtaSignedOutRoute` pins it there whatever the session says, which
  still stops "Go to Dashboard" flashing mid-login; only registration and
  the holding pages drop the cluster (`isAuthCtaHiddenRoute`).

- **Home visits are sold only when they can be booked.** The master switch
  alone is not "bookable": switched on with no active service area, or with no
  condition priced, the first step ("check my pincode") could only answer no.
  `resolveHomeVisitOffer()` (`src/lib/homeVisitOffer.ts`, read by
  `readHomeVisitOffer()` / `readHomeVisitBookable()` and, for the root layout,
  `loadHomeVisitSupply()`) answers `live` (switch + >=1 active area + >=1
  price), `coming` (switch on, one of the others missing) or `off`. Every
  public list - the nav, the footer, the Explore tiles, the sticky bar, the
  home page's "Option two" band - treats only `live` as bookable. `coming`
  says "Home visits are coming to <cities>" (or "soon") with no button to
  nowhere; `/home-visit` in that state is a short notice offering a video
  session, and when `live` its hero says "We visit: <areas>" and carries an
  inline pincode box (`PincodeCheck`, the same public `check-area` route the
  wizard asks). **An unreadable fact counts as met, an unreadable switch as
  off**: a hiccup must not take a working service off the site, and the
  routes behind it re-check the same facts anyway. `readHomeVisitEnabled()`
  stays the bare switch because the hospital-referral route gates on it - a
  marketing page learning to be honest must not make a server gate stricter.
- **Scroll-reveal is an enhancement over content that is already there.**
  `Reveal` / `Stagger` render visible in the server HTML (no `opacity:0`, a
  unit test and `HY-003` hold that); only after mount, and only for a block
  still below the fold, is the hidden state armed (instantly, off screen) and
  scrolling it in plays the entrance. Nothing is ever hidden for a visitor who
  asked for reduced motion, and the root layout wraps everything in
  `MotionProvider` (`MotionConfig reducedMotion="user"`). A new
  `AnimatePresence` on a public page takes `initial={false}`.
- **One label per mode, and conditions in the patient's words.** The two
  booking buttons say "Book a video session" and "Book a home visit"
  everywhere - hero, closing band, footer, menu, card, `/get-started`. Never
  "Book an assessment", "Book a Consultation" or "Booking Enquiry". Catalogue
  titles are mapped to four plain groups at display time
  (`patientConditionLabels.ts`: After surgery; Back, neck & joint pain; Stroke
  & Parkinson's; Children) - the rows are never renamed, a title nothing
  claims is printed as typed, and two cards never share a mapped name. The
  home hero's chips deep-link into `/book?category=<id>` and a group the
  catalogue has no condition for gets no chip. Copy avoids "Musculoskeletal",
  "range-of-motion testing", "protocol", "Virtual Physical Therapy" and
  "certified ... in clinic".
- **A session's notice and refund window are the admin's, like its length.**
  "An hour" and "12 hours' notice" were typed into the home, How it works and
  Mission pages. They are now `oneToOneLine(rows)`, `hoursNoticeLabel()` and
  `refundWindowLine()` over the catalogue and `readOnlineBookingRules()`
  (`online_booking_lead_time_hours`, `online_cancellation_refund_hours`);
  `sessionLengthCopy.test.ts` fails on "an hour", "1 hour" or any "N hours" in
  those files.
- **Trust surfaces show only what exists.** The avatar stack on "Qualified
  physiotherapists" draws the initials of therapists actually on `/team`
  (`readPublicTeam()`), none when nobody is; with an empty roster "Our team"
  leaves the nav, the footer and the Explore tiles (`requiresTeam` in
  `marketingNav.ts`; a failed read keeps it, as "could not check"). `/faq`
  falls back to the shipped answers in `faqDefaults.ts` (built from the live
  notice and refund settings, quoting no price) when no FAQ row is active.
  There is deliberately **no "lead physio" block**: it needs a real name and
  registration number, which only the owner can supply - never invent either.
- **WhatsApp and Call appear only for numbers that are real.** `contactLinks.ts`
  is the one rule (the footer, the menu chip, the sticky bar's icon and the
  "Not sure which to book? WhatsApp us" line in the home hero and every
  closing band all read it). Unset means absent, never a dead link.
## Analytics

- **Google Analytics sees the public pages and the booking widget, after consent, and nothing else.**
  `src/components/system/Analytics.tsx` loads nothing until a visitor accepts;
  `isTrackablePath` in `src/lib/analytics.ts` blocks the admin, dashboard,
  patient, therapist and hospital trees, so no route there is ever recorded
  and the banner never shows on one.
- **An event can only carry what its allowlist entry names.** Add an event
  and its parameters in `EVENTS` in `src/lib/analytics.ts`; `sanitizeEvent`
  drops everything else. A catalog service's title is sent (`service_name`) --
  the owner chose that. Never add a name, phone, email, address, pincode,
  anything the patient typed (concern, notes), therapist, exact time or promo
  code as a parameter; health information breaches Google's terms, and a price
  is sent as a band (`priceBand`). Every booking event carries `visit_mode`
  (`video` or `home`).
- **`purchase` fires only after the server has confirmed the payment**, from
  `trackPurchase`, with a hashed id and the amount converted from paise once.
  Analytics calls never throw and never wait: a blocked script must not break
  checkout.
- GA is for funnels. Revenue, utilisation and no-shows come from Supabase.
- **The consent card asks once, then rests for 7 days if it is ignored.**
  Ignoring it is not a "no", but showing it in every new tab was nagging.
  When the card is shown to someone who has not answered, `noteConsentAsked`
  stores the time (`mr_analytics_asked_at`, localStorage) and marks the tab
  (sessionStorage). That tab keeps the card on later pages; every other tab
  stays quiet until `CONSENT_REST_MS` (7 days) has passed, then it asks once
  more (`shouldAskForConsent`, unit-tested). A Yes or Not now is kept for
  good, and the footer link reopens the card at any time. Guard:
  `e2e/analytics-consent.spec.ts` AC-007.
- **The footer's "Analytics settings" works before the page has hydrated.** It
  is a link to `#analytics-settings` (`ANALYTICS_SETTINGS_HASH`), not a
  button: a tap that lands before React has attached its click handler still
  sets the hash, and the consent card opens for it on mount or on
  `hashchange`, then clears the hash. The splash now leaves on a CSS timer, so
  the page can be tapped before hydration; a button there was a dead control.
