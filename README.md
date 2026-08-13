# 🎂 BakeFlow ERP

> **A production-ready, multi-tenant bakery management platform** — inventory, sales invoices, GST billing, AI-powered invoice scanning, WhatsApp delivery, CRM, employee management, and a public API for website integration. Built on Node.js + Express + Prisma + Neon PostgreSQL, deployed on Render.

---

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start (Local)](#quick-start-local)
4. [Environment Variables](#environment-variables)
5. [Deploying to Render](#deploying-to-render)
6. [Navigating the App](#navigating-the-app)
7. [Project Structure](#project-structure)
8. [API Reference](#api-reference)
9. [Multi-Tenancy & Security](#multi-tenancy--security)
10. [Plans & Quotas](#plans--quotas)
11. [Public Website Integration](#public-website-integration)

---

## Overview

BakeFlow ERP is a cloud-first bakery management system. Whether you run a home bakery or a growing commercial operation, BakeFlow centralises everything:

| Module | What it does |
|---|---|
| **Ingredients** | Track raw material inventory, rates, rate history, and low-stock alerts |
| **Packaging** | Manage packaging SKUs, stock levels, and vendor info |
| **Products** | Build product catalog with auto-calculated costs and profit margins |
| **Orders** | Manage custom cake/product orders and delivery schedules |
| **Sales & GST Invoices** | Create GST-ready invoices with discount, send via WhatsApp (Twilio), export PDF |
| **Customers (CRM)** | Full customer history — total spend, order count, last order date |
| **AI Invoice Scan** | Photograph supplier invoices; Gemini Vision auto-fills ingredient stock entries |
| **Costing Calculator** | Labour + overhead + ingredient cost analysis per product |
| **Reports** | Revenue trends, top products, period comparisons |
| **Audit Log** | Immutable trail of every action by every employee |
| **Team Access** | Employee accounts (username + password), session history, role management |
| **Password Management** | Owner password change; WhatsApp OTP verification for password reset |
| **Admin Console** | Platform-level tenant management at `/admin` (separate portal) |
| **Public API** | REST endpoints (`/v1/products`, `/v1/stock`, `/v1/orders`) for website integration |
| **Embeddable Widget** | Drop a product catalog into any website with a single `<script>` tag |
| **CSV Export** | Download ingredients, packaging, products, sales, and customer data as CSV |
| **Webhook** | HMAC-signed `POST` notifications to your server on `order.placed` events |

---

## Architecture

```
Browser
  │
  ├── /                          → frontend/index.html       (Main ERP app — vanilla JS SPA)
  ├── /team                      → frontend/team.html        (Employee access monitor)
  ├── /signup                    → frontend/signup.html      (Public bakery onboarding request)
  ├── /admin                     → frontend/admin/index.html (Platform admin console)
  │
  └── [HTTPS / JWT Bearer Token]
       │
  backend/server.js              (Express — Node.js 18+)
       │
       ├── /api/auth             ← Google OAuth + employee login + WhatsApp OTP password reset
       ├── /api/team             ← Employee CRUD + session log + password management
       ├── /api/ingredients      ← Inventory (atomic stock increment/decrement)
       ├── /api/packaging        ← Packaging inventory
       ├── /api/products         ← Product catalog with costing
       ├── /api/orders           ← Custom order management
       ├── /api/sales            ← GST invoices + WhatsApp delivery (Twilio)
       ├── /api/invoice          ← Gemini Vision AI invoice scan
       ├── /api/customers        ← CRM
       ├── /api/settings         ← Business config, labour rates, overhead, API keys, webhooks
       ├── /api/audit            ← Read-only audit trail
       ├── /api/export           ← CSV downloads (ingredients, packaging, products, sales, customers)
       ├── /api/api-keys         ← Website integration key management
       ├── /api/admin            ← Platform admin (tenant management, metrics, stats)
       └── /v1/products|stock|orders  ← Public REST API (X-API-Key authenticated)
              │
       backend/sheets/sheetsClient.js   (Prisma ORM wrapper + tenant-scoped query extension)
              │
       Neon PostgreSQL (cloud)          (Single DB, isolated per tenant by tenantId)
```

---

## Quick Start (Local)

### Prerequisites
- **Node.js 18+** (`node -v` to check)
- A **[Neon](https://console.neon.tech)** free PostgreSQL database (takes 2 minutes to set up)
- A **[Google Cloud](https://console.cloud.google.com)** OAuth 2.0 Client ID

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/gproject4946/BakeFlow.git
cd BakeFlow

# 2. Install backend dependencies
cd backend
npm install

# 3. Set up environment variables
cp .env.example .env
# Open .env and fill in your values (see Environment Variables section below)

# 4. Push the database schema to Neon
npx prisma db push

# 5. Start the server
npm start
# For development with hot-reload:
npm run dev
```

Open **http://localhost:3000** in your browser.

> **First boot**: The server seeds your database with 26 default ingredients, 16 packaging items, 12 products, and default labour/overhead settings — so you can start exploring immediately.

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in all values:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon PostgreSQL connection string (`postgresql://...?sslmode=require`) |
| `GOOGLE_CLIENT_ID` | ✅ | OAuth 2.0 Client ID from [Google Cloud Console](https://console.cloud.google.com) |
| `JWT_SECRET` | ✅ | Long random string for signing JWTs — `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ADMIN_PASSWORD` | ✅ | Password owners enter alongside Google Sign-In. Also the Platform Admin console password. |
| `PLATFORM_ADMIN_EMAIL` | ✅ | Your Google email — grants access to the `/admin` platform console |
| `GEMINI_API_KEY` | ⚠️ | For AI invoice scanning — [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `TWILIO_ACCOUNT_SID` | ⚠️ | For WhatsApp invoice delivery + OTP — [Twilio Console](https://console.twilio.com) |
| `TWILIO_AUTH_TOKEN` | ⚠️ | Twilio auth token |
| `TWILIO_WHATSAPP_FROM` | ⚠️ | Twilio sender (`whatsapp:+14155238886` for sandbox) |
| `BUSINESS_NAME` | Optional | Your bakery name shown in invoices and WhatsApp messages |
| `BUSINESS_PHONE` | Optional | Phone number shown in WhatsApp invoices |
| `JWT_EXPIRY` | Optional | Token expiry (default `7d`) |
| `PORT` | Optional | Server port (default `3000`) |

> **Note**: `⚠️` = feature won't work without it, but the rest of the app functions normally.

---

## Deploying to Render

### 1. Push to GitHub
Make sure `.env` is in `.gitignore` ✅ (it already is — never commit secrets).

### 2. Create a Render Web Service
- Go to [render.com](https://render.com) → **New** → **Web Service**
- Connect your GitHub repo

| Setting | Value |
|---|---|
| **Root Directory** | `backend` |
| **Build Command** | `npm install && npx prisma generate` |
| **Start Command** | `node server.js` |
| **Environment** | Node |

### 3. Add Environment Variables
In the Render dashboard → **Environment** → add all variables from the table above.

### 4. Google OAuth — Add Your Render URL
In [Google Cloud Console](https://console.cloud.google.com) → your OAuth client → add your Render URL to:
- **Authorized JavaScript Origins**: `https://your-app.onrender.com`
- **Authorized Redirect URIs**: `https://your-app.onrender.com`

### 5. First Deploy
- Render auto-builds and deploys on every git push.
- The first boot seeds default data and all tables are ready immediately.

> The frontend is served as static files by Express — **no separate frontend deployment needed**.

---

## Navigating the App

### 🌐 Public Pages (no login)
| URL | Description |
|---|---|
| `/signup` | Request access to BakeFlow as a new bakery owner |

### 🔐 Bakery App (Owner / Admin / Employee login)
| URL | Who | Description |
|---|---|---|
| `/` | Everyone | Main ERP app — Google Sign-In + password |
| `/team` | Owner / Admin | Employee management + session history |

**Login flow:**
- **Owners** sign in with Google + their password (set via the platform admin console or WhatsApp OTP reset)
- **Employees** select their name from a dropdown and enter their username + password (set by the owner in Team Management)

After login, the sidebar sections are:

| Section | Roles | What it does |
|---|---|---|
| Dashboard | All | KPIs: revenue, stock alerts, top products, recent activity |
| Ingredients | All | View stock; Admin/Owner add, edit, update rates |
| Packaging | All | Same as ingredients |
| Products | All | Catalog with cost/margin breakdown |
| Orders | All | Custom order management with delivery tracking |
| Sales | All | Create GST invoices, send via WhatsApp, export PDF |
| Customers | All | CRM — contact info, order history, total spend |
| Scan Invoice | Admin/Owner | AI scan a supplier invoice photo → auto-fill stock |
| Costing | Admin/Owner | Labour + overhead cost calculator per product |
| Reports | Admin/Owner | Revenue trends, product performance |
| Settings | Owner | Business config, labour rates, overhead, API keys, webhooks |
| Audit Log | Admin/Owner | Full immutable activity trail |
| Team Access | Owner/Admin | Employee accounts → `/team` page |

### 🏛️ Platform Admin Console (`/admin`)
Accessible only to the email set as `PLATFORM_ADMIN_EMAIL`.

| Feature | Description |
|---|---|
| Tenant List | View all bakeries, their plan, status (active/suspended/pending), stats |
| Onboard Bakery | Manually create a new tenant with owner account and default settings |
| Approve Requests | Review and approve self-serve signup requests from `/signup` |
| Suspend / Reactivate | Instantly lock or restore access for a bakery |
| Platform Metrics | Total tenants, invoices, orders, products, customers across all bakeries |
| Usage Stats | Per-bakery AI scan and WhatsApp usage with API cost estimates |
| Change Admin Password | Dedicated section to change the platform admin password |
| Owner Password Reset | Set a new password for any bakery owner |

---

## Project Structure

```
BakeFlow/
├── backend/
│   ├── server.js                 # Express entry point — routes, static serving, bootstrap
│   ├── package.json              # Dependencies: express, prisma, bcryptjs, twilio, JWT, Gemini
│   ├── .env.example              # Template — copy to .env and fill in your values
│   ├── prisma/
│   │   └── schema.prisma         # Full data model (Tenant, User, Ingredient, Product, SalesInvoice…)
│   ├── prisma.config.js          # Prisma CLI config
│   ├── middleware/
│   │   ├── auth.js               # JWT verification + tenant suspension + free trial enforcement
│   │   ├── requireRole.js        # Role-based access control (owner | admin | employee)
│   │   ├── tenantContext.js      # AsyncLocalStorage — auto-scopes all DB queries to current tenant
│   │   └── quotaEnforcer.js      # Monthly quota enforcement for AI scans and WhatsApp messages
│   ├── routes/
│   │   ├── auth.js               # Google OAuth login, employee login, WhatsApp OTP password reset
│   │   ├── team.js               # Employee CRUD, session log, password management
│   │   ├── ingredients.js        # Inventory CRUD + atomic stock increment/decrement
│   │   ├── packaging.js          # Packaging inventory CRUD + stock management
│   │   ├── products.js           # Product catalog CRUD
│   │   ├── orders.js             # Custom order management
│   │   ├── sales.js              # GST invoices + Twilio WhatsApp + inventory deduction
│   │   ├── invoice.js            # Gemini Vision AI supplier invoice scanner
│   │   ├── customers.js          # CRM — customer CRUD + automatic stat tracking
│   │   ├── settings.js           # Business settings, labour, overhead, webhook config
│   │   ├── audit.js              # Read-only audit trail
│   │   ├── export.js             # CSV downloads (DPDP compliance)
│   │   ├── apiKeys.js            # Website integration key generation and management
│   │   ├── publicApi.js          # /v1 public REST API + HMAC webhook dispatch
│   │   └── admin.js              # Platform admin — tenant management, metrics, stats
│   └── sheets/
│       └── sheetsClient.js       # Prisma ORM wrapper — singleton, tenant-scoped query extension, seeding
│
├── frontend/
│   ├── index.html                # Main ERP SPA — all modules in one page with sidebar navigation
│   ├── team.html                 # Employee access monitor — member list, login history, add/remove
│   ├── signup.html               # Public self-serve bakery onboarding request form
│   ├── admin/
│   │   └── index.html            # Platform admin console — full tenant management UI
│   ├── css/
│   │   └── style.css             # Global design system — BakeFlow brand colours, components
│   └── js/
│       ├── app.js                # Main app logic (~4100 lines) — all ERP module views and API calls
│       ├── api.js                # Axios/fetch API client helpers with auth headers
│       └── widget.js             # Embeddable product catalog widget for external websites
│
├── DATABASE_SETUP.md             # Step-by-step Neon PostgreSQL setup guide
├── .gitignore                    # Excludes .env, node_modules, credentials, personal files
└── README.md                     # This file
```

---

## API Reference

All endpoints under `/api/*` require a `Bearer <JWT>` header (except `/api/auth/*` and the public `/v1/*` routes).

### Authentication (`/api/auth`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/google` | Login with Google ID token + password. Returns JWT. Works for owners and platform admin. |
| `POST` | `/api/auth/employee` | Login with employee username + password. Returns JWT. |
| `GET` | `/api/auth/employees` | List employee names for the login dropdown (uses Google token header for tenant resolution) |
| `GET` | `/api/auth/config` | Returns `GOOGLE_CLIENT_ID` and `BUSINESS_NAME` for frontend initialization |
| `POST` | `/api/auth/request-access` | Submit a new bakery onboarding request (public — no auth) |
| `POST` | `/api/auth/otp-request` | Send a 6-digit WhatsApp OTP to the owner's phone for password reset |
| `POST` | `/api/auth/otp-verify` | Verify the OTP and set a new owner password |

### Team & Sessions (`/api/team`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/team` | List all team members (name, role, username, last login) |
| `POST` | `/api/team` | Create a new employee with username + hashed password |
| `PUT` | `/api/team/:id` | Update name, role, active status, or reset password |
| `DELETE` | `/api/team/:id` | Soft-delete employee (blocks login, preserves audit data) |
| `GET` | `/api/team/sessions` | All login sessions for this bakery (last 90 days) |
| `GET` | `/api/team/sessions/:userId` | Sessions for a specific employee |
| `POST` | `/api/team/logout` | Record logout time for current session |
| `POST` | `/api/team/change-own-password` | Owner changes their own password (no confirmation needed) |

### Ingredients (`/api/ingredients`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/ingredients` | All ingredients (excluding deleted) |
| `POST` | `/api/ingredients` | Add new ingredient |
| `PUT` | `/api/ingredients/:id/rate` | Update rate with history |
| `PUT` | `/api/ingredients/:id/stock` | Update stock quantity and minimum alert level |
| `POST` | `/api/ingredients/:id/increment` | Atomically add to stock (race-condition-safe) |
| `POST` | `/api/ingredients/:id/decrement` | Atomically subtract from stock |
| `DELETE` | `/api/ingredients/:id` | Soft delete |
| `POST` | `/api/ingredients/:id/restore` | Restore soft-deleted ingredient |
| `DELETE` | `/api/ingredients/:id/hard` | Permanent delete |

### Sales Invoices (`/api/sales`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/sales` | All sales invoices |
| `POST` | `/api/sales` | Create new GST invoice |
| `DELETE` | `/api/sales/:id` | Soft delete invoice (rolls back customer stats) |
| `POST` | `/api/sales/:id/send-whatsapp` | Send invoice to customer via Twilio WhatsApp |
| `POST` | `/api/sales/:id/deduct-inventory` | Flag invoice as inventory-deducted |

### Platform Admin (`/api/admin`) — Platform Admin Only
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/tenants` | List all tenants with stats |
| `POST` | `/api/admin/tenants` | Onboard a new bakery (creates tenant + owner user + default settings) |
| `PUT` | `/api/admin/tenants/:id/approve` | Approve a pending onboarding request |
| `PUT` | `/api/admin/tenants/:id/suspend` | Suspend a bakery |
| `PUT` | `/api/admin/tenants/:id/reactivate` | Reactivate a suspended bakery |
| `GET` | `/api/admin/metrics` | Overall platform counts |
| `GET` | `/api/admin/stats` | Detailed per-bakery usage stats with API cost estimates |

### Public REST API (`/v1`) — X-API-Key Auth
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/v1/products` | Published product catalog |
| `GET` | `/v1/stock` | Current ingredient and packaging stock levels (with low-stock flags) |
| `POST` | `/v1/orders` | Place an order from an external website — creates a SalesInvoice |
| `GET` | `/v1/orders/:invoiceNumber/status` | Check order status |

### Data Export (`/api/export`) — Admin/Owner Only
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/export/ingredients` | Download ingredients as CSV |
| `GET` | `/api/export/packaging` | Download packaging as CSV |
| `GET` | `/api/export/products` | Download products as CSV |
| `GET` | `/api/export/sales` | Download all sales invoices as CSV |
| `GET` | `/api/export/customers` | Download customer list as CSV |

---

## Multi-Tenancy & Security

- **Tenant isolation**: Every database row has a `tenantId` column. Prisma queries are automatically scoped via a query extension using `AsyncLocalStorage` — routes never manually pass `tenantId`.
- **JWT-based auth**: Tokens carry `tenantId`, `role`, `userId`, and `email`. Decoded and verified on every request by `middleware/auth.js`.
- **Cross-tenant leakage is architecturally impossible**: The Prisma extension injects `WHERE tenantId = ?` on every read, write, and delete.
- **Suspended tenants are instantly locked out**: Checked on every API request — no stale sessions.
- **Free Beta trial enforcement**: Free-plan tenants are automatically locked out after 2 months.
- **Platform Admin bypass**: Platform admins (identified by `PLATFORM_ADMIN_EMAIL` or `PlatformAdmin` DB table) skip all tenant and role checks.
- **Passwords**: bcrypt-hashed with cost factor 12. No plain-text passwords stored anywhere.
- **API keys**: Stored as SHA-256 hashes only — raw key shown once at creation.
- **Webhooks**: HMAC-SHA256 signed with tenant-specific secret.
- **Role-based access**: `owner` > `admin` > `employee` — enforced per route via `requireRole` middleware.

---

## Plans & Quotas

| Feature | Free Beta | Starter | Pro |
|---|---|---|---|
| Trial period | 2 months | Ongoing | Ongoing |
| Max bakeries (Free Beta) | 5 concurrent | Unlimited | Unlimited |
| Gemini AI scans / month | 30 | 200 | 1,000 |
| WhatsApp messages / month | 50 | 500 | 2,000 |

> Quotas are enforced automatically by counting `AuditLog` entries — no separate counter table needed.

---

## Public Website Integration

Generate an API key at **Settings → API Keys** inside BakeFlow, then:

### Embed a product catalog widget on any website
```html
<div id="bakeflow-widget"></div>
<script src="https://your-render-url.onrender.com/js/widget.js?key=bfk_YOUR_KEY"></script>
```

### Place orders via REST API
```bash
curl -X POST https://your-render-url.onrender.com/v1/orders \
  -H "X-API-Key: bfk_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Priya Sharma",
    "customerPhone": "+919876543210",
    "customerCity": "Mumbai",
    "items": [
      { "name": "Rasmalai Cake", "qty": 1, "price": 950 }
    ]
  }'
```

### Webhook notifications (order.placed)
Configure your webhook URL in **Settings → Webhooks**. BakeFlow sends HMAC-SHA256 signed `POST` requests to your endpoint when a new order is placed via the public API.

Verify the signature on your server:
```js
const sig = req.headers['x-bakeflow-signature']; // sha256=<hex>
const expected = 'sha256=' + crypto.createHmac('sha256', YOUR_SECRET).update(rawBody).digest('hex');
const isValid = sig === expected;
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 18+ |
| **Framework** | Express.js |
| **Database** | PostgreSQL (Neon — serverless cloud) |
| **ORM** | Prisma 7 |
| **Auth** | Google OAuth 2.0 + JWT (jsonwebtoken) + bcryptjs |
| **AI** | Google Gemini 1.5 Flash (Vision) |
| **Messaging** | Twilio WhatsApp API |
| **Frontend** | Vanilla JS + HTML/CSS (no framework, no build step) |
| **Deployment** | Render (backend + frontend served together) |

---

*Built with ❤️ using Node.js, Express, Prisma, Neon PostgreSQL, Google Gemini, Twilio, and vanilla JS.*
