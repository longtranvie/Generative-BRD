"use client";

import Link from "next/link";
import React from "react";
import { API_BASE } from "@/lib/api";

export default function Hero() {
  return (
    <section className="relative px-6 md:px-10 pt-16 md:pt-24 pb-12 md:pb-20">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-600 flex items-center justify-center text-white font-black text-lg shadow-lg">
            B
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-black tracking-tightest text-[1.15rem]">BRD Agent</span>
            <span className="text-[0.72rem] text-muted font-medium">
              LangGraph · GPT-4o · explainable
            </span>
          </div>
        </div>

        <h1 className="text-4xl md:text-6xl font-black tracking-tightest leading-[1.05] mb-5 max-w-3xl">
          Discovery docs become
          <br />
          <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 bg-clip-text text-transparent">
            structured BRDs.
          </span>
        </h1>

        <p className="text-base md:text-lg text-muted leading-relaxed max-w-2xl mb-8">
          A 12-node LangGraph pipeline with two LLM agents, two human-in-the-loop pauses,
          and an evaluator that scores every draft on grounding and coverage — so the
          user can see where the draft is weak before typing feedback. Every node is
          inspectable: design rationale, source code, live run data, full checkpoint
          history.
        </p>

        <div className="flex flex-wrap gap-3 mb-10">
          <Link href="/app" className="btn-cta">
            Try the app <span className="ml-1">→</span>
          </Link>
          <a
            href={`${API_BASE}/docs`}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost"
          >
            API docs <span className="ml-1">↗</span>
          </a>
          <a href="#code" className="btn-ghost">
            Browse the code <span className="ml-1">↓</span>
          </a>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[0.78rem] text-muted">
          <span className="inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            FastAPI · LangGraph · Chroma · OpenAI
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            Next.js 14 · Tailwind · App Router
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            SqliteSaver checkpointer · time-travel
          </span>
        </div>
      </div>
    </section>
  );
}
