"""Shared LLM + embedding helpers.

If OPENAI_API_KEY is not set the helpers degrade to deterministic stubs so
that the graph can be exercised end-to-end (including the smoke test) with
no network access.
"""
import os
from functools import lru_cache

from openai import OpenAI


def has_api_key() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))


@lru_cache(maxsize=1)
def get_client() -> OpenAI | None:
    if not has_api_key():
        return None
    # 60s timeout so a slow upstream call never wedges the uvicorn worker.
    return OpenAI(timeout=60.0)
