export const builders = [
  "Lovable",
  "Bolt",
  "Cursor",
  "Replit",
  "v0",
  "Claude Code",
  "Windsurf",
] as const;

export const faqItems = [
  {
    question: "Is scanning safe?",
    answer: "This prototype does not make network requests. The intended checks are limited to publicly available pages and files; they do not log in, exploit vulnerabilities, or change your site.",
  },
  {
    question: "What do you store?",
    answer: "This prototype has no scan backend or database attached, and it does not ask for secret values. The submitted URL is sent to the preview route and may appear in browser history or hosting logs. Data retention details will be published before a live scanner is available.",
  },
  {
    question: "What can’t you check?",
    answer: "An outside-in check cannot inspect database rules, private server code, or business logic that is not exposed publicly. It is a useful signal, not proof that a site is secure.",
  },
  {
    question: "How does payment work?",
    answer: "Checkout is not connected in this prototype. The planned report is a one-time $5 purchase with no account and no recurring subscription.",
  },
  {
    question: "What is the refund policy?",
    answer: "No payment is taken in this prototype, so there is no active refund process yet. A clear refund policy will be shown before paid checkout is enabled.",
  },
  {
    question: "Which builders are supported?",
    answer: "The sample prompt selector includes Lovable, Bolt, Cursor, Replit, v0, and Claude Code. Builder choice tailors the prompt, not the public-site checks.",
  },
] as const;