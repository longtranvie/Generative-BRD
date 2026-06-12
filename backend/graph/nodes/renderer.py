from graph.nodes._helpers import now_iso, make_trace


def _render_markdown(draft_json: dict) -> str:
    if not draft_json:
        return ""
    out: list[str] = ["# Business Requirements Document\n"]
    for s in draft_json.get("sections", []):
        out.append(f"## {s['name']}  _(emphasis: {s.get('emphasis', '')})_\n")
        out.append(s.get("content", "") + "\n")
        sources = s.get("sources") or []
        if sources:
            out.append(f"_Sources: {', '.join(sources)}_\n")
        out.append("")
    return "\n".join(out)


def renderer(state: dict) -> dict:
    started = now_iso()
    attempt = state.get("attempt_number", 1)
    draft = state.get(f"draft_{attempt}_json") or {}
    md = _render_markdown(draft)
    trace = make_trace(
        "renderer",
        started,
        input_summary=f"draft_{attempt}_json with {len(draft.get('sections', []))} sections",
        output_summary=f"{len(md)} chars of markdown",
        payload={"length": len(md)},
    )
    key = f"draft_{attempt}_markdown"
    status_key = "FEEDBACK_1" if attempt == 1 else "FEEDBACK_2"
    return {
        key: md,
        "status": status_key,
        "trace_log": state.get("trace_log", []) + [trace],
        "current_node": "renderer",
    }
