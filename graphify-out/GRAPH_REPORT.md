# Graph Report - .  (2026-08-11)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1997 nodes · 4054 edges · 176 communities (109 shown, 67 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 39 edges (avg confidence: 0.56)
- Token cost: 6,884 input · 1,991 output

## Graph Freshness
- Built from commit: `2e66bfc5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Admin Account Actions
- Therapist Roster Scheduling
- Admin Calendar Management
- Color Palette Tokens
- Payment History Tracking
- Patient Booking Operations
- Project Dependencies
- Admin Detail Pages
- Slide Search Logic
- User Dashboard Shells
- Domain Search Core
- Admin Dashboard Management
- Spacing Design Tokens
- Admin Management Modals
- Tailwind Generator Tests
- Admin Analytics Metrics
- TypeScript Configuration
- Appointment Management API
- HTML Token Validator
- Root Layout Components
- Auth Login Pages
- Admin Auth Tabs
- Package Detail Modals
- Logo Search Logic
- Script Search Core
- Landing Page Sections
- Color Luminance Testing
- Tailwind Config Generator
- Public Directory Pages
- User Profile Management
- Design System Formatting
- Payment and Sync API
- Slide Generation Logic
- Design System Reasoning
- Theme Color Tokens
- Contact Form Components
- Background Image Fetcher
- BM25 Search Algorithm
- Multi-Domain Search Logic
- Public FAQ Pages
- Icon Generation Utility
- Font Size Tokens
- Therapist Payout Management
- Shadcn Installer Tests
- Color Extraction Utility
- Asset Validation Utility
- Booking Scene UI
- Design Token Schema
- Token Validation Script
- Card Style Tokens
- Shadcn Component Installer
- Shadcn CLI Methods
- Config File Generation
- Admin Action Buttons
- CSV Export Utilities
- Brand Context Injection
- Token Embedding Utility
- Installer Error Tests
- Tailwind Config Tests
- Theme Mode Resolution
- Package Management API
- Marketing Motion Pages
- Team Directory Pages
- Config Generator Init
- Logo Generation Utility
- Token Generation Script
- Button Style Tokens
- Animation Duration Tokens
- Border Radius Tokens
- Package Catalog Management
- Brand Sync Utility
- Text Search Indexing
- Token Validator Tests
- Payout Request Management
- Admin Settings Tabs
- Category Management Forms
- Input Padding Tokens
- Account Status Pages
- Domain Detection Tests
- Appointment Cancellation API
- Interactive Spine Diagram
- Detail Overlay Modals
- Admin Feature Toggles
- People Directory UI
- Border Style Tokens
- Radius Value Tokens
- Large Size Tokens
- Small Size Tokens
- GSAP Animation Skills
- Google Auth Utility
- Supabase Proxy Config
- Token Architecture Docs
- Booking Checkout Flow
- Palette Selection Logic
- Extra Large Tokens
- Empty Value Tokens
- Data Validation Script
- Profile Change API
- Hospital Onboarding API
- Patient Profit Analytics
- Brand Sync Testing
- Slide Token Validation
- Design Token Metadata
- Destructive Foreground Tokens
- Muted Color Tokens
- Primary Foreground Tokens
- Ring Focus Tokens
- Secondary Foreground Tokens
- Graphify Skill Reference
- Installer Initialization
- Project Fixture Setup
- UI/UX Design Guidelines
- Agent Documentation
- Canvas Design System
- Shadcn UI Accessibility
- Tailwind Theme Customization
- Tailwind Responsive Design
- Primary Color Tokens
- Component Listing Tests
- Project Root Tests
- Dry Run Tests
- Config Validation Tests
- Empty Component Tests
- Component Addition Tests
- Font Addition Tests
- Plugin Recommendation Tests
- TypeScript Config Tests
- Custom Color Tests
- Plugin Configuration Tests
- Content Path Tests
- Theme Extension Tests
- Config Writing Tests
- JavaScript Initialization Tests
- Config Content Tests
- Invalid Path Tests
- Full JS Config Tests
- TS Output Path Tests
- Base Config Tests
- Vue Content Tests
- Color Addition Tests
- ESLint Configuration
- Git Hook Scripts
- Next.js Configuration
- PostCSS Configuration
- Slides Skill
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
- UI Styling Skill
- Docs Freshness Workflow
- Graphify Refresh Workflow
- Product Documentation
- Missing Config Tests

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
- `TestEndToEndCoherence` --uses--> `DesignSystemGenerator`  [INFERRED]
  .claude/skills/ui-ux-pro-max/scripts/tests/test_design_system_mode.py → .claude/skills/ui-ux-pro-max/scripts/design_system.py
- `TestLuminance` --uses--> `DesignSystemGenerator`  [INFERRED]
  .claude/skills/ui-ux-pro-max/scripts/tests/test_design_system_mode.py → .claude/skills/ui-ux-pro-max/scripts/design_system.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **UI Styling & Design System Knowledge Base** — claude_skills_ui_styling_references_canvas_design_system, claude_skills_ui_styling_references_shadcn_accessibility, claude_skills_ui_styling_references_shadcn_components, claude_skills_ui_styling_references_shadcn_theming, claude_skills_ui_styling_references_tailwind_customization, claude_skills_ui_styling_references_tailwind_responsive, claude_skills_ui_styling_references_tailwind_utilities [EXTRACTED 0.95]
- **Design Token Architecture Layers** — claude_skills_design_system_references_token_architecture_primitive_tokens, claude_skills_design_system_references_token_architecture_semantic_tokens, claude_skills_design_system_references_token_architecture_component_tokens [EXTRACTED 1.00]
- **OFL Licensed Font Software Collection** — claude_skills_ui_styling_canvas_fonts_boldonse_ofl, claude_skills_ui_styling_canvas_fonts_bricolagegrotesque_ofl, claude_skills_ui_styling_canvas_fonts_geistmono_ofl, claude_skills_ui_styling_canvas_fonts_ibmplexmono_ofl, claude_skills_ui_styling_canvas_fonts_jetbrainsmono_ofl [EXTRACTED 1.00]
- **GSAP Animation Ecosystem** — claude_skills_gsap_core_skill, claude_skills_gsap_frameworks_skill, claude_skills_gsap_react_skill, claude_skills_gsap_scrolltrigger_skill, claude_skills_gsap_timeline_skill [EXTRACTED 1.00]
- **UI Styling & Design System** — claude_skills_ui_styling_references_canvas_design_system, claude_skills_ui_styling_references_shadcn_components, claude_skills_ui_styling_references_shadcn_theming, claude_skills_ui_styling_references_tailwind_utilities [EXTRACTED]
- **UI/UX Intelligence Framework** — claude_skills_ui_ux_pro_max_skill, claude_skills_ui_ux_pro_max_references_pro_rules, claude_skills_ui_ux_pro_max_references_quick_reference [EXTRACTED]

## Communities (176 total, 67 thin omitted)

### Community 0 - "Admin Account Actions"
Cohesion: 0.05
Nodes (54): POST(), POST(), POST(), POST(), POST(), POST(), POST(), POST() (+46 more)

### Community 1 - "Therapist Roster Scheduling"
Cohesion: 0.07
Nodes (54): AdminRosterTab(), STATE_STYLES, STATE_TITLES, Therapist, todayKey(), BookingCalendar(), BookingStepOne(), REVEAL (+46 more)

### Community 2 - "Admin Calendar Management"
Cohesion: 0.05
Nodes (48): AdminCalendarTab(), Category, Person, STATUS_STYLES, todayKey(), AdminSessionStoryTab(), Category, Person (+40 more)

### Community 3 - "Color Palette Tokens"
Cohesion: 0.05
Nodes (53): $type, $value, $type, $value, $type, $value, $type, $value (+45 more)

### Community 4 - "Payment History Tracking"
Cohesion: 0.07
Nodes (47): AdminPaymentHistoryTab(), AdminReceiptRow, Category, formatDateTime(), formatInr(), Patient, PatientTransactionTable(), RECEIPT_STAGE_LABEL (+39 more)

### Community 5 - "Patient Booking Operations"
Cohesion: 0.12
Nodes (27): isoWeekKey(), POST(), SlotResult, POST(), POST(), POST(), POST(), POST() (+19 more)

### Community 6 - "Project Dependencies"
Cohesion: 0.04
Nodes (46): eslint, eslint-config-next, @fortawesome/fontawesome-free, googleapis, libphonenumber-js, motion, next, dependencies (+38 more)

### Community 7 - "Admin Detail Pages"
Cohesion: 0.10
Nodes (29): metadata, metadata, HospitalDashboardPage(), metadata, nowTimestamp(), STATUS_BADGE_STYLES, TherapistDashboardPage(), PatientDetailContent() (+21 more)

### Community 8 - "Slide Search Logic"
Cohesion: 0.08
Nodes (36): format_context(), format_result(), main(), Format a single search result for display, Format contextual recommendations for display., BM25, calculate_pattern_break(), detect_domain() (+28 more)

### Community 9 - "User Dashboard Shells"
Cohesion: 0.09
Nodes (28): metadata, STATUS_STYLES, HospitalProfilePage(), metadata, metadata, nowTimestamp(), PatientDashboardPage(), STATUS_STYLES (+20 more)

### Community 10 - "Domain Search Core"
Cohesion: 0.08
Nodes (37): detect_domain(), get_cip_brief(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search across all domains and combine results (+29 more)

### Community 11 - "Admin Dashboard Management"
Cohesion: 0.09
Nodes (22): AdminDashboardPage(), metadata, nowTimestamp(), AdminPayoutsTab(), ApproveAccountButton(), AssignReferralForm(), minDateTimeLocal(), AssignTherapistForm() (+14 more)

### Community 12 - "Spacing Design Tokens"
Cohesion: 0.06
Nodes (34): $type, $value, $type, $value, $type, $value, $type, $value (+26 more)

### Community 13 - "Admin Management Modals"
Cohesion: 0.11
Nodes (20): Faq, FaqForm(), DeleteButton(), Faq, FaqManager(), PatientActiveToggle(), ResetHospitalPasswordButton(), ResetPatientPasswordButton() (+12 more)

### Community 14 - "Tailwind Generator Tests"
Cohesion: 0.06
Nodes (16): Test adding colors multiple times., Test adding full color palette., Test adding custom breakpoints., Test TailwindConfigGenerator class., Test that adding same plugin twice doesn't duplicate., Test plugin recommendations for Next.js., Test initialization with default settings., Test generating JavaScript configuration. (+8 more)

### Community 15 - "Admin Analytics Metrics"
Cohesion: 0.14
Nodes (28): AdminMetricsTab(), Category, daysAgo(), formatInr(), formatShortDate(), nowTimestamp(), toDateInputValue(), TrendBarChart() (+20 more)

### Community 16 - "TypeScript Configuration"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 17 - "Appointment Management API"
Cohesion: 0.18
Nodes (12): POST(), POST(), POST(), POST(), POST(), findTherapistConflict(), overlaps(), updateMeetEventForAppointment() (+4 more)

### Community 18 - "HTML Token Validator"
Cohesion: 0.13
Nodes (24): get_context(), is_allowed_exception(), is_allowed_rgba(), is_inside_block(), load_css_variables(), main(), print_result(), print_summary() (+16 more)

### Community 19 - "Root Layout Components"
Cohesion: 0.12
Nodes (20): inter, jakarta, metadata, DebugNav(), routes, toLocalInputValue(), FarewellBanner(), Footer() (+12 more)

### Community 20 - "Auth Login Pages"
Cohesion: 0.17
Nodes (12): metadata, metadata, ROLE_LOGIN_HREF, metadata, ConfirmPasswordField(), EmailField(), InviteRegisterCard(), Preview (+4 more)

### Community 21 - "Admin Auth Tabs"
Cohesion: 0.13
Nodes (14): metadata, metadata, ResetPasswordPage(), ADMIN_REALTIME_TABLES, AdminTabs(), TabDef, TabKey, AdminLoginCard() (+6 more)

### Community 22 - "Package Detail Modals"
Cohesion: 0.14
Nodes (19): AppointmentRow, DetailResponse, EventRow, PackagePurchaseDetailModal(), AppointmentRow, DetailResponse, EASE, EventRow (+11 more)

### Community 23 - "Logo Search Logic"
Cohesion: 0.11
Nodes (19): BM25, detect_domain(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search across all domains and combine results (+11 more)

### Community 24 - "Script Search Core"
Cohesion: 0.12
Nodes (18): _domain_keywords(), _get_bm25(), _load_csv(), _load_product_keywords(), Load CSV and return list of dicts, with mtime-based caching., Fitted BM25 index for this file+columns, with mtime-based caching., Core search function using BM25. Returns (results, bm25_or_none)., Nearest known vocabulary terms for a query that returned 0 hits, so the caller… (+10 more)

### Community 25 - "Landing Page Sections"
Cohesion: 0.13
Nodes (17): PROGRAM_ART, revalidate, TRUST_POINTS, Area, AREAS, CareAreas(), EASE, EASE (+9 more)

### Community 26 - "Color Luminance Testing"
Cohesion: 0.18
Nodes (7): _palette_is_dark(), WCAG relative luminance of a #RRGGBB string, or None if unparseable., True when a colors.csv row's Background is a dark surface., _relative_luminance(), The exact reproduction from issue #428., TestEndToEndCoherence, TestLuminance

### Community 27 - "Tailwind Config Generator"
Cohesion: 0.10
Nodes (12): main(), Add custom font families. Args: fonts: Dict of font_type: [font_names] e.g.,…, Add custom spacing values. Args: spacing: Dict of name: value e.g., {'18':…, Add custom breakpoints. Args: breakpoints: Dict of name: width e.g., {'3xl':…, Add plugin requirements. Args: plugins: List of plugin names e.g.,…, Get plugin recommendations based on configuration. Returns: List of recommended…, Generate Tailwind CSS configuration files., Validate configuration. Returns: Tuple of (valid, message) (+4 more)

### Community 28 - "Public Directory Pages"
Cohesion: 0.13
Nodes (16): Category, metadata, revalidate, metadata, PROBLEM, SOLUTION, PublicPackage, SessionPackages() (+8 more)

### Community 29 - "User Profile Management"
Cohesion: 0.19
Nodes (12): metadata, PatientProfilePage(), metadata, TherapistProfilePage(), AvatarUpload(), FieldConfig, FieldStatusMap, GatedProfileFields() (+4 more)

### Community 30 - "Design System Formatting"
Cohesion: 0.12
Nodes (20): ansi_ljust(), _detect_page_type(), format_ascii_box(), format_markdown(), format_master_md(), format_page_override_md(), _generate_intelligent_overrides(), hex_to_ansi() (+12 more)

### Community 31 - "Payment and Sync API"
Cohesion: 0.20
Nodes (15): POST(), POST(), POST(), POST(), createSessionMeetEvent(), deleteSessionMeetEvent(), getCalendarClient(), logCalendarError() (+7 more)

### Community 32 - "Slide Generation Logic"
Cohesion: 0.15
Nodes (19): _e(), generate_chart_slide(), generate_cta_slide(), generate_deck(), generate_metrics_slide(), generate_problem_slide(), generate_solution_slide(), generate_testimonial_slide() (+11 more)

### Community 33 - "Design System Reasoning"
Cohesion: 0.15
Nodes (11): DesignSystemGenerator, generate_design_system(), persist_design_system(), Generates design system recommendations from aggregated searches., Load reasoning rules from CSV., Find matching reasoning rule for a category., Apply reasoning rules to search results., Main entry point for design system generation. Args: query: Search query (e.g.,… (+3 more)

### Community 34 - "Theme Color Tokens"
Cohesion: 0.11
Nodes (19): $type, $value, background, destructive, foreground, muted-foreground, primary-hover, secondary (+11 more)

### Community 35 - "Contact Form Components"
Cohesion: 0.16
Nodes (17): PatientContactEditForm(), TherapistContactEditForm(), HospitalInquiryForm(), SOURCES, PhoneNumberField(), FieldConfig, InstantProfileFields(), composePhone() (+9 more)

### Community 36 - "Background Image Fetcher"
Cohesion: 0.17
Nodes (17): generate_css_for_background(), get_background_image(), get_curated_images(), get_overlay_css(), get_pexels_search_url(), load_backgrounds_config(), load_brand_colors(), main() (+9 more)

### Community 37 - "BM25 Search Algorithm"
Cohesion: 0.15
Nodes (9): BM25, _normalize(), Apply synonym substitution before tokenizing., BM25 ranking algorithm for text search, Lowercase, normalize synonyms, split, remove punctuation, filter stopwords, Build BM25 index from documents, Score all documents against query, All indexed terms, for suggestion/typo-recovery purposes. (+1 more)

### Community 38 - "Multi-Domain Search Logic"
Cohesion: 0.20
Nodes (6): Execute searches across multiple domains., Select best matching result based on priority keywords., Extract results list from search result dict., Generate complete design system recommendation. variance/motion/density are…, Bucket a 1-10 dial value into its tier config. Returns None if value is None., _resolve_dial()

### Community 39 - "Public FAQ Pages"
Cohesion: 0.16
Nodes (13): BookPage(), metadata, revalidate, ConditionsPage(), Faq, FaqPage(), metadata, revalidate (+5 more)

### Community 40 - "Icon Generation Utility"
Cohesion: 0.20
Nodes (15): apply_color(), apply_viewbox_size(), extract_svgs(), generate_batch(), generate_icon(), generate_sizes(), load_env(), main() (+7 more)

### Community 41 - "Font Size Tokens"
Cohesion: 0.12
Nodes (16): $type, $value, $type, $value, $type, $value, $type, $value (+8 more)

### Community 42 - "Therapist Payout Management"
Cohesion: 0.15
Nodes (12): Category, formatInr(), Patient, Therapist, TherapistSessionList(), METHOD_LABEL, NOTE_PLACEHOLDER, PayoutMethod (+4 more)

### Community 43 - "Shadcn Installer Tests"
Cohesion: 0.14
Nodes (8): Test adding components that are already installed., Test adding components in dry run mode., Test ShadcnInstaller class., Test listing installed components without config., Test listing installed components when none exist., Test checking for existing shadcn config., Test getting installed components without config., TestShadcnInstaller

### Community 44 - "Color Extraction Utility"
Cohesion: 0.22
Nodes (11): calculateCompliance(), colorDistance(), displayPalette(), extractHexColors(), findNearestBrandColor(), fs, generateImageMagickCommand(), hexToRgb() (+3 more)

### Community 45 - "Asset Validation Utility"
Cohesion: 0.25
Nodes (13): checkManifest(), formatBytes(), formatOutput(), fs, main(), parseFilename(), path, RULES (+5 more)

### Community 46 - "Booking Scene UI"
Cohesion: 0.18
Nodes (11): BookingScene(), EASE, EXERCISES, FINDINGS, FindingsScene(), PlanScene(), rise, SLOTS (+3 more)

### Community 47 - "Design Token Schema"
Cohesion: 0.15
Nodes (12): component, $type, $value, dark, semantic, $schema, $type, $value (+4 more)

### Community 48 - "Token Validation Script"
Cohesion: 0.24
Nodes (11): extensions, formatReport(), fs, getFiles(), main(), parseArgs(), path, patterns (+3 more)

### Community 49 - "Card Style Tokens"
Cohesion: 0.20
Nodes (12): $type, $value, bg, bg, padding, shadow, card, bg (+4 more)

### Community 50 - "Shadcn Component Installer"
Cohesion: 0.20
Nodes (7): main(), Handle shadcn/ui component installation., ShadcnInstaller, Tests for shadcn_add.py, Test adding all components without config., Test initialization with custom project root., Test getting installed components when files exist.

### Community 51 - "Shadcn CLI Methods"
Cohesion: 0.21
Nodes (6): Add all available shadcn/ui components. Args: overwrite: If True, overwrite…, List installed components. Returns: Tuple of (success, message with component…, Check if shadcn is initialized in project. Returns: True if components.json…, Get list of already installed components. Returns: List of installed component…, Read shadcn version from project package.json; fall back to a pinned default., Add shadcn/ui components. Args: components: List of component names to add…

### Community 52 - "Config File Generation"
Cohesion: 0.20
Nodes (6): Generate configuration file content. Returns: Configuration file as string, Generate TypeScript configuration., Generate JavaScript configuration., Format plugins array for config. Validates each plugin name against a strict…, Add indentation to JSON string., Write configuration to file. Returns: Tuple of (success, message)

### Community 53 - "Admin Action Buttons"
Cohesion: 0.27
Nodes (6): DeclineAccountButton(), MarkPaidByCashButton(), Category, TherapistNotAvailableToggle(), CompleteSessionButton(), ConfirmDialog()

### Community 54 - "CSV Export Utilities"
Cohesion: 0.27
Nodes (8): DownloadCsvButton(), PackagePurchasesTable(), PurchaseRow, STATUS_OPTIONS, CsvColumn, downloadCsv(), escapeCell(), toCsv()

### Community 55 - "Brand Context Injection"
Cohesion: 0.31
Nodes (10): extractColorsFromTable(), extractCoreAttributes(), extractHexColors(), extractImageStyle(), extractTypography(), extractVoice(), fs, generatePromptAddition() (+2 more)

### Community 56 - "Token Embedding Utility"
Cohesion: 0.18
Nodes (8): args, fs, minimal, MINIMAL_TOKENS, path, projectRoot, tokensPath, wrapStyle

### Community 57 - "Installer Error Tests"
Cohesion: 0.18
Nodes (6): Test adding components with overwrite flag., Test successful component addition., Test component addition with subprocess error., Test component addition when npx is not found., Test successful addition of all components., patch

### Community 58 - "Tailwind Config Tests"
Cohesion: 0.22
Nodes (8): Tests for tailwind_config_gen.py, Reduce a generated TS/JS config to a bare assignable object so it can be handed…, Regression guard for the missing-comma bug between the ``theme`` block and…, The property preceding ``plugins`` must end with a comma (pure-Python check, so…, The emitted config parses as valid JS via ``node --check``., _strip_to_object(), TestGeneratedConfigIsValidJs, parametrize

### Community 59 - "Theme Mode Resolution"
Cohesion: 0.16
Nodes (10): _filter_anti_patterns_for_mode(), _query_wants_dark(), True when a styles.csv row describes itself as dark-first., True when the query explicitly asks for a dark theme., Resolve the mode the rest of the output has to agree with., Drop "avoid dark mode" advice once dark mode is the resolved answer., _resolve_color_mode(), _style_is_dark_primary() (+2 more)

### Community 60 - "Package Management API"
Cohesion: 0.31
Nodes (8): POST(), POST(), PackageColumns, PackagePayload, parseOptionalPositiveInt(), THERAPIST_RATE_BASIS_VALUES, TherapistRateBasis, validatePackagePayload()

### Community 61 - "Marketing Motion Pages"
Cohesion: 0.20
Nodes (7): ACCENTS, metadata, PATHS, metadata, OBJECTIONS, FloatingOrbs(), MotionButton()

### Community 62 - "Team Directory Pages"
Cohesion: 0.24
Nodes (8): metadata, revalidate, TeamPage(), Stagger(), EASE, languageList(), TeamTherapist, TeamTherapistPopup()

### Community 63 - "Config Generator Init"
Cohesion: 0.22
Nodes (6): Any, Path, Initialize generator. Args: typescript: If True, generate .ts config, else .js…, Determine default output path., Create base configuration structure., Get default content paths for framework.

### Community 64 - "Logo Generation Utility"
Cohesion: 0.29
Nodes (9): enhance_prompt(), generate_batch(), generate_logo(), load_env(), main(), Enhance the logo prompt with style and industry modifiers, Generate a logo using Gemini models with image generation Args: aspect_ratio:…, Generate multiple logo variants with different styles (+1 more)

### Community 65 - "Token Generation Script"
Cohesion: 0.36
Nodes (9): flattenTokens(), fs, generateCSS(), generateTailwind(), main(), parseArgs(), path, resolveReference() (+1 more)

### Community 66 - "Button Style Tokens"
Cohesion: 0.20
Nodes (10): fg, font-size, hover-bg, button, $type, $value, $type, $value (+2 more)

### Community 67 - "Animation Duration Tokens"
Cohesion: 0.20
Nodes (10): fast, normal, slow, $type, $value, $type, $value, duration (+2 more)

### Community 68 - "Border Radius Tokens"
Cohesion: 0.24
Nodes (10): $type, $value, $type, $value, primitive, radius, shadow, default (+2 more)

### Community 69 - "Package Catalog Management"
Cohesion: 0.31
Nodes (7): inputCls(), Package, PackageCatalogForm(), DeleteButton(), Package, PackageCatalogManager(), computePackageSavings()

### Community 70 - "Brand Sync Utility"
Cohesion: 0.33
Nodes (8): adjustBrightness(), { execFileSync }, extractColorsFromMarkdown(), fs, generateColorScale(), main(), path, updateDesignTokens()

### Community 71 - "Text Search Indexing"
Cohesion: 0.28
Nodes (5): BM25, BM25 ranking algorithm for text search, Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query

### Community 72 - "Token Validator Tests"
Cohesion: 0.28
Nodes (8): Path, Regression tests for validate-tokens.cjs. The validator used to skip any line…, A hardcoded hex on the same line as a var() token is still a violation., A line that references only tokens produces no false positives., _run(), test_flags_hardcoded_hex_sharing_line_with_token(), test_token_only_line_reports_no_violation(), CompletedProcess

### Community 73 - "Payout Request Management"
Cohesion: 0.33
Nodes (6): AdminPayoutRequestsTab(), formatDateTime(), formatInr(), PayoutRequestRow, CompletePayoutRequestButton(), StartReviewPayoutRequestButton()

### Community 74 - "Admin Settings Tabs"
Cohesion: 0.31
Nodes (6): AdminSessionManagerTab(), Package, SubTab, PackageSettingsForm(), saveSetting(), AdminSettings

### Community 75 - "Category Management Forms"
Cohesion: 0.25
Nodes (6): Category, NewCategoryValues, TreatmentCategoryForm(), Category, DeleteButton(), TreatmentCategoryManager()

### Community 76 - "Input Padding Tokens"
Cohesion: 0.20
Nodes (12): padding-x, padding-y, input, $type, $value, focus-ring, padding-x, padding-y (+4 more)

### Community 77 - "Account Status Pages"
Cohesion: 0.32
Nodes (4): metadata, metadata, PendingApprovalPage(), SUPPORT_EMAIL

### Community 78 - "Domain Detection Tests"
Cohesion: 0.43
Nodes (3): detect_domain(), Auto-detect the most relevant domain from query. Matches are weighted by…, TestDomainDetection

### Community 79 - "Appointment Cancellation API"
Cohesion: 0.48
Nodes (4): POST(), POST(), cancelAppointmentAndRefund(), CancelResult

### Community 80 - "Interactive Spine Diagram"
Cohesion: 0.33
Nodes (3): Spine X-ray Diagram, REGIONS, SpineStory()

### Community 82 - "Admin Feature Toggles"
Cohesion: 0.47
Nodes (4): AdminFeatureControlTab(), GoogleMeetSyncIssue, saveSetting(), BookingLanguagesSection()

### Community 83 - "People Directory UI"
Cohesion: 0.47
Nodes (4): AdminPeopleDirectory(), Person, AvatarThumbnail(), initialsOf()

### Community 84 - "Border Style Tokens"
Cohesion: 0.60
Nodes (5): $type, $value, border, border, border

### Community 85 - "Radius Value Tokens"
Cohesion: 0.60
Nodes (5): radius, radius, radius, $type, $value

### Community 86 - "Large Size Tokens"
Cohesion: 0.60
Nodes (5): lg, $type, $value, lg, lg

### Community 87 - "Small Size Tokens"
Cohesion: 0.60
Nodes (5): sm, sm, sm, $type, $value

### Community 88 - "GSAP Animation Skills"
Cohesion: 0.40
Nodes (5): GSAP Core Skill, GSAP Frameworks Skill, GSAP React Skill, GSAP ScrollTrigger Skill, GSAP Timeline Skill

### Community 89 - "Google Auth Utility"
Cohesion: 0.40
Nodes (3): authUrl, oauth2Client, server

### Community 90 - "Supabase Proxy Config"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 91 - "Token Architecture Docs"
Cohesion: 0.83
Nodes (4): Component Tokens, Primitive Tokens, Semantic Tokens, Token Architecture

### Community 92 - "Booking Checkout Flow"
Cohesion: 0.18
Nodes (15): BookingWizard(), Category, formatInr(), PackageData, BuyPackageButton(), PayNowButton(), checkReferralCode(), ReferralCodeCheck (+7 more)

### Community 93 - "Palette Selection Logic"
Cohesion: 0.43
Nodes (3): Pick the highest-ranked palette matching the resolved mode. Only the dark case…, _select_palette_for_mode(), TestPaletteSelection

### Community 94 - "Extra Large Tokens"
Cohesion: 0.67
Nodes (4): xl, xl, $type, $value

### Community 95 - "Empty Value Tokens"
Cohesion: 0.67
Nodes (4): $type, $value, none, none

### Community 96 - "Data Validation Script"
Cohesion: 0.83
Nodes (3): _check_file(), main(), _read_rows()

### Community 98 - "Hospital Onboarding API"
Cohesion: 0.83
Nodes (3): generatePassword(), generateReferralCode(), POST()

### Community 99 - "Patient Profit Analytics"
Cohesion: 0.67
Nodes (3): formatInr(), PatientProfitChart(), ProfitSession

### Community 102 - "Design Token Metadata"
Cohesion: 0.67
Nodes (4): $type, $value, md, md

### Community 103 - "Destructive Foreground Tokens"
Cohesion: 0.67
Nodes (3): destructive-foreground, $type, $value

### Community 104 - "Muted Color Tokens"
Cohesion: 0.67
Nodes (3): muted, $type, $value

### Community 105 - "Primary Foreground Tokens"
Cohesion: 0.67
Nodes (3): primary-foreground, $type, $value

### Community 106 - "Ring Focus Tokens"
Cohesion: 0.67
Nodes (3): ring, $type, $value

### Community 107 - "Secondary Foreground Tokens"
Cohesion: 0.67
Nodes (3): secondary-foreground, $type, $value

### Community 108 - "Graphify Skill Reference"
Cohesion: 0.67
Nodes (3): Extraction Spec, Query Reference, Graphify Skill

### Community 111 - "UI/UX Design Guidelines"
Cohesion: 1.00
Nodes (3): Professional UI Rules & Checklist, UI/UX Quick Reference, UI/UX Pro Max Skill

### Community 117 - "Primary Color Tokens"
Cohesion: 0.67
Nodes (3): primary, $type, $value

## Knowledge Gaps
- **422 isolated node(s):** `Therapist`, `ChipOption`, `Category`, `PackageData`, `Slot` (+417 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **67 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createAdminClient()` connect `Admin Account Actions` to `Profile Change API`, `Hospital Onboarding API`, `Patient Booking Operations`, `Admin Detail Pages`, `User Dashboard Shells`, `Admin Dashboard Management`, `Appointment Cancellation API`, `Appointment Management API`, `Package Management API`, `Payment and Sync API`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Admin Auth Tabs` to `Contact Form Components`, `User Dashboard Shells`, `Root Layout Components`, `Auth Login Pages`, `Booking Checkout Flow`, `User Profile Management`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `SESSION_FEE_PAISE` connect `Admin Detail Pages` to `Admin Account Actions`, `Admin Calendar Management`, `Patient Booking Operations`, `User Dashboard Shells`, `Admin Dashboard Management`, `Admin Analytics Metrics`, `Appointment Management API`, `Admin Action Buttons`, `Landing Page Sections`, `Payment and Sync API`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `TailwindConfigGenerator` (e.g. with `TestGeneratedConfigIsValidJs` and `TestTailwindConfigGenerator`) actually correct?**
  _`TailwindConfigGenerator` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Therapist`, `ChipOption`, `Category` to the rest of the system?**
  _422 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Account Actions` be split into smaller, more focused modules?**
  _Cohesion score 0.04992833253702819 - nodes in this community are weakly interconnected._
- **Should `Therapist Roster Scheduling` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._