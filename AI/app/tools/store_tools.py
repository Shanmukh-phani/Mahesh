from typing import Optional

from langchain_core.tools import tool

from ..api_client import BackendClient, BackendError
from ..auth import UserContext
from .common import (
    REQUEST_STATUSES,
    find_by_name,
    fmt_date,
    is_low,
    limit_lines,
    normalize_status,
    propose,
    request_line,
    stock_line,
    valid_phone,
)


def build_store_tools(user: UserContext, thread_key: str, proposed: list):
    """Every call goes through Express with this store's token, so data is always scoped to the logged-in store."""
    api = BackendClient(user.token)

    def _propose(**kwargs) -> str:
        return propose(user, thread_key, proposed, **kwargs)

    # ---------- read tools ----------

    @tool
    async def get_my_store_summary() -> str:
        """This store's request totals: total, pending and today's requests."""
        try:
            m = await api.get("/requests/ministore-metrics")
        except BackendError as e:
            return f"Error: {e}"
        return f"Total requests: {m.get('totalRequests')} | Pending: {m.get('pendingRequests')} | Today: {m.get('todaysRequests')}"

    @tool
    async def list_my_requests(status: Optional[str] = None, search: Optional[str] = None, limit: int = 10) -> str:
        """This store's requests (newest first). Filter by status or search by request ID, medicine, customer name/phone."""
        st = normalize_status(status) if status else None
        if status and not st:
            return f"Unknown status '{status}'. Valid: {', '.join(REQUEST_STATUSES)}"
        try:
            rows = await api.get("/requests", status=st, search=search)
        except BackendError as e:
            return f"Error: {e}"
        return limit_lines([request_line(r) for r in rows], limit, "requests")

    @tool
    async def get_request_details(request_id: str) -> str:
        """Full details and main-branch reply for one of this store's requests, e.g. MR-10001."""
        code = (request_id or "").strip().upper()
        try:
            rows = await api.get("/requests", search=code)
        except BackendError as e:
            return f"Error: {e}"
        r = next((x for x in rows if (x.get("requestId") or "").upper() == code), None)
        if not r:
            return f"No request {request_id} found for this store."
        c = r.get("customer") or {}
        return (
            request_line(r)
            + f"\nComposition: {r.get('composition') or '-'}\nCustomer address: {c.get('address') or '-'}"
            + f"\nComments: {r.get('comments') or '-'}"
        )

    @tool
    async def search_medicine_catalog(query: str) -> str:
        """Search the medicine catalog by brand or generic name, and show warehouse availability."""
        try:
            meds = await api.get("/medicines", search=query)
            stock = await api.get("/inventory/main", search=query)
        except BackendError as e:
            return f"Error: {e}"
        qty_by_id = {(i.get("medicineId") or {}).get("_id"): i.get("quantity", 0) for i in stock}
        lines = [
            f"{m.get('name')} | generic: {m.get('genericName') or '-'} | {m.get('category') or 'General'} | "
            f"warehouse qty: {qty_by_id.get(m.get('_id'), 0)}"
            for m in meds
        ]
        return limit_lines(lines, 15, "medicines")

    @tool
    async def list_my_inventory(search: Optional[str] = None, low_stock_only: bool = False, limit: int = 15) -> str:
        """This store's shelf stock. Optional name search; low_stock_only shows low / out-of-stock items."""
        try:
            items = await api.get("/inventory/store")
        except BackendError as e:
            return f"Error: {e}"
        if search:
            q = search.lower()
            items = [i for i in items if q in ((i.get("medicineId") or {}).get("name") or "").lower()]
        if low_stock_only:
            items = [i for i in items if is_low(i)]
            items.sort(key=lambda i: i.get("quantity", 0) or 0)
        return limit_lines([stock_line(i) for i in items], limit, "shelf items")

    @tool
    async def find_customer(search: str) -> str:
        """Look up a customer by phone number or name."""
        try:
            rows = await api.get("/customers", search=search)
        except BackendError as e:
            return f"Error: {e}"
        lines = [f"{c.get('name')} | {c.get('phone')} | {c.get('address') or '-'}" for c in rows]
        return limit_lines(lines, 5, "customers")

    @tool
    async def list_my_notifications(limit: int = 10) -> str:
        """Recent notifications for this store (status updates, announcements)."""
        try:
            rows = await api.get("/notifications")
        except BackendError as e:
            return f"Error: {e}"
        lines = [
            f"{'NEW ' if not n.get('isRead') else ''}{n.get('title')}: {n.get('message')} ({fmt_date(n.get('createdAt'))})"
            for n in rows
        ]
        return limit_lines(lines, limit, "notifications")

    # ---------- write tools (need user confirmation) ----------

    @tool
    async def create_medicine_request(
        product_name: str,
        quantity: int,
        customer_phone: str,
        customer_name: str,
        customer_address: Optional[str] = None,
        composition: Optional[str] = None,
        comments: Optional[str] = None,
    ) -> str:
        """Raise a medicine requisition to the main branch for a walk-in customer.
        Needs product name, quantity (>=1), customer 10-digit phone and customer name."""
        if not product_name or not product_name.strip():
            return "Product name is required."
        if not quantity or quantity < 1:
            return "Quantity must be at least 1."
        ph = valid_phone(customer_phone)
        if not ph:
            return "Customer phone must be exactly 10 digits. Ask the user for it."
        if not customer_name or not customer_name.strip():
            return "Customer name is required. Ask the user for it."
        body = {
            "productName": product_name.strip(),
            "medicineName": product_name.strip(),
            "composition": composition or "",
            "quantity": int(quantity),
            "customer": {"name": customer_name.strip(), "phone": ph, "address": customer_address or ""},
            "comments": comments or "",
        }
        summary = f"{product_name.strip()} x{quantity} for {customer_name.strip()} ({ph})"
        if composition:
            summary += f" · {composition}"
        if comments:
            summary += f' · "{comments}"'
        return _propose(
            title="Create medicine request",
            summary=summary,
            method="POST",
            path="/requests",
            body=body,
            success_message="Request sent to the main branch.",
        )

    @tool
    async def update_shelf_stock(
        medicine_name: str,
        quantity: int,
        mode: str = "set",
        batch_number: Optional[str] = None,
        expiry_date: Optional[str] = None,
    ) -> str:
        """Update this store's shelf stock for a catalog medicine. mode='set' replaces quantity,
        'add' adds, 'remove' subtracts (e.g. after a sale). expiry_date = YYYY-MM-DD."""
        try:
            shelf = await api.get("/inventory/store")
            catalog = await api.get("/medicines", search=medicine_name)
        except BackendError as e:
            return f"Error: {e}"
        item, _ = find_by_name(shelf, medicine_name, lambda i: (i.get("medicineId") or {}).get("name"))
        if item:
            med = item["medicineId"]
        else:
            med, options = find_by_name(catalog, medicine_name, lambda m: m.get("name"))
            if not med:
                if options:
                    return "Several medicines match, ask which one: " + ", ".join(o.get("name", "?") for o in options[:10])
                return f"'{medicine_name}' is not in the catalog. Only the main branch can add new medicines."
        current = (item or {}).get("quantity", 0) or 0
        mode = (mode or "set").lower()
        new_qty = current + quantity if mode == "add" else current - quantity if mode == "remove" else quantity
        if new_qty < 0:
            return f"Cannot go below zero (current shelf stock {current})."
        body = {"medicineId": med["_id"], "quantity": new_qty}
        if batch_number:
            body["batchNumber"] = batch_number
        if expiry_date:
            body["expiryDate"] = expiry_date
        extra = f" · batch {batch_number}" if batch_number else ""
        extra += f" · expiry {expiry_date}" if expiry_date else ""
        return _propose(
            title="Update shelf stock",
            summary=f"{med.get('name')}: {current} → {new_qty} units{extra}",
            method="POST",
            path="/inventory/store",
            body=body,
            success_message=f"{med.get('name')} shelf stock is now {new_qty}.",
        )

    @tool
    async def add_customer_update(request_id: str, message: str, employee_name: Optional[str] = None) -> str:
        """Add or update this store's response / customer update on a request after the main branch has replied,
        e.g. 'Customer has been informed and will visit tomorrow.' employee_name must be an active employee of this store."""
        text = (message or "").strip()
        if not text:
            return "The update message is required."
        if len(text) > 1000:
            return "The update must be at most 1000 characters."
        code = (request_id or "").strip().upper()
        try:
            rows = await api.get("/requests", search=code)
        except BackendError as e:
            return f"Error: {e}"
        r = next((x for x in rows if (x.get("requestId") or "").upper() == code), None)
        if not r:
            return f"No request {request_id} found for this store."
        if r.get("status") == "Pending" and not (r.get("mainBranchResponse") or r.get("adminNotes")):
            return f"{r['requestId']} has no main branch response yet, so a customer update can't be added."
        body = {"message": text}
        if employee_name:
            body["employeeName"] = employee_name.strip()
        verb = "Update" if r.get("storeResponse") else "Add"
        return _propose(
            title=f"{verb} customer update",
            summary=f'{r["requestId"]} ({r.get("productName") or r.get("medicineName")}): "{text}"'
            + (f" · by {employee_name.strip()}" if employee_name else ""),
            method="PUT",
            path=f"/requests/{r['_id']}/store-response",
            body=body,
            success_message=f"Customer update saved on {r['requestId']}. The main branch has been notified.",
        )

    return [
        add_customer_update,
        get_my_store_summary,
        list_my_requests,
        get_request_details,
        search_medicine_catalog,
        list_my_inventory,
        find_customer,
        list_my_notifications,
        create_medicine_request,
        update_shelf_stock,
    ]
