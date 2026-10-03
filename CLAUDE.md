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

Two roles on `User`: `ADMIN` (no store) and `MINI_STORE` (linked to a `Store`).

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

`POST /api/auth/login` accepts either a **username** or a **storeCode** (case-insensitive). Inactive users/stores cannot log in.

JWT payload (`7d`): `{ _id, role, storeId, storeCode }`.

Frontend login response user object (this is what `localStorage.user` holds):

```js
{ _id, username, role, store /* populated Store */, name, email }
```

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

Important request routes (order matters — analytics are registered **before** `/:id`):

- `GET /requests/dashboard-metrics` — totals, top medicines, per-store counts
- `GET /requests/demand-analytics` — demand buckets (high ≥5 units, moderate 2–4, low <2)
- `GET /requests/ministore-metrics` — store-scoped totals / pending / today
- `POST /requests` — `MINI_STORE` only. Creates request + customer upsert + admin notification + socket emit
- `PUT /requests/:id/status` — `ADMIN` only. Updates status/notes/expectedDate + store notification + socket emit

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

Server events (emitted from routes, **not** from socket handlers):

| Event | Target | When |
|---|---|---|
| `medicine_request_created` | `ADMIN_ROOM` | Store submits a requisition |
| `new_notification` | `ADMIN_ROOM` | Same moment (NEW_REQUEST notification) |
| `medicine_request_updated` | `STORE_<id>` | Admin changes request status |
| `new_notification` | `STORE_<id>` | Same moment (STATUS_UPDATE) |
| `new_notification` | one store room, or **all sockets** | Admin broadcast (`POST /notifications/broadcast`) |

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
| `/admin/demand` | Demand analytics (Recharts) | MedicineDemand |
| `/admin/inventory` | Warehouse stock add/edit | MainInventoryPage |
| `/admin/stores` | Mini-store CRUD + employee modal | MiniStoresPage + StoreDetailsModal |
| `/admin/customers` | Customer list + request history drawer | CustomersPage |
| `/admin/notifications` | Inbox + broadcast composer | NotificationsPage |

### Mini store (`StoreLayout`, blue brand)

| Path | Page |
|---|---|
| `/store` | Branch dashboard + recent requests |
| `/store/search` | Catalog search + quick-request modal |
| `/store/inventory` | Local shelf stock add/update |
| `/store/requests` | This store’s requisition history |
| `/store/create-request` | Full requisition form |
| `/store/notifications` | Same NotificationsPage (store cannot broadcast) |

Layouts are responsive: permanent drawer from `sm` up, temporary hamburger drawer on mobile. Main content always has a `Toolbar` spacer so the AppBar does not overlap.

## Core user flows

1. **Admin creates a mini store** → store + login + manager employee are created together.
2. **Store staff creates a requisition** (`CreateRequest` or SearchMedicine quick modal): product (catalog or free-text), qty, composition, customer phone (auto-lookup), name, address, comments. Employee dropdown comes from `GET /employees/my-store`.
3. Backend persists the request, upserts Customer by phone, writes an ADMIN notification, emits `medicine_request_created` + `new_notification` to `ADMIN_ROOM`.
4. **Admin updates status** on Medicine Requests (status, notes, expected date). Backend writes a store notification and emits `medicine_request_updated` + `new_notification` to `STORE_<id>`.
5. Store UI toasts and patches the request row / dashboard metrics.

`CreateRequest` **sends** `employeeName`, but `POST /requests` currently sets `employeeName` from `req.user.name` (the store login name), not the selected employee. The selected employee is display-only unless the route is changed.

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
