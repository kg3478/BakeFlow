# BakeFlow ERP — User Journey Maps

## Overview

This document maps the complete journey of each user type through BakeFlow ERP — from first contact to daily workflows — capturing every touchpoint, emotion, decision, and action.

![BakeFlow User Journey Overview](./images/user_journey.jpg)

---

## User Type 1: Bakery Owner — First-Time Setup Journey

### Persona
**Priya Patel** — Owner of "Bliss Oven", a 5-year-old home bakery in Mumbai scaling to a proper shop. 35 years old, tech-comfortable but not a developer. Frustrated with WhatsApp-based order tracking and Excel sheets.

---

### Phase 1: Discovery and Signup

```
STEP 1          STEP 2           STEP 3            STEP 4
─────────       ────────         ─────────         ─────────
Discovers       Opens            Fills signup      Waits for
BakeFlow        /signup          form              Admin approval
via referral    page             (name, email,     (status: pending)
                                 Google login,
                                 password)
   😐                😮              😊                😐
Skeptical      Impressed       Optimistic        Anxious
               by clean UI
```

**Actions:**
1. Navigates to `https://bakeflow.app/signup`
2. Signs in with Google account
3. Enters bakery name, phone number, and sets a password
4. Submits the onboarding form (`POST /api/auth/request-access`)
5. Sees confirmation message: *"Your request has been submitted and is awaiting review"*

**Pain Points:** Uncertainty about how long approval takes.

---

### Phase 2: First Login (After Admin Approval)

```
STEP 5          STEP 6           STEP 7            STEP 8
─────────       ────────         ─────────         ─────────
Receives        Opens            Google Sign-In    Sees ERP
approval        /               + Password         Dashboard
notification    (main ERP)       entry              for first time
   😊               😊               ✅                🤩
Excited        Eager           Smooth            Amazed at
                               login             features
```

**Actions:**
1. Opens the BakeFlow URL
2. Clicks "Sign in with Google" → authenticates with Google
3. Enters bakery password
4. JWT issued; redirected to main ERP dashboard
5. Sees all modules: Inventory, Products, Sales, CRM, Team, Reports

**Touchpoints:** Login page → Dashboard home

---

### Phase 3: Inventory Setup (Day 1)

```
STEP 9          STEP 10          STEP 11           STEP 12
─────────       ────────         ─────────         ─────────
Opens           Reviews          Edits rates        Takes photo
Ingredients     26 pre-seeded    for ingredients    of supplier
tab             ingredients      she uses           invoice
   😊               😮               🔧                🤩
Happy to        Surprised       Adjusting to       Discovers
start           defaults        real prices        AI Scanner!
                exist
```

**Actions:**
1. Navigates to Ingredients section
2. Finds 26 pre-loaded ingredients — recognizes most
3. Updates rates for Butter (₹120), Cream (₹180), Chocolate (₹900)
4. Adjusts stock quantities from current stock
5. Sets minimum alert thresholds (e.g., 2kg for All-Purpose Flour)
6. Discovers AI Invoice Scanner → photographs a supplier bill
7. Gemini Vision extracts all items → adds to inventory in one click

**Emotions:** Delight at AI feature, satisfaction at accurate stock setup.

---

### Phase 4: Product Catalog Setup

```
STEP 13         STEP 14          STEP 15
─────────       ────────         ─────────
Opens           Reviews          Adjusts sell
Products tab    12 pre-seeded    prices for
                products         her margin goals
   😊               😮               😊
Eager to        Some match       Sets 40-50%
set up          her menu         margins
```

**Actions:**
1. Reviews pre-seeded products (Rasmalai Cake, Mango Cake, etc.)
2. Deletes products she doesn't make
3. Adds her signature products (e.g., "Biscoff Lava Cake")
4. Sets selling prices to match her existing price list
5. Reviews auto-calculated margins — adjusts pricing for profitability

---

### Phase 5: First GST Invoice

```
STEP 16         STEP 17          STEP 18           STEP 19
─────────       ────────         ─────────         ─────────
Customer        Opens New        Fills              Sends via
places order    Invoice form     invoice            WhatsApp
over WhatsApp                    fields             one click
   📱               🔧               ✅                😊
Manual order    Easy form       Invoice           Customer
taking still                    complete          receives it
```

**Actions:**
1. Selects customer from CRM (or adds new customer)
2. Adds items from product catalog (auto-fills price)
3. Applies 5% GST + adjusts discount if needed
4. Selects payment method (UPI)
5. Creates invoice → auto-generates INV-0001
6. Clicks "Send WhatsApp" → invoice delivered in seconds
7. Customer replies "Thank you 🙏"

**Emotion:** Thrilled — professional invoice delivery replaces manual WhatsApp billing.

