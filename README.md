# BakeFlow ERP

A **production-ready, multi-tenant SaaS ERP** built for bakery businesses. Covers the full business lifecycle — inventory, billing, CRM, AI automation, team management, and a public API for website integration.

Live on Render · PostgreSQL on Neon · Google OAuth · Twilio WhatsApp · Gemini AI

---

## What It Does

| Module | Description |
|---|---|
| **Inventory** | Ingredients + packaging — stock tracking, rate history, low-stock alerts, atomic increment/decrement |
| **Products & Costing** | Product catalog with auto-calculated cost, selling price, and profit margin |
| **Sales & GST Invoices** | Create GST-ready invoices, apply discounts, send to customer via WhatsApp (Twilio) |
| **AI Invoice Scanner** | Photograph a supplier invoice → Gemini Vision extracts all line items automatically |
| **CRM** | Full customer history — order count, total spend, last order date — self-healing stats |
| **Custom Orders** | Track and manage custom cake orders with delivery scheduling |
| **Team Management** | Employee accounts (username + password), role-based access, login session history |
| **Audit Log** | Immutable trail of every action by every employee across all modules |
| **Reports** | Revenue trends, top products, period-over-period comparisons |
| **Data Export** | CSV download for ingredients, packaging, products, sales, and customers |
| **Public REST API** | `/v1/products`, `/v1/stock`, `/v1/orders` — API-key authenticated for website integration |
| **Embeddable Widget** | Drop a live product catalog on any external website with a single `<script>` tag |
| **Webhooks** | HMAC-SHA256 signed `POST` notifications on `order.placed` events |
| **Platform Admin Console** | Separate `/admin` portal to manage all bakery tenants, approve signups, view usage + API cost estimates |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 18+ |
| **Framework** | Express.js |
| **Database** | PostgreSQL (Neon — serverless) |
| **ORM** | Prisma 7 |
| **Auth** | Google OAuth 2.0 + JWT + bcrypt (cost 12) |
| **AI** | Google Gemini 1.5 Flash (Vision API) |
| **Messaging** | Twilio WhatsApp API |
| **Frontend** | Vanilla JS + HTML/CSS — no framework, no build step |
| **Deployment** | Render (single service — backend serves frontend statically) |

---

## Architecture

```
Browser
  ├── /              → Main ERP SPA (vanilla JS)
  ├── /team          → Employee access monitor
  ├── /signup        → Public bakery onboarding form
  └── /admin         → Platform admin console

Express Server (backend/server.js)
  ├── Rate limiting on auth routes    (20 req / 15 min per IP)
  ├── Security headers                (XSS, clickjacking, MIME sniffing)
  ├── Configurable CORS               (via CORS_ORIGIN env var)
  ├── /api/auth      → Google OAuth + employee login + WhatsApp OTP password reset
  ├── /api/team      → Employee CRUD + session log
  ├── /api/sales     → GST invoices + Twilio WhatsApp
  ├── /api/invoice   → Gemini Vision AI invoice scan
  ├── /api/admin     → Platform admin (tenant management, metrics)
  ├── /api/export    → CSV downloads
  ├── /v1/*          → Public REST API (X-API-Key auth)
  └── ...12 more route modules

Prisma ORM (sheets/sheetsClient.js)
  └── Query extension via AsyncLocalStorage — every query auto-scoped to tenantId
      No route ever manually passes tenantId — tenant isolation is architectural

Neon PostgreSQL
  └── 13 models: Tenant · User · PlatformAdmin · Ingredient · Packaging · Product
                 Order · SalesInvoice · Customer · Setting · AuditLog · ApiKey · UserSession
```

---

## Multi-Tenancy & Security

- **Tenant isolation**: Prisma query extension injects `WHERE tenantId = ?` on every read/write automatically — cross-tenant data leakage is architecturally impossible
- **JWT auth**: Tokens carry `tenantId`, `role`, `userId` — verified on every request
- **Role-based access**: `owner` > `admin` > `employee` — enforced per route via middleware
- **Suspended tenants**: Locked out in real-time on every API call — no stale sessions
- **API keys**: Stored as SHA-256 hashes only — raw key shown once at creation
- **Webhooks**: HMAC-SHA256 signed with per-tenant secret
- **Rate limiting**: Built-in sliding window on auth endpoints (no external package)
- **Free Beta enforcement**: Free-plan tenants auto-locked after 2 months

---

## Running Locally

