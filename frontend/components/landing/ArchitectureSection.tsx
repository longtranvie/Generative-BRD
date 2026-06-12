"use client";

import React from "react";

type Block = {
  title: string;
  subtitle: string;
  points: { label: string; detail: string }[];
};

const BLOCKS: Block[] = [
  {
    title: "Backend",
    subtitle: "Python 3.11 · FastAPI · LangGraph",
    points: [
      {
        label: "AgentState",
        detail:
          "One typed contract (TypedDict) is the only thing nodes communicate through. Reading state.py = understanding the whole data flow.",
      },
      {
        label: "SqliteSaver checkpointer",
        detail:
          "Every node transition persists. HITL pauses idle for free. Full time-travel via get_state_history.",
      },
      {
        label: "Chroma (ephemeral)",
        detail:
          "Per-session in-memory vector store, rebuilt from source_text on each run. No durable layer needed — the checkpointer owns that.",
      },
      {
        label: "Stub fallback",
        detail:
          "Without OPENAI_API_KEY, every LLM/embedding call degrades to a deterministic stub. The graph still runs end-to-end.",
      },
    ],
  },
  {
    title: "Pipeline",
    subtitle: "12 nodes · 2 LLM agents · adaptive routing",
    points: [
      {
        label: "Drafter (Agent 1)",
        detail:
          "GPT-4o. Reads retrieved chunks + emphasis + deltas. Returns BRD JSON with chunk-id citations per section.",
      },
      {
        label: "Critic (Agent 2)",
        detail:
          "Translates free-text user feedback into a typed list of Deltas. Agents never converse in NL — only via the typed schema.",
      },
      {
        label: "Evaluator",
        detail:
          "Independent quality check on every draft. Scores each section on grounding + coverage and emits a list of issues — visible in the trace before you type feedback, so you know exactly where the draft is weak.",
      },
      {
        label: "Two HITL pauses",
        detail:
          "emphasis_collector and feedback_collector use interrupt_before — graph idles until the API resumes it.",
      },
    ],
  },
  {
    title: "Frontend",
    subtitle: "Next.js 14 · App Router · Tailwind",
    points: [
      {
        label: "Pipeline map",
        detail:
          "SVG, state-driven colours. Visited / next / running / paused all distinct. Clickable. Shared between app and landing.",
      },
      {
        label: "Trace panel",
        detail:
          "4 tabs per node — Design (why), Code (the files), Runs (live), Time travel (checkpoint history). Authored content lives in nodeExplainers.ts.",
      },
      {
        label: "Tour guide",
        detail:
          "Auto-opens for first-time visitors. Highlights each node and prompts the user to click it open — the trace panel is where the real content lives.",
      },
      {
        label: "Plain code rendering",
        detail:
          "Line numbers + copy + raw link. No syntax-highlighting dependency — fast page, small bundle, GitHub-style functional minimum.",
      },
    ],
  },
];

export default function ArchitectureSection() {
  return (
    <section className="relative px-6 md:px-10 py-14 md:py-20">
      <div className="max-w-[1100px] mx-auto">
        <div className="mb-10">
          <div className="text-[0.7rem] font-bold uppercase tracking-widest text-accent mb-2">
            Architecture
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tightest mb-3">
            How it's wired
          </h2>
          <p className="text-[0.95rem] text-muted leading-relaxed max-w-2xl">
            Three layers. None of them depend on the others working — the
            backend has its own smoke tests, the pipeline runs without a frontend,
            and the frontend talks to the backend through a small typed API
            client.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {BLOCKS.map((b) => (
            <article key={b.title} className="card p-6 flex flex-col">
              <div className="mb-4">
                <h3 className="text-base font-black tracking-tightest mb-1">
                  {b.title}
                </h3>
                <div className="text-[0.7rem] text-muted font-mono">
                  {b.subtitle}
                </div>
              </div>
              <ul className="flex flex-col gap-3.5">
                {b.points.map((p, i) => (
                  <li key={i}>
                    <div className="text-[0.82rem] font-bold text-ink mb-0.5">
                      {p.label}
                    </div>
                    <div className="text-[0.78rem] text-muted leading-relaxed">
                      {p.detail}
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