---

## User Type 2: Employee — Daily Operations Journey

### Persona
**Rohan Gupta** — Part-time helper at Bliss Oven, 22 years old. Handles morning baking prep and customer order billing. Not tech-savvy.

---

### Phase 1: Daily Login

```
STEP 1          STEP 2           STEP 3
─────────       ────────         ─────────
Opens           Enters           Sees employee
login page      username +       dashboard
                password         (limited view)
   ✅               ✅               😊
Quick           Simple          Only sees
                login           relevant modules
```

**Actions:**
1. Opens BakeFlow URL on phone/tablet
2. Selects his name from employee list (or types username)
3. Enters password → JWT issued with role=employee
4. Sees dashboard: Inventory, Sales, Customers — no Team/Admin/Export tabs

---

### Phase 2: Morning Inventory Update

```
STEP 4          STEP 5           STEP 6           STEP 7
─────────       ────────         ─────────        ─────────
Receives        Opens            Scans            Updates
fresh stock     Packaging        supplier         stock qty
delivery        section          invoice with     for each item
                                 AI Scanner
   📦               🔧               🤩               ✅
Delivery       Updates          AI does the      Done in
arrived        packaging        heavy lifting    2 minutes
               stock
```

**Actions:**
1. Gets delivery: 20kg flour, 10L cream, 12 cake boxes
2. Opens Ingredients → increments Flour by 20kg (atomic operation)
3. Opens Packaging → increments Cake Boxes by 12
4. Alternatively: photographs supplier invoice → AI extracts all items → updates in one flow
5. All changes logged to AuditLog automatically

---

### Phase 3: Processing a Customer Order

```
STEP 8          STEP 9           STEP 10          STEP 11
─────────       ────────         ─────────        ─────────
Customer        Opens New        Selects          Sends
walks in        Invoice          Rasmalai Cake    WhatsApp
or calls        form             + Cookie Box     receipt
   👥               🔧               ✅               📱
Greets         Fast             Total auto-      Customer
customer       form             calculated       gets receipt
```

**Actions:**
1. Customer asks for Rasmalai Cake (₹950) + Cookie Box (₹399)
2. Opens new invoice, searches for customer in CRM
3. Adds items (prices auto-filled from product catalog)
4. Applies GST: ₹67.45, Total: ₹1,416.45
5. Customer pays via UPI
6. Sends WhatsApp receipt → customer receives immediately

---

## User Type 3: Platform Admin — Tenant Management Journey

### Persona
**Kartik (BakeFlow Admin)** — Manages the entire BakeFlow platform. Approves bakeries, handles support, monitors costs.

---

### Phase 1: Morning Review

```
STEP 1          STEP 2           STEP 3           STEP 4
─────────       ────────         ─────────        ─────────
Opens           Reviews          Sees new         Reviews
/admin          Platform         onboarding       platform
portal          Metrics          requests         metrics
   ✅               📊               📋               💰
Quick           Checks           Pending          Checks AI
login           health           approvals        cost trends
```

**Actions:**
1. Signs into `/admin` with Google + ADMIN_PASSWORD
2. Reviews dashboard: Total bakeries, active sessions, invoices this month
3. Sees 2 pending onboarding requests
4. Reviews API usage: 47 Gemini scans (₹0.01), 23 WhatsApp messages (₹0.12) this month

---

### Phase 2: Approving a New Bakery

```
STEP 5          STEP 6           STEP 7           STEP 8
─────────       ────────         ─────────        ─────────
Opens           Reviews          Approves         Owner can
Pending list    Bliss Oven       request          login
                details          PUT /approve     immediately
   📋               🔍               ✅               🎉
See request     Verify email     One click        Tenant
                and phone        approval         activated
```

**Actions:**
1. Reviews pending tenant: "Bliss Oven" — priya@gmail.com
2. Verifies details look legitimate
3. Clicks "Approve" → `PUT /api/admin/tenants/:id/approve`
4. System: activates tenant, creates owner User record, seeds default settings
5. Notifies Priya via email/WhatsApp (manual for now)

---

### Phase 3: Monitoring and Cost Management

```
STEP 9          STEP 10          STEP 11          STEP 12
─────────       ────────         ─────────        ─────────
Opens           Reviews per-     Sees Bliss       Upgrades
Stats page      bakery usage     Oven hitting     Bliss Oven
                breakdown        Gemini quota     to Starter
   📊               📈               ⚠️               ✅
Cost view       Detailed        30 scans =       Problem
                per tenant      Free limit       solved
```

**Actions:**
1. Opens `/api/admin/stats` view
2. Sees per-bakery breakdown: Bliss Oven has 29/30 Gemini scans
3. Contacts Priya — she wants to upgrade
4. Changes plan to "starter" (200 scans/month)
5. Priya's quota immediately resets

