# Graph Report - Claude  (2026-08-14)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2438 nodes · 5469 edges · 220 communities (135 shown, 85 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.57)
- Token cost: 8,391 input · 2,644 output

## Graph Freshness
- Built from commit: `d6ffdbbe`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Admin Account Management
- Session and Package Actions
- Condition and Patient Details
- Color Palette Tokens
- Admin Dashboard Views
- Health Profile Management
- User Profile Pages
- Slide Search Core
- Appointment and Referral Management
- Brand Search Core
- Admin Forms and Buttons
- Home Visit Booking API
- Therapist and Patient Dashboards
- Admin Metrics and Charts
- Landing Page Components
- Admin Calendar and Sessions
- Tailwind Generator Tests
- Booking and Scheduling UI
- TypeScript Configuration
- Public Information Pages
- HTML Token Validator
- User Authentication Pages
- Therapist Roster Management
- Home Visit Purchase Details
- Admin Directory Actions
- Package Purchase Details
- Logo Search Core
- Domain Search Logic
- Global Layout Components
- Payment and Receipt History
- Public Booking Pages
- Patient Dashboard Actions
- Admin and Hospital Login
- Home Visit Public Settings
- Spacing Design Tokens
- Tailwind Config Generator
- Design System Formatting
- Address and Referral Forms
- Package Booking Wizard
- Slide Generation Logic
- Design System Generator
- Patient Receipt Components
- Theme Color Tokens
- Color Mode Resolution
- Booking and Account Edits
- Contact Information Forms
- Background Image Generator
- E2E Test Setup
- Home Visit Admin Tab
- Card Style Tokens
- BM25 Search Algorithm
- Project Dev Dependencies
- Project Core Dependencies
- Admin Payout Management
- Icon Generation Utility
- Typography Design Tokens
- Therapist Cash Ledger
- Shadcn Installer Tests
- Luminance and Contrast Tests
- Color Extraction Utility
- Asset Validation Script
- Primitive Design Tokens
- Booking Scene Framework
- Therapist Earnings UI
- Design Token Schema
- Token Validation Script
- Shadcn Component Manager
- Shadcn CLI Integration
- Config File Generation
- Brand Context Injection
- Token Embedding Utility
- UI Design Documentation
- Component Installation Tests
- Tailwind Config Tests
- CSV Export Utilities
- Google Calendar Integration
- Generator Initialization
- Logo Generation Logic
- Token Transformation Script
- Button Style Tokens
- Animation Duration Tokens
- Multi-Domain Search Logic
- Admin Session Settings
- Package Catalog Management
- Patient Motivation and Calendar
- Booking Slot Logic
- Brand Token Sync
- Text Search Indexing
- Token Validator Tests
- Home Visit Package API
- FAQ Page Components
- Home Visit Package Management
- Treatment Category Management
- Patient Booking Hub
- Input Style Tokens
- Account Status Pages
- Payout Receipt Components
- Debug and Development Tools
- Domain Detection Tests
- Palette Selection Logic
- Settings Route Configuration
- Admin Payout Management
- FAQ Management System
- Testimonial Management System
- Avatar Upload and Processing
- NPM Build Scripts
- Admin Feature Controls
- Radius Design Tokens
- Large Size Tokens
- Small Size Tokens
- Google OAuth Authentication
- Supabase Proxy Configuration
- Vertical Padding Tokens
- Extra Large Tokens
- Empty Value Tokens
- Data Validation Scripts
- Project Metadata
- Database Schema Runner
- Profile Change Approval
- Hospital Onboarding Route
- Token Sync Regression Tests
- Blue Color Tokens
- Gray Color Tokens
- Slide Token Validator
- Spacing Token 16
- Spacing Token 1
- Spacing Token 3
- Spacing Token 8
- Destructive Color Tokens
- Border Design Tokens
- Destructive Foreground Tokens
- Muted Color Tokens
- Primary Foreground Tokens
- Ring Design Tokens
- Project Installer Initialization
- Temporary Project Fixtures
- Spacing and Interactive States
- Component Config Tests
- Secondary Foreground Tokens
- Installed Component Tests
- Project Root Tests
- Dry Run Tests
- Config Existence Tests
- Empty Component Tests
- Custom Font Tests
- Plugin Recommendation Tests
- TypeScript Config Tests
- Color Configuration Tests
- Plugin Configuration Tests
- Content Path Validation
- Theme Extension Tests
- Config Write Tests
- JavaScript Initialization Tests
- Config Content Verification
- Invalid Path Tests
- Full JS Config Tests
- Output Path Tests
- Base Structure Tests
- Vue Content Path Tests
- Custom Color Tests
- ESLint Configuration
- Git Post-Merge Hooks
- Graphify CLI Tools
- GSAP Core and Scroll
- Phone Number Library
- Framer Motion Library
- Next.js Configuration
- Tailwind CSS Library
- PostCSS Configuration
- Token Architecture Specification
- Data Extraction Specification
- Query Reference Documentation
- Graphify Integration Skill
- GSAP Framework Integration
- GSAP Performance Optimization
- GSAP Plugin Suite
- GSAP React Integration
- GSAP Timeline Management
- GSAP Utility Functions
- Slides Presentation Skill
- Boldonse Font License
- Bricolage Grotesque License
- Crimson Pro License
- DM Mono License
- Erica One License
- Geist Mono License
- Gloock Font License
- IBM Plex Mono License
- Instrument Sans License
- Italiana Font License
- JetBrains Mono License
- Jura Font License
- Libre Baskerville License
- Lora Font License
- National Park License
- Nothing You Could Do License
- Outfit Font License
- Pixelify Sans Font License
- Poiret One Font License
- Red Hat Mono Font License
- Silkscreen Font License
- Smooch Sans Font License
- Tektur Font License
- Work Sans Font License
- Young Serif Font License
- Apache License 2.0
- Documentation Freshness Workflow
- Supabase Schema Management
- File System Icons
- Global Navigation Icons
- Next.js Brand Assets
- Medical Imaging Renders
- Vercel Brand Assets
- Window Interface Icons
- SIL Font Licensing
- Bulk Component Tests

