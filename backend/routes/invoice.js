const express = require('express');
const router = express.Router();
const db = require('../sheets/sheetsClient');

// GET /api/invoice/models - list available Gemini models (debug)
router.get('/models', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'GEMINI_API_KEY not set' });
    const r = await fetch(`https://generativelanguage.googleapis.com/v1/models?pageSize=50&key=${apiKey}`);
    const data = await r.json();
    const names = (data.models || []).map(m => m.name);
    res.json({ count: names.length, models: names });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const enforceQuota = require('../middleware/quotaEnforcer');

// POST /api/invoice/scan - scan supplier invoice with Gemini Vision
// Uses direct REST API call to v1 endpoint (bypasses npm package version issues)
router.post('/scan', enforceQuota, async (req, res) => {
  try {
    const { image, mimeType } = req.body;
    if (!image) return res.status(400).json({ error: 'No image provided' });
    if (!process.env.GEMINI_API_KEY) return res.status(400).json({ error: 'GEMINI_API_KEY not configured' });

    const apiKey = process.env.GEMINI_API_KEY;
    const model = 'gemini-1.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `This is a purchase invoice for a bakery/food business.
Extract ALL line items and return ONLY a valid JSON array.
Format each item as: {"name": "...", "quantity": 0, "unit": "...", "unitPrice": 0, "totalPrice": 0}
If unit is missing, infer from context (kg, g, litre, ml, piece, packet, box).
Return ONLY the JSON array with no explanation, no markdown, no extra text.`;

    const body = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } },
          { text: prompt }
        ]
      }]
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error [${response.status}]: ${errText}`);
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    text = text.replace(/```json\n?|\n?```/g, '').trim();

    let items = [];
    try { items = JSON.parse(text); } catch (e) { items = []; }

    const e = { name: req.headers['x-employee-name'] || 'Unknown', email: req.headers['x-employee-email'] || '' };
    await db.addLog('SCAN_INVOICE', `${items.length} items detected`, e.name, e.email, 'SupplierInvoice', '');

    res.json({ items, count: items.length });
  } catch (err) {
    console.error('[invoice] scan:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
