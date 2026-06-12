"""Shared LLM + embedding helpers.

If OPENAI_API_KEY is not set the helpers degrade to deterministic stubs so
that the graph can be exercised end-to-end (including the smoke test) with
no network access.
"""
import os
from functools import lru_cache

import truststore

# Make Python's SSL use the OS certificate store instead of certifi's bundle.
# Dev machines behind TLS-intercepting antivirus/proxies have the
# interceptor's root cert in the OS store but not in certifi — without this,
# every OpenAI call dies with CERTIFICATE_VERIFY_FAILED. No-op elsewhere.
# Must run before any OpenAI/httpx client is constructed; llm.py is the
# single chokepoint every LLM caller imports.
truststore.inject_into_ssl()

from openai import OpenAI


def has_api_key() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))


@lru_cache(maxsize=1)
def get_client() -> OpenAI | None:
    if not has_api_key():
        return None
    # 60s timeout so a slow upstream call never wedges the uvicorn worker.
    return OpenAI(timeout=60.0)
