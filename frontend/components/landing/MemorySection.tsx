"use client";

import React from "react";

const PILLARS = [
  {
    title: "The typed contract",
    code: "AgentState",
    body:
      "Every node communicates through one TypedDict — chunks, embeddings, drafts, emphasis, deltas, evaluations, trace log. Nothing escapes the schema. Reading state.py is reading the whole system.",
    file: "backend/graph/state.py",
  },
  {
    title: "Durable checkpoints",
    code: "SqliteSaver",
    body:
      "Every state transition writes to SQLite via LangGraph's SqliteSaver. The graph is stateless between requests — the only memory of an in-flight session is the checkpoint store. Restart the server, sessions survive.",
    file: "backend/checkpoints.db",
  },
  {
    title: "HITL pauses cost nothing",
    code: "interrupt_before",
    body:
      "Because state is durable, a session can pause for seconds or for days. There's no in-memory queue, no polling loop, no timeout. The graph just stops at emphasis_collector / feedback_collector and waits for the next API call to resume it.",
    file: "backend/graph/builder.py",
  },
  {
    title: "Time travel",
    code: "get_state_history()",
    body:
      "Every checkpoint is queryable. The trace panel's Time travel tab lists them all — current_node, next, attempt, status — so you can see exactly what the graph looked like at any past moment. The audit trail is the memory.",
    file: "backend/main.py · GET /api/sessions/{id}/history",
  },
];

export default function MemorySection() {
  return (
    <section className="relative px-6 md:px-10 py-14 md:py-20">
      <div className="max-w-[1100px] mx-auto">
        <div className="mb-10">
          <div className="text-[0.7rem] font-bold uppercase tracking-widest text-accent mb-2">
            Memory &amp; state
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tightest mb-3">
            How the agent remembers
          </h2>
          <p className="text-[0.95rem] text-muted leading-relaxed max-w-2xl">
            Most agent frameworks bury memory in a vector DB and call it a day.
            This one keeps the whole session as durable, typed, replayable
            state — no NL summarization, no lossy embeddings of past turns.
            Four pillars:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {PILLARS.map((p, i) => (
            <article
              key={i}
              className="card p-6 flex flex-col gap-3 hover:shadow-cardHover transition"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-base font-black tracking-tightest">
                  {p.title}
                </h3>
                <code className="text-[0.72rem] font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200 truncate">
                  {p.code}
                </code>
              </div>
              <p className="text-[0.82rem] text-muted leading-relaxed">
                {p.body}
              </p>
              <div className="text-[0.7rem] text-muted font-mono pt-2 border-t border-line truncate">
                {p.file}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 card p-5 bg-bg2">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-[0.7rem] font-bold uppercase tracking-widest text-accent">
              In the app
            </span>
            <span className="text-[0.78rem] text-muted">
              The history sidebar on the left lists every persisted session. Click
              one to reload its complete state — drafts, trace, emphasis, every
              checkpoint. That's the memory store, made browseable.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
