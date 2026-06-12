"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ChatPane from "@/components/ChatPane";
import PipelineMap from "@/components/PipelineMap";
import TracePanel from "@/components/TracePanel";
import TourGuide, { hasSeenTour } from "@/components/TourGuide";
import SessionSidebar from "@/components/SessionSidebar";
import PasswordGate from "@/components/PasswordGate";
import {
  createSession,
  finalizeSession,
  getState,
  submitEmphasis,
  submitFeedback,
  uploadFile,
  uploadText,
  type Emphasis,
  type SessionSnapshot,
} from "@/lib/api";

const POLL_INTERVAL_MS = 500;

const STATUS_LABEL: Record<string, string> = {
  DRAFT_1: "Drafting v1",
  FEEDBACK_1: "Awaiting feedback · v1",
  DRAFT_2: "Drafting v2",
  FEEDBACK_2: "Awaiting feedback · v2",
  FINAL: "Final",
};

const NODE_LABEL: Record<string, string> = {
  input_handler: "Reading input…",
  chunker: "Chunking the document…",
  embedder: "Generating embeddings…",
  emphasis_collector: "Collecting emphasis…",
  template_builder: "Mutating BRD template…",
  retriever: "Retrieving relevant chunks…",
  drafter: "Drafting sections…",
  renderer: "Rendering markdown…",
  evaluator: "Evaluating draft quality…",
  feedback_collector: "Collecting feedback…",
  critic: "Analyzing your feedback…",
  finalizer: "Finalizing…",
};

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState<boolean>(false);
  const [tourHighlight, setTourHighlight] = useState<string | null>(null);
  const [historyRefresh, setHistoryRefresh] = useState<number>(0);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!hasSeenTour()) setTourOpen(true);
  }, []);

  const visited = useMemo<Set<string>>(() => {
    if (!snapshot) return new Set();
    return new Set((snapshot.trace_log || []).map((t) => t.node_name));
  }, [snapshot]);

  function startPolling() {
    stopPolling();
    if (!sessionId) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const s = await getState(sessionId);
        setSnapshot(s);
        if (!s.next_nodes || s.next_nodes.length === 0) stopPolling();
        if (s.status === "FINAL") stopPolling();
      } catch {
        /* transient */
      }
    }, POLL_INTERVAL_MS);
  }
  function stopPolling() {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }
  useEffect(() => () => stopPolling(), []);

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId;
    const r = await createSession();
    setSessionId(r.session_id);
    return r.session_id;
  }

  async function handleUpload(text: string, file: File | null) {
    setError(null);
    setBusy(true);
    try {
      const sid = await ensureSession();
      const snap = file ? await uploadFile(sid, file) : await uploadText(sid, text);
      setSnapshot(snap);
      setHistoryRefresh((k) => k + 1);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadSession(sid: string) {
    setError(null);
    setBusy(true);
    stopPolling();
    setSelectedNode(null);
    try {
      const snap = await getState(sid);
      setSessionId(sid);
      setSnapshot(snap);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function startNewSession() {
    stopPolling();
    setSessionId(null);
    setSnapshot(null);
    setSelectedNode(null);
    setError(null);
  }

  async function handleEmphasis(emphasis: Record<string, Emphasis>) {
    if (!sessionId) return;
    setError(null);
    setBusy(true);
    startPolling();
    try {
      const snap = await submitEmphasis(sessionId, emphasis);
      setSnapshot(snap);
    } catch (e) {
      setError(String(e));
    } finally {
      stopPolling();
      setBusy(false);
    }
  }

  async function handleFeedback(text: string) {
    if (!sessionId) return;
    setError(null);
    setBusy(true);
    startPolling();
    try {
      const snap = await submitFeedback(sessionId, text);
      setSnapshot(snap);
      setHistoryRefresh((k) => k + 1);
    } catch (e) {
      setError(String(e));
    } finally {
      stopPolling();
      setBusy(false);
    }
  }

  async function handleFinalize() {
    if (!sessionId) return;
    setError(null);
    setBusy(true);
    startPolling();
    try {
      const snap = await finalizeSession(sessionId);
      setSnapshot(snap);
      setHistoryRefresh((k) => k + 1);
    } catch (e) {
      setError(String(e));
    } finally {
      stopPolling();
      setBusy(false);
    }
  }

  const statusLabel = snapshot?.status ? STATUS_LABEL[snapshot.status] : null;
  const activeLabel =
    busy && snapshot?.current_node
      ? NODE_LABEL[snapshot.current_node] || snapshot.current_node
      : null;

  return (
    <PasswordGate>
      <header className="topbar px-6 md:px-10">
        <div className="h-full max-w-[1200px] mx-auto flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-cta flex items-center justify-center text-white font-black text-base shadow-cta group-hover:scale-105 transition">
              B
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-black tracking-tightest text-[1.05rem] group-hover:text-accent transition">BRD Agent</span>
              <span className="text-[0.7rem] text-muted font-medium">← back to overview</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            {activeLabel ? (
              <span className="chip chip-accent flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                {activeLabel}
              </span>
            ) : (
              statusLabel && <span className="chip chip-accent">{statusLabel}</span>
            )}
            {sessionId && (
              <span className="chip font-mono">session {sessionId.slice(0, 8)}</span>
            )}
            <button
              type="button"
              className="chip hover:bg-slate-100 transition"
              onClick={() => setTourOpen(true)}
              title="Walk through every node in the pipeline"
            >
              ? Tour
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-[1400px] mx-auto px-6 md:px-10 py-10">
        {error && (
          <div className="mb-4 text-sm text-danger bg-red-50 border border-red-200 rounded-btn px-4 py-3 font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_minmax(360px,420px)] gap-6">
          <aside className="lg:sticky lg:top-[88px] h-fit">
            <SessionSidebar
              currentSessionId={sessionId}
              refreshKey={historyRefresh}
              onSelect={loadSession}
              onNew={startNewSession}
            />
          </aside>
          <section>
            <ChatPane
              snapshot={snapshot}
              onUpload={handleUpload}
              onEmphasis={handleEmphasis}
              onFeedback={handleFeedback}
              onFinalize={handleFinalize}
              busy={busy}
              uploadError={!snapshot ? error : null}
            />
          </section>
          <aside className="card p-5 h-fit lg:sticky lg:top-[88px]">
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-[0.7rem] font-bold uppercase tracking-widest text-muted">Pipeline</div>
              {snapshot?.current_node && (
                <div className="text-[0.7rem] font-semibold text-accent font-mono">{snapshot.current_node}</div>
              )}
            </div>
            <PipelineMap
              visited={visited}
              currentNode={snapshot?.current_node || null}
              nextNodes={snapshot?.next_nodes || []}
              onSelect={setSelectedNode}
              selected={selectedNode}
              tourHighlight={tourHighlight}
            />
            <div className="mt-4 text-[0.72rem] text-muted leading-relaxed">
              Click any node to inspect its inputs, outputs, and the exact prompt it saw.
            </div>
          </aside>
        </div>
      </main>

      {selectedNode && (
        <TracePanel
          sessionId={sessionId}
          nodeId={selectedNode}
          traceLog={snapshot?.trace_log || []}
          onClose={() => setSelectedNode(null)}
        />
      )}

      <TourGuide
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        onHighlight={setTourHighlight}
        selectedNode={selectedNode}
        onOpenInspector={setSelectedNode}
      />
    </PasswordGate>
  );
}
