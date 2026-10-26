"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";

type FAQItemData = {
  question: string;
  answer: string;
};

type FAQAccordionProps = {
  items: readonly FAQItemData[];
};

function FAQItem({ question, answer, index }: FAQItemData & { index: number }) {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const answerId = `faq-answer-${index}`;

  return (
    <div className="faq-item">
      <button className="faq-question" type="button" aria-expanded={open} aria-controls={answerId} onClick={() => setOpen(!open)}>
        <span>{question}</span>
        <span className="faq-icon"><ArrowRight size={18} aria-hidden="true" /></span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={answerId}
            className="faq-answer-wrap"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.32, ease: "easeInOut" }}
          >
            <p>{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FAQAccordion({ items }: FAQAccordionProps) {
  return (
    <div className="faq-list">
      {items.map((item, index) => <FAQItem key={item.question} {...item} index={index} />)}
    </div>
  );
}