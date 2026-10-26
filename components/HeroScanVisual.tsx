"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion } from "motion/react";
import type { AnimationPlaybackControls } from "motion/react";
import { Pause, Play } from "lucide-react";

const captions = [
  "Reading script files",
  "Checking headers",
  "Looking for exposed files",
];

const findingPositions = [52, 139, 229];
const sweepDistance = 282;

export default function HeroScanVisual() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [captionIndex, setCaptionIndex] = useState(0);
  const [visibleFindings, setVisibleFindings] = useState(0);
  const reducedMotion = useReducedMotion();
  const scanY = useMotionValue(0);
  const playback = useRef<AnimationPlaybackControls | null>(null);
  const previousY = useRef(0);
  const revealedCount = useRef(0);

  useEffect(() => {
    if (reducedMotion) {
      scanY.set(0);
      const timeout = window.setTimeout(() => setVisibleFindings(findingPositions.length), 0);
      return () => window.clearTimeout(timeout);
    }

    const controls = animate(scanY, [0, sweepDistance], {
      duration: 3,
      ease: "linear",
      repeat: Infinity,
    });
    playback.current = controls;

    return () => {
      controls.stop();
      playback.current = null;
    };
  }, [reducedMotion, scanY]);

  useEffect(() => {
    if (isPlaying) {
      playback.current?.play();
    } else {
      playback.current?.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying || reducedMotion) return;

    const interval = window.setInterval(() => {
      setCaptionIndex((current) => (current + 1) % captions.length);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [isPlaying, reducedMotion]);

  useMotionValueEvent(scanY, "change", (latest) => {
    if (latest + 24 < previousY.current) {
      revealedCount.current = 0;
      setVisibleFindings(0);
    }

    const passedCount = findingPositions.filter((position) => latest >= position).length;
    if (passedCount > revealedCount.current) {
      revealedCount.current = passedCount;
      setVisibleFindings(passedCount);
    }

    previousY.current = latest;
  });

  function togglePlayback() {
    setIsPlaying((playing) => !playing);
  }

  return (
    <div className="scan-visual-wrap">
      <div className="scan-browser-window" aria-label="Illustrative sample scan visual">
        <div className="scan-browser-toolbar" aria-hidden="true">
          <span className="browser-dot browser-dot-red" />
          <span className="browser-dot browser-dot-amber" />
          <span className="browser-dot browser-dot-green" />
          <div className="browser-address">your-site.com</div>
        </div>
        <div className="scan-browser-page">
          <div className="skeleton-header">
            <span className="skeleton-logo" />
            <span className="skeleton-nav" />
            <span className="skeleton-nav skeleton-nav-short" />
            <span className="skeleton-button" />
          </div>
          <div className="skeleton-hero">
            <span className="skeleton-title" />
            <span className="skeleton-title skeleton-title-short" />
            <span className="skeleton-copy" />
            <span className="skeleton-copy skeleton-copy-short" />
            <span className="skeleton-cta" />
          </div>
          <div className="skeleton-cards">
            <span />
            <span />
            <span />
          </div>
          <motion.div className="scan-line" style={{ y: scanY }} aria-hidden="true" />
          <div className="finding-markers" aria-hidden="true">
            <AnimatePresence initial={false}>
              {visibleFindings >= 1 && <motion.span key="critical" className="finding-marker marker-critical" style={{ top: findingPositions[0] }} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.22 }} />}
              {visibleFindings >= 2 && <motion.span key="high" className="finding-marker marker-high" style={{ top: findingPositions[1] }} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.22 }} />}
              {visibleFindings >= 3 && <motion.span key="medium" className="finding-marker marker-medium" style={{ top: findingPositions[2] }} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.22 }} />}
            </AnimatePresence>
          </div>
        </div>
      </div>
      <div className="scan-visual-caption-row">
        <p className="scan-visual-caption" aria-live="polite">{captions[captionIndex]}</p>
        <button className="scan-visual-toggle" type="button" onClick={togglePlayback} aria-label={isPlaying ? "Pause scan visual" : "Play scan visual"}>
          {isPlaying ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          <span>{isPlaying ? "Pause" : "Play"}</span>
        </button>
      </div>
      <p className="scan-visual-disclaimer">Illustration, sample data</p>
    </div>
  );
}