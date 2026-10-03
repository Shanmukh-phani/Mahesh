import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from .config import ACTION_TTL_SECONDS


@dataclass
class PendingAction:
    id: str
    user_id: str
    thread_key: str
    title: str
    summary: str
    method: str
    path: str
    body: Any = None
    danger: bool = False
    success_message: str = "Done."
    created_at: float = field(default_factory=time.time)

    def public(self) -> dict:
        return {"id": self.id, "title": self.title, "summary": self.summary, "danger": self.danger}


_ACTIONS: dict[str, PendingAction] = {}


def _purge() -> None:
    now = time.time()
    for key in [k for k, a in _ACTIONS.items() if now - a.created_at > ACTION_TTL_SECONDS]:
        _ACTIONS.pop(key, None)


def add_action(**kwargs) -> PendingAction:
    _purge()
    action = PendingAction(id=uuid.uuid4().hex[:12], **kwargs)
    _ACTIONS[action.id] = action
    return action


def pop_action(action_id: str, user_id: str) -> Optional[PendingAction]:
    _purge()
    action = _ACTIONS.get(action_id)
    if not action or action.user_id != user_id:
        return None
    return _ACTIONS.pop(action_id)
