"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

export default function AmbientGlow() {
  const { scrollY } = useScroll();
  const reducedMotion = useReducedMotion();
  const y = useTransform(scrollY, [0, 2400], [0, 180]);

  return (
    <motion.div
      className="ambient-glow"
      style={{ y: reducedMotion ? 0 : y }}
      aria-hidden="true"
    />
  );
}