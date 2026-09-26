# BakeFlow ERP — Tech Stack and Architecture

## 1. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Node.js 18+ | Server-side JavaScript runtime |
| Framework | Express.js 4.x | HTTP routing and middleware |
| Database | PostgreSQL (Neon serverless) | Persistent relational data storage |
| ORM | Prisma 7 | Type-safe database access with query extensions |
| Authentication | Google OAuth 2.0 + JWT + bcrypt (cost 12) | Dual-path auth: Google SSO for owners, username/password for employees |
| AI | Google Gemini 1.5 Flash Vision API | Supplier invoice image scanning |
| Messaging | Twilio WhatsApp API | Invoice delivery + OTP password reset |
| Frontend | Vanilla JS + HTML/CSS | Zero-build, zero-framework SPA |
| Deployment | Render (single service) | Backend serves frontend statically |
| Adapter | PrismaPg + pg Pool | PostgreSQL connection pooling for Neon |

---

## 2. System Architecture

![BakeFlow System Architecture](./images/system_architecture.jpg)

```
┌─────────────────────────────────────────────────────────────┐
│                          BROWSER                            │
│  /           → Main ERP SPA (Vanilla JS)                   │
│  /team       → Employee Session Monitor                     │
│  /signup     → Public Bakery Onboarding Form                │
│  /admin      → Platform Admin Console                       │
└─────────────────────────────────────────────────────────────┘
                              │ HTTPS
┌─────────────────────────────▼─────────────────────────────────┐
│             EXPRESS SERVER (backend/server.js)                 │
│                                                                │
│  Security Layer:                                               │
│  ├── CORS (configurable via CORS_ORIGIN env)                  │
│  ├── Security Headers (XSS, clickjacking, MIME sniffing)      │
│  └── Rate Limiting (20 req/15 min per IP on auth endpoints)   │
│                                                                │
│  Route Layer:                                                  │
│  ├── /api/auth          → Google OAuth + Employee Login + OTP  │
│  ├── /api/ingredients   → Inventory - Ingredients CRUD         │
│  ├── /api/packaging     → Inventory - Packaging CRUD           │
│  ├── /api/products      → Product Catalog CRUD                 │
│  ├── /api/orders        → Custom Orders CRUD                   │
│  ├── /api/sales         → GST Invoices + Twilio WhatsApp       │
│  ├── /api/invoice       → Gemini Vision AI Scanner             │
│  ├── /api/customers     → CRM - Customer CRUD                  │
│  ├── /api/team          → Employee CRUD + Session Log          │
│  ├── /api/audit         → Audit Log viewer                     │
│  ├── /api/settings      → Labour + Overhead + Webhook config   │
│  ├── /api/api-keys      → Public API Key management            │
│  ├── /api/export        → CSV download for all modules         │
│  ├── /api/admin         → Platform Admin (tenant management)   │
│  └── /v1/*              → Public REST API (X-API-Key auth)     │
│                                                                │
│  Middleware Stack:                                             │
│  ├── auth.js            → JWT verification + tenant status     │
│  ├── tenantContext.js   → AsyncLocalStorage tenant scope       │
│  ├── requireRole.js     → Role-based access control            │
│  └── quotaEnforcer.js   → Monthly AI/WhatsApp quota checks     │
└────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼──────────────────────────────────┐
│              PRISMA ORM (sheets/sheetsClient.js)                │
│                                                                 │
│  Query Extension:                                               │
│  └── AsyncLocalStorage injects WHERE tenantId = ? on           │
│      every findMany, findFirst, count, create, update, delete   │
│      No route ever manually passes tenantId                     │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼──────────────────────────────────┐
│              NEON POSTGRESQL (Serverless)                       │
│                                                                 │
│  13 Models: Tenant · User · PlatformAdmin · Ingredient         │
│             Packaging · Product · Order · SalesInvoice         │
│             Customer · Setting · AuditLog · ApiKey             │
│             UserSession                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Multi-Tenancy Architecture

### How It Works

Every database row (except PlatformAdmin) has a `tenantId` column. A Prisma **query extension** in `sheetsClient.js` reads the current tenant from `AsyncLocalStorage` and automatically injects `WHERE tenantId = <id>` on every database operation.

```
Request → JWT Verified (tenantId extracted) → tenantContext.js 
  → AsyncLocalStorage.run({ tenantId }) → Route Handler 
  → Prisma client.findMany() → Query Extension injects WHERE tenantId = X
