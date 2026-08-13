const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../sheets/sheetsClient');


const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || '');

// Helper to issue JWT
function generateToken(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  const expiry = process.env.JWT_EXPIRY || '7d';
  return jwt.sign(payload, secret, { expiresIn: expiry });
}

// Helper to record a login session (non-blocking — failures don't break login)
async function recordSession(userId, tenantId, req) {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
            || req.socket?.remoteAddress
            || null;
    const ua = req.headers['user-agent']?.slice(0, 255) || null;

    const session = await db.prisma.userSession.create({
      data: { userId, tenantId, ipAddress: ip, userAgent: ua }
    });

    await db.prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
        loginCount: { increment: 1 }
      }
    });

    return session.id; // Return sessionId so frontend can store it
  } catch (err) {
    console.warn('[Session Record] Failed:', err.message);
    return null;
  }
}

// POST /api/auth/google
// Verifies Google ID token + admin password combo
router.post('/google', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ success: false, error: 'Google token and password are required' });
  }

  try {
    // 1. Verify Google ID token
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ success: false, error: 'Google client ID is not configured on the server' });
    }
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();



    // 3. Find tenant for this owner
    let tenantId = 'default-tenant-uuid';
    const tenant = await db.prisma.tenant.findFirst({
      where: {
        OR: [
          { googleId: payload.sub },
          { email: payload.email }
        ]
      }
    });
    if (tenant) {
      tenantId = tenant.id;
    }

    // Determine platform admin status
    const adminUser = await db.prisma.platformAdmin.findUnique({
      where: { email: payload.email }
    });
    const isPlatformAdmin = adminUser || (process.env.PLATFORM_ADMIN_EMAIL && payload.email === process.env.PLATFORM_ADMIN_EMAIL);
    let role = 'owner'; // Default to owner role

    // Look up the database user
    let dbUser = null;
    if (tenant) {
      dbUser = await db.prisma.user.findFirst({
        where: { tenantId, email: payload.email, deleted: false }
      });
    }

    // 2. Check Password
    let isMatch = false;

    // Check platform admin password first (if they are a platform admin)
    if (isPlatformAdmin) {
      const adminPass = process.env.ADMIN_PASSWORD;
      if (!adminPass) {
        return res.status(500).json({ success: false, error: 'ADMIN_PASSWORD is not configured on the server' });
      }
      let matchesAdmin = false;
      if (adminPass.startsWith('$2a$') || adminPass.startsWith('$2b$')) {
        matchesAdmin = await bcrypt.compare(password, adminPass);
      } else {
        matchesAdmin = (password === adminPass);
      }
      if (matchesAdmin) {
        isMatch = true;
        role = 'platform_admin';
      }
    }

    // If platform password didn't match (or they aren't a platform admin), check bakery owner password
    if (!isMatch) {
      if (dbUser && dbUser.password && dbUser.password.startsWith('$2')) {
        isMatch = await bcrypt.compare(password, dbUser.password);
        if (isMatch) {
          role = 'owner';
        }
      } else {
        // Fallback: If no password is set in DB yet, allow the ADMIN_PASSWORD to claim owner account
        const adminPass = process.env.ADMIN_PASSWORD;
        if (adminPass) {
          if (adminPass.startsWith('$2a$') || adminPass.startsWith('$2b$')) {
            isMatch = await bcrypt.compare(password, adminPass);
          } else {
            isMatch = (password === adminPass);
          }
          if (isMatch) {
            role = 'owner';
          }
        }
      }
    }

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid password' });
    }

    const userPayload = {
      role,
      name: dbUser ? dbUser.name : (payload.name || process.env.OWNER_NAME || 'Admin'),
      email: payload.email,
      picture: payload.picture || '',
      tenantId: tenantId,
      userId: dbUser ? dbUser.id : null
    };
    const jwtToken = generateToken(userPayload);

    // Record session for DB-backed owner users
    let sessionId = null;
    if (dbUser) {
      sessionId = await recordSession(dbUser.id, tenantId, req);
    }

    return res.json({
      success: true,
      token: jwtToken,
      user: userPayload,
      sessionId
    });
  } catch (err) {
    console.error('Google verification error:', err.message);
    return res.status(401).json({ success: false, error: 'Google sign-in verification failed: ' + err.message });
  }
});

