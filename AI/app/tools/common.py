import re
from datetime import datetime
from typing import Any, Optional

from ..actions import add_action
from ..auth import UserContext

REQUEST_STATUSES = [
    "Pending",
    "Available at Main Branch",
    "Approved / Will Be Supplied",
    "Ordered",
    "Completed",
    "Not Available",
    "Rejected",
]

_STATUS_ALIASES = {
    "pending": "Pending",
    "available": "Available at Main Branch",
    "available at main branch": "Available at Main Branch",
    "approved": "Approved / Will Be Supplied",
    "approve": "Approved / Will Be Supplied",
    "will be supplied": "Approved / Will Be Supplied",
    "approved / will be supplied": "Approved / Will Be Supplied",
    "ordered": "Ordered",
    "order": "Ordered",
    "completed": "Completed",
    "complete": "Completed",
    "done": "Completed",
    "delivered": "Completed",
    "not available": "Not Available",
    "unavailable": "Not Available",
    "out of stock": "Not Available",
    "rejected": "Rejected",
    "reject": "Rejected",
    "cancelled": "Rejected",
}


def normalize_status(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    key = value.strip().lower()
    if key in _STATUS_ALIASES:
        return _STATUS_ALIASES[key]
    for status in REQUEST_STATUSES:
        if status.lower() == key:
            return status
    return None


def fmt_date(value: Any) -> str:
    if not value:
        return "-"
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).strftime("%d %b %Y")
    except ValueError:
        return str(value)[:10]


def valid_phone(phone: Optional[str]) -> Optional[str]:
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    return digits if len(digits) == 10 else None


def request_line(r: dict) -> str:
    store = r.get("storeId") if isinstance(r.get("storeId"), dict) else {}
    customer = r.get("customer") or {}
    parts = [
        f"{r.get('requestId', '?')}",
        f"{r.get('productName') or r.get('medicineName') or '?'} x{r.get('quantity', '?')}",
        f"status: {r.get('status', '?')}",
        f"store: {store.get('storeCode') or r.get('storeCode') or '-'}",
        f"customer: {customer.get('name') or '-'} ({customer.get('phone') or '-'})",
        f"created: {fmt_date(r.get('createdAt'))}",
    ]
    if r.get("expectedDate"):
        parts.append(f"expected: {fmt_date(r.get('expectedDate'))}")
    note = r.get("mainBranchResponse") or r.get("adminNotes")
    if note:
        parts.append(f"note: {note}")
    return " | ".join(parts)


def stock_line(item: dict, low_level: int = 10) -> str:
    med = item.get("medicineId") or {}
    qty = item.get("quantity", 0) or 0
    level = item.get("minReorderLevel") or low_level
    state = "OUT" if qty <= 0 else ("LOW" if qty <= level else "OK")
    return (
        f"{med.get('name', '?')} ({med.get('category') or 'General'}) | qty: {qty} [{state}] | "
        f"batch: {item.get('batchNumber') or '-'} | expiry: {fmt_date(item.get('expiryDate'))}"
    )


def is_low(item: dict, low_level: int = 10) -> bool:
    qty = item.get("quantity", 0) or 0
    return qty <= (item.get("minReorderLevel") or low_level)


def find_by_name(items: list, name: str, getter) -> tuple[Optional[dict], list]:
    """Exact (case-insensitive) match first, otherwise a unique partial match."""
    needle = (name or "").strip().lower()
    exact = [i for i in items if (getter(i) or "").lower() == needle]
    if exact:
        return exact[0], []
    partial = [i for i in items if needle and needle in (getter(i) or "").lower()]
    if len(partial) == 1:
        return partial[0], []
    return None, partial


def propose(
    user: UserContext,
    thread_key: str,
    proposed: list,
    *,
    title: str,
    summary: str,
    method: str,
    path: str,
    body: Any = None,
    danger: bool = False,
    success_message: str = "Done.",
) -> str:
    action = add_action(
        user_id=user.user_id,
        thread_key=thread_key,
        title=title,
        summary=summary,
        method=method,
        path=path,
        body=body,
        danger=danger,
        success_message=success_message,
    )
    proposed.append(action.public())
    return (
        f"PREPARED (not executed yet): {summary}. A confirmation card is now shown to the user; "
        "tell them to press Confirm to apply it or Cancel to discard. Do not claim it is done."
    )


def limit_lines(lines: list[str], limit: int, label: str) -> str:
    if not lines:
        return f"No {label} found."
    limit = max(1, min(limit or 10, 50))
    head = lines[:limit]
    more = f"\n...and {len(lines) - limit} more." if len(lines) > limit else ""
    return f"{len(lines)} {label}:\n" + "\n".join(f"- {line}" for line in head) + more
