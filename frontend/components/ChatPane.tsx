"use client";

import React, { useState } from "react";
import type { Emphasis, SessionSnapshot, TemplateSection } from "@/lib/api";
import EmphasisDial from "./EmphasisDial";
import DraftView from "./DraftView";

export default function ChatPane({
  snapshot,
  onUpload,
  onEmphasis,
  onFeedback,
  onFinalize,
  busy,
  uploadError,
}: {
  snapshot: SessionSnapshot | null;
  onUpload: (text: string, file: File | null) => void;
  onEmphasis: (emphasis: Record<string, Emphasis>) => void;
  onFeedback: (text: string) => void;
  onFinalize: () => void;
  busy: boolean;
  uploadError?: string | null;
}) {
  const [pasted, setPasted] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<string>("");

  // Step: pre-session / pre-upload
  if (!snapshot) {
    return (
      <div className="card p-8 md:p-10">
        <div className="mb-1 text-[0.7rem] font-bold uppercase tracking-widest text-accent">Step 1 of 3</div>
        <h2 className="text-2xl md:text-[1.7rem] font-black tracking-tightest mb-2">
          Drop in your source material
        </h2>
        <p className="text-sm text-muted mb-6 max-w-lg">
          Paste discovery notes, a meeting transcript, a brief, or upload a PDF / Markdown / TXT file.
          The agent chunks, embeds, and routes it into the right BRD sections.
        </p>

        <textarea
          className={
            "w-full border rounded-btn p-3 min-h-[180px] bg-white text-sm focus:outline-none focus:ring-2 transition " +
            (uploadError
              ? "border-red-300 focus:border-red-400 focus:ring-red-200"
              : "border-line focus:border-accent focus:ring-accent/15")
          }
          placeholder="Paste source content here…"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          disabled={busy}
        />

        {uploadError && (
          <div className="mt-3 text-sm text-danger bg-red-50 border border-red-200 rounded-btn px-4 py-3 leading-relaxed">
            <span className="font-bold mr-1">Not accepted —</span>
            {uploadError}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
          <label className="btn-ghost cursor-pointer">
            <span className="text-base leading-none">＋</span>
            <span>{file ? file.name : "Attach file (.pdf .md .txt)"}</span>
            <input
              type="file"
              className="hidden"
              accept=".pdf,.md,.txt"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={busy}
            />
          </label>
          <button
            type="button"
            className="btn-cta"
            disabled={busy || (!pasted.trim() && !file)}
            onClick={() => onUpload(pasted, file)}
          >
            {busy ? "Starting…" : "Start session →"}
          </button>
        </div>
      </div>
    );
  }

  const status = snapshot.status;
  const template: TemplateSection[] = snapshot.base_template || [];

  // Step: emphasis (after upload, before draft 1)
  if (snapshot.awaiting === "emphasis" || status === "DRAFT_1") {
    return (
      <div className="card p-7 md:p-9">
        <div className="mb-1 text-[0.7rem] font-bold uppercase tracking-widest text-accent">Step 2 of 3</div>
        <h2 className="text-2xl font-black tracking-tightest mb-2">Set section emphasis</h2>
        <p className="text-sm text-muted mb-6 max-w-lg">
          Tell the Drafter how deep to go on each section. These map to binding length and rigor
          targets — sections marked <span className="font-semibold text-ink">Don&rsquo;t need</span> are dropped entirely.
        </p>
        <EmphasisDial sections={template} onSubmit={onEmphasis} disabled={busy} />
      </div>
    );
  }

  // Steps: feedback rounds and final
  const draftMd =
    status === "FEEDBACK_1" || status === "DRAFT_2"
      ? snapshot.draft_1_markdown || ""
      : snapshot.draft_2_markdown || snapshot.draft_1_markdown || "";

  const showFeedback = status === "FEEDBACK_1" || status === "FEEDBACK_2";
  const isFinal = status === "FINAL";

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-6 md:p-7">
        <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[0.7rem] font-bold uppercase tracking-widest text-accent">
              {status === "FEEDBACK_1" || status === "DRAFT_2" ? "Draft v1" : isFinal ? "Final draft" : "Draft v2"}
            </span>
            {snapshot.attempt_number != null && (
              <span className="chip">attempt {snapshot.attempt_number}</span>
            )}
          </div>
          {isFinal && <span className="chip chip-good">✓ finalized</span>}
        </div>
        <div className="max-h-[58vh] overflow-auto pr-2">
          <DraftView markdown={draftMd} />
        </div>
      </div>

      {showFeedback && (
        <div className="card p-6 md:p-7">
          <div className="mb-1 text-[0.7rem] font-bold uppercase tracking-widest text-accent">
            Step 3 of 3 · {status === "FEEDBACK_1" ? "Feedback round 1" : "Final feedback"}
          </div>
          <h3 className="text-lg font-black tracking-tighter2 mb-3">
            {status === "FEEDBACK_1" ? "What should change in v2?" : "Any last asks before we lock it?"}
          </h3>
          <textarea
            className="w-full border border-line rounded-btn p-3 min-h-[100px] bg-white text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition"
            placeholder={
              status === "FEEDBACK_1"
                ? "Be specific — the Critic converts this into structured deltas. e.g. 'Cut the exec summary in half; add a rollout phasing section.'"
                : "Last chance — short, specific edits work best."
            }
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            disabled={busy}
          />
          <div className="mt-4 flex justify-end gap-2 flex-wrap">
            {status === "FEEDBACK_1" && (
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={onFinalize}
                title="Skip the second drafting round and lock in v1 as the final BRD"
              >
                {busy ? "Working…" : "Looks good, finalize →"}
              </button>
            )}
            <button
              type="button"
              className="btn-cta"
              disabled={busy || !feedback.trim()}
              onClick={() => {
                onFeedback(feedback);
                setFeedback("");
              }}
            >
              {busy
                ? "Working…"
                : status === "FEEDBACK_1"
                ? "Submit & regenerate →"
                : "Submit & finalize →"}
            </button>
          </div>
        </div>
      )}

      {isFinal && (
        <div className="card p-6 flex items-center justify-between gap-4">
          <div>
            <div className="font-black tracking-tighter2 text-base mb-0.5">BRD finalized</div>
            <div className="text-sm text-muted">
              Click any node on the right to inspect what shaped this draft.
            </div>
          </div>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              navigator.clipboard.writeText(draftMd);
            }}
          >
            Copy markdown
          </button>
        </div>
      )}
    </div>
  );
}
