"use client";

import React from "react";

export type NodeInfo = {
  id: string;
  label: string;
  hitl?: boolean;
  description: string;
};

export const NODE_INFO: Record<string, NodeInfo> = {
  input_handler: {
    id: "input_handler",
    label: "Input",
    description:
      "Normalizes the uploaded text/PDF/markdown into a single source string. The first step of every session.",
  },
  chunker: {
    id: "chunker",
    label: "Chunker",
    description:
      "Splits the source into ~800-char chunks. Markdown inputs go through a header-aware splitter so each chunk carries its heading path.",
  },
  embedder: {
    id: "embedder",
    label: "Embedder",
    description:
      "Embeds every chunk via text-embedding-3-small and writes them to a per-session Chroma collection.",
  },
  emphasis_collector: {
    id: "emphasis_collector",
    label: "Emphasis",
    hitl: true,
    description:
      "Human-in-the-loop pause. You set how important each BRD section is — must_have, good_to_have, can_live_with, or dont_need.",
  },
  template_builder: {
    id: "template_builder",
    label: "Template",
    description:
      "Applies your emphasis (and the Critic's deltas on round 2) to produce the mutated template the Drafter actually writes against.",
  },
  retriever: {
    id: "retriever",
    label: "Retriever",
    description:
      "For every section in the mutated template, queries the vector store and selects the top-k most relevant chunks.",
  },
  drafter: {
    id: "drafter",
    label: "Drafter",
    description:
      "GPT-4o agent. Writes a JSON draft for every section using the retrieved chunks. On round 2, also consumes the Critic's deltas.",
  },
  renderer: {
    id: "renderer",
    label: "Renderer",
    description:
      "Converts the Drafter's JSON into the markdown BRD shown in the chat.",
  },
  evaluator: {
    id: "evaluator",
    label: "Evaluator",
    description:
      "Independent quality check. Scores every section on grounding (claims supported by chunks) and coverage (used the evidence well). Findings surface in the trace so you can see where the draft is weak before giving feedback.",
  },
  feedback_collector: {
    id: "feedback_collector",
    label: "Feedback",
    hitl: true,
    description:
      "Human-in-the-loop pause. You read the draft and write free-text feedback for what should change.",
  },
  critic: {
    id: "critic",
    label: "Critic",
    description:
      "Converts your free-text feedback into a structured list of typed Deltas (action + section + instruction). Never rewrites the draft itself.",
  },
  finalizer: {
    id: "finalizer",
    label: "Finalizer",
    description:
      "Marks the session FINAL and seals the last draft as the answer.",
  },
};

const NODES: { id: string; x: number; y: number }[] = [
  { id: "input_handler", x: 30, y: 25 },
  { id: "chunker", x: 30, y: 95 },
  { id: "embedder", x: 30, y: 165 },
  { id: "emphasis_collector", x: 30, y: 235 },
  { id: "template_builder", x: 165, y: 235 },
  { id: "retriever", x: 165, y: 165 },
  { id: "drafter", x: 165, y: 95 },
  { id: "renderer", x: 165, y: 25 },
  { id: "evaluator", x: 300, y: 25 },
  { id: "feedback_collector", x: 300, y: 95 },
  { id: "critic", x: 300, y: 165 },
  { id: "finalizer", x: 435, y: 235 },
];

type EdgeStyle = "solid" | "loop";

const EDGES: { from: string; to: string; style?: EdgeStyle }[] = [
  { from: "input_handler", to: "chunker" },
  { from: "chunker", to: "embedder" },
  { from: "embedder", to: "emphasis_collector" },
  { from: "emphasis_collector", to: "template_builder" },
  { from: "template_builder", to: "retriever" },
  { from: "retriever", to: "drafter" },
  { from: "drafter", to: "renderer" },
  { from: "renderer", to: "evaluator" },
  { from: "evaluator", to: "feedback_collector" },
  { from: "feedback_collector", to: "critic" },
  { from: "critic", to: "template_builder", style: "loop" },
  { from: "critic", to: "finalizer" },
];

const NODE_W = 105;
const NODE_H = 36;

type NodeStyle = {
  fill: string;
  stroke: string;
  text: string;
  glow: boolean;
};

