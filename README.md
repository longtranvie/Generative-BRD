# BRD Agent

A LangGraph-based pipeline that turns source documents (PDF / Markdown / TXT
/ pasted text) into a structured Business Requirements Document. Two agents
(Drafter and Critic) collaborate through a typed state contract, with two
human-in-the-loop pauses (per-section emphasis, then free-text feedback) and
a hard two-attempt limit on regeneration.

## Why LangGraph

The two-attempt feedback loop is a graph with a conditional edge, not a
linear pipeline — LangGraph's `add_conditional_edges` models it directly.
The HITL pauses need durable state across user inactivity, which the
`SqliteSaver` checkpointer gives for free (including time-travel through
`get_state_history`). And every stage being a node with a typed `AgentState`
contract makes the system self-documenting: the entire data flow lives in
`backend/graph/state.py` and you can read it without diving into node code.

## Why "agentic"

Three concrete senses:
1. **Multiple agents with distinct roles.** Drafter produces BRD JSON; Critic
   converts free-text feedback into a structured `Delta` list. They never
   communicate in natural language — only through the typed state.
2. **Stateful memory.** LangGraph checkpoints persist the full session and
   allow resuming after arbitrary pauses, plus replaying earlier states.
3. **Conditional control flow.** `route_after_critic` decides whether to
   loop back to `template_builder` or finalize. The graph is a decision
   structure, not a fixed pipeline — extending the routing logic (e.g. quality
   scores, sentiment-driven retries) is a one-function change.

## Architecture

```
input_handler → chunker → embedder → [emphasis HITL] →
  template_builder → retriever → drafter → renderer →
  [feedback HITL] → critic →
     ├── (attempt 1) → template_builder  (loop)
     └── (attempt 2) → finalizer → END
```

- `interrupt_before=["emphasis_collector", "feedback_collector"]` makes the
  HITL pauses cheap and idiomatic.
- `attempt_number` is owned by `template_builder` (bumps 1→2 when it
  re-enters with `feedback_1_deltas` present), and `route_after_critic`
  keys on the presence of `feedback_2_deltas` so the route can't be
  short-circuited by an out-of-band state mutation.
- Every node appends one `TraceEntry` to `state.trace_log`. The Drafter's
  entry stores the fully filled prompt — that is what powers the trace
  panel's "click a node, see exactly what it saw" UX.

## Stack

- **Backend** — Python 3.11+, FastAPI, LangGraph + `SqliteSaver`,
  Chroma (ephemeral, in-memory), OpenAI GPT-4o for the two agents and
  `text-embedding-3-small` for the embedding step.
- **Frontend** — Next.js 14 (App Router), Tailwind, plain SVG for the
  pipeline map.
- **No streaming, no auth, no multi-tenancy.** Single session at a time;
  every past session persists via LangGraph checkpoints.
- **Stub-fallback** — if `OPENAI_API_KEY` is not set, the LLM and embedding
  helpers degrade to deterministic stubs so the full pipeline can be
  exercised end-to-end (including the smoke tests) with no network.

## Run it locally

```bash
# Backend (port 8765)
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
export OPENAI_API_KEY=sk-...            # optional; omit to run in stub mode
export APP_PASSWORD=...                 # optional; when set, every /api call
                                        # must carry X-App-Token — the frontend
                                        # gate prompts for it. Omit for open
                                        # local dev (gate auto-unlocks).
.venv/bin/uvicorn main:app --port 8765 --reload

# Frontend (port 3000)
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

If you have a non-default API base, set `NEXT_PUBLIC_API_BASE` before `npm run dev`.

## Tests

```bash
cd backend
.venv/bin/python smoke_test.py    # exercises the compiled graph in-process
.venv/bin/python http_smoke.py    # exercises the FastAPI surface
```

Both should print `SMOKE TEST PASSED` / `HTTP SMOKE PASSED`. They run without
an API key (stub mode) — set `OPENAI_API_KEY` for real Drafter/Critic calls.

## API surface

| Method | Path | What |
| --- | --- | --- |
| POST | `/api/sessions` | Mint a new `session_id` |
| POST | `/api/sessions/{id}/upload` | Multipart form: `file` or `text`. Initializes state, runs to the emphasis HITL interrupt |
| POST | `/api/sessions/{id}/emphasis` | JSON `{ emphasis: { section_id: must_have\|good_to_have\|can_live_with\|dont_need } }`. Resumes through drafter + renderer, pauses before feedback HITL |
| POST | `/api/sessions/{id}/feedback` | JSON `{ feedback: string }`. Server selects the correct `feedback_N_raw` slot based on snapshot state; resumes through critic and either loops or finalizes |
| GET  | `/api/sessions/{id}/state` | Current snapshot (status, current_node, next_nodes, drafts, trace) |
| GET  | `/api/sessions/{id}/trace` | Full trace log |
| GET  | `/api/sessions/{id}/history` | Every checkpoint LangGraph recorded for this thread (time-travel) |

## Things deliberately not done

- No `langgraph dev` (known issue with in-memory storage).
- No streaming. No third attempt.
- The Critic never rewrites prompts — only structured `Delta`s, so every
  modification to the BRD remains traceable to an explicit user intent.
- Prompts live in `backend/prompts/*.txt`, never inlined in Python.

## Credits

Originally based on [shreyas12/brd-agent](https://github.com/shreyas12/brd-agent);
maintained and extended independently in this repository.

## Repo layout

```
brd_agent/
├── backend/
│   ├── main.py
│   ├── graph/
│   │   ├── state.py         # AgentState contract — the single source of truth
│   │   ├── builder.py       # StateGraph + SqliteSaver + interrupt_before
│   │   ├── routing.py
│   │   ├── llm.py           # OpenAI client with stub fallback
│   │   ├── vectorstore.py   # Chroma wrapper, per-session collections
│   │   └── nodes/           # one file per node, each ends with a TraceEntry append
│   ├── prompts/
│   │   ├── drafter.txt
│   │   └── critic.txt
│   ├── smoke_test.py
│   └── http_smoke.py
└── frontend/
    ├── app/                 # Next.js App Router
    ├── components/
    │   ├── ChatPane.tsx
    │   ├── EmphasisDial.tsx
    │   ├── DraftView.tsx
    │   ├── PipelineMap.tsx  # SVG, state-driven colors
    │   └── TracePanel.tsx   # right-side drawer, Trace + Time Travel tabs
    └── lib/api.ts
```
