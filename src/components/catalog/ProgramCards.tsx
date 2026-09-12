"use client";

import { useState } from "react";
import Link from "next/link";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import Modal, { useLastNonNull } from "@/components/Modal";
import type { CareIllustrationId } from "@/components/visuals/CareIllustration";
import CatalogCard from "@/components/catalog/CatalogCard";
import CatalogDialogHeader from "@/components/catalog/CatalogDialogHeader";
import {
  CheckList,
  ProseSection,
  StatTiles,
  rupees,
  type StatTile,
} from "@/components/catalog/CatalogVisuals";

export type PublicProgram = {
  id: string;
  title: string;
  description: string | null;
  points: unknown;
  price_paise: number;
  // Both present on the base treatment_categories table, so unlike the
  // package detail columns these need no isolated query -- optional only
  // because the home page's own hero query selects a narrower list.
  duration_minutes?: number | null;
  cta_label?: string | null;
  /**
   * Admin-supplied cover photo. Migration-dependent (see the "cover
   * photograph on a programme" section at the end of schema.sql), so callers
   * read it in an isolated query and merge it in; undefined here means the
   * column is not in this database yet, which renders the same placeholder as
   * a programme whose photo simply has not been chosen.
   */
  image_url?: string | null;
  /** Where the subject of the cover sits. Migration-dependent, so
   *  optional: a caller reading a database without the columns hands
   *  through undefined and the picture centres, as it always did. */
  image_focal_x?: number | null;
  image_focal_y?: number | null;
};

// Rotates through the illustration set so a grid of programmes does not
// repeat one drawing down the page. Index-based rather than stored on the
// row: these are admin-created records with no art field, and inventing one
// would put an image-picking chore on every new programme.
const PROGRAM_ART: CareIllustrationId[] = ["neckback", "mobility", "sports", "ergonomics"];

/**
 * The programme grid for the home page and /conditions, which rendered two
 * near-identical copies of this markup before.
 *
 * Same interaction contract as the package cards: the card body opens a
 * detail dialog, and booking is its own button both on the card and in the
 * dialog. A programme card was previously a single link to checkout, which
 * left a visitor no way to read what the programme actually involves before
 * committing to it.
 */
export default function ProgramCards({
  programs,
  columns = "two",
}: {
  programs: PublicProgram[];
  /** /conditions runs a two-column grid; the home page matches it. */
  columns?: "two" | "three";
}) {
  // The illustration is picked by grid position, so the selection carries
  // that index with it -- deriving it from the id at render time would flip
  // the drawing mid close-animation, once the id has already been cleared.
  const [selected, setSelected] = useState<{ program: PublicProgram; index: number } | null>(
    null
  );

  if (programs.length === 0) return null;

  return (
    <>
      {/* Layout stays generic: these rows are admin-controlled from Site
          Content, so it has to hold for any number of programmes and any
          length of copy. */}
      <Stagger
        className={`grid gap-6 ${
          columns === "three" ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2"
        }`}
      >
        {programs.map((program, i) => {
          const points = Array.isArray(program.points) ? (program.points as string[]) : [];
          const summary =
            program.description || points[0] || "Learn more about this programme.";
          return (
            <StaggerItem key={program.id} className="h-full">
              <CatalogCard
                data={{
                  id: program.id,
                  title: program.title,
                  summary,
                  imageUrl: program.image_url ?? null,
                  focalX: program.image_focal_x,
                  focalY: program.image_focal_y,
                  // Facts that were only readable by opening the dialog.
                  meta: [`${program.duration_minutes ?? 60} min`, "Video session", "1-on-1"],
                  points,
                  pricePaise: program.price_paise,
                  priceUnit: `/ ${program.duration_minutes ?? 60} min session`,
                  bookHref: `/book?category=${program.id}`,
                  bookLabel: program.cta_label?.trim() || "Book this session",
                  art: PROGRAM_ART[i % PROGRAM_ART.length],
                }}
                onOpenDetails={() => setSelected({ program, index: i })}
              />
            </StaggerItem>
          );
        })}
      </Stagger>

      <ProgramDetail
        selection={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

function ProgramDetail({
  selection,
  onClose,
}: {
  selection: { program: PublicProgram; index: number } | null;
  onClose: () => void;
}) {
  // Held through the close animation so the panel does not empty out mid-fade.
  const held = useLastNonNull(selection);
  const program = held?.program ?? null;
  const artIndex = held?.index ?? 0;
  const points = program && Array.isArray(program.points) ? (program.points as string[]) : [];

  const stats: StatTile[] = program
    ? [
        {
          label: "Session",
          value: `${program.duration_minutes ?? 60} minutes, 1-on-1`,
          icon: "fa-video",
        },
        { label: "Price", value: `${rupees(program.price_paise)} / session`, icon: "fa-tag" },
        { label: "Starts with", value: "A full assessment", icon: "fa-clipboard-check" },
      ]
    : [];

  return (
    <Modal
      open={selection !== null}
      onClose={onClose}
      labelledBy="program-modal-title"
      closeLabel="Close programme details"
      closeTone="dark"
    >
      {program && (
        <>
          {/* The cover, uncovered.
              Two things were wrong here. This dialog never read `image_url`
              at all -- it drew a teal panel and a vector illustration -- so
              once admins could upload real photographs a card would show one
              and its own dialog a cartoon, one tap apart. And the home-visit
              dialog beside it laid its heading over the picture, which means
              a scrim dark enough to survive any photograph and a heading
              sized to fight it.
              Neither now: the photograph gets the full 16:9 with nothing on
              top, and the heading sits on its own band below, where it can be
              ordinary dark-on-white type. The frame keeps its shape when
              there is no picture, so the dialog never changes height
              depending on whether the catalogue has been filled in yet. */}
          <CatalogDialogHeader
            titleId="program-modal-title"
            title={program.title}
            eyebrow="Structured programme"
            subtitle={program.description}
            imageUrl={program.image_url}
            focalX={program.image_focal_x}
            focalY={program.image_focal_y}
            art={PROGRAM_ART[artIndex % PROGRAM_ART.length]}
          />

          <div className="px-6 py-6 sm:px-8">
            <StatTiles items={stats} />

            <ProseSection title="About this programme" body={program.description} />
            <CheckList items={points} title="What this covers" />

            <div className="mt-8 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                Every programme opens with the same 60-minute assessment.
              </p>
              <Link
                href={`/book?category=${program.id}`}
                onClick={onClose}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/15 transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                <i aria-hidden="true" className="fa-solid fa-calendar-check" />
                {program.cta_label?.trim() || "Book this programme"}
              </Link>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
