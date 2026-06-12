"use client";

import React, { useState } from "react";
import { API_BASE } from "@/lib/api";

type Endpoint = {
  method: "GET" | "POST";
  path: string;
  blurb: string;
};

const ENDPOINTS: Endpoint[] = [
  { method: "POST", path: "/api/sessions", blurb: "Mint a new session_id." },
  {
    method: "GET",
    path: "/api/sessions",
    blurb: "List persisted sessions, newest-first. Powers the history sidebar.",
  },
  {
    method: "POST",
    path: "/api/sessions/{id}/upload",
    blurb: "Multipart: file or text. Runs to the emphasis HITL pause.",
  },
  {
    method: "POST",
    path: "/api/sessions/{id}/emphasis",
    blurb: "JSON { emphasis: { section_id: level } }. Runs through drafter + evaluator. May early-exit.",
  },
  {
    method: "POST",
    path: "/api/sessions/{id}/feedback",
    blurb: "JSON { feedback: string }. Server picks the right feedback slot. Resumes through critic.",
  },
  {
    method: "GET",
    path: "/api/sessions/{id}/state",
    blurb: "Current snapshot — status, current_node, next_nodes, drafts, trace.",
  },
  {
    method: "GET",
    path: "/api/sessions/{id}/trace",
    blurb: "Full trace log for the session.",
  },
  {
    method: "GET",
    path: "/api/sessions/{id}/history",
    blurb: "Every checkpoint LangGraph recorded for this thread. Time-travel.",
  },
];

const CURL_EXAMPLE = `# 1) New session
SID=$(curl -s -X POST ${"$"}{API}/api/sessions | jq -r .session_id)

# 2) Upload text
curl -s -X POST ${"$"}{API}/api/sessions/${"$"}SID/upload \\
  -F text="ACME wants an internal expense portal. SSO required. Monthly dashboards."

# 3) Set emphasis (pauses on feedback HITL OR early-exits to FINAL)
curl -s -X POST ${"$"}{API}/api/sessions/${"$"}SID/emphasis \\
  -H 'Content-Type: application/json' \\
  -d '{"emphasis":{"exec_summary":"must_have","functional":"must_have","metrics":"dont_need"}}'

# 4) Give feedback to drive draft 2
curl -s -X POST ${"$"}{API}/api/sessions/${"$"}SID/feedback \\
  -H 'Content-Type: application/json' \\
  -d '{"feedback":"Make the exec summary punchier; add rollout phasing."}'`;

export default function ApiSection() {
  const [copied, setCopied] = useState(false);

  function copyCurl() {
    navigator.clipboard.writeText(CURL_EXAMPLE.replace("${API}", API_BASE));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="relative px-6 md:px-10 py-14 md:py-20 bg-white border-y border-line">
      <div className="max-w-[1100px] mx-auto">
        <div className="mb-10 flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-[0.7rem] font-bold uppercase tracking-widest text-accent mb-2">
              API
            </div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tightest mb-3">
              Use it without the frontend
            </h2>
            <p className="text-[0.95rem] text-muted leading-relaxed max-w-2xl">
              The frontend is one consumer. The same REST surface powers
              anything you wire up. FastAPI auto-generates OpenAPI/Swagger at
              <code className="text-[0.85em] bg-slate-100 px-1.5 py-0.5 rounded font-mono mx-1">
                /docs
              </code>
              — try it live.
            </p>
          </div>
          <a
            href={`${API_BASE}/docs`}
            target="_blank"
            rel="noreferrer"
            className="btn-cta"
          >
            Open /docs ↗
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-line">
              <div className="text-[0.7rem] font-bold uppercase tracking-widest text-muted">
                Endpoints
              </div>
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {ENDPOINTS.map((e, i) => (
                <li key={i} className="px-5 py-3.5">
                  <div className="flex items-center gap-3 mb-1">
                    <span
                      className={
                        "text-[0.65rem] font-black tracking-widest px-2 py-0.5 rounded " +
                        (e.method === "POST"
                          ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200")
                      }
                    >
                      {e.method}
                    </span>
                    <code className="font-mono text-[0.82rem] text-ink truncate">
                      {e.path}
                    </code>
                  </div>
                  <div className="text-[0.78rem] text-muted leading-relaxed pl-1">
                    {e.blurb}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <div className="text-[0.7rem] font-bold uppercase tracking-widest text-muted">
                End-to-end curl
              </div>
              <button
                type="button"
                onClick={copyCurl}
                className="text-[0.72rem] font-bold text-muted hover:text-accent transition"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <pre className="bg-slate-950 text-slate-100 text-[11.5px] leading-[1.55] font-mono p-5 overflow-x-auto whitespace-pre">
{CURL_EXAMPLE.replace("${API}", API_BASE)}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
