from graph.nodes._helpers import now_iso, make_trace


def template_builder(state: dict) -> dict:
    """Apply emphasis + deltas to base_template → mutated_template.

    Also owns the attempt_number bump from 1 to 2: when we re-enter after
    Critic produced feedback_1_deltas, advance the cycle to the second draft.

    Rules:
      - Sections with emphasis == 'dont_need' are dropped entirely.
      - emphasis_override from any delta replaces the user-set emphasis on
        that section.
      - 'remove' deltas drop the section.
      - All other delta actions are passed through unchanged to the Drafter
        via the prompt.
    """
    started = now_iso()
    base = state.get("base_template") or []
    emphasis = state.get("emphasis") or {}
    attempt = state.get("attempt_number", 1)
    feedback_1_deltas = state.get("feedback_1_deltas") or []

    # If we're looping back after critic produced feedback_1_deltas, bump.
    bumped = False
    if attempt == 1 and feedback_1_deltas:
        attempt = 2
        bumped = True

    deltas = feedback_1_deltas if attempt == 2 else []

    effective_emphasis = dict(emphasis)
    dropped_sections: set[str] = set()
    for d in deltas:
        sec = d.get("section")
        if d.get("emphasis_override"):
            for s in base:
                if s["name"] == sec or s["id"] == sec:
                    effective_emphasis[s["id"]] = d["emphasis_override"]
        if d.get("action") == "remove":
            for s in base:
                if s["name"] == sec or s["id"] == sec:
                    dropped_sections.add(s["id"])

    mutated = []
    for s in base:
        sid = s["id"]
        em = effective_emphasis.get(sid, "good_to_have")
        if em == "dont_need":
            continue
        if sid in dropped_sections:
            continue
        mutated.append({**s, "emphasis": em})

    trace = make_trace(
        "template_builder",
        started,
        input_summary=f"{len(base)} base sections, {len(deltas)} deltas, attempt {attempt}{' (bumped)' if bumped else ''}",
        output_summary=f"{len(mutated)} sections retained after emphasis/deltas",
        payload={
            "attempt_after_run": attempt,
            "bumped": bumped,
            "effective_emphasis": effective_emphasis,
            "dropped_sections": sorted(dropped_sections),
            "deltas_applied": deltas,
        },
    )
    out = {
        "mutated_template": mutated,
        "trace_log": state.get("trace_log", []) + [trace],
        "current_node": "template_builder",
    }
    if bumped:
        out["attempt_number"] = attempt
        out["status"] = "DRAFT_2"
    return out
