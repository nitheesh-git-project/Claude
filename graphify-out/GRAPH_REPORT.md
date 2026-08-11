# Graph Report - .  (2026-08-11)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2000 nodes · 4052 edges · 176 communities (106 shown, 70 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 39 edges (avg confidence: 0.56)
- Token cost: 6,768 input · 2,070 output

## Graph Freshness
- Built from commit: `61a1b477`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Admin Account Actions
- Admin Calendar Management
- Therapist Roster and Booking
- Color Palette Tokens
- Payment and Receipt History
- Patient Session Actions
- Project Dependencies
- User Dashboard Pages
- Slide Search Logic
- Core Search Functions
- Detail Detail Modals
- User Profile Pages
- Admin Management Buttons
- Admin Payout Approvals
- Tailwind Generator Tests
- Admin Analytics Metrics
- TypeScript Configuration
- Package and Session Management
- HTML Token Validator
- Root Layout Components
- Package Detail Modals
- Logo Search Logic
- Domain Search Core
- Landing Page Sections
- Admin Login and Tabs
- Contact Edit Forms
- Spacing Tokens
- Tailwind Config Generator
- Public Marketing Pages
- Auth and Registration
- Design System Generator
- Payment and Calendar Sync
- Booking and Referral Flow
- Slide Generation Logic
- Design System Recommendations
- Semantic Color Tokens
- Color Mode Resolution
- Background Image Generator
- Admin Payout Management
- Card and Border Tokens
- BM25 Search Algorithm
- Multi-Domain Search Logic
- Public FAQ and Booking
- Icon Generation Utility
- Font Size Tokens
- Shadcn Installer Tests
- Luminance and Contrast Logic
- Color Extraction Utility
- Asset Validation Utility
- Border Radius Tokens
- Booking Scene Components
- Design Token Starter
- Token Validation Utility
- Shadcn Component Installer
- Shadcn CLI Methods
- Config File Generation
- Session Action Buttons
- CSV Export Utilities
- Brand Context Injection
- Token Embedding Utility
- Shadcn Installation Tests
- Tailwind Config Tests
- Package Creation Routes
- Marketing Onboarding Pages
- Team Directory Pages
- Config Generator Initialization
- Logo Generation Logic
- Token Generation Utility
- Button Component Tokens
- Animation Duration Tokens
- People Directory Management
- Package Catalog Management
- Brand Token Sync
- Text Search Indexing
- Token Validation Tests
- Admin Session Settings
- Treatment Category Management
- Input Component Tokens
- Account Status Pages
- Patient Login Page
- Palette Selection Logic
- Appointment Cancellation Routes
- Interactive Spine Story
- Admin Feature Controls
- Radius Token Value
- Large Size Token
- Shadow Size Tokens
- GSAP Animation Skills
- Google Auth Utility
- Supabase Proxy Configuration
- Design Token Categories
- Vertical Padding Tokens
- Extra Large Tokens
- Empty Value Tokens
- Data Validation Utility
- Profile Change Approval
- Hospital Onboarding Routes
- Brand Sync Tests
- Slide Token Validator
- Medium Size Token
- Component Installation Tests
- Destructive Color Tokens
- Foreground Color Tokens
- Muted Foreground Tokens
- Primary Color Tokens
- Primary Hover Tokens
- Focus Ring Tokens
- Data Extraction Skills
- Installer Initialization
- Project Fixture Setup
- UI/UX Design Guidelines
- Agent Documentation
- Design Token Architecture
- Canvas Design System
- Accessibility Patterns
- Tailwind Customization
- Config Validation Tests
- Component Listing Tests
- Project Root Tests
- Dry Run Tests
- Config Existence Tests
- Empty Component Tests
- Font Addition Tests
- Plugin Recommendation Tests
- TypeScript Config Tests
- Color Generation Tests
- Plugin Generation Tests
- Content Path Tests
- Theme Extension Tests
- File Writing Tests
- JavaScript Init Tests
- Config Content Tests
- Invalid Path Tests
- Full JS Config Tests
- TS Output Path Tests
- Base Structure Tests
- Vue Content Tests
- Custom Color Tests
- ESLint Configuration
- Git Hook Scripts
- Next.js Configuration
- PostCSS Configuration
- Naming Conventions
- Presentation Skills
- Bricolage Font License
- Crimson Pro License
- DM Mono License
- Erica One License
- Geist Mono License
- Gloock Font License
- IBM Plex License
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
- Red Hat License
- Silkscreen Font License
- Smooch Sans License
- Tektur Font License
- Work Sans License
- Young Serif License
- Responsive Design Reference
- Tailwind Utility Reference
- UI Styling Skills
- Documentation Workflows
- Graph Refresh Workflows
- Product Documentation

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
- `TestTokenizer` --uses--> `DesignSystemGenerator`  [INFERRED]
  .claude/skills/ui-ux-pro-max/scripts/tests/test_core.py → .claude/skills/ui-ux-pro-max/scripts/design_system.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **OFL Licensed Font Collection** — claude_skills_ui_styling_canvas_fonts_boldonse_ofl, claude_skills_ui_styling_canvas_fonts_bricolagegrotesque_ofl, claude_skills_ui_styling_canvas_fonts_crimsonpro_ofl, claude_skills_ui_styling_canvas_fonts_dmmono_ofl, claude_skills_ui_styling_canvas_fonts_ericaone_ofl, claude_skills_ui_styling_canvas_fonts_geistmono_ofl, claude_skills_ui_styling_canvas_fonts_gloock_ofl, claude_skills_ui_styling_canvas_fonts_ibmplexmono_ofl, claude_skills_ui_styling_canvas_fonts_instrumentsans_ofl, claude_skills_ui_styling_canvas_fonts_italiana_ofl, claude_skills_ui_styling_canvas_fonts_jetbrainsmono_ofl, claude_skills_ui_styling_canvas_fonts_jura_ofl, claude_skills_ui_styling_canvas_fonts_librebaskerville_ofl, claude_skills_ui_styling_canvas_fonts_lora_ofl, claude_skills_ui_styling_canvas_fonts_nationalpark_ofl, claude_skills_ui_styling_canvas_fonts_nothingyoucoulddo_ofl, claude_skills_ui_styling_canvas_fonts_outfit_ofl, claude_skills_ui_styling_canvas_fonts_pixelifysans_ofl, claude_skills_ui_styling_canvas_fonts_poiretone_ofl, claude_skills_ui_styling_canvas_fonts_redhatmono_ofl, claude_skills_ui_styling_canvas_fonts_silkscreen_ofl, claude_skills_ui_styling_canvas_fonts_smoochsans_ofl, claude_skills_ui_styling_canvas_fonts_tektur_ofl, claude_skills_ui_styling_canvas_fonts_worksans_ofl, claude_skills_ui_styling_canvas_fonts_youngserif_ofl [EXTRACTED 1.00]
