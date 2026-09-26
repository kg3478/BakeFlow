# BakeFlow ERP — Data Flow Diagrams (DFD)

## DFD Level 0 — Context Diagram

```
                    ┌──────────────────────────────────────────────────────────┐
                    │                                                          │
  ┌──────────┐      │                                                          │
  │  Bakery  │──────►                                                          │
  │  Owner   │◄─────│                                                          │
  └──────────┘      │                                                          │
                    │                                                          │
  ┌──────────┐      │                                                          │  ┌───────────┐
  │ Employee │──────►           B A K E F L O W   E R P                       ├──► Neon DB   │
  │          │◄─────│                                                          │◄──│ (Postgres)│
  └──────────┘      │                                                          │  └───────────┘
                    │                                                          │
  ┌──────────┐      │                                                          │  ┌───────────┐
  │Platform  │──────►                                                          ├──► Gemini AI │
  │  Admin   │◄─────│                                                          │◄──│  Vision   │
  └──────────┘      │                                                          │  └───────────┘
                    │                                                          │
  ┌──────────┐      │                                                          │  ┌───────────┐
  │ External │──────►                                                          ├──► Twilio    │
  │ Website  │◄─────│                                                          │   │ WhatsApp  │
  └──────────┘      │                                                          │  └───────────┘
                    │                                                          │
  ┌──────────┐      │                                                          │  ┌───────────┐
  │ Customer │◄─────│                                                          ├──► Google    │
  │(WhatsApp)│      │                                                          │   │  OAuth    │
  └──────────┘      │                                                          │  └───────────┘
                    └──────────────────────────────────────────────────────────┘
```

---

## DFD Level 1 — Main System Processes

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  External                                                                    │
│  Actors        Process                      Data Stores                      │
│                                                                              │
│  ┌──────┐      ┌──────────────────┐         ┌─────────────────────────────┐  │
│  │Owner │─────►│  1. Authenticate │────────►│ D1: Tenant                  │  │
│  │      │◄─────│   & Authorize    │◄────────│ D2: User                    │  │
│  └──────┘      └──────────────────┘         │ D3: UserSession             │  │
│                        │                    └─────────────────────────────┘  │
│  ┌──────┐      ┌────────▼─────────┐         ┌─────────────────────────────┐  │
│  │Emp.  │─────►│  2. Manage       │────────►│ D4: Ingredient              │  │
│  │      │◄─────│   Inventory      │◄────────│ D5: Packaging               │  │
│  └──────┘      └──────────────────┘         └─────────────────────────────┘  │
│                        │                                                      │
│  ┌──────┐      ┌────────▼─────────┐         ┌─────────────────────────────┐  │
│  │Owner │─────►│  3. Manage       │────────►│ D6: Product                 │  │
│  │      │◄─────│   Products       │◄────────└─────────────────────────────┘  │
│  └──────┘      └──────────────────┘                                           │
│                        │                                                      │
│  ┌──────┐      ┌────────▼─────────┐         ┌─────────────────────────────┐  │
│  │Emp.  │─────►│  4. Process      │────────►│ D7: SalesInvoice            │  │
│  │      │◄─────│   Sales          │◄────────│ D8: Customer                │  │
│  └──────┘      └──────┬───────────┘         └─────────────────────────────┘  │
│                       │                                                       │
│  ┌──────┐             │  Invoice              ┌─────────────────────────────┐ │
│  │Cust. │◄────────────┘  via WhatsApp         │ D9: AuditLog (all actions)  │ │
│  └──────┘                                     └─────────────────────────────┘ │
│                        │                                                      │
│  ┌──────┐      ┌────────▼─────────┐         ┌─────────────────────────────┐  │
│  │Emp.  │─────►│  5. AI Invoice   │────────►│ Gemini Vision API           │  │
│  │      │◄─────│   Scanning       │◄────────│ (external)                  │  │
│  └──────┘      └──────────────────┘         └─────────────────────────────┘  │
│                                                                              │
│  ┌──────┐      ┌──────────────────┐         ┌─────────────────────────────┐  │
│  │Owner │─────►│  6. Team         │────────►│ D2: User                    │  │
│  │      │◄─────│   Management     │◄────────│ D3: UserSession             │  │
│  └──────┘      └──────────────────┘         └─────────────────────────────┘  │
│                                                                              │
│  ┌──────┐      ┌──────────────────┐         ┌─────────────────────────────┐  │
│  │Ext.  │─────►│  7. Public       │────────►│ D7: SalesInvoice            │  │
│  │Web   │◄─────│   REST API       │◄────────│ D4: Ingredient              │  │
│  └──────┘      └──────────────────┘         │ D5: Packaging               │  │
│                        │                    └─────────────────────────────┘  │
│                        │ Webhook                                              │
│  ┌──────┐              └──────────────────────► External Webhook URL          │
│  │Ext.  │                                                                     │
│  │Web   │                                                                     │
│  └──────┘                                                                     │
│                                                                              │
│  ┌──────┐      ┌──────────────────┐         ┌─────────────────────────────┐  │
│  │Platf.│─────►│  8. Platform     │────────►│ D1: Tenant                  │  │
│  │Admin │◄─────│   Admin          │◄────────│ D9: AuditLog                │  │
│  └──────┘      └──────────────────┘         └─────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## DFD Level 2 — Process 1: Authentication