function styleFor(
  id: string,
  visited: Set<string>,
  current: string | null,
  next: Set<string>,
): NodeStyle {
  if (current === id) return { fill: "url(#grad-active)", stroke: "transparent", text: "#fff", glow: true };
  if (next.has(id)) return { fill: "#fffbeb", stroke: "#f59e0b", text: "#92400e", glow: false };
  if (visited.has(id)) return { fill: "#eef2ff", stroke: "#a5b4fc", text: "#3730a3", glow: false };
  return { fill: "#ffffff", stroke: "#e2e8f0", text: "#94a3b8", glow: false };
}

export default function PipelineMap({
  visited,
  currentNode,
  nextNodes,
  onSelect,
  selected,
  tourHighlight,
}: {
  visited: Set<string>;
  currentNode: string | null;
  nextNodes: string[];
  onSelect: (id: string) => void;
  selected: string | null;
  tourHighlight?: string | null;
}) {
  const nextSet = new Set(nextNodes);

  return (
    <div className="w-full">
      <svg viewBox="0 0 565 295" className="w-full h-auto block">
        <defs>
          <linearGradient id="grad-active" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="100%" stopColor="#0891b2" />
          </linearGradient>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" fill="#cbd5e1" />
          </marker>
          <marker id="arrow-loop" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" fill="#f59e0b" />
          </marker>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="tour-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {EDGES.map((e, i) => {
          const na = NODES.find((n) => n.id === e.from)!;
          const nb = NODES.find((n) => n.id === e.to)!;
          const x1 = na.x + NODE_W / 2;
          const y1 = na.y + NODE_H / 2;
          const x2 = nb.x + NODE_W / 2;
          const y2 = nb.y + NODE_H / 2;
          let stroke = "#e2e8f0";
          let dash: string | undefined;
          let marker = "url(#arrow)";
          let width = 1.25;
          let opacity = 1;
          if (e.style === "loop") {
            stroke = "#f59e0b";
            dash = "4 3";
            marker = "url(#arrow-loop)";
            width = 1.5;
            opacity = 0.85;
          }
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={stroke}
              strokeWidth={width}
              strokeDasharray={dash}
              markerEnd={marker}
              opacity={opacity}
            />
          );
        })}

        {NODES.map((n) => {
          const info = NODE_INFO[n.id];
          const s = styleFor(n.id, visited, currentNode, nextSet);
          const isSelected = selected === n.id;
          const isTour = tourHighlight === n.id;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y})`}
              onClick={() => onSelect(n.id)}
              style={{ cursor: "pointer" }}
              filter={isTour ? "url(#tour-glow)" : s.glow ? "url(#glow)" : undefined}
            >
              {isTour && (
                <rect
                  x={-4}
                  y={-4}
                  width={NODE_W + 8}
                  height={NODE_H + 8}
                  rx={13}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                >
                  <animate attributeName="stroke-dashoffset" from="0" to="-12" dur="1s" repeatCount="indefinite" />
                </rect>
              )}
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={10}
                fill={s.fill}
                stroke={isSelected ? "#0f172a" : s.stroke}
                strokeWidth={isSelected ? 1.8 : 1.25}
              />
              <text
                x={NODE_W / 2}
                y={NODE_H / 2 + 4}
                textAnchor="middle"
                fontSize={11.5}
                fontWeight={700}
                fontFamily="Inter, system-ui"
                fill={s.text}
              >
                {info?.label || n.id}
              </text>
              {info?.hitl && (
                <g>
                  <circle cx={NODE_W - 8} cy={8} r={4} fill="#f59e0b" />
                  <text x={NODE_W - 8} y={11} textAnchor="middle" fontSize={6.5} fontWeight={800} fill="#fff">!</text>
                </g>
              )}
              <title>{info?.description || ""}</title>
            </g>
          );
        })}
      </svg>
      <div className="text-[0.7rem] text-muted flex flex-wrap gap-x-3 gap-y-1.5 mt-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "linear-gradient(135deg,#4f46e5,#0891b2)" }} />
          running
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-100 border border-amber-500" />
          paused (HITL)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-50 border border-indigo-300" />
          done
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-white border border-line" />
          pending
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0 border-t-2 border-dashed border-amber-500" />
          loop back
        </span>
      </div>
    </div>
  );
}
