from __future__ import annotations

import json
import secrets
import time
from pathlib import Path
from typing import Any, Literal

from agents import Agent, Runner, function_tool
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from config import env, pricing_profile, required
from mcp_client import KinbanMCPClient, KinbanMCPError
from usage import estimate_cost, extract_usage, now_iso, persist_usage

app = FastAPI(title="KINBAN Agent Runtime", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin for origin in [env("AGENT_ALLOWED_ORIGIN", "http://localhost:3003"), "http://localhost:3001"] if origin],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10000)
    history: list[dict[str, str]] = Field(default_factory=list, max_length=30)
    # Kept for old clients, but never used for authorization or usage labeling.
    userCategory: Literal["manager", "member", "unknown"] | None = None


class ChatResponse(BaseModel):
    answer: str
    model: str
    pricingProfileId: str
    usagePersisted: bool


class HandoffRequest(BaseModel):
    token: str = Field(min_length=20, max_length=500)
    groupId: str = Field(min_length=1, max_length=200)
    memberName: str = Field(default="メンバー", max_length=200)
    expiresAt: str = Field(min_length=10, max_length=50)
    audience: Literal["agent-runtime"] = "agent-runtime"


class SessionInfo(BaseModel):
    groupId: str
    memberName: str
    mode: Literal["member"]
    expiresAt: str
    remainingSeconds: int


class RuntimeSession:
    def __init__(self, payload: HandoffRequest) -> None:
        self.token = payload.token
        self.group_id = payload.groupId
        self.member_name = payload.memberName
        self.expires_at = payload.expiresAt
        self.created_at = time.time()

    def expired(self) -> bool:
        from datetime import datetime
        try:
            return datetime.fromisoformat(self.expires_at.replace("Z", "+00:00")).timestamp() <= time.time()
        except ValueError:
            return True

    def info(self) -> SessionInfo:
        remaining = max(0, int(self._expiry_timestamp() - time.time()))
        return SessionInfo(groupId=self.group_id, memberName=self.member_name, mode="member", expiresAt=self.expires_at, remainingSeconds=remaining)

    def _expiry_timestamp(self) -> float:
        from datetime import datetime
        try:
            return datetime.fromisoformat(self.expires_at.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return 0


sessions: dict[str, RuntimeSession] = {}
SESSION_COOKIE = "kinban_agent_session"


def configured_client(token: str | None = None) -> KinbanMCPClient:
    key = token or env("KINBAN_DELEGATION_TOKEN") or required("KINBAN_API_KEY")
    return KinbanMCPClient(env("KINBAN_MCP_URL", "http://localhost:3003/api/mcp"), key, env("KINBAN_TOKEN_AUDIENCE", "agent-runtime"))


def global_client() -> KinbanMCPClient:
    return configured_client()


async def session_for(request: Request) -> tuple[str, RuntimeSession]:
    session_id = request.cookies.get(SESSION_COOKIE)
    session = sessions.get(session_id or "")
    if not session:
        raise HTTPException(status_code=401, detail="本人用AIアシストの接続がありません。KINBANから起動してください。")
    if session.expired():
        sessions.pop(session_id or "", None)
        raise HTTPException(status_code=401, detail="接続時間が終了しました。KINBANから再接続してください。")
    return session_id or "", session


async def build_agent(token: str) -> Agent:
    mcp = configured_client(token)
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
        name="KINBAN 本人用AIアシスト",
        model=model,
        instructions=(
            "あなたはKINBANの本人用AIアシストです。日本語で簡潔に回答してください。\n"
            "利用者本人のシフト希望、公開済みシフト、打刻・勤務申告、管理者への連絡、業務ガイドだけを扱います。\n"
            "MCPを業務データの正本として使い、直接HTTP、DB、ファイル操作はしません。\n"
            "相対日付は最初にget_demo_timeで確認し、本人の情報以外を取得・推測・開示しません。\n"
            "変更操作は、利用者が明示した内容だけ実行します。曖昧な変更は確認を求め、confirmは権限昇格として扱いません。\n"
            "管理者操作、他メンバーの情報、シフト作成・公開、割当、勤務承認は実行できません。\n"
            f"利用できるMCPツール一覧:\n{catalog}"
        ),
        tools=[call_kinban_tool],
    )


@app.get("/health")
async def health() -> dict[str, Any]:
    model = env("KINBAN_AGENT_MODEL", "gpt-5.6-luna")
    profile = pricing_profile(model)
    return {"status": "healthy", "service": "kinban-agent-runtime", "model": model, "pricingProfileId": profile["pricingProfileId"], "mcpConfigured": bool(env("KINBAN_DELEGATION_TOKEN") or env("KINBAN_API_KEY"))}


@app.post("/api/session", response_model=SessionInfo)
async def create_session(payload: HandoffRequest, response: Response) -> SessionInfo:
    if payload.audience != "agent-runtime":
        raise HTTPException(status_code=400, detail="接続先が不正です。")
    # Validate the handoff immediately. MCP revalidates the token on every call.
    try:
        await configured_client(payload.token).tools()
    except (KinbanMCPError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=401, detail="KINBANの接続を確認できません。期限切れ・失効・利用停止の可能性があります。") from exc
    session_id = secrets.token_urlsafe(32)
    session = RuntimeSession(payload)
    sessions[session_id] = session
    response.set_cookie(SESSION_COOKIE, session_id, max_age=max(60, session.info().remainingSeconds), httponly=True, samesite="lax", path="/")
    return session.info()


@app.get("/api/session", response_model=SessionInfo)
async def get_session(request: Request) -> SessionInfo:
    _, session = await session_for(request)
    return session.info()


@app.delete("/api/session")
async def delete_session(request: Request, response: Response) -> dict[str, bool]:
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        sessions.pop(session_id, None)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, http_request: Request) -> ChatResponse:
    _, session = await session_for(http_request)
    model = env("KINBAN_AGENT_MODEL", "gpt-5.6-luna")
    profile = pricing_profile(model)
    started = now_iso()
    started_clock = time.perf_counter()
    status: Literal["succeeded", "failed"] = "succeeded"
    error_message = ""
    result: Any = None
    answer = ""
    try:
        agent = await build_agent(session.token)
        items = [{"role": item["role"], "content": item["content"]} for item in request.history if item.get("role") in {"user", "assistant"} and item.get("content")]
        items.append({"role": "user", "content": request.message})
        result = await Runner.run(agent, items)
        answer = result.final_output
    except (KinbanMCPError, ValueError, RuntimeError) as exc:
        status = "failed"
        error_message = str(exc)
        raise HTTPException(status_code=502, detail=error_message) from exc
    except Exception as exc:
        status = "failed"
        error_message = str(exc)
        raise HTTPException(status_code=500, detail="AIアシストの実行に失敗しました。") from exc
    finally:
        completed = now_iso()
        usage = extract_usage(result) if result is not None else {"inputTokens": None, "outputTokens": None, "totalTokens": None, "reasoningTokens": None, "cachedInputTokens": None}
        usd_micros, jpy_micros = estimate_cost(usage, profile)
        persisted = await persist_usage({
            "userCategory": "member",
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
            "metadata": {"runtime": "kinban-agent-runtime", "phase": 1, "mode": "member", "groupId": session.group_id},
        }, token=session.token)
    return ChatResponse(answer=answer, model=model, pricingProfileId=profile["pricingProfileId"], usagePersisted=persisted)


@app.get("/", response_class=FileResponse)
async def index() -> FileResponse:
    return FileResponse(Path(__file__).resolve().parents[1] / "ui" / "index.html")
