"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "article" | "div";
};

export default function ScrollReveal({ children, className, delay = 0, as = "div" }: ScrollRevealProps) {
  const reducedMotion = useReducedMotion();
  const MotionElement = as === "article" ? motion.article : motion.div;

  return (
    <MotionElement
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{ duration: reducedMotion ? 0 : 0.5, delay: reducedMotion ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionElement>
  );
}