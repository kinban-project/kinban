from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Literal

from agents import Agent, Runner, function_tool
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from config import env, pricing_profile, required
from mcp_client import KinbanMCPClient, KinbanMCPError
from usage import estimate_cost, extract_usage, now_iso, persist_usage

app = FastAPI(title="KINBAN Agent Runtime", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3001", "http://localhost:3003"], allow_methods=["*"], allow_headers=["*"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10000)
    history: list[dict[str, str]] = Field(default_factory=list, max_length=30)
    userCategory: Literal["manager", "member", "unknown"] = "manager"


class ChatResponse(BaseModel):
    answer: str
    model: str
    pricingProfileId: str
    usagePersisted: bool


def client() -> KinbanMCPClient:
    key = env("KINBAN_DELEGATION_TOKEN") or required("KINBAN_API_KEY")
    return KinbanMCPClient(env("KINBAN_MCP_URL", "http://localhost:3003/api/mcp"), key, env("KINBAN_TOKEN_AUDIENCE", "agent-runtime"))


async def build_agent() -> Agent:
    mcp = client()
    tools = await mcp.tools()
    catalog = json.dumps([{k: v for k, v in item.items() if k in {"name", "description", "inputSchema"}} for item in tools], ensure_ascii=False)

    @function_tool
    async def call_kinban_tool(tool_name: str, arguments_json: str = "{}") -> str:
        """Call one tool from the KINBAN MCP tool catalog. Use exact tool_name and JSON arguments."""
        try:
            arguments = json.loads(arguments_json or "{}")
            if not isinstance(arguments, dict):
                return "arguments_json must be an object"
            result = await mcp.call(tool_name, arguments)
            return json.dumps(result, ensure_ascii=False, default=str)
        except (json.JSONDecodeError, KinbanMCPError, ValueError) as exc:
            return f"KINBAN MCP error: {exc}"

    model = env("KINBAN_AGENT_MODEL", "gpt-5.6-luna")
    return Agent(
        name="KINBAN Agent Runtime",
        model=model,
        instructions=(
            "あなたはKINBANの運営支援エージェントです。日本語で回答してください。\n"
            "KINBAN MCPだけを業務データの正本として扱い、画面やファイルを直接操作しないでください。\n"
            "相対日付はget_demo_timeで確認し、書き込みはMCPの確認条件に従ってください。\n"
            "実行できない操作を実行したと断定しないでください。\n"
            f"利用できるMCPツール一覧:\n{catalog}"
        ),
        tools=[call_kinban_tool],
    )


@app.get("/health")
async def health() -> dict[str, Any]:
    model = env("KINBAN_AGENT_MODEL", "gpt-5.6-luna")
    profile = pricing_profile(model)
    return {"status": "healthy", "service": "kinban-agent-runtime", "model": model, "pricingProfileId": profile["pricingProfileId"], "mcpConfigured": bool(env("KINBAN_DELEGATION_TOKEN") or env("KINBAN_API_KEY"))}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    model = env("KINBAN_AGENT_MODEL", "gpt-5.6-luna")
    profile = pricing_profile(model)
    started = now_iso()
    started_clock = time.perf_counter()
    status: Literal["succeeded", "failed"] = "succeeded"
    error_message = ""
    result: Any = None
    try:
        agent = await build_agent()
        items = [{"role": item["role"], "content": item["content"]} for item in request.history if item.get("role") in {"user", "assistant"} and item.get("content")]
        items.append({"role": "user", "content": request.message})
        result = await Runner.run(agent, items)
        answer = result.final_output
    except (KinbanMCPError, ValueError) as exc:
        status = "failed"
        error_message = str(exc)
        raise HTTPException(status_code=502, detail=error_message) from exc
    except Exception as exc:
        status = "failed"
        error_message = str(exc)
        raise HTTPException(status_code=500, detail="Agent execution failed") from exc
    finally:
        completed = now_iso()
        usage = extract_usage(result) if result is not None else {"inputTokens": None, "outputTokens": None, "totalTokens": None, "reasoningTokens": None, "cachedInputTokens": None}
        usd_micros, jpy_micros = estimate_cost(usage, profile)
        persisted = await persist_usage({
            "userCategory": request.userCategory,
            "model": model,
            "status": status,
            "startedAt": started,
            "completedAt": completed,
            "durationMs": round((time.perf_counter() - started_clock) * 1000),
            **usage,
            "pricingProfileId": profile["pricingProfileId"],
            "jpyPerUsd": profile["jpyPerUsd"],
            "estimatedUsdMicros": usd_micros,
            "estimatedJpyMicros": jpy_micros,
            "errorMessage": error_message,
            "metadata": {"runtime": "kinban-agent-runtime", "phase": 1},
        })
    return ChatResponse(answer=answer, model=model, pricingProfileId=profile["pricingProfileId"], usagePersisted=persisted)


@app.get("/", response_class=FileResponse)
async def index() -> FileResponse:
    return FileResponse(Path(__file__).resolve().parents[1] / "ui" / "index.html")
