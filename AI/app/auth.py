from dataclasses import dataclass
from typing import Optional

import jwt
from fastapi import Header, HTTPException

from .config import JWT_SECRET


@dataclass
class UserContext:
    token: str
    user_id: str
    role: str
    store_id: Optional[str]
    store_code: Optional[str]

    @property
    def is_admin(self) -> bool:
        return self.role == "ADMIN"


def get_user(authorization: str = Header(default="")) -> UserContext:
    """Verify the same JWT the Express backend issues, so the role cannot be spoofed."""
    token = authorization.replace("Bearer ", "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Please log in again.")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session. Please log in again.")

    role = payload.get("role")
    if role not in ("ADMIN", "MINI_STORE"):
        raise HTTPException(status_code=403, detail="Unknown role.")

    return UserContext(
        token=token,
        user_id=str(payload.get("_id", "")),
        role=role,
        store_id=payload.get("storeId"),
        store_code=payload.get("storeCode"),
    )
