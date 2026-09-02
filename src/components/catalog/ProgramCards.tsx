"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import Modal, { useLastNonNull } from "@/components/Modal";
import CareIllustration, {
  type CareIllustrationId,
} from "@/components/visuals/CareIllustration";
import CatalogImage from "@/components/catalog/CatalogImage";
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
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:border-teal-300 hover:shadow-xl hover:shadow-slate-900/5"
              >
                <button
                  type="button"
                  onClick={() => setSelected({ program, index: i })}
                  aria-haspopup="dialog"
                  className="flex flex-1 cursor-pointer flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500"
                >
                  {/* Same slot, same height as the package cards one band
                      away, so the two grids read as one catalog. */}
                  <CatalogImage
                    src={program.image_url}
                    art={PROGRAM_ART[i % PROGRAM_ART.length]}
                    className="h-40 rounded-t-2xl"
                  />

                  <div className="flex flex-1 flex-col p-6 sm:p-7">
                    <div className="min-w-0">
                      <h3 className="font-display text-lg font-bold text-slate-900">
                        {program.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{summary}</p>
                    </div>

                    {points.length > 0 && (
                      <ul className="mt-5 grid gap-2 border-t border-slate-100 pt-5 sm:grid-cols-2">
                        {points.slice(0, 4).map((pt) => (
                          <li
                            key={pt}
                            className="flex items-start gap-2 text-xs leading-snug text-slate-700"
                          >
                            <i
                              aria-hidden="true"
                              className="fa-solid fa-circle-check mt-0.5 shrink-0 text-teal-600"
                            />
                            {pt}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-auto flex items-baseline gap-2 pt-6">
                      <span className="font-display text-lg font-bold text-slate-900">
                        {rupees(program.price_paise)}
                      </span>
                      <span className="text-xs font-normal text-slate-500">
                        / {program.duration_minutes ?? 60} min session
                      </span>
                    </div>
                  </div>
                </button>

                <div className="flex flex-col gap-2 px-6 pb-6 sm:px-7">
                  <Link
                    href={`/book?category=${program.id}`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                  >
                    <i aria-hidden="true" className="fa-solid fa-calendar-check" />
                    {program.cta_label?.trim() || "Book this programme"}
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSelected({ program, index: i })}
                    aria-haspopup="dialog"
                    className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl px-5 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                  >
                    View full details
                    <i
                      aria-hidden="true"
                      className="fa-solid fa-arrow-right text-[10px] transition-transform group-hover:translate-x-1"
                    />
                  </button>
                </div>
              </motion.div>
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
          <div className="relative overflow-hidden bg-gradient-to-br from-teal-800 to-emerald-700 px-6 pb-7 pt-8 sm:px-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-14 -top-14 h-52 w-52 rounded-full bg-white/10 blur-2xl"
            />
            <div className="relative flex items-center gap-5">
              <div className="h-20 w-24 shrink-0 rounded-xl bg-white/15 p-2 ring-1 ring-white/25">
                <CareIllustration
                  id={PROGRAM_ART[artIndex % PROGRAM_ART.length]}
                  className="h-full w-full text-white"
                />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-200">
                  Structured programme
                </span>
                <h3
                  id="program-modal-title"
                  className="font-display mt-1 text-2xl font-extrabold text-white sm:text-3xl"
                >
                  {program.title}
                </h3>
              </div>
            </div>
          </div>

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
