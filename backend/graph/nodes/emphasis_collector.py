from graph.nodes._helpers import now_iso, make_trace


def emphasis_collector(state: dict) -> dict:
    """Passthrough — interrupt_before fires before this runs.

    The user's emphasis is injected via GRAPH.update_state() before resume.
    By the time this node executes, state['emphasis'] is already populated.
    """
    started = now_iso()
    emphasis = state.get("emphasis") or {}
    trace = make_trace(
        "emphasis_collector",
        started,
        input_summary=f"{len(emphasis)} sections rated",
        output_summary=", ".join(f"{k}={v}" for k, v in emphasis.items()) or "no emphasis set",
        payload={"emphasis": emphasis},
    )
    return {
        "trace_log": state.get("trace_log", []) + [trace],
        "current_node": "emphasis_collector",
    }
