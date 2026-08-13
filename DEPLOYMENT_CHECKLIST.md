# 🚀 BakeFlow — Render Deployment Checklist

Use this checklist every time you deploy or re-deploy BakeFlow to Render.

---

## Before You Push to GitHub

- [ ] `.env` is in `.gitignore` ✅ — confirm with `git status` that `backend/.env` is NOT listed
- [ ] `backend/.env.example` has no real credentials (only placeholders)
- [ ] No `client_secret_*.json` files are tracked: `git ls-files | grep client_secret`
- [ ] Test locally: `cd backend && npm start` — server boots without errors

---

## Render Web Service Settings

| Setting | Correct Value |
|---|---|
| **Root Directory** | `backend` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `node server.js` |
| **Environment** | Node |
| **Node Version** | 18+ (set in `engines` in package.json) |

> ⚠️ The build command runs `prisma generate` via `npm run build` — this generates the Prisma client from your schema. **Required on every deploy.**

---

## Required Environment Variables (set in Render Dashboard)

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host.neon.tech/neondb?sslmode=require` | From Neon console |
| `GOOGLE_CLIENT_ID` | `42992238881-xyz.apps.googleusercontent.com` | From Google Cloud Console |
| `JWT_SECRET` | 64+ random hex chars | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ADMIN_PASSWORD` | `YourSecurePassword123!` | Min 12 chars, not 'admin123' |
| `PLATFORM_ADMIN_EMAIL` | `you@gmail.com` | Your Google email for `/admin` access |
| `GEMINI_API_KEY` | `AIzaSy...` | From Google AI Studio — required for AI scan |
| `TWILIO_ACCOUNT_SID` | `ACxxxxx...` | From Twilio Console — required for WhatsApp |
| `TWILIO_AUTH_TOKEN` | `your_token` | From Twilio Console |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+14155238886` | Twilio sandbox or approved number |
| `BUSINESS_NAME` | `My Awesome Bakery` | Shown in invoices and WhatsApp messages |
| `BUSINESS_PHONE` | `+91 98765 43210` | Shown in WhatsApp messages |

---

## Google OAuth — Authorize Your Render URL

In [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services** → **Credentials** → your OAuth 2.0 Client:

- **Authorized JavaScript Origins**:
  ```
  https://your-app-name.onrender.com
  ```
- **Authorized Redirect URIs**:
  ```
  https://your-app-name.onrender.com
  ```

> ⚠️ Without this step, Google Sign-In will fail with `redirect_uri_mismatch`.

---

## First Deploy Verification

After first deploy, open your Render URL and verify:

- [ ] `/api/health` returns `{ "status": "ok", "db": "connected" }`
- [ ] `/` loads the BakeFlow login screen
- [ ] Google Sign-In button appears (requires `GOOGLE_CLIENT_ID` to be correct)
- [ ] Login with your Google account + `ADMIN_PASSWORD` works
- [ ] `/admin` loads the Platform Admin console
- [ ] Onboard a test bakery from `/admin` → Manage Bakeries → Add Bakery
- [ ] Log in as the bakery owner — check that dashboard loads with seed data

---

## Twilio WhatsApp Sandbox Setup (for testing)

1. Go to [Twilio Console](https://console.twilio.com) → Messaging → Try it out → WhatsApp
2. Follow instructions to join the sandbox (send a message to `+1 415 523 8886`)
3. Set `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` in Render
4. Test by creating a sales invoice and clicking "Send WhatsApp"

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `FATAL: JWT_SECRET must be at least 32 characters` | JWT_SECRET too short | Generate a longer secret |
| `FATAL: ADMIN_PASSWORD is set to a default value` | Default password detected | Set a strong password in Render env vars |
| Google Sign-In: `redirect_uri_mismatch` | Render URL not authorized in Google Console | Add your Render URL to authorized origins |
| `P1001: Can't reach database server` | Wrong DATABASE_URL | Copy connection string from Neon console |
| `P1010: User was denied access` | Wrong DB credentials | Check username/password in DATABASE_URL |
| WhatsApp: `21608` error | Phone number not in Twilio sandbox | Ask customer to join sandbox first |
| AI Scan: `404 Not Found` | Wrong Gemini model or expired API key | Check GEMINI_API_KEY is valid at aistudio.google.com |
| `/admin` shows 403 | Email not matching PLATFORM_ADMIN_EMAIL | Check env var matches your Google account email exactly |
