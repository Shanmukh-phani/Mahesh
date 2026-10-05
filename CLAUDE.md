# MedConnect — Medical Mini Store & Central Inventory

Internal portal for a **central warehouse (ADMIN)** and multiple **mini-store branches (MINI_STORE)**. Branches submit medicine requisitions for walk-in customers. The main branch reviews them, updates fulfillment status, and manages warehouse stock, stores, employees, and customers.

Two-app monorepo. No shared package. Real-time updates go through Socket.IO rooms.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 8, React Router 7, MUI 9, Emotion, Axios, Socket.IO client, Recharts, date-fns, lucide-react, react-hot-toast |
| Backend | Express 5, Mongoose 9, JWT, bcrypt, Socket.IO 4, CORS, dotenv, nodemon |
| Database | MongoDB (`medical_mini_store` by default) |

## Run locally

No `.env` files are committed. Defaults are used if env vars are missing.

```bash
# Backend — http://0.0.0.0:5001
cd backend
npm start          # nodemon server.js

# Frontend — http://0.0.0.0:5173 (LAN-accessible)
cd frontend
npm run dev
```

| Env var | Default |
|---|---|
| `PORT` | `5001` |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/medical_mini_store` |
| `JWT_SECRET` | `secret123` |
| `VITE_API_URL` | `http://<browser-hostname>:5001/api` |
| `VITE_SOCKET_URL` | `http://<browser-hostname>:5001` |

Seed / reset scripts (run from `backend/`):

```bash
node seed.js        # admin only (admin / admin123)
node seedStore.js   # one store MS001 (store1 / store123)
node seedData.js    # admin + 5 Hyderabad stores + medicines + customers + sample requests
node resetDb.js     # wipe all collections, then seed only admin
```

Seeded logins (after `seedData.js`):

- Admin: `admin` / `admin123`
- Stores: `store1`–`store5` / `store123` (or login with store codes `MS001`–`MS005`)

## Project layout

```
WEB/
├── backend/
│   ├── server.js                 # Express + HTTP + Socket.IO bootstrap
│   ├── middleware/auth.js        # JWT + role guard
│   ├── socket/index.js           # rooms: join_room
│   ├── models/                   # Mongoose schemas
│   └── routes/                   # /api/* routers
└── frontend/src/
    ├── App.jsx                   # Role-gated routes
    ├── main.jsx                  # ThemeProvider + AuthProvider
    ├── context/AuthContext.jsx   # login, token, socket room join
    ├── services/api.js           # Axios + Bearer interceptor
    ├── services/socket.js        # Singleton Socket.IO client
    ├── theme/theme.js            # MUI theme (teal admin, blue store)
    ├── components/               # Layouts + shared modals
    └── pages/admin | store/
```

## Domain model

Three roles on `User`: `ADMIN` (no store), `EXECUTIVE` (assigned stores via `Store.executiveId`) and `MINI_STORE` (linked to a `Store` **and** an `Employee`).

### Hierarchy and access

```
Main admin (adminLevel MAIN) → admins (adminLevel SUB) → executive officers → store employees
```

- **Admins**: full main-branch powers. Only the main admin creates/edits/deletes SUB admins. Any admin manages executives and assigns stores (`/admin/team`). Every change is recorded with the actor (`actorLabel`, e.g. `Admin A (Admin)`).
- **Executive officer**: sees only assigned stores (`storeScopeFilter` / `canAccessStore` in `backend/utils/access.js`). Manages employees and their logins in those stores, does the **first approval** on requests, and sees complaints (read-only). Cannot add stores or touch admin pages.
- **Store employees**: each has a personal `MINI_STORE` login (`User.employeeId`). The logged-in employee is recorded as the request raiser / complaint author / store-update author. The client-sent `employeeName` is ignored when a login is linked to an employee.
- `auth` middleware reloads the user from the DB every request: deactivated users, deactivated employees and employee logins without an active employee get 401 immediately.

