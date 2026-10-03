from ..auth import UserContext
from .admin_tools import build_admin_tools
from .store_tools import build_store_tools


def build_tools(user: UserContext, thread_key: str, proposed: list):
    if user.is_admin:
        return build_admin_tools(user, thread_key, proposed)
    return build_store_tools(user, thread_key, proposed)
