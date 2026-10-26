"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, LoaderCircle, ScanSearch } from "lucide-react";

const steps = [
  "Fetching page",
  "Reading 14 script files",
  "Checking headers",
  "Looking for exposed files",
];

export default function HeroScanCard() {
  const [phase, setPhase] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      const timeout = window.setTimeout(() => setPhase(7), 0);
      return () => window.clearTimeout(timeout);
    }

    const interval = window.setInterval(() => {
      setPhase((current) => current >= 7 ? 0 : current + 1);
    }, 850);

    return () => window.clearInterval(interval);
  }, [reducedMotion]);

  const visibleSteps = Math.min(phase, steps.length);
  const progress = Math.min(100, Math.round((phase / 5) * 100));
  const showFindings = phase >= 6;

  return (
    <div className="hero-scan-card" aria-label="Sample scan preview">
      <div className="hero-scan-topline">
        <div className="hero-scan-title"><ScanSearch size={20} aria-hidden="true" /><span>Sample scan</span></div>
        <span className="hero-sample-tag">FAKE DATA</span>
      </div>
      <ul className="hero-scan-steps" aria-live="polite">
        {steps.map((step, index) => (
          <li className="hero-scan-step" key={step}>
            <AnimatePresence initial={false}>
              {index < visibleSteps && (
                <motion.span
                  className="hero-scan-step-content"
                  initial={reducedMotion ? false : { opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.24 }}
                >
                  <span className="hero-scan-check">{index < visibleSteps - 1 || showFindings ? <Check size={15} aria-hidden="true" /> : <LoaderCircle size={15} aria-hidden="true" />}</span>
                  <span>{step}</span>
                </motion.span>
              )}
            </AnimatePresence>
          </li>
        ))}
      </ul>
      <div className="hero-progress-track" role="progressbar" aria-label="Sample scan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <motion.div
          className="hero-progress-fill"
          initial={false}
          animate={{ scaleX: progress / 100 }}
          transition={{ duration: reducedMotion ? 0 : 0.5, ease: "easeOut" }}
        />
      </div>
      <div className="hero-scan-bottom">
        <span className="hero-scan-status">{showFindings ? "Sample findings" : "Checking public signals"}</span>
        <div className="hero-severity-list" aria-label="Sample severity badges">
          <AnimatePresence initial={false}>
            {showFindings && (
              <motion.div
                className="hero-severity-items"
                initial={reducedMotion ? false : "hidden"}
                animate="visible"
                exit="hidden"
                variants={{
                  hidden: { opacity: 0, y: 5 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.24, staggerChildren: 0.07 } },
                }}
              >
                <motion.span className="severity-badge severity-critical" variants={{ hidden: { opacity: 0, scale: 0.86 }, visible: { opacity: 1, scale: 1, transition: { duration: 0.22 } } }}>Critical</motion.span>
                <motion.span className="severity-badge severity-high" variants={{ hidden: { opacity: 0, scale: 0.86 }, visible: { opacity: 1, scale: 1, transition: { duration: 0.22 } } }}>High</motion.span>
                <motion.span className="severity-badge severity-medium" variants={{ hidden: { opacity: 0, scale: 0.86 }, visible: { opacity: 1, scale: 1, transition: { duration: 0.22 } } }}>Medium</motion.span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <span className="hero-scan-disclaimer">Illustrative only. No real scan is running.</span>
    </div>
  );
}