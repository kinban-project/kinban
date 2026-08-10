from __future__ import annotations

import json
from typing import Any

import httpx


class KinbanMCPError(RuntimeError):
    pass


class KinbanMCPClient:
    def __init__(self, url: str, api_key: str) -> None:
        self.url = url
        self.api_key = api_key

    async def request(self, method: str, params: dict[str, Any] | None = None) -> Any:
        payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(self.url, headers=headers, json=payload)
        response.raise_for_status()
        raw = response.text.strip()
        if raw.startswith("data:"):
            raw = raw.split("data:", 1)[1].strip()
        result = json.loads(raw)
        if "error" in result:
            error = result["error"]
            raise KinbanMCPError(str(error.get("message", error)))
        return result.get("result", result)

    async def tools(self) -> list[dict[str, Any]]:
        await self.request("initialize", {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "kinban-agent-runtime", "version": "0.1.0"},
        })
        result = await self.request("tools/list")
        return result.get("tools", []) if isinstance(result, dict) else []

    async def call(self, name: str, arguments: dict[str, Any]) -> Any:
        await self.request("initialize", {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "kinban-agent-runtime", "version": "0.1.0"},
        })
        return await self.request("tools/call", {"name": name, "arguments": arguments})
