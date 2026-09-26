# BakeFlow ERP — Deployment Guide

## 1. Prerequisites

| Requirement | Details |
|-------------|---------|
| Node.js | Version 18.0.0 or higher |
| PostgreSQL | Free Neon serverless account (console.neon.tech) |
| Google Cloud | OAuth 2.0 Client ID (for Google Sign-In) |
| Twilio (optional) | For WhatsApp delivery + OTP password reset |
| Google AI (optional) | Gemini API key for AI invoice scanning |

---

## 2. Local Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/kg3478/BakeFlow.git
cd BakeFlow

# 2. Install backend dependencies
cd backend
npm install

# 3. Copy and configure environment variables
cp .env.example .env
# Edit .env with your values (see Environment Variables section)

# 4. Push database schema to Neon
npx prisma db push

# 5. Start the development server
npm start
# OR for auto-reload:
npm run dev

# 6. Open browser
# http://localhost:3000           → Main ERP
# http://localhost:3000/admin     → Platform Admin
# http://localhost:3000/signup    → Self-serve onboarding
# http://localhost:3000/team      → Employee session monitor
```

---

## 3. Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string | `postgresql://user:pass@host/db?sslmode=require` |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID | `123456789.apps.googleusercontent.com` |
| `JWT_SECRET` | Min 32-char random string | `your-super-secret-jwt-key-at-least-32-chars` |
| `ADMIN_PASSWORD` | Bakery owner + platform admin password | `SecurePassword123!` |
| `PLATFORM_ADMIN_EMAIL` | Google email for platform admin access | `admin@yourdomain.com` |

### Optional Variables (Feature-enabling)

| Variable | Feature | Notes |
|----------|---------|-------|
| `GEMINI_API_KEY` | AI invoice scanning | Without this, /api/invoice/scan returns error |
| `TWILIO_ACCOUNT_SID` | WhatsApp messaging | Without this, WhatsApp send fails |
| `TWILIO_AUTH_TOKEN` | WhatsApp messaging | Required with TWILIO_ACCOUNT_SID |
| `TWILIO_WHATSAPP_FROM` | WhatsApp sender | Format: `whatsapp:+14155238886` |
| `CORS_ORIGIN` | Restrict API to specific domains | Comma-separated list; leave unset for dev |
| `BUSINESS_NAME` | Displayed in WhatsApp messages | Default: "BakeFlow" |
| `BUSINESS_PHONE` | Shown in WhatsApp footer | Your bakery contact number |
| `JWT_EXPIRY` | Token lifetime | Default: "7d" |
| `GEMINI_MODEL` | Override Gemini model to use | Default: auto-discovered |

---

## 4. Database Setup

### Neon PostgreSQL (Recommended)
1. Create a free account at [console.neon.tech](https://console.neon.tech)
2. Create a new project and database
3. Copy the connection string to `DATABASE_URL` in `.env`
4. Run `npx prisma db push` to create all tables

### Schema Management
```bash
# Push schema changes (development)
npm run prisma:push

# Generate Prisma client after schema changes
npm run build

# Open Prisma Studio (visual DB browser)
npm run prisma:studio
```

### Initial Admin Setup
After running `npx prisma db push`:
1. Navigate to `http://localhost:3000/admin` 
2. Sign in with your Google account (matching `PLATFORM_ADMIN_EMAIL`)
3. Use the "Add Bakery" feature to create the first tenant
4. The owner user is automatically created

---

## 5. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Navigate to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add **Authorized JavaScript Origins:**
   - `http://localhost:3000` (development)
   - `https://your-app.onrender.com` (production)
7. Add **Authorized Redirect URIs:** (same as origins)
8. Copy the **Client ID** to `GOOGLE_CLIENT_ID` in `.env`

> Do NOT add the OAuth secret to .env — only the Client ID is used.

---

## 6. Deploying to Render

### Service Configuration

| Setting | Value |
|---------|-------|
| Service Type | Web Service |
| Root Directory | `backend` |
| Build Command | `npm install && npm run build` |
| Start Command | `node server.js` |
| Environment | Node |

### Steps
1. Create a [Render](https://render.com) account
2. Connect your GitHub repository
3. Create a new **Web Service**
4. Set Root Directory to `backend`
5. Set Build and Start commands as above
6. Add all environment variables in the Render dashboard
7. Deploy

### Important: Google OAuth for Production
After deploying, add your Render URL to Google Cloud Console:
- Authorized JavaScript Origins: `https://your-app.onrender.com`

---

## 7. Twilio WhatsApp Setup

1. Create a Twilio account at [twilio.com](https://twilio.com)
2. Go to **Messaging → Try it out → Send a WhatsApp message**
3. Follow the sandbox setup OR apply for a production WhatsApp number
4. Copy credentials to:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_WHATSAPP_FROM` (format: `whatsapp:+14155238886`)

---

## 8. Gemini AI Setup

1. Go to [Google AI Studio](https://aistudio.google.com)
2. Click **Get API key**
3. Copy the key to `GEMINI_API_KEY` in `.env`

> The system auto-discovers available models and falls back through candidates if one is unavailable.

---

## 9. Production Security Checklist

- [ ] `JWT_SECRET` is at least 32 random characters
- [ ] `ADMIN_PASSWORD` is not a default value (not `admin123`, `change-me-in-production`)
- [ ] `CORS_ORIGIN` is set to your production domain
- [ ] `NODE_ENV=production` is set
- [ ] Database connection uses SSL (`?sslmode=require` in Neon URL)
- [ ] Gemini API key has appropriate usage limits set in Google Cloud
- [ ] Twilio account has appropriate messaging limits
- [ ] Google OAuth Client ID only has production origins authorized (not localhost)

---

## 10. Monitoring and Maintenance

### Health Check
```
GET /api/health
```
Returns server status and database connectivity.

### Gemini Diagnostic
```
GET /api/gemini-status
```
Tests available Gemini models and returns compatibility results.

### Database Maintenance
- Neon handles automated backups
- Use `npx prisma studio` to visually inspect data
- AuditLog grows continuously — consider periodic archival for large deployments

### Log Monitoring
- All unhandled errors are logged to console with stack traces
- Render provides log streaming in the dashboard
- Middleware logs rate limit violations and auth failures
