# BakeFlow ERP — Testing and Quality Notes

## 1. Test Scripts

The backend includes three test scripts for manual testing:

### test-admin.js
Tests platform admin operations including:
- Listing tenants
- Approving/suspending tenants
- Viewing platform metrics

**Run:**
```bash
cd backend
node test-admin.js
```

### test-integration.js
End-to-end integration tests for:
- Authentication flows (Google + employee login)
- CRUD operations across modules
- Sales invoice creation and WhatsApp dispatch

**Run:**
```bash
cd backend
node test-integration.js
```

### test-isolation.js
Tenant isolation verification tests:
- Confirms Bakery A cannot see Bakery B's data
- Tests that the Prisma query extension correctly scopes all queries
- Validates that no route bypass is possible

**Run:**
```bash
cd backend
node test-isolation.js
```

---

## 2. Health Check Endpoints

### GET /api/health
Returns server and database connectivity status:
```json
{
  "status": "ok",
  "time": "2026-09-26T10:45:00.000Z",
  "db": "connected"
}
```

### GET /api/gemini-status
Diagnostic endpoint for Gemini API key and model availability:
```json
{
  "configured": true,
  "maskedKey": "AIzaS...xYZ",
  "testResults": {
    "gemini-flash-latest": { "status": 200, "success": true, "text": "pixel" },
    "gemini-2.5-flash": { "status": 404, "success": false, "error": "..." }
  }
}
```

---

## 3. Manual Testing Checklist

### Authentication
- [ ] Owner login with valid Google token + password succeeds
- [ ] Owner login with invalid password returns 401
- [ ] Employee login with valid username/password succeeds
- [ ] Employee login with wrong password returns 401
- [ ] Suspended tenant login returns 403
- [ ] Expired Free Beta tenant returns 403
- [ ] Rate limiter triggers after 20 auth requests

### Inventory
- [ ] Add ingredient persists to DB
- [ ] Rate update creates rateHistory entry
- [ ] Stock increment/decrement is atomic
- [ ] Soft delete hides from GET list
- [ ] Restore makes item visible again
- [ ] Low-stock alert shows when stockQty <= minAlert

### Sales
- [ ] Create invoice with all required fields
- [ ] Invoice number is sequential and unique per tenant
- [ ] Customer stats updated on invoice creation
- [ ] Customer stats rolled back on invoice deletion
- [ ] WhatsApp send records in AuditLog
- [ ] WhatsApp quota enforced at plan limit

### AI Scanner
- [ ] Valid image returns parsed JSON items
- [ ] Quota enforced at monthly limit
- [ ] Graceful fallback when preferred model is unavailable
- [ ] Empty/invalid image returns appropriate error

### Tenant Isolation
- [ ] Tenant A cannot access Tenant B's ingredients
- [ ] Tenant A cannot access Tenant B's invoices
- [ ] Tenant A cannot access Tenant B's customers
- [ ] Tenant A cannot see Tenant B's API keys

### Platform Admin
- [ ] Non-platform-admin cannot access /api/admin
- [ ] Platform admin can list all tenants
- [ ] Approved tenant can login immediately
- [ ] Suspended tenant is locked out immediately

---

## 4. Known Issues and Limitations

| Issue | Severity | Details |
|-------|---------|---------|
| OTP stored in plaintext | Medium | User.otpCode stores raw 6-digit OTP. Should be hashed. |
| In-memory rate limiter | Low | Rate limit state lost on server restart. Acceptable for single-instance Render deployment. |
| No JWT revocation | Low | Issued JWTs valid until expiry even after account suspension (auth middleware re-checks status though). |
| Customer stats not real-time | Low | Stats recalculated on GET; not updated atomically with invoice operations (relies on self-healing). |
| Report module | Low | Frontend reports rely on client-side aggregation of invoice data. For large datasets, server-side aggregation would be more efficient. |

---

## 5. Code Quality

### Backend
- **No TypeScript** — Plain Node.js. Type safety enforced via Prisma's generated client.
- **Error handling** — All routes wrapped in try/catch; global error handler as fallback.
- **Consistent response format** — Success: `{ success: true, ...data }`, Error: `{ error: message }` or `{ success: false, error: message }`
- **Audit logging** — All state-changing operations log to AuditLog automatically.
- **Soft deletes** — Consistent pattern across all entities; no data is permanently lost by default.

### Frontend
- **~4,000 lines** in app.js — Monolithic by design (zero build step goal)
- **No framework** — Vanilla DOM manipulation
- **LocalStorage** for JWT + user state
- **Hash routing** — URL-based navigation within the SPA

---

## 6. Performance Considerations

| Area | Current Approach | Consideration |
|------|-----------------|---------------|
| Database | Neon serverless PostgreSQL | Cold starts may add ~500ms on first request |
| Images | Base64 in request body (20MB limit) | Large invoice images may slow scanning |
| Customer stats | Recalculated on every GET | Acceptable for small datasets; may slow with 1000+ invoices per customer |
| Rate limiter | In-memory Map | Does not scale horizontally |
| Prisma | Query extension on every query | Negligible overhead for tenant ID injection |

---

## 7. Suggested Future Enhancements

| Feature | Priority | Description |
|---------|---------|-------------|
| Unit tests | High | Jest + Supertest for route-level tests |
| TypeScript | Medium | Add type safety to backend codebase |
| Redis rate limiter | Medium | Replace in-memory limiter for horizontal scaling |
| JWT blocklist | Medium | Redis-backed JWT revocation for instant account lockout |
| Email notifications | Medium | Email invoice copies alongside WhatsApp |
| PDF invoice generation | Medium | Generate PDF invoices in-browser or server-side |
| OTP hashing | Medium | Hash OTP before storing in database |
| Analytics dashboard | Low | Enhanced reporting with charts (Chart.js) |
| Mobile app | Low | React Native companion app for on-the-go access |
| Barcode scanner | Low | Scan ingredient barcodes for faster inventory entry |