## God Nodes (most connected - your core abstractions)
1. `createAdminClient()` - 260 edges
2. `getAdminUser()` - 158 edges
3. `createClient()` - 95 edges
4. `parseJsonBody()` - 64 edges
5. `TailwindConfigGenerator` - 58 edges
6. `useConfirm()` - 46 edges
7. `createClient()` - 39 edges
8. `TestTailwindConfigGenerator` - 35 edges
9. `ShadcnInstaller` - 34 edges
10. `DesignSystemGenerator` - 29 edges

## Surprising Connections (you probably didn't know these)
- `TestTailwindConfigGenerator` --uses--> `TailwindConfigGenerator`  [INFERRED]
  .claude/skills/ui-styling/scripts/tests/test_tailwind_config_gen.py → .claude/skills/ui-styling/scripts/tailwind_config_gen.py
- `TestSearchDomains` --uses--> `BM25`  [INFERRED]
  .claude/skills/ui-ux-pro-max/scripts/tests/test_core.py → .claude/skills/design/scripts/cip/core.py
- `TestSearchDomains` --uses--> `DesignSystemGenerator`  [INFERRED]
  .claude/skills/ui-ux-pro-max/scripts/tests/test_core.py → .claude/skills/ui-ux-pro-max/scripts/design_system.py
- `TestGeneratedConfigIsValidJs` --uses--> `TailwindConfigGenerator`  [INFERRED]
  .claude/skills/ui-styling/scripts/tests/test_tailwind_config_gen.py → .claude/skills/ui-styling/scripts/tailwind_config_gen.py
- `TestDomainDetection` --uses--> `DesignSystemGenerator`  [INFERRED]
  .claude/skills/ui-ux-pro-max/scripts/tests/test_core.py → .claude/skills/ui-ux-pro-max/scripts/design_system.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Design Token Pipeline** — claude_skills_design_system_references_primitive_tokens_color_gray, claude_skills_design_system_references_semantic_tokens_color_background, claude_skills_design_system_references_token_architecture_layers [EXTRACTED 0.90]
- **Design Intelligence System** — claude_skills_ui_ux_pro_max_skill, claude_skills_ui_ux_pro_max_pro_rules, claude_skills_ui_ux_pro_max_quick_reference [EXTRACTED 1.00]
- **OFL Licensed Font Collection** — claude_skills_ui_styling_canvas_fonts_boldonse_ofl, claude_skills_ui_styling_canvas_fonts_bricolagegrotesque_ofl, claude_skills_ui_styling_canvas_fonts_crimsonpro_ofl, claude_skills_ui_styling_canvas_fonts_dmmono_ofl, claude_skills_ui_styling_canvas_fonts_ericaone_ofl, claude_skills_ui_styling_canvas_fonts_geistmono_ofl, claude_skills_ui_styling_canvas_fonts_gloock_ofl, claude_skills_ui_styling_canvas_fonts_ibmplexmono_ofl, claude_skills_ui_styling_canvas_fonts_instrumentsans_ofl, claude_skills_ui_styling_canvas_fonts_italiana_ofl, claude_skills_ui_styling_canvas_fonts_jetbrainsmono_ofl, claude_skills_ui_styling_canvas_fonts_jura_ofl, claude_skills_ui_styling_canvas_fonts_librebaskerville_ofl, claude_skills_ui_styling_canvas_fonts_lora_ofl, claude_skills_ui_styling_canvas_fonts_nationalpark_ofl, claude_skills_ui_styling_canvas_fonts_nothingyoucoulddo_ofl, claude_skills_ui_styling_canvas_fonts_outfit_ofl, claude_skills_ui_styling_canvas_fonts_pixelifysans_ofl, claude_skills_ui_styling_canvas_fonts_poiretone_ofl, claude_skills_ui_styling_canvas_fonts_redhatmono_ofl, claude_skills_ui_styling_canvas_fonts_silkscreen_ofl, claude_skills_ui_styling_canvas_fonts_smoochsans_ofl, claude_skills_ui_styling_canvas_fonts_tektur_ofl, claude_skills_ui_styling_canvas_fonts_worksans_ofl, claude_skills_ui_styling_canvas_fonts_youngserif_ofl [EXTRACTED 1.00]
- **OFL Licensed Font Software Collection** — claude_skills_ui_styling_canvas_fonts_boldonse_ofl, claude_skills_ui_styling_canvas_fonts_bricolagegrotesque_ofl, claude_skills_ui_styling_canvas_fonts_geistmono_ofl, claude_skills_ui_styling_canvas_fonts_ibmplexmono_ofl, claude_skills_ui_styling_canvas_fonts_jetbrainsmono_ofl [EXTRACTED 1.00]
- **UI Styling Framework** — claude_skills_ui_styling_shadcn_components, claude_skills_ui_styling_shadcn_theming, claude_skills_ui_styling_shadcn_accessibility, claude_skills_ui_styling_tailwind_utilities, claude_skills_ui_styling_tailwind_responsive, claude_skills_ui_styling_tailwind_customization [EXTRACTED 1.00]
- **UI/UX Pro Max Design Intelligence System** — claude_skills_ui_ux_pro_max_skill [EXTRACTED 1.00]
- **UI/UX Intelligence Framework** — claude_skills_ui_ux_pro_max_skill [EXTRACTED]
- **CI Automation Flow** — github_workflows_graphify_refresh, github_workflows_schema_apply_apply [INFERRED 0.80]
- **GSAP Animation Suite** — gsap_core_api, gsap_scrolltrigger_plugin [INFERRED 0.80]

