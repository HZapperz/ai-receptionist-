"""Configure a headless OMP provider without developer-machine auth files."""
import json

from agents.settings import Settings


def configure_omp(settings: Settings, env: dict[str, str]) -> str:
    agent_dir = settings.runtime_dir() / "omp"
    agent_dir.mkdir(parents=True, exist_ok=True)
    env["PI_CODING_AGENT_DIR"] = str(agent_dir)
    if settings.MANAGER_MODEL:
        # Explicit native provider selection uses its own API-key environment variable.
        return settings.MANAGER_MODEL
    key = settings.effective_llm_api_key()
    if not key:
        raise RuntimeError("Manager needs LLM_API_KEY (or FEATHERLESS_API), or MANAGER_MODEL with provider credentials")
    env["RECEPTIONIST_LLM_API_KEY"] = key
    compat = {
        "supportsStore": False,
        "supportsDeveloperRole": False,
        "maxTokensField": "max_tokens",
        "supportsReasoningEffort": False,
    }
    if settings.LLM_DISABLE_THINKING:
        compat["extraBody"] = {"chat_template_kwargs": {"enable_thinking": False}}
    config = {"providers": {"receptionist": {
        "baseUrl": settings.LLM_BASE_URL,
        "apiKey": "RECEPTIONIST_LLM_API_KEY",
        "api": "openai-completions",
        "authHeader": True,
        "models": [{
            "id": settings.LLM_MODEL,
            "input": ["text"],
            "reasoning": False,
            "contextWindow": 32768,
            "maxTokens": 8000,
            "compat": compat,
        }],
    }}}
    # JSON is valid YAML. No credential value is written to disk.
    (agent_dir / "models.yml").write_text(json.dumps(config), encoding="utf-8")
    return f"receptionist/{settings.LLM_MODEL}"
