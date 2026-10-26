## Brand
Name: The Secure Vibe. Wordmark: "thesecurevibe" (lowercase, "vibe" in the
accent color). Domain: thesecurevibe.com. The name lives only in lib/brand.ts;
never hardcode it.

## Design rules
- One container (max-w-6xl mx-auto px-6) for header, every section, and footer.
  Hero is centered; all other section headings are left-aligned in the container.
- Section padding py-20 md:py-28. No big empty gaps; cards equal height with
  content top-aligned.
- Spacing scale 4/8/12/16/24/32/48/64 only. Hero 56-72px, h2 36-40px,
  body 16-18px, nothing under 14px. Muted text must pass WCAG AA contrast.
- Icons: lucide-react only. ArrowRight for in-site actions, never an
  external-link arrow. No decorative sparkle/asterisk icons.
- Always show the product: a sample report card with fake data.
- Hide the Next.js dev indicator.