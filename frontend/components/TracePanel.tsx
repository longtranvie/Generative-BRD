"use client";

import React, { useEffect, useState } from "react";
import { getHistory, type CheckpointMeta, type TraceEntry } from "@/lib/api";
import { EXPLAINERS, type NodeExplainer } from "@/lib/nodeExplainers";
import CodeAccordion from "./CodeAccordion";

const STATUS_CLASS: Record<string, string> = {
  done: "chip chip-good",
  error: "bg-red-50 text-danger border border-red-200 text-[0.7rem] font-bold rounded-chip px-2.5 py-0.5",
  running: "bg-amber-50 text-amber-700 border border-amber-200 text-[0.7rem] font-bold rounded-chip px-2.5 py-0.5",
};

type Tab = "design" | "code" | "trace" | "time";

export default function TracePanel({
  sessionId,
  nodeId,
  traceLog,
  onClose,
}: {
  sessionId: string | null;
  nodeId: string;
  traceLog: TraceEntry[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("design");
  const [checkpoints, setCheckpoints] = useState<CheckpointMeta[]>([]);
  const [loadingCkpts, setLoadingCkpts] = useState(false);

  // Switching nodes should land you on Design — the "why is this here?" answer.
  useEffect(() => {
    setTab("design");
  }, [nodeId]);

  useEffect(() => {
    if (tab !== "time" || !sessionId) return;
    setLoadingCkpts(true);
    getHistory(sessionId)
      .then((r) => setCheckpoints(r.checkpoints))
      .finally(() => setLoadingCkpts(false));
  }, [tab, sessionId]);

  const entries = traceLog.filter((t) => t.node_name === nodeId);
  const explainer: NodeExplainer | undefined = EXPLAINERS[nodeId];
  const codeCount = explainer ? new Set(explainer.sources.map((s) => s.path)).size : 0;

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-30" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-[600px] max-w-[95vw] bg-white border-l border-line shadow-2xl z-40 flex flex-col">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[0.7rem] font-bold uppercase tracking-widest text-muted mb-0.5">Node inspector</div>
            <div className="font-black tracking-tightest text-lg font-mono truncate">{nodeId}</div>
            {explainer && (
              <div className="text-[0.78rem] text-muted mt-1 leading-snug">{explainer.oneLiner}</div>
            )}
          </div>
          <button
            type="button"
            className="w-9 h-9 shrink-0 rounded-full hover:bg-slate-100 flex items-center justify-center text-muted hover:text-ink transition"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex px-3 border-b border-line text-sm overflow-x-auto">
          {(
            [
              { id: "design" as const, label: "Design" },
              { id: "code" as const, label: `Code (${codeCount})` },
              { id: "trace" as const, label: `Runs (${entries.length})` },
              { id: "time" as const, label: "Time travel" },
            ]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              className={
                "px-4 py-3 font-bold text-[0.85rem] -mb-px border-b-2 transition whitespace-nowrap " +
                (tab === t.id
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-ink")
              }
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-5 text-sm bg-bg2">
          {tab === "design" && (explainer ? <DesignTab explainer={explainer} /> : (
            <EmptyMsg icon="·" title="No design notes" body="This node doesn't have authored design notes yet." />
          ))}

          {tab === "code" && (explainer ? (
            <CodeAccordion sources={explainer.sources} />
          ) : (
            <EmptyMsg icon="·" title="No source references" body="This node doesn't have source files mapped yet." />
          ))}

          {tab === "trace" &&
            (entries.length === 0 ? (
              <EmptyMsg icon="·" title="No runs yet" body="This node has not executed in the current session." />
            ) : (
              <div className="flex flex-col gap-3">
                {entries.map((t, i) => (
                  <div key={i} className="card p-4">
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <div className="text-[0.7rem] text-muted font-mono truncate">{t.started_at}</div>
                      <span className={STATUS_CLASS[t.status] || "chip"}>{t.status}</span>
                    </div>
                    <div className="text-[0.78rem] mb-1">
                      <span className="text-muted font-semibold">in </span>
                      <span>{t.input_summary}</span>
                    </div>
                    <div className="text-[0.78rem] mb-3">
                      <span className="text-muted font-semibold">out </span>
                      <span>{t.output_summary}</span>
                    </div>
                    <details>
                      <summary className="cursor-pointer text-[0.72rem] font-bold uppercase tracking-widest text-accent hover:opacity-80 transition">
                        Payload
                      </summary>
                      <pre className="mt-3 text-[11px] bg-slate-900 text-slate-100 rounded-btn p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed">
{JSON.stringify(t.payload, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            ))}

          {tab === "time" &&
            (loadingCkpts ? (
              <div className="text-muted text-sm">Loading checkpoints…</div>
            ) : checkpoints.length === 0 ? (
              <EmptyMsg icon="◷" title="No checkpoints" body="Checkpoints appear as the graph runs." />
            ) : (
              <ol className="flex flex-col gap-2">
                {checkpoints.map((c) => (
                  <li key={c.checkpoint_id} className="card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono text-[0.82rem] font-bold text-ink truncate">
                        {c.current_node || "(start)"}
                      </div>
                      <span className="chip">attempt {c.attempt_number ?? "-"}</span>
                    </div>
                    <div className="text-[0.72rem] text-muted mt-1 flex flex-wrap gap-x-3">
                      <span>status: {c.status || "—"}</span>
                      {c.next_nodes.length > 0 && <span>next: {c.next_nodes.join(", ")}</span>}
                      {c.checkpoint_id && (
                        <span className="font-mono">id: {c.checkpoint_id.slice(0, 8)}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ))}
        </div>
      </aside>
    </>
  );
}

function DesignTab({ explainer }: { explainer: NodeExplainer }) {
  return (
    <div className="flex flex-col gap-4">
      <section className="card p-5">
        <SectionLabel>Why this step exists</SectionLabel>
        <p className="text-[0.88rem] leading-relaxed text-ink">{explainer.why}</p>
      </section>

      <section className="card p-5">
        <SectionLabel>Decisions &amp; reasoning</SectionLabel>
        <ol className="flex flex-col gap-3 mt-1">
          {explainer.decisions.map((d, i) => (
            <li key={i} className="border-l-2 border-accent/30 pl-3">
              <div className="font-bold text-[0.85rem] text-ink leading-snug">{d.choice}</div>
              <div className="text-[0.8rem] text-muted leading-relaxed mt-1">{d.reason}</div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card p-5">
        <SectionLabel>State this node touches</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <div>
            <div className="text-[0.7rem] font-bold uppercase tracking-widest text-good mb-1.5">Reads</div>
            <ul className="flex flex-col gap-1">
              {explainer.reads.map((r, i) => (
                <li key={i}>
                  <code className="text-[0.78rem] bg-slate-100 text-slate-900 px-1.5 py-0.5 rounded font-mono">{r}</code>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[0.7rem] font-bold uppercase tracking-widest text-accent mb-1.5">Writes</div>
            <ul className="flex flex-col gap-1">
              {explainer.writes.map((w, i) => (
                <li key={i}>
                  <code className="text-[0.78rem] bg-indigo-50 text-indigo-900 px-1.5 py-0.5 rounded font-mono">{w}</code>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[0.7rem] font-bold uppercase tracking-widest text-muted mb-2">
      {children}
    </div>
  );
}

function EmptyMsg({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="text-3xl text-sub mb-3">{icon}</div>
      <div className="font-black tracking-tighter2 text-base mb-1">{title}</div>
      <div className="text-sm text-muted">{body}</div>
    </div>
  );
}
