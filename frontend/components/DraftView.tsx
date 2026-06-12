"use client";

import React from "react";

function renderLine(line: string, key: number): React.ReactElement {
  if (line.startsWith("# ")) return <h1 key={key}>{line.slice(2)}</h1>;
  if (line.startsWith("## ")) {
    // Allow trailing italic (e.g. "## Foo  _(emphasis: MUST_HAVE)_")
    const m = line.slice(3).match(/^(.*?)(\s+_\((.*)\)_)?\s*$/);
    if (m) return <h2 key={key}>{m[1]}{m[3] ? <em className="ml-2 text-muted text-sm font-normal">({m[3]})</em> : null}</h2>;
    return <h2 key={key}>{line.slice(3)}</h2>;
  }
  if (line.startsWith("_") && line.endsWith("_")) return <p key={key}><em>{line.slice(1, -1)}</em></p>;
  if (!line.trim()) return <div key={key} className="h-2" />;
  return <p key={key}>{line}</p>;
}

export default function DraftView({ markdown }: { markdown: string }) {
  const lines = (markdown || "").split("\n");
  return (
    <div className="brd-prose">
      {lines.map((l, i) => renderLine(l, i))}
    </div>
  );
}
