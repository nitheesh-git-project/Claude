# Graph Report - .  (2026-08-12)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2020 nodes · 4092 edges · 177 communities (111 shown, 66 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 38 edges (avg confidence: 0.55)
- Token cost: 7,001 input · 2,095 output

## Graph Freshness
- Built from commit: `869ea84b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Admin Account Actions
- Booking and Roster UI
- Payout and FAQ Management
- Color Palette Tokens
- Session Booking API
- Project Dependencies
- Admin Detail Pages
- Slide Search Logic
- Admin Calendar and Referrals
- Admin Metrics Dashboard
- CIP Search Core
- Admin People Directory
- Spacing Tokens
- Appointment Assignment API
- Landing Page Content
- Root Layout and Navigation
- Tailwind Generator Tests
- TypeScript Configuration
- HTML Token Validator
- Admin and Hospital Login
- Hospital Dashboard Shell
- Payment History Tracking
- Package Detail Modals
- Logo Search Core
- Script Search Core
- Marketing and Onboarding Pages
- Patient Dashboard UI
- Contact Form Components
- Tailwind Config Generator
- Design System Formatting
- User Profile Management
- Slide Generation Logic
- Design System Generator
- Receipt Management UI
- Theme Color Tokens
- Style Mode Resolution
- Background Image Generation
- Public FAQ and Booking
- Registration and Login Fields
- Card Style Tokens
- BM25 Search Algorithm
- Multi-Domain Search Logic
- Icon Generation Utility
- Font Size Tokens
- Patient Auth and Booking
- Shadcn Installer Tests
- Color Luminance Testing
- Therapist Dashboard UI
- Color Extraction Utility
- Asset Validation Script
- Booking Scene Components
- Therapist Earnings UI
- Design Token Schema
- Razorpay Payment Integration
- Token Validation Script
- Shadcn CLI Tool
- Shadcn Component Management
- Config File Generation
- CSV Export Utilities
- Brand Context Injection
- Token Embedding Utility
- Animation Duration Tokens
- Shadcn Installation Tests
- Tailwind Config Tests
- Package Management API
- Team Directory Page
- Generator Initialization
- Logo Generation Logic
- Token Generation Script
- Button Style Tokens
- Profile and Settings API
- Admin Action Buttons
- Package Catalog Management
- Brand Token Sync
- Text Search Indexing
- Token Validator Tests
- Admin Session Settings
- Input Style Tokens
- Radius and Shadow Tokens
- Account Status Pages
- Appointment Cancellation API
- Public Session Packages
- Payout Receipt Modals
- Domain Detection Tests
- Password Reset Route
- Small Size Tokens
- Detail Overlay Modals
- Admin Feature Toggles
- Cancellation Dialog Hooks
- Border Radius Tokens
- Large Size Tokens
- GSAP Animation Skills
- Google Auth Utilities
- Supabase Proxy Config
- Token Architecture Documentation
- Palette Selection Logic
- Extra Large Tokens
- Border Style Tokens
- Empty State Tokens
- Data Validation Script
- Patient Profit Analytics
- Brand Token Sync Tests
- Slide Token Validation
- Design Token Schema
- Destructive Color Tokens
- Muted Color Tokens
- Primary Color Tokens
- Primary Foreground Tokens
- Ring Utility Tokens
- Graphify Extraction Logic
- Installer Initialization
- Temporary Project Fixtures
- UI/UX Design Guidelines
- Canvas Design Licensing
- Shadcn UI Documentation
- Tailwind Theming Guides
- Secondary Foreground Tokens
- Component Installation Tests
- Config Existence Tests
- Component Listing Tests
- Project Root Tests
- Dry Run Tests
- Empty Component Tests
- Font Addition Tests
- Plugin Recommendation Tests
- TypeScript Config Tests
- Custom Color Tests
- Config Plugin Tests
- Config Validation Tests
- Theme Extension Tests
- Config Writing Tests
- JavaScript Init Tests
- Config Content Tests
- Invalid Path Tests
- Full JS Config Tests
- TS Output Path Tests
- Base Structure Tests
- Vue Content Path Tests
- Color Addition Tests
- ESLint Configuration
- Git Post-Merge Hooks
- Next.js Configuration
- PostCSS Configuration
- Slides Presentation Skill
- Bricolage Grotesque License
- Crimson Pro License
- DM Mono License
- Erica One License
- Geist Mono License
- Gloock License
- IBM Plex Mono License
- Instrument Sans License
- Italiana License
- JetBrains Mono License
- Jura License
- Libre Baskerville License
- Lora License
- National Park License
- Nothing You Could Do License
- Outfit License
- Pixelify Sans License
- Poiret One License
- Red Hat Mono License
- Silkscreen License
- Smooch Sans License
- Tektur License
- Work Sans License
- Young Serif License
- Tailwind Responsive Design
- Tailwind Utility Reference
- UI Styling Skill
- Docs Freshness Workflow
- Graphify Refresh Workflow
- Empty List Tests

## God Nodes (most connected - your core abstractions)
1. `createAdminClient()` - 174 edges
2. `getAdminUser()` - 116 edges
3. `TailwindConfigGenerator` - 58 edges
4. `createClient()` - 57 edges
5. `createClient()` - 37 edges
6. `TestTailwindConfigGenerator` - 35 edges
7. `useConfirm()` - 35 edges
8. `ShadcnInstaller` - 34 edges
9. `parseJsonBody()` - 30 edges
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
- **Design Token Architecture Layers** — claude_skills_design_system_references_token_architecture_primitive_tokens, claude_skills_design_system_references_token_architecture_semantic_tokens, claude_skills_design_system_references_token_architecture_component_tokens [EXTRACTED 1.00]
- **OFL Licensed Font Collection** — claude_skills_ui_styling_canvas_fonts_boldonse_ofl, claude_skills_ui_styling_canvas_fonts_bricolagegrotesque_ofl, claude_skills_ui_styling_canvas_fonts_crimsonpro_ofl, claude_skills_ui_styling_canvas_fonts_dmmono_ofl, claude_skills_ui_styling_canvas_fonts_ericaone_ofl, claude_skills_ui_styling_canvas_fonts_geistmono_ofl, claude_skills_ui_styling_canvas_fonts_gloock_ofl, claude_skills_ui_styling_canvas_fonts_ibmplexmono_ofl, claude_skills_ui_styling_canvas_fonts_instrumentsans_ofl, claude_skills_ui_styling_canvas_fonts_italiana_ofl, claude_skills_ui_styling_canvas_fonts_jetbrainsmono_ofl, claude_skills_ui_styling_canvas_fonts_jura_ofl, claude_skills_ui_styling_canvas_fonts_librebaskerville_ofl, claude_skills_ui_styling_canvas_fonts_lora_ofl, claude_skills_ui_styling_canvas_fonts_nationalpark_ofl, claude_skills_ui_styling_canvas_fonts_nothingyoucoulddo_ofl, claude_skills_ui_styling_canvas_fonts_outfit_ofl, claude_skills_ui_styling_canvas_fonts_pixelifysans_ofl, claude_skills_ui_styling_canvas_fonts_poiretone_ofl, claude_skills_ui_styling_canvas_fonts_redhatmono_ofl, claude_skills_ui_styling_canvas_fonts_silkscreen_ofl, claude_skills_ui_styling_canvas_fonts_smoochsans_ofl, claude_skills_ui_styling_canvas_fonts_tektur_ofl, claude_skills_ui_styling_canvas_fonts_worksans_ofl, claude_skills_ui_styling_canvas_fonts_youngserif_ofl [EXTRACTED 1.00]
- **OFL Licensed Font Software Collection** — claude_skills_ui_styling_canvas_fonts_boldonse_ofl, claude_skills_ui_styling_canvas_fonts_bricolagegrotesque_ofl, claude_skills_ui_styling_canvas_fonts_geistmono_ofl, claude_skills_ui_styling_canvas_fonts_ibmplexmono_ofl, claude_skills_ui_styling_canvas_fonts_jetbrainsmono_ofl [EXTRACTED 1.00]
- **GSAP Animation Ecosystem** — claude_skills_gsap_core_skill, claude_skills_gsap_frameworks_skill, claude_skills_gsap_react_skill, claude_skills_gsap_scrolltrigger_skill, claude_skills_gsap_timeline_skill [EXTRACTED 1.00]
- **UI Styling & Design System Knowledge** — claude_skills_ui_styling_references_canvas_design_system, claude_skills_ui_styling_references_shadcn_accessibility, claude_skills_ui_styling_references_shadcn_components, claude_skills_ui_styling_references_shadcn_theming, claude_skills_ui_styling_references_tailwind_customization, claude_skills_ui_styling_references_tailwind_responsive, claude_skills_ui_styling_references_tailwind_utilities [EXTRACTED 1.00]
- **UI Styling & Design System** — claude_skills_ui_styling_references_canvas_design_system, claude_skills_ui_styling_references_shadcn_components, claude_skills_ui_styling_references_shadcn_theming, claude_skills_ui_styling_references_tailwind_utilities [EXTRACTED]
- **UI/UX Intelligence Framework** — claude_skills_ui_ux_pro_max_skill, claude_skills_ui_ux_pro_max_references_pro_rules, claude_skills_ui_ux_pro_max_references_quick_reference [EXTRACTED]

## Communities (177 total, 66 thin omitted)

### Community 0 - "Admin Account Actions"
Cohesion: 0.07
Nodes (50): POST(), POST(), POST(), POST(), POST(), POST(), POST(), POST() (+42 more)

### Community 1 - "Booking and Roster UI"
Cohesion: 0.07
Nodes (54): AdminRosterTab(), STATE_STYLES, STATE_TITLES, Therapist, todayKey(), BookingCalendar(), BookingStepOne(), REVEAL (+46 more)

### Community 2 - "Payout and FAQ Management"
Cohesion: 0.06
Nodes (38): AdminPayoutRequestsTab(), formatDateTime(), formatInr(), PayoutRequestRow, CompletePayoutRequestButton(), Faq, FaqForm(), DeleteButton() (+30 more)

### Community 3 - "Color Palette Tokens"
Cohesion: 0.05
Nodes (53): $type, $value, $type, $value, $type, $value, $type, $value (+45 more)

### Community 4 - "Session Booking API"
Cohesion: 0.12
Nodes (27): isoWeekKey(), POST(), SlotResult, POST(), POST(), POST(), POST(), POST() (+19 more)

### Community 5 - "Project Dependencies"
Cohesion: 0.04
Nodes (46): eslint, eslint-config-next, @fortawesome/fontawesome-free, googleapis, libphonenumber-js, motion, next, dependencies (+38 more)

### Community 6 - "Admin Detail Pages"
Cohesion: 0.10
Nodes (26): AdminDashboardPage(), metadata, metadata, HospitalDashboardPage(), metadata, STATUS_STYLES, PatientDetailContent(), PatientNotesForm() (+18 more)

### Community 7 - "Slide Search Logic"
Cohesion: 0.08
Nodes (36): format_context(), format_result(), main(), Format a single search result for display, Format contextual recommendations for display., BM25, calculate_pattern_break(), detect_domain() (+28 more)

### Community 8 - "Admin Calendar and Referrals"
Cohesion: 0.11
Nodes (30): POST(), AdminCalendarTab(), Category, Person, STATUS_STYLES, todayKey(), AdminSessionStoryTab(), Category (+22 more)

### Community 9 - "Admin Metrics Dashboard"
Cohesion: 0.10
Nodes (37): AdminMetricsTab(), Category, daysAgo(), formatInr(), formatShortDate(), nowTimestamp(), toDateInputValue(), TrendBarChart() (+29 more)

### Community 10 - "CIP Search Core"
Cohesion: 0.08
Nodes (37): detect_domain(), get_cip_brief(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search across all domains and combine results (+29 more)

### Community 11 - "Admin People Directory"
Cohesion: 0.08
Nodes (23): metadata, nowTimestamp(), AdminPeopleDirectory(), Person, ApproveAccountButton(), AssignReferralForm(), minDateTimeLocal(), AssignTherapistForm() (+15 more)

### Community 12 - "Spacing Tokens"
Cohesion: 0.06
Nodes (34): $type, $value, $type, $value, $type, $value, $type, $value (+26 more)

### Community 13 - "Appointment Assignment API"
Cohesion: 0.13
Nodes (23): POST(), POST(), POST(), POST(), POST(), POST(), POST(), AdminClient (+15 more)

### Community 14 - "Landing Page Content"
Cohesion: 0.09
Nodes (22): Spine X-ray Illustration, PROGRAM_ART, revalidate, TRUST_POINTS, Area, AREAS, CareAreas(), EASE (+14 more)

### Community 15 - "Root Layout and Navigation"
Cohesion: 0.11
Nodes (24): inter, jakarta, metadata, RootLayout(), DebugNav(), routes, toLocalInputValue(), FarewellBanner() (+16 more)

### Community 16 - "Tailwind Generator Tests"
Cohesion: 0.06
Nodes (16): Test adding colors multiple times., Test adding full color palette., Test adding custom breakpoints., Test TailwindConfigGenerator class., Test that adding same plugin twice doesn't duplicate., Test plugin recommendations for Next.js., Test initialization with default settings., Test generating JavaScript configuration. (+8 more)

### Community 17 - "TypeScript Configuration"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 18 - "HTML Token Validator"
Cohesion: 0.13
Nodes (24): get_context(), is_allowed_exception(), is_allowed_rgba(), is_inside_block(), load_css_variables(), main(), print_result(), print_summary() (+16 more)

### Community 19 - "Admin and Hospital Login"
Cohesion: 0.13
Nodes (14): metadata, metadata, ResetPasswordPage(), ROLE_LOGIN_HREF, ADMIN_REALTIME_TABLES, AdminTabs(), TabDef, TabKey (+6 more)

### Community 20 - "Hospital Dashboard Shell"
Cohesion: 0.10
Nodes (20): HospitalProfilePage(), metadata, DashboardShell(), ShellNavItem, SessionTimeoutDialog(), DEFAULT_BOOKING_LANGUAGES, DEFAULT_CONTACT_EMAIL, DEFAULT_CONTACT_PHONE (+12 more)

### Community 21 - "Payment History Tracking"
Cohesion: 0.14
Nodes (24): AdminPaymentHistoryTab(), AdminReceiptRow, Category, formatDateTime(), formatInr(), Patient, PatientTransactionTable(), RECEIPT_STAGE_LABEL (+16 more)

### Community 22 - "Package Detail Modals"
Cohesion: 0.14
Nodes (19): AppointmentRow, DetailResponse, EventRow, PackagePurchaseDetailModal(), AppointmentRow, DetailResponse, EASE, EventRow (+11 more)

### Community 23 - "Logo Search Core"
Cohesion: 0.11
Nodes (19): BM25, detect_domain(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search across all domains and combine results (+11 more)

### Community 24 - "Script Search Core"
Cohesion: 0.12
Nodes (18): _domain_keywords(), _get_bm25(), _load_csv(), _load_product_keywords(), Load CSV and return list of dicts, with mtime-based caching., Fitted BM25 index for this file+columns, with mtime-based caching., Core search function using BM25. Returns (results, bm25_or_none)., Nearest known vocabulary terms for a query that returned 0 hits, so the caller… (+10 more)

### Community 25 - "Marketing and Onboarding Pages"
Cohesion: 0.11
Nodes (16): ACCENTS, metadata, PATHS, metadata, PROBLEM, SOLUTION, metadata, OBJECTIONS (+8 more)

### Community 26 - "Patient Dashboard UI"
Cohesion: 0.13
Nodes (18): metadata, nowTimestamp(), PatientDashboardPage(), STATUS_STYLES, BOOKING_FROM_DASHBOARD, BookingBackToSessions(), PatientMonthMotivation(), BUCKET_DOT_COLOR (+10 more)

### Community 27 - "Contact Form Components"
Cohesion: 0.16
Nodes (17): PatientContactEditForm(), TherapistContactEditForm(), HospitalInquiryForm(), SOURCES, PhoneNumberField(), FieldConfig, InstantProfileFields(), composePhone() (+9 more)

### Community 28 - "Tailwind Config Generator"
Cohesion: 0.10
Nodes (12): main(), Add custom font families. Args: fonts: Dict of font_type: [font_names] e.g.,…, Add custom spacing values. Args: spacing: Dict of name: value e.g., {'18':…, Add custom breakpoints. Args: breakpoints: Dict of name: width e.g., {'3xl':…, Add plugin requirements. Args: plugins: List of plugin names e.g.,…, Get plugin recommendations based on configuration. Returns: List of recommended…, Generate Tailwind CSS configuration files., Validate configuration. Returns: Tuple of (valid, message) (+4 more)

### Community 29 - "Design System Formatting"
Cohesion: 0.12
Nodes (20): ansi_ljust(), _detect_page_type(), format_ascii_box(), format_markdown(), format_master_md(), format_page_override_md(), _generate_intelligent_overrides(), hex_to_ansi() (+12 more)

### Community 30 - "User Profile Management"
Cohesion: 0.18
Nodes (13): metadata, PatientProfilePage(), metadata, TherapistProfilePage(), AccountSecuritySection(), AvatarUpload(), FieldConfig, FieldStatusMap (+5 more)

### Community 31 - "Slide Generation Logic"
Cohesion: 0.15
Nodes (19): _e(), generate_chart_slide(), generate_cta_slide(), generate_deck(), generate_metrics_slide(), generate_problem_slide(), generate_solution_slide(), generate_testimonial_slide() (+11 more)

### Community 32 - "Design System Generator"
Cohesion: 0.15
Nodes (11): DesignSystemGenerator, generate_design_system(), persist_design_system(), Generates design system recommendations from aggregated searches., Load reasoning rules from CSV., Find matching reasoning rule for a category., Apply reasoning rules to search results., Main entry point for design system generation. Args: query: Search query (e.g.,… (+3 more)

### Community 33 - "Receipt Management UI"
Cohesion: 0.13
Nodes (18): formatDateHeading(), formatDateTime(), formatInr(), ReceiptsSection(), STAGE_LABEL, STAGE_PILL_STYLE, BookingReceipt, BookingReceiptStage (+10 more)

### Community 34 - "Theme Color Tokens"
Cohesion: 0.11
Nodes (19): $type, $value, background, destructive, foreground, muted-foreground, primary-hover, secondary (+11 more)

### Community 35 - "Style Mode Resolution"
Cohesion: 0.16
Nodes (10): _filter_anti_patterns_for_mode(), _query_wants_dark(), True when a styles.csv row describes itself as dark-first., True when the query explicitly asks for a dark theme., Resolve the mode the rest of the output has to agree with., Drop "avoid dark mode" advice once dark mode is the resolved answer., _resolve_color_mode(), _style_is_dark_primary() (+2 more)

### Community 36 - "Background Image Generation"
Cohesion: 0.17
Nodes (17): generate_css_for_background(), get_background_image(), get_curated_images(), get_overlay_css(), get_pexels_search_url(), load_backgrounds_config(), load_brand_colors(), main() (+9 more)

### Community 37 - "Public FAQ and Booking"
Cohesion: 0.15
Nodes (14): BookPage(), metadata, revalidate, ConditionsPage(), Faq, FaqPage(), metadata, revalidate (+6 more)

### Community 38 - "Registration and Login Fields"
Cohesion: 0.21
Nodes (9): metadata, metadata, EmailField(), InviteRegisterCard(), Preview, PasswordField(), TherapistAuthCard(), SESSION_FEE_INR (+1 more)

### Community 39 - "Card Style Tokens"
Cohesion: 0.20
Nodes (12): $type, $value, bg, bg, padding, shadow, card, bg (+4 more)

### Community 40 - "BM25 Search Algorithm"
Cohesion: 0.15
Nodes (9): BM25, _normalize(), Apply synonym substitution before tokenizing., BM25 ranking algorithm for text search, Lowercase, normalize synonyms, split, remove punctuation, filter stopwords, Build BM25 index from documents, Score all documents against query, All indexed terms, for suggestion/typo-recovery purposes. (+1 more)

### Community 41 - "Multi-Domain Search Logic"
Cohesion: 0.20
Nodes (6): Execute searches across multiple domains., Select best matching result based on priority keywords., Extract results list from search result dict., Generate complete design system recommendation. variance/motion/density are…, Bucket a 1-10 dial value into its tier config. Returns None if value is None., _resolve_dial()

### Community 42 - "Icon Generation Utility"
Cohesion: 0.20
Nodes (15): apply_color(), apply_viewbox_size(), extract_svgs(), generate_batch(), generate_icon(), generate_sizes(), load_env(), main() (+7 more)

### Community 43 - "Font Size Tokens"
Cohesion: 0.12
Nodes (16): $type, $value, $type, $value, $type, $value, $type, $value (+8 more)

### Community 44 - "Patient Auth and Booking"
Cohesion: 0.22
Nodes (10): metadata, ConfirmPasswordField(), PatientAuthCard(), BookingWizard(), Category, formatInr(), PackageData, BOOKING_LEAD_TIME_MS (+2 more)

### Community 45 - "Shadcn Installer Tests"
Cohesion: 0.14
Nodes (8): Test adding components without shadcn config., Test adding components in dry run mode., Test ShadcnInstaller class., Test listing installed components without config., Test listing installed components when none exist., Test checking for existing shadcn config., Test getting installed components without config., TestShadcnInstaller

### Community 46 - "Color Luminance Testing"
Cohesion: 0.18
Nodes (7): _palette_is_dark(), WCAG relative luminance of a #RRGGBB string, or None if unparseable., True when a colors.csv row's Background is a dark surface., _relative_luminance(), The exact reproduction from issue #428., TestEndToEndCoherence, TestLuminance

### Community 47 - "Therapist Dashboard UI"
Cohesion: 0.22
Nodes (10): metadata, nowTimestamp(), STATUS_BADGE_STYLES, TherapistDashboardPage(), PackageChip(), SessionFeedbackForm(), computeRatingAggregate(), computeTherapistEarningRows() (+2 more)

### Community 48 - "Color Extraction Utility"
Cohesion: 0.22
Nodes (11): calculateCompliance(), colorDistance(), displayPalette(), extractHexColors(), findNearestBrandColor(), fs, generateImageMagickCommand(), hexToRgb() (+3 more)

### Community 49 - "Asset Validation Script"
Cohesion: 0.25
Nodes (13): checkManifest(), formatBytes(), formatOutput(), fs, main(), parseFilename(), path, RULES (+5 more)

### Community 50 - "Booking Scene Components"
Cohesion: 0.18
Nodes (11): BookingScene(), EASE, EXERCISES, FINDINGS, FindingsScene(), PlanScene(), rise, SLOTS (+3 more)

### Community 51 - "Therapist Earnings UI"
Cohesion: 0.24
Nodes (11): RequestPayoutButton(), EarningsDay, formatInr(), TherapistEarningsChart(), CompletedRequest, dayLabel(), formatDate(), formatInr() (+3 more)

### Community 52 - "Design Token Schema"
Cohesion: 0.15
Nodes (12): component, $type, $value, dark, semantic, $schema, $type, $value (+4 more)

### Community 53 - "Razorpay Payment Integration"
Cohesion: 0.24
Nodes (9): BuyPackageButton(), PayNowButton(), PackagePaymentResult, payForPackage(), PayForPackageArgs, loadRazorpayScript(), payForAppointment(), PayForAppointmentArgs (+1 more)

### Community 54 - "Token Validation Script"
Cohesion: 0.24
Nodes (11): extensions, formatReport(), fs, getFiles(), main(), parseArgs(), path, patterns (+3 more)

### Community 55 - "Shadcn CLI Tool"
Cohesion: 0.20
Nodes (7): main(), Handle shadcn/ui component installation., ShadcnInstaller, Tests for shadcn_add.py, Test adding all components without config., Test initialization with custom project root., Test getting installed components when files exist.

### Community 56 - "Shadcn Component Management"
Cohesion: 0.21
Nodes (6): Add all available shadcn/ui components. Args: overwrite: If True, overwrite…, List installed components. Returns: Tuple of (success, message with component…, Check if shadcn is initialized in project. Returns: True if components.json…, Get list of already installed components. Returns: List of installed component…, Read shadcn version from project package.json; fall back to a pinned default., Add shadcn/ui components. Args: components: List of component names to add…

### Community 57 - "Config File Generation"
Cohesion: 0.20
Nodes (6): Generate configuration file content. Returns: Configuration file as string, Generate TypeScript configuration., Generate JavaScript configuration., Format plugins array for config. Validates each plugin name against a strict…, Add indentation to JSON string., Write configuration to file. Returns: Tuple of (success, message)

### Community 58 - "CSV Export Utilities"
Cohesion: 0.27
Nodes (8): DownloadCsvButton(), PackagePurchasesTable(), PurchaseRow, STATUS_OPTIONS, CsvColumn, downloadCsv(), escapeCell(), toCsv()

### Community 59 - "Brand Context Injection"
Cohesion: 0.31
Nodes (10): extractColorsFromTable(), extractCoreAttributes(), extractHexColors(), extractImageStyle(), extractTypography(), extractVoice(), fs, generatePromptAddition() (+2 more)

### Community 60 - "Token Embedding Utility"
Cohesion: 0.18
Nodes (8): args, fs, minimal, MINIMAL_TOKENS, path, projectRoot, tokensPath, wrapStyle

### Community 61 - "Animation Duration Tokens"
Cohesion: 0.20
Nodes (10): fast, normal, slow, $type, $value, $type, $value, duration (+2 more)

### Community 62 - "Shadcn Installation Tests"
Cohesion: 0.18
Nodes (6): Test adding components with overwrite flag., Test successful component addition., Test component addition with subprocess error., Test component addition when npx is not found., Test successful addition of all components., patch

### Community 63 - "Tailwind Config Tests"
Cohesion: 0.22
Nodes (8): Tests for tailwind_config_gen.py, Reduce a generated TS/JS config to a bare assignable object so it can be handed…, Regression guard for the missing-comma bug between the ``theme`` block and…, The property preceding ``plugins`` must end with a comma (pure-Python check, so…, The emitted config parses as valid JS via ``node --check``., _strip_to_object(), TestGeneratedConfigIsValidJs, parametrize

### Community 64 - "Package Management API"
Cohesion: 0.31
Nodes (8): POST(), POST(), PackageColumns, PackagePayload, parseOptionalPositiveInt(), THERAPIST_RATE_BASIS_VALUES, TherapistRateBasis, validatePackagePayload()

### Community 65 - "Team Directory Page"
Cohesion: 0.24
Nodes (8): metadata, revalidate, TeamPage(), Stagger(), EASE, languageList(), TeamTherapist, TeamTherapistPopup()

### Community 66 - "Generator Initialization"
Cohesion: 0.22
Nodes (6): Any, Path, Initialize generator. Args: typescript: If True, generate .ts config, else .js…, Determine default output path., Create base configuration structure., Get default content paths for framework.

### Community 67 - "Logo Generation Logic"
Cohesion: 0.29
Nodes (9): enhance_prompt(), generate_batch(), generate_logo(), load_env(), main(), Enhance the logo prompt with style and industry modifiers, Generate a logo using Gemini models with image generation Args: aspect_ratio:…, Generate multiple logo variants with different styles (+1 more)

### Community 68 - "Token Generation Script"
Cohesion: 0.36
Nodes (9): flattenTokens(), fs, generateCSS(), generateTailwind(), main(), parseArgs(), path, resolveReference() (+1 more)

### Community 69 - "Button Style Tokens"
Cohesion: 0.20
Nodes (10): fg, font-size, hover-bg, button, $type, $value, $type, $value (+2 more)

### Community 70 - "Profile and Settings API"
Cohesion: 0.15
Nodes (10): POST(), generatePassword(), generateReferralCode(), POST(), ALLOWED_COLUMNS, BRAND_TEXT_FIELDS, CONTACT_FIELDS, LONG_TEXT_FIELDS (+2 more)

### Community 71 - "Admin Action Buttons"
Cohesion: 0.29
Nodes (5): DeclineAccountButton(), MarkPaidByCashButton(), TherapistNotAvailableToggle(), CompleteSessionButton(), ConfirmDialog()

### Community 72 - "Package Catalog Management"
Cohesion: 0.31
Nodes (7): inputCls(), Package, PackageCatalogForm(), DeleteButton(), Package, PackageCatalogManager(), computePackageSavings()

### Community 73 - "Brand Token Sync"
Cohesion: 0.33
Nodes (8): adjustBrightness(), { execFileSync }, extractColorsFromMarkdown(), fs, generateColorScale(), main(), path, updateDesignTokens()

### Community 74 - "Text Search Indexing"
Cohesion: 0.28
Nodes (5): BM25, BM25 ranking algorithm for text search, Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query

### Community 75 - "Token Validator Tests"
Cohesion: 0.28
Nodes (8): Path, Regression tests for validate-tokens.cjs. The validator used to skip any line…, A hardcoded hex on the same line as a var() token is still a violation., A line that references only tokens produces no false positives., _run(), test_flags_hardcoded_hex_sharing_line_with_token(), test_token_only_line_reports_no_violation(), CompletedProcess

### Community 76 - "Admin Session Settings"
Cohesion: 0.31
Nodes (6): AdminSessionManagerTab(), Package, SubTab, PackageSettingsForm(), saveSetting(), AdminSettings

### Community 77 - "Input Style Tokens"
Cohesion: 0.20
Nodes (12): padding-x, padding-y, input, $type, $value, focus-ring, padding-x, padding-y (+4 more)

### Community 78 - "Radius and Shadow Tokens"
Cohesion: 0.24
Nodes (10): $type, $value, $type, $value, primitive, radius, shadow, full (+2 more)

### Community 79 - "Account Status Pages"
Cohesion: 0.32
Nodes (4): metadata, metadata, PendingApprovalPage(), SUPPORT_EMAIL

### Community 80 - "Appointment Cancellation API"
Cohesion: 0.39
Nodes (5): POST(), POST(), cancelAppointmentAndRefund(), CancelResult, deleteMeetEventForAppointment()

### Community 81 - "Public Session Packages"
Cohesion: 0.29
Nodes (6): Category, metadata, revalidate, PublicPackage, SessionPackages(), AnimatedCard()

### Community 82 - "Payout Receipt Modals"
Cohesion: 0.39
Nodes (6): Modal(), formatDateHeading(), formatDateTime(), formatInr(), TherapistPayoutReceiptsSection(), PayoutReceipt

### Community 83 - "Domain Detection Tests"
Cohesion: 0.43
Nodes (3): detect_domain(), Auto-detect the most relevant domain from query. Matches are weighted by…, TestDomainDetection

### Community 85 - "Small Size Tokens"
Cohesion: 0.60
Nodes (5): sm, sm, sm, $type, $value

### Community 87 - "Admin Feature Toggles"
Cohesion: 0.47
Nodes (4): AdminFeatureControlTab(), GoogleMeetSyncIssue, saveSetting(), BookingLanguagesSection()

### Community 88 - "Cancellation Dialog Hooks"
Cohesion: 0.53
Nodes (3): CancelSessionButton(), PromptDialog(), usePrompt()

### Community 89 - "Border Radius Tokens"
Cohesion: 0.60
Nodes (5): radius, radius, radius, $type, $value

### Community 90 - "Large Size Tokens"
Cohesion: 0.60
Nodes (5): lg, $type, $value, lg, lg

### Community 91 - "GSAP Animation Skills"
Cohesion: 0.40
Nodes (5): GSAP Core Skill, GSAP Frameworks Skill, GSAP React Skill, GSAP ScrollTrigger Skill, GSAP Timeline Skill

### Community 92 - "Google Auth Utilities"
Cohesion: 0.40
Nodes (3): authUrl, oauth2Client, server

### Community 93 - "Supabase Proxy Config"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 94 - "Token Architecture Documentation"
Cohesion: 0.83
Nodes (4): Component Tokens, Primitive Tokens, Semantic Tokens, Token Architecture

### Community 95 - "Palette Selection Logic"
Cohesion: 0.43
Nodes (3): Pick the highest-ranked palette matching the resolved mode. Only the dark case…, _select_palette_for_mode(), TestPaletteSelection

### Community 96 - "Extra Large Tokens"
Cohesion: 0.67
Nodes (4): xl, xl, $type, $value

### Community 97 - "Border Style Tokens"
Cohesion: 0.60
Nodes (5): $type, $value, border, border, border

### Community 98 - "Empty State Tokens"
Cohesion: 0.67
Nodes (4): $type, $value, none, none

### Community 99 - "Data Validation Script"
Cohesion: 0.83
Nodes (3): _check_file(), main(), _read_rows()

### Community 100 - "Patient Profit Analytics"
Cohesion: 0.67
Nodes (3): formatInr(), PatientProfitChart(), ProfitSession

### Community 104 - "Design Token Schema"
Cohesion: 0.67
Nodes (4): $type, $value, default, default

### Community 105 - "Destructive Color Tokens"
Cohesion: 0.67
Nodes (3): destructive-foreground, $type, $value

### Community 106 - "Muted Color Tokens"
Cohesion: 0.67
Nodes (3): muted, $type, $value

### Community 107 - "Primary Color Tokens"
Cohesion: 0.67
Nodes (3): primary, $type, $value

### Community 108 - "Primary Foreground Tokens"
Cohesion: 0.67
Nodes (3): primary-foreground, $type, $value

### Community 109 - "Ring Utility Tokens"
Cohesion: 0.67
Nodes (3): ring, $type, $value

### Community 110 - "Graphify Extraction Logic"
Cohesion: 0.67
Nodes (3): Extraction Spec, Query Reference, Graphify Skill

### Community 113 - "UI/UX Design Guidelines"
Cohesion: 1.00
Nodes (3): Professional UI Rules, UI/UX Quick Reference, UI/UX Pro Max Skill

### Community 117 - "Secondary Foreground Tokens"
Cohesion: 0.67
Nodes (3): secondary-foreground, $type, $value

## Knowledge Gaps
- **431 isolated node(s):** `Therapist`, `ChipOption`, `Slot`, `SlotResult`, `Slot` (+426 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **66 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createAdminClient()` connect `Admin Account Actions` to `Package Management API`, `Session Booking API`, `Profile and Settings API`, `Admin Detail Pages`, `Admin Calendar and Referrals`, `Admin People Directory`, `Appointment Assignment API`, `Therapist Dashboard UI`, `Appointment Cancellation API`, `Password Reset Route`, `Patient Dashboard UI`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Admin and Hospital Login` to `Registration and Login Fields`, `Patient Auth and Booking`, `Root Layout and Navigation`, `Hospital Dashboard Shell`, `Contact Form Components`, `User Profile Management`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `SESSION_FEE_PAISE` connect `Admin Calendar and Referrals` to `Admin Account Actions`, `Session Booking API`, `Admin Detail Pages`, `Admin Metrics Dashboard`, `Admin People Directory`, `Appointment Assignment API`, `Landing Page Content`, `Therapist Dashboard UI`, `Patient Dashboard UI`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `TailwindConfigGenerator` (e.g. with `TestGeneratedConfigIsValidJs` and `TestTailwindConfigGenerator`) actually correct?**
  _`TailwindConfigGenerator` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Therapist`, `ChipOption`, `Slot` to the rest of the system?**
  _431 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Account Actions` be split into smaller, more focused modules?**
  _Cohesion score 0.06798245614035088 - nodes in this community are weakly interconnected._
- **Should `Booking and Roster UI` be split into smaller, more focused modules?**
  _Cohesion score 0.07291666666666667 - nodes in this community are weakly interconnected._