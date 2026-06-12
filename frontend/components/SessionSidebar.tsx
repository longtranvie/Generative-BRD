"use client";

import React, { useEffect, useState } from "react";
import { listSessions, type SessionListItem } from "@/lib/api";

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  DRAFT_1: { label: "drafting v1", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  FEEDBACK_1: { label: "feedback v1", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  DRAFT_2: { label: "drafting v2", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  FEEDBACK_2: { label: "feedback v2", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  FINAL: { label: "final", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export default function SessionSidebar({
  currentSessionId,
  refreshKey,
  onSelect,
  onNew,
}: {
  currentSessionId: string | null;
  /** Bumping this triggers a refetch — e.g. parent does setRefreshKey(k => k+1) after upload. */
  refreshKey: number;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
}) {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listSessions()
      .then((r) => setSessions(r.sessions))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  return (
    <aside className="card p-3 h-fit flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-1.5 pt-1">
        <div className="text-[0.7rem] font-bold uppercase tracking-widest text-muted">
          History
        </div>
        <span className="text-[0.65rem] text-muted font-mono">
          {sessions.length}
        </span>
      </div>

      <button type="button" className="btn-cta w-full justify-center" onClick={onNew}>
        + New session
      </button>

      {loading && (
        <div className="text-[0.78rem] text-muted px-2 py-3">Loading…</div>
      )}
      {error && (
        <div className="text-[0.78rem] text-danger px-2 py-3">
          Failed to load history.
        </div>
      )}
      {!loading && !error && sessions.length === 0 && (
        <div className="text-[0.78rem] text-muted px-2 py-3 leading-relaxed">
          No past sessions yet. Upload a doc and one will appear here.
        </div>
      )}

      <ul className="flex flex-col gap-1.5 max-h-[68vh] overflow-auto pr-1">
        {sessions.map((s) => {
          const isCurrent = s.session_id === currentSessionId;
          const chip = s.status ? STATUS_CHIP[s.status] : null;
          return (
            <li key={s.session_id}>
              <button
                type="button"
                onClick={() => onSelect(s.session_id)}
                className={
                  "w-full text-left rounded-lg p-2.5 transition border " +
                  (isCurrent
                    ? "border-accent bg-accent/8 shadow-sm"
                    : "border-transparent hover:bg-bg2 hover:border-line")
                }
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div
                    className={
                      "truncate text-[0.82rem] " +
                      (isCurrent ? "font-bold text-accent" : "font-semibold text-ink")
                    }
                    title={s.title}
                  >
                    {s.title}
                  </div>
                  {chip && (
                    <span
                      className={
                        "shrink-0 text-[0.6rem] font-bold tracking-wide px-1.5 py-0.5 rounded border " +
                        chip.cls
                      }
                    >
                      {chip.label}
                    </span>
                  )}
                </div>
                <div className="text-[0.7rem] text-muted truncate font-mono">
                  {s.session_id.slice(0, 8)}
                  {s.attempt_number ? ` · attempt ${s.attempt_number}` : ""}
                </div>
                {s.draft_preview && (
                  <div className="text-[0.7rem] text-muted leading-snug mt-1 line-clamp-2">
                    {s.draft_preview.replace(/[#_*`]/g, " ").slice(0, 120)}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
