# BakeFlow ERP — API Reference

## Authentication

All protected endpoints require a `Bearer JWT` token in the `Authorization` header.
- Owner/Admin: Google OAuth + password
- Employee: username + password (bcrypt)
- Platform Admin: Google OAuth + ADMIN_PASSWORD
- Public API: `X-API-Key` header (SHA-256 verified)

---

## Authentication Endpoints (/api/auth)

> Rate limited: 20 requests per 15 minutes per IP

### POST /api/auth/google
Owner login via Google OAuth + password.

**Request:**
```json
{ "token": "<Google ID Token>", "password": "<bakery password>" }
```
**Response:**
```json
{
  "success": true,
  "token": "<JWT>",
  "user": { "role": "owner", "name": "...", "email": "...", "tenantId": "..." },
  "sessionId": "<UUID>"
}
```

---

### POST /api/auth/employee
Employee login via username + password.

**Request:**
```json
{ "username": "emp1", "password": "pass", "tenantId": "optional-uuid" }
```
**Response:** Same structure as /google login.

---

### GET /api/auth/employees
List all employee names for the login page (DB-first, .env fallback).

**Headers:** `X-Google-Token: <owner Google ID token>`

---

### GET /api/auth/config
Returns public config for the frontend (no auth required).

**Response:**
```json
{ "googleClientId": "...", "businessName": "BakeFlow", "businessPhone": "..." }
```

---

### POST /api/auth/request-access
Public self-serve onboarding form submission.

**Request:**
```json
{ "name": "My Bakery", "email": "owner@gmail.com", "googleId": "...", "phone": "9876543210", "password": "secure123" }
```
**Response:** `{ "success": true, "message": "..." }`

---

### POST /api/auth/otp-request
Send 6-digit OTP to owner's WhatsApp for password reset.

**Request:** `{ "email": "owner@gmail.com" }`

---

### POST /api/auth/otp-verify
Verify OTP and set new password.

**Request:** `{ "email": "...", "otp": "123456", "password": "newpass" }`

---

## Ingredients (/api/ingredients)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | List all active ingredients |
| POST | / | Add new ingredient |
| PUT | /:id/rate | Update ingredient rate (with history) |
| PUT | /:id/stock | Update stock quantity and min alert |
| DELETE | /:id | Soft delete ingredient |
| POST | /:id/restore | Restore soft-deleted ingredient |
| DELETE | /:id/hard | Permanently delete |
| POST | /:id/increment | Atomically add to stock quantity |
| POST | /:id/decrement | Atomically subtract from stock quantity |

**POST / Body:**
```json
{ "name": "All-Purpose Flour", "cat": "Dry", "unit": "kg", "rate": 48 }
```

---

## Packaging (/api/packaging)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | List all active packaging |
| POST | / | Add new packaging item |
| PUT | /:id/rate | Update rate |
| PUT | /:id/stock | Update stock + min alert |
| DELETE | /:id | Soft delete |
| POST | /:id/restore | Restore deleted |
| DELETE | /:id/hard | Hard delete |
| POST | /:id/increment | Increment stock |
| POST | /:id/decrement | Decrement stock |

---

## Products (/api/products)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | List all active products |
| POST | / | Add product (auto-calculates margin) |
| DELETE | /:id | Soft delete |
| POST | /:id/restore | Restore deleted |
| DELETE | /:id/hard | Hard delete |

**POST / Body:**
```json
{ "name": "Rasmalai Cake", "cat": "Fusion Cake", "emoji": "🎂", "cost": 520, "sell": 950 }
```

---

## Custom Orders (/api/orders)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | List all orders |
| POST | / | Create order |
| PUT | /:id | Update order |
| DELETE | /:id | Soft delete |
| POST | /:id/restore | Restore |

---

## Sales / Invoices (/api/sales)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | List all invoices (newest first) |
| POST | / | Create GST invoice |
| DELETE | /:id | Soft delete invoice |
| POST | /:id/send-whatsapp | Send invoice via Twilio WhatsApp (quota-enforced) |
| POST | /:id/deduct-inventory | Mark inventory as deducted |

**POST / Body:**
```json
{
  "customerName": "Priya Sharma",
  "customerPhone": "9876543210",
  "customerCity": "Mumbai",
  "customerId": "cust-uuid",
  "items": [{ "name": "Rasmalai Cake", "qty": 1, "unitPrice": 950 }],
  "subtotal": 950,
  "discountAmt": 50,
  "gstPct": 5,
  "gstAmt": 45,
  "totalAmount": 945,
  "paymentMethod": "UPI",
  "notes": "Birthday cake"
}
```

