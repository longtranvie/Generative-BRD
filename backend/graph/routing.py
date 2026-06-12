def route_after_critic(state: dict) -> str:
    """After Critic produces deltas, decide where to go.

    We key on which feedback deltas have been produced so far rather than on
    attempt_number — that way a buggy attempt_number bump elsewhere can't
    accidentally short-circuit the second draft.

    - If feedback_2_deltas has just been produced → finalize.
    - Otherwise (we just produced feedback_1_deltas) → loop back to
      template_builder for the second drafting attempt.
    """
    if state.get("feedback_2_deltas") is not None:
        return "finalizer"
    return "template_builder"


def route_after_evaluator(state: dict) -> str:
    """After the evaluator scores the latest draft, always route to feedback.

    The evaluator's score is *informational* — it surfaces grounding and
    coverage issues in the trace so the user can see exactly where the draft
    is weak before they type their feedback. The user is always in the loop;
    we never skip the feedback HITL based on a score, even a high one.
    """
    return "feedback_collector"


def route_after_feedback_collector(state: dict) -> str:
    if state.get("finalize_requested"):
        return "finalizer"
    return "critic"
