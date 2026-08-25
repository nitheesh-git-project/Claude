import { Stagger, StaggerItem } from "@/components/motion/primitives";
import PhotoTile from "@/components/marketing/PhotoTile";
import type { MarketingConnector } from "@/lib/marketingNav";

/**
 * The site's index, as photographs.
 *
 * This is the connector band the home page scrolls down into, and the strip
 * at the foot of the other six pages. It exists because the header nav asks
 * a visitor to guess what "Conditions Treated" or "How It Works" contains
 * from two words and no picture; here every destination shows what it is and
 * says why you would open it, so nobody has to guess their way around the
 * site to find the one page that answers their question.
 *
 * The list comes from `marketingNav.ts` rather than being written out here,
 * so a page cannot be added to the site and quietly left out of its index.
 */
export default function ExploreGrid({
  connectors,
}: {
  connectors: MarketingConnector[];
}) {
  return (
    <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {connectors.map((connector) => {
        // Booking is the action, not a seventh thing to read, so it takes the
        // whole last row rather than leaving one orphaned tile beside two
        // empty cells.
        const wide = connector.key === "book";
        return (
          <StaggerItem
            key={connector.key}
            className={wide ? "h-full sm:col-span-2 lg:col-span-3" : "h-full"}
          >
            <PhotoTile
              wide={wide}
              href={connector.href}
              photoId={connector.photo}
              alt={connector.photoAlt}
              title={connector.label}
              blurb={connector.blurb}
              action={connector.action}
              icon={connector.icon}
            />
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