## Communities (220 total, 85 thin omitted)

### Community 0 - "Admin Account Management"
Cohesion: 0.04
Nodes (71): POST(), POST(), POST(), POST(), POST(), POST(), POST(), POST() (+63 more)

### Community 1 - "Session and Package Actions"
Cohesion: 0.08
Nodes (36): VALID_ACTIONS, POST(), VALID_KEYS, ALLOWED_STATUSES, isoWeekKey(), POST(), SlotResult, POST() (+28 more)

### Community 2 - "Condition and Patient Details"
Cohesion: 0.06
Nodes (51): metadata, AnswerInput, POST(), POST(), ConditionAccessActions(), ConditionDetailContent(), daysSince(), ConditionDirectEditForm() (+43 more)

### Community 3 - "Color Palette Tokens"
Cohesion: 0.05
Nodes (53): $type, $value, $type, $value, $type, $value, $type, $value (+45 more)

### Community 4 - "Admin Dashboard Views"
Cohesion: 0.09
Nodes (26): AdminDashboardPage(), metadata, metadata, HospitalDashboardPage(), metadata, STATUS_STYLES, PatientDetailContent(), PatientNotesForm() (+18 more)

### Community 5 - "Health Profile Management"
Cohesion: 0.10
Nodes (31): ALLOWED_KEYS, POST(), ALLOWED_KEYS, POST(), ALLOWED_KEYS, POST(), POST(), ALLOWED_KEYS (+23 more)

### Community 6 - "User Profile Pages"
Cohesion: 0.10
Nodes (30): HospitalProfilePage(), metadata, metadata, PatientProfilePage(), GRANT_LABEL, GRANT_STYLE, metadata, TherapistHealthProfilesPage() (+22 more)

### Community 7 - "Slide Search Core"
Cohesion: 0.08
Nodes (36): format_context(), format_result(), main(), Format a single search result for display, Format contextual recommendations for display., BM25, calculate_pattern_break(), detect_domain() (+28 more)

### Community 8 - "Appointment and Referral Management"
Cohesion: 0.11
Nodes (28): POST(), POST(), POST(), POST(), POST(), POST(), POST(), POST() (+20 more)

