import Link from "next/link";
import brand from "@/lib/brand";

export default function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <Link className="logo" href="/" aria-label={`${brand.name} home`}>
      <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="tsv-g" x1="6" y1="2" x2="26" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A78BFA" />
          <stop offset="1" stopColor="#6D28D9" />
        </linearGradient>
      </defs>
      <path d="M16 2.5 26.5 6.4v9.2c0 6.5-4.4 11.6-10.5 13.9C9.9 27.2 5.5 22.1 5.5 15.6V6.4L16 2.5Z" fill="url(#tsv-g)" />
      <path d="M10.6 15.8l3.7 3.7 7.3-8.3" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
      <span className="logo-wordmark">
        {brand.wordmark.slice(0, -4)}<span>vibe</span>
      </span>
    </Link>
  );
}