- **OFL Licensed Font Software Collection** — claude_skills_ui_styling_canvas_fonts_boldonse_ofl, claude_skills_ui_styling_canvas_fonts_bricolagegrotesque_ofl, claude_skills_ui_styling_canvas_fonts_geistmono_ofl, claude_skills_ui_styling_canvas_fonts_ibmplexmono_ofl, claude_skills_ui_styling_canvas_fonts_jetbrainsmono_ofl [EXTRACTED 1.00]
- **GSAP Animation Ecosystem** — claude_skills_gsap_core_skill, claude_skills_gsap_frameworks_skill, claude_skills_gsap_react_skill, claude_skills_gsap_scrolltrigger_skill, claude_skills_gsap_timeline_skill [EXTRACTED 1.00]
- **Three-Layer Token System** — claude_skills_design_system_references_token_architecture_primitive_tokens, claude_skills_design_system_references_token_architecture_semantic_tokens, claude_skills_design_system_references_token_architecture_component_tokens [EXTRACTED 1.00]
- **UI Styling & Design System Knowledge** — claude_skills_ui_styling_references_canvas_design_system, claude_skills_ui_styling_references_shadcn_accessibility, claude_skills_ui_styling_references_shadcn_components, claude_skills_ui_styling_references_shadcn_theming, claude_skills_ui_styling_references_tailwind_customization, claude_skills_ui_styling_references_tailwind_responsive, claude_skills_ui_styling_references_tailwind_utilities [EXTRACTED 1.00]
- **UI Styling & Design System** — claude_skills_ui_styling_references_canvas_design_system, claude_skills_ui_styling_references_shadcn_components, claude_skills_ui_styling_references_shadcn_theming, claude_skills_ui_styling_references_tailwind_utilities [EXTRACTED]
- **UI/UX Intelligence Framework** — claude_skills_ui_ux_pro_max_skill, claude_skills_ui_ux_pro_max_references_pro_rules, claude_skills_ui_ux_pro_max_references_quick_reference [EXTRACTED]

