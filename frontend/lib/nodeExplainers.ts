/**
 * Per-node design notes. Authored once, rendered in the TracePanel "Design"
 * and "Code" tabs. The goal is to make the pipeline self-documenting at the
 * level a reviewer or interviewer can read in 30 seconds — technical enough
 * to see exactly what state moves through, but plain-language about *why*.
 *
 * Keep these in lockstep with the actual node code. If you change a node's
 * inputs/outputs or its design rationale, edit the matching entry below.
 */

export interface Decision {
  /** Short phrase naming the call. e.g. "Recursive split, 800/100" */
  choice: string;
  /** Plain-language reasoning. Why this and not the obvious alternative? */
  reason: string;
}

export interface SourceRef {
  /** Repo-relative path. Must be fetchable from /api/source. */
  path: string;
  /** Optional symbol/anchor inside the file (e.g. "_extract_text()"). */
  symbol?: string;
  /** Freeform description of why this file matters for this node. */
  note?: string;
}

export interface NodeExplainer {
  title: string;
  oneLiner: string;
  why: string;
  reads: string[];
  writes: string[];
  decisions: Decision[];
  sources: SourceRef[];
}

export const EXPLAINERS: Record<string, NodeExplainer> = {
  input_handler: {
    title: "Input handler",
    oneLiner: "Normalizes whatever the user pasted or uploaded into one source_text string.",
    why:
      "The pipeline below this point only cares about plain text. Centralizing PDF / Markdown / TXT extraction here means the rest of the graph never has to know about file types. It also gives us one clean place to record the input as a TraceEntry so the audit trail starts from the very first byte.",
    reads: ["source_text", "source_filename"],
    writes: ["source_text (normalized)", "trace_log", "current_node"],
    decisions: [
      {
        choice: "Do file-type extraction in the FastAPI route, not the node",
        reason:
          "The node operates on a string; the route owns multipart parsing. Keeping that boundary clean means the graph can be tested without faking UploadFile objects.",
      },
    ],
    sources: [
      { path: "backend/graph/nodes/input_handler.py", note: "the node itself" },
      { path: "backend/main.py", symbol: "_extract_text()", note: "PDF / text decoding" },
    ],
  },

  chunker: {
    title: "Chunker",
    oneLiner: "Splits source_text into ~800-char overlapping chunks with stable IDs.",
    why:
      "LLM context isn't free, and the Drafter does better when it sees only the slice relevant to each BRD section. Chunking with stable IDs is also what makes the Drafter's `sources` array meaningful — citations stay valid across re-draws.",
    reads: ["source_text"],
    writes: ["chunks: [{ id, text, char_start, char_end }]", "trace_log", "current_node"],
    decisions: [
      {
        choice: "Recursive split, size=800 / overlap=100",
        reason:
          "800 chars is a good sweet spot for text-embedding-3-small (well inside the 8K input window) and small enough that retrieval pulls only nearby content. 100 chars of overlap prevents a sentence at a boundary from being cut clean in two.",
      },
      {
        choice: "Prefer paragraph / sentence breaks within the window",
        reason:
          "A hard cut every 800 chars splits mid-clause and the embeddings reflect that. Looking for `\\n\\n`, `\\n`, or `. ` in the back half of the window costs almost nothing and improves chunk coherence.",
      },
      {
        choice: "Char offsets stored, not just text",
        reason:
          "char_start/char_end let the UI later highlight which span of the original source a sentence in the BRD came from. Cheap to capture now, expensive to reconstruct later.",
      },
    ],
    sources: [{ path: "backend/graph/nodes/chunker.py" }],
  },

  embedder: {
    title: "Embedder",
    oneLiner: "Embeds every chunk and writes them to a per-session Chroma collection.",
    why:
      "Without embeddings the Retriever can't do per-section semantic search and the Drafter would have to see every chunk. Embedding here (once) lets every downstream retrieval be a fast vector query.",
    reads: ["chunks", "session_id"],
    writes: ["embeddings_written: true", "trace_log", "current_node"],
    decisions: [
      {
        choice: "text-embedding-3-small (1536d)",
        reason:
          "Strong quality-per-dollar on short business prose. Larger models don't move the needle on chunks this size, and the cost difference matters when a session embeds dozens of chunks.",
      },
      {
        choice: "Chroma ephemeral (in-memory) client, per-session collection",
        reason:
          "The chunks are deterministic from source_text, and the LangGraph checkpointer is the durable layer. Persisting embeddings to disk would add ops surface for zero benefit — on restart we'd rebuild them anyway.",
      },
      {
        choice: "Stub-fallback when OPENAI_API_KEY is absent",
        reason:
          "Lets the full pipeline (and smoke tests) run offline. A SHA-256-derived pseudo-embedding keeps the rest of the system honest about its assumptions while making real API calls explicitly opt-in.",
      },
    ],
    sources: [
      { path: "backend/graph/nodes/embedder.py", note: "the node" },
      { path: "backend/graph/vectorstore.py", note: "Chroma wrapper, per-session collections" },
      { path: "backend/graph/llm.py", note: "OpenAI client with stub fallback" },
    ],
  },

  emphasis_collector: {
    title: "Emphasis collector (HITL)",
    oneLiner: "Pauses the graph until the user has set per-section emphasis.",
    why:
      "Emphasis is the cheapest steering signal we have: telling the Drafter ahead of time which sections to go deep on costs four clicks and saves a re-draft. Putting the pause here — before template_builder runs — means we never embed-and-retrieve for sections the user marks `dont_need`.",
    reads: ["emphasis (injected via update_state)"],
    writes: ["trace_log", "current_node"],
    decisions: [
      {
        choice: "interrupt_before this node, not after",
        reason:
          "interrupt_before lets us stop the graph cleanly, mutate state from the API layer via update_state, then resume. The node itself is a passthrough that fires once the resume happens — it exists only to record a trace entry capturing what emphasis the user submitted.",
      },
      {
        choice: "4-level scale, not a 0–10 slider",
        reason:
          "Discrete levels (must_have / good_to_have / can_live_with / dont_need) map 1:1 to prompt directives the Drafter can act on. A slider would force the prompt to interpret '7/10' as something — and that's a worse contract.",
      },
    ],
    sources: [
      { path: "backend/graph/nodes/emphasis_collector.py" },
      { path: "backend/graph/builder.py", symbol: "interrupt_before=[...]", note: "registration of the pause" },
      { path: "backend/main.py", symbol: "POST /api/sessions/{id}/emphasis", note: "how the API resumes" },
    ],
  },

  template_builder: {
    title: "Template builder",
    oneLiner: "Applies emphasis + critic deltas to the base template; owns the attempt-number bump.",
    why:
      "The base template is fixed (8 BRD sections). What changes per session is which sections survive, how each is weighted, and which deltas need to be applied. Doing all of that mutation in one node means the Drafter receives a fully-resolved template and doesn't have to make policy decisions.",
    reads: ["base_template", "emphasis", "attempt_number", "feedback_1_deltas"],
    writes: ["mutated_template", "attempt_number (if bumped 1→2)", "status (DRAFT_2)", "trace_log", "current_node"],
    decisions: [
      {
        choice: "Sections with emphasis == 'dont_need' are dropped, not just shortened",
        reason:
          "If the user says 'don't need it,' the Drafter shouldn't show the header at all. Dropping the section here means the prompt never sees it, which is more reliable than asking the model to omit on instruction.",
      },
      {
        choice: "Bump attempt_number HERE on the loop-back from critic",
        reason:
          "The spec originally bumped attempt_number on the server before resume — that caused the route to skip directly from 'critic processed feedback 1' to 'finalize,' with draft 2 never running. Owning the bump inside template_builder localizes the state transition to the node that has the most context (it sees feedback_1_deltas).",
      },
      {
        choice: "emphasis_override on a delta replaces the user-set emphasis for that section",
        reason:
          "Sometimes the user reads draft 1 and realizes a section needs to go deeper than they originally said. Letting the critic emit an emphasis_override lets the second pass change weight without the user manually re-touching the dial.",
      },
    ],
    sources: [{ path: "backend/graph/nodes/template_builder.py" }],
  },

  retriever: {
    title: "Retriever",
    oneLiner: "For each surviving section, queries Chroma with the section's retrieval_query.",
    why:
      "Different BRD sections want different evidence. Stakeholders, success metrics, and non-functional requirements all live in different chunks of the source. Section-specific retrieval narrows what the Drafter has to read for any single section, which tightens both quality and cost.",
    reads: ["mutated_template (with retrieval_query per section)", "chunks", "session_id"],
    writes: ["retrieved_by_section: { section_id: [chunk_id, ...] }", "trace_log", "current_node"],
    decisions: [
      {
        choice: "top-k = 5 per section",
        reason:
          "Empirically enough context for most BRD sections without inflating the prompt. Smaller k starves sections like Functional Requirements that legitimately draw from many parts of the source.",
      },
      {
        choice: "retrieval_query is a fixed phrase per section, not the section name",
        reason:
          "'Executive Summary' is a poor query — it doesn't appear in source documents. 'business problem overview executive summary' (the actual configured query) covers the semantic neighborhood you'd expect that section to draw from.",
      },
      {
        choice: "Fall back to first-N chunks if Chroma returns nothing",
        reason:
          "On a very short source, the collection might return zero hits. The Drafter still needs something to ground on, so the retriever returns the first few chunks rather than an empty list — visible in the trace via stub_mode or empty queries.",
      },
    ],
    sources: [
      { path: "backend/graph/nodes/retriever.py" },
      { path: "backend/graph/builder.py", symbol: "BASE_TEMPLATE", note: "where retrieval_query strings live" },
    ],
  },

  drafter: {
    title: "Drafter (Agent #1)",
    oneLiner: "Calls GPT-4o with retrieved chunks + emphasis + deltas; returns BRD JSON with citations.",
    why:
      "This is one of two LLM agents in the graph. Its only job is to turn structured inputs (chunks, emphasis, deltas) into structured BRD output. Keeping it scoped to that — no conversation, no routing, no scoring — makes its behavior predictable and its prompt auditable.",
    reads: [
      "mutated_template",
      "retrieved_by_section",
      "chunks",
      "emphasis",
      "feedback_1_deltas (on attempt 2)",
      "attempt_number",
    ],
    writes: ["draft_{attempt}_json", "trace_log", "current_node"],
    decisions: [
      {
        choice: "OpenAI JSON mode (response_format json_object)",
        reason:
          "Plain string output would force a fragile parse step. JSON mode pushes the structural guarantee into the model layer where it belongs.",
      },
      {
        choice: "Prompt lives in prompts/drafter.txt, not inlined in Python",
        reason:
          "Prompts are the most-edited file in any LLM app. Keeping them as standalone files means they can be diffed, reviewed, and edited without touching code. The Python side just .format()'s in the inputs.",
      },
      {
        choice: "On attempt 2, deltas are appended to the prompt as binding instructions",
        reason:
          "The deltas are the critic's structured interpretation of user feedback. Telling the Drafter 'apply every delta exactly as specified' (not 'consider') is what makes the second draft actually different from the first.",
      },
      {
        choice: "Drafter always emits sources: [chunk_id, ...] per section",
        reason:
          "Every claim in the BRD must be tied back to source chunks for the trace to mean anything. Mandating the sources field in the prompt is cheaper than trying to recover provenance from generated prose.",
      },
      {
        choice: "Full filled prompt stored in the trace payload",
        reason:
          "The single most useful artifact for explainability is the prompt the model actually saw. The Runs tab's payload toggle exposes it verbatim.",
      },
    ],
    sources: [
      { path: "backend/graph/nodes/drafter.py" },
      { path: "backend/prompts/drafter.txt", note: "the prompt template" },
    ],
  },

  renderer: {
    title: "Renderer",
    oneLiner: "Converts the Drafter's JSON into the markdown the UI displays; advances the status.",
    why:
      "Separating JSON → markdown from the LLM call means we can change how the BRD is presented without re-running the model. It also gives us one place to compute the status transition (DRAFT_N → FEEDBACK_N) so downstream code doesn't have to.",
    reads: ["draft_{attempt}_json", "attempt_number"],
    writes: ["draft_{attempt}_markdown", "status (FEEDBACK_1 / FEEDBACK_2)", "trace_log", "current_node"],
    decisions: [
      {
        choice: "Render in a node, not in the frontend",
        reason:
          "The markdown is part of the persisted state and is what the UI re-reads on resume / time-travel. Putting it in state lets time-travel show the exact markdown the user saw at any past checkpoint.",
      },
    ],
    sources: [{ path: "backend/graph/nodes/renderer.py" }],
  },

  evaluator: {
    title: "Evaluator",
    oneLiner: "Independent quality check on every draft — grounding + coverage scores surfaced in the trace before feedback.",
    why:
      "Without this, the 'Critic' was really just a feedback translator and you had no quality signal at all. The evaluator scores each draft against the retrieved chunks and the section emphasis, so when the user sits down to write feedback they can see exactly which sections are weak (and why) instead of guessing.",
    reads: [
      "draft_{attempt}_markdown",
      "mutated_template (with emphasis)",
      "retrieved_by_section",
      "chunks",
      "attempt_number",
    ],
    writes: ["draft_{attempt}_evaluation", "trace_log", "current_node"],
    decisions: [
      {
        choice: "Two scoring dimensions: grounding + coverage (1-5 each)",
        reason:
          "Grounding catches hallucinations (claims not in the retrieved chunks). Coverage catches the opposite failure — evidence was available but the section ignored it, or a must_have section came out shallow. Together they capture the two ways a RAG draft typically fails.",
      },
      {
        choice: "Separate node, not folded into the Critic",
        reason:
          "The Critic translates user feedback (free text → typed Deltas). The Evaluator is a different job — independent quality scoring before any user feedback exists. Keeping them as separate nodes means the trace panel shows distinct entries for each concern and the routing logic stays simple.",
      },
      {
        choice: "Informational — never bypasses the feedback HITL",
        reason:
          "An earlier version of route_after_evaluator skipped feedback_collector when scores were high. That broke the product expectation that the user reviews every draft. The score is now strictly informational: it appears in the trace and per-section issues are visible, but routing always goes through feedback.",
      },
      {
        choice: "Stub-mode scores deliberately low",
        reason:
          "Without an API key the stub returns score=2 across the board. Predictable for the smoke test, and useless enough that no one mistakes the stub for real evaluation. Real scoring only kicks in when OPENAI_API_KEY is set.",
      },
    ],
    sources: [
      { path: "backend/graph/nodes/evaluator.py", note: "the node" },
      { path: "backend/prompts/evaluator.txt", note: "the rubric prompt" },
      { path: "backend/graph/routing.py", symbol: "route_after_evaluator", note: "always returns feedback_collector" },
    ],
  },

  feedback_collector: {
    title: "Feedback collector (HITL)",
    oneLiner: "Pauses the graph until the user has read the current draft and given feedback.",
    why:
      "The whole point of the two-attempt loop is that the user gets to react to a real draft. interrupt_before here means the graph idles cheaply — there's no polling loop on the backend, the SqliteSaver just holds state until the next API call.",
    reads: ["feedback_{attempt}_raw (injected via update_state)", "attempt_number"],
    writes: ["trace_log", "current_node"],
    decisions: [
      {
        choice: "Passthrough node, with the actual pause done by interrupt_before",
        reason:
          "Same pattern as emphasis_collector. The node itself is trivial — its job is to leave a trace entry recording how many chars of feedback came in for which attempt.",
      },
      {
        choice: "Server doesn't bump attempt_number when injecting feedback",
        reason:
          "If the server bumped attempt before resume, the critic would read feedback_2_raw on attempt 1 (None) and the route would jump to finalize before draft 2 ran. We let template_builder own the bump on its re-entry instead.",
      },
    ],
    sources: [
      { path: "backend/graph/nodes/feedback_collector.py" },
      { path: "backend/main.py", symbol: "POST /api/sessions/{id}/feedback", note: "feedback injection" },
    ],
  },

  critic: {
    title: "Critic (Agent #2)",
    oneLiner: "Converts free-text user feedback into a structured list of Delta instructions.",
    why:
      "This is the second LLM agent, and the more important one for the 'agentic' claim. Without it, user feedback would have to be passed verbatim to the Drafter — destroying the audit trail. By forcing feedback through a typed Delta schema, every modification to the next draft is traceable to a specific user intent.",
    reads: [
      "feedback_{attempt}_raw",
      "draft_{attempt}_markdown",
      "mutated_template",
      "attempt_number",
    ],
    writes: ["feedback_{attempt}_deltas", "status (FINAL on attempt 2)", "trace_log", "current_node"],
    decisions: [
      {
        choice: "Critic emits Deltas only — never prompt rewrites",
        reason:
          "Letting the critic rewrite the Drafter's prompt would be powerful, but it destroys explainability: a future reviewer can't tell which change traces to which user intent. Deltas are auditable, bounded, composable, and what the Runs tab surfaces.",
      },
      {
        choice: "Retry-on-bad-JSON, twice, then fallback",
        reason:
          "JSON mode is reliable but not bulletproof. One retry with a 'your last response failed to parse' suffix usually fixes it; if not, a single GLOBAL/rewrite fallback delta keeps the pipeline moving instead of throwing.",
      },
      {
        choice: "Critic sets status=FINAL on attempt 2 itself",
        reason:
          "Avoids a race where the finalizer node hasn't run yet but the route is already deciding. By the time route_after_critic fires, status is already correct.",
      },
    ],
    sources: [
      { path: "backend/graph/nodes/critic.py" },
      { path: "backend/prompts/critic.txt", note: "the prompt template" },
      { path: "backend/graph/state.py", symbol: "Delta TypedDict", note: "the schema deltas conform to" },
    ],
  },

  finalizer: {
    title: "Finalizer",
    oneLiner: "Terminal node — marks the session FINAL and ends the graph.",
    why:
      "Having an explicit terminal node (rather than ending after critic) gives the UI a clean signal that the session is over and gives us a single place to do any 'we're done' bookkeeping (notifications, exports, etc.) without scattering it.",
    reads: ["draft_{attempt}_markdown", "attempt_number"],
    writes: ["status (FINAL)", "trace_log", "current_node"],
    decisions: [
      {
        choice: "Stays a node, not an inline transition",
        reason:
          "Could be an inline `route → END` after critic, but a dedicated node lets us record a trace entry for the 'done' moment and gives future work (digest emails, export hooks) a natural home.",
      },
    ],
    sources: [
      { path: "backend/graph/nodes/finalizer.py" },
      { path: "backend/graph/routing.py", symbol: "route_after_critic", note: "the routing decision that lands here" },
    ],
  },
};
