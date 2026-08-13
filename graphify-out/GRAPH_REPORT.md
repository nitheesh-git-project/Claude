# Graph Report - .  (2026-08-13)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2179 nodes · 4618 edges · 184 communities (113 shown, 71 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.57)
- Token cost: 7,110 input · 1,981 output

## Graph Freshness
- Built from commit: `9afadde1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Admin API Routes
- Entity Detail Modals
- Booking Calendar Components
- Client-Side Action Handlers
- Admin Patient Management
- Color Palette Tokens
- Admin Dashboard Overview
- Project Dependencies
- Admin Content Management
- Card Component Tokens
- Appointment and Referral Logic
- Slide Search Utilities
- Core Search Engine
- Patient Dashboard Features
- Admin Session Scheduling
- Spacing Design Tokens
- Tailwind Generator Tests
- Global Layout Components
- Admin Analytics Dashboard
- TypeScript Configuration
- HTML Token Validator
- Landing Page Sections
- User Authentication Pages
- Package Detail Views
- Logo Search Core
- Semantic Color Tokens
- Domain Search Logic
- Admin Payment History
- Admin Login and Tabs
- Tailwind Config Generator
- Public Service Pages
- Therapist Dashboard Actions
- Design System Formatting
- User Profile Management
- Booking and Payment Flow
- Slide Generation Logic
- Design System Engine
- Patient Receipt Components
- Border Radius Tokens
- Theme Mode Resolution
- Contact Information Forms
- Background Image Utilities
- How It Works Page
- BM25 Search Algorithm
- Icon Generation Scripts
- Font Size Tokens
- Shadcn Installer Tests
- Color Contrast Testing
- Therapist Navigation Shell
- Color Extraction Utilities
- Asset Validation Scripts
- FAQ and Onboarding
- Therapist Earnings Management
- Profile and Password Reset
- Token Validation Script
- Design Token Starter
- Shadcn Component CLI
- Shadcn Installation Logic
- Config File Serialization
- Brand Context Injection
- Token Embedding Utilities
- Shadcn Installer Integration Tests
- Tailwind Config Regression Tests
- Package Management API
- Public Booking Pages
- Hospital Account Settings
- Team Directory Page
- CSV Export Utilities
- Generator Initialization
- Logo Generation Scripts
- Token Transformation Scripts
- Animation Duration Tokens
- Multi-Domain Search Orchestrator
- Appointment Cancellation Logic
- Admin Session Settings
- Package Catalog Management
- Brand Token Sync
- Text Search Indexing
- Token Validator Tests
- Treatment Category Management
- Design System Architecture
- Account Status Pages
- Therapist Payout Modals
- Domain Detection Tests
- Palette Selection Logic
- Admin Payout Processing
- Large Size Tokens
- GSAP Animation Library
- Google Auth Utilities
- Brand Contact Forms
- Interactive Story Component
- Supabase Proxy Config
- Extra Large Tokens
- Medium Size Tokens
- UI Documentation References
- Data Validation Script
- Hospital Onboarding API
- Brand Token Tests
- Slide Token Validator
- Destructive Foreground Token
- Button Component Tokens
- Primary Foreground Token
- Input Component Tokens
- Project Installer Setup
- Test Fixture Setup
- UI/UX Design Guidelines
- Therapist Password Reset
- Design System Reference
- Component Addition Tests
- Component Listing Tests
- Project Initialization Tests
- Dry Run Tests
- Config Existence Tests
- Empty Component Tests
- Empty Addition Tests
- Font Addition Tests
- Plugin Recommendation Tests
- TS Config Generation
- Color Config Generation
- Plugin Config Generation
- Config Validation Tests
- Theme Validation Tests
- Config File Writing
- JS Initialization Tests
- Config Content Verification
- Config Path Error Tests
- JS Config Generation
- TS Output Path Tests
- Base Config Structure
- Vue Content Paths
- Custom Color Tests
- ESLint Configuration
- Git Post-Merge Hook
- Next.js Configuration
- PostCSS Configuration
- Extraction Specification
- Query Reference
- Graph Generation Tool
- GSAP Performance Optimization
- GSAP Animation Plugins
- GSAP Animation Utilities
- Presentation Slides
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
- Pixelify Sans License
- Poiret One License
- Red Hat Mono License
- Silkscreen Font License
- Smooch Sans License
- Tektur Font License
- Work Sans License
- Young Serif License
- Responsive Design Docs
- Documentation Update Workflow
- Graph Refresh Workflow
- Medical Imaging Reference
- Open Font License
- Shadow Design Tokens
- Border Design Tokens
- Radius Design Tokens
- Spacing Design Tokens
- Generic Design Tokens
- Destructive Color Token
- Muted Color Token
- Ring Style Token
- Secondary Foreground Token

## God Nodes (most connected - your core abstractions)
1. `createAdminClient()` - 208 edges
2. `getAdminUser()` - 128 edges
3. `createClient()` - 79 edges
4. `TailwindConfigGenerator` - 58 edges
5. `parseJsonBody()` - 42 edges
6. `createClient()` - 37 edges
7. `TestTailwindConfigGenerator` - 35 edges
8. `useConfirm()` - 35 edges
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
- **OFL Licensed Font Collection** — claude_skills_ui_styling_canvas_fonts_boldonse_ofl, claude_skills_ui_styling_canvas_fonts_bricolagegrotesque_ofl, claude_skills_ui_styling_canvas_fonts_crimsonpro_ofl, claude_skills_ui_styling_canvas_fonts_dmmono_ofl, claude_skills_ui_styling_canvas_fonts_ericaone_ofl, claude_skills_ui_styling_canvas_fonts_geistmono_ofl, claude_skills_ui_styling_canvas_fonts_gloock_ofl, claude_skills_ui_styling_canvas_fonts_ibmplexmono_ofl, claude_skills_ui_styling_canvas_fonts_instrumentsans_ofl, claude_skills_ui_styling_canvas_fonts_italiana_ofl, claude_skills_ui_styling_canvas_fonts_jetbrainsmono_ofl, claude_skills_ui_styling_canvas_fonts_jura_ofl, claude_skills_ui_styling_canvas_fonts_librebaskerville_ofl, claude_skills_ui_styling_canvas_fonts_lora_ofl, claude_skills_ui_styling_canvas_fonts_nationalpark_ofl, claude_skills_ui_styling_canvas_fonts_nothingyoucoulddo_ofl, claude_skills_ui_styling_canvas_fonts_outfit_ofl, claude_skills_ui_styling_canvas_fonts_pixelifysans_ofl, claude_skills_ui_styling_canvas_fonts_poiretone_ofl, claude_skills_ui_styling_canvas_fonts_redhatmono_ofl, claude_skills_ui_styling_canvas_fonts_silkscreen_ofl, claude_skills_ui_styling_canvas_fonts_smoochsans_ofl, claude_skills_ui_styling_canvas_fonts_tektur_ofl, claude_skills_ui_styling_canvas_fonts_worksans_ofl, claude_skills_ui_styling_canvas_fonts_youngserif_ofl [EXTRACTED 1.00]
- **OFL Licensed Font Software Collection** — claude_skills_ui_styling_canvas_fonts_boldonse_ofl, claude_skills_ui_styling_canvas_fonts_bricolagegrotesque_ofl, claude_skills_ui_styling_canvas_fonts_geistmono_ofl, claude_skills_ui_styling_canvas_fonts_ibmplexmono_ofl, claude_skills_ui_styling_canvas_fonts_jetbrainsmono_ofl [EXTRACTED 1.00]
- **GSAP Animation Ecosystem** — claude_skills_gsap_core_skill_gsap_core, claude_skills_gsap_timeline_skill_gsap_timeline, claude_skills_gsap_scrolltrigger_skill_gsap_scrolltrigger, claude_skills_gsap_plugins_skill_gsap_plugins, claude_skills_gsap_react_skill_gsap_react, claude_skills_gsap_frameworks_skill_gsap_frameworks, claude_skills_gsap_performance_skill_gsap_performance, claude_skills_gsap_utils_skill_gsap_utils [EXTRACTED 1.00]
- **UI Styling & Tailwind Reference Set** — claude_skills_ui_styling_references_shadcn_accessibility, claude_skills_ui_styling_references_shadcn_components, claude_skills_ui_styling_references_shadcn_theming, claude_skills_ui_styling_references_tailwind_customization, claude_skills_ui_styling_references_tailwind_responsive, claude_skills_ui_styling_references_tailwind_utilities [EXTRACTED 1.00]
- **UI/UX Pro Max Design Intelligence System** — claude_skills_ui_ux_pro_max_skill, claude_skills_ui_ux_pro_max_references_pro_rules, claude_skills_ui_ux_pro_max_references_quick_reference [EXTRACTED 1.00]
- **UI Styling & Design System** — claude_skills_ui_styling_references_canvas_design_system, claude_skills_ui_styling_references_shadcn_components, claude_skills_ui_styling_references_shadcn_theming, claude_skills_ui_styling_references_tailwind_utilities [EXTRACTED]
- **UI/UX Intelligence Framework** — claude_skills_ui_ux_pro_max_skill, claude_skills_ui_ux_pro_max_references_pro_rules, claude_skills_ui_ux_pro_max_references_quick_reference [EXTRACTED]
- **Design System & Styling Integration** — claude_skills_design_system_references_tailwind_integration_tailwind_integration, claude_skills_design_system_references_token_architecture_token_architecture, claude_skills_ui_styling_skill_ui_styling [INFERRED 0.90]

## Communities (184 total, 71 thin omitted)

### Community 0 - "Admin API Routes"
Cohesion: 0.05
Nodes (58): POST(), POST(), POST(), POST(), VALID_ACTIONS, ALLOWED_KEYS, POST(), ALLOWED_KEYS (+50 more)

### Community 1 - "Entity Detail Modals"
Cohesion: 0.05
Nodes (69): metadata, AnswerInput, POST(), POST(), metadata, PatientHealthProfilePage(), STATUS_BANNER_STYLE, metadata (+61 more)

### Community 2 - "Booking Calendar Components"
Cohesion: 0.07
Nodes (55): AdminRosterTab(), STATE_STYLES, STATE_TITLES, Therapist, todayKey(), BookingCalendar(), BookingStepOne(), REVEAL (+47 more)

### Community 3 - "Client-Side Action Handlers"
Cohesion: 0.10
Nodes (37): POST(), POST(), POST(), POST(), POST(), POST(), POST(), GET() (+29 more)

### Community 4 - "Admin Patient Management"
Cohesion: 0.07
Nodes (40): metadata, metadata, HospitalDashboardPage(), metadata, STATUS_STYLES, PatientDetailContent(), PatientNotesForm(), formatInr() (+32 more)

### Community 5 - "Color Palette Tokens"
Cohesion: 0.05
Nodes (53): $type, $value, $type, $value, $type, $value, $type, $value (+45 more)

### Community 6 - "Admin Dashboard Overview"
Cohesion: 0.06
Nodes (34): AdminDashboardPage(), metadata, nowTimestamp(), AdminPayoutsTab(), Category, formatInr(), Patient, Therapist (+26 more)

### Community 7 - "Project Dependencies"
Cohesion: 0.04
Nodes (46): eslint, eslint-config-next, @fortawesome/fontawesome-free, googleapis, libphonenumber-js, motion, next, dependencies (+38 more)

### Community 8 - "Admin Content Management"
Cohesion: 0.08
Nodes (29): AdminPeopleDirectory(), Person, CompletePayoutRequestButton(), Faq, FaqForm(), DeleteButton(), Faq, FaqManager() (+21 more)

### Community 9 - "Card Component Tokens"
Cohesion: 0.20
Nodes (12): $type, $value, bg, bg, padding, shadow, card, bg (+4 more)

### Community 10 - "Appointment and Referral Logic"
Cohesion: 0.11
Nodes (31): POST(), POST(), POST(), POST(), POST(), isoWeekKey(), POST(), SlotResult (+23 more)

### Community 11 - "Slide Search Utilities"
Cohesion: 0.08
Nodes (36): format_context(), format_result(), main(), Format a single search result for display, Format contextual recommendations for display., BM25, calculate_pattern_break(), detect_domain() (+28 more)

### Community 12 - "Core Search Engine"
Cohesion: 0.08
Nodes (37): detect_domain(), get_cip_brief(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search across all domains and combine results (+29 more)

### Community 13 - "Patient Dashboard Features"
Cohesion: 0.08
Nodes (27): metadata, nowTimestamp(), PatientDashboardPage(), STATUS_STYLES, PatientProfilePage(), BOOKING_FROM_DASHBOARD, BookingBackToSessions(), CancelSessionButton() (+19 more)

### Community 14 - "Admin Session Scheduling"
Cohesion: 0.11
Nodes (27): AdminCalendarTab(), Category, Person, STATUS_STYLES, todayKey(), AdminSessionStoryTab(), Category, Person (+19 more)

### Community 15 - "Spacing Design Tokens"
Cohesion: 0.06
Nodes (34): $type, $value, $type, $value, $type, $value, $type, $value (+26 more)

### Community 16 - "Tailwind Generator Tests"
Cohesion: 0.06
Nodes (16): Test adding colors multiple times., Test adding full color palette., Test adding custom breakpoints., Test TailwindConfigGenerator class., Test that adding same plugin twice doesn't duplicate., Test plugin recommendations for Next.js., Test initialization with default settings., Test generating JavaScript configuration. (+8 more)

### Community 17 - "Global Layout Components"
Cohesion: 0.11
Nodes (23): inter, jakarta, metadata, DebugNav(), routes, toLocalInputValue(), FarewellBanner(), Footer() (+15 more)

### Community 18 - "Admin Analytics Dashboard"
Cohesion: 0.14
Nodes (28): AdminMetricsTab(), Category, daysAgo(), formatInr(), formatShortDate(), nowTimestamp(), toDateInputValue(), TrendBarChart() (+20 more)

### Community 19 - "TypeScript Configuration"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 20 - "HTML Token Validator"
Cohesion: 0.13
Nodes (24): get_context(), is_allowed_exception(), is_allowed_rgba(), is_inside_block(), load_css_variables(), main(), print_result(), print_summary() (+16 more)

### Community 21 - "Landing Page Sections"
Cohesion: 0.11
Nodes (19): PROGRAM_ART, revalidate, TRUST_POINTS, Area, AREAS, CareAreas(), EASE, EASE (+11 more)

### Community 22 - "User Authentication Pages"
Cohesion: 0.17
Nodes (13): metadata, metadata, ROLE_LOGIN_HREF, metadata, ConfirmPasswordField(), EmailField(), InviteRegisterCard(), Preview (+5 more)

### Community 23 - "Package Detail Views"
Cohesion: 0.14
Nodes (19): AppointmentRow, DetailResponse, EventRow, PackagePurchaseDetailModal(), AppointmentRow, DetailResponse, EASE, EventRow (+11 more)

### Community 24 - "Logo Search Core"
Cohesion: 0.11
Nodes (19): BM25, detect_domain(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search across all domains and combine results (+11 more)

### Community 25 - "Semantic Color Tokens"
Cohesion: 0.11
Nodes (19): $type, $value, background, foreground, muted-foreground, primary, primary-hover, secondary (+11 more)

### Community 26 - "Domain Search Logic"
Cohesion: 0.12
Nodes (18): _domain_keywords(), _get_bm25(), _load_csv(), _load_product_keywords(), Load CSV and return list of dicts, with mtime-based caching., Fitted BM25 index for this file+columns, with mtime-based caching., Core search function using BM25. Returns (results, bm25_or_none)., Nearest known vocabulary terms for a query that returned 0 hits, so the caller… (+10 more)

### Community 27 - "Admin Payment History"
Cohesion: 0.14
Nodes (23): AdminPaymentHistoryTab(), AdminReceiptRow, Category, formatDateTime(), formatInr(), Patient, PatientTransactionTable(), RECEIPT_STAGE_LABEL (+15 more)

### Community 28 - "Admin Login and Tabs"
Cohesion: 0.14
Nodes (13): metadata, metadata, ResetPasswordPage(), ADMIN_REALTIME_TABLES, AdminTabs(), TabDef, TabKey, AdminLoginCard() (+5 more)

### Community 29 - "Tailwind Config Generator"
Cohesion: 0.10
Nodes (12): main(), Add custom font families. Args: fonts: Dict of font_type: [font_names] e.g.,…, Add custom spacing values. Args: spacing: Dict of name: value e.g., {'18':…, Add custom breakpoints. Args: breakpoints: Dict of name: width e.g., {'3xl':…, Add plugin requirements. Args: plugins: List of plugin names e.g.,…, Get plugin recommendations based on configuration. Returns: List of recommended…, Generate Tailwind CSS configuration files., Validate configuration. Returns: Tuple of (valid, message) (+4 more)

### Community 30 - "Public Service Pages"
Cohesion: 0.13
Nodes (16): Category, metadata, revalidate, metadata, PROBLEM, SOLUTION, PublicPackage, SessionPackages() (+8 more)

### Community 31 - "Therapist Dashboard Actions"
Cohesion: 0.14
Nodes (14): metadata, nowTimestamp(), STATUS_BADGE_STYLES, TherapistDashboardPage(), DeclineAccountButton(), MarkPaidByCashButton(), TherapistNotAvailableToggle(), CompleteSessionButton() (+6 more)

### Community 32 - "Design System Formatting"
Cohesion: 0.12
Nodes (20): ansi_ljust(), _detect_page_type(), format_ascii_box(), format_markdown(), format_master_md(), format_page_override_md(), _generate_intelligent_overrides(), hex_to_ansi() (+12 more)

### Community 33 - "User Profile Management"
Cohesion: 0.18
Nodes (13): metadata, metadata, TherapistProfilePage(), AvatarUpload(), FieldConfig, FieldStatusMap, GatedProfileFields(), FieldConfig (+5 more)

### Community 34 - "Booking and Payment Flow"
Cohesion: 0.18
Nodes (15): BookingWizard(), Category, formatInr(), PackageData, BuyPackageButton(), PayNowButton(), checkReferralCode(), ReferralCodeCheck (+7 more)

### Community 35 - "Slide Generation Logic"
Cohesion: 0.15
Nodes (19): _e(), generate_chart_slide(), generate_cta_slide(), generate_deck(), generate_metrics_slide(), generate_problem_slide(), generate_solution_slide(), generate_testimonial_slide() (+11 more)

### Community 36 - "Design System Engine"
Cohesion: 0.15
Nodes (11): DesignSystemGenerator, generate_design_system(), persist_design_system(), Generates design system recommendations from aggregated searches., Load reasoning rules from CSV., Find matching reasoning rule for a category., Apply reasoning rules to search results., Main entry point for design system generation. Args: query: Search query (e.g.,… (+3 more)

### Community 37 - "Patient Receipt Components"
Cohesion: 0.13
Nodes (18): formatDateHeading(), formatDateTime(), formatInr(), ReceiptsSection(), STAGE_LABEL, STAGE_PILL_STYLE, BookingReceipt, BookingReceiptStage (+10 more)

### Community 38 - "Border Radius Tokens"
Cohesion: 0.29
Nodes (8): $type, $value, $type, $value, radius, default, full, default

### Community 39 - "Theme Mode Resolution"
Cohesion: 0.16
Nodes (10): _filter_anti_patterns_for_mode(), _query_wants_dark(), True when a styles.csv row describes itself as dark-first., True when the query explicitly asks for a dark theme., Resolve the mode the rest of the output has to agree with., Drop "avoid dark mode" advice once dark mode is the resolved answer., _resolve_color_mode(), _style_is_dark_primary() (+2 more)

### Community 40 - "Contact Information Forms"
Cohesion: 0.18
Nodes (14): PatientContactEditForm(), TherapistContactEditForm(), HospitalInquiryForm(), SOURCES, PhoneNumberField(), composePhone(), COUNTRY_OPTIONS, CountryOption (+6 more)

### Community 41 - "Background Image Utilities"
Cohesion: 0.17
Nodes (17): generate_css_for_background(), get_background_image(), get_curated_images(), get_overlay_css(), get_pexels_search_url(), load_backgrounds_config(), load_brand_colors(), main() (+9 more)

### Community 42 - "How It Works Page"
Cohesion: 0.14
Nodes (13): metadata, OBJECTIONS, BookingScene(), EASE, EXERCISES, FINDINGS, FindingsScene(), PlanScene() (+5 more)

### Community 43 - "BM25 Search Algorithm"
Cohesion: 0.15
Nodes (9): BM25, _normalize(), Apply synonym substitution before tokenizing., BM25 ranking algorithm for text search, Lowercase, normalize synonyms, split, remove punctuation, filter stopwords, Build BM25 index from documents, Score all documents against query, All indexed terms, for suggestion/typo-recovery purposes. (+1 more)

### Community 44 - "Icon Generation Scripts"
Cohesion: 0.20
Nodes (15): apply_color(), apply_viewbox_size(), extract_svgs(), generate_batch(), generate_icon(), generate_sizes(), load_env(), main() (+7 more)

### Community 45 - "Font Size Tokens"
Cohesion: 0.12
Nodes (16): $type, $value, $type, $value, $type, $value, $type, $value (+8 more)

### Community 46 - "Shadcn Installer Tests"
Cohesion: 0.14
Nodes (8): Test adding components that are already installed., Test adding components in dry run mode., Test ShadcnInstaller class., Test listing installed components without config., Test listing installed components when none exist., Test checking for existing shadcn config., Test getting installed components without config., TestShadcnInstaller

### Community 47 - "Color Contrast Testing"
Cohesion: 0.18
Nodes (7): _palette_is_dark(), WCAG relative luminance of a #RRGGBB string, or None if unparseable., True when a colors.csv row's Background is a dark surface., _relative_luminance(), The exact reproduction from issue #428., TestEndToEndCoherence, TestLuminance

### Community 48 - "Therapist Navigation Shell"
Cohesion: 0.21
Nodes (10): GRANT_LABEL, GRANT_STYLE, metadata, DashboardShell(), ShellNavItem, SessionTimeoutDialog(), LOGIN_HREF_BY_BASE_PATH, THERAPIST_NAV_ITEMS (+2 more)

### Community 49 - "Color Extraction Utilities"
Cohesion: 0.22
Nodes (11): calculateCompliance(), colorDistance(), displayPalette(), extractHexColors(), findNearestBrandColor(), fs, generateImageMagickCommand(), hexToRgb() (+3 more)

### Community 50 - "Asset Validation Scripts"
Cohesion: 0.25
Nodes (13): checkManifest(), formatBytes(), formatOutput(), fs, main(), parseFilename(), path, RULES (+5 more)

### Community 51 - "FAQ and Onboarding"
Cohesion: 0.16
Nodes (10): Faq, metadata, revalidate, ACCENTS, metadata, PATHS, Faq, FaqAccordion() (+2 more)

### Community 52 - "Therapist Earnings Management"
Cohesion: 0.24
Nodes (11): RequestPayoutButton(), EarningsDay, formatInr(), TherapistEarningsChart(), CompletedRequest, dayLabel(), formatDate(), formatInr() (+3 more)

### Community 53 - "Profile and Password Reset"
Cohesion: 0.15
Nodes (8): POST(), generatePassword(), POST(), generatePassword(), POST(), IMPLEMENTED_METHODS, POST(), GATED_PROFILE_FIELDS

### Community 54 - "Token Validation Script"
Cohesion: 0.24
Nodes (11): extensions, formatReport(), fs, getFiles(), main(), parseArgs(), path, patterns (+3 more)

### Community 55 - "Design Token Starter"
Cohesion: 0.15
Nodes (12): component, $type, $value, dark, semantic, $schema, $type, $value (+4 more)

### Community 56 - "Shadcn Component CLI"
Cohesion: 0.20
Nodes (7): main(), Handle shadcn/ui component installation., ShadcnInstaller, Tests for shadcn_add.py, Test adding all components without config., Test initialization with custom project root., Test getting installed components when files exist.

### Community 57 - "Shadcn Installation Logic"
Cohesion: 0.21
Nodes (6): Add all available shadcn/ui components. Args: overwrite: If True, overwrite…, List installed components. Returns: Tuple of (success, message with component…, Check if shadcn is initialized in project. Returns: True if components.json…, Get list of already installed components. Returns: List of installed component…, Read shadcn version from project package.json; fall back to a pinned default., Add shadcn/ui components. Args: components: List of component names to add…

### Community 58 - "Config File Serialization"
Cohesion: 0.20
Nodes (6): Generate configuration file content. Returns: Configuration file as string, Generate TypeScript configuration., Generate JavaScript configuration., Format plugins array for config. Validates each plugin name against a strict…, Add indentation to JSON string., Write configuration to file. Returns: Tuple of (success, message)

### Community 59 - "Brand Context Injection"
Cohesion: 0.31
Nodes (10): extractColorsFromTable(), extractCoreAttributes(), extractHexColors(), extractImageStyle(), extractTypography(), extractVoice(), fs, generatePromptAddition() (+2 more)

### Community 60 - "Token Embedding Utilities"
Cohesion: 0.18
Nodes (8): args, fs, minimal, MINIMAL_TOKENS, path, projectRoot, tokensPath, wrapStyle

### Community 61 - "Shadcn Installer Integration Tests"
Cohesion: 0.18
Nodes (6): Test adding components with overwrite flag., Test successful component addition., Test component addition with subprocess error., Test component addition when npx is not found., Test successful addition of all components., patch

### Community 62 - "Tailwind Config Regression Tests"
Cohesion: 0.22
Nodes (8): Tests for tailwind_config_gen.py, Reduce a generated TS/JS config to a bare assignable object so it can be handed…, Regression guard for the missing-comma bug between the ``theme`` block and…, The property preceding ``plugins`` must end with a comma (pure-Python check, so…, The emitted config parses as valid JS via ``node --check``., _strip_to_object(), TestGeneratedConfigIsValidJs, parametrize

### Community 63 - "Package Management API"
Cohesion: 0.31
Nodes (8): POST(), POST(), PackageColumns, PackagePayload, parseOptionalPositiveInt(), THERAPIST_RATE_BASIS_VALUES, TherapistRateBasis, validatePackagePayload()

### Community 64 - "Public Booking Pages"
Cohesion: 0.24
Nodes (9): BookPage(), metadata, revalidate, ConditionsPage(), FaqPage(), RootLayout(), Home(), parseBookingLanguages() (+1 more)

### Community 65 - "Hospital Account Settings"
Cohesion: 0.25
Nodes (7): HospitalProfilePage(), metadata, AdminFeatureControlTab(), GoogleMeetSyncIssue, saveSetting(), BookingLanguagesSection(), AccountSecuritySection()

### Community 66 - "Team Directory Page"
Cohesion: 0.24
Nodes (8): metadata, revalidate, TeamPage(), StaggerItem(), EASE, languageList(), TeamTherapist, TeamTherapistPopup()

### Community 67 - "CSV Export Utilities"
Cohesion: 0.31
Nodes (7): DownloadCsvButton(), PackagePurchasesTable(), STATUS_OPTIONS, CsvColumn, downloadCsv(), escapeCell(), toCsv()

### Community 68 - "Generator Initialization"
Cohesion: 0.22
Nodes (6): Any, Path, Initialize generator. Args: typescript: If True, generate .ts config, else .js…, Determine default output path., Create base configuration structure., Get default content paths for framework.

### Community 69 - "Logo Generation Scripts"
Cohesion: 0.29
Nodes (9): enhance_prompt(), generate_batch(), generate_logo(), load_env(), main(), Enhance the logo prompt with style and industry modifiers, Generate a logo using Gemini models with image generation Args: aspect_ratio:…, Generate multiple logo variants with different styles (+1 more)

### Community 70 - "Token Transformation Scripts"
Cohesion: 0.36
Nodes (9): flattenTokens(), fs, generateCSS(), generateTailwind(), main(), parseArgs(), path, resolveReference() (+1 more)

### Community 71 - "Animation Duration Tokens"
Cohesion: 0.18
Nodes (11): fast, normal, slow, $type, $value, $type, $value, primitive (+3 more)

### Community 72 - "Multi-Domain Search Orchestrator"
Cohesion: 0.20
Nodes (6): Execute searches across multiple domains., Select best matching result based on priority keywords., Extract results list from search result dict., Generate complete design system recommendation. variance/motion/density are…, Bucket a 1-10 dial value into its tier config. Returns None if value is None., _resolve_dial()

### Community 73 - "Appointment Cancellation Logic"
Cohesion: 0.33
Nodes (6): POST(), POST(), POST(), cancelAppointmentAndRefund(), CancelResult, deleteMeetEventForAppointment()

### Community 74 - "Admin Session Settings"
Cohesion: 0.27
Nodes (7): AdminSessionManagerTab(), Package, SubTab, PurchaseRow, PackageSettingsForm(), saveSetting(), AdminSettings

### Community 75 - "Package Catalog Management"
Cohesion: 0.31
Nodes (7): inputCls(), Package, PackageCatalogForm(), DeleteButton(), Package, PackageCatalogManager(), computePackageSavings()

### Community 76 - "Brand Token Sync"
Cohesion: 0.33
Nodes (8): adjustBrightness(), { execFileSync }, extractColorsFromMarkdown(), fs, generateColorScale(), main(), path, updateDesignTokens()

### Community 77 - "Text Search Indexing"
Cohesion: 0.28
Nodes (5): BM25, BM25 ranking algorithm for text search, Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query

### Community 78 - "Token Validator Tests"
Cohesion: 0.28
Nodes (8): Path, Regression tests for validate-tokens.cjs. The validator used to skip any line…, A hardcoded hex on the same line as a var() token is still a violation., A line that references only tokens produces no false positives., _run(), test_flags_hardcoded_hex_sharing_line_with_token(), test_token_only_line_reports_no_violation(), CompletedProcess

### Community 79 - "Treatment Category Management"
Cohesion: 0.25
Nodes (6): Category, NewCategoryValues, TreatmentCategoryForm(), Category, DeleteButton(), TreatmentCategoryManager()

### Community 80 - "Design System Architecture"
Cohesion: 0.36
Nodes (8): CSS Variables Setup, Tailwind Config, Tailwind Integration, Component Tokens, Primitive Tokens, Semantic Tokens, Token Architecture, UI Styling

### Community 81 - "Account Status Pages"
Cohesion: 0.32
Nodes (4): metadata, metadata, PendingApprovalPage(), SUPPORT_EMAIL

### Community 82 - "Therapist Payout Modals"
Cohesion: 0.39
Nodes (6): Modal(), formatDateHeading(), formatDateTime(), formatInr(), TherapistPayoutReceiptsSection(), PayoutReceipt

### Community 83 - "Domain Detection Tests"
Cohesion: 0.43
Nodes (3): detect_domain(), Auto-detect the most relevant domain from query. Matches are weighted by…, TestDomainDetection

### Community 84 - "Palette Selection Logic"
Cohesion: 0.43
Nodes (3): Pick the highest-ranked palette matching the resolved mode. Only the dark case…, _select_palette_for_mode(), TestPaletteSelection

### Community 85 - "Admin Payout Processing"
Cohesion: 0.43
Nodes (5): AdminPayoutRequestsTab(), formatDateTime(), formatInr(), PayoutRequestRow, StartReviewPayoutRequestButton()

### Community 86 - "Large Size Tokens"
Cohesion: 0.60
Nodes (5): lg, $type, $value, lg, lg

### Community 87 - "GSAP Animation Library"
Cohesion: 0.40
Nodes (5): GSAP Core, GSAP Frameworks, GSAP React, GSAP ScrollTrigger, GSAP Timeline

### Community 88 - "Google Auth Utilities"
Cohesion: 0.40
Nodes (3): authUrl, oauth2Client, server

### Community 89 - "Brand Contact Forms"
Cohesion: 0.50
Nodes (4): BrandContactDetails, BrandContactDetailsForm(), EditableField(), saveSetting()

### Community 91 - "Supabase Proxy Config"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 92 - "Extra Large Tokens"
Cohesion: 0.67
Nodes (4): xl, xl, $type, $value

### Community 93 - "Medium Size Tokens"
Cohesion: 0.67
Nodes (4): $type, $value, md, md

### Community 94 - "UI Documentation References"
Cohesion: 0.50
Nodes (4): shadcn/ui Accessibility Patterns, shadcn/ui Component Reference, shadcn/ui Theming & Customization, Tailwind CSS Customization

### Community 95 - "Data Validation Script"
Cohesion: 0.83
Nodes (3): _check_file(), main(), _read_rows()

### Community 96 - "Hospital Onboarding API"
Cohesion: 0.83
Nodes (3): generatePassword(), generateReferralCode(), POST()

### Community 100 - "Destructive Foreground Token"
Cohesion: 0.67
Nodes (3): destructive-foreground, $type, $value

### Community 101 - "Button Component Tokens"
Cohesion: 0.20
Nodes (10): fg, font-size, hover-bg, button, $type, $value, $type, $value (+2 more)

### Community 102 - "Primary Foreground Token"
Cohesion: 0.67
Nodes (3): primary-foreground, $type, $value

### Community 103 - "Input Component Tokens"
Cohesion: 0.29
Nodes (8): padding-x, input, $type, $value, focus-ring, padding-x, $type, $value

### Community 106 - "UI/UX Design Guidelines"
Cohesion: 0.67
Nodes (3): Professional UI Rules & Checklist, UX Quick Reference, UI/UX Pro Max Skill

### Community 175 - "Shadow Design Tokens"
Cohesion: 0.47
Nodes (6): sm, shadow, sm, sm, $type, $value

### Community 176 - "Border Design Tokens"
Cohesion: 0.60
Nodes (5): $type, $value, border, border, border

### Community 177 - "Radius Design Tokens"
Cohesion: 0.60
Nodes (5): radius, radius, radius, $type, $value

### Community 178 - "Spacing Design Tokens"
Cohesion: 0.67
Nodes (4): padding-y, padding-y, $type, $value

### Community 179 - "Generic Design Tokens"
Cohesion: 0.67
Nodes (4): $type, $value, none, none

### Community 180 - "Destructive Color Token"
Cohesion: 0.67
Nodes (3): destructive, $type, $value

### Community 181 - "Muted Color Token"
Cohesion: 0.67
Nodes (3): muted, $type, $value

### Community 182 - "Ring Style Token"
Cohesion: 0.67
Nodes (3): ring, $type, $value

### Community 183 - "Secondary Foreground Token"
Cohesion: 0.67
Nodes (3): secondary-foreground, $type, $value

## Knowledge Gaps
- **479 isolated node(s):** `AnswerInput`, `LatestAssessment`, `Selection`, `AssessmentRow`, `Selection` (+474 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **71 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createAdminClient()` connect `Client-Side Action Handlers` to `Admin API Routes`, `Hospital Onboarding API`, `Entity Detail Modals`, `Admin Patient Management`, `Admin Dashboard Overview`, `Appointment Cancellation Logic`, `Appointment and Referral Logic`, `Therapist Password Reset`, `Patient Dashboard Features`, `Therapist Navigation Shell`, `Profile and Password Reset`, `Therapist Dashboard Actions`, `Package Management API`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Client-Side Action Handlers` to `Admin API Routes`, `Entity Detail Modals`, `Hospital Account Settings`, `User Profile Management`, `Admin Patient Management`, `Admin Dashboard Overview`, `Appointment Cancellation Logic`, `Appointment and Referral Logic`, `Patient Dashboard Features`, `Therapist Navigation Shell`, `Account Status Pages`, `Therapist Dashboard Actions`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Admin Login and Tabs` to `Hospital Account Settings`, `Booking and Payment Flow`, `User Profile Management`, `Contact Information Forms`, `Therapist Navigation Shell`, `Global Layout Components`, `User Authentication Pages`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `TailwindConfigGenerator` (e.g. with `TestGeneratedConfigIsValidJs` and `TestTailwindConfigGenerator`) actually correct?**
  _`TailwindConfigGenerator` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AnswerInput`, `LatestAssessment`, `Selection` to the rest of the system?**
  _479 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin API Routes` be split into smaller, more focused modules?**
  _Cohesion score 0.047248182762201454 - nodes in this community are weakly interconnected._
- **Should `Entity Detail Modals` be split into smaller, more focused modules?**
  _Cohesion score 0.05006662859318484 - nodes in this community are weakly interconnected._