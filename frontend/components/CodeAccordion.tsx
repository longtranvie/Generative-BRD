"use client";

import React, { useEffect, useState } from "react";
import { API_BASE, getSource, type SourceFile } from "@/lib/api";
import type { SourceRef } from "@/lib/nodeExplainers";
import CodeView from "./CodeView";

interface GroupedSource {
  path: string;
  refs: { symbol?: string; note?: string }[];
}

function dedupe(sources: SourceRef[]): GroupedSource[] {
  const map = new Map<string, GroupedSource>();
  for (const s of sources) {
    const g = map.get(s.path) || { path: s.path, refs: [] };
    g.refs.push({ symbol: s.symbol, note: s.note });
    map.set(s.path, g);
  }
  return Array.from(map.values());
}

export default function CodeAccordion({ sources }: { sources: SourceRef[] }) {
  const grouped = dedupe(sources);
  const [openPath, setOpenPath] = useState<string | null>(
    grouped.length === 1 ? grouped[0].path : null,
  );

  if (grouped.length === 0) {
    return (
      <div className="text-center py-12 text-muted text-sm">
        No source files associated with this node.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {grouped.map((g) => (
        <FileItem
          key={g.path}
          group={g}
          isOpen={openPath === g.path}
          onToggle={() => setOpenPath((p) => (p === g.path ? null : g.path))}
        />
      ))}
    </div>
  );
}

function FileItem({
  group,
  isOpen,
  onToggle,
}: {
  group: GroupedSource;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [content, setContent] = useState<SourceFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || content || loading) return;
    setLoading(true);
    setError(null);
    getSource(group.path)
      .then(setContent)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [isOpen, group.path, content, loading]);

  const filename = group.path.split("/").pop() || group.path;
  const dir = group.path.slice(0, group.path.length - filename.length);

  return (
    <div className={"card overflow-hidden " + (isOpen ? "shadow-cardHover" : "")}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-bg2 transition"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-mono font-bold text-[0.86rem] text-ink truncate">{filename}</span>
            {dir && <span className="font-mono text-[0.7rem] text-muted truncate">{dir}</span>}
          </div>
          {group.refs.some((r) => r.symbol || r.note) && (
            <div className="flex flex-wrap gap-1.5">
              {group.refs.map((r, i) =>
                r.symbol || r.note ? (
                  <span key={i} className="chip chip-accent !text-[0.68rem]">
                    {r.symbol && <span className="font-mono">{r.symbol}</span>}
                    {r.symbol && r.note && <span className="opacity-60"> · </span>}
                    {r.note && <span className="font-normal">{r.note}</span>}
                  </span>
                ) : null,
              )}
            </div>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {content && (
            <span className="text-[0.68rem] text-muted font-mono">{content.lines} lines</span>
          )}
          <span
            className={
              "text-muted text-base transition-transform " + (isOpen ? "rotate-90" : "rotate-0")
            }
          >
            ›
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-line">
          {loading && (
            <div className="p-4 text-sm text-muted">Loading {filename}…</div>
          )}
          {error && (
            <div className="p-4 text-sm text-danger">Failed to load: {error}</div>
          )}
          {content && (
            <>
              <div className="flex items-center justify-between px-4 py-2 border-b border-line bg-bg2 text-[0.7rem] text-muted">
                <span className="font-mono uppercase tracking-widest">{content.language}</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(content.content)}
                    className="hover:text-ink transition"
                  >
                    Copy
                  </button>
                  <a
                    href={`${API_BASE}/api/source?path=${encodeURIComponent(content.path)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-ink transition"
                  >
                    Raw ↗
                  </a>
                </div>
              </div>
              <CodeView code={content.content} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
