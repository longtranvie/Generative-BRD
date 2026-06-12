import json
from pathlib import Path

from graph.llm import get_client
from graph.nodes._helpers import now_iso, make_trace

_PROMPT_PATH = Path(__file__).resolve().parent.parent.parent / "prompts" / "critic.txt"


def _format_section_list(template: list[dict]) -> str:
    return "\n".join(f"- {s['name']}" for s in template) or "(no sections)"


def _fallback_delta(feedback_raw: str) -> dict:
    return {
        "section": "GLOBAL",
        "action": "rewrite",
        "instruction": "Improve clarity and specificity based on user feedback.",
        "reason": feedback_raw[:200] or "vague feedback",
        "emphasis_override": None,
    }


def critic(state: dict) -> dict:
    started = now_iso()
    attempt = state.get("attempt_number", 1)
    feedback_raw = state.get(f"feedback_{attempt}_raw") or ""
    previous_draft = state.get(f"draft_{attempt}_markdown") or ""
    template = state.get("mutated_template") or []

    prompt_template = _PROMPT_PATH.read_text()
    section_list = _format_section_list(template)
    filled = prompt_template.format(
        previous_draft_summary=previous_draft[:2000],
        user_feedback_raw=feedback_raw,
        section_list=section_list,
    )

    client = get_client()
    payload: dict = {
        "filled_prompt": filled,
        "model": "gpt-4o",
        "attempt": attempt,
    }
    deltas: list[dict] | None = None

    if client is None:
        deltas = [_fallback_delta(feedback_raw)]
        payload["stub_mode"] = True
    else:
        msg = filled
        for round_i in range(2):
            resp = client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": msg}],
                response_format={"type": "json_object"},
            )
            content = resp.choices[0].message.content or "{}"
            try:
                parsed = json.loads(content)
                if "deltas" not in parsed or not isinstance(parsed["deltas"], list):
                    raise KeyError("deltas missing or not a list")
                deltas = parsed["deltas"]
                payload["summary"] = parsed.get("summary")
                payload["tokens_in"] = resp.usage.prompt_tokens if resp.usage else None
                payload["tokens_out"] = resp.usage.completion_tokens if resp.usage else None
                break
            except (json.JSONDecodeError, KeyError) as e:
                payload[f"retry_{round_i}_error"] = str(e)
                if round_i == 0:
                    msg = filled + f"\n\nYour last response failed to parse: {e}. Return strict JSON only."
                else:
                    deltas = [_fallback_delta(feedback_raw)]
                    payload["used_fallback"] = True

    payload["deltas"] = deltas

    trace = make_trace(
        "critic",
        started,
        input_summary=f"attempt {attempt}, {len(feedback_raw)} chars feedback",
        output_summary=f"{len(deltas or [])} deltas extracted{' (stub)' if client is None else ''}",
        payload=payload,
    )

    key = f"feedback_{attempt}_deltas"
    out: dict = {
        key: deltas,
        "trace_log": state.get("trace_log", []) + [trace],
        "current_node": "critic",
    }
    if attempt == 2:
        out["status"] = "FINAL"
    return out
