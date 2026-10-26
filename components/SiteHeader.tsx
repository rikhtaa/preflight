"use client";

import { useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { useMotionValueEvent, useScroll } from "motion/react";
import Logo from "@/components/Logo";

const navItems = [
  { label: "How it works", href: "#how-it-works" },
  { label: "What we check", href: "#what-we-check" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export default function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 8);
  });

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className={`landing-header${scrolled ? " is-scrolled" : ""}`} style={{ backdropFilter: "blur(16px)" }}>
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="landing-desktop-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <a href={item.href} key={item.href}>{item.label}</a>
          ))}
          <a className="landing-nav-cta" href="#hero-site-url">
            Check my site <ArrowRight size={16} aria-hidden="true" />
          </a>
        </nav>
        <button
          className="landing-menu-button"
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav-panel"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </div>
      <nav
        className={`landing-mobile-nav${menuOpen ? " is-open" : ""}`}
        id="mobile-nav-panel"
        aria-label="Mobile navigation"
        aria-hidden={!menuOpen}
      >
        {navItems.map((item) => (
          <a href={item.href} key={item.href} onClick={closeMenu}>{item.label}</a>
        ))}
        <a className="landing-nav-cta" href="#hero-site-url" onClick={closeMenu}>
          Check my site <ArrowRight size={16} aria-hidden="true" />
        </a>
      </nav>
    </header>
  );
}