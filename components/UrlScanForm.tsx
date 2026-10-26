import { ArrowRight } from "lucide-react";

type UrlScanFormProps = {
  inputId: string;
};

export default function UrlScanForm({ inputId }: UrlScanFormProps) {
  return (
    <form className="landing-scan-form" action="/scan" method="get">
      <div className="landing-url-control">
        <input
          id={inputId}
          name="url"
          type="url"
          placeholder="https://your-site.com"
          autoComplete="url"
          aria-label="Website URL"
          required
        />
        <button className="landing-button" type="submit">
          Check my site <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
      <label className="landing-permission">
        <input type="checkbox" required />
        <span className="landing-checkbox" aria-hidden="true" />
        <span>I own this site or have permission to test it.</span>
      </label>
    </form>
  );
}