// POST /api/auth/employee
// Supports BOTH legacy .env index login AND new DB-backed username/password login
router.post('/employee', async (req, res) => {
  const { employeeIndex, username, password, googleToken } = req.body;
  let tenantId = req.body.tenantId || 'default-tenant-uuid';

  if (googleToken) {
    try {
      if (!process.env.GOOGLE_CLIENT_ID) {
        return res.status(500).json({ success: false, error: 'Google client ID is not configured on the server' });
      }
      const ticket = await client.verifyIdToken({
        idToken: googleToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      const tenant = await db.prisma.tenant.findFirst({
        where: {
          OR: [
            { googleId: payload.sub },
            { email: payload.email }
          ]
        }
      });
      if (tenant) {
        tenantId = tenant.id;
      }
    } catch (err) {
      console.warn('[Employee Login] Google verification failed:', err.message);
    }
  }

  if (tenantId !== 'default-tenant-uuid') {
    const tenant = await db.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (tenant && tenant.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'Access Denied: This bakery account is suspended. Please contact platform support.' });
    }
  }

  if (!password) {
    return res.status(400).json({ success: false, error: 'Password is required' });
  }

  try {
    // --- Path A: New database-backed employee login (username + password) ---
    if (username) {
      const user = await db.prisma.user.findUnique({
        where: { username_tenantId: { username, tenantId } }
      });

      if (!user || !user.active || user.deleted) {
        return res.status(401).json({ success: false, error: 'Invalid credentials or account inactive' });
      }

      const isMatch = await bcrypt.compare(password, user.password || '');
      if (!isMatch) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }

      const userPayload = {
        role: user.role,
        name: user.name,
        email: user.email || '',
        userId: user.id,
        tenantId: user.tenantId
      };

      const sessionId = await recordSession(user.id, user.tenantId, req);
      return res.json({
        success: true,
        token: generateToken(userPayload),
        user: userPayload,
        sessionId
      });
    }

    // --- Path B: Legacy .env index-based employee login (backward compatible) ---
    const idx = parseInt(employeeIndex);
    if (!idx || idx < 1 || idx > 5) {
      return res.status(400).json({ success: false, error: 'Employee username or index is required' });
    }

    // Check DB first for employees created via Team Management
    const dbEmployees = await db.prisma.user.findMany({
      where: { tenantId, role: 'employee', active: true, deleted: false },
      orderBy: { createdAt: 'asc' }
    });

    if (dbEmployees.length >= idx) {
      const user = dbEmployees[idx - 1];
      const isMatch = await bcrypt.compare(password, user.password || '');
      if (!isMatch) {
        return res.status(401).json({ success: false, error: 'Invalid employee password' });
      }
      const userPayload = {
        role: user.role,
        name: user.name,
        email: user.email || '',
        userId: user.id,
        tenantId: user.tenantId
      };
      const sessionId = await recordSession(user.id, user.tenantId, req);
      return res.json({
        success: true,
        token: generateToken(userPayload),
        user: userPayload,
        sessionId
      });
    }

    // Fallback: .env-based legacy credentials
    const empPass = process.env[`EMPLOYEE_${idx}_PASSWORD`] || `emp${idx}pass`;
    const empName = process.env[`EMPLOYEE_${idx}_NAME`] || `Employee ${idx}`;
    let isMatch = empPass.startsWith('$2') ? await bcrypt.compare(password, empPass) : (password === empPass);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid employee password' });
    }
    const userPayload = {
      role: 'employee',
      name: empName,
      email: '',
      employeeIndex: idx,
      tenantId
    };
    return res.json({
      success: true,
      token: generateToken(userPayload),
      user: userPayload
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Authentication error: ' + err.message });
  }
});