Two-step request approval (`MedicineRequest.approvalStage`):

1. Store employee creates → `PENDING_EXECUTIVE` if the store has an active executive (APPROVAL_REQUIRED notification to `EXEC_<userId>`), else `FORWARDED` straight to the main branch.
2. Executive `PUT /requests/:id/executive-review { decision: approve|reject, note }` (reason required to reject). Approve → `FORWARDED` + NEW_REQUEST to admins. Reject → `REJECTED_BY_EXECUTIVE` + status `Rejected`. Store gets `EXECUTIVE_REVIEW`.
3. Admins only see / update forwarded requests (`MAIN_BRANCH_VISIBLE`). `GET /requests?stage=executive` is the read-only "Waiting at executives" view.

Pending requests auto-forward when the executive is unassigned, deactivated or deleted. Requests created before the hierarchy were migrated to `FORWARDED` (`backend/migrations/hierarchy.js`, idempotent, runs at startup).

Audit: `executiveReview`, `raisedBy`, `lastUpdatedBy`, `actionLog[]` (`CREATED`, `AUTO_FORWARDED`, `EXECUTIVE_APPROVED`, `EXECUTIVE_REJECTED`, `STATUS_UPDATE`, `STORE_UPDATE`) and `by` on `mainBranchResponseHistory`. UI: `components/ApprovalTrail.jsx` (`ApprovalChip`, `LastUpdatedBy`, `ActionLogTimeline`).

### Collections

- **User** — `username`, `passwordHash`, `role`, optional `storeId`, `name`, `email`, `phone`, `isActive`
- **Store** — `storeCode` (unique login ID, e.g. `MS001`), `storeName`, `location`, phones/emails, `contactPerson`, `status` (`Active`/`Inactive`) + `isActive` (kept in sync by pre-save)
- **Employee** — belongs to a store. `employeeId` like `EMP-MS001-01`. Designation: `Store Manager` | `Executive` | `Other`. Same `status`/`isActive` sync as Store
- **Medicine** — catalog: `name`, `genericName`, `category`, `description`
- **MainInventory** — warehouse stock: `medicineId`, `quantity`, `batchNumber`, `expiryDate`
- **StoreInventory** — branch shelf stock: `storeId`, `medicineId`, `quantity`, `batchNumber`, `expiryDate`
- **MedicineRequest** — the core workflow document (see statuses below)
- **Customer** — unique `phone`. Auto-upserted when a store creates a request
- **Notification** — routed by `recipientRole` and/or `recipientStoreId`
- **Complaint** — customer complaint raised by a store: `complaintId` (`CMP-10001`), `storeId` + denormalized `storeCode`/`storeName`, `complaintDate`, customer name/phone, `medicineName`, `medicineBrand`, `batchNumber`, `composition`, `purchaseDate`, `quantityBought`, `complaintType` (`Not Working / Ineffective` | `Price Issue` | `Damaged / Expired` | `Side Effect / Reaction` | `Other`), optional `pricePaid`/`expectedPrice`, `complaintText`, `employeeName` (must be an active employee of that store), `status` (`Open` | `In Review` | `Resolved` | `Rejected`), `adminResponse`, `adminResponseAt`, `responseHistory[]`
- **StoreExpense** — monthly store expense line: `storeId` + `storeCode`/`storeName`, `month` (`YYYY-MM`, from `expenseDate`), `category`, `amount`, `paymentMode`, `paidTo`, `billNumber`, `description`, `addedBy`. Check: `status` `Pending`|`Checked` + `checkedBy/At/Note`. Reimbursement: `paymentStatus` `Unpaid`|`Paid`|`Received`|`Not received` (missing = `Unpaid`), `paidBy/At`, `payoutMode`, `payoutReference`, `payoutNote`, `receiptBy/At/Note`

### Medicine request statuses

```
Pending
Available at Main Branch
Approved / Will Be Supplied
Ordered
Completed
Not Available
Rejected
```

