# BakeFlow ERP — Security Design

## 1. Security Overview

BakeFlow implements a defense-in-depth approach with multiple independent security layers. No single failure can compromise tenant data or system integrity.

---

## 2. Authentication Architecture

### Dual Authentication Paths

| User Type | Method | Token |
|-----------|--------|-------|
| Bakery Owner | Google OAuth 2.0 ID Token + Password | JWT (7 days) |
| Employee | Username + bcrypt password | JWT (7 days) |
| Platform Admin | Google OAuth 2.0 ID Token + ADMIN_PASSWORD | JWT (7 days) |
| Public API | SHA-256 API Key | No session token |

### JWT Token Payload
```json
{
  "role": "owner | admin | employee | platform_admin",
  "name": "User Name",
  "email": "user@example.com",
  "tenantId": "uuid",
  "userId": "uuid",
  "iat": 1234567890,
  "exp": 1234567890
}
```

### Password Security
- bcrypt with cost factor 12 (industry standard)
- Production environment validates JWT_SECRET is 32+ characters
- Production environment blocks default/insecure ADMIN_PASSWORD values
- OTP for password reset: 6-digit numeric, 10-minute expiry, stored hashed? (plain in DB for comparison — note: improvement opportunity)

---

## 3. Rate Limiting

Custom in-memory sliding-window rate limiter (no external package):

```
Auth endpoints: 20 requests per 15 minutes per IP address
```

Implementation: `Map<IP, timestamp[]>` cleaned every 5 minutes. Prevents brute-force login attacks without requiring Redis.

---

## 4. Multi-Tenant Data Isolation

### Mechanism
Every database table (except PlatformAdmin) has a `tenantId` column (foreign key to Tenant).

A Prisma **query extension** in `sheetsClient.js` reads `tenantId` from `AsyncLocalStorage` and automatically appends `WHERE tenantId = X` to every:
- `findMany()`
- `findFirst()`
- `count()`
- `create()` (sets tenantId on the data)
- `update()`
- `deleteMany()`

### Why This Is Architecturally Secure
- **No route-level bypass**: No route manually passes tenantId — it's always injected automatically
- **Extension-level enforcement**: Cannot be accidentally skipped in a new route
- **Even admin routes are scoped**: Platform Admin routes bypass JWT auth but NOT tenant scoping (they use direct `db.prisma.*` calls with explicit tenant filters)

---

## 5. Role-Based Access Control (RBAC)

| Role | Permissions |
|------|-------------|
| `owner` | Full access to all ERP modules + team management |
| `admin` | Same as owner except cannot manage other admins |
| `employee` | Inventory, billing, CRM — no team management, no export |
| `platform_admin` | Platform Admin console only; cannot access ERP modules |

Implementation via `requireRole.js` middleware:
```javascript
router.use(requireRole(['admin', 'owner'])); // Applied to /api/team, /api/export
```

---

## 6. Tenant Lifecycle Controls

### Suspended Tenants
Auth middleware checks `tenant.status === 'suspended'` on **every authenticated request** (not just login). A suspended bakery is locked out in real-time — no stale JWT sessions are valid.

### Free Beta Enforcement
Auth middleware checks if `tenant.plan === 'free'` and the tenant was created more than 2 months ago. If so, the request is rejected with a 403 error explaining the trial period has ended.

### Pending Approval
Tenants in `status: 'pending'` (self-serve onboarding requests) cannot authenticate. They await platform admin approval.

---

## 7. API Key Security

- API keys are **never stored in plaintext**
- Raw key is generated with `crypto.randomBytes(32).toString('hex')` and shown **once** to the user
- Stored as SHA-256 hash: `crypto.createHash('sha256').update(rawKey).digest('hex')`
- On authentication: incoming key is hashed and matched against stored hash
- Compromise of the database reveals no usable API keys

---

## 8. Webhook Security

Outgoing webhook payloads are signed with HMAC-SHA256:

```javascript
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
// Sent as: X-BakeFlow-Signature: sha256=<sig>
```

Receiving systems verify authenticity by computing the same HMAC with the shared secret. Protects against forged webhook events.

---

## 9. HTTP Security Headers

Applied globally to every response:

| Header | Value | Protection |
|--------|-------|-----------|
| X-Content-Type-Options | nosniff | MIME type sniffing attacks |
| X-Frame-Options | SAMEORIGIN | Clickjacking |
| X-XSS-Protection | 1; mode=block | XSS (legacy browsers) |
| Referrer-Policy | strict-origin-when-cross-origin | Referrer information leakage |
| Permissions-Policy | geolocation=(), camera=(self), microphone=() | Unnecessary capability access |

---

## 10. CORS Configuration

Configurable via `CORS_ORIGIN` environment variable:
- **Production**: Restricted to specified domains (comma-separated list)
- **Development**: All origins allowed (when env var not set)

Allowed HTTP methods: `GET, POST, PUT, DELETE, OPTIONS`

Custom headers allowed: `Content-Type, Authorization, X-API-Key, X-Employee-Name, X-Employee-Email, X-Google-Token`

---

## 11. Quota Enforcement

Plan-based monthly limits enforced server-side for API-cost features:

| Feature | Free | Starter | Pro |
|---------|------|---------|-----|
| Gemini AI Scans | 30/mo | 200/mo | 1,000/mo |
| WhatsApp Messages | 50/mo | 500/mo | 2,000/mo |

Quota is calculated by counting `AuditLog` records with specific action types (`SCAN_INVOICE`, `SEND_WHATSAPP`) within the current calendar month. No separate counter — self-auditing by design.

Exceeded quota returns `HTTP 402 Payment Required` with a clear error message.

---

## 12. Data Privacy Considerations

| Data Type | Handling |
|-----------|---------|
| Passwords | bcrypt(cost=12) — never stored or logged in plaintext |
| API Keys | SHA-256 hash only — raw key shown once, never retrievable |
| OTP codes | Stored temporarily in `User.otpCode`, cleared after verification |
| JWT secrets | Min 32 chars enforced in production |
| Session data | IP address + user agent stored for audit purposes |
| Audit logs | Immutable — no delete/update API; permanent record of all actions |

---

## 13. Known Limitations and Improvement Opportunities

| Item | Current State | Recommended Improvement |
|------|--------------|------------------------|
| OTP storage | Plaintext 6-digit code in DB | Hash the OTP before storing |
| Rate limiting | In-memory (lost on restart) | Use Redis for distributed rate limiting |
| JWT revocation | Not implemented (no blocklist) | Add Redis-backed JWT blocklist for instant revocation |
| Audit log mutability | No delete endpoint (relies on trust) | Add database-level trigger to prevent modification |
| HTTPS enforcement | Depends on Render/proxy | Add HSTS header for strict HTTPS enforcement |
