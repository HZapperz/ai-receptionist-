import asyncio
import random
import re
from types import SimpleNamespace

from openai import APIConnectionError, APITimeoutError, AsyncOpenAI, InternalServerError, RateLimitError

from agents.settings import settings

_client = AsyncOpenAI(base_url=settings.LLM_BASE_URL, api_key=settings.effective_llm_api_key() or "x", timeout=90)
_RETRY = (RateLimitError, APITimeoutError, APIConnectionError, InternalServerError)
# A 24B-34B model costs 2 concurrency units per in-flight call on Featherless.
# The team plan has 100 units (GET /v1/plan), so LLM_MAX_CONCURRENCY=6 is safe.
_sem = asyncio.Semaphore(settings.LLM_MAX_CONCURRENCY)
# A think block, or one cut off by max_tokens that runs to the end.
_THINK = re.compile(r"<think>.*?(?:</think>|\Z)", re.DOTALL)


def strip_think(text: str | None) -> str:
    """Reasoning must never reach a customer."""
    text = _THINK.sub("", text or "")
    # A stray </think> means the opening tag was in the prompt template:
    # everything before it is reasoning too.
    return text.rsplit("</think>", 1)[-1].strip()


def _fake_response():
    msg = SimpleNamespace(content="(stub reply: LLM_FAKE is on)", tool_calls=None)
    return SimpleNamespace(choices=[SimpleNamespace(message=msg)])


async def chat(messages: list[dict], tools: list[dict] | None = None, max_tokens: int | None = None):
    if settings.LLM_FAKE:
        return _fake_response()
    # Thinking tokens count against max_tokens, so leave room for them before the answer.
    if max_tokens is not None:
        effective_max_tokens = max_tokens
    else:
        effective_max_tokens = 800 if settings.LLM_DISABLE_THINKING else 3000
    kwargs: dict = dict(model=settings.LLM_MODEL, messages=messages, temperature=0.2, max_tokens=effective_max_tokens)
    if tools:
        kwargs["tools"] = tools
    if settings.LLM_DISABLE_THINKING:
        # Qwen3 thinking switch (Featherless passes chat_template_kwargs through).
        # With thinking off, Qwen3-32B skipped tools and made up prices in testing.
        kwargs["extra_body"] = {"chat_template_kwargs": {"enable_thinking": False}}
    for attempt in range(4):
        try:
            async with _sem:
                resp = await _client.chat.completions.create(**kwargs)
            if resp.choices:
                return resp
            # Featherless sometimes answers 200 with {"error": {"code": "no_response"}} and no choices.
            err = (getattr(resp, "model_extra", None) or {}).get("error") or "no choices in response"
            finish_reason = getattr(resp.choices[0], "finish_reason", None) if getattr(resp, "choices", None) else None
            if attempt == 3:
                raise RuntimeError(f"model returned no choices: {err} (finish_reason: {finish_reason})")
        except _RETRY:
            if attempt == 3:
                raise
        await asyncio.sleep(1.5 * (attempt + 1) + random.random())
