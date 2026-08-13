# Graph Report - .  (2026-08-13)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2183 nodes · 4621 edges · 191 communities (115 shown, 76 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.57)
- Token cost: 7,386 input · 2,172 output

## Graph Freshness
- Built from commit: `04b2bf06`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Patient Health Profile
- Therapist Booking Calendar
- Admin Content Management
- Color Palette Tokens
- Admin Metrics Dashboard
- Project Dependencies
- Admin Detail Views
- Slide Search Core
- Domain Search Logic
- Admin Payout Processing
- Admin Session Management
- FAQ and Directory
- Admin API Routes
- Spacing Tokens
- Appointment Assignment Actions
- Session and Package Actions
- Public Landing Pages
- Tailwind Generator Tests
- User Authentication Pages
- Feedback and Orders
- TypeScript Configuration
- HTML Token Validator
- Patient Dashboard
- Homepage Care Areas
- Package Catalog Manager
- Logo Search Core
- Keyword Search Caching
- Admin Login Portal
- Payment History Tab
- Layout and Navigation
- Contact Profile Forms
- Tailwind Config Generator
- Design System Formatting
- Slide Generation Logic
- Design System Reasoning
- Static Site Pages
- User Profile Management
- Therapist Payout Receipts
- Theme Color Tokens
- Dark Mode Logic
- Dashboard Shell Components
- Background Image Generator
- BM25 Search Algorithm
- Icon Generation Utility
- Font Size Tokens
- Shadcn Installer Tests
- Color Luminance Tests
- Color Extraction Utility
- Asset Validation Script
- Therapist Dashboard
- Booking Scene UI
- Therapist Earnings Tab
- Site Admin Settings
- Design Token Starter
- Token Validation Script
- Card Style Tokens
- Shadcn Installation Tool
- Shadcn Component Management
- Config File Writer
- Brand Context Injector
- Token Embedding Utility
- Animation Duration Tokens
- Component Installation Tests
- Tailwind Config Tests
- Package Creation Routes
- Team Therapist Directory
- CSV Export Utility
- Generator Initialization
- Logo Generation Tool
- Token Export Utility
- Button Style Tokens
- Multi-Domain Search Logic
- Admin Payouts Tab
- Booking and Availability
- Patient Profit Chart
- Brand Token Sync
- Text Ranking Algorithm
- Token Validator Tests
- Treatment Category Manager
- Google Calendar Integration
- Token Architecture Documentation
- Input Field Tokens
- UI Primitive Tokens
- Account Status Pages
- Detail Overlay Modals
- Patient Receipt Modals
- Domain Detection Tests
- Palette Selection Logic
- Size 16 Token
- Size 2 Token
- Small Size Tokens
- Settings Update Routes
- Feature Control Tab
- Border Style Tokens
- Radius Tokens
- Large Size Tokens
- GSAP Animation Library
- Google OAuth Utility
- Size 6 Token
- Spine Story Component
- Supabase Proxy Config
- Vertical Padding Tokens
- Default Value Tokens
- Extra Large Token
- Size 8 Token
- Shadcn UI Documentation
- Data Validation Scripts
- Database Schema Migration
- Profile Change API
- Brand Token Tests
- Slide Token Validator
- Destructive State Token
- Destructive Foreground Token
- Muted State Token
- Primary Foreground Token
- Ring Utility Token
- Secondary Foreground Token
- Installer Initialization
- Test Project Fixtures
- UI/UX Design Guidelines
- Hospital Password Reset
- Patient Password Reset
- Therapist Payout Processing
- Design System Reference
- Component Installation Tests
- Installed Component Listing
- Project Root Initialization
- Dry Run Mode
- Config Existence Checks
- Empty Component Tests
- Empty Component Addition
- Custom Font Tests
- Plugin Recommendation Tests
- TypeScript Config Generation
- Custom Color Configuration
- Plugin Configuration Tests
- Content Path Validation
- Theme Extension Validation
- Config File Writing
- JavaScript Initialization Tests
- Config Content Verification
- Invalid Path Handling
- Full JS Configuration
- TS Output Paths
- Base Config Structure
- Vue Content Paths
- Color Customization Tests
- ESLint Configuration
- Git Post-Merge Hooks
- Next.js Configuration
- PostCSS Configuration
- Data Extraction Specification
- Query Language Reference
- Graphify Utility
- GSAP Performance Optimization
- GSAP Plugin Integration
- GSAP Utility Functions
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
- Docs Maintenance Workflow
- Graphify Refresh Workflow
- Medical Imaging Assets
- Open Font License

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

