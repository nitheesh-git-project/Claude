// The questions /faq answers when the clinic has published none.
//
// A new clinic, a database the debug reset has just truncated, a table nobody
// has opened the screen for: all of them rendered "No questions posted yet",
// on the page a hesitant patient visits to be reassured. `mission.ts` solved
// the same problem for the promises (an empty table falls back to the shipped
// wording); this is the FAQ's version. It applies only to a table with **no
// active rows** -- once an admin publishes a single question, these step aside
// entirely, and switching every row off is their decision, honoured.
//
// The answers carry no figure that is not passed in. Prices, the refund window
// and the lead time are admin settings, and a number typed into an answer is
// the first thing to go stale (see faqLiveFacts.ts); the two hours below come
// from the settings the booking wizard enforces, and a price is never quoted.
// Dependency-free so the rule is unit-tested.

import { hoursNoticeLabel, refundWindowLine } from "@/lib/sessionLengthCopy";

export type DefaultFaq = { id: string; question: string; answer: string };

export function defaultFaqs(rules: { leadTimeHours: number; refundHours: number }): DefaultFaq[] {
  return [
    {
      id: "default-what-happens",
      question: "What happens in a session?",
      answer:
        "A licensed physiotherapist watches how you move, asks what sets your pain off, and builds an exercise plan for you. You leave with the plan and a short summary of what was found.",
    },
    {
      id: "default-what-i-need",
      question: "What do I need for a video session?",
      answer:
        "A phone, tablet or laptop with a camera and a steady connection, and enough floor space to move. You get a video link by email and in your account. There is no app to install.",
    },
    {
      id: "default-cost",
      question: "How much does it cost, and how do I pay?",
      answer:
        "The price of your session is shown before you pay, and you pay online by UPI. Nothing is charged until you confirm the booking.",
    },
    {
      id: "default-cancel",
      question: "Can I cancel or change a booking?",
      answer: `${refundWindowLine(rules.refundHours)} You can see the cut-off for your session in your account.`,
    },
    {
      id: "default-notice",
      question: "How soon can I be seen?",
      answer: `Bookings need ${hoursNoticeLabel(rules.leadTimeHours)}, so there is time to read your reports first. The times you can pick are shown in your own timezone.`,
    },
    {
      id: "default-reports",
      question: "Who sees the scans and reports I upload?",
      answer:
        "Your physiotherapist and the clinic's admin team, nobody else. They are stored privately and the links expire.",
    },
    {
      id: "default-hands-on",
      question: "What if I need hands-on treatment?",
      answer:
        "Most recovery is driven by the right exercises, and video shows how you move. If your assessment shows you need hands-on care, your physiotherapist will say so.",
    },
  ];
}
