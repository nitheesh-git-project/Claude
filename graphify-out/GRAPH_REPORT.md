# Graph Report - Claude  (2026-08-18)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2790 nodes · 6099 edges · 237 communities (145 shown, 92 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.56)
- Token cost: 8,884 input · 2,808 output

## Graph Freshness
- Built from commit: `2075177c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Admin Account Actions
- Patient Session Management
- Admin Dashboard Core
- Home Visit Package Forms
- Admin Detail Pages
- Admin Auth Tests
- Appointment Assignment API
- Brand Color Palette
- Session Filtering UI
- Core Search Engine
- Slide Search Logic
- Therapist Roster Management
- Public Marketing Pages
- Auth and Global Search
- Admin Feature Settings
- Landing Page Components
- Booking Wizard Utilities
- Booking Calendar UI
- Patient Dashboard UI
- Tailwind Generator Tests
- Design System Generation
- Admin Analytics Tabs
- Patient Health Profiles
- TypeScript Configuration
- Hospital Dashboard Shell
- User Profile Management
- Booking Action Buttons
- CSS Token Validator
- Registration and Login
- Pain Assessment Diagrams
- Root Layout Components
- Logo Search Engine
- Admin Payment History
- Contact Information Forms
- Public Booking Pages
- Admin Activity Logs
- Entity Status Toggles
- Pain Assessment Editor
- Spacing Design Tokens
- Tailwind Config Logic
- Search Core Utilities
- Design System Recommendations
- Admin Calendar Views
- Project Dependencies
- Slide Deck Generation
- Patient Receipt Management
- Semantic Color Tokens
- Color Mode Logic
- Background Image Fetcher
- Therapist Payout Ledger
- BM25 Search Algorithm
- Development Dependencies
- Home Visit Settings
- Home Visit Details
- Therapist Earnings UI
- SVG Icon Generator
- Typography Design Tokens
- Admin Booking Management
- Package Payment Integration
- Shadcn Installer Tests
- Color Contrast Validation
- Treatment Category Management
- Color Extraction Utility
- Asset Validation Script
- Radius and Shadow Tokens
- Booking Lead Time Logic
- Clinical Assessment Scenes
- Design Token Schema
- Payout Detail Modals
- Password Reset Actions
- Token Validation Script
- Card Styling Tokens
- Shadcn CLI Tool
- Shadcn Component Management
- Config File Generation
- UI Design Guidelines
- Condition Detail Management
- Service Area Management
- Brand Context Injection
- Token Embedding Utility
- Component Installation Tests
- Tailwind Config Tests
- Package Management API
- Admin Payout Processing
- Condition Intake Forms
- Home Visit Pricing
- User Onboarding Tour
- Google Calendar Integration
- Generator Initialization
- AI Logo Generation
- Token Format Conversion
- Button Styling Tokens
- Animation Duration Tokens
- Project Metadata
- Booking Flow Logic
- Brand Sync Utility
- Token Validator Tests
- Detail Overlay Modals
- Home Visit Package API
- Admin People Directory
- Admin Shell Layout
- FAQ Management
- Testimonial Management
- Input Padding Tokens
- Design System Core
- Account Status Pages
- Appointment Cancellation and Refunds
- Public FAQ Page
- Patient Authentication
- Therapist Payouts
- Color Palette Selection Logic
- Brand Contact Settings
- Condition List Filtering
- Home Visit Purchase Actions
- User Address Management
- Spacing Token 12
- Pain Assessment API
- Brand Settings Configuration
- Supabase Auth Proxy
- Project Documentation
- Design System Tokens
- Spacing Token 2
- Radius Tokens
- Large Spacing Tokens
- Small Spacing Tokens
- Presentation Strategy
- Google OAuth Utilities
- Home Visit Scheduling
- Spacing Token 4
- Extra Large Spacing Tokens
- Empty Value Tokens
- Data Validation Scripts
- Database Schema Runner
- Debug Reset Endpoint
- Hospital Onboarding API
- Partial Refund API
- Patient Profit Analytics
- Brand Token Sync Tests
- Slide Token Validation
- Spacing Token 16
- Foreground Color Tokens
- Muted Foreground Tokens
- Primary Hover Tokens
- Destructive Color Tokens
- Component Installation Tests
- Muted Color Tokens
- Ring Color Tokens
- Installer Initialization
- Test Project Fixtures
- Password Reset Page
- Component Listing Tests
- Project Root Tests
- Dry Run Tests
- Config Existence Tests
- Empty Component Tests
- Empty List Tests
- Font Addition Tests
- Plugin Recommendation Tests
- TypeScript Config Tests
- Custom Color Tests
- Plugin Config Tests
- Content Path Validation
- Theme Extension Validation
- Config Write Tests
- JavaScript Initialization Tests
- Config Content Tests
- Invalid Path Tests
- Full JS Config Tests
- TS Output Path Tests
- Base Structure Tests
- Vue Content Path Tests
- Color Customization Tests
- ESLint Configuration
- Git Hooks
- Next.js Configuration
- PostCSS Configuration
- Supabase Relay Service
- Next.js Development Rules
- Tech Stack Documentation
- Card Component Tokens
- Input Component Tokens
- Token Architecture Layers
- Data Extraction Specification
- Query Reference Documentation
- Graphify Skill Documentation
- GSAP Core Documentation
- GSAP Framework Integration
- GSAP Performance Optimization
- GSAP Plugin Documentation
- GSAP React Integration
- GSAP Timeline Management
- GSAP Utility Functions
- Slides Skill Documentation
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
- Apache License 2.0
- Tailwind CSS Customization
- Tailwind Responsive Design
- Tailwind Utility Reference
- Data Visualization Guidelines
- Graphify Refresh Workflow
- Graphify CLI Tool
- GSAP Scroll Animation
- File System Icon
- Globe Interface Icon
- Next.js Brand Logo
- Spine Anatomical Model
- Vercel Brand Logo
- Window Interface Icon
- SIL Open Font License
- HTML Presentation Template

## God Nodes (most connected - your core abstractions)
1. `createAdminClient()` - 272 edges
2. `getAdminUser()` - 161 edges
3. `createClient()` - 96 edges
4. `parseJsonBody()` - 70 edges
5. `TailwindConfigGenerator` - 58 edges
6. `useConfirm()` - 52 edges
7. `createClient()` - 40 edges
8. `TestTailwindConfigGenerator` - 35 edges
9. `ShadcnInstaller` - 34 edges
10. `recordAdminActivity()` - 33 edges

## Surprising Connections (you probably didn't know these)
- `UI Styling Skill` --references--> `tailwindcss`  [EXTRACTED]
  .claude/skills/ui-styling/SKILL.md → package.json
- `TestTailwindConfigGenerator` --uses--> `TailwindConfigGenerator`  [INFERRED]
  .claude/skills/ui-styling/scripts/tests/test_tailwind_config_gen.py → .claude/skills/ui-styling/scripts/tailwind_config_gen.py
- `TestGeneratedConfigIsValidJs` --uses--> `TailwindConfigGenerator`  [INFERRED]
  .claude/skills/ui-styling/scripts/tests/test_tailwind_config_gen.py → .claude/skills/ui-styling/scripts/tailwind_config_gen.py
- `TestEndToEndCoherence` --uses--> `DesignSystemGenerator`  [INFERRED]
  .claude/skills/ui-ux-pro-max/scripts/tests/test_design_system_mode.py → .claude/skills/ui-ux-pro-max/scripts/design_system.py
- `TestTokenizer` --uses--> `BM25`  [INFERRED]
  .claude/skills/ui-ux-pro-max/scripts/tests/test_core.py → .claude/skills/design/scripts/cip/core.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Design Token Hierarchy** — claude_skills_design_system_references_primitive_tokens_color_scales, claude_skills_design_system_references_semantic_tokens_color_semantics, claude_skills_design_system_references_component_tokens_button_tokens [EXTRACTED 1.00]
- **OFL Licensed Font Collection** — claude_skills_ui_styling_canvas_fonts_boldonse_ofl, claude_skills_ui_styling_canvas_fonts_bricolagegrotesque_ofl, claude_skills_ui_styling_canvas_fonts_crimsonpro_ofl, claude_skills_ui_styling_canvas_fonts_dmmono_ofl, claude_skills_ui_styling_canvas_fonts_ericaone_ofl, claude_skills_ui_styling_canvas_fonts_geistmono_ofl, claude_skills_ui_styling_canvas_fonts_gloock_ofl, claude_skills_ui_styling_canvas_fonts_ibmplexmono_ofl, claude_skills_ui_styling_canvas_fonts_instrumentsans_ofl, claude_skills_ui_styling_canvas_fonts_italiana_ofl, claude_skills_ui_styling_canvas_fonts_jetbrainsmono_ofl, claude_skills_ui_styling_canvas_fonts_jura_ofl, claude_skills_ui_styling_canvas_fonts_librebaskerville_ofl, claude_skills_ui_styling_canvas_fonts_lora_ofl, claude_skills_ui_styling_canvas_fonts_nationalpark_ofl, claude_skills_ui_styling_canvas_fonts_nothingyoucoulddo_ofl, claude_skills_ui_styling_canvas_fonts_outfit_ofl, claude_skills_ui_styling_canvas_fonts_pixelifysans_ofl, claude_skills_ui_styling_canvas_fonts_poiretone_ofl, claude_skills_ui_styling_canvas_fonts_redhatmono_ofl, claude_skills_ui_styling_canvas_fonts_silkscreen_ofl, claude_skills_ui_styling_canvas_fonts_smoochsans_ofl, claude_skills_ui_styling_canvas_fonts_tektur_ofl, claude_skills_ui_styling_canvas_fonts_worksans_ofl, claude_skills_ui_styling_canvas_fonts_youngserif_ofl [EXTRACTED 1.00]
- **OFL Licensed Font Software Collection** — claude_skills_ui_styling_canvas_fonts_boldonse_ofl, claude_skills_ui_styling_canvas_fonts_bricolagegrotesque_ofl, claude_skills_ui_styling_canvas_fonts_geistmono_ofl, claude_skills_ui_styling_canvas_fonts_ibmplexmono_ofl, claude_skills_ui_styling_canvas_fonts_jetbrainsmono_ofl [EXTRACTED 1.00]
- **UI/UX Pro Max Design Intelligence System** — claude_skills_ui_ux_pro_max_skill [EXTRACTED 1.00]
- **UI/UX Intelligence Framework** — claude_skills_ui_ux_pro_max_skill [EXTRACTED]
- **UI Design Ecosystem** — claude_skills_ui_styling_skill, claude_skills_ui_ux_pro_max_skill, ui_styling_shadcn_ui, tailwindcss, ui_styling_canvas_design [INFERRED 0.85]
- **CI/CD Automation & Consistency** — github_workflows_docs_freshness, github_workflows_graphify, github_workflows_schema_apply [INFERRED 0.90]

## Communities (237 total, 92 thin omitted)

### Community 0 - "Admin Account Actions"
Cohesion: 0.05
Nodes (78): POST(), POST(), POST(), POST(), POST(), VALID_ACTIONS, ALLOWED_KEYS, POST() (+70 more)

### Community 1 - "Patient Session Management"
Cohesion: 0.07
Nodes (57): POST(), POST(), POST(), POST(), POST(), POST(), POST(), POST() (+49 more)

### Community 2 - "Admin Dashboard Core"
Cohesion: 0.04
Nodes (43): AdminDashboardPage(), metadata, nowTimestamp(), Body, generatePassword(), POST(), Body, POST() (+35 more)

### Community 3 - "Home Visit Package Forms"
Cohesion: 0.05
Nodes (42): HomeVisitPackage, HomeVisitPackageForm(), inputCls(), DeleteButton(), HomeVisitPackageManager(), inputCls(), Package, PackageCatalogForm() (+34 more)

### Community 4 - "Admin Detail Pages"
Cohesion: 0.08
Nodes (32): metadata, metadata, HospitalDashboardPage(), metadata, STATUS_STYLES, metadata, nowTimestamp(), STATUS_BADGE_STYLES (+24 more)

### Community 5 - "Admin Auth Tests"
Cohesion: 0.08
Nodes (32): ADMIN_ROUTES_DIR, GET_ONLY, signInAsAdmin(), ROOT, card(), leadTimeCard(), leadTimeError(), leadTimeSave() (+24 more)

### Community 6 - "Appointment Assignment API"
Cohesion: 0.09
Nodes (38): POST(), POST(), Body, POST(), POST(), POST(), POST(), POST() (+30 more)

### Community 7 - "Brand Color Palette"
Cohesion: 0.05
Nodes (53): $type, $value, $type, $value, $type, $value, $type, $value (+45 more)

### Community 8 - "Session Filtering UI"
Cohesion: 0.07
Nodes (30): AdminAllSessionsTab(), Category, Person, SavedFilters, selectCls(), SortKey, STATUS_STYLES, Category (+22 more)

### Community 9 - "Core Search Engine"
Cohesion: 0.07
Nodes (42): BM25, detect_domain(), get_cip_brief(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection (+34 more)

### Community 10 - "Slide Search Logic"
Cohesion: 0.08
Nodes (36): format_context(), format_result(), main(), Format a single search result for display, Format contextual recommendations for display., BM25, calculate_pattern_break(), detect_domain() (+28 more)

### Community 11 - "Therapist Roster Management"
Cohesion: 0.09
Nodes (26): AdminRosterTab(), STATE_STYLES, STATE_TITLES, Therapist, todayKey(), setsEqual(), Slot, slotKey() (+18 more)

### Community 12 - "Public Marketing Pages"
Cohesion: 0.09
Nodes (26): Category, ConditionsPage(), metadata, revalidate, ACCENTS, metadata, PATHS, metadata (+18 more)

### Community 13 - "Auth and Global Search"
Cohesion: 0.09
Nodes (14): metadata, metadata, AdminGlobalSearch(), KIND_STYLES, SearchEntity, ADMIN_REALTIME_TABLES, AdminScreens, AdminLoginCard() (+6 more)

### Community 14 - "Admin Feature Settings"
Cohesion: 0.09
Nodes (26): AdminFeatureControlTab(), handleSaveJoinWindow(), handleSaveJoinWindowAfter(), handleSaveLeadTime(), handleSaveRefundHours(), handleSaveTimeout(), handleToggleMeetEnabled(), GoogleMeetSyncIssue (+18 more)

### Community 15 - "Landing Page Components"
Cohesion: 0.09
Nodes (21): PROGRAM_ART, revalidate, TRUST_POINTS, Area, AREAS, CareAreas(), EASE, EASE (+13 more)

### Community 16 - "Booking Wizard Utilities"
Cohesion: 0.11
Nodes (23): AddressForm(), inputCls(), Category, PackageData, DebugNav(), applySimulatedTime(), resetSimulatedTime(), routes (+15 more)

### Community 17 - "Booking Calendar UI"
Cohesion: 0.13
Nodes (25): BookingCalendar(), BookingStepOne(), REVEAL, ChipOption, SelectableChipGroup(), focusChip(), handleKeyDown(), EASE (+17 more)

### Community 18 - "Patient Dashboard UI"
Cohesion: 0.10
Nodes (22): metadata, nowTimestamp(), PatientDashboardPage(), renderAppointmentCard(), STATUS_STYLES, renderHomeVisitCard(), SessionDetailDrawer(), handleCancel() (+14 more)

### Community 19 - "Tailwind Generator Tests"
Cohesion: 0.06
Nodes (16): Test adding colors multiple times., Test adding full color palette., Test adding custom spacing., Test adding custom breakpoints., Test TailwindConfigGenerator class., Test that adding same plugin twice doesn't duplicate., Test plugin recommendations for Next.js., Test initialization with default settings. (+8 more)

### Community 20 - "Design System Generation"
Cohesion: 0.13
Nodes (20): ansi_ljust(), _detect_page_type(), format_ascii_box(), format_master_md(), format_page_override_md(), _generate_intelligent_overrides(), hex_to_ansi(), persist_design_system() (+12 more)

### Community 21 - "Admin Analytics Tabs"
Cohesion: 0.14
Nodes (29): AdminMetricsTab(), setQuickRange(), Category, daysAgo(), formatInr(), formatShortDate(), nowTimestamp(), toDateInputValue() (+21 more)

### Community 22 - "Patient Health Profiles"
Cohesion: 0.13
Nodes (16): metadata, PatientHealthProfilePage(), STATUS_BANNER_STYLE, metadata, TherapistPatientHealthProfilePage(), IntakeQuestionEditor(), QuestionRow(), HealthProfileActions() (+8 more)

### Community 23 - "TypeScript Configuration"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 24 - "Hospital Dashboard Shell"
Cohesion: 0.11
Nodes (20): HospitalProfilePage(), metadata, GRANT_LABEL, GRANT_STYLE, metadata, TherapistHealthProfilesPage(), DashboardShell(), handleIdleTimeout() (+12 more)

### Community 25 - "User Profile Management"
Cohesion: 0.11
Nodes (16): metadata, PatientProfilePage(), metadata, TherapistProfilePage(), AvatarUpload(), handleFileChange(), FieldConfig, FieldStatusMap (+8 more)

### Community 26 - "Booking Action Buttons"
Cohesion: 0.10
Nodes (13): renderAppointmentCard(), DeclineAccountButton(), EditBookingForm(), minDateTimeLocal(), toDateTimeLocalValue(), MarkPaidByCashButton(), Category, ProfileSessionList() (+5 more)

### Community 27 - "CSS Token Validator"
Cohesion: 0.13
Nodes (24): get_context(), is_allowed_exception(), is_allowed_rgba(), is_inside_block(), load_css_variables(), main(), print_result(), print_summary() (+16 more)

### Community 28 - "Registration and Login"
Cohesion: 0.15
Nodes (14): metadata, ROLE_LOGIN_HREF, metadata, ConfirmPasswordField(), EmailField(), InviteRegisterCard(), handleSubmit(), startPayment() (+6 more)

### Community 29 - "Pain Assessment Diagrams"
Cohesion: 0.11
Nodes (22): BodyMapDiagram(), renderDot(), renderFigure(), LatestAssessment, PAIN_DOT_COLOR, REGION_COORDS, PAIN_BAND_STYLE, PainComparisonView() (+14 more)

### Community 30 - "Root Layout Components"
Cohesion: 0.11
Nodes (19): inter, jakarta, metadata, RootLayout(), FarewellBanner(), Footer(), BASE_LINKS, HOME_VISIT_LINK (+11 more)

### Community 31 - "Logo Search Engine"
Cohesion: 0.11
Nodes (19): BM25, detect_domain(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search across all domains and combine results (+11 more)

### Community 32 - "Admin Payment History"
Cohesion: 0.14
Nodes (23): AdminPaymentHistoryTab(), AdminReceiptRow, Category, formatDateTime(), formatInr(), Patient, PatientTransactionTable(), RECEIPT_STAGE_LABEL (+15 more)

### Community 33 - "Contact Information Forms"
Cohesion: 0.14
Nodes (17): PatientContactEditForm(), TherapistContactEditForm(), HospitalInquiryForm(), handleSubmit(), SOURCES, PhoneNumberField(), FieldConfig, composePhone() (+9 more)

### Community 34 - "Public Booking Pages"
Cohesion: 0.13
Nodes (18): BookHomeVisitPage(), metadata, revalidate, BookPage(), metadata, revalidate, Home(), metadata (+10 more)

### Community 35 - "Admin Activity Logs"
Cohesion: 0.15
Nodes (17): ActivityRow, AdminActivityLogTab(), describe(), formatWhen(), DownloadCsvButton(), HomeVisitPurchaseRow, HomeVisitPurchasesTable(), STATUS_OPTIONS (+9 more)

### Community 36 - "Entity Status Toggles"
Cohesion: 0.11
Nodes (8): HospitalActiveToggle(), PartialRefundForm(), PatientActiveToggle(), TherapistActiveToggle(), WithdrawReferralButton(), MarkNoShowButton(), TherapistOnLeaveToggle(), useConfirm()

### Community 37 - "Pain Assessment Editor"
Cohesion: 0.13
Nodes (20): PainMapQuestionEditor(), QuestionRow(), QuestionBankManager(), PainAssessmentForm(), handleDiagramSelect(), resetForRegion(), GENERIC_QUESTIONS, GENERIC_TEXT (+12 more)

### Community 38 - "Spacing Design Tokens"
Cohesion: 0.09
Nodes (22): $type, $value, $type, $value, $type, $value, $type, $value (+14 more)

### Community 39 - "Tailwind Config Logic"
Cohesion: 0.10
Nodes (12): main(), Add custom font families. Args: fonts: Dict of font_type: [font_names] e.g.,…, Add custom spacing values. Args: spacing: Dict of name: value e.g., {'18':…, Add custom breakpoints. Args: breakpoints: Dict of name: width e.g., {'3xl':…, Add plugin requirements. Args: plugins: List of plugin names e.g.,…, Get plugin recommendations based on configuration. Returns: List of recommended…, Generate Tailwind CSS configuration files., Validate configuration. Returns: Tuple of (valid, message) (+4 more)

### Community 40 - "Search Core Utilities"
Cohesion: 0.12
Nodes (18): _domain_keywords(), _get_bm25(), _load_csv(), _load_product_keywords(), Load CSV and return list of dicts, with mtime-based caching., Fitted BM25 index for this file+columns, with mtime-based caching., Core search function using BM25. Returns (results, bm25_or_none)., Nearest known vocabulary terms for a query that returned 0 hits, so the caller… (+10 more)

### Community 41 - "Design System Recommendations"
Cohesion: 0.13
Nodes (12): DesignSystemGenerator, Generates design system recommendations from aggregated searches., Load reasoning rules from CSV., Execute searches across multiple domains., Find matching reasoning rule for a category., Apply reasoning rules to search results., Select best matching result based on priority keywords., Extract results list from search result dict. (+4 more)

### Community 42 - "Admin Calendar Views"
Cohesion: 0.12
Nodes (13): AdminCalendarTab(), todayKey(), BOOKING_FROM_DASHBOARD, BookingBackToSessions(), PatientMonthMotivation(), BUCKET_DOT_COLOR, BUCKET_FILL_STYLE, CalendarSession (+5 more)

### Community 43 - "Project Dependencies"
Cohesion: 0.10
Nodes (21): @fortawesome/fontawesome-free, googleapis, libphonenumber-js, motion, next, dependencies, @fortawesome/fontawesome-free, googleapis (+13 more)

### Community 44 - "Slide Deck Generation"
Cohesion: 0.15
Nodes (19): _e(), generate_chart_slide(), generate_cta_slide(), generate_deck(), generate_metrics_slide(), generate_problem_slide(), generate_solution_slide(), generate_testimonial_slide() (+11 more)

### Community 45 - "Patient Receipt Management"
Cohesion: 0.13
Nodes (18): formatDateHeading(), formatDateTime(), formatInr(), ReceiptsSection(), STAGE_LABEL, STAGE_PILL_STYLE, BookingReceipt, BookingReceiptStage (+10 more)

### Community 46 - "Semantic Color Tokens"
Cohesion: 0.11
Nodes (19): $type, $value, background, destructive-foreground, primary, primary-foreground, secondary, secondary-foreground (+11 more)

### Community 47 - "Color Mode Logic"
Cohesion: 0.16
Nodes (10): _filter_anti_patterns_for_mode(), _query_wants_dark(), True when a styles.csv row describes itself as dark-first., True when the query explicitly asks for a dark theme., Resolve the mode the rest of the output has to agree with., Drop "avoid dark mode" advice once dark mode is the resolved answer., _resolve_color_mode(), _style_is_dark_primary() (+2 more)

### Community 48 - "Background Image Fetcher"
Cohesion: 0.17
Nodes (17): generate_css_for_background(), get_background_image(), get_curated_images(), get_overlay_css(), get_pexels_search_url(), load_backgrounds_config(), load_brand_colors(), main() (+9 more)

### Community 49 - "Therapist Payout Ledger"
Cohesion: 0.19
Nodes (15): IMPLEMENTED_METHODS, POST(), formatInr(), HomeVisitCashLedger(), MarkRefundReturnedButton(), handleClick(), MarkRemittedButton(), handleClick() (+7 more)

### Community 50 - "BM25 Search Algorithm"
Cohesion: 0.15
Nodes (9): BM25, _normalize(), Apply synonym substitution before tokenizing., BM25 ranking algorithm for text search, Lowercase, normalize synonyms, split, remove punctuation, filter stopwords, Build BM25 index from documents, Score all documents against query, All indexed terms, for suggestion/typo-recovery purposes. (+1 more)

### Community 51 - "Development Dependencies"
Cohesion: 0.12
Nodes (17): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, @playwright/test, @tailwindcss/postcss, @types/node (+9 more)

### Community 52 - "Home Visit Settings"
Cohesion: 0.13
Nodes (15): HomeVisitPage(), metadata, revalidate, DEFAULT_BOOKING_LANGUAGES, DEFAULT_CONTACT_EMAIL, DEFAULT_CONTACT_PHONE, DEFAULT_FOOTER_COPYRIGHT_TEXT, DEFAULT_HOME_VISIT_PAGE_HEADING (+7 more)

### Community 53 - "Home Visit Details"
Cohesion: 0.20
Nodes (13): AppointmentRow, DetailResponse, EASE, EventRow, HomeVisitDetailModal(), HomeVisitPackageWidget(), PatientHomeVisitCard, computeHomeVisitCounts() (+5 more)

### Community 54 - "Therapist Earnings UI"
Cohesion: 0.18
Nodes (11): RequestPayoutButton(), EarningsDay, formatInr(), TherapistEarningsChart(), CompletedRequest, dayLabel(), formatDate(), formatInr() (+3 more)

### Community 55 - "SVG Icon Generator"
Cohesion: 0.20
Nodes (15): apply_color(), apply_viewbox_size(), extract_svgs(), generate_batch(), generate_icon(), generate_sizes(), load_env(), main() (+7 more)

### Community 56 - "Typography Design Tokens"
Cohesion: 0.12
Nodes (16): $type, $value, $type, $value, $type, $value, $type, $value (+8 more)

### Community 57 - "Admin Booking Management"
Cohesion: 0.17
Nodes (7): AdminNewBookingTab(), Category, Person, CreateAccountForm(), ApproveAccountButton(), AssignTherapistForm(), useUnloadWarning()

### Community 58 - "Package Payment Integration"
Cohesion: 0.19
Nodes (12): BuyPackageButton(), handleBuy(), PayNowButton(), handlePay(), PackagePaymentResult, payForPackage(), PayForPackageArgs, loadRazorpayScript() (+4 more)

### Community 59 - "Shadcn Installer Tests"
Cohesion: 0.14
Nodes (8): Test adding components in dry run mode., Test ShadcnInstaller class., Test adding all components without config., Test listing installed components without config., Test listing installed components when none exist., Test checking for existing shadcn config., Test getting installed components without config., TestShadcnInstaller

### Community 60 - "Color Contrast Validation"
Cohesion: 0.18
Nodes (7): _palette_is_dark(), WCAG relative luminance of a #RRGGBB string, or None if unparseable., True when a colors.csv row's Background is a dark surface., _relative_luminance(), The exact reproduction from issue #428., TestEndToEndCoherence, TestLuminance

### Community 61 - "Treatment Category Management"
Cohesion: 0.14
Nodes (6): Category, NewCategoryValues, TreatmentCategoryForm(), Category, DeleteButton(), TreatmentCategoryManager()

### Community 62 - "Color Extraction Utility"
Cohesion: 0.22
Nodes (11): calculateCompliance(), colorDistance(), displayPalette(), extractHexColors(), findNearestBrandColor(), fs, generateImageMagickCommand(), hexToRgb() (+3 more)

### Community 63 - "Asset Validation Script"
Cohesion: 0.25
Nodes (13): checkManifest(), formatBytes(), formatOutput(), fs, main(), parseFilename(), path, RULES (+5 more)

### Community 64 - "Radius and Shadow Tokens"
Cohesion: 0.19
Nodes (14): $type, $value, $type, $value, $type, $value, primitive, radius (+6 more)

### Community 65 - "Booking Lead Time Logic"
Cohesion: 0.25
Nodes (12): BOOKING_LEAD_TIME_HOURS, BOOKING_LEAD_TIME_MS, buildCalendarMonth(), CalendarCell, CalendarMonth, earliestBookableDateKey(), isDateBookable(), isSlotBookable() (+4 more)

### Community 66 - "Clinical Assessment Scenes"
Cohesion: 0.18
Nodes (11): BookingScene(), EASE, EXERCISES, FINDINGS, FindingsScene(), PlanScene(), rise, SLOTS (+3 more)

### Community 67 - "Design Token Schema"
Cohesion: 0.15
Nodes (12): component, $type, $value, dark, semantic, $schema, $type, $value (+4 more)

### Community 68 - "Payout Detail Modals"
Cohesion: 0.22
Nodes (9): AppointmentRow, DetailResponse, EventRow, Modal(), formatDateHeading(), formatDateTime(), formatInr(), TherapistPayoutReceiptsSection() (+1 more)

### Community 69 - "Password Reset Actions"
Cohesion: 0.26
Nodes (5): ResetHospitalPasswordButton(), ResetPatientPasswordButton(), ResetTherapistPasswordButton(), formatIST(), IST_FORMATTER

### Community 70 - "Token Validation Script"
Cohesion: 0.24
Nodes (11): extensions, formatReport(), fs, getFiles(), main(), parseArgs(), path, patterns (+3 more)

### Community 71 - "Card Styling Tokens"
Cohesion: 0.15
Nodes (17): $type, $value, $type, $value, bg, bg, border, padding (+9 more)

### Community 72 - "Shadcn CLI Tool"
Cohesion: 0.20
Nodes (7): main(), Handle shadcn/ui component installation., ShadcnInstaller, Tests for shadcn_add.py, Test adding components without shadcn config., Test initialization with custom project root., Test getting installed components when files exist.

### Community 73 - "Shadcn Component Management"
Cohesion: 0.21
Nodes (6): Add all available shadcn/ui components. Args: overwrite: If True, overwrite…, List installed components. Returns: Tuple of (success, message with component…, Check if shadcn is initialized in project. Returns: True if components.json…, Get list of already installed components. Returns: List of installed component…, Read shadcn version from project package.json; fall back to a pinned default., Add shadcn/ui components. Args: components: List of component names to add…

### Community 74 - "Config File Generation"
Cohesion: 0.20
Nodes (6): Generate configuration file content. Returns: Configuration file as string, Generate TypeScript configuration., Generate JavaScript configuration., Format plugins array for config. Validates each plugin name against a strict…, Add indentation to JSON string., Write configuration to file. Returns: Tuple of (success, message)

### Community 75 - "UI Design Guidelines"
Cohesion: 0.17
Nodes (12): UI Styling Skill, UI/UX Pro Max Skill, tailwindcss, tailwindcss, Canvas Design System, Canvas Design System Reference, shadcn/ui Accessibility Patterns, shadcn/ui Component Reference (+4 more)

### Community 76 - "Condition Detail Management"
Cohesion: 0.19
Nodes (6): metadata, ConditionAccessActions(), ConditionDetailContent(), daysSince(), ConditionDirectEditForm(), ConditionRequestActions()

### Community 77 - "Service Area Management"
Cohesion: 0.21
Nodes (9): AreaRow(), handleDelete(), post(), BulkAddForm(), HomeVisitAreaManager(), inputCls(), ServiceAreaRow, WaitlistItem() (+1 more)

### Community 78 - "Brand Context Injection"
Cohesion: 0.31
Nodes (10): extractColorsFromTable(), extractCoreAttributes(), extractHexColors(), extractImageStyle(), extractTypography(), extractVoice(), fs, generatePromptAddition() (+2 more)

### Community 79 - "Token Embedding Utility"
Cohesion: 0.18
Nodes (8): args, fs, minimal, MINIMAL_TOKENS, path, projectRoot, tokensPath, wrapStyle

### Community 80 - "Component Installation Tests"
Cohesion: 0.18
Nodes (6): Test adding components with overwrite flag., Test successful component addition., Test component addition with subprocess error., Test component addition when npx is not found., Test successful addition of all components., patch

### Community 81 - "Tailwind Config Tests"
Cohesion: 0.22
Nodes (8): Tests for tailwind_config_gen.py, Reduce a generated TS/JS config to a bare assignable object so it can be handed…, Regression guard for the missing-comma bug between the ``theme`` block and…, The property preceding ``plugins`` must end with a comma (pure-Python check, so…, The emitted config parses as valid JS via ``node --check``., _strip_to_object(), TestGeneratedConfigIsValidJs, parametrize

### Community 82 - "Package Management API"
Cohesion: 0.31
Nodes (8): POST(), POST(), PackageColumns, PackagePayload, parseOptionalPositiveInt(), THERAPIST_RATE_BASIS_VALUES, TherapistRateBasis, validatePackagePayload()

### Community 83 - "Admin Payout Processing"
Cohesion: 0.25
Nodes (6): AdminPayoutRequestsTab(), formatDateTime(), formatInr(), PayoutRequestRow, CompletePayoutRequestButton(), StartReviewPayoutRequestButton()

### Community 84 - "Condition Intake Forms"
Cohesion: 0.23
Nodes (12): AreaPainPicker(), remove(), toggle(), updateNote(), updatePain(), regionLabel(), ConditionIntakeForm(), handleSubmit() (+4 more)

### Community 85 - "Home Visit Pricing"
Cohesion: 0.20
Nodes (7): HomeVisitBookingWizard(), goToStep2(), handleJoinWaitlist(), primeSlotDefaults(), inputCls(), computeHomeVisitTotal(), HomeVisitTotal

### Community 86 - "User Onboarding Tour"
Cohesion: 0.24
Nodes (8): OnboardingTour(), finish(), goToCta(), markSeen(), next(), Rect, Step, STEPS

### Community 87 - "Google Calendar Integration"
Cohesion: 0.35
Nodes (10): CalendarEventInput, createSessionCalendarEvent(), createSessionMeetEvent(), deleteSessionMeetEvent(), getCalendarClient(), logCalendarError(), normalizeTimezone(), SessionEventInput (+2 more)

### Community 88 - "Generator Initialization"
Cohesion: 0.22
Nodes (6): Any, Path, Initialize generator. Args: typescript: If True, generate .ts config, else .js…, Determine default output path., Create base configuration structure., Get default content paths for framework.

### Community 89 - "AI Logo Generation"
Cohesion: 0.29
Nodes (9): enhance_prompt(), generate_batch(), generate_logo(), load_env(), main(), Enhance the logo prompt with style and industry modifiers, Generate a logo using Gemini models with image generation Args: aspect_ratio:…, Generate multiple logo variants with different styles (+1 more)

### Community 90 - "Token Format Conversion"
Cohesion: 0.36
Nodes (9): flattenTokens(), fs, generateCSS(), generateTailwind(), main(), parseArgs(), path, resolveReference() (+1 more)

### Community 91 - "Button Styling Tokens"
Cohesion: 0.20
Nodes (10): fg, font-size, hover-bg, button, $type, $value, $type, $value (+2 more)

### Community 92 - "Animation Duration Tokens"
Cohesion: 0.20
Nodes (10): fast, normal, slow, $type, $value, $type, $value, duration (+2 more)

### Community 93 - "Project Metadata"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, lint, start, test:e2e (+1 more)

### Community 94 - "Booking Flow Logic"
Cohesion: 0.24
Nodes (7): BookingWizard(), goToStep3(), handleDateChange(), handleSubmit(), startPayment(), formatInr(), bookableHoursForDate()

### Community 95 - "Brand Sync Utility"
Cohesion: 0.33
Nodes (8): adjustBrightness(), { execFileSync }, extractColorsFromMarkdown(), fs, generateColorScale(), main(), path, updateDesignTokens()

### Community 96 - "Token Validator Tests"
Cohesion: 0.28
Nodes (8): Path, Regression tests for validate-tokens.cjs. The validator used to skip any line…, A hardcoded hex on the same line as a var() token is still a violation., A line that references only tokens produces no false positives., _run(), test_flags_hardcoded_hex_sharing_line_with_token(), test_token_only_line_reports_no_violation(), CompletedProcess

### Community 98 - "Home Visit Package API"
Cohesion: 0.42
Nodes (6): POST(), POST(), HomeVisitPackageColumns, HomeVisitPackagePayload, parseOptionalPositiveInt(), validateHomeVisitPackagePayload()

### Community 99 - "Admin People Directory"
Cohesion: 0.28
Nodes (6): AdminPeopleDirectory(), CARE_STATUS_LABELS, CARE_STATUS_STYLES, Person, AvatarThumbnail(), initialsOf()

### Community 100 - "Admin Shell Layout"
Cohesion: 0.28
Nodes (7): AdminShell(), applyFromLocation(), handleSignOut(), navigate(), renderNavItem(), sectionBadge(), findTab()

### Community 101 - "FAQ Management"
Cohesion: 0.25
Nodes (5): Faq, FaqForm(), DeleteButton(), Faq, FaqManager()

### Community 102 - "Testimonial Management"
Cohesion: 0.25
Nodes (5): Testimonial, TestimonialForm(), DeleteButton(), Testimonial, TestimonialManager()

### Community 103 - "Input Padding Tokens"
Cohesion: 0.20
Nodes (12): padding-x, padding-y, input, $type, $value, focus-ring, padding-x, padding-y (+4 more)

### Community 104 - "Design System Core"
Cohesion: 0.19
Nodes (8): detect_domain(), Auto-detect the most relevant domain from query. Matches are weighted by…, format_markdown(), generate_design_system(), Format design system as markdown., Main entry point for design system generation. Args: query: Search query (e.g.,…, TestDomainDetection, TestPersistence

### Community 105 - "Account Status Pages"
Cohesion: 0.32
Nodes (4): metadata, metadata, PendingApprovalPage(), SUPPORT_EMAIL

### Community 106 - "Appointment Cancellation and Refunds"
Cohesion: 0.39
Nodes (5): POST(), POST(), cancelAppointmentAndRefund(), CancelResult, deleteMeetEventForAppointment()

### Community 107 - "Public FAQ Page"
Cohesion: 0.29
Nodes (6): Faq, FaqPage(), metadata, revalidate, Faq, FaqAccordion()

### Community 108 - "Patient Authentication"
Cohesion: 0.25
Nodes (4): metadata, PatientAuthCard(), handleReferralCodeBlur(), handleRegister()

### Community 109 - "Therapist Payouts"
Cohesion: 0.25
Nodes (5): METHOD_LABEL, NOTE_PLACEHOLDER, PayoutMethod, TherapistPayoutButton(), View

### Community 110 - "Color Palette Selection Logic"
Cohesion: 0.43
Nodes (3): Pick the highest-ranked palette matching the resolved mode. Only the dark case…, _select_palette_for_mode(), TestPaletteSelection

### Community 111 - "Brand Contact Settings"
Cohesion: 0.33
Nodes (5): BrandContactDetails, BrandContactDetailsForm(), EditableField(), handleSave(), saveSetting()

### Community 112 - "Condition List Filtering"
Cohesion: 0.29
Nodes (6): CONDITION_STATUS_LABEL, CONDITION_STATUS_STYLE, ConditionsListFilter(), Row, SortKey, STATUS_OPTIONS

### Community 113 - "Home Visit Purchase Actions"
Cohesion: 0.52
Nodes (7): HomeVisitPurchaseDetailModal(), handleExtendExpiry(), handleReassign(), handleRefund(), handleRestore(), refetch(), runAction()

### Community 114 - "User Address Management"
Cohesion: 0.33
Nodes (4): AddressForm(), inputCls(), MyAddresses(), SavedAddress

### Community 115 - "Spacing Token 12"
Cohesion: 0.67
Nodes (3): $type, $value, 12

### Community 116 - "Pain Assessment API"
Cohesion: 0.47
Nodes (4): AnswerInput, POST(), POST(), isPainMapRegion()

### Community 117 - "Brand Settings Configuration"
Cohesion: 0.33
Nodes (5): ALLOWED_COLUMNS, BRAND_TEXT_FIELDS, CONTACT_FIELDS, HOME_VISIT_COPY_FIELDS, LONG_TEXT_FIELDS

### Community 118 - "Supabase Auth Proxy"
Cohesion: 0.47
Nodes (3): updateSession(), config, proxy()

### Community 119 - "Project Documentation"
Cohesion: 0.40
Nodes (5): AGENTS Documentation, CLAUDE Documentation, Docs Freshness Workflow, Supabase Schema Apply Workflow, README Documentation

### Community 120 - "Design System Tokens"
Cohesion: 0.40
Nodes (5): Button Tokens, Color Scales, Color Semantics, Interactive States, Tailwind Configuration

### Community 121 - "Spacing Token 2"
Cohesion: 0.67
Nodes (3): $type, $value, 2

### Community 122 - "Radius Tokens"
Cohesion: 0.60
Nodes (5): radius, radius, radius, $type, $value

### Community 123 - "Large Spacing Tokens"
Cohesion: 0.60
Nodes (5): lg, $type, $value, lg, lg

### Community 124 - "Small Spacing Tokens"
Cohesion: 0.60
Nodes (5): sm, sm, sm, $type, $value

### Community 125 - "Presentation Strategy"
Cohesion: 0.40
Nodes (5): Duarte Sparkline Pattern, Product Demo, Sales Pitch, Slide Strategies, YC Seed Deck

### Community 126 - "Google OAuth Utilities"
Cohesion: 0.40
Nodes (3): authUrl, oauth2Client, server

### Community 127 - "Home Visit Scheduling"
Cohesion: 0.60
Nodes (4): HomeVisitBulkScheduler(), handleSubmit(), toggleHour(), slotDateTimeOf()

### Community 128 - "Spacing Token 4"
Cohesion: 0.67
Nodes (3): $type, $value, 4

### Community 129 - "Extra Large Spacing Tokens"
Cohesion: 0.67
Nodes (4): xl, xl, $type, $value

### Community 130 - "Empty Value Tokens"
Cohesion: 0.67
Nodes (4): $type, $value, none, none

### Community 131 - "Data Validation Scripts"
Cohesion: 0.83
Nodes (3): _check_file(), main(), _read_rows()

### Community 133 - "Debug Reset Endpoint"
Cohesion: 0.50
Nodes (3): Body, CONFIRMATION_PHRASE, POST()

### Community 134 - "Hospital Onboarding API"
Cohesion: 0.83
Nodes (3): generatePassword(), generateReferralCode(), POST()

### Community 135 - "Partial Refund API"
Cohesion: 0.67
Nodes (3): Body, POST(), requireAdminScope()

### Community 136 - "Patient Profit Analytics"
Cohesion: 0.67
Nodes (3): formatInr(), PatientProfitChart(), ProfitSession

### Community 139 - "Spacing Token 16"
Cohesion: 0.67
Nodes (3): $type, $value, 16

### Community 140 - "Foreground Color Tokens"
Cohesion: 0.67
Nodes (3): foreground, $type, $value

### Community 141 - "Muted Foreground Tokens"
Cohesion: 0.67
Nodes (3): muted-foreground, $type, $value

### Community 142 - "Primary Hover Tokens"
Cohesion: 0.67
Nodes (3): primary-hover, $type, $value

### Community 143 - "Destructive Color Tokens"
Cohesion: 0.67
Nodes (3): destructive, $type, $value

### Community 145 - "Muted Color Tokens"
Cohesion: 0.67
Nodes (3): muted, $type, $value

### Community 147 - "Ring Color Tokens"
Cohesion: 0.67
Nodes (3): ring, $type, $value

## Knowledge Gaps
- **575 isolated node(s):** `Body`, `AdminActivityAction`, `AdminActivityEntry`, `AdminContext`, `AnswerInput` (+570 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **92 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createAdminClient()` connect `Admin Account Actions` to `Patient Session Management`, `Admin Dashboard Core`, `Home Visit Package API`, `Admin Detail Pages`, `Debug Reset Endpoint`, `Appointment Assignment API`, `Hospital Onboarding API`, `Partial Refund API`, `Pain Assessment Editor`, `Appointment Cancellation and Refunds`, `Condition Detail Management`, `Therapist Payout Ledger`, `Package Management API`, `Patient Dashboard UI`, `Pain Assessment API`, `Brand Settings Configuration`, `Patient Health Profiles`, `Hospital Dashboard Shell`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Patient Session Management` to `Admin Account Actions`, `Admin Dashboard Core`, `Admin Detail Pages`, `Appointment Assignment API`, `Account Status Pages`, `Patient Dashboard UI`, `Patient Health Profiles`, `Hospital Dashboard Shell`, `User Profile Management`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Auth and Global Search` to `Contact Information Forms`, `Admin Shell Layout`, `Patient Authentication`, `Booking Wizard Utilities`, `Root Layout Components`, `Home Visit Pricing`, `Password Reset Page`, `Hospital Dashboard Shell`, `User Profile Management`, `Registration and Login`, `Booking Flow Logic`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `TailwindConfigGenerator` (e.g. with `TestGeneratedConfigIsValidJs` and `TestTailwindConfigGenerator`) actually correct?**
  _`TailwindConfigGenerator` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Body`, `AdminActivityAction`, `AdminActivityEntry` to the rest of the system?**
  _575 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Account Actions` be split into smaller, more focused modules?**
  _Cohesion score 0.04654879632404355 - nodes in this community are weakly interconnected._
- **Should `Patient Session Management` be split into smaller, more focused modules?**
  _Cohesion score 0.06564275194613928 - nodes in this community are weakly interconnected._