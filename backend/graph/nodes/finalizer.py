from graph.nodes._helpers import now_iso, make_trace


def finalizer(state: dict) -> dict:
    started = now_iso()
    attempt = state.get("attempt_number", 1)
    md = state.get(f"draft_{attempt}_markdown") or state.get("draft_1_markdown") or ""
    trace = make_trace(
        "finalizer",
        started,
        input_summary=f"attempt {attempt}, final markdown {len(md)} chars",
        output_summary="session marked FINAL",
        payload={"final_attempt": attempt},
    )
    return {
        "status": "FINAL",
        "trace_log": state.get("trace_log", []) + [trace],
        "current_node": "finalizer",
    }