```

### Benefits
- No route ever manually passes tenantId — isolation is architectural, not per-route
- Cross-tenant data leakage is structurally impossible
- New modules automatically inherit tenant isolation without any extra code

---

## 4. Authentication Flow

### Owner Login (Google OAuth)
```
Browser → Google Sign-In → Google ID Token
       → POST /api/auth/google (token + password)
       → Verify token with Google OAuth2Client
       → Check password against DB (owner) or env (platform admin)
       → Issue JWT (tenantId, role, userId, name, email, picture)
       → Store session in UserSession table
```

### Employee Login (Username + Password)
```
Browser → POST /api/auth/employee (username + password)
       → Lookup user in DB by username + tenantId
       → bcrypt.compare() password
       → Issue JWT (tenantId, role, userId, name)
       → Store session in UserSession table
```

### OTP Password Reset (WhatsApp)
```
POST /api/auth/otp-request (email)
  → Generate 6-digit OTP, store in User.otpCode with 10-min expiry
  → Send OTP via Twilio WhatsApp

POST /api/auth/otp-verify (email + otp + newPassword)
  → Verify OTP validity and expiry
  → Hash new password with bcrypt(cost=12)
  → Update User.password, clear OTP fields
```

---

## 5. Security Architecture

| Threat | Protection |
|--------|-----------|
| Brute-force on auth | In-memory sliding window rate limiter: 20 req/15 min per IP |
| Cross-tenant data leak | Prisma query extension auto-scopes ALL queries to tenantId |
| JWT tampering | HS256 signature with min 32-char secret; 7d expiry |
| Suspended tenant access | Auth middleware checks tenant.status on EVERY request |
| Free-tier abuse | 2-month trial auto-lock in auth middleware |
| API key leakage | API keys stored as SHA-256 hashes only; raw key shown once |
| Webhook forgery | HMAC-SHA256 signature in X-BakeFlow-Signature header |
| XSS | X-XSS-Protection + X-Content-Type-Options headers |
| Clickjacking | X-Frame-Options: SAMEORIGIN |
| MIME sniffing | X-Content-Type-Options: nosniff |

---

## 6. External Services

| Service | Integration | Usage |
|---------|-------------|-------|
| Google OAuth | google-auth-library | Owner sign-in and identity verification |
| Google Gemini API | Direct REST API (fetch) | Supplier invoice image scanning (Vision) |
| Twilio | twilio npm SDK | WhatsApp invoice delivery + OTP codes |
| Neon PostgreSQL | pg + @prisma/adapter-pg | Serverless Postgres with connection pooling |
| Render | PaaS | Single-service Node.js hosting |

---

## 7. Frontend Architecture

The frontend is a single-page application with **zero build step and zero framework**:

```
frontend/
├── index.html          Main ERP SPA (all modules in one HTML)
├── admin/index.html    Platform Admin Console
├── team.html           Employee Session Monitor
├── signup.html         Public Onboarding Form
├── js/
│   ├── app.js          All ERP module logic (~4,000 lines of vanilla JS)
│   ├── api.js          API client helpers (fetch wrappers with auth headers)
│   └── widget.js       Embeddable product catalog widget
└── css/
    └── styles.css      Global styles
```

**Frontend routing** is a client-side hash-based router. All unknown routes fall back to `index.html` via Express SPA fallback.

---

## 8. Public API and Webhooks

### REST API (/v1/*)
Authenticated via `X-API-Key` header. Keys are stored as SHA-256 hashes in the DB. Any external website can:
- `GET /v1/products` — Get product catalog
- `GET /v1/stock` — Get ingredient + packaging stock levels
- `POST /v1/orders` — Place an order (creates a SalesInvoice)
- `GET /v1/orders/:id/status` — Check order status

### Webhooks
On `order.placed` events, BakeFlow fires a `POST` request to the tenant's configured webhook URL. The body is HMAC-SHA256 signed with the tenant's secret. External systems verify authenticity using the `X-BakeFlow-Signature` header.

### Embeddable Widget
A simple `<script>` tag that inserts a live product catalog into any webpage, styled with the bakery's branding.
