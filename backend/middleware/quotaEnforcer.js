const db = require('../sheets/sheetsClient');

const PLAN_LIMITS = {
  free: { gemini_scans: 30, whatsapp_sends: 50 },
  starter: { gemini_scans: 200, whatsapp_sends: 500 },
  pro: { gemini_scans: 1000, whatsapp_sends: 2000 }
};

async function enforceQuota(req, res, next) {
  const tenantId = req.user?.tenantId;
  if (!tenantId || req.user?.isDemo || req.user?.role === 'demo_admin') return next();

  const path = req.baseUrl + req.path; // e.g. /api/invoice/scan or /api/sales/:id/whatsapp

  try {
    const tenant = await db.prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) return next();

    const plan = tenant.plan || 'free';
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startTimestamp = firstDayOfMonth.getTime();

    // Check Gemini AI scan limit
    if (path.includes('/scan')) {
      const scanCount = await db.prisma.auditLog.count({
        where: {
          tenantId,
          action: 'SCAN_INVOICE',
          timestamp: { gte: startTimestamp }
        }
      });

      if (scanCount >= limits.gemini_scans) {
        return res.status(402).json({
          success: false,
          error: `Quota Exceeded: Your current plan (${plan}) allows a maximum of ${limits.gemini_scans} Gemini AI scans per month. Please contact support to upgrade.`
        });
      }
    }

    // Check Twilio WhatsApp limit
    if (path.includes('/whatsapp')) {
      const whatsappCount = await db.prisma.auditLog.count({
        where: {
          tenantId,
          action: 'SEND_WHATSAPP',
          timestamp: { gte: startTimestamp }
        }
      });

      if (whatsappCount >= limits.whatsapp_sends) {
        return res.status(402).json({
          success: false,
          error: `Quota Exceeded: Your current plan (${plan}) allows a maximum of ${limits.whatsapp_sends} Twilio WhatsApp messages per month. Please contact support to upgrade.`
        });
      }
    }

    next();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = enforceQuota;
