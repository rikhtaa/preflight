import {
  siClaude,
  siCloudflare,
  siCursor,
  siFirebase,
  siNetlify,
  siReplit,
  siStripe,
  siSupabase,
  siVercel,
  siWindsurf,
} from "simple-icons";

const brands = [
  { name: "Replit", icon: siReplit },
  { name: "Cursor", icon: siCursor },
  { name: "Claude", icon: siClaude },
  { name: "Windsurf", icon: siWindsurf },
  { name: "Supabase", icon: siSupabase },
  { name: "Firebase", icon: siFirebase },
  { name: "Vercel", icon: siVercel },
  { name: "Netlify", icon: siNetlify },
  { name: "Cloudflare", icon: siCloudflare },
  { name: "Stripe", icon: siStripe },
];

export default function BuilderLogoMarquee() {
  return (
    <div className="builder-marquee" aria-label="Tools and platforms used to build websites">
      <div className="builder-marquee-track">
        {[0, 1].map((copy) => (
          <ul className="builder-marquee-group" key={copy} aria-hidden={copy === 1}>
            {brands.map(({ name, icon }) => (
              <li className="builder-logo-item" key={name}>
                {icon ? (
                  <svg viewBox="0 0 24 24" role={copy === 0 ? "img" : undefined} aria-label={copy === 0 ? name : undefined} aria-hidden={copy === 1}>
                    <path d={icon.path} />
                  </svg>
                ) : (
                  <span className="builder-logo-fallback">{name}</span>
                )}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}