Request IDs are generated as `MR-{10000 + count + 1}` (count-based; can collide if docs are deleted).

Field aliases (both exist, pre-save keeps them in sync):

- `productName` ↔ `medicineName`
- `mainBranchResponse` ↔ `adminNotes`

## Auth

`POST /api/auth/login` accepts either a **username** or a **storeCode** (case-insensitive; a store code signs in as that store's Store Manager login). Inactive users/stores/employees cannot log in.

JWT payload (`7d`): `{ _id, role, adminLevel, storeId, storeCode, employeeId }`.

Frontend login response user object (this is what `localStorage.user` holds; `GET /auth/me` refreshes it on app load):

```js
{ _id, username, role, adminLevel, store /* populated Store */, employee /* { employeeName, employeeId, designation } */, assignedStores /* EXECUTIVE */, name, email }
```

`PUT /auth/change-password { currentPassword, newPassword }` changes only the caller's password (`ChangePasswordDialog` in each layout's user menu). `homeForRole(role)` in `AuthContext` gives `/admin`, `/executive` or `/store`.

Note: the stored user has `store`, **not** `storeId`. JWT on the server has `storeId` as a string. Do not assume they are the same shape.

`auth` middleware reads `Authorization: Bearer <token>`. `authorizeRoles('ADMIN' | 'MINI_STORE')` is used on mutating admin/store endpoints. A 401 from Axios clears token/user and redirects to `/login`.

## REST API (`/api`)

All routes except `/auth/login` require JWT.

