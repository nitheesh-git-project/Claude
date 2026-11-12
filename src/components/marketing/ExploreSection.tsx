import Section from "@/components/marketing/Section";
import ExploreGrid from "@/components/marketing/ExploreGrid";
import { exploreConnectors, type MarketingPageKey } from "@/lib/marketingNav";
import { readPublicTeam } from "@/lib/publicTeam";

/**
 * "Where to go next", at the foot of all six inner pages.
 *
 * The same grid the home page uses, minus the page you are on and ending on
 * the same Book a video session tile. A visitor who arrives on /faq from a search
 * result should be able to reach the rest of the site without going back up
 * to a header nav and guessing - that guessing is what the redesign's
 * feedback was about - and should be able to act without hunting for the
 * one thing the site is for.
 */
export default async function ExploreSection({
  current,
  homeVisitEnabled,
}: {
  current: MarketingPageKey;
  homeVisitEnabled: boolean;
}) {
  // The team tile is dropped while nobody is published: a tile for a page
  // that says "our roster is being updated" is a dead end with a photograph.
  const { hasTeam } = await readPublicTeam();
  return (
    <Section
      id="explore"
      tone="panel"
      eyebrow="Explore"
      title="Where to go next"
      lede="Every other page - and a session, when you're ready."
    >
      <ExploreGrid connectors={exploreConnectors(current, homeVisitEnabled, hasTeam)} />
    </Section>
  );
}