---

## AI Invoice Scanner (/api/invoice)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /models | List available Gemini models (debug) |
| POST | /scan | Scan supplier invoice image with Gemini Vision (quota-enforced) |

**POST /scan Body:**
```json
{ "image": "<base64-encoded-image>", "mimeType": "image/jpeg" }
```

**Response:**
```json
{
  "items": [
    { "name": "All-Purpose Flour", "quantity": 10, "unit": "kg", "unitPrice": 48, "totalPrice": 480 }
  ],
  "count": 1
}
```

---

## Customers / CRM (/api/customers)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | List all customers (with self-healing stats recalculation) |
| POST | / | Add customer |
| PUT | /:id | Update customer details |
| DELETE | /:id | Soft delete customer |

**POST / Body:**
```json
{
  "name": "Priya Sharma",
  "phone": "9876543210",
  "email": "priya@example.com",
  "city": "Mumbai",
  "address": "...",
  "notes": "Prefers eggless cakes"
}
```

---

## Team Management (/api/team)

> Requires owner or admin role

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | List all users (employees + owner) |
| POST | / | Create employee account |
| PUT | /:id | Update employee (name, role, active, password reset) |
| DELETE | /:id | Soft delete employee |
| GET | /sessions | All login sessions (last 90 days) |
| GET | /sessions/:userId | Sessions for a specific employee |
| POST | /logout | Record logout time for session |
| POST | /change-own-password | Change own password |

---

## Audit Log (/api/audit)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | Get all audit log entries for tenant |

---

## Settings (/api/settings)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | Get all settings for tenant |
| POST | / | Upsert a setting (key + value JSON) |

**Known setting keys:** `labour`, `overhead`, `webhook`

**Labour setting value:**
```json
{
  "rates": { "head": 200, "deco": 180, "pack": 100, "delivery": 150, "min": 100 },
  "times": { "prep": 30, "bake": 45, "decoSimple": 30, "decoComplex": 120, "pack": 15 }
}
```

---

## API Keys (/api/api-keys)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | List all API keys (masked) |
| POST | / | Generate new API key (returned raw once only) |
| DELETE | /:id | Revoke API key |

---

## Data Export (/api/export)

> Requires owner or admin role. Returns CSV files.

| Method | Endpoint | Output File |
|--------|----------|-------------|
| GET | /ingredients | ingredients_export.csv |
| GET | /packaging | packaging_export.csv |
| GET | /products | products_export.csv |
| GET | /sales | sales_export.csv |
| GET | /customers | customers_export.csv |

---

## Platform Admin (/api/admin)

> Requires platform_admin role (Google account matching PLATFORM_ADMIN_EMAIL)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /tenants | List all bakery tenants with stats |
| POST | /tenants | Onboard a new bakery tenant |
| PUT | /tenants/:id/suspend | Suspend bakery |
| PUT | /tenants/:id/reactivate | Reactivate bakery |
| PUT | /tenants/:id/approve | Approve pending onboarding request |
| GET | /metrics | Platform totals (tenant count, invoice count, etc.) |
| GET | /stats | Full platform usage stats + per-bakery API cost estimates |

---

## Public REST API (/v1)

> Authenticated via `X-API-Key` header. No JWT required.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /products | Product catalog for this bakery |
| GET | /stock | Ingredient + packaging stock levels |
| POST | /orders | Place an order (creates SalesInvoice + fires webhook) |
| GET | /orders/:invoiceNumber/status | Check order status |

**POST /orders Body:**
```json
{
  "customerName": "Priya Sharma",
  "customerPhone": "9876543210",
  "customerCity": "Mumbai",
  "items": [{ "name": "Rasmalai Cake", "price": 950, "qty": 1 }],
  "notes": "Birthday order"
}
```

---

## Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Server + DB status check |
| GET | /api/gemini-status | Gemini API key diagnostic with model testing |

---

## Webhook Events

BakeFlow fires `POST` requests to the tenant's configured webhook URL.

**Event: order.placed**
```json
{
  "event": "order.placed",
  "tenantId": "uuid",
  "timestamp": 1234567890,
  "data": {
    "invoiceNumber": "INV-0042",
    "customerName": "Priya Sharma",
    "totalAmount": 950,
    "items": [...]
  }
}
```

**Verification:** Check `X-BakeFlow-Signature: sha256=<hmac>` using the webhook secret.
