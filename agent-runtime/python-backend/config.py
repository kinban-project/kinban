from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PRICING_PATH = Path(os.getenv("AGENT_PRICING_PROFILES", ROOT / "pricing_profiles.json"))


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def load_pricing_profiles() -> dict[str, dict[str, Any]]:
    try:
        payload = json.loads(PRICING_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def pricing_profile(model: str) -> dict[str, Any]:
    profiles = load_pricing_profiles()
    profile = profiles.get(model) or profiles.get("default") or {}
    return {
        "pricingProfileId": str(profile.get("pricingProfileId") or model),
        "model": str(profile.get("model") or model),
        "jpyPerUsd": int(profile.get("jpyPerUsd") or 160),
        "inputUsdPer1M": profile.get("inputUsdPer1M"),
        "outputUsdPer1M": profile.get("outputUsdPer1M"),
    }


def required(name: str) -> str:
    value = env(name)
    if not value:
        raise RuntimeError(f"{name} is not configured")
    return value
