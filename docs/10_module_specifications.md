# BakeFlow ERP — Module Specifications

## Module 1: Inventory — Ingredients

### Purpose
Track all raw materials used in bakery production with real-time stock levels, pricing history, and low-stock alerts.

### Data Fields
| Field | Type | Description |
|-------|------|-------------|
| name | String | Ingredient name (e.g., "All-Purpose Flour") |
| cat | String | Category: Dry, Dairy, Chocolate, Fruit, Spice, Flavour, Add-in, Nuts |
| unit | String | Unit of measurement: kg, g, litre, ml, piece, gram, pack |
| rate | Float | Current price per unit (INR) |
| rateHistory | JSON Array | [{date, timestamp, oldRate, newRate}] |
| stockQty | Float | Current stock quantity |
| minAlert | Float | Minimum alert threshold (triggers low-stock warning) |

### Pre-seeded Data
26 common bakery ingredients including:
- Flour (All-Purpose, Maida)
- Sugar (Fine, Powdered)
- Dairy (Cream, Butter, Eggs, Milk)
- Chocolate (Belgian Dark, Milk, White)
- Fruits (Mango Pulp, Strawberry, Kiwi)
- Nuts (Walnuts, Pistachios)
- Add-ins (Lotus Biscoff, Nutella)

### Business Rules
- Stock quantities can be atomically incremented (purchase) or decremented (usage)
- Rate updates are logged to rateHistory array for price trend analysis
- Soft delete preserves historical data; hard delete removes permanently
- Low-stock alert shown when stockQty <= minAlert

---

## Module 2: Inventory — Packaging

### Purpose
Track all packaging materials (boxes, boards, bags, stickers, cards) with the same stock tracking capabilities as ingredients.

### Data Fields
| Field | Type | Description |
|-------|------|-------------|
| name | String | Packaging name (e.g., "Cake Box 1kg") |
| type | String | Type: Box, Board, Bag, Sticker, Card, Accessory, Filler |
| size | String | Dimensions (e.g., "8×8 inch") |
| rate | Float | Current cost per unit (INR) |
| vendor | String | Supplier name |
| rateHistory | JSON Array | Price history |
| stockQty | Float | Current stock |
| minAlert | Float | Low-stock threshold |

### Pre-seeded Data
16 standard packaging items including cake boxes (500g, 1kg, 2kg), cake boards, carry bags, stickers, message cards.

---

## Module 3: Product Catalog

### Purpose
Maintain a catalog of all bakery products with auto-calculated cost and profit margin for pricing decisions.

### Data Fields
| Field | Type | Description |
|-------|------|-------------|
| name | String | Product name |
| cat | String | Category (Fusion Cake, Celebration Cake, Brownie Box, etc.) |
| emoji | String | Visual identifier |
| cost | Float | Cost price (calculated from ingredients + packaging + labour + overhead) |
| sell | Float | Selling price |
| margin | Float | Auto-calculated: ((sell - cost) / cost) * 100 |

### Pre-seeded Products (12)
Rasmalai Cake, Gulab Jamun Cake, Fruit Cake, Classic Chocolate Cake, Fudgy Brownie Box, Walnut Brownie Box, Oreo Cheesecake, Mango Cake, Kesar Pista Cake, Artisan Bread Loaf, Cookie Box, Chocolate Box

### Margin Calculation
```
margin = ((sellPrice - costPrice) / costPrice) × 100
```
Automatically calculated on create. Displayed as percentage.

---

## Module 4: Custom Orders

### Purpose
Track bespoke/custom cake orders (not standard catalog items) with delivery scheduling.

### Data Fields
| Field | Type | Description |
|-------|------|-------------|
| name | String | Order name or customer name |
| category | String | Order category |
| date | String | Delivery date |
| timestamp | Float | Unix timestamp |
| orderData | JSON | Full order details (flexible schema) |

---

## Module 5: Sales and GST Invoicing

### Purpose
Create professional GST-compliant invoices, track payment methods, and deliver to customers via WhatsApp.

### Invoice Structure
| Field | Type | Description |
|-------|------|-------------|
| invoiceNumber | String | Sequential: INV-0001, INV-0002, ... (unique per tenant) |
| customerName | String | Customer name |
| customerPhone | String | Customer phone (used for WhatsApp) |
| customerCity | String | Customer city |
| customerId | String | Optional link to CRM Customer record |
| items | JSON Array | [{name, qty, unitPrice}] |
| subtotal | Float | Sum of all items |
| discountAmt | Float | Discount applied |
| gstPct | Float | GST percentage (e.g., 5, 12, 18) |
| gstAmt | Float | Calculated GST amount |
| totalAmount | Float | Final amount (subtotal - discount + GST) |
| paymentMethod | String | Cash, Card, UPI, Online |
| inventoryDeducted | Boolean | Flag: has inventory been deducted for this invoice? |
| whatsappSent | Boolean | Was invoice sent via WhatsApp? |

### GST Formula
```
gstAmt = (subtotal - discountAmt) × (gstPct / 100)
totalAmount = subtotal - discountAmt + gstAmt
```

### WhatsApp Invoice Message
Auto-formatted message includes:
- Business name and greeting
- Invoice number and date
- Itemized line items
- Subtotal, GST, discount breakdown
- Total amount and payment method
- Signature by employee name

---

## Module 6: AI Invoice Scanner

### Purpose
Eliminate manual data entry when receiving supplier invoices by using Google Gemini Vision AI to extract all line items automatically.

