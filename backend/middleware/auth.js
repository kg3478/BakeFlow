const jwt = require('jsonwebtoken');
const db = require('../sheets/sheetsClient');

module.exports = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'Authorization header required' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ success: false, error: 'Token format must be Bearer <token>' });
  }

  const token = parts[1];
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('[Auth Middleware] JWT_SECRET is not set in environment variables!');
      return res.status(500).json({ success: false, error: 'Server configuration error' });
    }
    const decoded = jwt.verify(token, secret);

    // Verify tenant status for ERP routes (exclude platform admin API routes)
    const isApiAdminRoute = req.path.startsWith('/admin') || req.path.startsWith('/api/admin');
    if (!isApiAdminRoute && decoded.tenantId) {
      const tenant = await db.prisma.tenant.findUnique({
        where: { id: decoded.tenantId }
      });
      if (!tenant || tenant.status === 'suspended') {
        return res.status(403).json({ success: false, error: 'Access Denied: This bakery account is suspended. Please contact platform support.' });
      }

      // Enforce 2-month trial limit on Free Beta plan
      if (tenant.plan === 'free') {
        const twoMonthsMs = 60 * 24 * 60 * 60 * 1000;
        const elapsed = Date.now() - new Date(tenant.createdAt).getTime();
        if (elapsed > twoMonthsMs) {
          return res.status(403).json({ success: false, error: 'Access Denied: Your 2-month Free Beta period has ended. Please contact support to upgrade.' });
        }
      }
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};