## Communities (176 total, 70 thin omitted)

### Community 0 - "Admin Account Actions"
Cohesion: 0.05
Nodes (54): POST(), POST(), POST(), POST(), POST(), POST(), POST(), POST() (+46 more)

### Community 1 - "Admin Calendar Management"
Cohesion: 0.05
Nodes (48): AdminCalendarTab(), Category, Person, STATUS_STYLES, todayKey(), AdminSessionStoryTab(), Category, Person (+40 more)

### Community 2 - "Therapist Roster and Booking"
Cohesion: 0.07
Nodes (54): AdminRosterTab(), STATE_STYLES, STATE_TITLES, Therapist, todayKey(), BookingCalendar(), BookingStepOne(), REVEAL (+46 more)

### Community 3 - "Color Palette Tokens"
Cohesion: 0.05
Nodes (53): $type, $value, $type, $value, $type, $value, $type, $value (+45 more)

### Community 4 - "Payment and Receipt History"
Cohesion: 0.07
Nodes (47): AdminPaymentHistoryTab(), AdminReceiptRow, Category, formatDateTime(), formatInr(), Patient, PatientTransactionTable(), RECEIPT_STAGE_LABEL (+39 more)

### Community 5 - "Patient Session Actions"
Cohesion: 0.12
Nodes (27): isoWeekKey(), POST(), SlotResult, POST(), POST(), POST(), POST(), POST() (+19 more)

### Community 6 - "Project Dependencies"
Cohesion: 0.04
Nodes (46): eslint, eslint-config-next, @fortawesome/fontawesome-free, googleapis, libphonenumber-js, motion, next, dependencies (+38 more)

### Community 7 - "User Dashboard Pages"
Cohesion: 0.11
Nodes (30): AdminDashboardPage(), HospitalDashboardPage(), metadata, STATUS_STYLES, metadata, nowTimestamp(), PatientDashboardPage(), STATUS_STYLES (+22 more)

### Community 8 - "Slide Search Logic"
Cohesion: 0.08
Nodes (36): format_context(), format_result(), main(), Format a single search result for display, Format contextual recommendations for display., BM25, calculate_pattern_break(), detect_domain() (+28 more)

