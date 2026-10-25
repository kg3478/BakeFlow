module.exports = (allowedRoles) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Session missing' });
    }
    // Platform admins and demo users bypass role guards so all features can be tested
    if (req.user.role === 'platform_admin' || req.user.role === 'demo_admin' || req.user.isDemo || roles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({ success: false, error: `Forbidden: Restricted to role(s): ${roles.join(', ')}` });
  };
};
