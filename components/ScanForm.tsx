"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";

const STEPS = [
  "Fetching your page",
  "Reading script files",
  "Checking security headers",
  "Looking for exposed files",
];

type Status = "idle" | "scanning";

interface ScanFormProps {
  /** Used so two forms on one page keep unique element ids. */
  idPrefix?: string;
  className?: string;
}

export function ScanForm({ idPrefix = "scan", className = "" }: ScanFormProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // The checklist advances on a timer while the real scan runs on the server.
  useEffect(() => {
    if (status !== "scanning") return;
    setStep(0);
    const timer = window.setInterval(() => {
      setStep((current) => Math.min(current + 1, STEPS.length - 1));
    }, 2200);
    return () => window.clearInterval(timer);
  }, [status]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "scanning") return;

    if (!url.trim()) {
      setError("Enter a website address, like https://your-site.com.");
      return;
    }
    if (!confirmed) {
      setError("Please confirm that you own this site or have permission to test it.");
      return;
    }

    setError(null);
    setStatus("scanning");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45_000);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim(), ownershipConfirmed: confirmed }),
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => null)) as
        | { id?: string; error?: { message?: string } }
        | null;

      if (response.ok && data?.id) {
        router.push(`/scan/${data.id}`);
        return;
      }
      setError(data?.error?.message ?? "Something went wrong. Please try again.");
    } catch {
      setError("We could not complete the check. Please try again.");
    } finally {
      window.clearTimeout(timeout);
      setStatus((current) => (current === "scanning" ? "idle" : current));
    }
  }

  const scanning = status === "scanning";

  return (
    <form onSubmit={onSubmit} noValidate className={`w-full ${className}`}>
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1.5 pl-5 transition focus-within:border-violet-400/60">
        <input
          id={`${idPrefix}-url`}
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-label="Website URL"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${idPrefix}-error` : undefined}
          placeholder="https://your-site.com"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={scanning}
          className="min-w-0 flex-1 bg-transparent py-3 text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={scanning}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(139,92,246,0.35)] transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {scanning ? "Checking…" : "Check my site"}
          {!scanning && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>

      <label
        htmlFor={`${idPrefix}-confirm`}
        className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm text-zinc-300"
      >
        <input
          id={`${idPrefix}-confirm`}
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          disabled={scanning}
          className="h-4 w-4 rounded border-white/20 bg-white/5 accent-violet-500"
        />
        I own this site or have permission to test it.
      </label>

      {error && (
        <p id={`${idPrefix}-error`} role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {scanning && (
        <ul className="mt-4 space-y-2 text-sm text-zinc-300" aria-live="polite">
          {STEPS.map((label, index) => (
            <li key={label} className={`flex items-center gap-2.5 ${index > step ? "opacity-40" : ""}`}>
              {index < step ? (
                <Check className="h-4 w-4 text-violet-300" aria-hidden="true" />
              ) : index === step ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-300 border-t-transparent" aria-hidden="true" />
              ) : (
                <span className="h-4 w-4 rounded-full border border-white/20" aria-hidden="true" />
              )}
              {label}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
