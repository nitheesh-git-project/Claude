import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Specialist Team | Dr. Pooja's Physio",
  description:
    "Meet our licensed clinical specialists — certified physical therapy professionals dedicated to global virtual care.",
};

const team = [
  {
    initials: "DP",
    name: "Dr. Pooja (PT)",
    cred: "BPT, MPT (Musculoskeletal)",
    reg: "Council Reg: PT-802194",
    bio: "8+ years clinical experience treating 1,000+ international and Indian patients with a focus on virtual spine care.",
    founder: true,
  },
  {
    initials: "RK",
    name: "Dr. Rajesh Kumar (PT)",
    cred: "MPT (Neurology & Rehab)",
    reg: "Council Reg: PT-104928",
    bio: "Specialized in sports impingements, knee rehabilitation, and post-surgical mobility recovery.",
    founder: false,
  },
];

export default function TeamPage() {
  return (
    <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <h1 className="text-3xl font-bold text-slate-900">
          Meet Our Licensed Clinical Specialists
        </h1>
        <p className="text-slate-600 mt-2 text-sm">
          Certified physical therapy professionals dedicated to global
          virtual care.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-8">
        {team.map((member) => (
          <div
            key={member.name}
            className={
              member.founder
                ? "bg-white rounded-2xl border-2 border-teal-600 p-6 shadow-md relative overflow-hidden"
                : "bg-white rounded-2xl border border-slate-200 p-6 shadow-sm"
            }
          >
            {member.founder && (
              <span className="absolute top-4 right-4 bg-teal-100 text-teal-800 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full">
                Lead Founder
              </span>
            )}
            <div
              className={`w-20 h-20 ${
                member.founder ? "bg-teal-700" : "bg-slate-700"
              } text-white rounded-full flex items-center justify-center text-2xl font-bold mb-4 shadow`}
            >
              {member.initials}
            </div>
            <h3 className="text-xl font-bold text-slate-900">{member.name}</h3>
            <p className="text-xs font-semibold text-teal-700">{member.cred}</p>
            <p className="text-xs text-slate-500 mt-1">{member.reg}</p>
            <p className="text-xs text-slate-600 mt-3 leading-relaxed">
              {member.bio}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
