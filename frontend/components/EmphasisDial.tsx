"use client";

import React, { useState } from "react";
import type { Emphasis, TemplateSection } from "@/lib/api";

const LEVELS: { value: Emphasis; label: string; hint: string; tone: "good" | "accent" | "muted" | "neutral" }[] = [
  { value: "must_have", label: "Must have", hint: "Deep, exhaustive (250+ words)", tone: "accent" },
  { value: "good_to_have", label: "Good to have", hint: "Solid coverage (~150 words)", tone: "good" },
  { value: "can_live_with", label: "Can live with", hint: "1–2 sentences", tone: "neutral" },
  { value: "dont_need", label: "Don't need", hint: "Omit entirely", tone: "muted" },
];

function toneClasses(tone: string, active: boolean): string {
  if (active) {
    switch (tone) {
      case "accent":
        return "bg-gradient-cta text-white border-transparent shadow-cta";
      case "good":
        return "bg-good text-white border-transparent";
      case "neutral":
        return "bg-ink text-white border-transparent";
      case "muted":
        return "bg-slate-400 text-white border-transparent";
    }
  }
  return "bg-white text-ink border-line hover:border-accent hover:text-accent hover:bg-indigo-50/40";
}

export default function EmphasisDial({
  sections,
  onSubmit,
  disabled,
}: {
  sections: TemplateSection[];
  onSubmit: (emphasis: Record<string, Emphasis>) => void;
  disabled?: boolean;
}) {
  const [values, setValues] = useState<Record<string, Emphasis>>(
    Object.fromEntries(sections.map((s) => [s.id, "good_to_have"])),
  );

  function setAll(v: Emphasis) {
    setValues(Object.fromEntries(sections.map((s) => [s.id, v])));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-muted">
          Quick set:
        </div>
        <div className="flex gap-1.5 text-[0.72rem]">
          <button type="button" className="chip hover:border-accent hover:text-accent" onClick={() => setAll("must_have")}>All must-have</button>
          <button type="button" className="chip hover:border-accent hover:text-accent" onClick={() => setAll("good_to_have")}>All good-to-have</button>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {sections.map((s) => (
          <div key={s.id} className="card card-hover p-4">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="font-black tracking-tighter2 text-[0.95rem]">{s.name}</div>
                <div className="text-[0.78rem] text-muted leading-snug mt-0.5">{s.description}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {LEVELS.map((l) => {
                const active = values[s.id] === l.value;
                return (
                  <button
                    key={l.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => setValues((v) => ({ ...v, [s.id]: l.value }))}
                    className={
                      "text-[0.74rem] font-bold px-3 py-2 rounded-lg border transition disabled:opacity-50 " +
                      toneClasses(l.tone, active)
                    }
                    title={l.hint}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSubmit(values)}
          className="btn-cta"
        >
          Generate draft v1 →
        </button>
      </div>
    </div>
  );
}
