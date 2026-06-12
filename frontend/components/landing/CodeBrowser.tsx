"use client";

import React from "react";

const REPO_URL = "https://github.com/shreyas12/brd-agent";
const BLOB = `${REPO_URL}/blob/main`;

type FileLink = { path: string; label: string; note: string };
type Group = { title: string; files: FileLink[] };

const GROUPS: Group[] = [
  {
    title: "Graph",
    files: [
      { path: "backend/graph/state.py", label: "state.py", note: "AgentState typed contract" },
      { path: "backend/graph/builder.py", label: "builder.py", note: "Graph wiring + checkpointer" },
      { path: "backend/graph/routing.py", label: "routing.py", note: "Conditional edges" },
    ],
  },
  {
    title: "Nodes",
    files: [
      { path: "backend/graph/nodes/chunker.py", label: "chunker.py", note: "Markdown-aware split" },
      { path: "backend/graph/nodes/drafter.py", label: "drafter.py", note: "Agent 1 — Drafter" },
      { path: "backend/graph/nodes/evaluator.py", label: "evaluator.py", note: "Grounding + coverage" },
      { path: "backend/graph/nodes/critic.py", label: "critic.py", note: "Agent 2 — Critic" },
    ],
  },
  {
    title: "API",
    files: [
      { path: "backend/main.py", label: "main.py", note: "FastAPI surface" },
      { path: "backend/prompts/drafter.txt", label: "drafter.txt", note: "Drafter prompt" },
      { path: "backend/prompts/critic.txt", label: "critic.txt", note: "Critic prompt" },
    ],
  },
  {
    title: "Frontend",
    files: [
      { path: "frontend/app/app/page.tsx", label: "app/page.tsx", note: "Session orchestrator" },
      { path: "frontend/components/ChatPane.tsx", label: "ChatPane.tsx", note: "Upload / emphasis / feedback UI" },
      { path: "frontend/components/PipelineMap.tsx", label: "PipelineMap.tsx", note: "Live node graph" },
    ],
  },
];

export default function CodeBrowser() {
  return (
    <section id="code" className="relative px-6 md:px-10 py-14 md:py-20">
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-8">
          <div className="text-[0.7rem] font-bold uppercase tracking-widest text-accent mb-2">
            Code
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tightest mb-3">
            Browse the repo
          </h2>
          <p className="text-[0.95rem] text-muted leading-relaxed max-w-2xl mb-6">
            Full source on GitHub. The files below are the ones worth opening
            first — backend pipeline, the two LLM agents, and the frontend
            orchestrator.
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-cta inline-flex"
          >
            View repo on GitHub <span className="ml-1">↗</span>
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {GROUPS.map((g) => (
            <div key={g.title} className="card p-5">
              <div className="text-[0.7rem] font-bold uppercase tracking-widest text-muted mb-3">
                {g.title}
              </div>
              <ul className="space-y-2">
                {g.files.map((f) => (
                  <li key={f.path}>
                    <a
                      href={`${BLOB}/${f.path}`}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-baseline justify-between gap-3 rounded px-2 py-1.5 -mx-2 hover:bg-bg2 transition"
                    >
                      <span className="min-w-0 flex-1">
                        <code className="font-mono text-[0.82rem] font-bold text-ink group-hover:text-accent transition">
                          {f.label}
                        </code>
                        <span className="block text-[0.72rem] text-muted leading-snug">
                          {f.note}
                        </span>
                      </span>
                      <span className="text-muted text-[0.78rem] group-hover:text-accent transition shrink-0">
                        ↗
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
