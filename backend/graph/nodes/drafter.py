import json
from pathlib import Path

from graph.llm import get_client
from graph.nodes._helpers import now_iso, make_trace

_PROMPT_PATH = Path(__file__).resolve().parent.parent.parent / "prompts" / "drafter.txt"


def _format_retrieved(state: dict) -> str:
    chunks = {c["id"]: c for c in (state.get("chunks") or [])}
    retrieved = state.get("retrieved_by_section") or {}
    template = state.get("mutated_template") or []

    parts: list[str] = []
    for s in template:
        sid = s["id"]
        ids = retrieved.get(sid, [])
        parts.append(f"### {s['name']} (section id: {sid})")
        if not ids:
            parts.append("(no chunks retrieved)")
            continue
        for cid in ids:
            ch = chunks.get(cid)
            if not ch:
                continue
            parts.append(f"[{cid}] {ch['text']}")
        parts.append("")
    return "\n".join(parts) or "(no retrieved content)"


def _format_template(template: list[dict]) -> str:
    lines = []
    for s in template:
        lines.append(f"- **{s['name']}** ({s['id']}): {s.get('description', '')}")
    return "\n".join(lines)


def _format_emphasis(template: list[dict]) -> str:
    lines = []
    for s in template:
        lines.append(f"- {s['name']}: {s.get('emphasis', 'good_to_have').upper()}")
    return "\n".join(lines)


def _format_deltas(deltas: list[dict]) -> str:
    if not deltas:
        return "NONE"
    lines = []
    for i, d in enumerate(deltas, 1):
        lines.append(
            f"{i}. SECTION={d.get('section')} ACTION={d.get('action')} "
            f"INSTRUCTION={d.get('instruction')} REASON={d.get('reason')}"
        )
    return "\n".join(lines)


def _stub_draft(template: list[dict], attempt: int, retrieved: dict, chunks: list[dict]) -> dict:
    chunk_lookup = {c["id"]: c for c in chunks}
    sections = []
    for s in template:
        ids = retrieved.get(s["id"], [])[:2]
        excerpt = ""
        for cid in ids:
            ch = chunk_lookup.get(cid)
            if ch:
                excerpt = ch["text"][:200]
                break
        sections.append({
            "name": s["name"],
            "emphasis": s.get("emphasis", "good_to_have").upper(),
            "content": (
                f"[STUB — attempt {attempt}] {s.get('description', '')}\n\n"
                + (f"Drawn from source: \"{excerpt}…\"" if excerpt else "(no source excerpt)")
            ),
            "sources": ids,
        })
    return {"sections": sections}


def drafter(state: dict) -> dict:
    started = now_iso()
    attempt = state.get("attempt_number", 1)
    template = state.get("mutated_template") or []
    retrieved = state.get("retrieved_by_section") or {}
    chunks = state.get("chunks") or []

    retrieved_block = _format_retrieved(state)
    template_block = _format_template(template)
    emphasis_block = _format_emphasis(template)
    deltas = state.get("feedback_1_deltas") if attempt == 2 else None
    deltas_block = _format_deltas(deltas) if deltas else "NONE"

    prompt_template = _PROMPT_PATH.read_text()
    filled = prompt_template.format(
        retrieved_chunks_by_section=retrieved_block,
        template_sections_with_descriptions=template_block,
        emphasis_block=emphasis_block,
        feedback_deltas_block=deltas_block,
    )

    client = get_client()
    payload: dict = {
        "filled_prompt": filled,
        "model": "gpt-4o",
        "attempt": attempt,
    }

    if client is None:
        draft_json = _stub_draft(template, attempt, retrieved, chunks)
        payload["stub_mode"] = True
        payload["raw_output"] = draft_json
    else:
        resp = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": filled}],
            response_format={"type": "json_object"},
        )
        content = resp.choices[0].message.content or "{}"
        try:
            draft_json = json.loads(content)
            if "sections" not in draft_json:
                raise ValueError("missing 'sections' in drafter response")
        except (json.JSONDecodeError, ValueError):
            draft_json = _stub_draft(template, attempt, retrieved, chunks)
            payload["parse_failure"] = True
        payload["tokens_in"] = resp.usage.prompt_tokens if resp.usage else None
        payload["tokens_out"] = resp.usage.completion_tokens if resp.usage else None
        payload["raw_output"] = draft_json

    trace = make_trace(
        "drafter",
        started,
        input_summary=f"Attempt {attempt}, {len(template)} sections, deltas={'yes' if deltas else 'no'}",
        output_summary=f"{len(draft_json.get('sections', []))} sections drafted{' (stub)' if client is None else ''}",
        payload=payload,
    )

    key = f"draft_{attempt}_json"
    return {
        key: draft_json,
        "trace_log": state.get("trace_log", []) + [trace],
        "current_node": "drafter",
    }
