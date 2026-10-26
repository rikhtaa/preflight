"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";

type MotionCounterProps = {
  value: number;
};

export default function MotionCounter({ value }: MotionCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -48px 0px" });
  const reducedMotion = useReducedMotion();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reducedMotion) {
      const timeout = window.setTimeout(() => setCount(value), 0);
      return () => window.clearTimeout(timeout);
    }

    const controls = animate(0, value, {
      duration: 0.48,
      ease: "easeOut",
      onUpdate: (latest) => setCount(Math.round(latest)),
    });

    return () => controls.stop();
  }, [inView, reducedMotion, value]);

  return <span ref={ref} aria-label={String(value)}>{count}</span>;
}