---

## User Type 4: External Website Customer — Order Placement Journey

### Persona
**Ananya Sharma** — Regular customer of Bliss Oven who shops on their website.

---

### Phase 1: Browsing and Ordering

```
STEP 1          STEP 2           STEP 3           STEP 4
─────────       ────────         ─────────        ─────────
Visits          Sees embedded    Selects          Fills order
Bliss Oven      BakeFlow         Mango Cake       form
website         product widget   (live pricing)   (name, phone)
   🌐               😊               🛒               ✅
External        Impressed by     Real catalog     Easy
website         live catalog     from BakeFlow    checkout
```

**Actions:**
1. Opens `blissoven.com` (external website)
2. Sees BakeFlow widget showing live products (loaded via `widget.js` + API key)
3. Clicks "Mango Cake — ₹650"
4. Fills name: Ananya Sharma, phone: 9876543210, city: Mumbai
5. Submits order

**Behind the scenes:**
- `POST /v1/orders` called with bakery's API key
- SalesInvoice created in BakeFlow automatically
- Webhook fired to bakery's configured endpoint
- Bakery receives notification immediately

---

### Phase 2: Post-Order Experience

```
STEP 5          STEP 6           STEP 7
─────────       ────────         ─────────
Receives        Bakery           Cake
order           processes        delivered!
confirmation    order in         on schedule
number          BakeFlow ERP
   ✅               🎂               😍
INV-0042        Rohan sees       Happy
received        it in Billing    customer
```

---

## Complete User Journey Summary Map

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    BAKEFLOW USER JOURNEY OVERVIEW                       ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  BAKERY OWNER                                                            ║
║  Signup → Approval → Login → Setup (Inventory + Products) →             ║
║  Create Invoices → Manage Team → View Reports → Export Data             ║
║                                                                          ║
║  EMPLOYEE                                                                ║
║  Login → Update Stock → Scan Invoices → Create Billing →                ║
║  Manage Customers → Log Out                                              ║
║                                                                          ║
║  PLATFORM ADMIN                                                          ║
║  Login → Review Requests → Approve Tenants → Monitor Usage →            ║
║  Manage Plans → Review Costs                                             ║
║                                                                          ║
║  EXTERNAL CUSTOMER                                                       ║
║  Browse Widget → Select Products → Place Order → Receive Confirmation   ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## Emotional Journey — Bakery Owner (First Month)

| Week | Stage | Emotion | Key Event |
|------|-------|---------|-----------|
| Week 1 — Setup | Discovery | 😐 → 😮 → 😊 | Finds BakeFlow, impressed by AI scanner |
| Week 1 — Onboarding | Setup | 😮 → 🔧 → 😊 | Configures inventory with pre-seeded data |
| Week 2 — Operations | Learning | 😊 → 🔧 → ✅ | First invoice sent via WhatsApp — customer loves it |
| Week 2 — Team | Growth | 😊 → 🔧 → 😊 | Adds Rohan as employee; delegates billing |
| Week 3 — Efficiency | Proficient | 😊 → 😊 → 😊 | Daily operations fully on BakeFlow |
| Week 4 — Insights | Strategic | 😊 → 🤩 → 💡 | Reviews reports, discovers best-seller margins |

---

## Key Moments of Delight (Magic Moments)

| # | Moment | Why It Delights |
|---|--------|-----------------|
| 1 | AI invoice scan → auto-fills inventory | Saves 20+ minutes of manual data entry |
| 2 | WhatsApp invoice in 1 click | Customer gets professional receipt instantly |
| 3 | Pre-seeded 26 ingredients | No blank-slate anxiety; ready to use on day 1 |
| 4 | Auto-calculated profit margins | Owner sees true profitability for first time |
| 5 | Self-healing customer stats | Always accurate order history without manual work |
| 6 | Sequential invoice numbers | INV-0001, INV-0002... gives professional credibility |
| 7 | Audit log | Owner can see exactly what each employee did |

---

## Pain Points Resolved by BakeFlow

| Before BakeFlow | With BakeFlow |
|-----------------|---------------|
| WhatsApp messages for orders → easy to miss | Structured invoice system with history |
| Excel sheets for inventory → manual errors | Real-time stock tracking with alerts |
| Unknown profit margins | Auto-calculated margin on every product |
| Paper bills → no GST compliance | GST-ready professional invoices |
| No customer database | Full CRM with lifetime value tracking |
| Can't track employee activity | Audit log + session monitoring |
| Hard to bill from supplier invoices | AI scanner extracts line items automatically |
| Separate app for each function | Single platform covering entire lifecycle |
