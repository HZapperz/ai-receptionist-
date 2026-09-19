import asyncio
import random
import re
from types import SimpleNamespace

from openai import APITimeoutError, AsyncOpenAI, RateLimitError

from agents.settings import settings

_client = AsyncOpenAI(base_url=settings.LLM_BASE_URL, api_key=settings.LLM_API_KEY or "x", timeout=45)
# A 24B-34B model costs 2 concurrency units per in-flight call on Featherless,
# so a 4-unit plan allows 2 at once. Confirm with GET /v1/plan.
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


async def chat(messages: list[dict], tools: list[dict] | None = None):
    if settings.LLM_FAKE:
        return _fake_response()
    kwargs: dict = dict(model=settings.LLM_MODEL, messages=messages, temperature=0.2, max_tokens=800)
    if tools:
        kwargs["tools"] = tools
    if settings.LLM_DISABLE_THINKING:
        # Qwen3 thinking switch. Verify the key on the provider's docs;
        # the fallback is to append "/no_think" to the system prompt.
        kwargs["extra_body"] = {"chat_template_kwargs": {"enable_thinking": False}}
    for attempt in range(4):
        try:
            async with _sem:
                return await _client.chat.completions.create(**kwargs)
        except (RateLimitError, APITimeoutError):
            if attempt == 3:
                raise
            await asyncio.sleep(1.5 * (attempt + 1) + random.random())
