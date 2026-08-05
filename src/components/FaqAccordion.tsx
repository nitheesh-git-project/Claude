"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Stagger, StaggerItem } from "@/components/motion/primitives";

type Faq = { id: string | number; question: string; answer: string };

export default function FaqAccordion({ faqs }: { faqs: Faq[] }) {
  const [openId, setOpenId] = useState<Faq["id"] | null>(faqs[0]?.id ?? null);

  return (
    <Stagger className="space-y-3">
      {faqs.map((f) => {
        const isOpen = openId === f.id;
        return (
          <StaggerItem key={f.id}>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setOpenId(isOpen ? null : f.id)}
                className="w-full flex items-center justify-between gap-4 cursor-pointer font-bold text-sm text-slate-900 text-left p-5"
                aria-expanded={isOpen}
              >
                {f.question}
                <motion.i
                  className="fa-solid fa-chevron-down text-teal-600 text-xs shrink-0"
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.25 }}
                />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="text-slate-600 text-sm leading-relaxed px-5 pb-5">
                      {f.answer}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
