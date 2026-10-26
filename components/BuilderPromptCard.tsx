"use client";

import { useState } from "react";
import { ChevronDown, Code2 } from "lucide-react";
import { builders } from "@/lib/landing-content";

export default function BuilderPromptCard() {
  const [builder, setBuilder] = useState<string>(builders[0]);

  return (
    <article className="walkthrough-card">
      <div className="sample-card-label"><span>Fix prompt</span><span className="sample-pill">SAMPLE</span></div>
      <p className="walkthrough-card-description">A starting point tailored to your builder.</p>
      <label className="builder-label" htmlFor="builder-select">Builder</label>
      <div className="builder-select-wrap">
        <Code2 size={20} aria-hidden="true" />
        <select
          id="builder-select"
          aria-label="Choose a builder for the sample prompt"
          onChange={(event) => setBuilder(event.target.value)}
          value={builder}
        >
          {builders.filter((option) => option !== "Windsurf").map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <ChevronDown size={20} aria-hidden="true" />
      </div>
      <div className="builder-prompt">
        <p className="builder-prompt-kicker">EXAMPLE FOR {builder.toUpperCase()}</p>
        <p>Move this key to a server-side environment variable. Show a diff first, preserve existing features, and never put secrets in client code.</p>
      </div>
      <p className="builder-prompt-note">Sample prompt only. No code is changed.</p>
    </article>
  );
}