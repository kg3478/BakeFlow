# BakeFlow ERP — User Roles and Permissions Matrix

## Role Hierarchy

```
Platform Admin (super admin - separate system)
       │
       │ manages
       ▼
   Bakery Owner (full ERP access)
       │
       │ manages
       ▼
   Admin Employee (elevated access)
       │
       │ manages
       ▼
   Employee (day-to-day operations)
```

---

## Permissions Matrix

| Feature / Action | Employee | Admin | Owner | Platform Admin |
|-----------------|----------|-------|-------|----------------|
| **Authentication** | | | | |
| Login (username/password) | Yes | Yes | Yes (Google) | Yes (Google) |
| Change own password | Yes | Yes | Yes | — |
| OTP password reset | — | — | Yes | — |
| **Inventory — Ingredients** | | | | |
| View ingredients | Yes | Yes | Yes | — |
| Add ingredient | Yes | Yes | Yes | — |
| Update ingredient rate | Yes | Yes | Yes | — |
| Update stock quantity | Yes | Yes | Yes | — |
| Soft delete ingredient | Yes | Yes | Yes | — |
| Restore ingredient | Yes | Yes | Yes | — |
| Hard delete ingredient | Yes | Yes | Yes | — |
| Atomic stock increment | Yes | Yes | Yes | — |
| Atomic stock decrement | Yes | Yes | Yes | — |
| **Inventory — Packaging** | | | | |
| All packaging actions | Yes | Yes | Yes | — |
| **Products** | | | | |
| View products | Yes | Yes | Yes | — |
| Add product | Yes | Yes | Yes | — |
| Delete / restore product | Yes | Yes | Yes | — |
| **Custom Orders** | | | | |
| View orders | Yes | Yes | Yes | — |
| Create/edit/delete orders | Yes | Yes | Yes | — |
| **Sales & Invoicing** | | | | |
| View invoices | Yes | Yes | Yes | — |
| Create invoice | Yes | Yes | Yes | — |
| Delete invoice | Yes | Yes | Yes | — |
| Send via WhatsApp | Yes (quota) | Yes (quota) | Yes (quota) | — |
| Mark inventory deducted | Yes | Yes | Yes | — |
| **AI Invoice Scanner** | | | | |
| Scan supplier invoice | Yes (quota) | Yes (quota) | Yes (quota) | — |
| **CRM — Customers** | | | | |
| View customers | Yes | Yes | Yes | — |
| Add customer | Yes | Yes | Yes | — |
| Update customer | Yes | Yes | Yes | — |
| Delete customer | Yes | Yes | Yes | — |
| **Audit Log** | | | | |
| View audit log | Yes | Yes | Yes | — |
| **Settings** | | | | |
| View settings | Yes | Yes | Yes | — |
| Update settings | Yes | Yes | Yes | — |
| **Team Management** | | | | |
| View team members | No | Yes | Yes | — |
| Add employee | No | Yes | Yes | — |
| Update employee (name/role) | No | Yes | Yes | — |
| Reset employee password | No | Yes | Yes | — |
| Deactivate/delete employee | No | Yes | Yes | — |
| View login sessions | No | Yes | Yes | — |
| **API Keys** | | | | |
| View API keys | No | Yes | Yes | — |
| Generate API key | No | Yes | Yes | — |
| Revoke API key | No | Yes | Yes | — |
| **Data Export (CSV)** | | | | |
| Export any module | No | Yes | Yes | — |
| **Platform Admin Console** | | | | |
| List all tenants | No | No | No | Yes |
| Approve tenant onboarding | No | No | No | Yes |
| Suspend/Reactivate tenant | No | No | No | Yes |
| Change tenant plan | No | No | No | Yes |
| View platform metrics | No | No | No | Yes |
| View API cost estimates | No | No | No | Yes |
| **Public REST API (/v1)** | | | | |
| Access via API key | — | — | — | — (API key auth) |

---

## Role Enforcement

Roles are enforced at two levels:

### 1. Middleware Level
```
routes/team.js: router.use(requireRole(['admin', 'owner']));
routes/export.js: router.use(requireRole(['admin', 'owner']));
routes/admin.js: router.use(requirePlatformAdmin);
```

### 2. JWT Payload Level
Every request carries the user's role in the JWT:
```json
{ "role": "employee", "tenantId": "uuid", ... }
```

---

## User Account Lifecycle

```
Platform Admin creates tenant
         │
         ▼
Tenant created (owner user auto-created with role='owner')
         │
         ▼
Owner logs in → Can create Admin/Employee accounts
         │
         ▼
Employee account created (username + password)
         │
         ├── active=true → Can login
         ├── active=false → Cannot login (deactivated)
         └── deleted=true → Soft deleted (data preserved, login blocked)
```

## WhatsApp OTP Password Reset Flow (Owner only)

```
Owner forgot password
         │
         ▼
POST /api/auth/otp-request { email }
         │
         ▼
6-digit OTP generated, stored in User.otpCode (10min expiry)
         │
         ▼
OTP sent to owner's registered WhatsApp phone via Twilio
         │
         ▼
POST /api/auth/otp-verify { email, otp, newPassword }
         │
         ▼
OTP verified → password bcrypt-hashed → stored in User.password
OTP fields cleared → Login works with new password
```
