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
    mode: Literal["member", "operations"] = "member"


class HandoffCodeRequest(BaseModel):
    handoff: str = Field(min_length=20, max_length=200)


class SessionInfo(BaseModel):
    groupId: str
    memberName: str
    mode: Literal["member", "operations"]
    expiresAt: str
    remainingSeconds: int


class RuntimeSession:
    def __init__(self, payload: HandoffRequest, verified_group_id: str, verified_member_name: str) -> None:
        self.token = payload.token
        self.group_id = verified_group_id
        self.member_name = verified_member_name
        self.mode = payload.mode
        self.session_scope = f"{self.mode}:{self.group_id}:{secrets.token_urlsafe(12)}"
        self.pending_confirmation: dict[str, Any] | None = None
        self.user_turn = 0
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
        return SessionInfo(groupId=self.group_id, memberName=self.member_name, mode=self.mode, expiresAt=self.expires_at, remainingSeconds=remaining)

    def _expiry_timestamp(self) -> float:
        from datetime import datetime
        try:
            return datetime.fromisoformat(self.expires_at.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return 0


sessions: dict[str, RuntimeSession] = {}
pending_handoffs: dict[str, tuple[HandoffRequest, float]] = {}
handoff_attempts: dict[str, tuple[int, float]] = {}
SESSION_COOKIE = "kinban_agent_session"
HIGH_IMPACT_TOOLS = {
    "publish_shift_assignment_scenario",
    "set_shift_assignments",
    "clear_draft_assignments",
    "delete_draft_shift_plan",
    "delete_shift_assignment_scenario",
    "submit_work_record",
    "review_monthly_work",
    "create_announcement",
    "delete_announcement",
    "send_member_message",
}


def purge_expired_handoffs() -> None:
    now = time.time()
    for code, (_, expires_at) in list(pending_handoffs.items()):
        if expires_at <= now:
            pending_handoffs.pop(code, None)


def handoff_client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")


def handoff_confirmation_key(tool_name: str, arguments: dict[str, Any]) -> str:
    comparable = {key: value for key, value in arguments.items() if key != "confirm"}
    return f"{tool_name}:{json.dumps(comparable, ensure_ascii=False, sort_keys=True, default=str)}"


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


async def build_agent(token: str, mode: Literal["member", "operations"] = "member", session: RuntimeSession | None = None, user_turn: int = 0) -> Agent:
    if session is None:
        raise RuntimeError("Agent session context is required")
    session_for_tool = session
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
            if mode == "operations" and tool_name in HIGH_IMPACT_TOOLS:
                confirmation_key = handoff_confirmation_key(tool_name, arguments)
                pending = getattr(session_for_tool, "pending_confirmation", None)
                if not pending or pending.get("key") != confirmation_key or pending.get("turn", 0) >= user_turn or arguments.get("confirm") is not True:
                    session_for_tool.pending_confirmation = {"key": confirmation_key, "turn": user_turn, "createdAt": time.time()}
                    return json.dumps({
                        "confirmationRequired": True,
                        "tool": tool_name,
                        "message": "対象と影響を確認しました。別のメッセージで明示的に実行を確認してください。確認後は同じ対象に confirm:true を付けて再実行します。",
                    }, ensure_ascii=False)
                session_for_tool.pending_confirmation = None
            result = await mcp.call(tool_name, arguments)
            return json.dumps(result, ensure_ascii=False, default=str)
        except (json.JSONDecodeError, KinbanMCPError, ValueError) as exc:
            return f"KINBAN MCP error: {exc}"

    model = env("KINBAN_AGENT_MODEL", "gpt-5.6-luna")
    if mode == "operations":
        return Agent(
            name="KINBAN operations assistant",
            model=model,
            instructions=(
                "This is the KINBAN operations assistant. Keep every read and write scoped to the current groupId. "
                "Use KINBAN MCP tools as the source of truth. You may help with shift planning, assignment scenarios, publication, work approval, announcements, and operational messages only when the token allows it. "
                "For publication, approval/rejection, deletion, announcements, and member messages, first describe the target and impact without executing. Only after a separate follow-up user message explicitly confirms the same action may you call the tool with confirm:true. Never treat the first request alone as confirmation. "
                "Never expose API tokens, private member data, or another group's data. Do not claim success until the MCP response confirms it.\n"
                f"Available KINBAN MCP tools:\n{catalog}"
            ),
            tools=[call_kinban_tool],
        )
    return Agent(
        name="KINBAN 本人用AIアシスト",
        model=model,
        instructions=(
            "This is a member-only KINBAN assistant. The current groupId is supplied in each user message. For questions about shifts, requests, work records, or guides, you MUST use the available KINBAN MCP tool before answering; do not answer from general knowledge. Never use manager operations or expose another member's data.\n"
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


def mcp_value(result: Any) -> Any:
    """Unwrap the MCP JSON-RPC text envelope without persisting it."""
    if isinstance(result, dict) and isinstance(result.get("content"), list):
        for item in result["content"]:
            if isinstance(item, dict) and item.get("type") == "text":
                try:
                    return json.loads(item.get("text", ""))
                except json.JSONDecodeError:
                    return item.get("text")
    return result


async def validate_handoff(token: str, expected_group_id: str, mode: Literal["member", "operations"]) -> tuple[str, str]:
    """Verify token mode/group through KINBAN; never trust handoff display fields."""
    client = configured_client(token)
    tools = await client.tools()
    names = {item.get("name") for item in tools if isinstance(item, dict)}
    if "list_groups" not in names or "get_profile" not in names:
        raise KinbanMCPError("本人用MCPの接続情報を確認できません。")
    groups = mcp_value(await client.call("list_groups", {}))
    if not isinstance(groups, list):
        raise KinbanMCPError("本人用MCPのグループ情報を確認できません。")
    match = next((item for item in groups if isinstance(item, dict) and item.get("id") == expected_group_id), None)
    expected_token_type = "personal" if mode == "member" else "assistant"
    if not match or match.get("tokenType") != expected_token_type:
        raise KinbanMCPError("本人用AIアシストのグループ・権限を確認できません。")
    profile = mcp_value(await client.call("get_profile", {}))
    if not isinstance(profile, dict) or not profile.get("email"):
        raise KinbanMCPError("本人用AIアシストの利用者を確認できません。")
    member_name = str(profile.get("nickname") or profile["email"].split("@", 1)[0])
    return expected_group_id, member_name


async def preload_context(session: RuntimeSession, message: str) -> str:
    """Fetch authoritative data for common member questions before generation."""
    client = configured_client(session.token)
    lowered = message.lower()
    calls: list[tuple[str, dict[str, Any]]] = [("get_demo_time", {"groupId": session.group_id})]
    if session.mode == "operations":
        calls.append(("list_groups", {}))
    if any(word in message for word in ("シフト", "勤務予定", "今日")) or "shift" in lowered:
        calls.append(("list_shift_plans", {"groupId": session.group_id}))
    if any(word in message for word in ("希望", "受付")) or "request" in lowered:
        calls.append(("list_my_shift_request_periods", {"groupId": session.group_id}))
    if any(word in message for word in ("ガイド", "手順", "業務")) or "guide" in lowered:
        calls.append(("list_knowledge_pages", {"groupId": session.group_id}))
    if any(word in message for word in ("申告", "打刻", "勤務記録")) or "work" in lowered:
        calls.append(("get_work_records", {"groupId": session.group_id}))
    facts: list[dict[str, Any]] = []
    for name, arguments in calls:
        try:
            value = mcp_value(await client.call(name, arguments))
            facts.append({"tool": name, "result": value})
            if name == "list_shift_plans" and isinstance(value, dict):
                plans = value.get("plans")
                if isinstance(plans, list):
                    published = [plan for plan in plans if isinstance(plan, dict) and plan.get("status") == "published"]
                    if published and published[0].get("id"):
                        try:
                            detail = mcp_value(await client.call("get_shift_plan", {"planId": published[0]["id"]}))
                            facts.append({"tool": "get_shift_plan", "result": detail})
                        except KinbanMCPError as exc:
                            facts.append({"tool": "get_shift_plan", "error": str(exc)})
            if name == "list_knowledge_pages" and isinstance(value, list):
                for page in value[:3]:
                    if isinstance(page, dict) and page.get("id"):
                        try:
                            detail = mcp_value(await client.call("get_knowledge_page", {
                                "groupId": session.group_id,
                                "pageId": page["id"],
                            }))
                            facts.append({"tool": "get_knowledge_page", "result": detail})
                        except KinbanMCPError as exc:
                            facts.append({"tool": "get_knowledge_page", "error": str(exc)})
        except KinbanMCPError as exc:
            facts.append({"tool": name, "error": str(exc)})
    return json.dumps(facts, ensure_ascii=False, default=str)


@app.get("/health")
async def health() -> dict[str, Any]:
    model = env("KINBAN_AGENT_MODEL", "gpt-5.6-luna")
    profile = pricing_profile(model)
    return {"status": "healthy", "service": "kinban-agent-runtime", "model": model, "pricingProfileId": profile["pricingProfileId"], "mcpConfigured": bool(env("KINBAN_DELEGATION_TOKEN") or env("KINBAN_API_KEY"))}


async def establish_session(payload: HandoffRequest, response: Response) -> SessionInfo:
    if payload.audience != "agent-runtime":
        raise HTTPException(status_code=400, detail="接続先が不正です。")
    # Validate the handoff immediately. MCP revalidates the token on every call.
    try:
        verified_group_id, verified_member_name = await validate_handoff(payload.token, payload.groupId, payload.mode)
    except (KinbanMCPError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=401, detail="KINBANの接続を確認できません。期限切れ・失効・利用停止の可能性があります。") from exc
    session_id = secrets.token_urlsafe(32)
    session = RuntimeSession(payload, verified_group_id, verified_member_name)
    sessions[session_id] = session
    response.set_cookie(SESSION_COOKIE, session_id, max_age=max(60, session.info().remainingSeconds), httponly=True, samesite="lax", path="/")
    return session.info()


@app.post("/api/handoff")
async def create_handoff(payload: HandoffRequest, request: Request) -> dict[str, Any]:
    """Stage a one-time opaque handoff; the API token never appears in a URL."""
    purge_expired_handoffs()
    client_key = handoff_client_key(request)
    now = time.time()
    count, window_started = handoff_attempts.get(client_key, (0, now))
    if now - window_started >= 60:
        count, window_started = 0, now
    if count >= 20:
        handoff_attempts[client_key] = (count, window_started)
        raise HTTPException(status_code=429, detail="handoff requests are temporarily rate limited")
    handoff_attempts[client_key] = (count + 1, window_started)
    try:
        verified_group_id, verified_member_name = await validate_handoff(payload.token, payload.groupId, payload.mode)
    except (KinbanMCPError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=401, detail="handoff token validation failed") from exc
    payload = payload.model_copy(update={"groupId": verified_group_id, "memberName": verified_member_name})
    if len(pending_handoffs) >= 100:
        raise HTTPException(status_code=429, detail="handoff queue is full")
    code = secrets.token_urlsafe(32)
    pending_handoffs[code] = (payload, time.time() + 120)
    return {"handoff": code, "expiresInSeconds": 120}


@app.post("/api/session", response_model=SessionInfo)
async def create_session(payload: HandoffRequest, response: Response) -> SessionInfo:
    return await establish_session(payload, response)


@app.post("/api/session/handoff", response_model=SessionInfo)
async def consume_handoff(payload: HandoffCodeRequest, response: Response) -> SessionInfo:
    staged = pending_handoffs.pop(payload.handoff, None)
    if not staged or staged[1] <= time.time():
        raise HTTPException(status_code=410, detail="AIアシストの引渡しが期限切れです。KINBANから起動し直してください。")
    return await establish_session(staged[0], response)


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
    session.user_turn += 1
    user_turn = session.user_turn
    model = env("KINBAN_AGENT_MODEL", "gpt-5.6-luna")
    profile = pricing_profile(model)
    started = now_iso()
    started_clock = time.perf_counter()
    status: Literal["succeeded", "failed"] = "succeeded"
    error_message = ""
    result: Any = None
    answer = ""
    try:
        facts = await preload_context(session, request.message)
        agent = await build_agent(session.token, session.mode, session, user_turn)
        items = [{"role": item["role"], "content": item["content"]} for item in request.history if item.get("role") in {"user", "assistant"} and item.get("content")]
        items.append({"role": "user", "content": f"現在のKINBANグループIDは {session.group_id} です。以下は回答前に取得した最新のKINBAN情報です。これを根拠に回答し、必要なら追加の本人用MCPを呼んでください。\n{facts}\n\n依頼:\n{request.message}"})
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
            "userCategory": "manager" if session.mode == "operations" else "member",
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
            "metadata": {"runtime": "kinban-agent-runtime", "phase": 1, "mode": session.mode, "groupId": session.group_id, "sessionScope": session.session_scope},
        }, token=session.token)
    return ChatResponse(answer=answer, model=model, pricingProfileId=profile["pricingProfileId"], usagePersisted=persisted)


@app.get("/", response_class=FileResponse)
async def index() -> FileResponse:
    return FileResponse(Path(__file__).resolve().parents[1] / "ui" / "index.html")
