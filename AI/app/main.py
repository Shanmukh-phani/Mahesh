import logging
import re

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import AIMessage
from pydantic import BaseModel, Field

from .actions import pop_action
from .agent import build_agent
from .api_client import BackendClient, BackendError
from .auth import UserContext, get_user
from .config import GROQ_API_KEY, GROQ_MODEL

logger = logging.getLogger("medconnect-ai")

app = FastAPI(title="MedConnect AI", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    thread_id: str = Field(default="default", max_length=80)


def _thread_key(user: UserContext, thread_id: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_-]", "", thread_id) or "default"
    return f"{user.user_id}:{safe}"


def _config(thread_key: str) -> dict:
    return {"configurable": {"thread_id": thread_key}, "recursion_limit": 16}


def _text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
    return str(content or "")


@app.get("/health")
async def health():
    return {"ok": True, "model": GROQ_MODEL, "groq_key_configured": bool(GROQ_API_KEY)}


@app.post("/chat")
async def chat(body: ChatIn, user: UserContext = Depends(get_user)):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="AI is not configured yet. Add GROQ_API_KEY to AI/.env and restart the AI service.")

    thread_key = _thread_key(user, body.thread_id)
    proposed: list = []
    agent = build_agent(user, thread_key, proposed)

    try:
        result = await agent.ainvoke({"messages": [("user", body.message.strip())]}, _config(thread_key))
    except Exception as exc:  # Groq / graph errors should not crash the widget
        logger.exception("chat failed")
        msg = str(exc)
        if "rate_limit" in msg or "429" in msg:
            detail = "The AI is receiving too many requests right now. Please try again in a few seconds."
        elif "invalid_api_key" in msg or "401" in msg:
            detail = "The Groq API key is invalid. Please check GROQ_API_KEY in AI/.env."
        elif "recursion" in msg.lower():
            detail = "That took too many steps. Please try a simpler or more specific request."
        else:
            detail = "Sorry, I couldn't process that. Please rephrase and try again."
        return {"reply": detail, "actions": proposed, "error": True}

    reply = ""
    for m in reversed(result.get("messages", [])):
        if isinstance(m, AIMessage) and _text(m.content).strip():
            reply = _text(m.content).strip()
            break
    return {"reply": reply or "Done.", "actions": proposed}


async def _remember(user: UserContext, thread_key: str, note: str) -> None:
    """Record confirm/cancel outcomes in the conversation so follow-up questions have context."""
    try:
        agent = build_agent(user, thread_key, [])
        config = _config(thread_key)
        state = await agent.aget_state(config)
        if state and state.values.get("messages"):
            await agent.aupdate_state(config, {"messages": [AIMessage(content=note)]}, as_node="agent")
    except Exception:
        logger.warning("could not record action outcome", exc_info=True)


@app.post("/actions/{action_id}/confirm")
async def confirm_action(action_id: str, user: UserContext = Depends(get_user)):
    action = pop_action(action_id, user.user_id)
    if not action:
        raise HTTPException(status_code=404, detail="This action has expired or was already handled. Ask again to prepare it.")
    try:
        await BackendClient(user.token).request(action.method, action.path, json=action.body)
    except BackendError as exc:
        await _remember(user, action.thread_key, f"(The user confirmed '{action.title}: {action.summary}' but it failed: {exc})")
        return {"ok": False, "message": f"Failed: {exc}"}
    await _remember(user, action.thread_key, f"(Confirmed and completed: {action.title} – {action.summary})")
    return {"ok": True, "message": action.success_message}


@app.post("/actions/{action_id}/cancel")
async def cancel_action(action_id: str, user: UserContext = Depends(get_user)):
    action = pop_action(action_id, user.user_id)
    if action:
        await _remember(user, action.thread_key, f"(The user cancelled: {action.title} – {action.summary})")
    return {"ok": True, "message": "Cancelled."}
