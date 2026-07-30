"use client";

import { useState } from "react";
import Link from "next/link";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import { formatIST } from "@/lib/formatIST";

type Person = {
  id: string;
  full_name: string | null;
  subtitle: string | null;
  avatar_url: string | null;
  active: boolean;
  approved?: boolean;
  created_at: string;
};

export default function AdminPeopleDirectory({
  people,
  basePath,
}: {
  people: Person[];
  basePath: string;
}) {
  const [view, setView] = useState<"grid" | "list">("grid");

  function badge(p: Person) {
    if (!p.active) {
      return (
        <span className="text-[9px] font-bold uppercase text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full">
          Suspended
        </span>
      );
    }
    if (p.approved === false) {
      return (
        <span className="text-[9px] font-bold uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
          Pending
        </span>
      );
    }
    return null;
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[11px] font-semibold">
          <button
            onClick={() => setView("grid")}
            className={`px-3 py-1.5 transition flex items-center gap-1.5 ${
              view === "grid" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <i className="fa-solid fa-grip"></i> Grid
          </button>
          <button
            onClick={() => setView("list")}
            className={`px-3 py-1.5 transition flex items-center gap-1.5 border-l border-slate-200 ${
              view === "list" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <i className="fa-solid fa-list"></i> List
          </button>
        </div>
      </div>

      {view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {people.map((p) => (
            <Link
              key={p.id}
              href={`${basePath}/${p.id}`}
              className="flex flex-col items-center text-center p-4 rounded-xl border border-slate-200 hover:border-teal-300 hover:shadow-sm transition relative"
            >
              {badge(p) && <span className="absolute top-2 right-2">{badge(p)}</span>}
              <AvatarThumbnail url={p.avatar_url} name={p.full_name ?? "U"} size={56} />
              <p className="font-bold text-slate-900 text-xs mt-2 line-clamp-1">{p.full_name}</p>
              <p className="text-slate-500 text-[11px] line-clamp-1">{p.subtitle}</p>
              <p className="text-slate-400 text-[10px] mt-1">Joined {formatIST(p.created_at)}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold">Details</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold">Joined (IST)</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td className="py-2 pr-3">
                    <Link
                      href={`${basePath}/${p.id}`}
                      className="flex items-center gap-2.5 font-bold text-slate-900 hover:text-teal-700 hover:underline transition"
                    >
                      <AvatarThumbnail url={p.avatar_url} name={p.full_name ?? "U"} size={28} />
                      {p.full_name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-slate-500">{p.subtitle}</td>
                  <td className="py-2 pr-3">{badge(p) ?? <span className="text-slate-400">Active</span>}</td>
                  <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{formatIST(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
