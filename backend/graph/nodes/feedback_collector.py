from graph.nodes._helpers import now_iso, make_trace


def feedback_collector(state: dict) -> dict:
    """Passthrough — interrupt_before fires before this runs.

    User's free-text feedback is injected via GRAPH.update_state() before resume.
    """
    started = now_iso()
    attempt = state.get("attempt_number", 1)
    raw = state.get(f"feedback_{attempt}_raw") or ""
    trace = make_trace(
        "feedback_collector",
        started,
        input_summary=f"feedback for attempt {attempt}",
        output_summary=f"{len(raw)} chars captured",
        payload={"feedback_attempt": attempt, "feedback_chars": len(raw)},
    )
    return {
        "trace_log": state.get("trace_log", []) + [trace],
        "current_node": "feedback_collector",
    }
