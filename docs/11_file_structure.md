# BakeFlow ERP — Project File Structure

## Complete Directory Tree

```
BakeFlow/
│
├── README.md                          # Project overview and quick start
├── DATABASE_SETUP.md                  # Database setup instructions
├── DEPLOYMENT_CHECKLIST.md           # Step-by-step deployment guide
├── .gitignore                         # Git ignore rules
│
├── docs/                              # 📁 Project Documentation (this folder)
│   ├── 01_project_overview.md         # Introduction, goals, modules, plans
│   ├── 02_architecture_and_tech_stack.md  # Tech stack, system architecture
│   ├── 03_er_diagram.md               # Entity Relationship Diagram (all 13 models)
│   ├── 04_block_diagram.md            # System block diagrams + data flows
│   ├── 05_api_reference.md            # Complete API endpoint reference
│   ├── 06_security_design.md          # Security architecture and practices
│   ├── 07_data_flow_diagrams.md       # DFD Level 0, 1, 2
│   ├── 08_roles_and_permissions.md    # RBAC permissions matrix
│   ├── 09_deployment_guide.md         # Setup and deployment instructions
│   ├── 10_module_specifications.md    # Detailed module specs
│   ├── 11_file_structure.md           # This file — project structure
│   └── 12_testing_and_quality.md      # Test scripts and quality notes
│
├── backend/                           # 📁 Node.js + Express Backend
│   │
│   ├── server.js                      # ⚡ Entry point: Express app, middleware, routing
│   ├── package.json                   # Dependencies and npm scripts
│   ├── package-lock.json              # Lockfile
│   ├── prisma.config.js               # Prisma configuration
│   ├── .env                           # Environment variables (NOT committed)
│   ├── .env.example                   # Template for environment variables
│   │
│   ├── prisma/
│   │   └── schema.prisma              # 🗄️ Database schema (13 models)
│   │
│   ├── middleware/
│   │   ├── auth.js                    # JWT verification + tenant status check
│   │   ├── tenantContext.js           # AsyncLocalStorage tenant scope injection
│   │   ├── requireRole.js             # Role-based access control middleware
│   │   └── quotaEnforcer.js          # Monthly AI/WhatsApp quota enforcement
│   │
│   ├── routes/
│   │   ├── auth.js                    # 🔐 Google OAuth + employee login + OTP
│   │   ├── ingredients.js             # 🥣 Ingredients CRUD + stock management
│   │   ├── packaging.js               # 📦 Packaging CRUD + stock management
│   │   ├── products.js                # 🎂 Product catalog CRUD
│   │   ├── orders.js                  # 📋 Custom orders CRUD
│   │   ├── sales.js                   # 🧾 GST invoices + WhatsApp delivery
│   │   ├── invoice.js                 # 🤖 Gemini Vision AI invoice scanner
│   │   ├── customers.js               # 👥 CRM customer management
│   │   ├── team.js                    # 👤 Employee management + session log
│   │   ├── audit.js                   # 📝 Audit log viewer
│   │   ├── settings.js                # ⚙️ Labour/overhead/webhook settings
│   │   ├── apiKeys.js                 # 🔑 API key generation/management
│   │   ├── export.js                  # 📊 CSV data export
│   │   ├── admin.js                   # 🏢 Platform admin console
│   │   └── publicApi.js               # 🌐 Public REST API + webhooks
│   │
│   ├── sheets/
│   │   └── sheetsClient.js            # 🔌 Prisma wrapper with tenant-scoped extension
│   │                                     (also contains default seed data)
│   │
│   ├── test-admin.js                  # Test script: admin operations
│   ├── test-integration.js            # Test script: integration tests
│   └── test-isolation.js             # Test script: tenant isolation tests
│
└── frontend/                          # 📁 Vanilla JS + HTML Frontend
    │
    ├── index.html                     # 🏠 Main ERP SPA (~100KB, all modules in one file)
    ├── signup.html                    # 📝 Public bakery onboarding form
    ├── team.html                      # 👥 Employee session monitor page
    ├── vercel.json                    # Vercel deployment config (alternative to Render)
    │
    ├── admin/
    │   └── index.html                 # 🛡️ Platform admin console SPA
    │
    ├── js/
    │   ├── app.js                     # 📱 All ERP module logic (~4,000 lines)
    │   │                                 (inventory, billing, CRM, team, reports, etc.)
    │   ├── api.js                     # 🔌 API client helpers (fetch wrappers)
    │   └── widget.js                  # 🌐 Embeddable product catalog widget
    │
    └── css/
        └── styles.css                 # 🎨 Global styles
```

