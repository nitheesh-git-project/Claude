"use client";

import { useId, useRef, useState } from "react";
import PhoneNumberField from "@/components/PhoneNumberField";
import { isValidStoredPhone } from "@/lib/phoneNumber";
import { rateLimitNotice } from "@/lib/rateLimit";
import {
  MAX_DEV_REACHOUT_EMAIL_LENGTH,
  MAX_DEV_REACHOUT_MESSAGE_LENGTH,
  MAX_DEV_REACHOUT_NAME_LENGTH,
  firstName,
} from "@/lib/devReachout";

const FIELD =
  "w-full bg-transparent border-0 border-b border-slate-300 px-0 py-2.5 text-slate-900 placeholder:text-slate-500 focus:border-teal-700 focus:outline-none focus-visible:border-b-2";
const LABEL = "block text-xs font-semibold text-slate-600";

export default function DevReachoutForm() {
  const [submittedName, setSubmittedName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  // A synchronous guard as well as `disabled`: the attribute lands a render
  // too late to stop a double tap from sending twice.
  const sending = useRef(false);
  const nameId = useId();
  const emailId = useId();
  const messageId = useId();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending.current) return;
    setError(null);

    // Optional, but one that is given has to be dialable.
    if (phone && !isValidStoredPhone(phone)) {
      setError("Please enter a valid contact number, or leave it blank.");
      return;
    }

    sending.current = true;
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const name = String(formData.get("name") ?? "");

    try {
      const res = await fetch("/api/developer/reachout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: formData.get("email"),
          phone: phone || "",
          message: formData.get("message"),
          website: formData.get("website"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          rateLimitNotice(
            data.error ?? "Could not send your message. Please try again.",
            data.retryAfterSeconds
          )
        );
        return;
      }
      setSubmittedName(name);
    } catch {
      // A request that dies on a bad connection has to say so -- left
      // unhandled it put nothing on screen and read as a dead button.
      setError("Could not reach us just now. Please check your connection and try again.");
    } finally {
      sending.current = false;
      setLoading(false);
    }
  }

  if (submittedName !== null) {
    return (
      <div role="status" className="text-center py-10">
        <i aria-hidden="true" className="fa-solid fa-circle-check text-teal-700 text-4xl mb-4"></i>
        <p className="font-display text-xl font-bold text-slate-900">
          Thanks, {firstName(submittedName)}.
        </p>
        <p className="mt-2 text-slate-600">Nitheesh will be reaching you shortly.</p>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div
          role="alert"
          className="mb-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 text-sm">
        <div>
          <label htmlFor={nameId} className={LABEL}>
            Full name*
          </label>
          <input
            id={nameId}
            type="text"
            name="name"
            required
            maxLength={MAX_DEV_REACHOUT_NAME_LENGTH}
            autoComplete="name"
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor={emailId} className={LABEL}>
            Email*
          </label>
          <input
            id={emailId}
            type="email"
            name="email"
            required
            maxLength={MAX_DEV_REACHOUT_EMAIL_LENGTH}
            autoComplete="email"
            className={FIELD}
          />
        </div>
        <PhoneNumberField
          value={phone}
          onChange={setPhone}
          label="Contact number (optional)"
          labelClassName={`${LABEL} mb-1`}
        />
        <div>
          <label htmlFor={messageId} className={LABEL}>
            Message*
          </label>
          <textarea
            id={messageId}
            name="message"
            required
            rows={4}
            maxLength={MAX_DEV_REACHOUT_MESSAGE_LENGTH}
            className={`${FIELD} resize-y`}
          />
        </div>

        {/* The honeypot. A person never sees it, reaches it by keyboard or is
            told about it by a screen reader; a script filling every input
            fills it, and the route then answers as a success and writes
            nothing. Moved off-screen rather than display:none, which some
            bots skip. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Leave this field empty
            <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full sm:w-auto rounded-full bg-slate-900 hover:bg-teal-700 disabled:opacity-60 text-white font-bold px-8 py-3 transition"
        >
          {loading ? "Sending…" : "Let's talk ↗"}
        </button>
      </form>
    </>
  );
}
