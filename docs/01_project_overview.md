# BakeFlow ERP — Project Overview

## 1. Introduction

**BakeFlow ERP** is a production-ready, multi-tenant Software-as-a-Service (SaaS) Enterprise Resource Planning (ERP) system purpose-built for bakery businesses. It covers the complete business lifecycle of a bakery from raw material inventory, product costing, GST billing, CRM, AI-powered automation, team management, and a public REST API for website integration.

**Live Stack:** Render (hosting) · Neon PostgreSQL (database) · Google OAuth (auth) · Twilio WhatsApp (messaging) · Google Gemini AI (vision)

---

## 2. Problem Statement

Bakery businesses — especially small to medium Indian bakeries — face significant operational inefficiencies:
- Manual inventory tracking leads to stockouts and wastage.
- No systematic product costing → unknown profit margins.
- Paper-based billing with no GST compliance.
- No customer relationship management.
- No visibility into employee activity.
- High cost of traditional ERP software not designed for bakeries.

**BakeFlow solves all of the above** in a single, affordable, cloud-hosted SaaS product.

---

## 3. Goals and Objectives

| Goal | Description |
|------|-------------|
| Multi-Tenancy | One codebase serving many bakeries with complete data isolation |
| Inventory Control | Track ingredients + packaging with stock alerts and rate history |
| Product Costing | Auto-calculate cost, selling price, and profit margin |
| GST Invoicing | Generate GST-compliant invoices and deliver via WhatsApp |
| AI Automation | Photograph supplier invoices and auto-extract line items via Gemini Vision |
| CRM | Maintain complete customer history with self-healing stats |
| Team Management | Role-based employee accounts with login session audit |
| Platform Admin | A separate super-admin console to manage all bakery tenants |
| Public API | REST API for website integration with webhook support |

---

## 4. Target Users

| User Type | Description |
|-----------|-------------|
| Bakery Owner | Full access; sets up the bakery, manages team, views reports |
| Admin Employee | Elevated employee; can manage team and all operations |
| Employee | Day-to-day operations; billing, inventory updates, CRM |
| Platform Admin | BakeFlow super-admin; approves bakeries, views platform metrics |
| Website Visitor | External customer placing an order via embedded widget |

---

## 5. Business Modules

| Module | Key Features |
|--------|-------------|
| Inventory Ingredients | Add/edit ingredients, rate history, stock tracking, atomic increment/decrement, low-stock alerts, soft delete/restore |
| Inventory Packaging | Same as ingredients but for packaging materials (boxes, boards, bags, stickers) |
| Product Catalog | Add products with category, emoji, cost price, selling price, auto-calculated margin |
| Custom Orders | Track bespoke cake orders with delivery scheduling |
| Sales and Invoicing | Create GST invoices (subtotal, discount, GST %, payment method), WhatsApp delivery, inventory deduction flag |
| AI Invoice Scanner | Upload photo of supplier invoice, Gemini Vision extracts all line items to JSON |
| CRM | Full customer records: total orders, total spend, last order date, self-healing stats |
| Team Management | Employee CRUD, role assignment, password management, login session log |
| Audit Log | Immutable trail of every action, employee name, entity type, entity ID |
| Reports | Revenue trends, top products, period-over-period comparisons |
| Data Export | CSV downloads for ingredients, packaging, products, sales, customers |
| API Keys | Generate/manage SHA-256 hashed API keys for public API access |
| Settings | Labour rates, overhead costs, webhook URL configuration |
| Platform Admin Console | Manage tenants (approve, suspend, reactivate), view platform metrics and API cost estimates |
| Public REST API | /v1/products, /v1/stock, /v1/orders — API key authenticated |
| Embeddable Widget | Script tag drop-in for product catalog on external websites |
| Webhooks | HMAC-SHA256 signed POST notifications on order.placed events |

---

## 6. Subscription Plans

| Plan | AI Scans/month | WhatsApp/month | Max Concurrent Bakeries |
|------|---------------|----------------|--------------------------|
| Free Beta | 30 | 50 | 5 |
| Starter | 200 | 500 | Unlimited |
| Pro | 1,000 | 2,000 | Unlimited |

> Quotas are enforced by counting AuditLog entries — no separate counter table needed.
> Free Beta tenants are also auto-locked after 2 months.

---

## 7. Competitive Advantages

- Zero framework overhead on the frontend (Vanilla JS + HTML/CSS — zero build step)
- Architectural tenant isolation via Prisma query extension — cross-tenant data leakage is architecturally impossible
- AI-first — Gemini Vision invoice scanning eliminates manual data entry
- WhatsApp-native — invoice delivery and OTP password reset via Twilio
- Single-service deployment — backend serves frontend as static files (Render, no separate CDN needed)
- India-first — GST invoicing, INR pricing, Indian ingredient catalog, +91 phone defaults