---

## Key File Descriptions

### backend/server.js
The Express application entry point. Responsibilities:
- Environment variable validation at startup
- Security headers (XSS, clickjacking, MIME sniffing)
- CORS configuration
- In-memory rate limiter (sliding window)
- Mount all route modules
- Static file serving (frontend/)
- SPA fallback routing
- Global error handler
- Database connection bootstrap

### backend/prisma/schema.prisma
The single source of truth for the database schema. Defines all 13 models with their fields, types, relations, and constraints. Managed by Prisma ORM.

### backend/sheets/sheetsClient.js
The Prisma ORM client wrapper with critical features:
- Prisma client initialization with PgAdapter for Neon
- **Tenant-scoped query extension**: automatically injects `tenantId` into ALL database operations via AsyncLocalStorage
- Default seed data arrays (26 ingredients, 16 packaging, 12 products)
- Helper methods: `getAll()`, `append()`, `updateRow()`, `deleteRow()`, `addLog()`, `nextInvoiceNumber()`

### backend/middleware/auth.js
JWT verification middleware applied globally to all `/api/*` routes (except `/api/auth`):
- Validates `Bearer <token>` format
- Verifies JWT signature with `JWT_SECRET`
- Checks tenant status (blocks suspended/pending tenants in real-time)
- Enforces 2-month Free Beta trial expiry

### backend/middleware/tenantContext.js
Sets up `AsyncLocalStorage` with the current `tenantId` and `role` extracted from the JWT. This context is then read by the Prisma query extension to scope all DB queries.

### backend/middleware/quotaEnforcer.js
Pre-route middleware for quota-limited features:
- Counts monthly `AuditLog` entries for `SCAN_INVOICE` and `SEND_WHATSAPP` actions
- Compares against plan limits from `PLAN_LIMITS` object
- Returns HTTP 402 if quota exceeded

### backend/routes/publicApi.js
The public-facing REST API:
- API key authentication via SHA-256 hash matching
- Tenant-scoped data access without JWT
- Webhook firing (fire-and-forget, HMAC-signed)
- Endpoint for external website order placement

### frontend/js/app.js
The core of the frontend SPA (~4,000 lines of vanilla JavaScript). Contains:
- Client-side hash router
- All module UIs (inventory, billing, CRM, team, reports, etc.)
- Google Sign-In integration
- State management via localStorage
- Table rendering, form handling, modal management

### frontend/js/api.js
Fetch wrapper utilities that automatically:
- Attach `Authorization: Bearer <JWT>` header
- Attach `X-Employee-Name` and `X-Employee-Email` headers
- Handle common error responses

### frontend/js/widget.js
Self-contained embeddable script. When loaded on an external site with a bakery's API key, it fetches the product catalog and renders a styled product grid.

---

## Dependencies

### Backend (production)
| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.19.2 | HTTP server framework |
| @prisma/client | ^7.8.0 | Database ORM |
| @prisma/adapter-pg | ^7.8.0 | PostgreSQL adapter for Prisma |
| prisma | ^7.8.0 | Prisma CLI (migrations, codegen) |
| pg | ^8.22.0 | PostgreSQL client |
| jsonwebtoken | ^9.0.3 | JWT signing and verification |
| bcryptjs | ^3.0.3 | Password hashing |
| cors | ^2.8.5 | CORS middleware |
| dotenv | ^16.4.5 | Environment variable loading |
| google-auth-library | ^10.9.0 | Google OAuth token verification |
| googleapis | ^144.0.0 | Google APIs client |
| @google/generative-ai | ^0.21.0 | Gemini AI SDK |
| twilio | ^5.3.3 | Twilio WhatsApp API |

### Backend (development)
| Package | Version | Purpose |
|---------|---------|---------|
| nodemon | ^3.1.4 | Auto-restart on file changes |

### Frontend
No dependencies. Pure HTML, CSS, and vanilla JavaScript.