| Prefix | Purpose |
|---|---|
| `/auth` | `POST /login` |
| `/stores` | List (with metrics), get one (employees + recent requests), admin CRUD, `GET /:id/inventory` |
| `/employees` | `GET /my-store` (active staff for logged-in store), `GET /store/:storeId`, admin CRUD + status toggle |
| `/requests` | Create (store), list/filter, admin status update, dashboard + demand analytics |
| `/medicines` | Search catalog, admin create (also seeds MainInventory at qty 0) |
| `/inventory` | `GET/PUT /main`, `POST /main/add-medicine`, `GET/POST /store` |
| `/notifications` | List (role-scoped), mark read, admin broadcast |
| `/customers` | CRUD + `GET /:id/history` (requests matched by phone) |
| `/users` | Admin only. `GET /?role=ADMIN|EXECUTIVE`, `POST` (ADMIN creation = main admin only, creates SUB), `PUT /:id` (profile, password reset, `isActive`, `storeIds` for executives), `DELETE /:id` |
| `/complaints` | `GET /` (admin: all, optional `?storeIds=a,b`; executive: assigned stores; store: own only), `GET /employees` (store's active staff incl. manager), `GET /:id`, store `POST /`, `PUT /:id`, `DELETE /:id` (own store only), admin `PUT /:id/response` `{ status, message }` |
| `/activity` | Any user: `POST /heartbeat {visible, ending, path}`, `POST /track {events:[{type: PAGE_VIEW\|EXPORT, path, title, label, rows}]}`. Admin + executive: `GET /` (feed; filters `role,userId,storeId,category,action,outcome,from,to,q,page,limit`), `GET /sessions` (`status=ONLINE\|ENDED`), `GET /summary` (online now, totals, time per user, categories, `system` uptime for admins), `GET /users`, `PUT /sessions/:id/end` (remote sign-out) |
| `/expenses` | `GET /meta`. Store: `GET /status` (reminder + `toConfirm[]` months paid by CE awaiting confirmation), `POST /`, `PUT /:id`, `DELETE /:id` (own, Pending only), `PUT /confirm-payment {month, received, note}` (note required when not received). Executive/admin (scoped): `GET /summary?month` (per store incl. `toPay`, `awaitingConfirm`, `received`, `notReceived`), `PUT /check-month`, `PUT /:id/check {checked}` (no un-check once paid), `PUT /pay-month {storeId, month, payoutMode, payoutReference, payoutNote}` (pays Checked + Unpaid/Not received), `POST /remind`. `GET /` for all roles (`month,status,payment,storeId`) |

Important request routes (order matters — analytics are registered **before** `/:id`):

- `GET /requests/dashboard-metrics` — totals, top medicines, per-store counts
- `GET /requests/demand-analytics` — demand buckets (high ≥5 units, moderate 2–4, low <2)
- `GET /requests/ministore-metrics` — store-scoped totals / pending / today
- `POST /requests` — `MINI_STORE` only. Creates request + customer upsert + admin notification + socket emit
- `PUT /requests/:id/status` — `ADMIN` only. Updates status/notes/expectedDate + store notification + socket emit
- `PUT /requests/:id/store-response` — `MINI_STORE` only, own store's request, only after the main branch responded. Body `{ message, employeeName? }` (employee must be active in that store). Sets `storeResponse` / `storeResponseBy` / `storeResponseAt`, appends to `storeResponseHistory`, writes an ADMIN `STORE_RESPONSE` notification, emits `medicine_request_updated` (full doc) + `new_notification` to `ADMIN_ROOM`

Creating a store (`POST /stores`) also creates:

1. The Store document
2. A `MINI_STORE` User (default password `store123`)
3. A Store Manager Employee (`EMP-{CODE}-01`)

Deleting a store removes Store + Users + Employees + StoreInventory. **It does not delete MedicineRequests.**

## Socket.IO

Server: `backend/socket/index.js` attaches to the same HTTP server. CORS origin is `*`. `io` is stored on the Express app (`app.set('io', io)`) so routes can emit.

Rooms:

| Room | Who joins | How |
|---|---|---|
| `ADMIN_ROOM` | Admin clients | `socket.emit('join_room', 'ADMIN_ROOM')` |
| `STORE_<storeMongoId>` | Mini-store clients | `socket.emit('join_room', 'STORE_' + storeId)` |
| `EXEC_<userMongoId>` | Executive officer clients | `socket.emit('join_room', 'EXEC_' + userId)` — receives `medicine_request_created` / `new_notification` for pending approvals and `medicine_request_updated` for their stores |

Server events (emitted from routes, **not** from socket handlers):

| Event | Target | When |
|---|---|---|
| `medicine_request_created` | `ADMIN_ROOM` | Store submits a requisition |
| `new_notification` | `ADMIN_ROOM` | Same moment (NEW_REQUEST notification) |
| `medicine_request_updated` | `STORE_<id>` | Admin changes request status |
| `new_notification` | `STORE_<id>` | Same moment (STATUS_UPDATE) |
| `medicine_request_updated` | `ADMIN_ROOM` | Store adds/edits its customer update (full request doc) |
| `new_notification` | `ADMIN_ROOM` | Same moment (STORE_RESPONSE, "Store Update Received") |
| `new_notification` | `ADMIN_ROOM` | Store records a customer complaint (`NEW_COMPLAINT`, `requestCode` = complaint ID) |
| `new_notification` | `STORE_<id>` | Admin responds to a complaint (`COMPLAINT_RESPONSE`) |
| `new_notification` | each chosen store room, or **all sockets** | Admin broadcast (`POST /notifications/broadcast { title, message, targetStoreIds? }`). Empty `targetStoreIds` = all stores. Otherwise there is one copy per store, sharing `broadcastGroup`; admins see it as one row (`collapseGroups`). The old single `targetStoreId` is still accepted. Stores only see all-store broadcasts or their own copy |

Client singleton: `frontend/src/services/socket.js` (`autoConnect`, websocket + polling, 20 reconnects).

Who listens:

- `AuthContext` — connect + join room on login
- `AdminLayout` — `new_notification` toast + badge; `medicine_request_created` refreshes notifs
- `StoreLayout` — `new_notification` toast + badge; `medicine_request_updated` toast
- `MedicineRequests` (admin) — prepends live new requests
- `StoreDashboard` / `StoreRequestsPage` — refresh / patch row on status update

### Room joining (fixed)

Rooms are joined only through `setSocketRoom(roomForUser(user))` from `services/socket.js`. `roomForUser` handles `user.store` as an object or id string and returns `STORE_<Mongo ObjectId string>` / `ADMIN_ROOM`, matching what `requestRoutes` / `notificationRoutes` emit to. The socket re-emits `join_room` on every `connect`, because server rooms are lost on reconnect. Logout disconnects, which drops the old room.

Always remove listeners with the handler reference: `socket.off(event, handler)`. A bare `socket.off(event)` also removes the layout's listeners.

## Frontend routes

`PrivateRoute` redirects unauthenticated users to `/login` and wrong-role users to their home.

### Admin (`AdminLayout`, teal brand “MedAdmin”)

| Path | Page | Role |
|---|---|---|
| `/admin` | Dashboard — KPI cards, demand chart, recent activity | AdminDashboard |
| `/admin/requests` | Live requisition inbox + status update dialog | MedicineRequests |
| `/admin/store-updates` | All store customer updates (latest / full history) + Excel download | StoreUpdatesPage |
| `/admin/demand` | Demand analytics (Recharts) | MedicineDemand |
| `/admin/inventory` | Warehouse stock add/edit | MainInventoryPage |
| `/admin/stores` | Mini-store CRUD + employee modal | MiniStoresPage + StoreDetailsModal |
| `/admin/customers` | Customer list + request history drawer | CustomersPage |
| `/admin/notifications` | Inbox + broadcast composer | NotificationsPage |
| `/admin/complaints` | Store complaints: multi-store filter, respond/update status, Excel (one sheet, or one sheet per store) | ComplaintsPage |
| `/admin/team` | Admins + executive officers, store assignment, enable/disable, password reset | TeamPage |
| `/admin/activity` | Activity logs: overview (online now, time in app, server uptime), full activity feed with field diffs, sign-in sessions + remote sign-out, Excel | ActivityLogsPage → `components/activity/ActivityLogView` |

### Executive officer (`ExecutiveLayout`, purple brand, `executiveTheme`)

| Path | Page |
|---|---|
| `/executive` | Dashboard: waiting approvals, per-store counts |
| `/executive/approvals` | Approve / reject requests (pending, sent, rejected, all) |
| `/executive/stores` | Assigned stores → `StoreDetailsModal` for employees + personal logins |
| `/executive/complaints` | Complaints from assigned stores (read-only) + Excel |
| `/executive/notifications` | NotificationsPage |
| `/executive/activity` | Activity logs of their stores' staff + their own (same `ActivityLogView`) |
| `/executive/expenses` | Store expenses per month: check, remind, mark paid; sees store confirmations live |

Ask AI is not mounted for executives (the AI service only accepts `ADMIN` / `MINI_STORE`).

### Mini store (`StoreLayout`, blue brand)

| Path | Page |
|---|---|
| `/store` | Branch dashboard + recent requests |
| `/store/search` | Catalog search + quick-request modal |
| `/store/inventory` | Local shelf stock add/update |
| `/store/requests` | This store’s requisition history |
| `/store/updates` | Main branch responses (from `mainBranchResponseHistory`) + add customer update + Excel download |
| `/store/create-request` | Full requisition form |
| `/store/notifications` | Same NotificationsPage (store cannot broadcast) |
| `/store/complaints` | Customer complaint entry (add / edit / delete), main branch responses, Excel download |
| `/store/expenses` | Monthly expenses add/edit, reminder banner, confirm CE payment received / not received, Excel |

Layouts are responsive: permanent drawer from `sm` up, temporary hamburger drawer on mobile. Main content always has a `Toolbar` spacer so the AppBar does not overlap.

## Core user flows

1. **Admin creates a mini store** → store + login + manager employee are created together.
2. **Store staff creates a requisition** (`CreateRequest` or SearchMedicine quick modal): product (catalog or free-text), qty, composition, customer phone (auto-lookup), name, address, comments. Employee dropdown comes from `GET /employees/my-store`.
3. Backend persists the request, upserts Customer by phone, writes an ADMIN notification, emits `medicine_request_created` + `new_notification` to `ADMIN_ROOM`.
4. **Admin updates status** on Medicine Requests (status, notes, expected date). Backend writes a store notification and emits `medicine_request_updated` + `new_notification` to `STORE_<id>`.
5. Store UI toasts and patches the request row / dashboard metrics.

`POST /requests` sets `employeeName` from the logged-in employee (`req.user.employeeName`); forms show "Raised by (you)" instead of an employee picker when `user.employee` is present.

## Store expenses

Flow: store adds expenses → CE checks (`EXPENSE_CHECKED` to store) → CE marks the month paid (`EXPENSE_PAID` to store) → store confirms received / not received (`EXPENSE_RECEIPT` to `EXEC_<executiveId>`, or `ADMIN_ROOM` when the store has no executive). "Not received" makes the items payable again (CE sees "Pay again"). All live updates use `new_notification`; pages reload on the matching `type`. Notification `requestCode` = `EXP-YYYY-MM[-END|-START|-MANUAL]` (links open that month).

Reminders (`utils/expenseReminders.js`, started after listen, every 6h): from day 25 if the current month is empty, and days 1–5 if last month is empty — one `EXPENSE_REMINDER` per store per month and phase. Store menu badge = missing-month reminder + payments waiting for confirmation.

## Activity logging

Everything is recorded in two collections:

- **ActivityLog**: one row per event. Fields: `at`; actor (`actorId`, `actorName`, `actorUsername`, `actorRole` ADMIN|EXECUTIVE|MINI_STORE|SYSTEM|GUEST, `adminLevel`, `employeeId`, `designation`); related store (`storeId`, `storeCode`, `storeName`); `category`, `action`, `outcome` (SUCCESS|FAILED), `summary`; `entity`, `entityId`, `entityLabel`; `changes[] {field, from, to}`; `details.input` (sanitized request body, passwords hidden); `source` (WEB|AI_ASSISTANT|SERVER); `method`, `path`, `statusCode`, `durationMs`, `errorMessage`; `sessionId`, `ip`, `userAgent`, `device`.
- **UserSession**: one per sign-in. Fields: `loginAt`, `lastSeenAt`, `logoutAt`, `endReason` (LOGOUT|FORCED), `endedBy`, `activeMs` (time the app tab was visible, from heartbeats), `pageViews`, `actions`, `lastPath`, `ip`, `device`. Status: ONLINE (seen in the last 3 min), CLOSED, LOGGED_OUT or ENDED_BY_ADMIN.

How events are captured:

- `middleware/activityLogger.js` runs before all routers. It logs every POST/PUT/PATCH/DELETE under `/api` after the response finishes. A `RULES` table maps method + path to category, action, readable summary and model. For `:id` routes it loads the document before and after the call to store a field diff. Failed attempts (status ≥ 400 with a logged-in user) are logged as FAILED. **When you add a mutating route, add a rule there** (unmatched routes still get a generic row).
- Login, logout, failed and blocked logins: `authRoutes.js` (`LOGIN`, `LOGIN_FAILED`, `LOGIN_BLOCKED`, `LOGOUT`). Login creates a `UserSession` and puts `sid` in the JWT.
- `auth` middleware calls `resolveSession` (`utils/sessions.js`). It updates `lastSeenAt` (throttled to 30s) and returns 401 if the session was signed out or ended by an admin. Tokens without `sid` (issued before logging existed) get a session keyed by a token hash.
- Frontend: `services/activity.js` `useActivityTracker()` in all three layouts sends `PAGE_VIEW` on route change and a 60s heartbeat (visibility-aware). `downloadExcel` / `downloadExcelSheets` send `EXPORT`. `AuthContext.logout` calls `POST /auth/logout` (fetch keepalive).
- Server: `SERVER_START` after listen; `SERVER_STOP` on SIGINT, SIGTERM and nodemon's SIGUSR2, with uptime.
- `utils/activity.js` `logActivity()` is fire-and-forget and never throws. Use it for any custom event.

Who sees what:

- **Main admin**: everything.
- **Admin (SUB)**: everything except other admins' rows.
- **Executive**: their own rows plus store users of their assigned stores.
- **Store users**: none (403).

Remote sign-out: the main admin can end any session; a SUB admin can end non-admin sessions; an executive can end their store users' sessions.

## Ask AI assistant (`AI/`)

Separate FastAPI service (port `8000`) using LangGraph `create_react_agent` + `ChatGroq` (`GROQ_API_KEY`, `GROQ_MODEL` in `AI/.env`). Run: `cd AI && .venv/bin/python run.py` (deps: `uv pip install -r requirements.txt`).

- Frontend widget `components/AskAI.jsx` (floating button, mounted in both layouts) calls `POST /chat {message, thread_id}` with the user's JWT. URL: `VITE_AI_URL` or `http://<host>:8000`.
- FastAPI verifies the JWT with the same `JWT_SECRET`, then builds role-specific tools (`app/tools/admin_tools.py`, `store_tools.py`) that call the Express API **with the user's token** — Express stays the permission boundary.
- Read tools run immediately. Mutating tools only register a pending action; the UI shows Confirm/Cancel and calls `POST /actions/{id}/confirm|cancel`. On confirm the widget fires `medconnect:data-changed`; pages subscribe via `utils/useAIRefresh.js`.
- Conversation memory is in-process (`MemorySaver`), keyed `userId:thread_id`; restarting the AI service clears it.

## UI conventions

- Theme: Plus Jakarta Sans, teal `#0D9488` (admin/primary), blue `#2563EB` (store/secondary), slate text, `#F8FAFC` page background, 12–16px card radii.
- Shared cards: `white-card` / `white-card-hover` / `glass-card` classes in `index.css`.
- Toasts: `react-hot-toast`, top-right. Live notifications use a custom dark toast that navigates to the notifications page.
- Shared modals: `RequestDetailsModal`, `StoreDetailsModal` (employees CRUD lives here).

## Working rules for this repo

- Do **not** change existing behavior unless the user asked. Additive work only.
- Keep **all screens responsive** (xs / sm / md). Layouts already follow this; new pages should too.
- Do not invent a new state library. Auth is React context + localStorage. Server data is fetched per page with Axios.
- Do not add a new socket protocol. Reuse `join_room`, `medicine_request_created`, `medicine_request_updated`, `new_notification`.
- Prefer existing aliases (`productName`/`medicineName`, `status`/`isActive`) instead of renaming schema fields.
- Backend filters/aggregations that use `medicineName` should also consider `productName` if you touch request queries.
- `MainInventory` / `Medicine` schemas are slimmer than some route payloads (`minReorderLevel`, `unitPrice`, `manufacturer`). Mongoose `strict` will drop unknown fields unless the schema is updated first.
- Store-scoped queries must use the JWT `req.user.storeId` for `MINI_STORE` users. Never trust a client-supplied storeId to escalate.

## Files that usually change together

| Change | Touch |
|---|---|
| New request field | `models/MedicineRequest.js`, `routes/requestRoutes.js`, `CreateRequest.jsx`, `RequestDetailsModal.jsx`, admin + store request tables |
| New live event | `backend/socket/index.js` (only if handshake changes), emitting route, `AdminLayout`/`StoreLayout`, the page that should refresh |
| New store field | `models/Store.js`, `routes/storeRoutes.js`, `MiniStoresPage.jsx`, `StoreDetailsModal.jsx` |
| New nav item | `AdminLayout.jsx` or `StoreLayout.jsx` **and** `App.jsx` route |
| Auth / user shape | `authRoutes.js` login payload, `AuthContext.jsx`, any `user.store` / `user.storeId` usage |
