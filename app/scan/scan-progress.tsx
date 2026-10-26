"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import brand from "@/lib/brand";

const checks = [
  "Preparing a safe, external-only check",
  "Reviewing public response headers",
  "Looking for exposed configuration files",
  "Checking publicly served page assets",
  "Preparing your free preview",
];

export default function ScanProgress() {
  const searchParams = useSearchParams();
  const [completedCount, setCompletedCount] = useState(0);
  const isComplete = completedCount === checks.length;
  const siteUrl = searchParams.get("url") || "your site";

  useEffect(() => {
    if (isComplete) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setCompletedCount(completedCount + 1);
    }, 850);

    return () => window.clearTimeout(timeout);
  }, [completedCount, isComplete]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6">
      <div className="scan-heading">
        <p className="eyebrow">{brand.name.toUpperCase()} SCAN</p>
        <h1>Checking <span className="scan-url">{siteUrl}</span></h1>
        <p>This preview demonstrates the scan flow. No network checks have been run.</p>
      </div>

      <div className="scan-layout">
        <section className="checklist-panel" aria-labelledby="checklist-title">
          <div className="checklist-header">
            <h2 id="checklist-title">{isComplete ? "Preview checklist complete" : "Preparing your preview"}</h2>
            <span className="demo-tag">DEMO</span>
          </div>
          <ol className="checklist" aria-live="polite" aria-label="Placeholder scan progress">
            {checks.map((check, index) => {
              const state = index < completedCount ? "complete" : index === completedCount && !isComplete ? "checking" : "queued";
              const status = state === "complete" ? "Done" : state === "checking" ? "In progress" : "Queued";

              return (
                <li className="check-row" data-state={state} key={check}>
                  <span className="check-indicator" aria-hidden="true">{state === "complete" ? "✓" : "·"}</span>
                  <span className="check-label">{check}</span>
                  <span className="check-status">{status}</span>
                </li>
              );
            })}
          </ol>
          <div className="scan-disclaimer">
            <span aria-hidden="true">i</span>
            <span><strong>Illustrative only.</strong> Real scanning is not connected yet. This page does not report findings about your URL.</span>
          </div>
        </section>

        <aside className="scan-side" aria-labelledby="severity-title">
          <h2 id="severity-title">Severity scale</h2>
          <p>Findings will be grouped by the level of attention they need.</p>
          <div className="severity-list" aria-label="Finding severity levels">
            <span className="severity-badge severity-critical">Critical</span>
            <span className="severity-badge severity-high">High</span>
            <span className="severity-badge severity-medium">Medium</span>
            <span className="severity-badge severity-low">Low</span>
          </div>
        </aside>
      </div>
    </div>
  );
}