### Community 9 - "Brand Search Core"
Cohesion: 0.08
Nodes (37): detect_domain(), get_cip_brief(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search across all domains and combine results (+29 more)

### Community 10 - "Admin Forms and Buttons"
Cohesion: 0.07
Nodes (26): metadata, nowTimestamp(), ApproveAccountButton(), AssignReferralForm(), minDateTimeLocal(), AssignTherapistForm(), BrandContactDetails, BrandContactDetailsForm() (+18 more)

### Community 11 - "Home Visit Booking API"
Cohesion: 0.13
Nodes (27): POST(), POST(), POST(), POST(), isoWeekKey(), POST(), SlotResult, GET() (+19 more)

### Community 12 - "Therapist and Patient Dashboards"
Cohesion: 0.10
Nodes (30): nowTimestamp(), PatientDashboardPage(), metadata, nowTimestamp(), STATUS_BADGE_STYLES, TherapistDashboardPage(), AddressEditor(), HomeVisitQueue() (+22 more)

### Community 13 - "Admin Metrics and Charts"
Cohesion: 0.13
Nodes (31): AdminMetricsTab(), Category, daysAgo(), formatInr(), formatShortDate(), nowTimestamp(), toDateInputValue(), TrendBarChart() (+23 more)

### Community 14 - "Landing Page Components"
Cohesion: 0.09
Nodes (21): PROGRAM_ART, revalidate, TRUST_POINTS, Area, AREAS, CareAreas(), EASE, EASE (+13 more)

### Community 15 - "Admin Calendar and Sessions"
Cohesion: 0.12
Nodes (24): AdminCalendarTab(), Category, Person, STATUS_STYLES, todayKey(), AdminSessionStoryTab(), Category, Person (+16 more)

### Community 16 - "Tailwind Generator Tests"
Cohesion: 0.06
Nodes (16): Test adding colors multiple times., Test adding full color palette., Test adding custom breakpoints., Test TailwindConfigGenerator class., Test that adding same plugin twice doesn't duplicate., Test plugin recommendations for Next.js., Test initialization with default settings., Test generating JavaScript configuration. (+8 more)

### Community 17 - "Booking and Scheduling UI"
Cohesion: 0.16
Nodes (25): BookingCalendar(), BookingStepOne(), REVEAL, ChipOption, SelectableChipGroup(), EASE, HomeVisitBulkScheduler(), Slot (+17 more)

### Community 18 - "TypeScript Configuration"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 19 - "Public Information Pages"
Cohesion: 0.10
Nodes (24): Category, ConditionsPage(), metadata, revalidate, ACCENTS, metadata, PATHS, metadata (+16 more)

### Community 20 - "HTML Token Validator"
Cohesion: 0.13
Nodes (24): get_context(), is_allowed_exception(), is_allowed_rgba(), is_inside_block(), load_css_variables(), main(), print_result(), print_summary() (+16 more)

### Community 21 - "User Authentication Pages"
Cohesion: 0.16
Nodes (14): metadata, metadata, ResetPasswordPage(), ROLE_LOGIN_HREF, metadata, ConfirmPasswordField(), EmailField(), InviteRegisterCard() (+6 more)

### Community 22 - "Therapist Roster Management"
Cohesion: 0.13
Nodes (24): AdminRosterTab(), STATE_STYLES, STATE_TITLES, Therapist, todayKey(), setsEqual(), Slot, slotKey() (+16 more)

### Community 23 - "Home Visit Purchase Details"
Cohesion: 0.13
Nodes (19): AppointmentRow, DetailResponse, EventRow, HomeVisitPurchaseDetailModal(), HomeVisitPurchasesTable(), STATUS_OPTIONS, AppointmentRow, DetailResponse (+11 more)

### Community 24 - "Admin Directory Actions"
Cohesion: 0.16
Nodes (14): AdminPeopleDirectory(), Person, CompletePayoutRequestButton(), PatientActiveToggle(), ResetHospitalPasswordButton(), ResetPatientPasswordButton(), ResetTherapistPasswordButton(), TherapistActiveToggle() (+6 more)

### Community 25 - "Package Purchase Details"
Cohesion: 0.14
Nodes (19): AppointmentRow, DetailResponse, EventRow, PackagePurchaseDetailModal(), AppointmentRow, DetailResponse, EASE, EventRow (+11 more)

### Community 26 - "Logo Search Core"
Cohesion: 0.11
Nodes (19): BM25, detect_domain(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search across all domains and combine results (+11 more)

### Community 27 - "Domain Search Logic"
Cohesion: 0.12
Nodes (18): _domain_keywords(), _get_bm25(), _load_csv(), _load_product_keywords(), Load CSV and return list of dicts, with mtime-based caching., Fitted BM25 index for this file+columns, with mtime-based caching., Core search function using BM25. Returns (results, bm25_or_none)., Nearest known vocabulary terms for a query that returned 0 hits, so the caller… (+10 more)

### Community 28 - "Global Layout Components"
Cohesion: 0.13
Nodes (19): inter, jakarta, metadata, RootLayout(), FarewellBanner(), Footer(), BASE_LINKS, HOME_VISIT_LINK (+11 more)

### Community 29 - "Payment and Receipt History"
Cohesion: 0.14
Nodes (23): AdminPaymentHistoryTab(), AdminReceiptRow, Category, formatDateTime(), formatInr(), Patient, PatientTransactionTable(), RECEIPT_STAGE_LABEL (+15 more)

### Community 30 - "Public Booking Pages"
Cohesion: 0.12
Nodes (18): BookHomeVisitPage(), metadata, revalidate, BookPage(), metadata, revalidate, HomeVisitPage(), Home() (+10 more)

### Community 31 - "Patient Dashboard Actions"
Cohesion: 0.12
Nodes (16): metadata, STATUS_STYLES, CancelSessionButton(), OnboardingTour(), Rect, Step, STEPS, PromptDialog() (+8 more)

### Community 32 - "Admin and Hospital Login"
Cohesion: 0.15
Nodes (12): metadata, metadata, ADMIN_REALTIME_TABLES, AdminTabs(), TabDef, TabKey, AdminLoginCard(), HospitalLoginCard() (+4 more)

### Community 33 - "Home Visit Public Settings"
Cohesion: 0.13
Nodes (15): metadata, revalidate, PublicHomeVisitPackage, DEFAULT_BOOKING_LANGUAGES, DEFAULT_CONTACT_EMAIL, DEFAULT_CONTACT_PHONE, DEFAULT_FOOTER_COPYRIGHT_TEXT, DEFAULT_HOME_VISIT_PAGE_HEADING (+7 more)

### Community 34 - "Spacing Design Tokens"
Cohesion: 0.09
Nodes (22): $type, $value, $type, $value, $type, $value, $type, $value (+14 more)

### Community 35 - "Tailwind Config Generator"
Cohesion: 0.10
Nodes (12): main(), Add custom font families. Args: fonts: Dict of font_type: [font_names] e.g.,…, Add custom spacing values. Args: spacing: Dict of name: value e.g., {'18':…, Add custom breakpoints. Args: breakpoints: Dict of name: width e.g., {'3xl':…, Add plugin requirements. Args: plugins: List of plugin names e.g.,…, Get plugin recommendations based on configuration. Returns: List of recommended…, Generate Tailwind CSS configuration files., Validate configuration. Returns: Tuple of (valid, message) (+4 more)

### Community 36 - "Design System Formatting"
Cohesion: 0.12
Nodes (20): ansi_ljust(), _detect_page_type(), format_ascii_box(), format_markdown(), format_master_md(), format_page_override_md(), _generate_intelligent_overrides(), hex_to_ansi() (+12 more)

### Community 37 - "Address and Referral Forms"
Cohesion: 0.17
Nodes (15): AddressForm(), inputCls(), AreaCheck, HomeVisitBookingWizard(), inputCls(), WizardPackage, checkReferralCode(), ReferralCodeCheck (+7 more)

### Community 38 - "Package Booking Wizard"
Cohesion: 0.17
Nodes (16): BookingWizard(), Category, formatInr(), PackageData, BuyPackageButton(), PayNowButton(), BOOKING_LEAD_TIME_HOURS, BOOKING_LEAD_TIME_MS (+8 more)

### Community 39 - "Slide Generation Logic"
Cohesion: 0.15
Nodes (19): _e(), generate_chart_slide(), generate_cta_slide(), generate_deck(), generate_metrics_slide(), generate_problem_slide(), generate_solution_slide(), generate_testimonial_slide() (+11 more)

### Community 40 - "Design System Generator"
Cohesion: 0.15
Nodes (11): DesignSystemGenerator, generate_design_system(), persist_design_system(), Generates design system recommendations from aggregated searches., Load reasoning rules from CSV., Find matching reasoning rule for a category., Apply reasoning rules to search results., Main entry point for design system generation. Args: query: Search query (e.g.,… (+3 more)

### Community 41 - "Patient Receipt Components"
Cohesion: 0.13
Nodes (18): formatDateHeading(), formatDateTime(), formatInr(), ReceiptsSection(), STAGE_LABEL, STAGE_PILL_STYLE, BookingReceipt, BookingReceiptStage (+10 more)

### Community 42 - "Theme Color Tokens"
Cohesion: 0.11
Nodes (19): $type, $value, background, foreground, muted-foreground, primary, primary-hover, secondary (+11 more)

### Community 43 - "Color Mode Resolution"
Cohesion: 0.16
Nodes (10): _filter_anti_patterns_for_mode(), _query_wants_dark(), True when a styles.csv row describes itself as dark-first., True when the query explicitly asks for a dark theme., Resolve the mode the rest of the output has to agree with., Drop "avoid dark mode" advice once dark mode is the resolved answer., _resolve_color_mode(), _style_is_dark_primary() (+2 more)

### Community 44 - "Booking and Account Edits"
Cohesion: 0.17
Nodes (11): DeclineAccountButton(), EditBookingForm(), minDateTimeLocal(), toDateTimeLocalValue(), MarkPaidByCashButton(), Category, ProfileSessionList(), TherapistNotAvailableToggle() (+3 more)

### Community 45 - "Contact Information Forms"
Cohesion: 0.18
Nodes (14): PatientContactEditForm(), TherapistContactEditForm(), HospitalInquiryForm(), SOURCES, PhoneNumberField(), composePhone(), COUNTRY_OPTIONS, CountryOption (+6 more)

### Community 46 - "Background Image Generator"
Cohesion: 0.17
Nodes (17): generate_css_for_background(), get_background_image(), get_curated_images(), get_overlay_css(), get_pexels_search_url(), load_backgrounds_config(), load_brand_colors(), main() (+9 more)

### Community 47 - "E2E Test Setup"
Cohesion: 0.21
Nodes (13): ensureUser(), globalSetup(), PATIENTS, THERAPISTS, adminClient(), BASE, cookieHeaderFor(), profileIdFor() (+5 more)

### Community 48 - "Home Visit Admin Tab"
Cohesion: 0.16
Nodes (13): AdminHomeVisitsTab(), SubTab, AreaRow(), HomeVisitAreaManager(), inputCls(), ServiceAreaRow, WaitlistRow, HomeVisitPurchaseRow (+5 more)

### Community 49 - "Card Style Tokens"
Cohesion: 0.20
Nodes (12): $type, $value, bg, bg, padding, shadow, card, bg (+4 more)

### Community 50 - "BM25 Search Algorithm"
Cohesion: 0.15
Nodes (9): BM25, _normalize(), Apply synonym substitution before tokenizing., BM25 ranking algorithm for text search, Lowercase, normalize synonyms, split, remove punctuation, filter stopwords, Build BM25 index from documents, Score all documents against query, All indexed terms, for suggestion/typo-recovery purposes. (+1 more)

### Community 51 - "Project Dev Dependencies"
Cohesion: 0.12
Nodes (17): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, @playwright/test, @tailwindcss/postcss, @types/node (+9 more)

### Community 52 - "Project Core Dependencies"
Cohesion: 0.12
Nodes (17): @fortawesome/fontawesome-free, googleapis, next, dependencies, @fortawesome/fontawesome-free, googleapis, next, razorpay (+9 more)

### Community 53 - "Admin Payout Management"
Cohesion: 0.15
Nodes (13): AdminPayoutsTab(), Category, formatInr(), Patient, Therapist, TherapistSessionList(), METHOD_LABEL, NOTE_PLACEHOLDER (+5 more)

### Community 54 - "Icon Generation Utility"
Cohesion: 0.20
Nodes (15): apply_color(), apply_viewbox_size(), extract_svgs(), generate_batch(), generate_icon(), generate_sizes(), load_env(), main() (+7 more)

### Community 55 - "Typography Design Tokens"
Cohesion: 0.12
Nodes (16): $type, $value, $type, $value, $type, $value, $type, $value (+8 more)

### Community 56 - "Therapist Cash Ledger"
Cohesion: 0.23
Nodes (13): IMPLEMENTED_METHODS, POST(), formatInr(), HomeVisitCashLedger(), MarkRefundReturnedButton(), MarkRemittedButton(), TherapistCashCard(), amountOf() (+5 more)

### Community 57 - "Shadcn Installer Tests"
Cohesion: 0.14
Nodes (8): Test adding components that are already installed., Test adding components in dry run mode., Test ShadcnInstaller class., Test listing installed components without config., Test listing installed components when none exist., Test checking for existing shadcn config., Test getting installed components without config., TestShadcnInstaller

### Community 58 - "Luminance and Contrast Tests"
Cohesion: 0.18
Nodes (7): _palette_is_dark(), WCAG relative luminance of a #RRGGBB string, or None if unparseable., True when a colors.csv row's Background is a dark surface., _relative_luminance(), The exact reproduction from issue #428., TestEndToEndCoherence, TestLuminance

### Community 59 - "Color Extraction Utility"
Cohesion: 0.22
Nodes (11): calculateCompliance(), colorDistance(), displayPalette(), extractHexColors(), findNearestBrandColor(), fs, generateImageMagickCommand(), hexToRgb() (+3 more)

### Community 60 - "Asset Validation Script"
Cohesion: 0.25
Nodes (13): checkManifest(), formatBytes(), formatOutput(), fs, main(), parseFilename(), path, RULES (+5 more)

### Community 61 - "Primitive Design Tokens"
Cohesion: 0.19
Nodes (14): $type, $value, $type, $value, $type, $value, primitive, radius (+6 more)

### Community 62 - "Booking Scene Framework"
Cohesion: 0.18
Nodes (11): BookingScene(), EASE, EXERCISES, FINDINGS, FindingsScene(), PlanScene(), rise, SLOTS (+3 more)

### Community 63 - "Therapist Earnings UI"
Cohesion: 0.24
Nodes (11): RequestPayoutButton(), EarningsDay, formatInr(), TherapistEarningsChart(), CompletedRequest, dayLabel(), formatDate(), formatInr() (+3 more)

### Community 64 - "Design Token Schema"
Cohesion: 0.15
Nodes (12): component, $type, $value, dark, semantic, $schema, $type, $value (+4 more)

### Community 65 - "Token Validation Script"
Cohesion: 0.24
Nodes (11): extensions, formatReport(), fs, getFiles(), main(), parseArgs(), path, patterns (+3 more)

### Community 66 - "Shadcn Component Manager"
Cohesion: 0.20
Nodes (7): main(), Handle shadcn/ui component installation., ShadcnInstaller, Tests for shadcn_add.py, Test initialization with custom project root., Test getting installed components when files exist., Test adding components with empty list.

### Community 67 - "Shadcn CLI Integration"
Cohesion: 0.21
Nodes (6): Add all available shadcn/ui components. Args: overwrite: If True, overwrite…, List installed components. Returns: Tuple of (success, message with component…, Check if shadcn is initialized in project. Returns: True if components.json…, Get list of already installed components. Returns: List of installed component…, Read shadcn version from project package.json; fall back to a pinned default., Add shadcn/ui components. Args: components: List of component names to add…

### Community 68 - "Config File Generation"
Cohesion: 0.20
Nodes (6): Generate configuration file content. Returns: Configuration file as string, Generate TypeScript configuration., Generate JavaScript configuration., Format plugins array for config. Validates each plugin name against a strict…, Add indentation to JSON string., Write configuration to file. Returns: Tuple of (success, message)

### Community 69 - "Brand Context Injection"
Cohesion: 0.31
Nodes (10): extractColorsFromTable(), extractCoreAttributes(), extractHexColors(), extractImageStyle(), extractTypography(), extractVoice(), fs, generatePromptAddition() (+2 more)

### Community 70 - "Token Embedding Utility"
Cohesion: 0.18
Nodes (8): args, fs, minimal, MINIMAL_TOKENS, path, projectRoot, tokensPath, wrapStyle

### Community 71 - "UI Design Documentation"
Cohesion: 0.18
Nodes (11): Canvas Design System, shadcn/ui Accessibility Patterns, shadcn/ui Component Reference, shadcn/ui Theming & Customization, UI Styling Skill, Tailwind CSS Customization, Tailwind CSS Responsive Design, Tailwind CSS Utility Reference (+3 more)

### Community 72 - "Component Installation Tests"
Cohesion: 0.18
Nodes (6): Test adding components with overwrite flag., Test successful component addition., Test component addition with subprocess error., Test component addition when npx is not found., Test successful addition of all components., patch

### Community 73 - "Tailwind Config Tests"
Cohesion: 0.22
Nodes (8): Tests for tailwind_config_gen.py, Reduce a generated TS/JS config to a bare assignable object so it can be handed…, Regression guard for the missing-comma bug between the ``theme`` block and…, The property preceding ``plugins`` must end with a comma (pure-Python check, so…, The emitted config parses as valid JS via ``node --check``., _strip_to_object(), TestGeneratedConfigIsValidJs, parametrize

### Community 74 - "CSV Export Utilities"
Cohesion: 0.31
Nodes (7): DownloadCsvButton(), PackagePurchasesTable(), STATUS_OPTIONS, CsvColumn, downloadCsv(), escapeCell(), toCsv()

### Community 75 - "Google Calendar Integration"
Cohesion: 0.35
Nodes (10): CalendarEventInput, createSessionCalendarEvent(), createSessionMeetEvent(), deleteSessionMeetEvent(), getCalendarClient(), logCalendarError(), normalizeTimezone(), SessionEventInput (+2 more)

### Community 76 - "Generator Initialization"
Cohesion: 0.22
Nodes (6): Any, Path, Initialize generator. Args: typescript: If True, generate .ts config, else .js…, Determine default output path., Create base configuration structure., Get default content paths for framework.

### Community 77 - "Logo Generation Logic"
Cohesion: 0.29
Nodes (9): enhance_prompt(), generate_batch(), generate_logo(), load_env(), main(), Enhance the logo prompt with style and industry modifiers, Generate a logo using Gemini models with image generation Args: aspect_ratio:…, Generate multiple logo variants with different styles (+1 more)

### Community 78 - "Token Transformation Script"
Cohesion: 0.36
Nodes (9): flattenTokens(), fs, generateCSS(), generateTailwind(), main(), parseArgs(), path, resolveReference() (+1 more)

### Community 79 - "Button Style Tokens"
Cohesion: 0.20
Nodes (10): fg, font-size, hover-bg, button, $type, $value, $type, $value (+2 more)

### Community 80 - "Animation Duration Tokens"
Cohesion: 0.20
Nodes (10): fast, normal, slow, $type, $value, $type, $value, duration (+2 more)

### Community 81 - "Multi-Domain Search Logic"
Cohesion: 0.20
Nodes (6): Execute searches across multiple domains., Select best matching result based on priority keywords., Extract results list from search result dict., Generate complete design system recommendation. variance/motion/density are…, Bucket a 1-10 dial value into its tier config. Returns None if value is None., _resolve_dial()

### Community 82 - "Admin Session Settings"
Cohesion: 0.27
Nodes (7): AdminSessionManagerTab(), Package, SubTab, PurchaseRow, PackageSettingsForm(), saveSetting(), AdminSettings

### Community 83 - "Package Catalog Management"
Cohesion: 0.31
Nodes (7): inputCls(), Package, PackageCatalogForm(), DeleteButton(), Package, PackageCatalogManager(), computePackageSavings()

### Community 84 - "Patient Motivation and Calendar"
Cohesion: 0.27
Nodes (7): BOOKING_FROM_DASHBOARD, PatientMonthMotivation(), BUCKET_DOT_COLOR, BUCKET_FILL_STYLE, CalendarSession, ColorBucket, MonthStats

### Community 85 - "Booking Slot Logic"
Cohesion: 0.36
Nodes (9): buildCalendarMonth(), CalendarCell, CalendarMonth, earliestBookableDateKey(), isDateBookable(), isSlotBookable(), slotStartMs(), toDateKey() (+1 more)

### Community 86 - "Brand Token Sync"
Cohesion: 0.33
Nodes (8): adjustBrightness(), { execFileSync }, extractColorsFromMarkdown(), fs, generateColorScale(), main(), path, updateDesignTokens()

### Community 87 - "Text Search Indexing"
Cohesion: 0.28
Nodes (5): BM25, BM25 ranking algorithm for text search, Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query

### Community 88 - "Token Validator Tests"
Cohesion: 0.28
Nodes (8): Path, Regression tests for validate-tokens.cjs. The validator used to skip any line…, A hardcoded hex on the same line as a var() token is still a violation., A line that references only tokens produces no false positives., _run(), test_flags_hardcoded_hex_sharing_line_with_token(), test_token_only_line_reports_no_violation(), CompletedProcess

### Community 89 - "Home Visit Package API"
Cohesion: 0.42
Nodes (6): POST(), POST(), HomeVisitPackageColumns, HomeVisitPackagePayload, parseOptionalPositiveInt(), validateHomeVisitPackagePayload()

### Community 90 - "FAQ Page Components"
Cohesion: 0.25
Nodes (7): Faq, FaqPage(), metadata, revalidate, Faq, FaqAccordion(), MotionButton()

### Community 91 - "Home Visit Package Management"
Cohesion: 0.31
Nodes (5): HomeVisitPackage, HomeVisitPackageForm(), inputCls(), DeleteButton(), HomeVisitPackageManager()

### Community 92 - "Treatment Category Management"
Cohesion: 0.25
Nodes (6): Category, NewCategoryValues, TreatmentCategoryForm(), Category, DeleteButton(), TreatmentCategoryManager()

### Community 93 - "Patient Booking Hub"
Cohesion: 0.25
Nodes (6): HomeVisitPackages(), HubCategory, HubHomeVisitPackage, HubOnlinePackage, PatientBookingHub(), computeHomeVisitSavings()

### Community 94 - "Input Style Tokens"
Cohesion: 0.29
Nodes (8): padding-x, input, $type, $value, focus-ring, padding-x, $type, $value

### Community 95 - "Account Status Pages"
Cohesion: 0.32
Nodes (4): metadata, metadata, PendingApprovalPage(), SUPPORT_EMAIL

### Community 96 - "Payout Receipt Components"
Cohesion: 0.39
Nodes (6): Modal(), formatDateHeading(), formatDateTime(), formatInr(), TherapistPayoutReceiptsSection(), PayoutReceipt

### Community 97 - "Debug and Development Tools"
Cohesion: 0.54
Nodes (6): DebugNav(), routes, toLocalInputValue(), debugNow(), getDebugNowOffsetMs(), setDebugNowOffsetMs()

### Community 98 - "Domain Detection Tests"
Cohesion: 0.43
Nodes (3): detect_domain(), Auto-detect the most relevant domain from query. Matches are weighted by…, TestDomainDetection

### Community 99 - "Palette Selection Logic"
Cohesion: 0.43
Nodes (3): Pick the highest-ranked palette matching the resolved mode. Only the dark case…, _select_palette_for_mode(), TestPaletteSelection

### Community 100 - "Settings Route Configuration"
Cohesion: 0.29
Nodes (6): ALLOWED_COLUMNS, BRAND_TEXT_FIELDS, CONTACT_FIELDS, HOME_VISIT_COPY_FIELDS, LONG_TEXT_FIELDS, POST()

### Community 101 - "Admin Payout Management"
Cohesion: 0.43
Nodes (5): AdminPayoutRequestsTab(), formatDateTime(), formatInr(), PayoutRequestRow, StartReviewPayoutRequestButton()

### Community 102 - "FAQ Management System"
Cohesion: 0.33
Nodes (5): Faq, FaqForm(), DeleteButton(), Faq, FaqManager()

### Community 103 - "Testimonial Management System"
Cohesion: 0.33
Nodes (5): Testimonial, TestimonialForm(), DeleteButton(), Testimonial, TestimonialManager()

### Community 104 - "Avatar Upload and Processing"
Cohesion: 0.48
Nodes (4): AvatarThumbnail(), initialsOf(), AvatarUpload(), compressImage()

### Community 105 - "NPM Build Scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, lint, start, test:e2e

### Community 106 - "Admin Feature Controls"
Cohesion: 0.47
Nodes (4): AdminFeatureControlTab(), GoogleMeetSyncIssue, saveSetting(), BookingLanguagesSection()

### Community 107 - "Radius Design Tokens"
Cohesion: 0.60
Nodes (5): radius, radius, radius, $type, $value

### Community 108 - "Large Size Tokens"
Cohesion: 0.60
Nodes (5): lg, $type, $value, lg, lg

### Community 109 - "Small Size Tokens"
Cohesion: 0.60
Nodes (5): sm, sm, sm, $type, $value

### Community 110 - "Google OAuth Authentication"
Cohesion: 0.40
Nodes (3): authUrl, oauth2Client, server

### Community 111 - "Supabase Proxy Configuration"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 112 - "Vertical Padding Tokens"
Cohesion: 0.67
Nodes (4): padding-y, padding-y, $type, $value

### Community 113 - "Extra Large Tokens"
Cohesion: 0.67
Nodes (4): xl, xl, $type, $value

### Community 114 - "Empty Value Tokens"
Cohesion: 0.67
Nodes (4): $type, $value, none, none

### Community 115 - "Data Validation Scripts"
Cohesion: 0.83
Nodes (3): _check_file(), main(), _read_rows()

### Community 116 - "Project Metadata"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 119 - "Hospital Onboarding Route"
Cohesion: 0.83
Nodes (3): generatePassword(), generateReferralCode(), POST()

### Community 122 - "Blue Color Tokens"
Cohesion: 0.67
Nodes (3): Blue Scale Primitives, Primary Color Semantic Token, Tailwind Configuration Mapping

### Community 123 - "Gray Color Tokens"
Cohesion: 0.67
Nodes (3): Gray Scale Primitives, Background Semantic Token, HTML Slide Template

### Community 125 - "Spacing Token 16"
Cohesion: 0.67
Nodes (3): $type, $value, 16

### Community 126 - "Spacing Token 1"
Cohesion: 0.67
Nodes (3): $type, $value, 1

### Community 127 - "Spacing Token 3"
Cohesion: 0.67
Nodes (3): $type, $value, 3

### Community 128 - "Spacing Token 8"
Cohesion: 0.67
Nodes (3): $type, $value, 8

### Community 129 - "Destructive Color Tokens"
Cohesion: 0.67
Nodes (3): destructive, $type, $value

### Community 130 - "Border Design Tokens"
Cohesion: 0.60
Nodes (5): $type, $value, border, border, border

### Community 131 - "Destructive Foreground Tokens"
Cohesion: 0.67
Nodes (3): destructive-foreground, $type, $value

### Community 132 - "Muted Color Tokens"
Cohesion: 0.67
Nodes (3): muted, $type, $value

### Community 133 - "Primary Foreground Tokens"
Cohesion: 0.67
Nodes (3): primary-foreground, $type, $value

### Community 134 - "Ring Design Tokens"
Cohesion: 0.67
Nodes (3): ring, $type, $value

### Community 139 - "Secondary Foreground Tokens"
Cohesion: 0.67
Nodes (3): secondary-foreground, $type, $value

## Knowledge Gaps
- **543 isolated node(s):** `PackageColumns`, `TherapistRateBasis`, `SlotResult`, `AnswerInput`, `SlotInput` (+538 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **85 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createAdminClient()` connect `Admin Account Management` to `Session and Package Actions`, `Condition and Patient Details`, `Admin Dashboard Views`, `Health Profile Management`, `Settings Route Configuration`, `User Profile Pages`, `Appointment and Referral Management`, `Admin Forms and Buttons`, `Home Visit Booking API`, `Therapist and Patient Dashboards`, `Profile Change Approval`, `Hospital Onboarding Route`, `Therapist Cash Ledger`, `Home Visit Package API`, `Patient Dashboard Actions`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `formatSlotTime()` connect `Therapist and Patient Dashboards` to `Payout Receipt Components`, `Admin Dashboard Views`, `Address and Referral Forms`, `Patient Receipt Components`, `Admin Forms and Buttons`, `Booking and Account Edits`, `Admin Payout Management`, `User Authentication Pages`, `Therapist Cash Ledger`, `Payment and Receipt History`, `Patient Dashboard Actions`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Session and Package Actions` to `Admin Account Management`, `Condition and Patient Details`, `Admin Dashboard Views`, `Health Profile Management`, `User Profile Pages`, `Appointment and Referral Management`, `Admin Forms and Buttons`, `Home Visit Booking API`, `Therapist and Patient Dashboards`, `Account Status Pages`, `Patient Dashboard Actions`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `TailwindConfigGenerator` (e.g. with `TestGeneratedConfigIsValidJs` and `TestTailwindConfigGenerator`) actually correct?**
  _`TailwindConfigGenerator` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `PackageColumns`, `TherapistRateBasis`, `SlotResult` to the rest of the system?**
  _543 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Account Management` be split into smaller, more focused modules?**
  _Cohesion score 0.041023166023166024 - nodes in this community are weakly interconnected._
- **Should `Session and Package Actions` be split into smaller, more focused modules?**
  _Cohesion score 0.07773952954675846 - nodes in this community are weakly interconnected._