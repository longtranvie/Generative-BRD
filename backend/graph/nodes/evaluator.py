"""Evaluator: independent quality check on the latest draft.

Scores every section on grounding + coverage (1-5 each), aggregates to an
overall score, and emits per-section issues. The output is informational —
it surfaces in the trace so the user can see exactly where the draft is
weak before they type their feedback. Routing is unchanged either way.
"""
import json
from pathlib import Path

from graph.llm import get_client
from graph.nodes._helpers import now_iso, make_trace

_PROMPT_PATH = Path(__file__).resolve().parent.parent.parent / "prompts" / "evaluator.txt"

# Stub-mode score (no API key). Predictable for smoke tests; deliberately
# low so no one mistakes the stub for real evaluation.
_STUB_SCORE = 2


def _format_template(template: list[dict]) -> str:
    return "\n".join(
        f"- **{s['name']}** ({s['id']}, emphasis={s.get('emphasis', 'good_to_have')}): "
        f"{s.get('description', '')}"
        for s in template
    ) or "(no sections)"


def _format_retrieved(state: dict) -> str:
    chunks = {c["id"]: c for c in (state.get("chunks") or [])}
    retrieved = state.get("retrieved_by_section") or {}
    template = state.get("mutated_template") or []
    parts: list[str] = []
    for s in template:
        sid = s["id"]
        parts.append(f"### {s['name']} ({sid})")
        ids = retrieved.get(sid, [])
        if not ids:
            parts.append("(no chunks retrieved)")
            continue
        for cid in ids:
            ch = chunks.get(cid)
            if not ch:
                continue
            heading = ch.get("heading_path")
            label = f"[{cid}{' · ' + heading if heading else ''}]"
            parts.append(f"{label} {ch['text']}")
        parts.append("")
    return "\n".join(parts) or "(no retrieved content)"


def _stub_evaluation(template: list[dict]) -> dict:
    section_scores = {
        s["id"]: {
            "grounding": _STUB_SCORE,
            "coverage": _STUB_SCORE,
            "issues": ["[stub-mode evaluator — no real scoring]"],
        }
        for s in template
    }
    return {
        "overall_score": float(_STUB_SCORE),
        "section_scores": section_scores,
        "summary": "Stub-mode evaluator: scores are placeholders, set OPENAI_API_KEY for real evaluation.",
        "recommend_continue": True,
    }


def _min_section_score(evaluation: dict) -> float:
    scores = (evaluation or {}).get("section_scores") or {}
    if not scores:
        return 0.0
    return min(
        (float(s.get("grounding", 0)) + float(s.get("coverage", 0))) / 2.0
        for s in scores.values()
    )


def evaluator(state: dict) -> dict:
    started = now_iso()
    attempt = state.get("attempt_number", 1)
    draft_md = state.get(f"draft_{attempt}_markdown") or ""
    template = state.get("mutated_template") or []

    prompt_template = _PROMPT_PATH.read_text()
    filled = prompt_template.format(
        draft_markdown=draft_md[:6000],
        template_block=_format_template(template),
        retrieved_block=_format_retrieved(state),
    )

    client = get_client()
    payload: dict = {
        "filled_prompt": filled,
        "model": "gpt-4o",
        "attempt": attempt,
    }

    evaluation: dict
    if client is None:
        evaluation = _stub_evaluation(template)
        payload["stub_mode"] = True
    else:
        try:
            resp = client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": filled}],
                response_format={"type": "json_object"},
            )
            content = resp.choices[0].message.content or "{}"
            evaluation = json.loads(content)
            if "section_scores" not in evaluation or "overall_score" not in evaluation:
                raise ValueError("evaluator response missing required fields")
            payload["tokens_in"] = resp.usage.prompt_tokens if resp.usage else None
            payload["tokens_out"] = resp.usage.completion_tokens if resp.usage else None
        except (json.JSONDecodeError, ValueError) as e:
            evaluation = _stub_evaluation(template)
            payload["parse_failure"] = str(e)

    overall = float(evaluation.get("overall_score", 0.0))
    min_section = _min_section_score(evaluation)

    payload["evaluation"] = evaluation
    payload["overall_score"] = overall
    payload["min_section_score"] = min_section

    trace = make_trace(
        "evaluator",
        started,
        input_summary=f"attempt {attempt}, {len(template)} sections, {len(draft_md)} chars draft",
        output_summary=(
            f"overall={overall:.2f}, min_section={min_section:.2f}"
            + (" (stub)" if client is None else "")
        ),
        payload=payload,
    )
    key = f"draft_{attempt}_evaluation"
    return {
        key: evaluation,
        "trace_log": state.get("trace_log", []) + [trace],
        "current_node": "evaluator",
    }
