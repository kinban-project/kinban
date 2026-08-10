from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import httpx

from config import env, pricing_profile


def _number(value: Any) -> int | None:
    try:
        return max(0, int(value)) if value is not None else None
    except (TypeError, ValueError):
        return None


def extract_usage(result: Any) -> dict[str, int | None]:
    candidates: list[Any] = []
    for attr in ("usage", "raw_responses", "rawResponses", "responses"):
        value = getattr(result, attr, None)
        if value is not None:
            candidates.append(value)
    if isinstance(result, dict):
        candidates.append(result.get("usage"))
    totals = {"inputTokens": None, "outputTokens": None, "totalTokens": None, "reasoningTokens": None, "cachedInputTokens": None}

    def visit(value: Any) -> None:
        if value is None:
            return
        if isinstance(value, (list, tuple)):
            for item in value:
                visit(item)
            return
        if isinstance(value, dict):
            usage = value.get("usage") if isinstance(value.get("usage"), dict) else value
            mapping = {
                "inputTokens": ("input_tokens", "prompt_tokens"),
                "outputTokens": ("output_tokens", "completion_tokens"),
                "totalTokens": ("total_tokens",),
            }
            for target, keys in mapping.items():
                for key in keys:
                    if _number(usage.get(key)) is not None:
                        totals[target] = (totals[target] or 0) + (_number(usage.get(key)) or 0)
                        break
            details = usage.get("input_token_details") or usage.get("prompt_tokens_details") or {}
            cached = _number(details.get("cached_tokens")) if isinstance(details, dict) else None
            if cached is not None:
                totals["cachedInputTokens"] = (totals["cachedInputTokens"] or 0) + cached
            reasoning = usage.get("output_token_details") or usage.get("completion_tokens_details") or {}
            if isinstance(reasoning, dict) and _number(reasoning.get("reasoning_tokens")) is not None:
                totals["reasoningTokens"] = (totals["reasoningTokens"] or 0) + (_number(reasoning.get("reasoning_tokens")) or 0)
            return
        for name in ("usage", "input_token_details", "output_token_details"):
            visit(getattr(value, name, None))
        if isinstance(value, (list, tuple)):
            visit(value)

    for candidate in candidates:
        visit(candidate)
    if totals["totalTokens"] is None and totals["inputTokens"] is not None and totals["outputTokens"] is not None:
        totals["totalTokens"] = totals["inputTokens"] + totals["outputTokens"]
    return totals


def estimate_cost(usage: dict[str, int | None], profile: dict[str, Any]) -> tuple[int | None, int | None]:
    input_rate = profile.get("inputUsdPer1M")
    output_rate = profile.get("outputUsdPer1M")
    if input_rate is None or output_rate is None:
        return None, None
    usd = ((usage.get("inputTokens") or 0) * float(input_rate) + (usage.get("outputTokens") or 0) * float(output_rate)) / 1_000_000
    jpy = usd * int(profile.get("jpyPerUsd") or 160)
    return round(usd * 1_000_000), round(jpy * 1_000_000)


async def persist_usage(payload: dict[str, Any]) -> bool:
    url = env("KINBAN_USAGE_URL", "http://localhost:3003/api/v1/agent-usage")
    key = env("KINBAN_DELEGATION_TOKEN") or env("KINBAN_API_KEY")
    if not key:
        return False
    headers = {"Authorization": f"Bearer {key}", "X-KINBAN-Audience": env("KINBAN_TOKEN_AUDIENCE", "agent-runtime"), "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(url, headers=headers, content=json.dumps(payload, ensure_ascii=False))
        return response.is_success
    except httpx.HTTPError:
        return False


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
