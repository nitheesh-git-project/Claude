import Link from "next/link";

const conditions = [
  {
    icon: "fa-bone",
    title: "Spine & Posture Care",
    desc: "Sciatica, herniated discs, lower back stiffness, neck strain, and WFH ergonomic posture alignment.",
  },
  {
    icon: "fa-user-injured",
    title: "Post-Op Rehab",
    desc: "ACL reconstruction follow-up, total knee/hip replacement rehab, and rotator cuff post-surgical care.",
  },
  {
    icon: "fa-person-running",
    title: "Sports Injuries",
    desc: "Ankle sprains, tennis elbow, shoulder impingements, runner's knee, and joint stability training.",
  },
  {
    icon: "fa-laptop-house",
    title: "Desk Worker Care",
    desc: "Repetitive strain injuries (RSI), wrist pain, upper back tightness, and daily 10-minute mobility resets.",
  },
];

export default function Home() {
  return (
    <>
      {/* HERO */}
      <div className="bg-gradient-to-b from-teal-50/60 to-white py-16 lg:py-24 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-100 text-teal-800 mb-4 border border-teal-200">
              <i className="fa-solid fa-shield-halved text-teal-600"></i>{" "}
              Certified Global Telehealth Practice
            </span>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 leading-tight tracking-tight">
              Expert Virtual Physical Therapy for Global Patients —{" "}
              <span className="text-teal-700">Restoring Mobility from Home</span>
            </h1>
            <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed">
              Receive 1-on-1 evidence-based physical therapy, movement
              assessments, and customized rehabilitation plans from licensed
              specialists—no matter where you live in the world.
            </p>
            <div className="mt-8 flex flex-wrap gap-4 items-center">
              <Link
                href="/book"
                className="bg-teal-700 hover:bg-teal-800 text-white font-bold px-6 py-3.5 rounded-xl shadow-lg transition flex items-center gap-2"
              >
                <i className="fa-solid fa-calendar-check"></i> Book Assessment
                (₹1,999 INR)
              </Link>
              <Link
                href="/how-it-works"
                className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold px-6 py-3.5 rounded-xl transition flex items-center gap-2"
              >
                <i className="fa-solid fa-circle-play text-teal-600"></i>{" "}
                Watch How It Works
              </Link>
            </div>
            <div className="mt-10 grid grid-cols-3 gap-4 pt-6 border-t border-slate-200/80">
              <div>
                <p className="text-2xl font-bold text-slate-900">100+</p>
                <p className="text-xs text-slate-500 font-medium">Global Patients</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">100%</p>
                <p className="text-xs text-slate-500 font-medium">
                  Licensed Specialists
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">1-on-1</p>
                <p className="text-xs text-slate-500 font-medium">
                  Dedicated HD Video
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 relative">
            <div className="bg-slate-900 rounded-xl overflow-hidden aspect-video relative flex items-center justify-center text-white">
              <div className="relative text-center p-6">
                <div className="w-16 h-16 bg-teal-600/90 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg cursor-pointer hover:scale-105 transition">
                  <i className="fa-solid fa-play text-2xl text-white ml-1"></i>
                </div>
                <p className="font-semibold text-sm">
                  60-Min Guided Movement Evaluation
                </p>
                <p className="text-xs text-slate-300">
                  Live Video Consultation Sample
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between bg-teal-50 p-3 rounded-xl border border-teal-100">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 bg-teal-700 text-white rounded-full flex items-center justify-center font-bold text-xs">
                  DP
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    Dr. Pooja (PT)
                  </p>
                  <p className="text-[11px] text-teal-800">
                    Lead Specialist • 8+ Yrs Exp
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-teal-800 bg-white px-2.5 py-1 rounded-lg border border-teal-200">
                ₹1,999 INR / Session
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* CONDITIONS GRID OVERVIEW */}
      <div className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
            Conditions We Treat Virtually
          </h2>
          <p className="text-slate-600 mt-2 text-sm">
            Targeted, evidence-based rehabilitation protocols for acute and
            chronic musculoskeletal pain.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {conditions.map((c) => (
            <div
              key={c.title}
              className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition"
            >
              <div className="w-12 h-12 bg-teal-100 text-teal-700 rounded-xl flex items-center justify-center text-xl mb-4">
                <i className={`fa-solid ${c.icon}`}></i>
              </div>
              <h3 className="font-bold text-lg text-slate-800">{c.title}</h3>
              <p className="text-slate-600 text-xs mt-2 leading-relaxed">
                {c.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
