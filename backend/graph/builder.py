import os
from pathlib import Path

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.sqlite import SqliteSaver

from graph.state import AgentState
from graph.nodes import (
    input_handler, chunker, embedder, emphasis_collector,
    template_builder, retriever, drafter, renderer, evaluator,
    feedback_collector, critic, finalizer,
)
from graph.routing import route_after_critic, route_after_evaluator, route_after_feedback_collector

# CHECKPOINT_DB_PATH can be set to a path on a mounted volume in prod
# (e.g. /data/checkpoints.db on Railway). Defaults to backend/checkpoints.db
# next to this file for local dev.
CHECKPOINT_DB = os.environ.get(
    "CHECKPOINT_DB_PATH",
    str(Path(__file__).resolve().parent.parent / "checkpoints.db"),
)
Path(CHECKPOINT_DB).parent.mkdir(parents=True, exist_ok=True)


def _build_uncompiled() -> StateGraph:
    g = StateGraph(AgentState)

    g.add_node("input_handler", input_handler)
    g.add_node("chunker", chunker)
    g.add_node("embedder", embedder)
    g.add_node("emphasis_collector", emphasis_collector)
    g.add_node("template_builder", template_builder)
    g.add_node("retriever", retriever)
    g.add_node("drafter", drafter)
    g.add_node("renderer", renderer)
    g.add_node("evaluator", evaluator)
    g.add_node("feedback_collector", feedback_collector)
    g.add_node("critic", critic)
    g.add_node("finalizer", finalizer)

    g.set_entry_point("input_handler")
    g.add_edge("input_handler", "chunker")
    g.add_edge("chunker", "embedder")
    g.add_edge("embedder", "emphasis_collector")
    g.add_edge("emphasis_collector", "template_builder")
    g.add_edge("template_builder", "retriever")
    g.add_edge("retriever", "drafter")
    g.add_edge("drafter", "renderer")
    g.add_edge("renderer", "evaluator")

    g.add_conditional_edges(
        "feedback_collector",
        route_after_feedback_collector,
        {
            "critic": "critic",
            "finalizer": "finalizer",
        },
    )

    g.add_conditional_edges(
        "evaluator",
        route_after_evaluator,
        {
            "feedback_collector": "feedback_collector",
            "finalizer": "finalizer",
        },
    )

    g.add_conditional_edges(
        "critic",
        route_after_critic,
        {
            "template_builder": "template_builder",
            "finalizer": "finalizer",
        },
    )
    g.add_edge("finalizer", END)
    return g


def build_graph():
    g = _build_uncompiled()
    # langgraph-checkpoint-sqlite >= 2.x exposes SqliteSaver.from_conn_string
    # as a context manager. We enter once at startup; FastAPI is long-lived.
    cm = SqliteSaver.from_conn_string(CHECKPOINT_DB)
    checkpointer = cm.__enter__()
    compiled = g.compile(
        checkpointer=checkpointer,
        interrupt_before=["emphasis_collector", "feedback_collector"],
    )
    # Stash the context manager on the compiled graph so it can be closed
    # cleanly on app shutdown if desired.
    compiled._checkpointer_cm = cm  # type: ignore[attr-defined]
    return compiled


GRAPH = build_graph()


# BRD template (default).
BASE_TEMPLATE = [
    {"id": "exec_summary", "name": "Executive Summary",
     "description": "One-paragraph overview of the business need and proposed solution.",
     "retrieval_query": "business problem overview executive summary"},
    {"id": "objectives", "name": "Business Objectives",
     "description": "Bulleted list of measurable goals.",
     "retrieval_query": "goals objectives outcomes measurable"},
    {"id": "scope", "name": "Scope",
     "description": "In-scope and out-of-scope items.",
     "retrieval_query": "scope boundaries included excluded"},
    {"id": "stakeholders", "name": "Stakeholders",
     "description": "Roles, responsibilities, decision authority.",
     "retrieval_query": "stakeholders roles users responsibilities"},
    {"id": "functional", "name": "Functional Requirements",
     "description": "What the system must do, numbered.",
     "retrieval_query": "features functionality requirements capabilities"},
    {"id": "nonfunctional", "name": "Non-Functional Requirements",
     "description": "Performance, security, compliance, usability.",
     "retrieval_query": "performance security compliance scalability"},
    {"id": "assumptions", "name": "Assumptions & Constraints",
     "description": "Known limitations and dependencies.",
     "retrieval_query": "assumptions constraints limitations dependencies risks"},
    {"id": "metrics", "name": "Success Metrics",
     "description": "Quantitative KPIs that define done.",
     "retrieval_query": "success metrics KPIs measurement criteria"},
]
