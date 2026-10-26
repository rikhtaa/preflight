import { Suspense } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import brand from "@/lib/brand";
import ScanProgress from "./scan-progress";

export default function ScanPage() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6">
          <Logo />
          <span className="header-note">{brand.domain}</span>
        </div>
      </header>

      <main className="scan-page">
        <div className="mx-auto w-full max-w-6xl px-6">
          <Link className="scan-back" href="/" aria-label="Back to home"><span aria-hidden="true">←</span> Back</Link>
        </div>
        <Suspense fallback={<div className="scan-loading" aria-label="Loading scan preview" />}>
            <ScanProgress />
        </Suspense>
      </main>

      <footer className="site-footer">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-4 px-6">
          <div className="footer-brand">
            <Logo />
            <span>{brand.tagline}</span>
          </div>
          <nav className="footer-links" aria-label="Legal">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/refund">Refund</Link>
          </nav>
          <span className="footer-copyright">© 2026 {brand.name}</span>
        </div>
      </footer>
    </div>
  );
}