```
    Owner                                                    Data Stores
      │
      │ {Google ID Token, Password}
      ▼
┌─────────────────┐
│ 1.1 Verify      │
│ Google Token    │──────────────────────────────────► Google OAuth2 API
│ (OAuth2Client)  │◄──────────────────────────────────  {verified email, sub}
└────────┬────────┘
         │ {email, googleId}
         ▼
┌─────────────────┐
│ 1.2 Lookup      │
│ Tenant in DB    │──────────────────────────────────► D1: Tenant
│                 │◄──────────────────────────────────  {tenantId, status, plan}
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 1.3 Check       │
│ Tenant Status   │── suspended ─► REJECT (403)
│                 │── pending ──► REJECT (403)
│                 │── active ───► CONTINUE
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 1.4 Verify      │
│ Password        │──────────────────────────────────► D2: User {password hash}
│ (bcrypt)        │◄──────────────────────────────────  {isMatch bool}
└────────┬────────┘
         │ isMatch = false ──► REJECT (401)
         │ isMatch = true
         ▼
┌─────────────────┐
│ 1.5 Issue JWT   │
│ Token           │──► {role, name, email, tenantId, userId}
│                 │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 1.6 Record      │
│ Session         │──────────────────────────────────► D3: UserSession
│                 │                                     {userId, tenantId, IP, UA}
└────────┬────────┘
         │
         ▼
      Owner ◄──── {token: JWT, user: {...}, sessionId}
```

---

## DFD Level 2 — Process 4: Sales Invoice Processing

```
    Employee                                               Data Stores
      │
      │ {customerName, items[], subtotal, gstPct, totalAmount, paymentMethod}
      ▼
┌─────────────────┐
│ 4.1 Generate    │
│ Invoice Number  │──────────────────────────────────► D7: SalesInvoice
│ (sequential)    │◄──────────────────────────────────  {MAX(invoiceNumber)}
└────────┬────────┘
         │ {INV-0042}
         ▼
┌─────────────────┐
│ 4.2 Create      │
│ SalesInvoice    │──────────────────────────────────► D7: SalesInvoice
│ Record          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4.3 Update      │
│ Customer Stats  │──────────────────────────────────► D8: Customer
│ (if customerId) │  {totalOrders++, totalValue+=amt, lastOrderDate=today}
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4.4 Log to      │
│ AuditLog        │──────────────────────────────────► D9: AuditLog
│ (CREATE_SALE)   │  {action, employeeName, details}
└────────┬────────┘
         │
         ▼
      Employee ◄──── {invoice object with invoiceNumber}

    (Optional - WhatsApp Send)
      │
      │ Click "Send WhatsApp"
      ▼
┌─────────────────┐
│ 4.5 Check       │
│ WhatsApp Quota  │──────────────────────────────────► D9: AuditLog
│                 │  COUNT(SEND_WHATSAPP, this month)
│                 │◄──────────────────────────────────
└────────┬────────┘
         │ quota ok
         ▼
┌─────────────────┐
│ 4.6 Format      │
│ WhatsApp Message│
│                 │
└────────┬────────┘
         │ {message body, customer phone}
         ▼
┌─────────────────┐
│ 4.7 Send via    │
│ Twilio API      │──────────────────────────────────► Twilio WhatsApp API
│                 │                                     → Customer phone
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4.8 Update      │
│ Invoice &       │──────────────────────────────────► D7: SalesInvoice
│ Log Action      │  {whatsappSent=true, whatsappSentAt}
│                 │──────────────────────────────────► D9: AuditLog (SEND_WHATSAPP)
└─────────────────┘
```

---

## DFD Level 2 — Process 5: AI Invoice Scanning

```
    Employee                                               External
      │
      │ {image: base64, mimeType}
      ▼
┌─────────────────┐
│ 5.1 Check       │
│ Gemini Quota    │──────────────────────────────────► D9: AuditLog
│                 │  COUNT(SCAN_INVOICE, this month)
└────────┬────────┘
         │ quota ok
         ▼
┌─────────────────┐
│ 5.2 Discover    │
│ Gemini Models   │──────────────────────────────────► Google Generative API
│                 │◄──────────────────────────────────  {available models list}
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5.3 Try Models  │  For each candidate model:
│ in Order        │──────────────────────────────────► Gemini Vision API
│                 │  {image data, prompt for JSON extraction}
│                 │◄──────────────────────────────────  {text: "[{name,qty,unit...}]"}
└────────┬────────┘
         │ (retry with next model if 404 or modality error)
         ▼
┌─────────────────┐
│ 5.4 Parse JSON  │
│ Response        │
│ (cleanup +      │
│  error handling)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5.5 Log Action  │──────────────────────────────────► D9: AuditLog
│ (SCAN_INVOICE)  │  {N items detected}
└────────┬────────┘
         │
         ▼
      Employee ◄──── { items: [{name, quantity, unit, unitPrice, totalPrice}] }
```

---

## DFD Level 2 — Process 7: Public REST API

```
    External Website                                       Data Stores
         │
         │ {X-API-Key: raw_key}
         ▼
┌─────────────────┐
│ 7.1 Authenticate│
│ API Key         │──────────────────────────────────► D10: ApiKey
│ (SHA-256 match) │◄──────────────────────────────────  {tenantId, status}
└────────┬────────┘
         │ key valid
         ▼
┌─────────────────┐
│ 7.2 Set Tenant  │
│ Context         │  tenantStorage.run({ tenantId })
└────────┬────────┘
         │
         ├──── GET /v1/products ────────────────────────────► D6: Product
         │                                                      (auto-scoped to tenantId)
         │
         ├──── GET /v1/stock ───────────────────────────────► D4: Ingredient
         │                                                    ► D5: Packaging
         │
         └──── POST /v1/orders ────────────────────────────► D7: SalesInvoice (create)
                     │
                     ▼
              ┌─────────────────┐
              │ 7.3 Fire        │
              │ Webhook         │──────────────────────────► D11: Setting (webhook URL)
              │ (non-blocking)  │──────────────────────────► External webhook endpoint
              │ HMAC-SHA256     │  {event, tenantId, data, signature}
              └─────────────────┘
```
