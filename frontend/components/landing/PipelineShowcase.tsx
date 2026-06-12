"use client";

import React, { useState } from "react";
import PipelineMap, { NODE_INFO } from "@/components/PipelineMap";
import TracePanel from "@/components/TracePanel";

export default function PipelineShowcase() {
  const [selected, setSelected] = useState<string | null>(null);

  // All nodes are "pending" on the landing page — no live session.
  const visited = new Set<string>();
  const currentNode: string | null = null;
  const nextNodes: string[] = [];

  return (
    <section className="relative px-6 md:px-10 py-14 md:py-20 bg-white border-y border-line">
      <div className="max-w-[1100px] mx-auto">
        <div className="mb-8">
          <div className="text-[0.7rem] font-bold uppercase tracking-widest text-accent mb-2">
            The graph
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tightest mb-3">
            12 nodes, two LLM agents, one adaptive loop
          </h2>
          <p className="text-[0.95rem] text-muted leading-relaxed max-w-2xl">
            Each node owns one concern. State moves through a typed contract
            (<code className="text-[0.85em] bg-slate-100 px-1.5 py-0.5 rounded font-mono">AgentState</code>) — every read and write is auditable.
            Click any node to open the inspector: design notes, source files,
            and (with a live session) run-by-run data.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(320px,360px)] gap-6">
          <div className="card p-6">
            <PipelineMap
              visited={visited}
              currentNode={currentNode}
              nextNodes={nextNodes}
              onSelect={setSelected}
              selected={selected}
            />
          </div>

          <aside className="card p-5">
            <div className="text-[0.7rem] font-bold uppercase tracking-widest text-muted mb-3">
              Nodes
            </div>
            <ul className="flex flex-col gap-1.5 max-h-[340px] overflow-auto pr-1">
              {Object.values(NODE_INFO).map((info) => (
                <li key={info.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(info.id)}
                    className={
                      "w-full text-left rounded-lg px-3 py-2 text-[0.82rem] transition flex items-center justify-between gap-2 " +
                      (selected === info.id
                        ? "bg-accent/10 text-accent font-bold"
                        : "hover:bg-bg2 text-fg")
                    }
                  >
                    <span className="font-mono truncate">{info.id}</span>
                    {info.hitl && (
                      <span className="text-[0.62rem] font-bold uppercase tracking-widest text-amber-600">
                        HITL
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-4 border-t border-line text-[0.72rem] text-muted leading-relaxed">
              Two of these are LLM agents (Drafter, Critic). One is an
              independent quality check (Evaluator) that can early-exit the
              loop when v1 is already good. Two are HITL pauses.
            </div>
          </aside>
        </div>
      </div>

      {selected && (
        <TracePanel
          sessionId={null}
          nodeId={selected}
          traceLog={[]}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
