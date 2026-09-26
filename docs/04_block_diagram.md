# BakeFlow ERP — Block Diagram

## 1. High-Level System Block Diagram

![BakeFlow Technical Architecture Block Diagram](./images/block_diagram.jpg)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL ACTORS                                │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  Bakery Owner│  │  Employee    │  │Platform Admin│  │ External   │  │
│  │  (Google SSO)│  │  (username   │  │  (Google SSO │  │ Website    │  │
│  │              │  │  + password) │  │  + password) │  │  (API Key) │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  │
└─────────┼─────────────────┼─────────────────┼────────────────┼──────────┘
          │                 │                 │                │
          │                 │ HTTPS           │                │
┌─────────▼─────────────────▼─────────────────▼────────────────▼──────────┐
│                         BAKEFLOW WEB SERVER                              │
│                       (Node.js + Express.js)                             │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                       SECURITY LAYER                               │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │  │
│  │  │   CORS       │  │ HTTP Headers │  │  Rate Limiter           │  │  │
│  │  │  Whitelist   │  │  XSS/Frame   │  │  20 req/15min per IP   │  │  │
│  │  └──────────────┘  └──────────────┘  └─────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                │                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                     MIDDLEWARE LAYER                                │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │  │
│  │  │  JWT Auth    │  │  Tenant      │  │  Role Guard              │  │  │
│  │  │  Middleware  │  │  Context     │  │  (owner/admin/employee)  │  │  │
│  │  │  auth.js     │  │  tenantCtx.js│  │  requireRole.js          │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │  Quota Enforcer (quotaEnforcer.js)                           │  │  │
│  │  │  Monthly limits: Gemini scans + Twilio WhatsApp per plan     │  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                │                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                      API ROUTE LAYER                               │  │
│  │                                                                    │  │
│  │  /api/auth      /api/ingredients  /api/packaging  /api/products   │  │
│  │  /api/orders    /api/sales        /api/invoice    /api/customers  │  │
│  │  /api/team      /api/audit        /api/settings   /api/api-keys  │  │
│  │  /api/export    /api/admin        /v1/*                           │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                   STATIC FILE SERVING                              │  │
│  │  frontend/index.html  /admin/index.html  team.html  signup.html   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
                                │
          ┌─────────────────────┼──────────────────────┐
          │                     │                       │
┌─────────▼────────┐   ┌────────▼────────┐   ┌─────────▼────────┐
│  NEON POSTGRESQL │   │  GOOGLE GEMINI  │   │  TWILIO WHATSAPP  │
│  (Prisma ORM)    │   │  (Vision API)   │   │  (Messaging API)  │
│                  │   │                 │   │                   │
│  13 Tables       │   │  Invoice Scan   │   │  Invoice Delivery │
│  Multi-tenant    │   │  Image→JSON     │   │  OTP Password     │
│  query extension │   │  extraction     │   │  Reset            │
└──────────────────┘   └─────────────────┘   └───────────────────┘
```

---

## 2. Module Block Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BAKEFLOW ERP MODULES                          │
└─────────────────────────────────────────────────────────────────────┘
                                │
          ┌─────────────────────┼──────────────────────┐
          │                     │                       │
┌─────────▼────────┐   ┌────────▼────────┐   ┌─────────▼────────┐
│   INVENTORY      │   │    SALES &       │   │   TEAM &          │
│   MANAGEMENT     │   │    BILLING       │   │   ADMIN           │
│                  │   │                  │   │                   │
│ ┌──────────────┐ │   │ ┌──────────────┐ │   │ ┌──────────────┐  │
│ │ Ingredients  │ │   │ │ GST Invoices │ │   │ │ Team Mgmt    │  │
│ │ - Add/Edit   │ │   │ │ - Create     │ │   │ │ - Add users  │  │
│ │ - Rate Track │ │   │ │ - WhatsApp   │ │   │ │ - Roles      │  │
│ │ - Stock Qty  │ │   │ │ - PDF-ready  │ │   │ │ - Passwords  │  │
│ │ - Min Alerts │ │   │ └──────────────┘ │   │ └──────────────┘  │
│ └──────────────┘ │   │ ┌──────────────┐ │   │ ┌──────────────┐  │
│ ┌──────────────┐ │   │ │ Custom Orders│ │   │ │ Session Log  │  │
│ │ Packaging    │ │   │ │ - Track      │ │   │ │ - Login time │  │
│ │ - Add/Edit   │ │   │ │ - Delivery   │ │   │ │ - IP address │  │
│ │ - Rate Track │ │   │ └──────────────┘ │   │ │ - Device     │  │
│ │ - Stock Qty  │ │   │ ┌──────────────┐ │   │ └──────────────┘  │
│ └──────────────┘ │   │ │ AI Scanner   │ │   │ ┌──────────────┐  │
└──────────────────┘   │ │ Supplier Inv │ │   │ │ Audit Log    │  │
                       │ │ → Gemini AI  │ │   │ │ All actions  │  │
┌──────────────────┐   │ │ → JSON items │ │   │ │ Immutable    │  │
│   PRODUCT &      │   │ └──────────────┘ │   │ └──────────────┘  │
│   COSTING        │   └──────────────────┘   └───────────────────┘
│                  │
│ ┌──────────────┐ │   ┌──────────────────┐   ┌───────────────────┐
│ │ Product Cat. │ │   │    CRM           │   │  REPORTS &        │
│ │ - Name/Cat   │ │   │                  │   │  EXPORT           │
│ │ - Emoji      │ │   │ ┌──────────────┐ │   │                   │
│ │ - Cost price │ │   │ │ Customers    │ │   │ ┌──────────────┐  │
│ │ - Sell price │ │   │ │ - Add/Edit   │ │   │ │ Revenue      │  │
│ │ - Auto margin│ │   │ │ - Phone/City │ │   │ │ Trends       │  │
│ └──────────────┘ │   │ │ - Order hist │ │   │ │ Top Products │  │
└──────────────────┘   │ │ - Total spend│ │   │ └──────────────┘  │
                       │ │ - Self-heal  │ │   │ ┌──────────────┐  │
                       │ └──────────────┘ │   │ │ CSV Export   │  │
                       └──────────────────┘   │ │ Ingredients  │  │
                                              │ │ Packaging    │  │
                                              │ │ Products     │  │
                                              │ │ Sales        │  │
                                              │ │ Customers    │  │
                                              │ └──────────────┘  │
                                              └───────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                     PLATFORM ADMIN CONSOLE                           │
│                                                                      │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │ Tenant Mgmt     │  │ Platform Metrics  │  │ API Cost           │  │
│  │ - List bakeries │  │ - Total bakeries  │  │ Estimates          │  │
│  │ - Approve/Susp. │  │ - Total invoices  │  │ - Per tenant       │  │
│  │ - Reactivate    │  │ - Total customers │  │ - Monthly summary  │  │
│  │ - Change plans  │  │ - Total sessions  │  │ - Gemini costs     │  │
│  └─────────────────┘  └──────────────────┘  │ - Twilio costs     │  │
│                                              └────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                     PUBLIC REST API (/v1)                            │
│                                                                      │
│  X-API-Key Authentication                                            │
│                                                                      │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │ GET /v1/products│  │ GET /v1/stock     │  │ POST /v1/orders    │  │
│  │ Product catalog │  │ Ingredient +      │  │ Place order from   │  │
│  │ for this bakery │  │ Packaging levels  │  │ external website   │  │
│  └─────────────────┘  └──────────────────┘  └────────────────────┘  │
│                                │                                      │
│                        Fires webhook (HMAC-SHA256 signed)            │
│                        to configured webhook URL on order.placed     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow Diagram — Sales Invoice Creation

```
Employee/Owner
      │
      │ Fill invoice form (customer, items, GST, discount)
      │
      ▼
Frontend (app.js)
      │
      │ POST /api/sales { customerName, items[], subtotal, gstPct, totalAmount... }
      │ Headers: Authorization: Bearer JWT, X-Employee-Name, X-Employee-Email
      │
      ▼
JWT Auth Middleware
      │
      │ Verify token, extract tenantId
      │
      ▼
Tenant Context Middleware
      │
      │ Set AsyncLocalStorage { tenantId }
      │
      ▼
/api/sales route handler
      │
      │ Generate sequential invoice number
      │ Build invoice object
      │ Create SalesInvoice record (Prisma auto-scopes to tenantId)
      │ Update Customer stats (totalOrders, totalValue, lastOrderDate)
      │ Create AuditLog entry (CREATE_SALE action)
      │
      ▼
Response → Invoice object with invoiceNumber

      │ (Optional - if WhatsApp clicked)
      ▼
POST /api/sales/:id/send-whatsapp
      │
      │ Quota check: WhatsApp count this month < plan limit?
      │ Build WhatsApp message body
      │ Twilio API call → customer phone
      │ Update invoice (whatsappSent = true)
      │ AuditLog (SEND_WHATSAPP action)
      │
      ▼
WhatsApp delivered to customer
```

---

## 4. Data Flow Diagram — AI Invoice Scanner

```
Employee
      │
      │ Photograph supplier invoice (mobile/camera)
      │
      ▼
Frontend
      │
      │ Convert image to base64
      │ POST /api/invoice/scan { image: base64, mimeType }
      │
      ▼
Quota Enforcer
      │
      │ Count SCAN_INVOICE actions this month for tenantId
      │ Reject if >= plan limit
      │
      ▼
Invoice Route Handler
      │
      │ Discover available Gemini models via /v1beta/models
      │ Try candidates in order (gemini-flash-latest → gemini-2.5-flash → ...)
      │ Send image + prompt to Gemini Vision API
      │
      ▼
Gemini Vision API
      │
      │ Extract line items from invoice image
      │ Return JSON: [{ name, quantity, unit, unitPrice, totalPrice }]
      │
      ▼
Route Handler
      │
      │ Parse Gemini response (with JSON cleanup)
      │ Create AuditLog (SCAN_INVOICE)
      │
      ▼
Frontend
      │
      │ Display extracted items in form
      │ Employee verifies and adds to inventory
```

---

## 5. Multi-Tenancy Data Isolation Block

```
┌─────────────────────────────────────────────────────────┐
│                  DATABASE REQUEST FLOW                   │
│                                                         │
│  Route Handler                                          │
│       │                                                  │
│       │ db.prisma.ingredient.findMany({ where: {...} }) │
│       │                                                  │
│       ▼                                                  │
│  Prisma Query Extension (sheetsClient.js)               │
│       │                                                  │
│       │ Read tenantId from AsyncLocalStorage             │
│       │ Auto-inject: AND tenantId = '<uuid>'            │
│       │                                                  │
│       ▼                                                  │
│  Actual SQL:                                             │
│  SELECT * FROM "Ingredient"                             │
│  WHERE <route_conditions>                               │
│  AND "tenantId" = 'bakery-uuid-123'                     │
│                                                         │
│  Result: Only Bakery A's ingredients returned           │
│          Bakery B's data is completely invisible        │
└─────────────────────────────────────────────────────────┘
```