**Prerequisites**: Node.js 18+, a free [Neon](https://console.neon.tech) PostgreSQL database, a [Google Cloud](https://console.cloud.google.com) OAuth Client ID.

```bash
git clone https://github.com/kg3478/BakeFlow.git
cd BakeFlow/backend
npm install
cp .env.example .env        # Fill in your values
npx prisma db push          # Create all DB tables
npm start                   # http://localhost:3000
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth 2.0 Client ID |
| `JWT_SECRET` | ✅ | Min 32-char random string |
| `ADMIN_PASSWORD` | ✅ | Owner login password + platform admin password |
| `PLATFORM_ADMIN_EMAIL` | ✅ | Google email that gets `/admin` access |
| `GEMINI_API_KEY` | ⚠️ | For AI invoice scanning |
| `TWILIO_ACCOUNT_SID` | ⚠️ | For WhatsApp delivery + OTP |
| `TWILIO_AUTH_TOKEN` | ⚠️ | Twilio auth token |
| `TWILIO_WHATSAPP_FROM` | ⚠️ | Twilio WhatsApp sender number |
| `CORS_ORIGIN` | Optional | Restrict API to specific domains |

> `⚠️` = that feature won't work without it; everything else functions normally.

---

## Deploying to Render

| Setting | Value |
|---|---|
| **Root Directory** | `backend` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `node server.js` |

Add all environment variables in the Render dashboard. See [`DEPLOYMENT_CHECKLIST.md`](DEPLOYMENT_CHECKLIST.md) for the full step-by-step guide including Google OAuth setup and troubleshooting.

---

## Plans & Quotas

| Plan | AI Scans / month | WhatsApp / month | Max Bakeries |
|---|---|---|---|
| Free Beta | 30 | 50 | 5 concurrent |
| Starter | 200 | 500 | Unlimited |
| Pro | 1,000 | 2,000 | Unlimited |

Quotas enforced by counting `AuditLog` entries — no separate counter table.

---

## Project Structure

```
BakeFlow/
├── backend/
│   ├── server.js              # Entry point — rate limiting, CORS, security headers, routing
│   ├── prisma/schema.prisma   # Full data model (13 models)
│   ├── middleware/            # auth.js · requireRole.js · tenantContext.js · quotaEnforcer.js
│   ├── routes/                # 15 route files covering every business module
│   └── sheets/sheetsClient.js # Prisma ORM wrapper with tenant-scoped query extension
├── frontend/
│   ├── index.html             # Main ERP SPA
│   ├── admin/index.html       # Platform admin console
│   ├── team.html              # Employee management
│   ├── signup.html            # Public onboarding form
│   └── js/
│       ├── app.js             # All ERP module logic (~4,000 lines)
│       ├── api.js             # API client helpers
│       └── widget.js          # Embeddable product catalog widget
├── docs/                      # Comprehensive technical documentation & system diagrams
│   ├── 01_project_overview.md
│   ├── 02_architecture_and_tech_stack.md
│   ├── 03_er_diagram.md
│   ├── 04_block_diagram.md
│   ├── 05_api_reference.md
│   ├── 06_security_design.md
│   ├── 07_data_flow_diagrams.md
│   ├── 08_roles_and_permissions.md
│   ├── 09_deployment_guide.md
│   ├── 10_module_specifications.md
│   ├── 11_file_structure.md
│   ├── 12_testing_and_quality.md
│   ├── 13_user_journey.md
│   ├── images/                # High-resolution architectural & flow diagram graphics
│   └── README.md              # Documentation index and visual gallery
├── DEPLOYMENT_CHECKLIST.md
├── DATABASE_SETUP.md
└── README.md
```

---

## Comprehensive Documentation Suite

Full technical specifications, diagrams, and operational guides are documented in the [`docs/`](./docs/README.md) directory:

| Document | Topic | Description |
|---|---|---|
| [**01. Overview**](./docs/01_project_overview.md) | System Overview | Goals, target personas, business modules, pricing tiers |
| [**02. Architecture**](./docs/02_architecture_and_tech_stack.md) | Technical Stack | Layered architecture, multi-tenancy model, security layers |
| [**03. ER Diagram**](./docs/03_er_diagram.md) | Database Design | 13 PostgreSQL tables, constraints, schema visuals |
| [**04. Block Diagram**](./docs/04_block_diagram.md) | Block Diagram | System block diagram, module blocks, sync/async flows |
| [**05. API Reference**](./docs/05_api_reference.md) | REST Endpoints | Complete endpoint documentation, query params, payloads |
| [**06. Security Design**](./docs/06_security_design.md) | Security & Isolation | Tenant scoping, RBAC matrix, rate limits, HMAC signatures |
| [**07. Data Flow Diagrams**](./docs/07_data_flow_diagrams.md) | Data Flows | DFD Level 0, Level 1, Level 2 for AI scan & POS billing |
| [**08. Roles & Permissions**](./docs/08_roles_and_permissions.md) | Authorization | Complete 4-role permission grid |
| [**09. Deployment Guide**](./docs/09_deployment_guide.md) | DevOps & Hosting | Render setup, Neon PostgreSQL, environment variables |
| [**10. Module Specifications**](./docs/10_module_specifications.md) | Business Modules | Detailed specifications for all 13 ERP modules |
| [**11. File Structure**](./docs/11_file_structure.md) | Codebase Tree | Exhaustive file-by-file directory reference |
| [**12. Testing & Quality**](./docs/12_testing_and_quality.md) | Testing & Reliability | Manual checklists, self-healing audits, test scripts |
| [**13. User Journey**](./docs/13_user_journey.md) | User Journeys | Step-by-step persona workflows for Owner, Baker, & Customer |

Check out the [Documentation Index & Visual Gallery](./docs/README.md) for full details and visual diagrams.

---

*Node.js · Express · Prisma · PostgreSQL · Google OAuth · Gemini AI · Twilio · Vanilla JS*