// GET /api/auth/employees
// Returns list of employee names (DB-first, .env fallback)
router.get('/employees', async (req, res) => {
  try {
    let tenantId = 'default-tenant-uuid'; // Fallback for pre-login page context
    const googleToken = req.headers['x-google-token'];

    if (googleToken) {
      try {
        if (!process.env.GOOGLE_CLIENT_ID) {
          return res.status(500).json({ success: false, error: 'Google client ID not configured' });
        }
        const ticket = await client.verifyIdToken({
          idToken: googleToken,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const tenant = await db.prisma.tenant.findFirst({
          where: {
            OR: [
              { googleId: payload.sub },
              { email: payload.email }
            ]
          }
        });
        if (tenant) {
          tenantId = tenant.id;
        }
      } catch (err) {
        console.warn('[Get Employees] Google verification failed:', err.message);
      }
    }

    const dbEmployees = await db.prisma.user.findMany({
      where: { tenantId, role: 'employee', active: true, deleted: false },
      select: { id: true, name: true, username: true },
      orderBy: { createdAt: 'asc' }
    });

    if (dbEmployees.length > 0) {
      return res.json(dbEmployees.map((e, i) => ({ index: i + 1, name: e.name, username: e.username })));
    }

    // .env fallback
    const employees = [];
    for (let i = 1; i <= 5; i++) {
      const name = process.env[`EMPLOYEE_${i}_NAME`] || `Employee ${i}`;
      employees.push({ index: i, name, username: `employee_${i}` });
    }
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/config
// Returns public config for frontend (GOOGLE_CLIENT_ID, BUSINESS_NAME)
router.get('/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    businessName: process.env.BUSINESS_NAME || 'BakeFlow',
    businessPhone: process.env.BUSINESS_PHONE || '',
  });
});

// POST /api/auth/request-access
// Public self-serve onboarding request
router.post('/request-access', async (req, res) => {
  const { name, email, googleId, phone, password } = req.body;
  if (!name || !email || !googleId) {
    return res.status(400).json({ success: false, error: 'Bakery name, owner email, and Google ID are required' });
  }

  try {
    // Check if tenant already exists
    const existing = await db.prisma.tenant.findFirst({
      where: {
        OR: [
          { googleId },
          { email }
        ]
      }
    });

    if (existing) {
      return res.status(409).json({ success: false, error: 'A bakery with this email or Google ID already exists or is pending approval.' });
    }

    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 12);
    }

    // Create a pending tenant record
    const request = await db.prisma.tenant.create({
      data: {
        name,
        email,
        googleId,
        phone: phone || null,
        password: hashedPassword,
        status: 'pending',
        plan: 'free'
      }
    });

    res.json({ success: true, message: 'Your onboarding request has been submitted successfully and is awaiting review.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/auth/otp-request
// Generates a 6-digit WhatsApp OTP and sends it to the owner's phone number
router.post('/otp-request', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Owner email is required' });
  }

  try {
    // Find the owner user across all tenants (owners have unique emails)
    const user = await db.prisma.user.findFirst({
      where: { email, role: 'owner', deleted: false }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'No active bakery owner account found with this email.' });
    }

    if (!user.phone) {
      return res.status(400).json({ success: false, error: 'Owner phone number is not configured in the system. Please contact the platform administrator to set your phone number.' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Save to database
    await db.prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode: otp,
        otpExpires: expires
      }
    });

    // Format phone number for Twilio Routing
    let targetPhone = user.phone.trim().replace(/[^0-9+]/g, '');
    if (!targetPhone.startsWith('+')) {
      if (targetPhone.length === 10) targetPhone = '+91' + targetPhone;
      else targetPhone = '+' + targetPhone;
    }

    // Send via Twilio WhatsApp
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${targetPhone}`,
      body: `🎂 *BakeFlow Verification Code*\n\nYour 6-digit verification code is: *${otp}*\n\nThis code expires in 10 minutes. Use this code to authorize your password update.`,
    });

    res.json({ success: true, message: `OTP sent successfully to WhatsApp ending in ...${user.phone.slice(-4)}` });
  } catch (err) {
    console.error('[OTP Request] Failed:', err.message);
    res.status(500).json({ success: false, error: 'Failed to send WhatsApp verification code: ' + err.message });
  }
});

// POST /api/auth/otp-verify
// Verifies WhatsApp OTP and sets new owner password
router.post('/otp-verify', async (req, res) => {
  const { email, otp, password } = req.body;
  if (!email || !otp || !password) {
    return res.status(400).json({ success: false, error: 'Email, OTP code, and new password are required' });
  }

  try {
    const user = await db.prisma.user.findFirst({
      where: { email, role: 'owner', deleted: false }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'No active bakery owner account found.' });
    }

    if (!user.otpCode || user.otpCode !== otp.trim()) {
      return res.status(400).json({ success: false, error: 'Invalid verification code.' });
    }

    if (!user.otpExpires || new Date() > user.otpExpires) {
      return res.status(400).json({ success: false, error: 'Verification code has expired. Please request a new code.' });
    }

    // Code is valid! Hash the new password and clear the OTP fields
    const hashedPassword = await bcrypt.hash(password, 12);
    await db.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        otpCode: null,
        otpExpires: null
      }
    });

    res.json({ success: true, message: 'Password updated successfully! You can now log in using your new password.' });
  } catch (err) {
    console.error('[OTP Verify] Failed:', err.message);
    res.status(500).json({ success: false, error: 'Failed to verify OTP or update password: ' + err.message });
  }
});

module.exports = router;
