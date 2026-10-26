import Link from "next/link";
import {
  ArrowRight,
  Check,
  CircleHelp,
  Clock,
  Database,
  EyeOff,
  FileSearch,
  KeyRound,
  LockKeyhole,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import BuilderPromptCard from "@/components/BuilderPromptCard";
import AmbientGlow from "@/components/AmbientGlow";
import BuilderLogoMarquee from "@/components/BuilderLogoMarquee";
import FAQAccordion from "@/components/FAQAccordion";
import HeroScanVisual from "@/components/HeroScanVisual";
import Logo from "@/components/Logo";
import ScrollReveal from "@/components/ScrollReveal";
import SiteHeader from "@/components/SiteHeader";
import UrlScanForm from "@/components/UrlScanForm";
import brand from "@/lib/brand";
import { faqItems } from "@/lib/landing-content";

const checks = [
  {
    icon: KeyRound,
    title: "Secret keys in your code",
    description: "Look for credentials accidentally shipped in public HTML and JavaScript bundles.",
  },
  {
    icon: ShieldCheck,
    title: "Security headers",
    description: "Review response headers that help browsers handle your site more safely.",
  },
  {
    icon: FileSearch,
    title: "Exposed files",
    description: "Check for public .env files, .git metadata, and source maps.",
  },
];

const audiences = [
  { title: "Solo builders", description: "A final outside-in check before your first launch." },
  { title: "Freelancers", description: "A clear, useful handoff check for a client app." },
  { title: "Founders", description: "A quick look at public exposure before launch day." },
];

function SectionIntro({ eyebrow, title, id }: { eyebrow: string; title: string; id: string }) {
  return (
    <div className="section-intro">
      <p className="landing-eyebrow">{eyebrow}</p>
      <h2 id={id}>{title}</h2>
    </div>
  );
}

function SampleLabel() {
  return <span className="sample-pill">SAMPLE</span>;
}

export default function LandingPage() {
  return (
    <div className="site-shell landing-shell">
      <AmbientGlow />
      <div className="announcement-bar">
        <div className="mx-auto w-full max-w-6xl px-6">
          Launch price $5 <span aria-hidden="true">·</span> 3 free rescans in 7 days
        </div>
      </div>

      <SiteHeader />

      <main>
        <section className="landing-hero py-10 lg:py-14" id="hero-site-url" aria-labelledby="hero-title">
          <ScrollReveal className="mx-auto w-full max-w-6xl px-6">
            <div className="landing-hero-grid">
              <div className="landing-hero-content">
                <p className="landing-eyebrow">THE LAST CHECK BEFORE GO-LIVE</p>
                <h1 id="hero-title">Security check<br className="desktop-break" /> before you <span>launch.</span></h1>
                <p className="landing-hero-copy">Find exposed keys, missing headers, and public files before someone else does.</p>
                <UrlScanForm inputId="site-url" />
                <ul className="landing-trust-list" aria-label="Scan details">
                  <li><ShieldCheck size={18} aria-hidden="true" /><span>Passive checks</span></li>
                  <li><EyeOff size={18} aria-hidden="true" /><span>Never stores full secrets</span></li>
                  <li><Clock size={18} aria-hidden="true" /><span>About a minute</span></li>
                </ul>
              </div>
              <ScrollReveal className="hero-scan-reveal" delay={0.1}>
                <HeroScanVisual />
              </ScrollReveal>
            </div>
          </ScrollReveal>
        </section>

        <section className="builder-proof-section py-20 md:py-24" aria-label="Builders and product facts">
          <ScrollReveal className="mx-auto w-full max-w-6xl px-6">
            <p className="builder-caption">Made for sites built with</p>
            <BuilderLogoMarquee />
            <p className="trademark-note">Logos are trademarks of their owners. Not affiliated or endorsed.</p>
            <div className="stat-strip">
              <div><strong>$5 once</strong><span>One-time report</span></div>
              <div><strong>No account</strong><span>Start with a URL</span></div>
              <div><strong>About a minute</strong><span>For a preview</span></div>
            </div>
          </ScrollReveal>
        </section>

        <section className="walkthrough-section py-20 md:py-24" id="how-it-works" aria-labelledby="walkthrough-title">
          <ScrollReveal className="mx-auto w-full max-w-6xl px-6">
            <SectionIntro eyebrow="A CLEAR PATH FROM FINDING TO FIX" title="Find it. Fix it. Verify it." id="walkthrough-title" />
            <div className="walkthrough-grid">
              <ScrollReveal as="article" className="walkthrough-card" delay={0}>
                <div className="sample-card-label"><span>Sample report</span><SampleLabel /></div>
                <p className="walkthrough-card-description">An example finding with identifying details masked.</p>
                <div className="sample-severity-counts">
                  <span className="severity-badge severity-critical">Critical <strong>1</strong></span>
                  <span className="severity-badge severity-high">High <strong>2</strong></span>
                  <span className="severity-badge severity-medium">Medium <strong>3</strong></span>
                </div>
                <div className="sample-finding-detail">
                  <span className="severity-badge severity-critical">Critical</span>
                  <h3>Live key in public bundle</h3>
                  <p>A credential appears in a file visitors can download. Revoke it before replacing it.</p>
                  <div className="mock-evidence"><span>Masked evidence</span><code>sk_l…ab</code></div>
                </div>
                <div className="mock-card-foot"><LockKeyhole size={18} aria-hidden="true" /> 3 additional findings in the full report</div>
              </ScrollReveal>

              <ScrollReveal className="walkthrough-card-motion" delay={0.08}>
                <BuilderPromptCard />
              </ScrollReveal>

              <ScrollReveal as="article" className="walkthrough-card" delay={0.16}>
                <div className="sample-card-label"><span>Verify checklist</span><SampleLabel /></div>
                <p className="walkthrough-card-description">A short list to revisit after applying a fix.</p>
                <ul className="verify-list">
                  <li><span><Check size={16} aria-hidden="true" /></span><span>Revoke the exposed key</span></li>
                  <li><span><Check size={16} aria-hidden="true" /></span><span>Move secrets server-side</span></li>
                  <li><span className="verify-empty" /><span>Confirm it is absent from public files</span></li>
                </ul>
                <div className="mock-card-foot"><ShieldCheck size={18} aria-hidden="true" /> Recheck after changes</div>
              </ScrollReveal>
            </div>
          </ScrollReveal>
        </section>

        <section className="checks-section py-20 md:py-24" id="what-we-check" aria-labelledby="checks-title">
          <ScrollReveal className="mx-auto w-full max-w-6xl px-6">
            <SectionIntro eyebrow="PUBLIC-SURFACE CHECKS" title="What we check" id="checks-title" />
            <div className="check-grid">
              {checks.map(({ icon: Icon, title, description }, index) => (
                <ScrollReveal as="article" className="info-card" key={title} delay={index * 0.08}>
                  <Icon size={24} aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{description}</p>
                </ScrollReveal>
              ))}
              <ScrollReveal as="article" className="info-card outside-card" delay={0.21}>
                <Database size={24} aria-hidden="true" />
                <h3>What we can’t check from the outside</h3>
                <ul>
                  <li><ServerCog size={18} aria-hidden="true" /> Database rules</li>
                  <li><CircleHelp size={18} aria-hidden="true" /> Business logic</li>
                  <li><LockKeyhole size={18} aria-hidden="true" /> Private server code</li>
                </ul>
              </ScrollReveal>
            </div>
            <p className="scope-note">An outside-in check is useful, but it cannot prove a site is secure.</p>
          </ScrollReveal>
        </section>

        <section className="audience-section py-20 md:py-24" aria-labelledby="audience-title">
          <ScrollReveal className="mx-auto w-full max-w-6xl px-6">
            <SectionIntro eyebrow="BUILT FOR THE LAST MILE" title="Who it’s for" id="audience-title" />
            <div className="audience-grid">
              {audiences.map(({ title, description }, index) => (
                <ScrollReveal as="article" className="audience-card" key={title} delay={index * 0.08}>
                  <span className="audience-index">0{index + 1}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </ScrollReveal>
              ))}
            </div>
          </ScrollReveal>
        </section>

        <section className="difference-section py-20 md:py-24" aria-labelledby="difference-title">
          <ScrollReveal className="mx-auto w-full max-w-6xl px-6">
            <SectionIntro eyebrow="SIMPLE BY DESIGN" title="Why we’re different" id="difference-title" />
            <div className="comparison-table" role="table" aria-label={`${brand.name} product approach`}>
              <div className="comparison-row comparison-header" role="row">
                <span role="columnheader">{brand.name}</span>
                <span role="columnheader">Common requirements</span>
              </div>
              <div className="comparison-row" role="row">
                <span role="cell"><Check size={20} aria-hidden="true" /> Pay once: $5</span>
                <span role="cell">Subscription</span>
              </div>
              <div className="comparison-row" role="row">
                <span role="cell"><Check size={20} aria-hidden="true" /> No account</span>
                <span role="cell">Signup</span>
              </div>
              <div className="comparison-row" role="row">
                <span role="cell"><Check size={20} aria-hidden="true" /> No repo access</span>
                <span role="cell">Connect your code</span>
              </div>
            </div>
          </ScrollReveal>
        </section>

        <section className="pricing-section py-20 md:py-24" id="pricing" aria-labelledby="pricing-title">
          <ScrollReveal className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-8 px-6 md:grid-cols-2 md:gap-16">
            <div className="pricing-intro">
              <p className="landing-eyebrow">NO SUBSCRIPTION. NO SURPRISES.</p>
              <h2 id="pricing-title">A clear report.<br />One small payment.</h2>
              <p>Start with the free preview. Pay once only if you want the full findings and fix guidance.</p>
            </div>
            <ScrollReveal as="article" className="pricing-card" delay={0.1}>
              <p className="pricing-kicker">ONE-TIME REPORT</p>
              <p className="pricing-price"><span>$</span>5</p>
              <p className="pricing-caption">One payment. No account. No subscription.</p>
              <ul className="pricing-includes">
                <li><Check size={18} aria-hidden="true" /> Detailed findings and exact fix steps</li>
                <li><Check size={18} aria-hidden="true" /> Builder-tailored fix prompts</li>
                <li><Check size={18} aria-hidden="true" /> 3 free rescans in 7 days</li>
              </ul>
              <a className="landing-button pricing-button" href="#hero-site-url">Start with a free preview <ArrowRight size={18} aria-hidden="true" /></a>
              <p className="pricing-prototype-note">Payment is not enabled in this prototype.</p>
            </ScrollReveal>
          </ScrollReveal>
        </section>

        <section className="faq-section py-20 md:py-24" id="faq" aria-labelledby="faq-title">
          <ScrollReveal className="mx-auto w-full max-w-6xl px-6">
            <div className="faq-layout">
              <SectionIntro eyebrow="STRAIGHT ANSWERS" title="Frequently asked questions" id="faq-title" />
              <FAQAccordion items={faqItems} />
            </div>
          </ScrollReveal>
        </section>

        <section className="final-cta-section py-20 md:py-24" aria-labelledby="final-cta-title">
          <ScrollReveal className="mx-auto w-full max-w-6xl px-6">
            <div className="final-cta-copy">
              <p className="landing-eyebrow">YOUR URL. YOUR CALL.</p>
              <h2 id="final-cta-title">One last check before launch.</h2>
              <p>No scan runs until the service is connected. The current preview is illustrative.</p>
            </div>
            <UrlScanForm inputId="final-site-url" />
          </ScrollReveal>
        </section>

        <section className="landing-closing-section">
          <div className="mx-auto w-full max-w-6xl px-6">
            <p>Know what’s exposed. Fix what matters. Launch on your terms.</p>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-4 px-6">
          <div className="landing-footer-brand">
            <Logo />
            <span>Outside-in security checks for your next launch.</span>
          </div>
          <nav className="landing-footer-links" aria-label="Legal">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/refund">Refund</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}