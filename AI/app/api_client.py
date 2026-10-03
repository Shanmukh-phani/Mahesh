from typing import Any, Optional

import httpx

from .config import BACKEND_API_URL


class BackendError(Exception):
    pass


class BackendClient:
    """Calls the Express API with the logged-in user's token. All permissions stay enforced by Express."""

    def __init__(self, token: str):
        self._headers = {"Authorization": f"Bearer {token}"}

    async def request(self, method: str, path: str, params: Optional[dict] = None, json: Any = None) -> Any:
        clean_params = {k: v for k, v in (params or {}).items() if v not in (None, "")}
        async with httpx.AsyncClient(base_url=BACKEND_API_URL, timeout=20) as client:
            try:
                res = await client.request(method, path, params=clean_params, json=json, headers=self._headers)
            except httpx.HTTPError as exc:
                raise BackendError(f"Could not reach the MedConnect server: {exc}") from exc
        if res.status_code >= 400:
            try:
                detail = res.json().get("error") or res.text
            except ValueError:
                detail = res.text
            raise BackendError(f"{res.status_code}: {detail}")
        if not res.content:
            return None
        try:
            return res.json()
        except ValueError:
            return res.text

    async def get(self, path: str, **params) -> Any:
        return await self.request("GET", path, params=params)