## Communities (191 total, 76 thin omitted)

### Community 0 - "Patient Health Profile"
Cohesion: 0.06
Nodes (68): metadata, AnswerInput, POST(), POST(), metadata, PatientHealthProfilePage(), STATUS_BANNER_STYLE, metadata (+60 more)

### Community 1 - "Therapist Booking Calendar"
Cohesion: 0.05
Nodes (74): AdminRosterTab(), STATE_STYLES, STATE_TITLES, Therapist, todayKey(), BookingCalendar(), BookingStepOne(), REVEAL (+66 more)

### Community 2 - "Admin Content Management"
Cohesion: 0.04
Nodes (47): POST(), POST(), POST(), POST(), POST(), POST(), POST(), POST() (+39 more)

### Community 3 - "Color Palette Tokens"
Cohesion: 0.05
Nodes (53): $type, $value, $type, $value, $type, $value, $type, $value (+45 more)

### Community 4 - "Admin Metrics Dashboard"
Cohesion: 0.14
Nodes (28): AdminMetricsTab(), Category, daysAgo(), formatInr(), formatShortDate(), nowTimestamp(), toDateInputValue(), TrendBarChart() (+20 more)

### Community 5 - "Project Dependencies"
Cohesion: 0.04
Nodes (46): eslint, eslint-config-next, @fortawesome/fontawesome-free, googleapis, libphonenumber-js, motion, next, dependencies (+38 more)

### Community 6 - "Admin Detail Views"
Cohesion: 0.09
Nodes (29): AdminDashboardPage(), metadata, metadata, HospitalDashboardPage(), metadata, STATUS_STYLES, PatientDetailContent(), PatientNotesForm() (+21 more)

### Community 7 - "Slide Search Core"
Cohesion: 0.08
Nodes (36): format_context(), format_result(), main(), Format a single search result for display, Format contextual recommendations for display., BM25, calculate_pattern_break(), detect_domain() (+28 more)

