import Section from "@/components/marketing/Section";
import ExploreGrid from "@/components/marketing/ExploreGrid";
import { otherMarketingPages, type MarketingPageKey } from "@/lib/marketingNav";

/**
 * "Where to go next", at the foot of all six inner pages.
 *
 * The same grid the home page uses, minus the page you are on. A visitor who
 * arrives on /faq from a search result should be able to reach the rest of
 * the site without going back up to a header nav and guessing — that guessing
 * is what the redesign's feedback was about.
 */
export default function ExploreSection({
  current,
  homeVisitEnabled,
}: {
  current: MarketingPageKey;
  homeVisitEnabled: boolean;
}) {
  return (
    <Section
      id="explore"
      tone="panel"
      eyebrow="Explore"
      title="Where to go next"
      lede="Every other page on the site, and what it answers."
    >
      <ExploreGrid connectors={otherMarketingPages(current, homeVisitEnabled)} />
    </Section>
  );
}
