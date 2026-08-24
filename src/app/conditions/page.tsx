import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import SectionNav, { type SectionNavItem } from "@/components/SectionNav";
import ProgramCards from "@/components/catalog/ProgramCards";
import SessionPackages from "@/components/home/SessionPackages";
import PageHero from "@/components/marketing/PageHero";
import Section from "@/components/marketing/Section";
import PhotoTile from "@/components/marketing/PhotoTile";
import ExploreSection from "@/components/marketing/ExploreSection";
import ClosingCta from "@/components/marketing/ClosingCta";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { CARE_AREAS } from "@/lib/careAreas";
import { readHomeVisitEnabled } from "@/lib/homeVisitFlag";

export const metadata: Metadata = {
  title: "Conditions Treated | Dr. Pooja's Physio",
  description:
    "Back, neck, knee, posture, sports and mobility problems — each with a defined assessment and a structured programme behind it.",
};

// No per-user content on this page — cache and revalidate on a timer
// instead of hitting Supabase on every single visit.
export const revalidate = 300;

type Category = {
  id: string;
  title: string;
  description: string | null;
  points: unknown;
  price_paise: number;
  duration_minutes: number;
  cta_label: string;
};

export default async function ConditionsPage() {
  const supabase = createPublicClient();
  const { data: categories } = await supabase
    .from("treatment_categories")
    .select("id, title, description, points, price_paise, duration_minutes, cta_label")
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  const rows = (categories ?? []) as Category[];

  // Same isolated-query, migration-dependent-degrades-gracefully reasoning
  // as the home page's own package section.
  const { data: settingsRow } = await supabase
    .from("site_settings")
    .select("session_packages_visible")
    .maybeSingle();

  const { data: rawPackages } = settingsRow?.session_packages_visible
    ? await supabase
        .from("treatment_category_packages")
        .select(
          "id, title, subtitle, image_url, promises, badge_label, highlight, session_count, price_paise, compare_at_paise, validity_days, therapist_locked, category_id"
        )
        .eq("active", true)
        .eq("visible_on_conditions", true)
        .order("display_order", { ascending: true })
        .order("id", { ascending: true })
    : { data: null };

  // Same isolated-query reasoning as the home page: the dialog's long-form
  // columns are migration-dependent, so losing them must not cost the whole
  // packages section.
  const packageIds = (rawPackages ?? []).map((p) => p.id);
  const { data: packageDetail } = packageIds.length
    ? await supabase
        .from("treatment_category_packages")
        .select(
          "id, description, terms, package_code, session_duration_minutes, min_gap_hours, max_sessions_per_week, max_purchases_per_patient"
        )
        .in("id", packageIds)
    : { data: null };
  const detailById = new Map((packageDetail ?? []).map((d) => [d.id, d]));

  const categoryPriceById = new Map(rows.map((c) => [c.id, c.price_paise]));
  const packages = (rawPackages ?? []).map((p) => ({
    ...p,
    ...(detailById.get(p.id) ?? {}),
    category_price_paise: categoryPriceById.get(p.category_id) ?? null,
  }));

  const homeVisitEnabled = await readHomeVisitEnabled();

  // Only sections that actually render -- programmes and packages are both
  // admin-controlled, so a rail item pointing at an absent section would be a
  // dead pill and a skipped stop for the scroll arrow. Order matches the DOM.
  const sectionNavItems: SectionNavItem[] = [
    { id: "areas", label: "What We Treat", icon: "fa-bone" },
    ...(rows.length > 0 ? [{ id: "programs", label: "Programs", icon: "fa-clipboard-list" }] : []),
    ...(packages.length > 0 ? [{ id: "packages", label: "Packages", icon: "fa-box-open" }] : []),
    { id: "explore", label: "Explore the Site", icon: "fa-compass" },
    { id: "not-sure", label: "Not Sure?", icon: "fa-circle-question" },
  ];

  return (
    <>
      <SectionNav items={sectionNavItems} />

      <PageHero
        eyebrow="Conditions treated"
        title="Tell us what hurts"
        subtitle="Six areas of practice, each with a defined assessment and a structured programme behind it — not a general promise to help."
        primary={{ href: "/book", label: "Book an assessment", icon: "fa-calendar-check" }}
        secondary={{ href: "/faq", label: "Read common questions" }}
        photoId="hero-conditions"
        alt="A physiotherapist testing a patient's spinal range of motion"
      />

      {/* Breadth first, catalog second. The old page opened straight into the
          admin-configured programme cards, so a visitor whose complaint was
          not one of the configured programme titles concluded we did not
          treat it. */}
      <Section
        id="areas"
        eyebrow="Areas of practice"
        title="Where we can help"
        lede="Tap an area to see the programme, or book the standard assessment and let your therapist decide."
      >
        <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CARE_AREAS.map((area) => (
            <StaggerItem key={area.key} className="h-full">
              <PhotoTile
                href="/book"
                photoId={area.photo}
                alt={area.blurb}
                title={area.title}
                blurb={area.blurb}
                action="Book an assessment"
                icon={area.icon}
              />
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {rows.length > 0 && (
        <Section
          id="programs"
          tone="tint"
          eyebrow="Structured programmes"
          title="What you can book today"
          lede="Every programme opens with the same 60-minute assessment. What changes is the protocol built from it."
        >
          <ProgramCards programs={rows} packages={packages} />
        </Section>
      )}

      <SessionPackages packages={packages} />

      <ExploreSection current="conditions" homeVisitEnabled={homeVisitEnabled} />

      <ClosingCta
        id="not-sure"
        title="Not sure which one fits?"
        body="Book the standard assessment. Your therapist will identify the right protocol during the session, so you never have to self-diagnose first."
        primary={{ href: "/book", label: "Book an assessment", icon: "fa-calendar-check" }}
        secondary={{ href: "/faq", label: "Read the FAQ" }}
      />
    </>
  );
}