### Community 9 - "Core Search Functions"
Cohesion: 0.08
Nodes (37): detect_domain(), get_cip_brief(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search across all domains and combine results (+29 more)

### Community 10 - "Detail Detail Modals"
Cohesion: 0.09
Nodes (21): metadata, metadata, DetailOverlayModal(), PatientDetailContent(), PatientNotesForm(), formatInr(), PatientProfitChart(), ProfitSession (+13 more)

### Community 11 - "User Profile Pages"
Cohesion: 0.12
Nodes (25): HospitalProfilePage(), metadata, metadata, PatientProfilePage(), metadata, TherapistProfilePage(), DashboardShell(), ShellNavItem (+17 more)

### Community 12 - "Admin Management Buttons"
Cohesion: 0.10
Nodes (22): CompletePayoutRequestButton(), Faq, FaqForm(), DeleteButton(), Faq, FaqManager(), PatientActiveToggle(), ResetHospitalPasswordButton() (+14 more)

### Community 13 - "Admin Payout Approvals"
Cohesion: 0.09
Nodes (20): metadata, nowTimestamp(), AdminPayoutRequestsTab(), formatDateTime(), formatInr(), PayoutRequestRow, ApproveAccountButton(), AssignReferralForm() (+12 more)

### Community 14 - "Tailwind Generator Tests"
Cohesion: 0.06
Nodes (16): Test adding colors multiple times., Test adding full color palette., Test adding custom breakpoints., Test TailwindConfigGenerator class., Test that adding same plugin twice doesn't duplicate., Test plugin recommendations for Next.js., Test initialization with default settings., Test generating JavaScript configuration. (+8 more)

### Community 15 - "Admin Analytics Metrics"
Cohesion: 0.14
Nodes (28): AdminMetricsTab(), Category, daysAgo(), formatInr(), formatShortDate(), nowTimestamp(), toDateInputValue(), TrendBarChart() (+20 more)

### Community 16 - "TypeScript Configuration"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 17 - "Package and Session Management"
Cohesion: 0.18
Nodes (12): POST(), POST(), POST(), POST(), POST(), findTherapistConflict(), overlaps(), updateMeetEventForAppointment() (+4 more)

### Community 18 - "HTML Token Validator"
Cohesion: 0.13
Nodes (24): get_context(), is_allowed_exception(), is_allowed_rgba(), is_inside_block(), load_css_variables(), main(), print_result(), print_summary() (+16 more)

### Community 19 - "Root Layout Components"
Cohesion: 0.12
Nodes (20): inter, jakarta, metadata, DebugNav(), routes, toLocalInputValue(), FarewellBanner(), Footer() (+12 more)

### Community 20 - "Package Detail Modals"
Cohesion: 0.14
Nodes (19): AppointmentRow, DetailResponse, EventRow, PackagePurchaseDetailModal(), AppointmentRow, DetailResponse, EASE, EventRow (+11 more)

### Community 21 - "Logo Search Logic"
Cohesion: 0.11
Nodes (19): BM25, detect_domain(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search across all domains and combine results (+11 more)

### Community 22 - "Domain Search Core"
Cohesion: 0.14
Nodes (16): _domain_keywords(), _get_bm25(), _load_csv(), _load_product_keywords(), Load CSV and return list of dicts, with mtime-based caching., Fitted BM25 index for this file+columns, with mtime-based caching., Core search function using BM25. Returns (results, bm25_or_none)., Nearest known vocabulary terms for a query that returned 0 hits, so the caller… (+8 more)

### Community 23 - "Landing Page Sections"
Cohesion: 0.13
Nodes (17): PROGRAM_ART, revalidate, TRUST_POINTS, Area, AREAS, CareAreas(), EASE, EASE (+9 more)

### Community 24 - "Admin Login and Tabs"
Cohesion: 0.14
Nodes (13): metadata, metadata, ResetPasswordPage(), ADMIN_REALTIME_TABLES, AdminTabs(), TabDef, TabKey, AdminLoginCard() (+5 more)

### Community 25 - "Contact Edit Forms"
Cohesion: 0.16
Nodes (17): PatientContactEditForm(), TherapistContactEditForm(), HospitalInquiryForm(), SOURCES, PhoneNumberField(), FieldConfig, InstantProfileFields(), composePhone() (+9 more)

### Community 26 - "Spacing Tokens"
Cohesion: 0.06
Nodes (34): $type, $value, $type, $value, $type, $value, $type, $value (+26 more)

### Community 27 - "Tailwind Config Generator"
Cohesion: 0.10
Nodes (12): main(), Add custom font families. Args: fonts: Dict of font_type: [font_names] e.g.,…, Add custom spacing values. Args: spacing: Dict of name: value e.g., {'18':…, Add custom breakpoints. Args: breakpoints: Dict of name: width e.g., {'3xl':…, Add plugin requirements. Args: plugins: List of plugin names e.g.,…, Get plugin recommendations based on configuration. Returns: List of recommended…, Generate Tailwind CSS configuration files., Validate configuration. Returns: Tuple of (valid, message) (+4 more)

### Community 28 - "Public Marketing Pages"
Cohesion: 0.13
Nodes (16): Category, metadata, revalidate, metadata, PROBLEM, SOLUTION, PublicPackage, SessionPackages() (+8 more)

### Community 29 - "Auth and Registration"
Cohesion: 0.21
Nodes (10): metadata, ROLE_LOGIN_HREF, metadata, ConfirmPasswordField(), EmailField(), InviteRegisterCard(), Preview, PasswordField() (+2 more)

### Community 30 - "Design System Generator"
Cohesion: 0.10
Nodes (26): ansi_ljust(), _detect_page_type(), format_ascii_box(), format_markdown(), format_master_md(), format_page_override_md(), generate_design_system(), _generate_intelligent_overrides() (+18 more)

### Community 31 - "Payment and Calendar Sync"
Cohesion: 0.20
Nodes (15): POST(), POST(), POST(), POST(), createSessionMeetEvent(), deleteSessionMeetEvent(), getCalendarClient(), logCalendarError() (+7 more)

### Community 32 - "Booking and Referral Flow"
Cohesion: 0.18
Nodes (15): BookingWizard(), Category, formatInr(), PackageData, BuyPackageButton(), PayNowButton(), checkReferralCode(), ReferralCodeCheck (+7 more)

### Community 33 - "Slide Generation Logic"
Cohesion: 0.15
Nodes (19): _e(), generate_chart_slide(), generate_cta_slide(), generate_deck(), generate_metrics_slide(), generate_problem_slide(), generate_solution_slide(), generate_testimonial_slide() (+11 more)

### Community 34 - "Design System Recommendations"
Cohesion: 0.16
Nodes (8): detect_domain(), Auto-detect the most relevant domain from query. Matches are weighted by…, DesignSystemGenerator, Generates design system recommendations from aggregated searches., Load reasoning rules from CSV., TestDomainDetection, TestPersistence, TestReasoningMatch

### Community 35 - "Semantic Color Tokens"
Cohesion: 0.11
Nodes (19): $type, $value, background, destructive-foreground, muted, primary-foreground, secondary, secondary-foreground (+11 more)

### Community 36 - "Color Mode Resolution"
Cohesion: 0.16
Nodes (10): _filter_anti_patterns_for_mode(), _query_wants_dark(), True when a styles.csv row describes itself as dark-first., True when the query explicitly asks for a dark theme., Resolve the mode the rest of the output has to agree with., Drop "avoid dark mode" advice once dark mode is the resolved answer., _resolve_color_mode(), _style_is_dark_primary() (+2 more)

### Community 37 - "Background Image Generator"
Cohesion: 0.17
Nodes (17): generate_css_for_background(), get_background_image(), get_curated_images(), get_overlay_css(), get_pexels_search_url(), load_backgrounds_config(), load_brand_colors(), main() (+9 more)

### Community 38 - "Admin Payout Management"
Cohesion: 0.15
Nodes (14): AdminPayoutsTab(), Category, formatInr(), Patient, Therapist, TherapistSessionList(), METHOD_LABEL, NOTE_PLACEHOLDER (+6 more)

### Community 39 - "Card and Border Tokens"
Cohesion: 0.15
Nodes (17): $type, $value, $type, $value, bg, bg, border, padding (+9 more)

### Community 40 - "BM25 Search Algorithm"
Cohesion: 0.15
Nodes (9): BM25, _normalize(), Apply synonym substitution before tokenizing., BM25 ranking algorithm for text search, Lowercase, normalize synonyms, split, remove punctuation, filter stopwords, Build BM25 index from documents, Score all documents against query, All indexed terms, for suggestion/typo-recovery purposes. (+1 more)

### Community 41 - "Multi-Domain Search Logic"
Cohesion: 0.14
Nodes (8): Execute searches across multiple domains., Find matching reasoning rule for a category., Apply reasoning rules to search results., Select best matching result based on priority keywords., Extract results list from search result dict., Generate complete design system recommendation. variance/motion/density are…, Bucket a 1-10 dial value into its tier config. Returns None if value is None., _resolve_dial()

### Community 42 - "Public FAQ and Booking"
Cohesion: 0.16
Nodes (13): BookPage(), metadata, revalidate, ConditionsPage(), Faq, FaqPage(), metadata, revalidate (+5 more)

### Community 43 - "Icon Generation Utility"
Cohesion: 0.20
Nodes (15): apply_color(), apply_viewbox_size(), extract_svgs(), generate_batch(), generate_icon(), generate_sizes(), load_env(), main() (+7 more)

### Community 44 - "Font Size Tokens"
Cohesion: 0.12
Nodes (16): $type, $value, $type, $value, $type, $value, $type, $value (+8 more)

### Community 45 - "Shadcn Installer Tests"
Cohesion: 0.14
Nodes (8): Test adding components that are already installed., Test adding components in dry run mode., Test ShadcnInstaller class., Test listing installed components without config., Test listing installed components when none exist., Test checking for existing shadcn config., Test getting installed components without config., TestShadcnInstaller

### Community 46 - "Luminance and Contrast Logic"
Cohesion: 0.18
Nodes (7): _palette_is_dark(), WCAG relative luminance of a #RRGGBB string, or None if unparseable., True when a colors.csv row's Background is a dark surface., _relative_luminance(), The exact reproduction from issue #428., TestEndToEndCoherence, TestLuminance

### Community 47 - "Color Extraction Utility"
Cohesion: 0.22
Nodes (11): calculateCompliance(), colorDistance(), displayPalette(), extractHexColors(), findNearestBrandColor(), fs, generateImageMagickCommand(), hexToRgb() (+3 more)

### Community 48 - "Asset Validation Utility"
Cohesion: 0.25
Nodes (13): checkManifest(), formatBytes(), formatOutput(), fs, main(), parseFilename(), path, RULES (+5 more)

### Community 49 - "Border Radius Tokens"
Cohesion: 0.29
Nodes (8): $type, $value, $type, $value, radius, default, full, default

### Community 50 - "Booking Scene Components"
Cohesion: 0.18
Nodes (11): BookingScene(), EASE, EXERCISES, FINDINGS, FindingsScene(), PlanScene(), rise, SLOTS (+3 more)

### Community 51 - "Design Token Starter"
Cohesion: 0.15
Nodes (12): component, $type, $value, dark, semantic, $schema, $type, $value (+4 more)

### Community 52 - "Token Validation Utility"
Cohesion: 0.24
Nodes (11): extensions, formatReport(), fs, getFiles(), main(), parseArgs(), path, patterns (+3 more)

### Community 53 - "Shadcn Component Installer"
Cohesion: 0.20
Nodes (7): main(), Handle shadcn/ui component installation., ShadcnInstaller, Tests for shadcn_add.py, Test adding all components without config., Test initialization with custom project root., Test getting installed components when files exist.

### Community 54 - "Shadcn CLI Methods"
Cohesion: 0.21
Nodes (6): Add all available shadcn/ui components. Args: overwrite: If True, overwrite…, List installed components. Returns: Tuple of (success, message with component…, Check if shadcn is initialized in project. Returns: True if components.json…, Get list of already installed components. Returns: List of installed component…, Read shadcn version from project package.json; fall back to a pinned default., Add shadcn/ui components. Args: components: List of component names to add…

### Community 55 - "Config File Generation"
Cohesion: 0.20
Nodes (6): Generate configuration file content. Returns: Configuration file as string, Generate TypeScript configuration., Generate JavaScript configuration., Format plugins array for config. Validates each plugin name against a strict…, Add indentation to JSON string., Write configuration to file. Returns: Tuple of (success, message)

### Community 56 - "Session Action Buttons"
Cohesion: 0.27
Nodes (6): DeclineAccountButton(), MarkPaidByCashButton(), Category, TherapistNotAvailableToggle(), CompleteSessionButton(), ConfirmDialog()

### Community 57 - "CSV Export Utilities"
Cohesion: 0.27
Nodes (8): DownloadCsvButton(), PackagePurchasesTable(), PurchaseRow, STATUS_OPTIONS, CsvColumn, downloadCsv(), escapeCell(), toCsv()

### Community 58 - "Brand Context Injection"
Cohesion: 0.31
Nodes (10): extractColorsFromTable(), extractCoreAttributes(), extractHexColors(), extractImageStyle(), extractTypography(), extractVoice(), fs, generatePromptAddition() (+2 more)

### Community 59 - "Token Embedding Utility"
Cohesion: 0.18
Nodes (8): args, fs, minimal, MINIMAL_TOKENS, path, projectRoot, tokensPath, wrapStyle

### Community 60 - "Shadcn Installation Tests"
Cohesion: 0.18
Nodes (6): Test adding components with overwrite flag., Test successful component addition., Test component addition with subprocess error., Test component addition when npx is not found., Test successful addition of all components., patch

### Community 61 - "Tailwind Config Tests"
Cohesion: 0.22
Nodes (8): Tests for tailwind_config_gen.py, Reduce a generated TS/JS config to a bare assignable object so it can be handed…, Regression guard for the missing-comma bug between the ``theme`` block and…, The property preceding ``plugins`` must end with a comma (pure-Python check, so…, The emitted config parses as valid JS via ``node --check``., _strip_to_object(), TestGeneratedConfigIsValidJs, parametrize

### Community 62 - "Package Creation Routes"
Cohesion: 0.31
Nodes (8): POST(), POST(), PackageColumns, PackagePayload, parseOptionalPositiveInt(), THERAPIST_RATE_BASIS_VALUES, TherapistRateBasis, validatePackagePayload()

### Community 63 - "Marketing Onboarding Pages"
Cohesion: 0.20
Nodes (7): ACCENTS, metadata, PATHS, metadata, OBJECTIONS, FloatingOrbs(), MotionButton()

### Community 64 - "Team Directory Pages"
Cohesion: 0.24
Nodes (8): metadata, revalidate, TeamPage(), Stagger(), EASE, languageList(), TeamTherapist, TeamTherapistPopup()

### Community 65 - "Config Generator Initialization"
Cohesion: 0.22
Nodes (6): Any, Path, Initialize generator. Args: typescript: If True, generate .ts config, else .js…, Determine default output path., Create base configuration structure., Get default content paths for framework.

### Community 66 - "Logo Generation Logic"
Cohesion: 0.29
Nodes (9): enhance_prompt(), generate_batch(), generate_logo(), load_env(), main(), Enhance the logo prompt with style and industry modifiers, Generate a logo using Gemini models with image generation Args: aspect_ratio:…, Generate multiple logo variants with different styles (+1 more)

### Community 67 - "Token Generation Utility"
Cohesion: 0.36
Nodes (9): flattenTokens(), fs, generateCSS(), generateTailwind(), main(), parseArgs(), path, resolveReference() (+1 more)

### Community 68 - "Button Component Tokens"
Cohesion: 0.20
Nodes (10): fg, font-size, hover-bg, button, $type, $value, $type, $value (+2 more)

### Community 69 - "Animation Duration Tokens"
Cohesion: 0.18
Nodes (11): fast, normal, slow, $type, $value, $type, $value, primitive (+3 more)

### Community 70 - "People Directory Management"
Cohesion: 0.31
Nodes (6): AdminPeopleDirectory(), Person, AvatarThumbnail(), initialsOf(), AvatarUpload(), compressImage()

### Community 71 - "Package Catalog Management"
Cohesion: 0.31
Nodes (7): inputCls(), Package, PackageCatalogForm(), DeleteButton(), Package, PackageCatalogManager(), computePackageSavings()

### Community 72 - "Brand Token Sync"
Cohesion: 0.33
Nodes (8): adjustBrightness(), { execFileSync }, extractColorsFromMarkdown(), fs, generateColorScale(), main(), path, updateDesignTokens()

### Community 73 - "Text Search Indexing"
Cohesion: 0.28
Nodes (5): BM25, BM25 ranking algorithm for text search, Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query

### Community 74 - "Token Validation Tests"
Cohesion: 0.28
Nodes (8): Path, Regression tests for validate-tokens.cjs. The validator used to skip any line…, A hardcoded hex on the same line as a var() token is still a violation., A line that references only tokens produces no false positives., _run(), test_flags_hardcoded_hex_sharing_line_with_token(), test_token_only_line_reports_no_violation(), CompletedProcess

### Community 75 - "Admin Session Settings"
Cohesion: 0.31
Nodes (6): AdminSessionManagerTab(), Package, SubTab, PackageSettingsForm(), saveSetting(), AdminSettings

### Community 76 - "Treatment Category Management"
Cohesion: 0.25
Nodes (6): Category, NewCategoryValues, TreatmentCategoryForm(), Category, DeleteButton(), TreatmentCategoryManager()

### Community 77 - "Input Component Tokens"
Cohesion: 0.29
Nodes (8): padding-x, input, $type, $value, focus-ring, padding-x, $type, $value

### Community 78 - "Account Status Pages"
Cohesion: 0.32
Nodes (4): metadata, metadata, PendingApprovalPage(), SUPPORT_EMAIL

### Community 80 - "Palette Selection Logic"
Cohesion: 0.43
Nodes (3): Pick the highest-ranked palette matching the resolved mode. Only the dark case…, _select_palette_for_mode(), TestPaletteSelection

### Community 81 - "Appointment Cancellation Routes"
Cohesion: 0.48
Nodes (4): POST(), POST(), cancelAppointmentAndRefund(), CancelResult

### Community 82 - "Interactive Spine Story"
Cohesion: 0.33
Nodes (3): Spine X-ray Illustration, REGIONS, SpineStory()

### Community 83 - "Admin Feature Controls"
Cohesion: 0.47
Nodes (4): AdminFeatureControlTab(), GoogleMeetSyncIssue, saveSetting(), BookingLanguagesSection()

### Community 84 - "Radius Token Value"
Cohesion: 0.60
Nodes (5): radius, radius, radius, $type, $value

### Community 85 - "Large Size Token"
Cohesion: 0.60
Nodes (5): lg, $type, $value, lg, lg

### Community 86 - "Shadow Size Tokens"
Cohesion: 0.47
Nodes (6): sm, shadow, sm, sm, $type, $value

### Community 87 - "GSAP Animation Skills"
Cohesion: 0.40
Nodes (5): GSAP Core Skill, GSAP Frameworks Skill, GSAP React Skill, GSAP ScrollTrigger Skill, GSAP Timeline Skill

### Community 88 - "Google Auth Utility"
Cohesion: 0.40
Nodes (3): authUrl, oauth2Client, server

### Community 89 - "Supabase Proxy Configuration"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 90 - "Design Token Categories"
Cohesion: 0.50
Nodes (4): Component Tokens, Dark Mode, Primitive Tokens, Semantic Tokens

### Community 91 - "Vertical Padding Tokens"
Cohesion: 0.67
Nodes (4): padding-y, padding-y, $type, $value

### Community 92 - "Extra Large Tokens"
Cohesion: 0.67
Nodes (4): xl, xl, $type, $value

### Community 93 - "Empty Value Tokens"
Cohesion: 0.67
Nodes (4): $type, $value, none, none

### Community 94 - "Data Validation Utility"
Cohesion: 0.83
Nodes (3): _check_file(), main(), _read_rows()

### Community 96 - "Hospital Onboarding Routes"
Cohesion: 0.83
Nodes (3): generatePassword(), generateReferralCode(), POST()

### Community 99 - "Medium Size Token"
Cohesion: 0.67
Nodes (4): $type, $value, md, md

### Community 103 - "Destructive Color Tokens"
Cohesion: 0.67
Nodes (3): destructive, $type, $value

### Community 104 - "Foreground Color Tokens"
Cohesion: 0.67
Nodes (3): foreground, $type, $value

### Community 105 - "Muted Foreground Tokens"
Cohesion: 0.67
Nodes (3): muted-foreground, $type, $value

### Community 106 - "Primary Color Tokens"
Cohesion: 0.67
Nodes (3): primary, $type, $value

### Community 107 - "Primary Hover Tokens"
Cohesion: 0.67
Nodes (3): primary-hover, $type, $value

### Community 108 - "Focus Ring Tokens"
Cohesion: 0.67
Nodes (3): ring, $type, $value

### Community 109 - "Data Extraction Skills"
Cohesion: 0.67
Nodes (3): Extraction Spec, Query Reference, Graphify Skill

### Community 112 - "UI/UX Design Guidelines"
Cohesion: 1.00
Nodes (3): Professional UI Rules, UI/UX Quick Reference, UI/UX Pro Max Skill

## Knowledge Gaps
- **427 isolated node(s):** `Category`, `Person`, `Category`, `Person`, `SortKey` (+422 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **70 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createAdminClient()` connect `Admin Account Actions` to `Hospital Onboarding Routes`, `Patient Session Actions`, `User Dashboard Pages`, `Detail Detail Modals`, `Admin Payout Approvals`, `Appointment Cancellation Routes`, `Package and Session Management`, `Payment and Calendar Sync`, `Package Creation Routes`, `Profile Change Approval`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Admin Login and Tabs` to `Booking and Referral Flow`, `People Directory Management`, `User Profile Pages`, `Patient Login Page`, `Root Layout Components`, `Contact Edit Forms`, `Auth and Registration`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `SESSION_FEE_PAISE` connect `Detail Detail Modals` to `Admin Account Actions`, `Admin Calendar Management`, `Patient Session Actions`, `User Dashboard Pages`, `Admin Payout Approvals`, `Admin Analytics Metrics`, `Package and Session Management`, `Landing Page Sections`, `Session Action Buttons`, `Payment and Calendar Sync`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `TailwindConfigGenerator` (e.g. with `TestGeneratedConfigIsValidJs` and `TestTailwindConfigGenerator`) actually correct?**
  _`TailwindConfigGenerator` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Category`, `Person`, `Category` to the rest of the system?**
  _427 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Account Actions` be split into smaller, more focused modules?**
  _Cohesion score 0.04992833253702819 - nodes in this community are weakly interconnected._
- **Should `Admin Calendar Management` be split into smaller, more focused modules?**
  _Cohesion score 0.05432692307692308 - nodes in this community are weakly interconnected._