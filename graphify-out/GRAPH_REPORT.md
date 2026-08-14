# Graph Report - Claude  (2026-08-14)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2426 nodes · 5463 edges · 203 communities (129 shown, 74 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 39 edges (avg confidence: 0.56)
- Token cost: 7,997 input · 2,395 output

## Graph Freshness
- Built from commit: `c44a398f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Admin Account Actions
- Patient Health Profiles
- Booking and Feedback API
- Admin Metrics Dashboard
- Color Palette Tokens
- User Profile Pages
- Admin Calendar Management
- Home Visit Logistics
- Slide Search Core
- Domain Search Logic
- Admin Payout Approvals
- Admin Directory and FAQ
- Bulk Booking Schedulers
- Admin Detail Views
- Authentication Pages
- Tailwind Generator Tests
- Appointment Assignment API
- TypeScript Configuration
- HTML Token Validator
- Therapist Roster Management
- Patient Receipt Management
- HomeVisitPurchaseDetailModal.tsx
- Package Catalog Management
- Logo Search Core
- Script Search Logic
- Root Layout Components
- Payment History Tracking
- Marketing Landing Pages
- Spacing Design Tokens
- Tailwind Config Generator
- Public Booking Pages
- BookingWizard.tsx
- Session History Tracking
- Payment Integration Logic
- Design System Formatting
- Role-Based Dashboards
- Home Visit Checkout
- Slide Generation Logic
- Design System Recommendations
- Care Journey Content
- Theme Color Tokens
- Color Mode Resolution
- E2E Test Helpers
- Cancellation and Refunds
- Admin Action Buttons
- Background Image Generation
- Therapist Payout Management
- Card Component Tokens
- BM25 Search Algorithm
- Development Dependencies
- Production Dependencies
- Admin Feature Settings
- Home Visit Packages
- Icon Generation Utility
- Typography Design Tokens
- Therapist Cash Ledger
- Public Home Page
- Onboarding Tour Component
- Shadcn Installer Tests
- Luminance and Contrast Tests
- Color Extraction Utility
- Asset Validation Utility
- UI Primitive Tokens
- Payout Receipt Components
- Booking Scene Framework
- Therapist Earnings Dashboard
- Design Token Starter
- Token Validation Utility
- Shadcn Component Manager
- Shadcn CLI Methods
- Config File Generation
- Home Visit Administration
- Brand Context Injection
- Token Embedding Utility
- UI Design Documentation
- Shadcn Installation Tests
- Tailwind Config Tests
- Session Calendar Views
- Google Calendar Integration
- Generator Initialization
- Logo Generation Logic
- Token Export Utility
- Button Component Tokens
- Animation Duration Tokens
- Design System Selection
- Team Directory Pages
- CSV Export Utility
- Brand Sync Utility
- Text Search Indexing
- Token Validator Tests
- Home Visit API
- Public FAQ Page
- Home Visit Landing
- Treatment Category Management
- Input Component Tokens
- Detail Overlay Modals
- Debug Navigation Tools
- Domain Detection Tests
- Session Cancellation UI
- Admin Settings API
- Border Style Tokens
- Spacing 16 Tokens
- GSAP Animation Library
- NPM Scripts and Build
- Home Visit Settings Form
- Border Radius Tokens
- Large Size Tokens
- Small Size Tokens
- Google OAuth Authentication
- Supabase Proxy Configuration
- Vertical Padding Tokens
- Extra Large Size Tokens
- Empty Value Tokens
- Design Token Architecture
- Data Validation Scripts
- Package Metadata
- Database Schema Migration
- Profile Change API
- Hospital Onboarding API
- Token Sync Regression Tests
- Slide Token Validation
- Spacing 1 Tokens
- Spacing 3 Tokens
- Destructive Foreground Color
- Spacing 8 Tokens
- Destructive Theme Color
- Primary Foreground Color
- Muted Theme Color
- Secondary Foreground Color
- Ring Focus Color
- Installer Initialization
- Temporary Project Fixtures
- Component Configuration Tests
- Component Listing Tests
- Project Root Tests
- Dry Run Mode Tests
- Config Existence Tests
- Empty Component Tests
- Empty List Tests
- Custom Font Tests
- Plugin Recommendation Tests
- TypeScript Config Generation
- Color Configuration Tests
- Plugin Configuration Tests
- Content Path Validation
- Theme Extension Validation
- Config File Writing
- JavaScript Initialization Tests
- Config Content Verification
- Invalid Path Tests
- Full JS Configuration
- TS Output Path Tests
- Base Config Structure
- Vue Content Paths
- Custom Color Tests
- ESLint Configuration
- Git Post-Merge Hooks
- Phone Number Library
- Animation Library
- Next.js Configuration
- Tailwind CSS Framework
- PostCSS Configuration
- Brand Assets
- Data Extraction Specification
- Query Reference Documentation
- Graphify Skill Integration
- GSAP Performance Optimization
- GSAP Animation Utilities
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
- UI States and Variants
- Docs Freshness Workflow
- Graphify Refresh Workflow
- Spine X-ray Rendering
- Window Icon Management
- Open Font Licensing

## God Nodes (most connected - your core abstractions)
1. `createAdminClient()` - 259 edges
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
- **Design System Token Framework** — design_system_references_token_architecture_token_architecture, design_system_references_semantic_tokens_semantic_tokens, design_system_references_states_and_variants_states_and_variants, design_system_references_tailwind_integration_tailwind_integration [EXTRACTED 1.00]
- **OFL Licensed Font Collection** — claude_skills_ui_styling_canvas_fonts_boldonse_ofl, claude_skills_ui_styling_canvas_fonts_bricolagegrotesque_ofl, claude_skills_ui_styling_canvas_fonts_crimsonpro_ofl, claude_skills_ui_styling_canvas_fonts_dmmono_ofl, claude_skills_ui_styling_canvas_fonts_ericaone_ofl, claude_skills_ui_styling_canvas_fonts_geistmono_ofl, claude_skills_ui_styling_canvas_fonts_gloock_ofl, claude_skills_ui_styling_canvas_fonts_ibmplexmono_ofl, claude_skills_ui_styling_canvas_fonts_instrumentsans_ofl, claude_skills_ui_styling_canvas_fonts_italiana_ofl, claude_skills_ui_styling_canvas_fonts_jetbrainsmono_ofl, claude_skills_ui_styling_canvas_fonts_jura_ofl, claude_skills_ui_styling_canvas_fonts_librebaskerville_ofl, claude_skills_ui_styling_canvas_fonts_lora_ofl, claude_skills_ui_styling_canvas_fonts_nationalpark_ofl, claude_skills_ui_styling_canvas_fonts_nothingyoucoulddo_ofl, claude_skills_ui_styling_canvas_fonts_outfit_ofl, claude_skills_ui_styling_canvas_fonts_pixelifysans_ofl, claude_skills_ui_styling_canvas_fonts_poiretone_ofl, claude_skills_ui_styling_canvas_fonts_redhatmono_ofl, claude_skills_ui_styling_canvas_fonts_silkscreen_ofl, claude_skills_ui_styling_canvas_fonts_smoochsans_ofl, claude_skills_ui_styling_canvas_fonts_tektur_ofl, claude_skills_ui_styling_canvas_fonts_worksans_ofl, claude_skills_ui_styling_canvas_fonts_youngserif_ofl [EXTRACTED 1.00]
- **OFL Licensed Font Software Collection** — claude_skills_ui_styling_canvas_fonts_boldonse_ofl, claude_skills_ui_styling_canvas_fonts_bricolagegrotesque_ofl, claude_skills_ui_styling_canvas_fonts_geistmono_ofl, claude_skills_ui_styling_canvas_fonts_ibmplexmono_ofl, claude_skills_ui_styling_canvas_fonts_jetbrainsmono_ofl [EXTRACTED 1.00]
- **GSAP Animation Ecosystem** — claude_skills_gsap_core_skill, claude_skills_gsap_timeline_skill, claude_skills_gsap_scrolltrigger_skill, claude_skills_gsap_react_skill, claude_skills_gsap_frameworks_skill, claude_skills_gsap_plugins_skill, claude_skills_gsap_performance_skill, claude_skills_gsap_utils_skill [EXTRACTED 1.00]
- **shadcn/ui Implementation Stack** — claude_skills_ui_styling_references_shadcn_components, claude_skills_ui_styling_references_shadcn_theming, claude_skills_ui_styling_references_shadcn_accessibility [EXTRACTED 1.00]
- **Tailwind CSS Styling System** — claude_skills_ui_styling_references_tailwind_utilities, claude_skills_ui_styling_references_tailwind_responsive, claude_skills_ui_styling_references_tailwind_customization [EXTRACTED 1.00]
- **UI Styling & Tailwind Reference Set** — claude_skills_ui_styling_references_shadcn_accessibility, claude_skills_ui_styling_references_shadcn_components, claude_skills_ui_styling_references_shadcn_theming, claude_skills_ui_styling_references_tailwind_customization, claude_skills_ui_styling_references_tailwind_responsive, claude_skills_ui_styling_references_tailwind_utilities [EXTRACTED 1.00]
- **UI/UX Design Intelligence System** — claude_skills_ui_ux_pro_max_skill, claude_skills_ui_ux_pro_max_references_pro_rules, claude_skills_ui_ux_pro_max_references_quick_reference [EXTRACTED 1.00]
- **UI/UX Pro Max Design Intelligence System** — claude_skills_ui_ux_pro_max_skill, claude_skills_ui_ux_pro_max_references_pro_rules, claude_skills_ui_ux_pro_max_references_quick_reference [EXTRACTED 1.00]
- **UI Styling & Design System** — claude_skills_ui_styling_references_canvas_design_system, claude_skills_ui_styling_references_shadcn_components, claude_skills_ui_styling_references_shadcn_theming, claude_skills_ui_styling_references_tailwind_utilities [EXTRACTED]
- **UI/UX Intelligence Framework** — claude_skills_ui_ux_pro_max_skill, claude_skills_ui_ux_pro_max_references_pro_rules, claude_skills_ui_ux_pro_max_references_quick_reference [EXTRACTED]

## Communities (203 total, 74 thin omitted)

### Community 0 - "Admin Account Actions"
Cohesion: 0.04
Nodes (76): POST(), POST(), POST(), POST(), VALID_ACTIONS, ALLOWED_KEYS, POST(), ALLOWED_KEYS (+68 more)

### Community 1 - "Patient Health Profiles"
Cohesion: 0.06
Nodes (68): metadata, AnswerInput, POST(), POST(), metadata, PatientHealthProfilePage(), STATUS_BANNER_STYLE, metadata (+60 more)

### Community 2 - "Booking and Feedback API"
Cohesion: 0.08
Nodes (38): POST(), POST(), POST(), POST(), POST(), isoWeekKey(), POST(), SlotResult (+30 more)

### Community 3 - "Admin Metrics Dashboard"
Cohesion: 0.14
Nodes (30): AdminMetricsTab(), Category, daysAgo(), formatInr(), formatShortDate(), nowTimestamp(), toDateInputValue(), TrendBarChart() (+22 more)

### Community 4 - "Color Palette Tokens"
Cohesion: 0.05
Nodes (53): $type, $value, $type, $value, $type, $value, $type, $value (+45 more)

### Community 5 - "User Profile Pages"
Cohesion: 0.09
Nodes (29): HospitalProfilePage(), metadata, metadata, PatientProfilePage(), GRANT_LABEL, GRANT_STYLE, metadata, TherapistHealthProfilesPage() (+21 more)

### Community 6 - "Admin Calendar Management"
Cohesion: 0.16
Nodes (17): Category, Person, STATUS_STYLES, EditBookingForm(), minDateTimeLocal(), toDateTimeLocalValue(), MarkPaidByCashButton(), Category (+9 more)

### Community 7 - "Home Visit Logistics"
Cohesion: 0.14
Nodes (28): POST(), POST(), POST(), POST(), GET(), HomeVisitAddressPayload, POST(), POST() (+20 more)

### Community 8 - "Slide Search Core"
Cohesion: 0.08
Nodes (36): format_context(), format_result(), main(), Format a single search result for display, Format contextual recommendations for display., BM25, calculate_pattern_break(), detect_domain() (+28 more)

### Community 9 - "Domain Search Logic"
Cohesion: 0.08
Nodes (37): detect_domain(), get_cip_brief(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search across all domains and combine results (+29 more)

### Community 10 - "Admin Payout Approvals"
Cohesion: 0.06
Nodes (31): metadata, nowTimestamp(), AdminPayoutRequestsTab(), formatDateTime(), formatInr(), PayoutRequestRow, ApproveAccountButton(), AssignReferralForm() (+23 more)

### Community 11 - "Admin Directory and FAQ"
Cohesion: 0.08
Nodes (28): AdminPeopleDirectory(), Person, CompletePayoutRequestButton(), Faq, FaqForm(), DeleteButton(), Faq, FaqManager() (+20 more)

### Community 12 - "Bulk Booking Schedulers"
Cohesion: 0.20
Nodes (21): BookingCalendar(), SelectableChipGroup(), EASE, HomeVisitBulkScheduler(), Slot, slotDateTimeOf(), SlotResult, EASE (+13 more)

### Community 13 - "Admin Detail Views"
Cohesion: 0.11
Nodes (15): metadata, metadata, PatientNotesForm(), formatInr(), PatientProfitChart(), ProfitSession, ProfileSessionList(), RatingManager() (+7 more)

### Community 14 - "Authentication Pages"
Cohesion: 0.05
Nodes (46): metadata, metadata, metadata, metadata, metadata, metadata, PendingApprovalPage(), ResetPasswordPage() (+38 more)

### Community 15 - "Tailwind Generator Tests"
Cohesion: 0.06
Nodes (16): Test adding colors multiple times., Test adding full color palette., Test adding custom breakpoints., Test TailwindConfigGenerator class., Test that adding same plugin twice doesn't duplicate., Test plugin recommendations for Next.js., Test initialization with default settings., Test generating JavaScript configuration. (+8 more)

### Community 16 - "Appointment Assignment API"
Cohesion: 0.15
Nodes (21): POST(), POST(), POST(), POST(), POST(), isoWeekKey(), POST(), SlotResult (+13 more)

### Community 17 - "TypeScript Configuration"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 18 - "HTML Token Validator"
Cohesion: 0.13
Nodes (24): get_context(), is_allowed_exception(), is_allowed_rgba(), is_inside_block(), load_css_variables(), main(), print_result(), print_summary() (+16 more)

### Community 19 - "Therapist Roster Management"
Cohesion: 0.14
Nodes (23): AdminRosterTab(), STATE_STYLES, STATE_TITLES, Therapist, todayKey(), setsEqual(), Slot, slotKey() (+15 more)

### Community 20 - "Patient Receipt Management"
Cohesion: 0.13
Nodes (18): formatDateHeading(), formatDateTime(), formatInr(), ReceiptsSection(), STAGE_LABEL, STAGE_PILL_STYLE, BookingReceipt, BookingReceiptStage (+10 more)

### Community 21 - "HomeVisitPurchaseDetailModal.tsx"
Cohesion: 0.15
Nodes (17): AppointmentRow, DetailResponse, EventRow, HomeVisitPurchaseDetailModal(), AppointmentRow, DetailResponse, EASE, EventRow (+9 more)

### Community 22 - "Package Catalog Management"
Cohesion: 0.06
Nodes (39): AdminSessionManagerTab(), Package, SubTab, inputCls(), Package, PackageCatalogForm(), DeleteButton(), Package (+31 more)

### Community 23 - "Logo Search Core"
Cohesion: 0.11
Nodes (19): BM25, detect_domain(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search across all domains and combine results (+11 more)

### Community 24 - "Script Search Logic"
Cohesion: 0.12
Nodes (18): _domain_keywords(), _get_bm25(), _load_csv(), _load_product_keywords(), Load CSV and return list of dicts, with mtime-based caching., Fitted BM25 index for this file+columns, with mtime-based caching., Core search function using BM25. Returns (results, bm25_or_none)., Nearest known vocabulary terms for a query that returned 0 hits, so the caller… (+10 more)

### Community 25 - "Root Layout Components"
Cohesion: 0.13
Nodes (19): inter, jakarta, metadata, RootLayout(), FarewellBanner(), Footer(), BASE_LINKS, HOME_VISIT_LINK (+11 more)

### Community 26 - "Payment History Tracking"
Cohesion: 0.14
Nodes (23): AdminPaymentHistoryTab(), AdminReceiptRow, Category, formatDateTime(), formatInr(), Patient, PatientTransactionTable(), RECEIPT_STAGE_LABEL (+15 more)

### Community 27 - "Marketing Landing Pages"
Cohesion: 0.11
Nodes (16): ACCENTS, metadata, PATHS, metadata, PROBLEM, SOLUTION, metadata, OBJECTIONS (+8 more)

### Community 28 - "Spacing Design Tokens"
Cohesion: 0.09
Nodes (22): $type, $value, $type, $value, $type, $value, $type, $value (+14 more)

### Community 29 - "Tailwind Config Generator"
Cohesion: 0.10
Nodes (12): main(), Add custom font families. Args: fonts: Dict of font_type: [font_names] e.g.,…, Add custom spacing values. Args: spacing: Dict of name: value e.g., {'18':…, Add custom breakpoints. Args: breakpoints: Dict of name: width e.g., {'3xl':…, Add plugin requirements. Args: plugins: List of plugin names e.g.,…, Get plugin recommendations based on configuration. Returns: List of recommended…, Generate Tailwind CSS configuration files., Validate configuration. Returns: Tuple of (valid, message) (+4 more)

### Community 30 - "Public Booking Pages"
Cohesion: 0.13
Nodes (17): BookHomeVisitPage(), metadata, revalidate, BookPage(), metadata, revalidate, Category, ConditionsPage() (+9 more)

### Community 31 - "BookingWizard.tsx"
Cohesion: 0.16
Nodes (19): BookingStepOne(), REVEAL, BookingWizard(), Category, formatInr(), PackageData, bookableHoursForDate(), BOOKING_LEAD_TIME_HOURS (+11 more)

### Community 32 - "Session History Tracking"
Cohesion: 0.18
Nodes (11): AdminSessionStoryTab(), Category, Person, SortKey, STATUS_STYLES, SessionDetailDrawer(), formatSlotRange(), IST_DATE_KEY_FORMATTER (+3 more)

### Community 33 - "Payment Integration Logic"
Cohesion: 0.24
Nodes (9): BuyPackageButton(), PayNowButton(), PackagePaymentResult, payForPackage(), PayForPackageArgs, loadRazorpayScript(), payForAppointment(), PayForAppointmentArgs (+1 more)

### Community 34 - "Design System Formatting"
Cohesion: 0.12
Nodes (20): ansi_ljust(), _detect_page_type(), format_ascii_box(), format_markdown(), format_master_md(), format_page_override_md(), _generate_intelligent_overrides(), hex_to_ansi() (+12 more)

### Community 35 - "Role-Based Dashboards"
Cohesion: 0.08
Nodes (45): AdminDashboardPage(), HospitalDashboardPage(), metadata, STATUS_STYLES, metadata, nowTimestamp(), PatientDashboardPage(), STATUS_STYLES (+37 more)

### Community 36 - "Home Visit Checkout"
Cohesion: 0.18
Nodes (14): AddressForm(), inputCls(), ChipOption, AreaCheck, HomeVisitBookingWizard(), inputCls(), leadTimeMsFromHours(), HomeVisitAddressForm (+6 more)

### Community 37 - "Slide Generation Logic"
Cohesion: 0.15
Nodes (19): _e(), generate_chart_slide(), generate_cta_slide(), generate_deck(), generate_metrics_slide(), generate_problem_slide(), generate_solution_slide(), generate_testimonial_slide() (+11 more)

### Community 38 - "Design System Recommendations"
Cohesion: 0.15
Nodes (11): DesignSystemGenerator, generate_design_system(), persist_design_system(), Generates design system recommendations from aggregated searches., Load reasoning rules from CSV., Find matching reasoning rule for a category., Apply reasoning rules to search results., Main entry point for design system generation. Args: query: Search query (e.g.,… (+3 more)

### Community 39 - "Care Journey Content"
Cohesion: 0.13
Nodes (14): Area, AREAS, CareAreas(), EASE, EASE, JourneySteps(), Step, STEPS (+6 more)

### Community 40 - "Theme Color Tokens"
Cohesion: 0.11
Nodes (19): $type, $value, background, foreground, muted-foreground, primary, primary-hover, secondary (+11 more)

### Community 41 - "Color Mode Resolution"
Cohesion: 0.16
Nodes (10): _filter_anti_patterns_for_mode(), _query_wants_dark(), True when a styles.csv row describes itself as dark-first., True when the query explicitly asks for a dark theme., Resolve the mode the rest of the output has to agree with., Drop "avoid dark mode" advice once dark mode is the resolved answer., _resolve_color_mode(), _style_is_dark_primary() (+2 more)

### Community 42 - "E2E Test Helpers"
Cohesion: 0.19
Nodes (14): ensureUser(), globalSetup(), PATIENTS, THERAPISTS, adminClient(), BASE, cookieHeaderFor(), profileIdFor() (+6 more)

### Community 43 - "Cancellation and Refunds"
Cohesion: 0.19
Nodes (11): POST(), POST(), POST(), POST(), POST(), POST(), cancelAppointmentAndRefund(), CancelResult (+3 more)

### Community 44 - "Admin Action Buttons"
Cohesion: 0.33
Nodes (4): DeclineAccountButton(), TherapistNotAvailableToggle(), CollectCashButton(), ConfirmDialog()

### Community 45 - "Background Image Generation"
Cohesion: 0.17
Nodes (17): generate_css_for_background(), get_background_image(), get_curated_images(), get_overlay_css(), get_pexels_search_url(), load_backgrounds_config(), load_brand_colors(), main() (+9 more)

### Community 46 - "Therapist Payout Management"
Cohesion: 0.15
Nodes (14): AdminPayoutsTab(), Category, formatInr(), Patient, Therapist, TherapistSessionList(), METHOD_LABEL, NOTE_PLACEHOLDER (+6 more)

### Community 47 - "Card Component Tokens"
Cohesion: 0.20
Nodes (12): $type, $value, bg, bg, padding, shadow, card, bg (+4 more)

### Community 48 - "BM25 Search Algorithm"
Cohesion: 0.15
Nodes (9): BM25, _normalize(), Apply synonym substitution before tokenizing., BM25 ranking algorithm for text search, Lowercase, normalize synonyms, split, remove punctuation, filter stopwords, Build BM25 index from documents, Score all documents against query, All indexed terms, for suggestion/typo-recovery purposes. (+1 more)

### Community 49 - "Development Dependencies"
Cohesion: 0.12
Nodes (17): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, @playwright/test, @tailwindcss/postcss, @types/node (+9 more)

### Community 50 - "Production Dependencies"
Cohesion: 0.12
Nodes (17): @fortawesome/fontawesome-free, googleapis, next, dependencies, @fortawesome/fontawesome-free, googleapis, next, razorpay (+9 more)

### Community 51 - "Admin Feature Settings"
Cohesion: 0.13
Nodes (14): AdminFeatureControlTab(), GoogleMeetSyncIssue, saveSetting(), BookingLanguagesSection(), DEFAULT_BOOKING_LANGUAGES, DEFAULT_CONTACT_EMAIL, DEFAULT_CONTACT_PHONE, DEFAULT_FOOTER_COPYRIGHT_TEXT (+6 more)

### Community 52 - "Home Visit Packages"
Cohesion: 0.33
Nodes (6): HomeVisitPackage, HomeVisitPackageForm(), inputCls(), DeleteButton(), HomeVisitPackageManager(), computeHomeVisitSavings()

### Community 53 - "Icon Generation Utility"
Cohesion: 0.20
Nodes (15): apply_color(), apply_viewbox_size(), extract_svgs(), generate_batch(), generate_icon(), generate_sizes(), load_env(), main() (+7 more)

### Community 54 - "Typography Design Tokens"
Cohesion: 0.12
Nodes (16): $type, $value, $type, $value, $type, $value, $type, $value (+8 more)

### Community 55 - "Therapist Cash Ledger"
Cohesion: 0.21
Nodes (14): IMPLEMENTED_METHODS, POST(), formatInr(), HomeVisitCashLedger(), MarkRefundReturnedButton(), MarkRemittedButton(), TherapistCashCard(), HomeVisitRow (+6 more)

### Community 56 - "Public Home Page"
Cohesion: 0.17
Nodes (10): PROGRAM_ART, revalidate, TRUST_POINTS, SectionNav(), SectionNavItem, PublicPackage, SessionPackages(), REGIONS (+2 more)

### Community 57 - "Onboarding Tour Component"
Cohesion: 0.40
Nodes (4): OnboardingTour(), Rect, Step, STEPS

### Community 58 - "Shadcn Installer Tests"
Cohesion: 0.14
Nodes (8): Test adding components in dry run mode., Test ShadcnInstaller class., Test adding all components without config., Test listing installed components without config., Test listing installed components when none exist., Test checking for existing shadcn config., Test getting installed components without config., TestShadcnInstaller

### Community 59 - "Luminance and Contrast Tests"
Cohesion: 0.18
Nodes (7): _palette_is_dark(), WCAG relative luminance of a #RRGGBB string, or None if unparseable., True when a colors.csv row's Background is a dark surface., _relative_luminance(), The exact reproduction from issue #428., TestEndToEndCoherence, TestLuminance

### Community 60 - "Color Extraction Utility"
Cohesion: 0.22
Nodes (11): calculateCompliance(), colorDistance(), displayPalette(), extractHexColors(), findNearestBrandColor(), fs, generateImageMagickCommand(), hexToRgb() (+3 more)

### Community 61 - "Asset Validation Utility"
Cohesion: 0.25
Nodes (13): checkManifest(), formatBytes(), formatOutput(), fs, main(), parseFilename(), path, RULES (+5 more)

### Community 62 - "UI Primitive Tokens"
Cohesion: 0.19
Nodes (14): $type, $value, $type, $value, $type, $value, primitive, radius (+6 more)

### Community 63 - "Payout Receipt Components"
Cohesion: 0.39
Nodes (6): Modal(), formatDateHeading(), formatDateTime(), formatInr(), TherapistPayoutReceiptsSection(), PayoutReceipt

### Community 64 - "Booking Scene Framework"
Cohesion: 0.18
Nodes (11): BookingScene(), EASE, EXERCISES, FINDINGS, FindingsScene(), PlanScene(), rise, SLOTS (+3 more)

### Community 65 - "Therapist Earnings Dashboard"
Cohesion: 0.24
Nodes (11): RequestPayoutButton(), EarningsDay, formatInr(), TherapistEarningsChart(), CompletedRequest, dayLabel(), formatDate(), formatInr() (+3 more)

### Community 66 - "Design Token Starter"
Cohesion: 0.15
Nodes (12): component, $type, $value, dark, semantic, $schema, $type, $value (+4 more)

### Community 67 - "Token Validation Utility"
Cohesion: 0.24
Nodes (11): extensions, formatReport(), fs, getFiles(), main(), parseArgs(), path, patterns (+3 more)

### Community 68 - "Shadcn Component Manager"
Cohesion: 0.20
Nodes (7): main(), Handle shadcn/ui component installation., ShadcnInstaller, Tests for shadcn_add.py, Test adding components that are already installed., Test initialization with custom project root., Test getting installed components when files exist.

### Community 69 - "Shadcn CLI Methods"
Cohesion: 0.21
Nodes (6): Add all available shadcn/ui components. Args: overwrite: If True, overwrite…, List installed components. Returns: Tuple of (success, message with component…, Check if shadcn is initialized in project. Returns: True if components.json…, Get list of already installed components. Returns: List of installed component…, Read shadcn version from project package.json; fall back to a pinned default., Add shadcn/ui components. Args: components: List of component names to add…

### Community 70 - "Config File Generation"
Cohesion: 0.20
Nodes (6): Generate configuration file content. Returns: Configuration file as string, Generate TypeScript configuration., Generate JavaScript configuration., Format plugins array for config. Validates each plugin name against a strict…, Add indentation to JSON string., Write configuration to file. Returns: Tuple of (success, message)

### Community 71 - "Home Visit Administration"
Cohesion: 0.17
Nodes (10): AdminHomeVisitsTab(), SubTab, AreaRow(), HomeVisitAreaManager(), inputCls(), ServiceAreaRow, WaitlistRow, HomeVisitPurchaseRow (+2 more)

### Community 72 - "Brand Context Injection"
Cohesion: 0.31
Nodes (10): extractColorsFromTable(), extractCoreAttributes(), extractHexColors(), extractImageStyle(), extractTypography(), extractVoice(), fs, generatePromptAddition() (+2 more)

### Community 73 - "Token Embedding Utility"
Cohesion: 0.18
Nodes (8): args, fs, minimal, MINIMAL_TOKENS, path, projectRoot, tokensPath, wrapStyle

### Community 74 - "UI Design Documentation"
Cohesion: 0.18
Nodes (11): Canvas Design System, shadcn/ui Accessibility Patterns, shadcn/ui Component Reference, shadcn/ui Theming & Customization, Tailwind CSS Customization, Tailwind CSS Responsive Design, Tailwind CSS Utility Reference, UI Styling Skill (+3 more)

### Community 75 - "Shadcn Installation Tests"
Cohesion: 0.18
Nodes (6): Test adding components with overwrite flag., Test successful component addition., Test component addition with subprocess error., Test component addition when npx is not found., Test successful addition of all components., patch

### Community 76 - "Tailwind Config Tests"
Cohesion: 0.22
Nodes (8): Tests for tailwind_config_gen.py, Reduce a generated TS/JS config to a bare assignable object so it can be handed…, Regression guard for the missing-comma bug between the ``theme`` block and…, The property preceding ``plugins`` must end with a comma (pure-Python check, so…, The emitted config parses as valid JS via ``node --check``., _strip_to_object(), TestGeneratedConfigIsValidJs, parametrize

### Community 77 - "Session Calendar Views"
Cohesion: 0.23
Nodes (11): AdminCalendarTab(), todayKey(), PatientMonthMotivation(), BUCKET_DOT_COLOR, BUCKET_FILL_STYLE, CalendarSession, ColorBucket, MonthStats (+3 more)

### Community 78 - "Google Calendar Integration"
Cohesion: 0.35
Nodes (10): CalendarEventInput, createSessionCalendarEvent(), createSessionMeetEvent(), deleteSessionMeetEvent(), getCalendarClient(), logCalendarError(), normalizeTimezone(), SessionEventInput (+2 more)

### Community 79 - "Generator Initialization"
Cohesion: 0.22
Nodes (6): Any, Path, Initialize generator. Args: typescript: If True, generate .ts config, else .js…, Determine default output path., Create base configuration structure., Get default content paths for framework.

### Community 80 - "Logo Generation Logic"
Cohesion: 0.29
Nodes (9): enhance_prompt(), generate_batch(), generate_logo(), load_env(), main(), Enhance the logo prompt with style and industry modifiers, Generate a logo using Gemini models with image generation Args: aspect_ratio:…, Generate multiple logo variants with different styles (+1 more)

### Community 81 - "Token Export Utility"
Cohesion: 0.36
Nodes (9): flattenTokens(), fs, generateCSS(), generateTailwind(), main(), parseArgs(), path, resolveReference() (+1 more)

### Community 82 - "Button Component Tokens"
Cohesion: 0.20
Nodes (10): fg, font-size, hover-bg, button, $type, $value, $type, $value (+2 more)

### Community 83 - "Animation Duration Tokens"
Cohesion: 0.20
Nodes (10): fast, normal, slow, $type, $value, $type, $value, duration (+2 more)

### Community 84 - "Design System Selection"
Cohesion: 0.14
Nodes (9): Pick the highest-ranked palette matching the resolved mode. Only the dark case…, Execute searches across multiple domains., Select best matching result based on priority keywords., Extract results list from search result dict., Generate complete design system recommendation. variance/motion/density are…, Bucket a 1-10 dial value into its tier config. Returns None if value is None., _resolve_dial(), _select_palette_for_mode() (+1 more)

### Community 85 - "Team Directory Pages"
Cohesion: 0.27
Nodes (7): metadata, revalidate, TeamPage(), EASE, languageList(), TeamTherapist, TeamTherapistPopup()

### Community 86 - "CSV Export Utility"
Cohesion: 0.43
Nodes (5): DownloadCsvButton(), CsvColumn, downloadCsv(), escapeCell(), toCsv()

### Community 87 - "Brand Sync Utility"
Cohesion: 0.33
Nodes (8): adjustBrightness(), { execFileSync }, extractColorsFromMarkdown(), fs, generateColorScale(), main(), path, updateDesignTokens()

### Community 88 - "Text Search Indexing"
Cohesion: 0.28
Nodes (5): BM25, BM25 ranking algorithm for text search, Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query

### Community 89 - "Token Validator Tests"
Cohesion: 0.28
Nodes (8): Path, Regression tests for validate-tokens.cjs. The validator used to skip any line…, A hardcoded hex on the same line as a var() token is still a violation., A line that references only tokens produces no false positives., _run(), test_flags_hardcoded_hex_sharing_line_with_token(), test_token_only_line_reports_no_violation(), CompletedProcess

### Community 90 - "Home Visit API"
Cohesion: 0.42
Nodes (6): POST(), POST(), HomeVisitPackageColumns, HomeVisitPackagePayload, parseOptionalPositiveInt(), validateHomeVisitPackagePayload()

### Community 91 - "Public FAQ Page"
Cohesion: 0.25
Nodes (7): Faq, FaqPage(), metadata, revalidate, Faq, FaqAccordion(), FloatingOrbs()

### Community 92 - "Home Visit Landing"
Cohesion: 0.28
Nodes (7): HomeVisitPage(), metadata, revalidate, HomeVisitPackages(), PublicHomeVisitPackage, DEFAULT_HOME_VISIT_PAGE_HEADING, DEFAULT_HOME_VISIT_PAGE_SUBHEADING

### Community 93 - "Treatment Category Management"
Cohesion: 0.25
Nodes (6): Category, NewCategoryValues, TreatmentCategoryForm(), Category, DeleteButton(), TreatmentCategoryManager()

### Community 94 - "Input Component Tokens"
Cohesion: 0.29
Nodes (8): padding-x, input, $type, $value, focus-ring, padding-x, $type, $value

### Community 96 - "Debug Navigation Tools"
Cohesion: 0.54
Nodes (6): DebugNav(), routes, toLocalInputValue(), debugNow(), getDebugNowOffsetMs(), setDebugNowOffsetMs()

### Community 97 - "Domain Detection Tests"
Cohesion: 0.43
Nodes (3): detect_domain(), Auto-detect the most relevant domain from query. Matches are weighted by…, TestDomainDetection

### Community 98 - "Session Cancellation UI"
Cohesion: 0.43
Nodes (4): CancelSessionButton(), PromptDialog(), CANCELLATION_FULL_REFUND_HOURS, usePrompt()

### Community 99 - "Admin Settings API"
Cohesion: 0.29
Nodes (6): ALLOWED_COLUMNS, BRAND_TEXT_FIELDS, CONTACT_FIELDS, HOME_VISIT_COPY_FIELDS, LONG_TEXT_FIELDS, POST()

### Community 100 - "Border Style Tokens"
Cohesion: 0.60
Nodes (5): $type, $value, border, border, border

### Community 101 - "Spacing 16 Tokens"
Cohesion: 0.67
Nodes (3): $type, $value, 16

### Community 102 - "GSAP Animation Library"
Cohesion: 0.33
Nodes (6): GSAP Core, GSAP Frameworks, GSAP Plugins, GSAP React, GSAP ScrollTrigger, GSAP Timeline

### Community 103 - "NPM Scripts and Build"
Cohesion: 0.33
Nodes (6): scripts, build, dev, lint, start, test:e2e

### Community 104 - "Home Visit Settings Form"
Cohesion: 0.53
Nodes (5): HomeVisitSettingsForm(), NumberSetting(), saveSetting(), TextSetting(), Toggle()

### Community 105 - "Border Radius Tokens"
Cohesion: 0.60
Nodes (5): radius, radius, radius, $type, $value

### Community 106 - "Large Size Tokens"
Cohesion: 0.60
Nodes (5): lg, $type, $value, lg, lg

### Community 107 - "Small Size Tokens"
Cohesion: 0.60
Nodes (5): sm, sm, sm, $type, $value

### Community 108 - "Google OAuth Authentication"
Cohesion: 0.40
Nodes (3): authUrl, oauth2Client, server

### Community 109 - "Supabase Proxy Configuration"
Cohesion: 0.60
Nodes (3): updateSession(), config, proxy()

### Community 110 - "Vertical Padding Tokens"
Cohesion: 0.67
Nodes (4): padding-y, padding-y, $type, $value

### Community 111 - "Extra Large Size Tokens"
Cohesion: 0.67
Nodes (4): xl, xl, $type, $value

### Community 112 - "Empty Value Tokens"
Cohesion: 0.67
Nodes (4): $type, $value, none, none

### Community 113 - "Design Token Architecture"
Cohesion: 0.50
Nodes (4): Slides Skill, Semantic Tokens, Tailwind Integration, Token Architecture

### Community 114 - "Data Validation Scripts"
Cohesion: 0.83
Nodes (3): _check_file(), main(), _read_rows()

### Community 115 - "Package Metadata"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 118 - "Hospital Onboarding API"
Cohesion: 0.83
Nodes (3): generatePassword(), generateReferralCode(), POST()

### Community 122 - "Spacing 1 Tokens"
Cohesion: 0.67
Nodes (3): $type, $value, 1

### Community 123 - "Spacing 3 Tokens"
Cohesion: 0.67
Nodes (3): $type, $value, 3

### Community 124 - "Destructive Foreground Color"
Cohesion: 0.67
Nodes (3): destructive-foreground, $type, $value

### Community 125 - "Spacing 8 Tokens"
Cohesion: 0.67
Nodes (3): $type, $value, 8

### Community 126 - "Destructive Theme Color"
Cohesion: 0.67
Nodes (3): destructive, $type, $value

### Community 127 - "Primary Foreground Color"
Cohesion: 0.67
Nodes (3): primary-foreground, $type, $value

### Community 128 - "Muted Theme Color"
Cohesion: 0.67
Nodes (3): muted, $type, $value

### Community 129 - "Secondary Foreground Color"
Cohesion: 0.67
Nodes (3): secondary-foreground, $type, $value

### Community 131 - "Ring Focus Color"
Cohesion: 0.67
Nodes (3): ring, $type, $value

## Knowledge Gaps
- **533 isolated node(s):** `PackageColumns`, `TherapistRateBasis`, `AnswerInput`, `LatestAssessment`, `Selection` (+528 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **74 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createAdminClient()` connect `Admin Account Actions` to `Patient Health Profiles`, `Booking and Feedback API`, `Role-Based Dashboards`, `Admin Settings API`, `User Profile Pages`, `Home Visit Logistics`, `Admin Payout Approvals`, `Cancellation and Refunds`, `Admin Detail Views`, `Appointment Assignment API`, `Profile Change API`, `Hospital Onboarding API`, `Therapist Cash Ledger`, `Home Visit API`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `useConfirm()` connect `Admin Directory and FAQ` to `Session History Tracking`, `Admin Calendar Management`, `Home Visit Administration`, `Therapist Payout Management`, `Therapist Roster Management`, `Home Visit Packages`, `HomeVisitPurchaseDetailModal.tsx`, `Package Catalog Management`, `Therapist Cash Ledger`, `Treatment Category Management`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Booking and Feedback API` to `Admin Account Actions`, `Patient Health Profiles`, `Role-Based Dashboards`, `User Profile Pages`, `Home Visit Logistics`, `Admin Payout Approvals`, `Cancellation and Refunds`, `Authentication Pages`, `Appointment Assignment API`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `TailwindConfigGenerator` (e.g. with `TestGeneratedConfigIsValidJs` and `TestTailwindConfigGenerator`) actually correct?**
  _`TailwindConfigGenerator` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `PackageColumns`, `TherapistRateBasis`, `AnswerInput` to the rest of the system?**
  _533 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Account Actions` be split into smaller, more focused modules?**
  _Cohesion score 0.040360669815371404 - nodes in this community are weakly interconnected._
- **Should `Patient Health Profiles` be split into smaller, more focused modules?**
  _Cohesion score 0.05711086226203808 - nodes in this community are weakly interconnected._