const express = require('express');
const router = express.Router();
const db = require('../sheets/sheetsClient');

// GET /api/invoice/models - list available Gemini models (debug)
router.get('/models', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'GEMINI_API_KEY not set' });
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=50&key=${apiKey}`);
    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({
        error: data.error?.message || `Failed to list models [${r.status}]`,
        details: data
      });
    }
    const names = (data.models || []).map(m => m.name);
    res.json({ count: names.length, models: names });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const enforceQuota = require('../middleware/quotaEnforcer');

// POST /api/invoice/scan - scan supplier invoice with Gemini Vision
// Uses v1beta REST API with fallback models for maximum reliability
router.post('/scan', enforceQuota, async (req, res) => {
  try {
    const { image, mimeType } = req.body;
    if (!image) return res.status(400).json({ error: 'No image provided' });
    if (!process.env.GEMINI_API_KEY) return res.status(400).json({ error: 'GEMINI_API_KEY not configured' });

    const apiKey = process.env.GEMINI_API_KEY;

    // Ordered candidate models (custom env var or best vision models)
    const candidateModels = process.env.GEMINI_MODEL
      ? [process.env.GEMINI_MODEL]
      : ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-2.5-flash', 'gemini-1.5-pro'];

    const prompt = `This is a purchase invoice for a bakery/food business.
Extract ALL line items and return ONLY a valid JSON array.
Format each item as: {"name": "...", "quantity": 0, "unit": "...", "unitPrice": 0, "totalPrice": 0}
If unit is missing, infer from context (kg, g, litre, ml, piece, packet, box).
Return ONLY the JSON array with no explanation, no markdown, no extra text.`;

    const body = {
      contents: [{
        parts: [
          { inlineData: { mimeType: mimeType || 'image/jpeg', data: image } },
          { text: prompt }
        ]
      }]
    };

    let lastError = null;
    let scanSuccess = false;
    let items = [];

    for (const model of candidateModels) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const errText = await response.text();
          let cleanMessage = `Gemini API error [${response.status}]`;
          try {
            const errObj = JSON.parse(errText);
            if (errObj.error?.message) {
              cleanMessage = errObj.error.message;
            }
          } catch (_) {
            cleanMessage = errText || cleanMessage;
          }

          // If 404 (model not found on this version/tier), attempt next fallback model
          if (response.status === 404) {
            console.warn(`[invoice scan] Model '${model}' returned 404: ${cleanMessage}. Trying next model...`);
            lastError = new Error(cleanMessage);
            continue;
          }

          // For quota/auth/client errors, don't keep retrying models
          throw new Error(cleanMessage);
        }

        const data = await response.json();
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        text = text.replace(/```json\n?|\n?```/g, '').trim();

        try {
          items = JSON.parse(text);
        } catch (e) {
          const match = text.match(/\[[\s\S]*\]/);
          if (match) {
            try { items = JSON.parse(match[0]); } catch (_) { items = []; }
          } else {
            items = [];
          }
        }

        if (!Array.isArray(items)) {
          if (items && Array.isArray(items.items)) {
            items = items.items;
          } else {
            items = [];
          }
        }

        scanSuccess = true;
        break;
      } catch (err) {
        lastError = err;
        if (err.message && err.message.includes('404')) {
          continue;
        }
        throw err;
      }
    }

    if (!scanSuccess) {
      throw lastError || new Error('All candidate Gemini models failed to process the invoice.');
    }

    const employeeName = req.user?.name || req.headers['x-employee-name'] || 'Unknown';
    const employeeEmail = req.user?.email || req.headers['x-employee-email'] || '';
    await db.addLog('SCAN_INVOICE', `${items.length} items detected`, employeeName, employeeEmail, 'SupplierInvoice', '');

    res.json({ items, count: items.length });
  } catch (err) {
    console.error('[invoice] scan:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
