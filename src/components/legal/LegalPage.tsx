import Link from "next/link";
import type { Metadata } from "next";
import { getLayoutSettings } from "@/lib/siteSettingsCache";
import { parseAdminSettings } from "@/lib/adminSettings";
import { readOnlineBookingRules } from "@/lib/homeVisitFlag";
import { LEGAL_FACTS } from "@/lib/legal/legalFacts";
import {
  LEGAL_PAGES,
  formatEffectiveDate,
  legalDoc,
  type LegalBlock,
  type LegalDoc,
  type LegalSlug,
} from "@/lib/legal/legalDocs";

// The one layout every legal page shares. Deliberately not the marketing
// template (no hero, no photograph, no closing CTA): a policy is read, not
// sold, and a reader looking for one clause wants the contents list and the
// date, not a pitch.

async function loadDoc(slug: LegalSlug): Promise<LegalDoc> {
  const [{ brand }, rules] = await Promise.all([getLayoutSettings(), readOnlineBookingRules()]);
  const settings = parseAdminSettings(brand);
  return legalDoc(slug, {
    siteName: settings.siteName,
    contactEmail: settings.contactEmail,
    leadTimeHours: rules.leadTimeHours,
    refundHours: rules.refundHours,
  });
}

export async function legalMetadata(slug: LegalSlug): Promise<Metadata> {
  const doc = await loadDoc(slug);
  return { title: `${doc.title} | MoveRestore`, description: doc.summary };
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string") {
    return <p className="mt-3 text-sm leading-relaxed text-slate-700">{block}</p>;
  }
  if ("list" in block) {
    return (
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">
        {block.list.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-900">
          <tr>
            {block.table.head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {block.table.rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell, i) => (
                <td key={i} className="px-3 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function LegalPage({ slug }: { slug: LegalSlug }) {
  const doc = await loadDoc(slug);
  const effective = formatEffectiveDate(LEGAL_FACTS.effectiveDate);
  return (
    <div className="bg-white">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Legal</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">{doc.title}</h1>
        <p className="mt-2 text-base text-slate-600">{doc.summary}</p>
        {effective && <p className="mt-2 text-xs text-slate-500">Last updated {effective}</p>}

        <nav aria-label="On this page" className="mt-8 rounded-2xl bg-slate-50 p-5">
          <h2 className="text-sm font-semibold text-slate-900">On this page</h2>
          <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {doc.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="inline-flex min-h-11 items-center text-teal-700 hover:underline">
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {doc.sections.map((s) => (
          <section key={s.id} id={s.id} className="mt-10 scroll-mt-24">
            <h2 className="font-display text-xl font-semibold text-slate-900">{s.heading}</h2>
            {s.blocks.map((b, i) => (
              <Block key={i} block={b} />
            ))}
          </section>
        ))}

        <nav aria-label="Other legal pages" className="mt-14 border-t border-slate-200 pt-6">
          <ul className="flex flex-wrap gap-x-5 text-sm">
            {LEGAL_PAGES.filter((p) => p.slug !== slug).map((p) => (
              <li key={p.slug}>
                <Link href={p.href} className="inline-flex min-h-11 items-center text-slate-600 hover:text-teal-700">
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
