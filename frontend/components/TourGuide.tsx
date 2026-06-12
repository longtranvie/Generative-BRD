"use client";

import React, { useEffect, useState } from "react";
import { NODE_INFO } from "./PipelineMap";

const TOUR_STORAGE_KEY = "brd_tour_seen_v1";

const TOUR_ORDER: string[] = [
  "input_handler",
  "chunker",
  "embedder",
  "emphasis_collector",
  "template_builder",
  "retriever",
  "drafter",
  "renderer",
  "evaluator",
  "feedback_collector",
  "critic",
  "finalizer",
];

export function hasSeenTour(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(TOUR_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, "1");
  } catch {
    /* noop */
  }
}

export default function TourGuide({
  open,
  onClose,
  onHighlight,
  selectedNode,
  onOpenInspector,
}: {
  open: boolean;
  onClose: () => void;
  onHighlight: (nodeId: string | null) => void;
  /** Currently-inspected node (the one whose trace panel is open). */
  selectedNode: string | null;
  /** Open the trace panel for a specific node — same effect as the user clicking it. */
  onOpenInspector: (nodeId: string) => void;
}) {
  const [step, setStep] = useState<number>(-1); // -1 = welcome screen
  const [explored, setExplored] = useState<Set<number>>(new Set());

  // Reset whenever the tour is closed or freshly opened.
  useEffect(() => {
    if (!open) {
      setStep(-1);
      setExplored(new Set());
      onHighlight(null);
    }
  }, [open, onHighlight]);

  // Drive the pipeline highlight from the current step.
  useEffect(() => {
    if (!open) return;
    if (step < 0 || step >= TOUR_ORDER.length) {
      onHighlight(null);
    } else {
      onHighlight(TOUR_ORDER[step]);
    }
  }, [step, open, onHighlight]);

  // Mark a step as "explored" once the user opens its inspector — gives a
  // small ✓ on the tour card so they know the action registered.
  useEffect(() => {
    if (!open || step < 0 || step >= TOUR_ORDER.length) return;
    if (selectedNode && selectedNode === TOUR_ORDER[step]) {
      setExplored((prev) => {
        if (prev.has(step)) return prev;
        const next = new Set(prev);
        next.add(step);
        return next;
      });
    }
  }, [open, step, selectedNode]);

  if (!open) return null;

  function finish() {
    markSeen();
    onHighlight(null);
    onClose();
  }

  // ─── Welcome screen ────────────────────────────────────────────────
  if (step < 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div
          className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px] pointer-events-auto"
          onClick={finish}
        />
        <div className="relative pointer-events-auto card max-w-md mx-4 p-7 shadow-2xl">
          <div className="text-[0.7rem] font-bold uppercase tracking-widest text-accent mb-1">
            Welcome
          </div>
          <h2 className="text-xl font-black tracking-tightest mb-2">
            Take a quick tour
          </h2>
          <p className="text-sm text-muted leading-relaxed mb-4">
            BRD Agent runs your source doc through 12 nodes to produce a
            structured business requirements document. Each tour step
            highlights one node — <span className="font-bold text-ink">click the
            highlighted node</span> (or the button on the tour card) to open the
            inspector and see:
          </p>
          <ul className="text-sm text-muted leading-relaxed mb-5 list-none flex flex-col gap-1.5">
            <li>
              <span className="font-bold text-ink">Design</span> — why the node
              exists and the decisions behind it
            </li>
            <li>
              <span className="font-bold text-ink">Code</span> — the actual
              source files that implement it
            </li>
            <li>
              <span className="font-bold text-ink">Runs</span> — live execution
              data once you've started a session
            </li>
            <li>
              <span className="font-bold text-ink">Time travel</span> — every
              checkpoint LangGraph recorded for this thread
            </li>
          </ul>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={finish}>
              Skip
            </button>
            <button className="btn-cta" onClick={() => setStep(0)}>
              Start tour →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step card ─────────────────────────────────────────────────────
  const totalSteps = TOUR_ORDER.length;
  const nodeId = TOUR_ORDER[step];
  const info = NODE_INFO[nodeId];
  const isLast = step === totalSteps - 1;
  const hasExplored = explored.has(step);

  // Bottom-left so it doesn't collide with the trace panel (which slides
  // in from the right). On narrow screens it falls back to bottom-center.
  return (
    <div className="fixed bottom-6 left-6 right-6 sm:right-auto z-30 pointer-events-none flex justify-start">
      <div className="pointer-events-auto card max-w-sm w-full p-5 shadow-2xl border-2 border-accent/40">
        <div className="flex items-baseline justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[0.65rem] font-bold uppercase tracking-widest text-accent">
              Step {step + 1} of {totalSteps}
            </span>
            {info?.hitl && (
              <span className="chip chip-accent text-[0.65rem]">HITL pause</span>
            )}
            {hasExplored && (
              <span className="text-good text-xs font-bold">✓ inspected</span>
            )}
          </div>
          <button
            className="text-muted hover:text-fg text-xs"
            onClick={finish}
            aria-label="Close tour"
          >
            ✕ skip
          </button>
        </div>

        <h3 className="text-base font-black tracking-tightest mb-1">
          {info?.label}
          <span className="ml-2 text-[0.7rem] font-mono font-normal text-muted">
            {nodeId}
          </span>
        </h3>
        <p className="text-[0.82rem] text-fg leading-relaxed mb-3">
          {info?.description}
        </p>

        <div className="bg-bg2 rounded-btn p-3 mb-4 text-[0.78rem] text-muted leading-relaxed">
          <span className="font-bold text-ink">
            {hasExplored ? "✓ Inspector open." : "👈 Click the pulsing node"}
          </span>{" "}
          {hasExplored
            ? "Switch tabs (Design · Code · Runs · Time travel) to see what it does. When ready, continue."
            : "or use the button below to open the inspector. It shows the design rationale, source code, and live run data."}
        </div>

        <div className="flex items-center justify-between gap-2 mb-3">
          <button
            className="btn-ghost text-xs"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            ← Back
          </button>
          {!hasExplored && (
            <button
              className="btn-ghost text-xs font-bold text-accent"
              onClick={() => onOpenInspector(nodeId)}
            >
              Open inspector →
            </button>
          )}
          {isLast ? (
            <button className="btn-cta text-xs" onClick={finish}>
              Got it ✓
            </button>
          ) : (
            <button
              className="btn-cta text-xs"
              onClick={() => setStep((s) => s + 1)}
            >
              Next →
            </button>
          )}
        </div>

        <div className="flex gap-1 justify-center">
          {TOUR_ORDER.map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${
                i === step
                  ? "bg-accent"
                  : explored.has(i)
                  ? "bg-good"
                  : i < step
                  ? "bg-indigo-300"
                  : "bg-slate-200"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
