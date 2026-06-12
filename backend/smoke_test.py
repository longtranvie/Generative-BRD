"""Smoke test: compile the graph and walk it through a full session.

No OpenAI calls are made — all nodes return stub data. This validates:
  - Graph compiles with SqliteSaver + interrupt_before
  - First invoke runs to the emphasis_collector interrupt
  - update_state injects emphasis, resume runs through drafter+renderer and
    stops before feedback_collector
  - Feedback 1 inject + resume runs through critic, loops back to
    template_builder, drafts again, stops before feedback_collector
  - Feedback 2 inject + resume runs through critic and finalizer to END

Run: .venv/bin/python smoke_test.py
"""
import os
import sys
import uuid

# Ensure backend/ is on the path so `import graph...` works regardless of cwd.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from graph.builder import GRAPH, BASE_TEMPLATE


def run() -> None:
    session_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": session_id}}

    initial_state = {
        "session_id": session_id,
        "attempt_number": 1,
        "status": "DRAFT_1",
        "source_text": (
            "ACME Corp wants to build an internal expense management portal. "
            "Employees should be able to submit, approve, and audit expenses. "
            "Finance needs reporting. Security must enforce SSO and role-based access."
        ),
        "source_filename": "smoke.txt",
        "chunks": [],
        "embeddings_written": False,
        "retrieved_by_section": {},
        "emphasis": {},
        "base_template": BASE_TEMPLATE,
        "mutated_template": [],
        "draft_1_json": None,
        "draft_1_markdown": None,
        "draft_2_json": None,
        "draft_2_markdown": None,
        "draft_1_evaluation": None,
        "draft_2_evaluation": None,
        "feedback_1_raw": None,
        "feedback_1_deltas": None,
        "feedback_2_raw": None,
        "feedback_2_deltas": None,
        "trace_log": [],
        "current_node": None,
    }

    print(f"=== session {session_id} ===")
    result = GRAPH.invoke(initial_state, config)
    snap = GRAPH.get_state(config)
    print(f"[after first invoke] current_node={result.get('current_node')} next={list(snap.next)}")
    assert "emphasis_collector" in snap.next, f"expected interrupt before emphasis_collector, got {snap.next}"

    # Inject emphasis
    emphasis = {
        "exec_summary": "must_have",
        "objectives": "must_have",
        "scope": "good_to_have",
        "stakeholders": "good_to_have",
        "functional": "must_have",
        "nonfunctional": "can_live_with",
        "assumptions": "can_live_with",
        "metrics": "dont_need",
    }
    GRAPH.update_state(config, {"emphasis": emphasis})
    result = GRAPH.invoke(None, config)
    snap = GRAPH.get_state(config)
    print(f"[after emphasis resume] current_node={result.get('current_node')} next={list(snap.next)} status={result.get('status')}")
    assert "feedback_collector" in snap.next, f"expected interrupt before feedback_collector, got {snap.next}"
    assert result.get("draft_1_markdown"), "draft_1_markdown missing"

    # Feedback round 1 — server does NOT bump attempt_number; template_builder does.
    GRAPH.update_state(config, {
        "feedback_1_raw": "Make the executive summary punchier and add a section on rollout phasing.",
    })
    result = GRAPH.invoke(None, config)
    snap = GRAPH.get_state(config)
    print(f"[after feedback_1 resume] current_node={result.get('current_node')} next={list(snap.next)} status={result.get('status')}")
    assert "feedback_collector" in snap.next, f"expected interrupt before feedback_collector for round 2, got {snap.next}"
    assert result.get("draft_2_markdown"), "draft_2_markdown missing"

    # Feedback round 2 → finalize
    GRAPH.update_state(config, {"feedback_2_raw": "Looks good, ship it."})
    result = GRAPH.invoke(None, config)
    snap = GRAPH.get_state(config)
    print(f"[after feedback_2 resume] current_node={result.get('current_node')} next={list(snap.next)} status={result.get('status')}")
    assert result.get("status") == "FINAL", f"expected FINAL, got {result.get('status')}"
    assert list(snap.next) == [], f"expected graph to end, next={snap.next}"

    # History
    history = list(GRAPH.get_state_history(config))
    print(f"[history] {len(history)} checkpoints recorded")
    print(f"[trace] {len(result.get('trace_log', []))} trace entries")
    for t in result.get("trace_log", []):
        print(f"  - {t['node_name']}: {t['output_summary']}")
    print("\nSMOKE TEST PASSED")


if __name__ == "__main__":
    run()
