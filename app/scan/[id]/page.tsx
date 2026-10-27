import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { scanStore } from "../../../lib/scanStore";
import type { Finding, Severity, Verdict } from "../../../lib/types";

export const instant = false;

export const metadata: Metadata = {
  title: "Scan results",
  robots: { index: false, follow: false },
};

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: "border-red-500/40 bg-red-500/10 text-red-300",
  high: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  medium: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
  low: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  info: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
};

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

const VERDICTS: Record<Verdict, { label: string; text: string; style: string }> = {
  "fix-before-launch": {
    label: "Fix before launch",
    text: "We found issues that should be fixed before this site goes live.",
    style: "border-red-500/30 bg-red-500/5",
  },
  "fix-soon": {
    label: "Fix soon",
    text: "Nothing urgent, but these are worth fixing soon.",
    style: "border-yellow-500/30 bg-yellow-500/5",
  },
  "nice-to-have": {
    label: "Nice to have",
    text: "We found nothing serious in these checks. Remaining items are improvements.",
    style: "border-emerald-500/30 bg-emerald-500/5",
  },
};

const CHECK_LABELS: Record<string, string> = {
  "security-headers": "Security headers",
  "inline-secrets": "Secret keys in the page",
  "script-secrets": "Secret keys in script files",
  "exposed-files": "Exposed files (.env, .git)",
  "source-maps": "Public source maps",
  "full-page-scan": "Full page scan",
  "full-file-scan": "Full script scan",
  "time-limit": "Scan time limit",
};

function label(id: string): string {
  return CHECK_LABELS[id] ?? id;
}

function FindingCard({ finding }: { finding: Finding }) {
  const shown = finding.locations.slice(0, 3);
  const more = finding.locations.length - shown.length;
  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${SEVERITY_STYLES[finding.severity]}`}>
          {finding.severity}
        </span>
        <h3 className="text-base font-semibold text-zinc-100">{finding.title}</h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-zinc-300">{finding.description}</p>
      {finding.maskedEvidence && (
        <p className="mt-3 text-sm text-zinc-400">
          Evidence: <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-zinc-200">{finding.maskedEvidence}</code>
        </p>
      )}
      <ul className="mt-3 space-y-1 text-xs text-zinc-500">
        {shown.map((location, index) => (
          <li key={`${location.url}-${index}`} className="break-all">
            {location.url}
            {location.line ? ` (line ${location.line})` : ""}
          </li>
        ))}
        {more > 0 && <li>+{more} more location{more === 1 ? "" : "s"}</li>}
      </ul>
    </li>
  );
}

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await scanStore.get(id);
  if (!result) notFound();

  const verdict = VERDICTS[result.verdict];
  const { coverage } = result;

  return (
    <main className="min-h-screen bg-[#0A0A0F] px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm text-violet-300 hover:text-violet-200">
          ← Check another site
        </Link>

        <p className="mt-8 text-xs uppercase tracking-widest text-zinc-500">Scan results</p>
        <h1 className="mt-2 break-all text-2xl font-semibold md:text-3xl">{result.finalUrl}</h1>

        <section className={`mt-8 rounded-2xl border p-6 ${verdict.style}`}>
          <p className="text-xs uppercase tracking-widest text-zinc-400">Launch verdict</p>
          <p className="mt-1 text-2xl font-semibold">{verdict.label}</p>
          <p className="mt-2 text-sm text-zinc-300">{verdict.text}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {SEVERITIES.map((severity) => (
              <span
                key={severity}
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold capitalize ${SEVERITY_STYLES[severity]}`}
              >
                {severity} {result.counts[severity]}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Findings</h2>
          {result.findings.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-zinc-300">
              We found nothing in the checks listed below. That is good news, but an outside-in check cannot prove a
              site is secure.
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {result.findings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-lg font-semibold">What we checked</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-zinc-300">
            {coverage.checksRun.map((check) => (
              <li key={check}>✓ {label(check)}</li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-zinc-400">
            Files read: {coverage.filesFetched}. Files skipped: {coverage.filesSkipped}. Scan time:{" "}
            {(result.durationMs / 1000).toFixed(1)}s.
          </p>
          {coverage.checksSkipped.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold text-zinc-200">Limits of this scan</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-zinc-400">
                {coverage.checksSkipped.map((skipped) => (
                  <li key={skipped.id}>
                    {label(skipped.id)}: {skipped.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          <h3 className="mt-5 text-sm font-semibold text-zinc-200">What we cannot check from the outside</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Database access rules, business logic, and private server code. An outside check is useful, but it cannot
            prove a site is secure.
          </p>
        </section>

        <p className="mt-8 text-xs text-zinc-500">
          Temporary results page. Results are kept in memory for 24 hours. The paid report layout comes next.
        </p>
      </div>
    </main>
  );
}
