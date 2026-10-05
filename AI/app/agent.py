from datetime import date

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent

from .auth import UserContext
from .config import GROQ_API_KEY, GROQ_MODEL
from .tools import build_tools

MEMORY = MemorySaver()
HISTORY_LIMIT = 24

ADMIN_PROMPT = """You are MedConnect AI, the assistant for the MAIN BRANCH (central warehouse) admin of a pharmacy network.
You can look up and manage: medicine requests from mini stores (and change their status), warehouse stock,
mini stores (create, activate/deactivate, delete), store employees, customers, demand analytics and announcements."""

STORE_PROMPT = """You are MedConnect AI, the assistant for mini store {store} of a pharmacy network.
You help store staff: raise medicine requests to the main branch for walk-in customers, track this store's requests
and the main branch's replies, add a customer update (store response) on a request after the main branch replies,
search the medicine catalog / warehouse availability, and manage this store's shelf stock.
You cannot change request statuses, other stores, employees or the warehouse - those belong to the main branch admin."""

RULES = """
Today is {today}.
Rules:
- Always use tools for facts; never invent IDs, stock numbers or statuses.
- For any change, call the matching tool. Change tools only PREPARE the change and show the user a Confirm / Cancel card.
  After calling one, say briefly what was prepared and ask the user to confirm on the card. Never say it is already done.
- If required details are missing (e.g. customer phone, quantity, which request), ask a short question instead of guessing.
- Phone numbers are exactly 10 digits. Store IDs look like AP20 (AP + 2 or 3 digits). Request IDs look like MR-10001.
- Convert relative dates (tomorrow, next Monday) to YYYY-MM-DD.
- Keep replies short and scannable: short sentences or compact bullet lists, bold key values with **text**.
  The chat window is narrow (phones too): do NOT use markdown tables; use one bullet per item instead.
- If a tool returns an error, explain it plainly and suggest what to do.
"""


def _system_prompt(user: UserContext) -> str:
    base = ADMIN_PROMPT if user.is_admin else STORE_PROMPT.format(store=user.store_code or "")
    return base + RULES.format(today=date.today().isoformat())


def _trim(messages: list) -> list:
    """Keep recent history but always start on a user turn so tool calls stay paired."""
    if len(messages) <= HISTORY_LIMIT:
        return messages
    recent = messages[-HISTORY_LIMIT:]
    for i, m in enumerate(recent):
        if isinstance(m, HumanMessage):
            return recent[i:]
    return messages[-1:]


def build_agent(user: UserContext, thread_key: str, proposed: list):
    model = ChatGroq(model=GROQ_MODEL, api_key=GROQ_API_KEY, temperature=0, max_retries=2)
    system = SystemMessage(content=_system_prompt(user))

    def prompt(state):
        return [system] + _trim(state["messages"])

    return create_react_agent(
        model,
        build_tools(user, thread_key, proposed),
        prompt=prompt,
        checkpointer=MEMORY,
    )