### Community 8 - "Domain Search Logic"
Cohesion: 0.08
Nodes (37): detect_domain(), get_cip_brief(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search across all domains and combine results (+29 more)

### Community 9 - "Admin Payout Processing"
Cohesion: 0.07
Nodes (30): metadata, nowTimestamp(), AdminPayoutRequestsTab(), formatDateTime(), formatInr(), PayoutRequestRow, ApproveAccountButton(), AssignReferralForm() (+22 more)

### Community 10 - "Admin Session Management"
Cohesion: 0.12
Nodes (25): POST(), AdminCalendarTab(), Category, Person, STATUS_STYLES, todayKey(), AdminSessionStoryTab(), Category (+17 more)

### Community 11 - "FAQ and Directory"
Cohesion: 0.10
Nodes (23): AdminPeopleDirectory(), Person, CompletePayoutRequestButton(), Faq, FaqForm(), DeleteButton(), Faq, FaqManager() (+15 more)

### Community 12 - "Admin API Routes"
Cohesion: 0.13
Nodes (22): POST(), POST(), GET(), POST(), GET(), GET(), ALLOWED_KEYS, POST() (+14 more)

### Community 13 - "Spacing Tokens"
Cohesion: 0.09
Nodes (22): $type, $value, $type, $value, $type, $value, $type, $value (+14 more)

### Community 14 - "Appointment Assignment Actions"
Cohesion: 0.12
Nodes (22): POST(), POST(), POST(), POST(), POST(), POST(), POST(), isoWeekKey() (+14 more)

### Community 15 - "Session and Package Actions"
Cohesion: 0.13
Nodes (13): POST(), POST(), VALID_ACTIONS, ALLOWED_KEYS, POST(), ALLOWED_KEYS, POST(), POST() (+5 more)

### Community 16 - "Public Landing Pages"
Cohesion: 0.09
Nodes (22): Category, metadata, revalidate, ACCENTS, metadata, PATHS, metadata, PROBLEM (+14 more)

### Community 17 - "Tailwind Generator Tests"
Cohesion: 0.06
Nodes (16): Test adding colors multiple times., Test adding full color palette., Test adding custom breakpoints., Test TailwindConfigGenerator class., Test that adding same plugin twice doesn't duplicate., Test plugin recommendations for Next.js., Test initialization with default settings., Test generating JavaScript configuration. (+8 more)

### Community 18 - "User Authentication Pages"
Cohesion: 0.14
Nodes (16): metadata, metadata, ResetPasswordPage(), ROLE_LOGIN_HREF, metadata, ConfirmPasswordField(), EmailField(), InviteRegisterCard() (+8 more)

### Community 19 - "Feedback and Orders"
Cohesion: 0.15
Nodes (17): POST(), POST(), POST(), POST(), ALLOWED_KEYS, POST(), POST(), POST() (+9 more)

### Community 20 - "TypeScript Configuration"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 21 - "HTML Token Validator"
Cohesion: 0.13
Nodes (24): get_context(), is_allowed_exception(), is_allowed_rgba(), is_inside_block(), load_css_variables(), main(), print_result(), print_summary() (+16 more)

### Community 22 - "Patient Dashboard"
Cohesion: 0.09
Nodes (23): metadata, nowTimestamp(), PatientDashboardPage(), STATUS_STYLES, BOOKING_FROM_DASHBOARD, CancelSessionButton(), PatientMonthMotivation(), BUCKET_DOT_COLOR (+15 more)

### Community 23 - "Homepage Care Areas"
Cohesion: 0.11
Nodes (19): PROGRAM_ART, revalidate, TRUST_POINTS, Area, AREAS, CareAreas(), EASE, EASE (+11 more)

### Community 24 - "Package Catalog Manager"
Cohesion: 0.07
Nodes (35): AdminSessionManagerTab(), Package, SubTab, inputCls(), Package, PackageCatalogForm(), DeleteButton(), Package (+27 more)

### Community 25 - "Logo Search Core"
Cohesion: 0.11
Nodes (19): BM25, detect_domain(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search across all domains and combine results (+11 more)

### Community 26 - "Keyword Search Caching"
Cohesion: 0.12
Nodes (18): _domain_keywords(), _get_bm25(), _load_csv(), _load_product_keywords(), Load CSV and return list of dicts, with mtime-based caching., Fitted BM25 index for this file+columns, with mtime-based caching., Core search function using BM25. Returns (results, bm25_or_none)., Nearest known vocabulary terms for a query that returned 0 hits, so the caller… (+10 more)

### Community 27 - "Admin Login Portal"
Cohesion: 0.14
Nodes (13): metadata, metadata, ADMIN_REALTIME_TABLES, AdminTabs(), TabDef, TabKey, AdminLoginCard(), HospitalLoginCard() (+5 more)

### Community 28 - "Payment History Tab"
Cohesion: 0.14
Nodes (23): AdminPaymentHistoryTab(), AdminReceiptRow, Category, formatDateTime(), formatInr(), Patient, PatientTransactionTable(), RECEIPT_STAGE_LABEL (+15 more)

### Community 29 - "Layout and Navigation"
Cohesion: 0.14
Nodes (17): inter, jakarta, metadata, FarewellBanner(), Footer(), links, Navbar(), ROLE_DASHBOARD_HREF (+9 more)

### Community 30 - "Contact Profile Forms"
Cohesion: 0.16
Nodes (17): PatientContactEditForm(), TherapistContactEditForm(), HospitalInquiryForm(), SOURCES, PhoneNumberField(), FieldConfig, InstantProfileFields(), composePhone() (+9 more)

### Community 31 - "Tailwind Config Generator"
Cohesion: 0.10
Nodes (12): main(), Add custom font families. Args: fonts: Dict of font_type: [font_names] e.g.,…, Add custom spacing values. Args: spacing: Dict of name: value e.g., {'18':…, Add custom breakpoints. Args: breakpoints: Dict of name: width e.g., {'3xl':…, Add plugin requirements. Args: plugins: List of plugin names e.g.,…, Get plugin recommendations based on configuration. Returns: List of recommended…, Generate Tailwind CSS configuration files., Validate configuration. Returns: Tuple of (valid, message) (+4 more)

### Community 32 - "Design System Formatting"
Cohesion: 0.12
Nodes (20): ansi_ljust(), _detect_page_type(), format_ascii_box(), format_markdown(), format_master_md(), format_page_override_md(), _generate_intelligent_overrides(), hex_to_ansi() (+12 more)

### Community 33 - "Slide Generation Logic"
Cohesion: 0.15
Nodes (19): _e(), generate_chart_slide(), generate_cta_slide(), generate_deck(), generate_metrics_slide(), generate_problem_slide(), generate_solution_slide(), generate_testimonial_slide() (+11 more)

### Community 34 - "Design System Reasoning"
Cohesion: 0.15
Nodes (11): DesignSystemGenerator, generate_design_system(), persist_design_system(), Generates design system recommendations from aggregated searches., Load reasoning rules from CSV., Find matching reasoning rule for a category., Apply reasoning rules to search results., Main entry point for design system generation. Args: query: Search query (e.g.,… (+3 more)

### Community 35 - "Static Site Pages"
Cohesion: 0.13
Nodes (16): BookPage(), metadata, revalidate, ConditionsPage(), Faq, FaqPage(), metadata, revalidate (+8 more)

### Community 36 - "User Profile Management"
Cohesion: 0.18
Nodes (13): metadata, PatientProfilePage(), metadata, TherapistProfilePage(), AvatarUpload(), FieldConfig, FieldStatusMap, GatedProfileFields() (+5 more)

### Community 37 - "Therapist Payout Receipts"
Cohesion: 0.15
Nodes (15): formatDateHeading(), formatDateTime(), formatInr(), TherapistPayoutReceiptsSection(), BookingReceipt, buildPatientReceipts(), deriveBookingStage(), PatientReceiptAppointment (+7 more)

### Community 38 - "Theme Color Tokens"
Cohesion: 0.11
Nodes (19): $type, $value, background, foreground, muted-foreground, primary, primary-hover, secondary (+11 more)

### Community 39 - "Dark Mode Logic"
Cohesion: 0.16
Nodes (10): _filter_anti_patterns_for_mode(), _query_wants_dark(), True when a styles.csv row describes itself as dark-first., True when the query explicitly asks for a dark theme., Resolve the mode the rest of the output has to agree with., Drop "avoid dark mode" advice once dark mode is the resolved answer., _resolve_color_mode(), _style_is_dark_primary() (+2 more)

### Community 40 - "Dashboard Shell Components"
Cohesion: 0.17
Nodes (13): HospitalProfilePage(), metadata, GRANT_LABEL, GRANT_STYLE, metadata, DashboardShell(), ShellNavItem, SessionTimeoutDialog() (+5 more)

### Community 41 - "Background Image Generator"
Cohesion: 0.17
Nodes (17): generate_css_for_background(), get_background_image(), get_curated_images(), get_overlay_css(), get_pexels_search_url(), load_backgrounds_config(), load_brand_colors(), main() (+9 more)

### Community 42 - "BM25 Search Algorithm"
Cohesion: 0.15
Nodes (9): BM25, _normalize(), Apply synonym substitution before tokenizing., BM25 ranking algorithm for text search, Lowercase, normalize synonyms, split, remove punctuation, filter stopwords, Build BM25 index from documents, Score all documents against query, All indexed terms, for suggestion/typo-recovery purposes. (+1 more)

### Community 43 - "Icon Generation Utility"
Cohesion: 0.20
Nodes (15): apply_color(), apply_viewbox_size(), extract_svgs(), generate_batch(), generate_icon(), generate_sizes(), load_env(), main() (+7 more)

### Community 44 - "Font Size Tokens"
Cohesion: 0.12
Nodes (16): $type, $value, $type, $value, $type, $value, $type, $value (+8 more)

### Community 45 - "Shadcn Installer Tests"
Cohesion: 0.14
Nodes (8): Test adding components in dry run mode., Test ShadcnInstaller class., Test adding all components without config., Test listing installed components without config., Test listing installed components when none exist., Test checking for existing shadcn config., Test getting installed components without config., TestShadcnInstaller

### Community 46 - "Color Luminance Tests"
Cohesion: 0.18
Nodes (7): _palette_is_dark(), WCAG relative luminance of a #RRGGBB string, or None if unparseable., True when a colors.csv row's Background is a dark surface., _relative_luminance(), The exact reproduction from issue #428., TestEndToEndCoherence, TestLuminance

### Community 47 - "Color Extraction Utility"
Cohesion: 0.22
Nodes (11): calculateCompliance(), colorDistance(), displayPalette(), extractHexColors(), findNearestBrandColor(), fs, generateImageMagickCommand(), hexToRgb() (+3 more)

### Community 48 - "Asset Validation Script"
Cohesion: 0.25
Nodes (13): checkManifest(), formatBytes(), formatOutput(), fs, main(), parseFilename(), path, RULES (+5 more)

### Community 49 - "Therapist Dashboard"
Cohesion: 0.23
Nodes (10): metadata, nowTimestamp(), STATUS_BADGE_STYLES, TherapistDashboardPage(), PackageChip(), SessionFeedbackForm(), buildTherapistPayoutReceipts(), computeTherapistEarningRows() (+2 more)

### Community 50 - "Booking Scene UI"
Cohesion: 0.18
Nodes (11): BookingScene(), EASE, EXERCISES, FINDINGS, FindingsScene(), PlanScene(), rise, SLOTS (+3 more)

### Community 51 - "Therapist Earnings Tab"
Cohesion: 0.24
Nodes (11): RequestPayoutButton(), EarningsDay, formatInr(), TherapistEarningsChart(), CompletedRequest, dayLabel(), formatDate(), formatInr() (+3 more)

### Community 52 - "Site Admin Settings"
Cohesion: 0.18
Nodes (10): DEFAULT_BOOKING_LANGUAGES, DEFAULT_CONTACT_EMAIL, DEFAULT_CONTACT_PHONE, DEFAULT_FOOTER_COPYRIGHT_TEXT, DEFAULT_SITE_DESCRIPTION, DEFAULT_SITE_NAME, DEFAULT_SITE_TAGLINE, DEFAULT_WHATSAPP_NUMBER (+2 more)

### Community 53 - "Design Token Starter"
Cohesion: 0.15
Nodes (12): component, $type, $value, dark, semantic, $schema, $type, $value (+4 more)

### Community 54 - "Token Validation Script"
Cohesion: 0.24
Nodes (11): extensions, formatReport(), fs, getFiles(), main(), parseArgs(), path, patterns (+3 more)

### Community 55 - "Card Style Tokens"
Cohesion: 0.20
Nodes (12): $type, $value, bg, bg, padding, shadow, card, bg (+4 more)

### Community 56 - "Shadcn Installation Tool"
Cohesion: 0.20
Nodes (7): main(), Handle shadcn/ui component installation., ShadcnInstaller, Tests for shadcn_add.py, Test adding components that are already installed., Test initialization with custom project root., Test getting installed components when files exist.

### Community 57 - "Shadcn Component Management"
Cohesion: 0.21
Nodes (6): Add all available shadcn/ui components. Args: overwrite: If True, overwrite…, List installed components. Returns: Tuple of (success, message with component…, Check if shadcn is initialized in project. Returns: True if components.json…, Get list of already installed components. Returns: List of installed component…, Read shadcn version from project package.json; fall back to a pinned default., Add shadcn/ui components. Args: components: List of component names to add…

### Community 58 - "Config File Writer"
Cohesion: 0.20
Nodes (6): Generate configuration file content. Returns: Configuration file as string, Generate TypeScript configuration., Generate JavaScript configuration., Format plugins array for config. Validates each plugin name against a strict…, Add indentation to JSON string., Write configuration to file. Returns: Tuple of (success, message)

### Community 59 - "Brand Context Injector"
Cohesion: 0.31
Nodes (10): extractColorsFromTable(), extractCoreAttributes(), extractHexColors(), extractImageStyle(), extractTypography(), extractVoice(), fs, generatePromptAddition() (+2 more)

### Community 60 - "Token Embedding Utility"
Cohesion: 0.18
Nodes (8): args, fs, minimal, MINIMAL_TOKENS, path, projectRoot, tokensPath, wrapStyle

### Community 61 - "Animation Duration Tokens"
Cohesion: 0.20
Nodes (10): fast, normal, slow, $type, $value, $type, $value, duration (+2 more)

### Community 62 - "Component Installation Tests"
Cohesion: 0.18
Nodes (6): Test adding components with overwrite flag., Test successful component addition., Test component addition with subprocess error., Test component addition when npx is not found., Test successful addition of all components., patch

### Community 63 - "Tailwind Config Tests"
Cohesion: 0.22
Nodes (8): Tests for tailwind_config_gen.py, Reduce a generated TS/JS config to a bare assignable object so it can be handed…, Regression guard for the missing-comma bug between the ``theme`` block and…, The property preceding ``plugins`` must end with a comma (pure-Python check, so…, The emitted config parses as valid JS via ``node --check``., _strip_to_object(), TestGeneratedConfigIsValidJs, parametrize

### Community 64 - "Package Creation Routes"
Cohesion: 0.31
Nodes (8): POST(), POST(), PackageColumns, PackagePayload, parseOptionalPositiveInt(), THERAPIST_RATE_BASIS_VALUES, TherapistRateBasis, validatePackagePayload()

### Community 65 - "Team Therapist Directory"
Cohesion: 0.24
Nodes (8): metadata, revalidate, FloatingOrbs(), Stagger(), EASE, languageList(), TeamTherapist, TeamTherapistPopup()

### Community 66 - "CSV Export Utility"
Cohesion: 0.43
Nodes (5): DownloadCsvButton(), CsvColumn, downloadCsv(), escapeCell(), toCsv()

### Community 67 - "Generator Initialization"
Cohesion: 0.22
Nodes (6): Any, Path, Initialize generator. Args: typescript: If True, generate .ts config, else .js…, Determine default output path., Create base configuration structure., Get default content paths for framework.

### Community 68 - "Logo Generation Tool"
Cohesion: 0.29
Nodes (9): enhance_prompt(), generate_batch(), generate_logo(), load_env(), main(), Enhance the logo prompt with style and industry modifiers, Generate a logo using Gemini models with image generation Args: aspect_ratio:…, Generate multiple logo variants with different styles (+1 more)

### Community 69 - "Token Export Utility"
Cohesion: 0.36
Nodes (9): flattenTokens(), fs, generateCSS(), generateTailwind(), main(), parseArgs(), path, resolveReference() (+1 more)

### Community 70 - "Button Style Tokens"
Cohesion: 0.20
Nodes (10): fg, font-size, hover-bg, button, $type, $value, $type, $value (+2 more)

### Community 71 - "Multi-Domain Search Logic"
Cohesion: 0.20
Nodes (6): Execute searches across multiple domains., Select best matching result based on priority keywords., Extract results list from search result dict., Generate complete design system recommendation. variance/motion/density are…, Bucket a 1-10 dial value into its tier config. Returns None if value is None., _resolve_dial()

### Community 72 - "Admin Payouts Tab"
Cohesion: 0.15
Nodes (14): AdminPayoutsTab(), Category, formatInr(), Patient, Therapist, TherapistSessionList(), METHOD_LABEL, NOTE_PLACEHOLDER (+6 more)

### Community 73 - "Booking and Availability"
Cohesion: 0.18
Nodes (11): DeclineAccountButton(), EditBookingForm(), minDateTimeLocal(), toDateTimeLocalValue(), MarkPaidByCashButton(), Category, ProfileSessionList(), TherapistNotAvailableToggle() (+3 more)

### Community 74 - "Patient Profit Chart"
Cohesion: 0.67
Nodes (3): formatInr(), PatientProfitChart(), ProfitSession

### Community 75 - "Brand Token Sync"
Cohesion: 0.33
Nodes (8): adjustBrightness(), { execFileSync }, extractColorsFromMarkdown(), fs, generateColorScale(), main(), path, updateDesignTokens()

### Community 76 - "Text Ranking Algorithm"
Cohesion: 0.28
Nodes (5): BM25, BM25 ranking algorithm for text search, Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query

### Community 77 - "Token Validator Tests"
Cohesion: 0.28
Nodes (8): Path, Regression tests for validate-tokens.cjs. The validator used to skip any line…, A hardcoded hex on the same line as a var() token is still a violation., A line that references only tokens produces no false positives., _run(), test_flags_hardcoded_hex_sharing_line_with_token(), test_token_only_line_reports_no_violation(), CompletedProcess

### Community 78 - "Treatment Category Manager"
Cohesion: 0.25
Nodes (6): Category, NewCategoryValues, TreatmentCategoryForm(), Category, DeleteButton(), TreatmentCategoryManager()

### Community 79 - "Google Calendar Integration"
Cohesion: 0.44
Nodes (8): createSessionMeetEvent(), deleteSessionMeetEvent(), getCalendarClient(), logCalendarError(), normalizeTimezone(), SessionEventInput, SessionEventUpdateInput, updateSessionMeetEvent()

### Community 80 - "Token Architecture Documentation"
Cohesion: 0.36
Nodes (8): CSS Variables Setup, Tailwind Config, Tailwind Integration, Component Tokens, Primitive Tokens, Semantic Tokens, Token Architecture, UI Styling

### Community 81 - "Input Field Tokens"
Cohesion: 0.29
Nodes (8): padding-x, input, $type, $value, focus-ring, padding-x, $type, $value

### Community 82 - "UI Primitive Tokens"
Cohesion: 0.19
Nodes (14): $type, $value, $type, $value, $type, $value, primitive, radius (+6 more)

### Community 83 - "Account Status Pages"
Cohesion: 0.32
Nodes (4): metadata, metadata, PendingApprovalPage(), SUPPORT_EMAIL

### Community 85 - "Patient Receipt Modals"
Cohesion: 0.25
Nodes (9): Modal(), formatDateHeading(), formatDateTime(), formatInr(), ReceiptsSection(), STAGE_LABEL, STAGE_PILL_STYLE, BookingReceiptStage (+1 more)

### Community 86 - "Domain Detection Tests"
Cohesion: 0.43
Nodes (3): detect_domain(), Auto-detect the most relevant domain from query. Matches are weighted by…, TestDomainDetection

### Community 87 - "Palette Selection Logic"
Cohesion: 0.43
Nodes (3): Pick the highest-ranked palette matching the resolved mode. Only the dark case…, _select_palette_for_mode(), TestPaletteSelection

### Community 88 - "Size 16 Token"
Cohesion: 0.67
Nodes (3): $type, $value, 16

### Community 89 - "Size 2 Token"
Cohesion: 0.67
Nodes (3): $type, $value, 2

### Community 90 - "Small Size Tokens"
Cohesion: 0.60
Nodes (5): sm, sm, sm, $type, $value

### Community 91 - "Settings Update Routes"
Cohesion: 0.33
Nodes (5): ALLOWED_COLUMNS, BRAND_TEXT_FIELDS, CONTACT_FIELDS, LONG_TEXT_FIELDS, POST()

### Community 92 - "Feature Control Tab"
Cohesion: 0.47
Nodes (4): AdminFeatureControlTab(), GoogleMeetSyncIssue, saveSetting(), BookingLanguagesSection()

### Community 93 - "Border Style Tokens"
Cohesion: 0.60
Nodes (5): $type, $value, border, border, border

### Community 94 - "Radius Tokens"
Cohesion: 0.60
Nodes (5): radius, radius, radius, $type, $value

### Community 95 - "Large Size Tokens"
Cohesion: 0.60
Nodes (5): lg, $type, $value, lg, lg

### Community 96 - "GSAP Animation Library"
Cohesion: 0.40
Nodes (5): GSAP Core, GSAP Frameworks, GSAP React, GSAP ScrollTrigger, GSAP Timeline

### Community 97 - "Google OAuth Utility"
Cohesion: 0.40
Nodes (3): authUrl, oauth2Client, server

### Community 98 - "Size 6 Token"
Cohesion: 0.67
Nodes (3): $type, $value, 6

### Community 100 - "Supabase Proxy Config"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 101 - "Vertical Padding Tokens"
Cohesion: 0.67
Nodes (4): padding-y, padding-y, $type, $value

### Community 102 - "Default Value Tokens"
Cohesion: 0.67
Nodes (4): $type, $value, default, default

### Community 103 - "Extra Large Token"
Cohesion: 0.67
Nodes (4): xl, xl, $type, $value

### Community 104 - "Size 8 Token"
Cohesion: 0.67
Nodes (3): $type, $value, 8

### Community 105 - "Shadcn UI Documentation"
Cohesion: 0.50
Nodes (4): shadcn/ui Accessibility Patterns, shadcn/ui Component Reference, shadcn/ui Theming & Customization, Tailwind CSS Customization

### Community 106 - "Data Validation Scripts"
Cohesion: 0.83
Nodes (3): _check_file(), main(), _read_rows()

### Community 112 - "Destructive State Token"
Cohesion: 0.67
Nodes (3): destructive, $type, $value

### Community 113 - "Destructive Foreground Token"
Cohesion: 0.67
Nodes (3): destructive-foreground, $type, $value

### Community 114 - "Muted State Token"
Cohesion: 0.67
Nodes (3): muted, $type, $value

### Community 115 - "Primary Foreground Token"
Cohesion: 0.67
Nodes (3): primary-foreground, $type, $value

### Community 116 - "Ring Utility Token"
Cohesion: 0.67
Nodes (3): ring, $type, $value

### Community 117 - "Secondary Foreground Token"
Cohesion: 0.67
Nodes (3): secondary-foreground, $type, $value

### Community 120 - "UI/UX Design Guidelines"
Cohesion: 0.67
Nodes (3): Professional UI Rules & Checklist, UX Quick Reference, UI/UX Pro Max Skill

## Knowledge Gaps
- **481 isolated node(s):** `AnswerInput`, `LatestAssessment`, `Selection`, `AssessmentRow`, `Selection` (+476 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **76 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createAdminClient()` connect `Admin API Routes` to `Package Creation Routes`, `Patient Health Profile`, `Admin Content Management`, `Admin Detail Views`, `Dashboard Shell Components`, `Admin Payout Processing`, `Settings Update Routes`, `Admin Session Management`, `Profile Change API`, `Appointment Assignment Actions`, `Session and Package Actions`, `Therapist Dashboard`, `Feedback and Orders`, `Patient Dashboard`, `Hospital Password Reset`, `Patient Password Reset`, `Therapist Payout Processing`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Admin Login Portal` to `Therapist Booking Calendar`, `User Profile Management`, `Dashboard Shell Components`, `User Authentication Pages`, `Layout and Navigation`, `Contact Profile Forms`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Admin API Routes` to `Patient Health Profile`, `Admin Content Management`, `User Profile Management`, `Admin Detail Views`, `Dashboard Shell Components`, `Admin Payout Processing`, `Appointment Assignment Actions`, `Session and Package Actions`, `Therapist Dashboard`, `Feedback and Orders`, `Account Status Pages`, `Patient Dashboard`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `TailwindConfigGenerator` (e.g. with `TestGeneratedConfigIsValidJs` and `TestTailwindConfigGenerator`) actually correct?**
  _`TailwindConfigGenerator` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AnswerInput`, `LatestAssessment`, `Selection` to the rest of the system?**
  _481 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Patient Health Profile` be split into smaller, more focused modules?**
  _Cohesion score 0.05621500559910415 - nodes in this community are weakly interconnected._
- **Should `Therapist Booking Calendar` be split into smaller, more focused modules?**
  _Cohesion score 0.05030525030525031 - nodes in this community are weakly interconnected._