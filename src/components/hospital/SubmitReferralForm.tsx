"use client";

import { useState } from "react";
import { useRouter } from "@/lib/useRouter";
import PhoneNumberField from "@/components/PhoneNumberField";
import { isValidStoredPhone } from "@/lib/phoneNumber";

export default function SubmitReferralForm({
  homeVisitEnabled,
}: {
  // Master switch from site_settings -- a hospital shouldn't be offered a
  // delivery mode the platform hasn't turned on yet, same gate the public
  // booking wizards already honour.
  homeVisitEnabled: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [visitMode, setVisitMode] = useState<"online" | "home_visit">("online");
  // Not a FormData field like the rest: PhoneNumberField owns a country code
  // and a national number and composes the stored E.164 string, so the value
  // lives in state and is reset by hand below rather than by form.reset().
  const [patientPhone, setPatientPhone] = useState("");
  // PhoneNumberField seeds its country/national state from `value` on first
  // render only (deliberately -- see its comment), so clearing the string
  // after a submit does not clear what is on screen. Bumping this key
  // remounts it, which is what actually empties the field.
  const [phoneFieldKey, setPhoneFieldKey] = useState(0);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    const pincode = (formData.get("pincode") as string) || "";
    if (visitMode === "home_visit" && !/^[1-9]\d{5}$/.test(pincode.trim())) {
      setLoading(false);
      setError("Enter the patient's 6-digit pincode for a home visit referral.");
      return;
    }
    // Required, because the clinic phones this patient before sending them a
    // registration link -- a referral with no number means going back to the
    // hospital to ask for one, which is the delay this field removes.
    if (!isValidStoredPhone(patientPhone)) {
      setLoading(false);
      setError("Enter the patient's phone number so our team can reach them.");
      return;
    }

    // Through a route rather than straight into the table. The insert
    // policy only ever checked that the row named this hospital, so a
    // suspended or never-approved partner could keep filing referrals, and
    // every rule above was enforced in this file alone -- see the route's
    // own comment. The checks here stay, because catching a blank field in
    // the browser is faster and kinder than a round trip; they are no
    // longer the only place they happen.
    let res: Response;
    try {
      res = await fetch("/api/hospital/submit-referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: formData.get("patient_name") as string,
          patientPhone,
          address: (formData.get("address") as string) || "",
          preferredLanguage: (formData.get("preferred_language") as string) || "",
          medicalIssue: formData.get("medical_issue") as string,
          treatmentNeeded: (formData.get("treatment_needed") as string) || "",
          visitMode,
          pincode: visitMode === "home_visit" ? pincode.trim() : "",
        }),
      });
    } catch {
      // A request that died on a bad connection must leave the form exactly
      // as it was, with everything the hospital typed still in it.
      setLoading(false);
      setError("Could not reach us just now. Please check your connection and try again.");
      return;
    }

    setLoading(false);
    if (!res.ok) {
      // The route answers with a sentence naming what it refused -- a
      // suspended account, a pincode, a withdrawn home-visit service. Read
      // it rather than replacing all of them with one generic line.
      const payload = await res.json().catch(() => null);
      setError(
        (payload as { error?: string } | null)?.error ??
          "Could not submit the referral. Please try again."
      );
      return;
    }
    setSuccess(true);
    setVisitMode("online");
    setPatientPhone("");
    setPhoneFieldKey((k) => k + 1);
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-xs">
      {error && (
        <div className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}
      {success && (
        <div className="text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-3">
          Referral submitted - our team will review and reach out.
        </div>
      )}

      <label className="block">
        <span className="block font-semibold mb-1">Patient Full Name</span>
        <input
          name="patient_name"
          required
          className="w-full p-2.5 rounded-lg border border-slate-300"
        />
      </label>
      <PhoneNumberField
        key={phoneFieldKey}
        value={patientPhone}
        onChange={setPatientPhone}
        name="patient_phone"
        label="Patient Phone Number"
        required
      />
      {homeVisitEnabled && (
        <div>
          <label className="block font-semibold mb-1">Session Type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setVisitMode("online")}
              className={`flex-1 rounded-lg border px-3 py-2 font-semibold transition ${
                visitMode === "online"
                  ? "border-blue-700 bg-blue-50 text-blue-800"
                  : "border-slate-300 text-slate-600"
              }`}
            >
              Online Consultation
            </button>
            <button
              type="button"
              onClick={() => setVisitMode("home_visit")}
              className={`flex-1 rounded-lg border px-3 py-2 font-semibold transition ${
                visitMode === "home_visit"
                  ? "border-blue-700 bg-blue-50 text-blue-800"
                  : "border-slate-300 text-slate-600"
              }`}
            >
              Home Visit
            </button>
          </div>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block font-semibold mb-1">Address</span>
          <input
            name="address"
            required={visitMode === "home_visit"}
            className="w-full p-2.5 rounded-lg border border-slate-300"
          />
        </label>
        <label className="block">
          <span className="block font-semibold mb-1">
            Preferred Language
          </span>
          <input
            name="preferred_language"
            className="w-full p-2.5 rounded-lg border border-slate-300"
          />
        </label>
      </div>
      {visitMode === "home_visit" && (
        <label className="block">
          <span className="block font-semibold mb-1">Pincode</span>
          <input
            name="pincode"
            inputMode="numeric"
            maxLength={6}
            required
            className="w-full p-2.5 rounded-lg border border-slate-300 sm:w-1/2"
          />
        </label>
      )}
      <label className="block">
        <span className="block font-semibold mb-1">Medical Issue</span>
        <textarea
          name="medical_issue"
          rows={2}
          required
          className="w-full p-2.5 rounded-lg border border-slate-300"
        />
      </label>
      <label className="block">
        <span className="block font-semibold mb-1">
          Treatment Needed{" "}
          <span className="font-normal text-slate-500">(optional)</span>
        </span>
        <textarea
          name="treatment_needed"
          rows={2}
          className="w-full p-2.5 rounded-lg border border-slate-300"
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition"
      >
        {loading ? "Submitting..." : "Submit Referral"}
      </button>
    </form>
  );
}
