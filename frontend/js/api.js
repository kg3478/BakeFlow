// ============================================================
// BakeFlow ERP — API Client
// All functions return Promises resolving to parsed JSON
// Employee name/email sent as headers on every request
// ============================================================

const PROD_BACKEND_API_URL = ''; // Left empty to automatically use the same origin (relative path)

const API = {
  _base: '/api',

  async _req(path, opts = {}) {
    const token = localStorage.getItem('bakeflow_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Keep session headers as fallback (requireAuth will overwrite/ignore them on server if authenticated)
    const sess = JSON.parse(localStorage.getItem('bakeflow_session') || '{}');
    if (sess.name)  headers['X-Employee-Name']  = sess.name;
    if (sess.email) headers['X-Employee-Email'] = sess.email;

    const res = await fetch(this._base + path, {
      headers,
      ...opts,
    });
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('bakeflow_token');
        localStorage.removeItem('bakeflow_session');
        window.location.reload();
      }
      const msg = await res.text();
      let errorText = msg;
      try {
        const parsed = JSON.parse(msg);
        if (parsed.error) errorText = parsed.error;
        else if (parsed.message) errorText = parsed.message;
      } catch (_) {}
      throw new Error(errorText || `HTTP ${res.status}`);
    }
    return res.json();

  },

  // ── Auth ──────────────────────────────────────────────────────
  loginGoogle(token, password) {
    return this._req('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  },
  loginEmployee(empVal, password, googleToken) {
    const isIndex = /^\d+$/.test(empVal);
    const body = { password };
    if (googleToken) {
      body.googleToken = googleToken;
    }
    if (isIndex) {
      body.employeeIndex = empVal;
    } else {
      body.username = empVal;
    }
    return this._req('/auth/employee', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  getEmployees(googleToken) {
    const headers = {};
    if (googleToken) {
      headers['X-Google-Token'] = googleToken;
    }
    return this._req('/auth/employees', { headers });
  },
  getConfig()    { return this._req('/auth/config'); },


  // ── Ingredients ───────────────────────────────────────────────
  getIngredients() { return this._req('/ingredients'); },

  addIngredient(item) {
    return this._req('/ingredients', { method: 'POST', body: JSON.stringify(item) });
  },

  updateIngredientRate(id, rate, rateHistory) {
    return this._req(`/ingredients/${id}/rate`, {
      method: 'PUT', body: JSON.stringify({ rate, rateHistory }),
    });
  },

  updateIngredientStock(id, stockQty, minAlert) {
    return this._req(`/ingredients/${id}/stock`, {
      method: 'PUT', body: JSON.stringify({ stockQty, minAlert }),
    });
  },

  decrementIngredientStock(id, amount) {
    return this._req(`/ingredients/${id}/decrement`, {
      method: 'POST', body: JSON.stringify({ amount }),
    });
  },

  incrementIngredientStock(id, amount) {
    return this._req(`/ingredients/${id}/increment`, {
      method: 'POST', body: JSON.stringify({ amount }),
    });
  },

  softDeleteIngredient(id) { return this._req(`/ingredients/${id}`, { method: 'DELETE' }); },
  restoreIngredient(id)    { return this._req(`/ingredients/${id}/restore`, { method: 'POST' }); },
  hardDeleteIngredient(id) { return this._req(`/ingredients/${id}/hard`, { method: 'DELETE' }); },

  // ── Packaging ─────────────────────────────────────────────────
  getPackaging() { return this._req('/packaging'); },

  addPackaging(item) {
    return this._req('/packaging', { method: 'POST', body: JSON.stringify(item) });
  },

  updatePackagingRate(id, rate, rateHistory) {
    return this._req(`/packaging/${id}/rate`, {
      method: 'PUT', body: JSON.stringify({ rate, rateHistory }),
    });
  },

  updatePackagingStock(id, stockQty, minAlert) {
    return this._req(`/packaging/${id}/stock`, {
      method: 'PUT', body: JSON.stringify({ stockQty, minAlert }),
    });
  },

  decrementPackagingStock(id, amount) {
    return this._req(`/packaging/${id}/decrement`, {
      method: 'POST', body: JSON.stringify({ amount }),
    });
  },

  incrementPackagingStock(id, amount) {
    return this._req(`/packaging/${id}/increment`, {
      method: 'POST', body: JSON.stringify({ amount }),
    });
  },

  softDeletePackaging(id) { return this._req(`/packaging/${id}`, { method: 'DELETE' }); },
  restorePackaging(id)    { return this._req(`/packaging/${id}/restore`, { method: 'POST' }); },
  hardDeletePackaging(id) { return this._req(`/packaging/${id}/hard`, { method: 'DELETE' }); },

  // ── Products ──────────────────────────────────────────────────
  getProducts() { return this._req('/products'); },

  addProduct(item) {
    return this._req('/products', { method: 'POST', body: JSON.stringify(item) });
  },

  softDeleteProduct(id) { return this._req(`/products/${id}`, { method: 'DELETE' }); },
  restoreProduct(id)    { return this._req(`/products/${id}/restore`, { method: 'POST' }); },
  hardDeleteProduct(id) { return this._req(`/products/${id}/hard`, { method: 'DELETE' }); },

  // ── Orders ────────────────────────────────────────────────────
  getOrders() { return this._req('/orders'); },

  saveOrder(order) {
    return this._req('/orders', { method: 'POST', body: JSON.stringify(order) });
  },

  softDeleteOrder(id) { return this._req(`/orders/${id}`, { method: 'DELETE' }); },
  restoreOrder(id)    { return this._req(`/orders/${id}/restore`, { method: 'POST' }); },
  hardDeleteOrder(id) { return this._req(`/orders/${id}/hard`, { method: 'DELETE' }); },

  // ── Settings ──────────────────────────────────────────────────
  getSettings() { return this._req('/settings'); },

  saveSettings(key, value) {
    return this._req('/settings', { method: 'POST', body: JSON.stringify({ key, value }) });
  },

  // ── Audit ─────────────────────────────────────────────────────
  log(action, details, entityType, entityId) {
    return this._req('/audit', {
      method: 'POST',
      body: JSON.stringify({ action, details, entityType: entityType || '', entityId: entityId || '' }),
    });
  },
  getAuditLog() { return this._req('/audit'); },

  // ── Customers ─────────────────────────────────────────────────
  getCustomers() { return this._req('/customers'); },

  addCustomer(data) {
    return this._req('/customers', { method: 'POST', body: JSON.stringify(data) });
  },

  updateCustomer(id, data) {
    return this._req(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  deleteCustomer(id) { return this._req(`/customers/${id}`, { method: 'DELETE' }); },

  // ── Sales Invoices ────────────────────────────────────────────
  getSales() { return this._req('/sales'); },

  createSale(data) {
    return this._req('/sales', { method: 'POST', body: JSON.stringify(data) });
  },

  deleteSale(id) { return this._req(`/sales/${id}`, { method: 'DELETE' }); },

  sendSaleWhatsApp(id) {
    return this._req(`/sales/${id}/send-whatsapp`, { method: 'POST' });
  },

  deductInventory(id) {
    return this._req(`/sales/${id}/deduct-inventory`, { method: 'POST' });
  },

  // ── AI Invoice Scanner (Gemini) ───────────────────────────────
  scanInvoice(base64Image, mimeType = 'image/jpeg') {
    return this._req('/invoice/scan', {
      method: 'POST',
      body: JSON.stringify({ image: base64Image, mimeType }),
    });
  },

  // ── OTP Reset Password ─────────────────────────────────────────
  requestOTP(email) {
    return this._req('/auth/otp-request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  verifyOTP(email, otp, password) {
    return this._req('/auth/otp-verify', {
      method: 'POST',
      body: JSON.stringify({ email, otp, password }),
    });
  },
};
