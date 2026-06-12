from typing import TypedDict, Literal, Optional, NotRequired

EmphasisLevel = Literal["must_have", "good_to_have", "can_live_with", "dont_need"]
SessionStatus = Literal["DRAFT_1", "FEEDBACK_1", "DRAFT_2", "FEEDBACK_2", "FINAL"]


class Chunk(TypedDict):
    id: str
    text: str
    char_start: int
    char_end: int
    heading_path: NotRequired[Optional[str]]


class Delta(TypedDict):
    section: str
    action: Literal["expand", "shorten", "rewrite", "add_detail", "remove", "change_tone"]
    instruction: str
    reason: str
    emphasis_override: Optional[EmphasisLevel]


class TraceEntry(TypedDict):
    node_name: str
    started_at: str
    completed_at: Optional[str]
    input_summary: str
    output_summary: str
    payload: dict
    status: Literal["running", "done", "error"]


class AgentState(TypedDict):
    # Identity
    session_id: str
    attempt_number: int
    status: SessionStatus

    # Input
    source_text: str
    source_filename: Optional[str]

    # Chunking + retrieval
    chunks: list[Chunk]
    embeddings_written: bool
    retrieved_by_section: dict[str, list[str]]

    # User-controlled
    emphasis: dict[str, EmphasisLevel]

    # Template
    base_template: list[dict]
    mutated_template: list[dict]

    # Generation
    draft_1_json: Optional[dict]
    draft_1_markdown: Optional[str]
    draft_2_json: Optional[dict]
    draft_2_markdown: Optional[str]

    # Evaluation (per-draft quality scores from the evaluator node)
    draft_1_evaluation: Optional[dict]
    draft_2_evaluation: Optional[dict]

    # Feedback
    feedback_1_raw: Optional[str]
    feedback_1_deltas: Optional[list[Delta]]
    feedback_2_raw: Optional[str]
    feedback_2_deltas: Optional[list[Delta]]

    # Trace (cross-cutting)
    trace_log: list[TraceEntry]
    current_node: Optional[str]

    # Early-exit signal: set by the /finalize endpoint when the user accepts
    # the v1 draft and skips the second drafting round.
    finalize_requested: NotRequired[bool]
