import re
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

STORE_CODE_RE = re.compile(r"^AP\d{2,3}$")


def build_admin_tools(user: UserContext, thread_key: str, proposed: list):
    api = BackendClient(user.token)

    def _propose(**kwargs) -> str:
        return propose(user, thread_key, proposed, **kwargs)

    async def _find_request(request_id: str) -> Optional[dict]:
        code = (request_id or "").strip().upper()
        rows = await api.get("/requests", search=code)
        return next((r for r in rows if (r.get("requestId") or "").upper() == code), None)

    async def _find_store(store_code: str) -> Optional[dict]:
        code = (store_code or "").strip().upper()
        stores = await api.get("/stores")
        return next((s for s in stores if (s.get("storeCode") or "").upper() == code), None)

    async def _find_employee(store: dict, employee: str) -> tuple[Optional[dict], list]:
        employees = await api.get(f"/employees/store/{store['_id']}")
        key = (employee or "").strip().upper()
        by_id = next((e for e in employees if (e.get("employeeId") or "").upper() == key), None)
        if by_id:
            return by_id, []
        return find_by_name(employees, employee, lambda e: e.get("employeeName"))

    # ---------- read tools (run immediately) ----------

    @tool
    async def get_dashboard_summary() -> str:
        """Overall numbers: total / pending / completed requests, most requested medicines and requests per store."""
        try:
            m = await api.get("/requests/dashboard-metrics")
        except BackendError as e:
            return f"Error: {e}"
        top = ", ".join(f"{t.get('_id')} ({t.get('count')} req, {t.get('totalQuantity')} units)" for t in m.get("topMedicines", []))
        stores = ", ".join(f"{s.get('storeCode')} {s.get('storeName')}: {s.get('count')}" for s in m.get("storeRequests", []))
        return (
            f"Total requests: {m.get('totalRequests')} | Pending: {m.get('pendingRequests')} | "
            f"Completed: {m.get('completedRequests')}\nTop medicines: {top or '-'}\nRequests per store: {stores or '-'}"
        )

    @tool
    async def list_requests(
        status: Optional[str] = None,
        store_code: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 10,
    ) -> str:
        """List medicine requests (newest first). Filter by status (e.g. Pending, Completed), store code (e.g. AP20)
        or free-text search (request ID like MR-10001, medicine, customer name/phone, employee)."""
        st = normalize_status(status) if status else None
        if status and not st:
            return f"Unknown status '{status}'. Valid: {', '.join(REQUEST_STATUSES)}"
        try:
            rows = await api.get("/requests", status=st, storeCode=store_code, search=search)
        except BackendError as e:
            return f"Error: {e}"
        return limit_lines([request_line(r) for r in rows], limit, "requests")

    @tool
    async def get_request_details(request_id: str) -> str:
        """Full details of one request by its ID, e.g. MR-10001."""
        try:
            r = await _find_request(request_id)
        except BackendError as e:
            return f"Error: {e}"
        if not r:
            return f"No request found with ID {request_id}."
        c = r.get("customer") or {}
        return (
            request_line(r)
            + f"\nComposition: {r.get('composition') or '-'}\nCustomer address: {c.get('address') or '-'}"
            + f"\nEmployee: {r.get('employeeName') or '-'}\nComments: {r.get('comments') or '-'}"
        )

    @tool
    async def list_main_inventory(search: Optional[str] = None, low_stock_only: bool = False, limit: int = 15) -> str:
        """Warehouse (main branch) stock. Optional name search; set low_stock_only to see low / out-of-stock items."""
        try:
            items = await api.get("/inventory/main", search=search)
        except BackendError as e:
            return f"Error: {e}"
        if low_stock_only:
            items = [i for i in items if is_low(i)]
            items.sort(key=lambda i: i.get("quantity", 0) or 0)
        return limit_lines([stock_line(i) for i in items], limit, "stock items")

    @tool
    async def list_stores(search: Optional[str] = None) -> str:
        """All mini stores with code, status, pending requests, employees and stock lines."""
        try:
            stores = await api.get("/stores")
        except BackendError as e:
            return f"Error: {e}"
        if search:
            q = search.lower()
            stores = [s for s in stores if q in f"{s.get('storeCode')} {s.get('storeName')} {s.get('location')}".lower()]
        lines = [
            f"{s.get('storeCode')} | {s.get('storeName')} | {s.get('location') or '-'} | {s.get('status')} | "
            f"pending: {s.get('pendingRequests')} | total req: {s.get('totalRequests')} | "
            f"employees: {s.get('totalEmployees')} | stock lines: {s.get('inventoryCount')} | manager: {s.get('contactPerson') or '-'}"
            for s in stores
        ]
        return limit_lines(lines, 50, "stores")

    @tool
    async def list_store_employees(store_code: str) -> str:
        """Employees of a store by store code (e.g. AP20)."""
        try:
            store = await _find_store(store_code)
            if not store:
                return f"No store with code {store_code}."
            employees = await api.get(f"/employees/store/{store['_id']}")
        except BackendError as e:
            return f"Error: {e}"
        lines = [
            f"{e.get('employeeId')} | {e.get('employeeName')} | {e.get('designation')} | {e.get('phone') or '-'} | {e.get('status')}"
            for e in employees
        ]
        return limit_lines(lines, 50, f"employees in {store['storeCode']}")

    @tool
    async def list_customers(search: Optional[str] = None, limit: int = 10) -> str:
        """Customers, optionally searched by name or phone."""
        try:
            rows = await api.get("/customers", search=search)
        except BackendError as e:
            return f"Error: {e}"
        lines = [f"{c.get('name')} | {c.get('phone')} | {c.get('address') or '-'}" for c in rows]
        return limit_lines(lines, limit, "customers")

    @tool
    async def get_demand_analytics() -> str:
        """Medicine demand: units requested per medicine and status distribution."""
        try:
            d = await api.get("/requests/demand-analytics")
        except BackendError as e:
            return f"Error: {e}"
        meds = [
            f"{m.get('_id')}: {m.get('totalQuantity')} units in {m.get('totalRequests')} requests (pending {m.get('pendingCount')})"
            for m in d.get("medicineDemand", [])
        ]
        statuses = ", ".join(f"{s.get('_id')}: {s.get('count')}" for s in d.get("statusDistribution", []))
        return limit_lines(meds, 15, "medicines in demand") + f"\nStatus distribution: {statuses or '-'}"

    @tool
    async def list_notifications(limit: int = 10) -> str:
        """Recent admin notifications."""
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
    async def update_request_status(
        request_id: str,
        status: str,
        note: Optional[str] = None,
        expected_date: Optional[str] = None,
    ) -> str:
        """Change a request's status. status must be one of: Pending, Available at Main Branch,
        Approved / Will Be Supplied, Ordered, Completed, Not Available, Rejected.
        note = message for the store; expected_date = YYYY-MM-DD."""
        st = normalize_status(status)
        if not st:
            return f"Unknown status '{status}'. Valid: {', '.join(REQUEST_STATUSES)}"
        try:
            r = await _find_request(request_id)
        except BackendError as e:
            return f"Error: {e}"
        if not r:
            return f"No request found with ID {request_id}."
        body = {"status": st}
        if note:
            body["adminNotes"] = note
            body["mainBranchResponse"] = note
        if expected_date:
            body["expectedDate"] = expected_date
        product = r.get("productName") or r.get("medicineName")
        summary = f"{r['requestId']} ({product} x{r.get('quantity')}): {r.get('status')} → {st}"
        if note:
            summary += f' · note: "{note}"'
        if expected_date:
            summary += f" · expected {expected_date}"
        return _propose(
            title="Update request status",
            summary=summary,
            method="PUT",
            path=f"/requests/{r['_id']}/status",
            body=body,
            danger=st == "Rejected",
            success_message=f"{r['requestId']} is now '{st}'. The store has been notified.",
        )

    @tool
    async def set_warehouse_stock(
        medicine_name: str,
        quantity: int,
        mode: str = "set",
        batch_number: Optional[str] = None,
        expiry_date: Optional[str] = None,
    ) -> str:
        """Change main warehouse stock for an existing medicine. mode='set' replaces the quantity,
        mode='add' adds to it, mode='remove' subtracts. expiry_date = YYYY-MM-DD."""
        try:
            items = await api.get("/inventory/main")
        except BackendError as e:
            return f"Error: {e}"
        item, options = find_by_name(items, medicine_name, lambda i: (i.get("medicineId") or {}).get("name"))
        if not item:
            if options:
                return "Several medicines match, ask which one: " + ", ".join((o.get("medicineId") or {}).get("name", "?") for o in options[:10])
            return f"'{medicine_name}' is not in the warehouse. Use add_medicine_to_warehouse to add it."
        current = item.get("quantity", 0) or 0
        mode = (mode or "set").lower()
        new_qty = current + quantity if mode == "add" else current - quantity if mode == "remove" else quantity
        if new_qty < 0:
            return f"Cannot go below zero (current stock {current})."
        name = item["medicineId"]["name"]
        body = {
            "quantity": new_qty,
            "batchNumber": batch_number or item.get("batchNumber"),
            "expiryDate": expiry_date or item.get("expiryDate"),
            "minReorderLevel": item.get("minReorderLevel"),
            "unitPrice": item.get("unitPrice"),
        }
        extra = f" · batch {batch_number}" if batch_number else ""
        extra += f" · expiry {expiry_date}" if expiry_date else ""
        return _propose(
            title="Update warehouse stock",
            summary=f"{name}: {current} → {new_qty} units{extra}",
            method="PUT",
            path=f"/inventory/main/{item['_id']}",
            body=body,
            success_message=f"{name} warehouse stock is now {new_qty}.",
        )

    @tool
    async def add_medicine_to_warehouse(
        name: str,
        quantity: int = 0,
        category: Optional[str] = None,
        generic_name: Optional[str] = None,
        batch_number: Optional[str] = None,
        expiry_date: Optional[str] = None,
    ) -> str:
        """Add a new medicine to the catalog + warehouse (or add quantity if it already exists). expiry_date = YYYY-MM-DD."""
        if not name or not name.strip():
            return "Medicine name is required."
        if quantity < 0:
            return "Quantity cannot be negative."
        body = {
            "name": name.strip(),
            "genericName": generic_name,
            "category": category,
            "quantity": quantity,
            "batchNumber": batch_number,
            "expiryDate": expiry_date,
        }
        bits = [f"{name.strip()} · qty {quantity}"]
        if category:
            bits.append(f"category {category}")
        if generic_name:
            bits.append(f"generic {generic_name}")
        if batch_number:
            bits.append(f"batch {batch_number}")
        if expiry_date:
            bits.append(f"expiry {expiry_date}")
        return _propose(
            title="Add medicine to warehouse",
            summary=" · ".join(bits),
            method="POST",
            path="/inventory/main/add-medicine",
            body={k: v for k, v in body.items() if v not in (None, "")},
            success_message=f"{name.strip()} added to the warehouse.",
        )

    @tool
    async def create_store(
        store_code: str,
        store_name: str,
        location: Optional[str] = None,
        phone: Optional[str] = None,
        manager_name: Optional[str] = None,
        password: Optional[str] = None,
    ) -> str:
        """Create a new mini store. store_code must look like AP20 / AP105 (AP + 2 or 3 digits).
        It also creates the store login (default password store123) and a Store Manager employee."""
        code = (store_code or "").strip().upper()
        if not STORE_CODE_RE.match(code):
            return "Store ID must be AP followed by 2 or 3 digits, e.g. AP20."
        if not store_name or not store_name.strip():
            return "Store name is required."
        ph = None
        if phone:
            ph = valid_phone(phone)
            if not ph:
                return "Phone must be exactly 10 digits."
        body = {
            "storeCode": code,
            "storeName": store_name.strip(),
            "location": location or "",
            "phone": ph or "",
            "managerName": manager_name or "",
        }
        if password:
            if len(password.strip()) < 6:
                return "Password must be at least 6 characters."
            body["password"] = password.strip()
        return _propose(
            title="Create mini store",
            summary=f"{code} · {store_name.strip()}" + (f" · {location}" if location else "")
            + f" · login {code} / {'custom password' if password else 'store123'}",
            method="POST",
            path="/stores",
            body=body,
            success_message=f"Store {code} created. Login: {code} / {'(custom password)' if password else 'store123'}.",
        )

    @tool
    async def set_store_status(store_code: str, active: bool) -> str:
        """Activate or deactivate a mini store (inactive stores cannot log in)."""
        try:
            store = await _find_store(store_code)
        except BackendError as e:
            return f"Error: {e}"
        if not store:
            return f"No store with code {store_code}."
        status = "Active" if active else "Inactive"
        return _propose(
            title="Change store status",
            summary=f"{store['storeCode']} {store['storeName']}: {store.get('status')} → {status}",
            method="PUT",
            path=f"/stores/{store['_id']}",
            body={"status": status},
            danger=not active,
            success_message=f"{store['storeCode']} is now {status}.",
        )

    @tool
    async def delete_store(store_code: str) -> str:
        """Permanently delete a mini store with its login, employees and shelf stock (requests are kept)."""
        try:
            store = await _find_store(store_code)
        except BackendError as e:
            return f"Error: {e}"
        if not store:
            return f"No store with code {store_code}."
        return _propose(
            title="Delete mini store",
            summary=f"Delete {store['storeCode']} {store['storeName']} with its login, {store.get('totalEmployees', 0)} employees and shelf stock",
            method="DELETE",
            path=f"/stores/{store['_id']}",
            danger=True,
            success_message=f"Store {store['storeCode']} deleted.",
        )

    @tool
    async def add_employee(
        store_code: str,
        employee_name: str,
        phone: Optional[str] = None,
        designation: str = "Employee",
        address: Optional[str] = None,
    ) -> str:
        """Add an employee to a store. designation: Employee, Executive, Store Manager or Other. Phone must be 10 digits."""
        if not employee_name or not employee_name.strip():
            return "Employee name is required."
        ph = None
        if phone:
            ph = valid_phone(phone)
            if not ph:
                return "Phone must be exactly 10 digits."
        try:
            store = await _find_store(store_code)
        except BackendError as e:
            return f"Error: {e}"
        if not store:
            return f"No store with code {store_code}."
        return _propose(
            title="Add employee",
            summary=f"{employee_name.strip()} ({designation}) → {store['storeCode']}" + (f" · {ph}" if ph else ""),
            method="POST",
            path=f"/employees/store/{store['_id']}",
            body={"employeeName": employee_name.strip(), "designation": designation, "phone": ph or "", "address": address or ""},
            success_message=f"{employee_name.strip()} added to {store['storeCode']}.",
        )

    @tool
    async def set_employee_status(store_code: str, employee: str, active: bool) -> str:
        """Activate or deactivate an employee (by name or employee ID like EMP-AP20-02) in a store."""
        try:
            store = await _find_store(store_code)
            if not store:
                return f"No store with code {store_code}."
            emp, options = await _find_employee(store, employee)
        except BackendError as e:
            return f"Error: {e}"
        if not emp:
            if options:
                return "Several employees match, ask which one: " + ", ".join(f"{o['employeeName']} ({o['employeeId']})" for o in options)
            return f"No employee '{employee}' in {store['storeCode']}."
        status = "Active" if active else "Inactive"
        return _propose(
            title="Change employee status",
            summary=f"{emp['employeeName']} ({emp['employeeId']}): {emp.get('status')} → {status}",
            method="PUT",
            path=f"/employees/{emp['_id']}/status",
            body={"status": status},
            success_message=f"{emp['employeeName']} is now {status}.",
        )

    @tool
    async def remove_employee(store_code: str, employee: str) -> str:
        """Permanently delete an employee (by name or employee ID) from a store."""
        try:
            store = await _find_store(store_code)
            if not store:
                return f"No store with code {store_code}."
            emp, options = await _find_employee(store, employee)
        except BackendError as e:
            return f"Error: {e}"
        if not emp:
            if options:
                return "Several employees match, ask which one: " + ", ".join(f"{o['employeeName']} ({o['employeeId']})" for o in options)
            return f"No employee '{employee}' in {store['storeCode']}."
        return _propose(
            title="Remove employee",
            summary=f"Delete {emp['employeeName']} ({emp['employeeId']}) from {store['storeCode']}",
            method="DELETE",
            path=f"/employees/{emp['_id']}",
            danger=True,
            success_message=f"{emp['employeeName']} removed.",
        )

    @tool
    async def add_customer(name: str, phone: str, address: Optional[str] = None) -> str:
        """Register a customer. Phone must be exactly 10 digits."""
        ph = valid_phone(phone)
        if not ph:
            return "Phone must be exactly 10 digits."
        if not name or not name.strip():
            return "Customer name is required."
        return _propose(
            title="Add customer",
            summary=f"{name.strip()} · {ph}" + (f" · {address}" if address else ""),
            method="POST",
            path="/customers",
            body={"name": name.strip(), "phone": ph, "address": address or ""},
            success_message=f"Customer {name.strip()} added.",
        )

    @tool
    async def broadcast_notification(title: str, message: str, store_code: Optional[str] = None) -> str:
        """Send an announcement to all stores, or to one store if store_code is given."""
        target = None
        if store_code:
            try:
                target = await _find_store(store_code)
            except BackendError as e:
                return f"Error: {e}"
            if not target:
                return f"No store with code {store_code}."
        body = {"title": title, "message": message}
        if target:
            body["targetStoreId"] = target["_id"]
        return _propose(
            title="Send notification",
            summary=f'To {target["storeCode"] if target else "all stores"}: "{title}" – {message}',
            method="POST",
            path="/notifications/broadcast",
            body=body,
            success_message="Notification sent.",
        )

    return [
        get_dashboard_summary,
        list_requests,
        get_request_details,
        list_main_inventory,
        list_stores,
        list_store_employees,
        list_customers,
        get_demand_analytics,
        list_notifications,
        update_request_status,
        set_warehouse_stock,
        add_medicine_to_warehouse,
        create_store,
        set_store_status,
        delete_store,
        add_employee,
        set_employee_status,
        remove_employee,
        add_customer,
        broadcast_notification,
    ]