### Process
1. Employee photographs a physical supplier invoice
2. Image converted to base64 in browser
3. Sent to Gemini Vision API with structured prompt
4. Gemini returns JSON array of line items
5. Employee reviews and adds to ingredient inventory

### Output Format
```json
[
  { "name": "All-Purpose Flour", "quantity": 25, "unit": "kg", "unitPrice": 48, "totalPrice": 1200 },
  { "name": "Sugar", "quantity": 10, "unit": "kg", "unitPrice": 50, "totalPrice": 500 }
]
```

### Model Discovery
The system dynamically discovers available Gemini models authorized for the API key and tries them in order, skipping deprecated or modality-incompatible models.

---

## Module 7: CRM — Customer Management

### Purpose
Maintain a complete customer database with order history statistics for relationship management and marketing.

### Data Fields
| Field | Type | Description |
|-------|------|-------------|
| name | String | Customer full name |
| phone | String | WhatsApp-compatible phone number |
| email | String | Optional email |
| city | String | City |
| address | String | Delivery address |
| notes | String | Special notes (e.g., "Prefers eggless") |
| totalOrders | Float | Total order count (self-healed) |
| totalValue | Float | Lifetime purchase value (self-healed) |
| lastOrderDate | String | Date of most recent order (self-healed) |

### Self-Healing Statistics
On every GET /api/customers request, the system recalculates totalOrders, totalValue, and lastOrderDate by scanning all SalesInvoices for each customer. If the stored values differ from the calculated values, they are automatically updated. This prevents any data inconsistency from accumulating over time.

---

## Module 8: Team Management

### Purpose
Manage employee accounts with role-based access, password management, and complete login session history.

### Roles
| Role | Auth Method | Permissions |
|------|-------------|-------------|
| owner | Google OAuth + password | Full access |
| admin | username + password | All except managing other admins |
| employee | username + password | Operational modules only |

### Session Tracking
Every login records:
- Login timestamp
- Logout timestamp (when recorded)
- IP address
- User agent (browser/device)
- Login count

Sessions retained for 90 days. Viewable on `/team` page.

---

## Module 9: Audit Log

### Purpose
Maintain an immutable record of every action taken by every employee for accountability and compliance.

### Logged Events
| Action Code | Description |
|-------------|-------------|
| ADD_INGREDIENT | New ingredient added |
| UPDATE_INGREDIENT_RATE | Ingredient price changed |
| UPDATE_STOCK | Stock quantity updated |
| DECREMENT_STOCK | Atomic stock deduction |
| INCREMENT_STOCK | Atomic stock addition |
| DELETE_INGREDIENT | Ingredient soft deleted |
| ADD_CUSTOMER | New customer added |
| UPDATE_CUSTOMER | Customer details changed |
| DELETE_CUSTOMER | Customer deleted |
| CREATE_SALE | Invoice created |
| DELETE_SALE | Invoice deleted |
| SEND_WHATSAPP | WhatsApp invoice sent |
| DEDUCT_INVENTORY | Inventory marked as deducted |
| SCAN_INVOICE | AI invoice scan performed |

Each entry includes: timestamp, date, time, employeeName, employeeEmail, action, details, entityType, entityId.

---

## Module 10: Reports

### Purpose
Provide revenue insights, top product analysis, and period-over-period comparisons.

### Report Types
- Revenue trends (by day/week/month)
- Top-selling products
- Payment method breakdown
- Period-over-period comparison (this month vs last month)

Data sourced from SalesInvoice records.

---

## Module 11: Platform Admin Console

### Purpose
BakeFlow's own admin interface for managing all bakery tenants on the platform.

### Capabilities
- View all tenant bakeries with stats (user count, product count, invoice count)
- Approve pending self-serve onboarding requests
- Suspend/reactivate tenants
- Change subscription plans
- View platform-wide metrics
- View per-bakery API usage and estimated costs (Gemini + Twilio)

### Cost Estimation
| API | Rate per call |
|-----|--------------|
| Gemini Vision | ~$0.00025 per scan |
| Twilio WhatsApp | ~$0.005 per message |

---

## Module 12: Public REST API and Embeddable Widget

### Purpose
Allow bakery websites to integrate with BakeFlow for real-time product display and order placement.

### Public API Endpoints
| Endpoint | Description |
|----------|-------------|
| GET /v1/products | Live product catalog |
| GET /v1/stock | Current stock levels |
| POST /v1/orders | Place an order from website |
| GET /v1/orders/:num/status | Check order status |

### Embeddable Widget
A `widget.js` script that can be embedded on any website with a single `<script>` tag. Displays the bakery's product catalog with live data. Styled to match the bakery's branding.

### Webhooks
Fired on `order.placed` event. Allows integration with fulfillment systems, Slack bots, Google Sheets, etc.

---

## Module 13: Data Export

### Purpose
Allow owners and admins to export business data as CSV for spreadsheet analysis, accounting, or backup.

### Exportable Datasets
| Dataset | File | Fields |
|---------|------|--------|
| Ingredients | ingredients_export.csv | id, name, cat, unit, rate, stockQty, minAlert |
| Packaging | packaging_export.csv | id, name, type, size, rate, vendor, stockQty, minAlert |
| Products | products_export.csv | id, name, cat, emoji, cost, sell, margin |
| Sales | sales_export.csv | invoiceNumber, customerName, phone, subtotal, gstAmt, totalAmount, paymentMethod, date |
| Customers | customers_export.csv | name, phone, email, city, totalOrders, totalValue, lastOrderDate |
