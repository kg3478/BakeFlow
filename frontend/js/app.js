// ============================================================
// BakeFlow ERP — Main Application Logic
// All data persistence is handled via API calls (api.js)
// ============================================================

'use strict';

// ── Global state ─────────────────────────────────────────────
var currentPage = 'dashboard';
var ingredients = [];
var decorations = [];
var packaging = [];
var savedOrders = [];
var catalogProducts = [];
var ingredientsMaster = [];
var packagingMaster = [];
var currentEditingOrderId = null;

// ── BakeFlow new state ────────────────────────────────────────
var currentSession   = null;   // { name, email, role, picture, loginTime }
var businessConfig   = { businessName: 'BakeFlow', businessPhone: '' };
var customersDB      = [];
var salesInvoices    = [];
var currentSaleItems = [];
var currentSaleCustomer = null;
var currentMaterialTab  = 'ingredients';
var _scanFile = null;
var _scanItems = [];

// ── Default fallbacks (used if server returns nothing) ────────
var DEFAULT_LABOUR = {
  roles: [
    { role: 'Baker', staffCount: 2, monthlySalary: 30000 },
    { role: 'Cake Decorator', staffCount: 1, monthlySalary: 35000 },
    { role: 'Production Helper', staffCount: 2, monthlySalary: 18000 }
  ],
  workingDays: 26,
  workingHours: 8,
  productiveTimePct: 75,
  dailyEffortPoints: 10
};
var DEFAULT_OVERHEAD = {
  roles: [
    { role: 'Cashier & Sales', staffCount: 1, monthlySalary: 18000 },
    { role: 'Delivery Partner', staffCount: 1, monthlySalary: 15000 }
  ],
  occupancy: { rent: 15000, society: 1000, other: 0 },
  utilities: { electricity: 3000, gas: 1500, water: 500, fuel: 500, other: 0 },
  admin: { internetPhone: 800, software: 1200, professional: 1000, insurance: 500, other: 0 },
  marketing: { promo: 1500, commission: 2000, other: 0 },
  delivery: { fuel: 1000, thirdParty: 1500, other: 0 },
  maintenance: { repairs: 1000, cleaning: 1000, misc: 500 }
};

var labourSettings = null;
var overheadSettings = null;


// ── Loading overlay ──────────────────────────────────────────
function showLoading(msg) {
  var ol = document.getElementById('loading-overlay');
  if (ol) {
    ol.querySelector('.loading-text').textContent = msg || 'Loading BakeFlow…';
    ol.classList.remove('hidden');
  }
}
function hideLoading() {
  var ol = document.getElementById('loading-overlay');
  if (ol) ol.classList.add('hidden');
}

// ── Bootstrap ─────────────────────────────────────────────────
async function initApp() {
  showLoading('Connecting to database…');
  try {
    const [ings, packs, prods, orders, settings] = await Promise.all([
      API.getIngredients(),
      API.getPackaging(),
      API.getProducts(),
      API.getOrders(),
      API.getSettings(),
    ]);

    ingredientsMaster = ings;
    packagingMaster   = packs;
    catalogProducts   = prods;
    savedOrders       = orders;

    labourSettings   = settings.labour   || DEFAULT_LABOUR;
    overheadSettings = settings.overhead || DEFAULT_OVERHEAD;

    // Automatic migration for old schema settings
    if (!labourSettings.roles) {
      labourSettings = {
        roles: [
          { role: 'Production Staff', staffCount: labourSettings.empCount || 10, monthlySalary: (labourSettings.monthlySalaries || 150000) / (labourSettings.empCount || 10) }
        ],
        workingDays: labourSettings.daysPerMonth || 26,
        workingHours: labourSettings.hoursPerDay || 8,
        productiveTimePct: 75,
        dailyEffortPoints: 10
      };
    }
    if (!overheadSettings.roles) {
      const oldFixed = overheadSettings.fixed || {};
      overheadSettings = {
        roles: [
          { role: 'Non-Production Staff', staffCount: 1, monthlySalary: 18000 }
        ],
        occupancy: { rent: oldFixed.rent !== undefined ? oldFixed.rent : 15000, society: 0, other: 0 },
        utilities: { electricity: oldFixed.elec !== undefined ? oldFixed.elec : 3000, gas: oldFixed.gas !== undefined ? oldFixed.gas : 1500, water: 0, fuel: 0, other: 0 },
        admin: { internetPhone: 0, software: 0, professional: 0, insurance: 0, other: oldFixed.clean !== undefined ? oldFixed.clean : 1500 },
        marketing: { promo: 0, commission: 0, other: 0 },
        delivery: { fuel: 0, thirdParty: 0, other: 0 },
        maintenance: { repairs: 0, cleaning: 0, misc: 0 }
      };
    }

    // Populate Labour Settings UI inputs (except roles table which is rendered dynamically)
    document.getElementById('labour-days-per-month').value = labourSettings.workingDays || 26;
    document.getElementById('labour-hours-per-day').value  = labourSettings.workingHours || 8;
    document.getElementById('labour-productive-pct').value = labourSettings.productiveTimePct || 75;
    document.getElementById('labour-effort-points').value  = labourSettings.dailyEffortPoints || 10;

    // Populate Overheads Settings UI inputs (rendered via separate helper)
    renderLabourRoles();
    renderOverheadSettingsUI();

    // Wire save buttons
    var ohSaveBtn = document.querySelector('#page-overheads button[onclick^="saveOverheadSettings"]');
    if (ohSaveBtn) ohSaveBtn.onclick = saveOverheadSettingsFromUI;

    var labSaveBtn = document.querySelector('#page-labour button[onclick^="saveLabourSettings"]');
    if (labSaveBtn) labSaveBtn.onclick = saveLabourSettingsFromUI;

    // Update derived rates
    deriveSettingsRates();

    // Update saved orders count
    document.getElementById('dash-orders').textContent = savedOrders.filter(o => !o.deleted).length;

    // Load customers & sales invoices
    try {
      [customersDB, salesInvoices] = await Promise.all([API.getCustomers(), API.getSales()]);
    } catch(e) { console.warn('Could not load customers/sales:', e.message); }

    // Render initial views
    renderIngredients();
    renderDecorations();
    renderPackaging();
    renderDashboardTable();
    renderSavedOrdersList();
    recalculate();
    calcDailyOverhead();
    loadDashboardData();

    hideLoading();
  } catch (err) {
    console.error('initApp failed:', err);
    hideLoading();
    const isDemo = currentSession && (currentSession.isDemo || currentSession.role === 'demo_admin');
    if (err.message && (err.message.toLowerCase().includes('suspended') || err.message.toLowerCase().includes('access denied'))) {
      showSuspensionBlock(err.message);
    } else if (isDemo) {
      // In demo mode, silently fall back to default empty state — don't scare the user
      console.warn('[Demo] API load failed, using defaults:', err.message);
      labourSettings   = labourSettings   || DEFAULT_LABOUR;
      overheadSettings = overheadSettings || DEFAULT_OVERHEAD;
      try { renderIngredients(); } catch(e) {}
      try { renderDecorations(); } catch(e) {}
      try { renderPackaging(); } catch(e) {}
      try { renderDashboardTable(); } catch(e) {}
      try { renderSavedOrdersList(); } catch(e) {}
      try { recalculate(); } catch(e) {}
      try { calcDailyOverhead(); } catch(e) {}
      try { loadDashboardData(); } catch(e) {}
    } else {
      showToast('⚠ Could not connect to server. Is it running?', true);
    }
  }
}

// ── Settings ──────────────────────────────────────────────────
async function saveLabourSettingsFromUI() {
  if (!labourSettings) return;
  labourSettings.workingDays = parseFloat(document.getElementById('labour-days-per-month').value) || 26;
  labourSettings.workingHours = parseFloat(document.getElementById('labour-hours-per-day').value) || 8;
  labourSettings.productiveTimePct = parseFloat(document.getElementById('labour-productive-pct').value) || 75;
  labourSettings.dailyEffortPoints = parseFloat(document.getElementById('labour-effort-points').value) || 10;
  
  try {
    await API.saveSettings('labour', labourSettings);
    deriveSettingsRates();
    recalculate();
    showToast('Labour settings saved successfully!');
  } catch (err) {
    showToast('Failed to save labour settings', true);
  }
}

async function saveOverheadSettingsFromUI() {
  if (!overheadSettings) return;
  
  // Read values from form fields
  const getVal = (id) => parseFloat(document.getElementById(id)?.value) || 0;
  
  overheadSettings.occupancy = {
    rent: getVal('monthly-rent'),
    society: getVal('monthly-society'),
    other: getVal('monthly-occupancy-other')
  };
  overheadSettings.utilities = {
    electricity: getVal('monthly-electricity'),
    gas: getVal('monthly-gas'),
    water: getVal('monthly-water'),
    fuel: getVal('monthly-fuel'),
    other: getVal('monthly-utilities-other')
  };
  overheadSettings.admin = {
    internetPhone: getVal('monthly-internet-phone'),
    software: getVal('monthly-software'),
    professional: getVal('monthly-professional'),
    insurance: getVal('monthly-insurance'),
    other: getVal('monthly-admin-other')
  };
  overheadSettings.marketing = {
    promo: getVal('monthly-promo'),
    commission: getVal('monthly-commission'),
    other: getVal('monthly-marketing-other')
  };
  overheadSettings.delivery = {
    fuel: getVal('monthly-transport-fuel'),
    thirdParty: getVal('monthly-delivery-thirdparty'),
    other: getVal('monthly-delivery-other')
  };
  overheadSettings.maintenance = {
    repairs: getVal('monthly-repairs'),
    cleaning: getVal('monthly-cleaning'),
    misc: getVal('monthly-maintenance-misc')
  };
  
  try {
    await API.saveSettings('overhead', overheadSettings);
    deriveSettingsRates();
    recalculate();
    showToast('Operating Expense settings saved successfully!');
  } catch (err) {
    showToast('Failed to save operating expense settings', true);
  }
}

function renderLabourRoles() {
  const container = document.getElementById('labour-roles-list');
  if (!container || !labourSettings || !labourSettings.roles) return;
  
  container.innerHTML = labourSettings.roles.map((r, idx) => `
    <tr style="border-bottom:1px solid rgba(232,213,190,0.15);">
      <td style="padding:8px 0;"><input type="text" value="${r.role}" placeholder="e.g. Baker" oninput="updateLabourRole(${idx}, 'role', this.value)" style="width:100%;padding:4px 8px;font-size:12.5px;"></td>
      <td style="padding:8px 0;"><input type="number" value="${r.staffCount}" min="0.1" step="0.1" oninput="updateLabourRole(${idx}, 'staffCount', this.value)" style="width:75px;padding:4px 8px;font-size:12.5px;"></td>
      <td style="padding:8px 0;"><input type="number" value="${r.monthlySalary}" min="0" step="100" oninput="updateLabourRole(${idx}, 'monthlySalary', this.value)" style="width:130px;padding:4px 8px;font-size:12.5px;"></td>
      <td style="padding:8px 0;text-align:center;"><button class="btn btn-sm btn-danger" onclick="deleteLabourRole(${idx})" style="padding:3px 6px;"><i class="ti ti-trash"></i></button></td>
    </tr>
  `).join('');
}

function updateLabourRole(idx, field, value) {
  if (!labourSettings || !labourSettings.roles[idx]) return;
  if (field === 'role') {
    labourSettings.roles[idx].role = value;
  } else if (field === 'staffCount') {
    labourSettings.roles[idx].staffCount = parseFloat(value) || 0;
  } else if (field === 'monthlySalary') {
    labourSettings.roles[idx].monthlySalary = parseFloat(value) || 0;
  }
  deriveSettingsRates();
}

function addLabourRole() {
  if (!labourSettings) labourSettings = JSON.parse(JSON.stringify(DEFAULT_LABOUR));
  if (!labourSettings.roles) labourSettings.roles = [];
  labourSettings.roles.push({ role: '', staffCount: 1, monthlySalary: 15000 });
  renderLabourRoles();
  deriveSettingsRates();
}

function deleteLabourRole(idx) {
  if (!labourSettings || !labourSettings.roles) return;
  labourSettings.roles.splice(idx, 1);
  renderLabourRoles();
  deriveSettingsRates();
}

function renderOverheadSettingsUI() {
  const listEl = document.getElementById('overhead-roles-list');
  if (listEl && overheadSettings && overheadSettings.roles) {
    listEl.innerHTML = overheadSettings.roles.map((r, idx) => `
      <tr style="border-bottom:1px solid rgba(232,213,190,0.15);">
        <td style="padding:8px 0;"><input type="text" value="${r.role}" placeholder="e.g. Cashier" oninput="updateOverheadRole(${idx}, 'role', this.value)" style="width:100%;padding:4px 8px;font-size:12.5px;"></td>
        <td style="padding:8px 0;"><input type="number" value="${r.staffCount}" min="0.1" step="0.1" oninput="updateOverheadRole(${idx}, 'staffCount', this.value)" style="width:75px;padding:4px 8px;font-size:12.5px;"></td>
        <td style="padding:8px 0;"><input type="number" value="${r.monthlySalary}" min="0" step="100" oninput="updateOverheadRole(${idx}, 'monthlySalary', this.value)" style="width:130px;padding:4px 8px;font-size:12.5px;"></td>
        <td style="padding:8px 0;text-align:center;"><button class="btn btn-sm btn-danger" onclick="deleteOverheadRole(${idx})" style="padding:3px 6px;"><i class="ti ti-trash"></i></button></td>
      </tr>
    `).join('');
  }
  
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || 0; };
  if (overheadSettings) {
    const occ = overheadSettings.occupancy || {};
    setVal('monthly-rent', occ.rent);
    setVal('monthly-society', occ.society);
    setVal('monthly-occupancy-other', occ.other);
    
    const ut = overheadSettings.utilities || {};
    setVal('monthly-electricity', ut.electricity);
    setVal('monthly-gas', ut.gas);
    setVal('monthly-water', ut.water);
    setVal('monthly-fuel', ut.fuel);
    setVal('monthly-utilities-other', ut.other);
    
    const ad = overheadSettings.admin || {};
    setVal('monthly-internet-phone', ad.internetPhone);
    setVal('monthly-software', ad.software);
    setVal('monthly-professional', ad.professional);
    setVal('monthly-insurance', ad.insurance);
    setVal('monthly-admin-other', ad.other);
    
    const mk = overheadSettings.marketing || {};
    setVal('monthly-promo', mk.promo);
    setVal('monthly-commission', mk.commission);
    setVal('monthly-marketing-other', mk.other);
    
    const dl = overheadSettings.delivery || {};
    setVal('monthly-transport-fuel', dl.fuel);
    setVal('monthly-delivery-thirdparty', dl.thirdParty);
    setVal('monthly-delivery-other', dl.other);
    
    const mt = overheadSettings.maintenance || {};
    setVal('monthly-repairs', mt.repairs);
    setVal('monthly-cleaning', mt.cleaning);
    setVal('monthly-maintenance-misc', mt.misc);
  }
}

function updateOverheadRole(idx, field, value) {
  if (!overheadSettings || !overheadSettings.roles[idx]) return;
  if (field === 'role') {
    overheadSettings.roles[idx].role = value;
  } else if (field === 'staffCount') {
    overheadSettings.roles[idx].staffCount = parseFloat(value) || 0;
  } else if (field === 'monthlySalary') {
    overheadSettings.roles[idx].monthlySalary = parseFloat(value) || 0;
  }
  deriveSettingsRates();
}

function addOverheadRole() {
  if (!overheadSettings) overheadSettings = JSON.parse(JSON.stringify(DEFAULT_OVERHEAD));
  if (!overheadSettings.roles) overheadSettings.roles = [];
  overheadSettings.roles.push({ role: '', staffCount: 1, monthlySalary: 15000 });
  renderOverheadSettingsUI();
  deriveSettingsRates();
}

function deleteOverheadRole(idx) {
  if (!overheadSettings || !overheadSettings.roles) return;
  overheadSettings.roles.splice(idx, 1);
  renderOverheadSettingsUI();
  deriveSettingsRates();
}

function deriveSettingsRates() {
  if (!labourSettings) return;
  
  const workingDays = parseFloat(document.getElementById('labour-days-per-month')?.value) || labourSettings.workingDays || 26;
  const workingHours = parseFloat(document.getElementById('labour-hours-per-day')?.value) || labourSettings.workingHours || 8;
  const productiveTimePct = parseFloat(document.getElementById('labour-productive-pct')?.value) || labourSettings.productiveTimePct || 75;
  const dailyEffortPoints = parseFloat(document.getElementById('labour-effort-points')?.value) || labourSettings.dailyEffortPoints || 10;
  
  let totalMonthlyLabourCost = 0;
  let totalProductionStaff = 0;
  
  if (labourSettings.roles) {
    labourSettings.roles.forEach(r => {
      totalMonthlyLabourCost += (r.staffCount || 0) * (r.monthlySalary || 0);
      totalProductionStaff += (r.staffCount || 0);
    });
  }
  
  const scheduledHours = totalProductionStaff * workingDays * workingHours;
  const effectiveHours = scheduledHours * (productiveTimePct / 100);
  const derivedLabourRate = effectiveHours > 0 ? (totalMonthlyLabourCost / effectiveHours) : 0;
  
  const dailyDirectLabourPool = workingDays > 0 ? (totalMonthlyLabourCost / workingDays) : 0;
  const derivedEffortRate = dailyEffortPoints > 0 ? (dailyDirectLabourPool / dailyEffortPoints) : 0;
  
  const totalMonthlyCostEl = document.getElementById('labour-total-monthly-cost');
  if (totalMonthlyCostEl) totalMonthlyCostEl.textContent = '₹' + Math.round(totalMonthlyLabourCost).toLocaleString('en-IN');
  
  const totalStaffEl = document.getElementById('labour-total-staff');
  if (totalStaffEl) totalStaffEl.textContent = totalProductionStaff.toFixed(1);
  
  const dLabour = document.getElementById('derived-labour-rate-display');
  if (dLabour) dLabour.textContent = Math.round(derivedLabourRate);
  
  const dEffort = document.getElementById('derived-effort-rate-display');
  if (dEffort) dEffort.textContent = Math.round(derivedEffortRate);
  
  const calcLabourRate = document.getElementById('labour-rate');
  if (calcLabourRate) calcLabourRate.value = derivedLabourRate.toFixed(2);
  
  const sLabour = document.getElementById('summary-monthly-labour');
  if (sLabour) sLabour.textContent = Math.round(totalMonthlyLabourCost).toLocaleString('en-IN');
  
  deriveOperatingExpensesRates(totalMonthlyLabourCost);
}

function deriveOperatingExpensesRates(totalMonthlyLabourCost = 0) {
  if (!overheadSettings) return;
  
  let nonProdStaffCost = 0;
  let totalNonProdStaff = 0;
  
  if (overheadSettings.roles) {
    overheadSettings.roles.forEach(r => {
      nonProdStaffCost += (r.staffCount || 0) * (r.monthlySalary || 0);
      totalNonProdStaff += (r.staffCount || 0);
    });
  }
  
  const rent = parseFloat(document.getElementById('monthly-rent')?.value) || overheadSettings.occupancy?.rent || 0;
  const society = parseFloat(document.getElementById('monthly-society')?.value) || overheadSettings.occupancy?.society || 0;
  const otherOccupancy = parseFloat(document.getElementById('monthly-occupancy-other')?.value) || overheadSettings.occupancy?.other || 0;
  const totalOccupancy = rent + society + otherOccupancy;
  
  const electricity = parseFloat(document.getElementById('monthly-electricity')?.value) || overheadSettings.utilities?.electricity || 0;
  const gas = parseFloat(document.getElementById('monthly-gas')?.value) || overheadSettings.utilities?.gas || 0;
  const water = parseFloat(document.getElementById('monthly-water')?.value) || overheadSettings.utilities?.water || 0;
  const fuel = parseFloat(document.getElementById('monthly-fuel')?.value) || overheadSettings.utilities?.fuel || 0;
  const otherUtilities = parseFloat(document.getElementById('monthly-utilities-other')?.value) || overheadSettings.utilities?.other || 0;
  const totalUtilities = electricity + gas + water + fuel + otherUtilities;
  
  const internetPhone = parseFloat(document.getElementById('monthly-internet-phone')?.value) || overheadSettings.admin?.internetPhone || 0;
  const software = parseFloat(document.getElementById('monthly-software')?.value) || overheadSettings.admin?.software || 0;
  const professional = parseFloat(document.getElementById('monthly-professional')?.value) || overheadSettings.admin?.professional || 0;
  const insurance = parseFloat(document.getElementById('monthly-insurance')?.value) || overheadSettings.admin?.insurance || 0;
  const otherAdmin = parseFloat(document.getElementById('monthly-admin-other')?.value) || overheadSettings.admin?.other || 0;
  const totalAdmin = internetPhone + software + professional + insurance + otherAdmin;
  
  const promo = parseFloat(document.getElementById('monthly-promo')?.value) || overheadSettings.marketing?.promo || 0;
  const commission = parseFloat(document.getElementById('monthly-commission')?.value) || overheadSettings.marketing?.commission || 0;
  const otherMarketing = parseFloat(document.getElementById('monthly-marketing-other')?.value) || overheadSettings.marketing?.other || 0;
  const totalMarketing = promo + commission + otherMarketing;
  
  const transportFuel = parseFloat(document.getElementById('monthly-transport-fuel')?.value) || overheadSettings.delivery?.fuel || 0;
  const thirdPartyDelivery = parseFloat(document.getElementById('monthly-delivery-thirdparty')?.value) || overheadSettings.delivery?.thirdParty || 0;
  const otherDelivery = parseFloat(document.getElementById('monthly-delivery-other')?.value) || overheadSettings.delivery?.other || 0;
  const totalDelivery = transportFuel + thirdPartyDelivery + otherDelivery;
  
  const repairs = parseFloat(document.getElementById('monthly-repairs')?.value) || overheadSettings.maintenance?.repairs || 0;
  const cleaning = parseFloat(document.getElementById('monthly-cleaning')?.value) || overheadSettings.maintenance?.cleaning || 0;
  const miscMaintenance = parseFloat(document.getElementById('monthly-maintenance-misc')?.value) || overheadSettings.maintenance?.misc || 0;
  const totalMaintenance = repairs + cleaning + miscMaintenance;
  
  const totalMonthlyOverhead = nonProdStaffCost + totalOccupancy + totalUtilities + totalAdmin + totalMarketing + totalDelivery + totalMaintenance;
  
  const sNonProd = document.getElementById('summary-monthly-nonprod');
  if (sNonProd) sNonProd.textContent = Math.round(nonProdStaffCost).toLocaleString('en-IN');
  
  const sOverheads = document.getElementById('summary-monthly-overheads');
  if (sOverheads) sOverheads.textContent = Math.round(totalOccupancy + totalUtilities + totalAdmin + totalMarketing + totalDelivery + totalMaintenance).toLocaleString('en-IN');
  
  const sTotal = document.getElementById('summary-monthly-total');
  if (sTotal) sTotal.textContent = Math.round(totalMonthlyLabourCost + totalMonthlyOverhead).toLocaleString('en-IN');
  
  const workingDays = parseFloat(document.getElementById('labour-days-per-month')?.value) || (labourSettings && labourSettings.workingDays) || 26;
  
  const sDaily = document.getElementById('summary-daily-cost');
  if (sDaily) sDaily.textContent = workingDays > 0 ? Math.round(totalMonthlyOverhead / workingDays).toLocaleString('en-IN') : '0';
  
  const workingHours = parseFloat(document.getElementById('labour-hours-per-day')?.value) || (labourSettings && labourSettings.workingHours) || 8;
  const totalHours = workingDays * workingHours;
  
  const sHourly = document.getElementById('summary-hourly-cost');
  if (sHourly) sHourly.textContent = totalHours > 0 ? Math.round(totalMonthlyOverhead / totalHours).toLocaleString('en-IN') : '0';
  
  const dOverhead = document.getElementById('derived-overhead-rate-display');
  if (dOverhead) dOverhead.textContent = Math.round(totalMonthlyOverhead).toLocaleString('en-IN');
}

// ── Navigation ────────────────────────────────────────────────
function navigate(page) {
  // Redirect legacy separate pages to merged materials page
  if (page === 'ingredients' || page === 'packaging') page = 'materials';

  // Admin-only page guard
  const adminOnlyPages = ['labour', 'overheads', 'reports', 'salesreports', 'auditlog'];
  if (adminOnlyPages.includes(page) && currentSession) {
    const r = currentSession.role;
    if (r !== 'admin' && r !== 'owner' && r !== 'platform_admin') {
      showToast('⛔ Admin access required', true);
      return;
    }
  }

  currentPage = page;
  document.querySelectorAll('[id^="page-"]').forEach(p => p.classList.add('hidden'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.remove('active');
    if (n.getAttribute('onclick') && n.getAttribute('onclick').includes("'" + page + "'"))
      n.classList.add('active');
  });
  if (page === 'products')     renderProductCatalog();
  if (page === 'materials')    renderMaterialsMaster();
  if (page === 'reports')      renderReports();
  if (page === 'dashboard')    { renderDashboardTable(); loadDashboardData(); }
  if (page === 'orders')       renderSavedOrdersList();
  if (page === 'customers')    renderCustomerList();
  if (page === 'invoices')     renderInvoiceList();
  if (page === 'salesreports') renderSalesReports();
  if (page === 'auditlog')     renderAuditLog();
  if (page === 'sales')        initSalesPage();
}

// ── Dashboard ─────────────────────────────────────────────────
function renderDashboardTable() {
  var body = document.getElementById('catalog-table-body');
  var active = catalogProducts.filter(p => !p.deleted);
  document.getElementById('dash-products').textContent = active.length;
  var avgMargin = active.length > 0 ? Math.round(active.reduce((s,p)=>s+(p.margin||0),0)/active.length) : 0;
  document.getElementById('dash-margin').textContent = avgMargin + '%';
  if (active.length > 0) {
    var top = active.reduce((best,p)=>(p.margin||0)>(best.margin||0)?p:best, active[0]);
    document.getElementById('dash-top').textContent = top.name.length > 16 ? top.name.substring(0,14)+'…' : top.name;
  }
  if (active.length === 0) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--bo-muted);padding:20px;font-size:13px;">No active products. <span style="cursor:pointer;text-decoration:underline;color:var(--bo-gold-dark);" onclick="navigate('products')">Go to Product Catalog →</span></td></tr>`;
    return;
  }
  body.innerHTML = active.map(p => `
    <tr>
      <td><span style="font-size:16px;margin-right:6px;">${p.emoji}</span>${p.name}</td>
      <td><span class="badge badge-gold">${p.cat}</span></td>
      <td>₹${p.cost}</td><td>₹${p.sell}</td>
      <td><span class="badge badge-green">${p.margin}%</span></td>
      <td><span class="badge badge-gold">Active</span></td>
    </tr>`).join('');
}

// ── Product Catalog ───────────────────────────────────────────
function renderProductCatalog() {
  var grid = document.getElementById('product-catalog-grid');
  var showDeleted = document.getElementById('prod-show-deleted')?.checked;
  var list = showDeleted ? catalogProducts : catalogProducts.filter(p => !p.deleted);
  if (list.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--bo-muted);">${showDeleted?'No products in catalog.':'No active products. <span style="cursor:pointer;text-decoration:underline;color:var(--bo-gold-dark);" onclick="document.getElementById(\'prod-show-deleted\').checked=true;renderProductCatalog()">Show deleted?</span>'}</div>`;
    return;
  }
  grid.innerHTML = list.map(p => {
    var realIdx = catalogProducts.indexOf(p);
    var isDeleted = !!p.deleted;
    return `
    <div class="product-card" style="${isDeleted?'opacity:0.5;border-style:dashed;':''}">
      <span class="emoji">${p.emoji}</span>
      <div class="pc-name">${p.name}${isDeleted?'<span class="deleted-tag"> Deleted</span>':''}</div>
      <div class="pc-cat">${p.cat}</div>
      <div class="pc-price">Cost: ₹${p.cost} → Sell: ₹${p.sell}</div>
      <div class="pc-margin">Margin: ${p.margin}% <span style="color:var(--bo-muted);">| Profit: ₹${p.sell-p.cost}</span></div>
      <div style="display:flex;gap:6px;margin-top:10px;">
        ${isDeleted
          ? `<button class="btn btn-sm btn-success-solid" style="flex:1;justify-content:center;" onclick="restoreCatalogProduct(${realIdx})"><i class="ti ti-restore"></i> Restore</button>
             <button class="btn btn-sm btn-danger-solid" onclick="hardDeleteCatalogProduct(${realIdx})" title="Permanently Delete"><i class="ti ti-trash-x"></i></button>`
          : `<button class="btn btn-sm btn-danger" style="margin-left:auto;" onclick="softDeleteCatalogProduct(${realIdx})"><i class="ti ti-trash"></i> Delete</button>`
        }
      </div>
    </div>`;
  }).join('');
}

// ── Ingredient Master ─────────────────────────────────────────
function renderIngredientsMaster() {
  var body = document.getElementById('ingredients-master-body');
  if (!body) { if (typeof renderMaterialsMaster === 'function') renderMaterialsMaster(); return; }
  var showDeleted = document.getElementById('ing-show-deleted')?.checked;
  var list = showDeleted ? ingredientsMaster : ingredientsMaster.filter(i => !i.deleted);
  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--bo-muted);padding:24px;font-size:13px;">${showDeleted?'No ingredients.':'No active ingredients. <span style="cursor:pointer;text-decoration:underline;color:var(--bo-gold-dark);" onclick="document.getElementById(\'ing-show-deleted\').checked=true;renderIngredientsMaster()">Show deleted?</span>'}</td></tr>`;
    return;
  }
  body.innerHTML = list.map((i) => {
    var realIdx = ingredientsMaster.indexOf(i);
    var isDeleted = !!i.deleted;
    return `
    <tr class="${isDeleted?'soft-deleted':''}">
      <td style="font-weight:500;">${i.name}${isDeleted?'<span class="deleted-tag"><i class="ti ti-trash" style="font-size:9px;"></i> Deleted</span>':''}</td>
      <td><span class="badge badge-info">${i.cat}</span></td>
      <td>${i.unit}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
          <input type="number" id="master-ing-rate-${realIdx}" value="${i.rate}" style="width:80px;padding:4px 8px;font-size:12px;" ${isDeleted?'disabled':''}>
          <button class="btn btn-sm" style="padding:4px 6px;border:none;background:transparent;color:var(--bo-gold-dark);" onclick="viewIngredientHistory(${realIdx})" title="Price History"><i class="ti ti-history"></i></button>
        </div>
      </td>
      <td style="color:var(--bo-muted);font-size:12px;">${i.updated||''}</td>
      <td style="display:flex;gap:5px;align-items:center;">
        ${isDeleted
          ? `<button class="btn btn-sm btn-success-solid" onclick="restoreIngredient(${realIdx})"><i class="ti ti-restore"></i> Restore</button>
             <button class="btn btn-sm btn-danger-solid" onclick="hardDeleteIngredient(${realIdx})" title="Permanently Delete"><i class="ti ti-trash-x"></i></button>`
          : `<button class="btn btn-sm" onclick="updateMasterIngredient(${realIdx}, document.getElementById('master-ing-rate-${realIdx}').value)">Update</button>
             <button class="btn btn-sm btn-danger" onclick="softDeleteIngredient(${realIdx})" title="Delete"><i class="ti ti-trash"></i></button>`
        }
      </td>
    </tr>`;
  }).join('');
}

async function updateMasterIngredient(idx, newRateVal) {
  var item = ingredientsMaster[idx];
  var oldRate = item.rate;
  var newRate = parseFloat(newRateVal) || 0;
  if (oldRate === newRate) { showToast('Price did not change.'); return; }

  item.rate = newRate;
  item.updated = new Date().toLocaleDateString('en-IN');
  if (!item.rateHistory) item.rateHistory = [];
  item.rateHistory.unshift({ date: new Date().toLocaleDateString('en-IN'), timestamp: Date.now(), oldRate, newRate });

  await API.updateIngredientRate(item.id, newRate, item.rateHistory);
  renderIngredientsMaster();
  showToast('Ingredient rate updated & audited!');
}

function viewIngredientHistory(idx) {
  var item = ingredientsMaster[idx];
  var history = item.rateHistory || [];
  var timelineHtml = history.length === 0
    ? '<div style="color:var(--bo-muted);font-size:13px;padding:12px 0;">No rate changes recorded yet.</div>'
    : `<div class="timeline">${history.map(h=>`<div class="timeline-item"><div class="timeline-time">${new Date(h.timestamp).toLocaleString()}</div><div>Rate changed from <strong>₹${h.oldRate}</strong> to <strong>₹${h.newRate}</strong> (per ${item.unit})</div></div>`).join('')}</div>`;
  openModal(`
    <div class="modal-header"><h3>Rate History: ${item.name}</h3><button class="btn btn-sm" onclick="closeModalBtn()"><i class="ti ti-x"></i></button></div>
    <div class="modal-body">
      <div style="font-size:13.5px;margin-bottom:12px;color:var(--bo-muted);">Category: <strong>${item.cat}</strong> • Unit: <strong>${item.unit}</strong> • Current Rate: <strong>₹${item.rate}</strong></div>
      <div class="section-divider" style="margin:12px 0 8px;"><span>Price Changes</span></div>
      ${timelineHtml}
    </div>
    <div class="modal-footer"><button class="btn btn-primary" onclick="closeModalBtn()">Close</button></div>`);
}

// ── Packaging Master ──────────────────────────────────────────
function renderPackagingMaster() {
  var body = document.getElementById('packaging-master-body');
  if (!body) { if (typeof renderMaterialsMaster === 'function') renderMaterialsMaster(); return; }
  var showDeleted = document.getElementById('pack-show-deleted')?.checked;
  var list = showDeleted ? packagingMaster : packagingMaster.filter(p => !p.deleted);
  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--bo-muted);padding:24px;font-size:13px;">${showDeleted?'No packaging items.':'No active packaging. <span style="cursor:pointer;text-decoration:underline;color:var(--bo-gold-dark);" onclick="document.getElementById(\'pack-show-deleted\').checked=true;renderPackagingMaster()">Show deleted?</span>'}</td></tr>`;
    return;
  }
  body.innerHTML = list.map((p) => {
    var realIdx = packagingMaster.indexOf(p);
    var isDeleted = !!p.deleted;
    return `
    <tr class="${isDeleted?'soft-deleted':''}">
      <td style="font-weight:500;">${p.name}${isDeleted?'<span class="deleted-tag"><i class="ti ti-trash" style="font-size:9px;"></i> Deleted</span>':''}</td>
      <td><span class="badge badge-gold">${p.type}</span></td>
      <td>${p.size}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
          <input type="number" id="master-pack-rate-${realIdx}" value="${p.rate}" style="width:80px;padding:4px 8px;font-size:12px;" ${isDeleted?'disabled':''}>
          <button class="btn btn-sm" style="padding:4px 6px;border:none;background:transparent;color:var(--bo-gold-dark);" onclick="viewPackagingHistory(${realIdx})" title="Price History"><i class="ti ti-history"></i></button>
        </div>
      </td>
      <td style="color:var(--bo-muted);font-size:12px;">${p.vendor}</td>
      <td style="display:flex;gap:5px;align-items:center;">
        ${isDeleted
          ? `<button class="btn btn-sm btn-success-solid" onclick="restorePackagingItem(${realIdx})"><i class="ti ti-restore"></i> Restore</button>
             <button class="btn btn-sm btn-danger-solid" onclick="hardDeletePackagingItem(${realIdx})" title="Permanently Delete"><i class="ti ti-trash-x"></i></button>`
          : `<button class="btn btn-sm" onclick="updateMasterPackaging(${realIdx}, document.getElementById('master-pack-rate-${realIdx}').value)">Update</button>
             <button class="btn btn-sm btn-danger" onclick="softDeletePackagingItem(${realIdx})" title="Delete"><i class="ti ti-trash"></i></button>`
        }
      </td>
    </tr>`;
  }).join('');
}

async function updateMasterPackaging(idx, newRateVal) {
  var item = packagingMaster[idx];
  var oldRate = item.rate;
  var newRate = parseFloat(newRateVal) || 0;
  if (oldRate === newRate) { showToast('Price did not change.'); return; }

  item.rate = newRate;
  if (!item.rateHistory) item.rateHistory = [];
  item.rateHistory.unshift({ date: new Date().toLocaleDateString('en-IN'), timestamp: Date.now(), oldRate, newRate });

  await API.updatePackagingRate(item.id, newRate, item.rateHistory);
  renderPackagingMaster();
  showToast('Packaging rate updated & audited!');
}

function viewPackagingHistory(idx) {
  var item = packagingMaster[idx];
  var history = item.rateHistory || [];
  var timelineHtml = history.length === 0
    ? '<div style="color:var(--bo-muted);font-size:13px;padding:12px 0;">No rate changes recorded yet.</div>'
    : `<div class="timeline">${history.map(h=>`<div class="timeline-item"><div class="timeline-time">${new Date(h.timestamp).toLocaleString()}</div><div>Rate changed from <strong>₹${h.oldRate}</strong> to <strong>₹${h.newRate}</strong></div></div>`).join('')}</div>`;
  openModal(`
    <div class="modal-header"><h3>Rate History: ${item.name}</h3><button class="btn btn-sm" onclick="closeModalBtn()"><i class="ti ti-x"></i></button></div>
    <div class="modal-body">
      <div style="font-size:13.5px;margin-bottom:12px;color:var(--bo-muted);">Type: <strong>${item.type}</strong> • Size: <strong>${item.size}</strong> • Current Rate: <strong>₹${item.rate}</strong></div>
      <div class="section-divider" style="margin:12px 0 8px;"><span>Price Changes</span></div>
      ${timelineHtml}
    </div>
    <div class="modal-footer"><button class="btn btn-primary" onclick="closeModalBtn()">Close</button></div>`);
}

// ── Reports ───────────────────────────────────────────────────
// ── Date range selection helpers ──────────────────────────────
function getPeriodDateRange(preset, startId, endId) {
  let start = null;
  let end = new Date();
  end.setHours(23, 59, 59, 999);
  
  if (preset === 'today') {
    start = new Date();
    start.setHours(0, 0, 0, 0);
  } else if (preset === '7days') {
    start = new Date();
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (preset === '30days') {
    start = new Date();
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
  } else if (preset === 'this-month') {
    start = new Date(end.getFullYear(), end.getMonth(), 1);
  } else if (preset === 'last-month') {
    start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    end = new Date(end.getFullYear(), end.getMonth(), 0, 23, 59, 59, 999);
  } else if (preset === 'this-quarter') {
    const qStartMonth = Math.floor(end.getMonth() / 3) * 3;
    start = new Date(end.getFullYear(), qStartMonth, 1);
  } else if (preset === 'this-year') {
    start = new Date(end.getFullYear(), 0, 1);
  } else if (preset === 'custom') {
    const sVal = document.getElementById(startId)?.value;
    const eVal = document.getElementById(endId)?.value;
    if (sVal) start = new Date(sVal);
    if (eVal) {
      end = new Date(eVal);
      end.setHours(23, 59, 59, 999);
    }
  }
  return { start, end };
}

function getPriorPeriodDateRange(start, end) {
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const priorEnd = new Date(start.getTime() - 1);
  const priorStart = new Date(priorEnd.getTime() - diffTime);
  return { start: priorStart, end: priorEnd };
}

function formatDateDisplay(start, end) {
  const opt = { day: 'numeric', month: 'short', year: 'numeric' };
  return start.toLocaleDateString('en-IN', opt) + ' - ' + end.toLocaleDateString('en-IN', opt);
}

function getOperatingExpensesForPeriod(start, end) {
  if (!overheadSettings) return 0;
  
  let nonProdStaffCost = 0;
  if (overheadSettings.roles) {
    overheadSettings.roles.forEach(r => {
      nonProdStaffCost += (r.staffCount || 0) * (r.monthlySalary || 0);
    });
  }
  const rent = Number(overheadSettings.occupancy?.rent) || 0;
  const society = Number(overheadSettings.occupancy?.society) || 0;
  const otherOccupancy = Number(overheadSettings.occupancy?.other) || 0;
  const totalOccupancy = rent + society + otherOccupancy;
  
  const electricity = Number(overheadSettings.utilities?.electricity) || 0;
  const gas = Number(overheadSettings.utilities?.gas) || 0;
  const water = Number(overheadSettings.utilities?.water) || 0;
  const fuel = Number(overheadSettings.utilities?.fuel) || 0;
  const otherUtilities = Number(overheadSettings.utilities?.other) || 0;
  const totalUtilities = electricity + gas + water + fuel + otherUtilities;
  
  const internetPhone = Number(overheadSettings.admin?.internetPhone) || 0;
  const software = Number(overheadSettings.admin?.software) || 0;
  const professional = Number(overheadSettings.admin?.professional) || 0;
  const insurance = Number(overheadSettings.admin?.insurance) || 0;
  const otherAdmin = Number(overheadSettings.admin?.other) || 0;
  const totalAdmin = internetPhone + software + professional + insurance + otherAdmin;
  
  const promo = Number(overheadSettings.marketing?.promo) || 0;
  const commission = Number(overheadSettings.marketing?.commission) || 0;
  const otherMarketing = Number(overheadSettings.marketing?.other) || 0;
  const totalMarketing = promo + commission + otherMarketing;
  
  const transportFuel = Number(overheadSettings.delivery?.fuel) || 0;
  const thirdPartyDelivery = Number(overheadSettings.delivery?.thirdParty) || 0;
  const otherDelivery = Number(overheadSettings.delivery?.other) || 0;
  const totalDelivery = transportFuel + thirdPartyDelivery + otherDelivery;
  
  const repairs = Number(overheadSettings.maintenance?.repairs) || 0;
  const cleaning = Number(overheadSettings.maintenance?.cleaning) || 0;
  const miscMaintenance = Number(overheadSettings.maintenance?.misc) || 0;
  const totalMaintenance = repairs + cleaning + miscMaintenance;
  
  const totalMonthlyOverhead = nonProdStaffCost + totalOccupancy + totalUtilities + totalAdmin + totalMarketing + totalDelivery + totalMaintenance;
  
  let totalCost = 0;
  let current = new Date(start.getTime());
  while (current <= end) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    totalCost += totalMonthlyOverhead / daysInMonth;
    current.setDate(current.getDate() + 1);
  }
  return totalCost;
}

function formatChangeBadge(valCurrent, valPrior) {
  if (valPrior === 0) {
    if (valCurrent === 0) return { text: '—', cls: '' };
    return { text: 'New', cls: 'badge-green' };
  }
  const pct = ((valCurrent - valPrior) / Math.abs(valPrior)) * 100;
  const sign = pct >= 0 ? '+' : '';
  const fmt = pct.toFixed(1) + '%';
  return {
    text: sign + fmt,
    cls: pct >= 0 ? 'badge-green' : 'badge-rose'
  };
}

function onReportsDatePresetChange() {
  const val = document.getElementById('reports-date-preset').value;
  const custom = document.getElementById('reports-custom-dates');
  if (val === 'custom') {
    custom.classList.remove('hidden');
    if (!document.getElementById('reports-start-date').value) {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      document.getElementById('reports-start-date').value = d.toISOString().split('T')[0];
      document.getElementById('reports-end-date').value = new Date().toISOString().split('T')[0];
    }
  } else {
    custom.classList.add('hidden');
  }
  renderReports();
}

var currentReportsTab = 'catalog';
function switchReportsTab(tabName) {
  currentReportsTab = tabName;
  document.querySelectorAll('#page-reports .tabs .tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-rep-' + tabName)?.classList.add('active');
  
  document.getElementById('reports-sec-catalog').classList.add('hidden');
  document.getElementById('reports-sec-sales').classList.add('hidden');
  document.getElementById('reports-sec-costs').classList.add('hidden');
  document.getElementById('reports-sec-customers').classList.add('hidden');
  document.getElementById('reports-sec-ai').classList.add('hidden');
  
  document.getElementById('reports-sec-' + tabName).classList.remove('hidden');
  renderReports();
}

function renderReports() {
  const activeProds = catalogProducts.filter(p => !p.deleted);
  
  // 1. Catalog Profile Analytics
  const avgCostEl = document.getElementById('rep-avg-cost');
  const avgSellEl = document.getElementById('rep-avg-sell');
  const bestMarginEl = document.getElementById('rep-best-margin');
  const highestCostEl = document.getElementById('rep-highest-cost');
  
  if (activeProds.length === 0) {
    if (avgCostEl) avgCostEl.textContent = '₹0';
    if (avgSellEl) avgSellEl.textContent = '₹0';
    if (bestMarginEl) bestMarginEl.textContent = '—';
    if (highestCostEl) highestCostEl.textContent = '—';
  } else {
    const totalCost = activeProds.reduce((sum, p) => sum + (Number(p.cost) || 0), 0);
    const totalSell = activeProds.reduce((sum, p) => sum + (Number(p.sell) || 0), 0);
    const avgCost = totalCost / activeProds.length;
    const avgSell = totalSell / activeProds.length;
    
    let bestProd = activeProds[0];
    let maxMargin = Number(bestProd.margin) || 0;
    for (const p of activeProds) {
      const margin = Number(p.margin) || 0;
      if (margin > maxMargin) {
        maxMargin = margin;
        bestProd = p;
      }
    }
    
    let highestProd = activeProds[0];
    let maxCost = Number(highestProd.cost) || 0;
    for (const p of activeProds) {
      const cost = Number(p.cost) || 0;
      if (cost > maxCost) {
        maxCost = cost;
        highestProd = p;
      }
    }
    
    if (avgCostEl) avgCostEl.textContent = `₹${Math.round(avgCost).toLocaleString('en-IN')}`;
    if (avgSellEl) avgSellEl.textContent = `₹${Math.round(avgSell).toLocaleString('en-IN')}`;
    if (bestMarginEl) bestMarginEl.textContent = `${bestProd.emoji || '🎂'} ${bestProd.name} (${maxMargin}%)`;
    if (highestCostEl) highestCostEl.textContent = `${highestProd.emoji || '🎂'} ${highestProd.name} (₹${Math.round(maxCost)})`;
  }
  
  // Profitability by Category (Catalog)
  const profitabilityChart = document.getElementById('profitability-chart');
  if (profitabilityChart) {
    if (activeProds.length === 0) {
      profitabilityChart.innerHTML = '<div style="color:var(--bo-muted);font-size:12.5px;padding:20px;text-align:center;">Add products to catalog to see analytics.</div>';
    } else {
      const catMargins = {};
      activeProds.forEach(p => {
        if (!catMargins[p.cat]) catMargins[p.cat] = [];
        catMargins[p.cat].push(Number(p.margin) || 0);
      });
      const entries = Object.entries(catMargins).map(([cat, margins]) => {
        const avg = margins.reduce((a, b) => a + b, 0) / margins.length;
        return { cat, avg };
      }).sort((a, b) => b.avg - a.avg);
      
      profitabilityChart.innerHTML = entries.slice(0, 8).map(e => `
        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px;">
            <span>${e.cat}</span>
            <span style="font-weight:500;color:var(--bo-success);">${Math.round(e.avg)}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${Math.min(100, e.avg)}%;"></div>
          </div>
        </div>`).join('');
    }
  }
  
  // Margin Distribution Histogram
  const histEl = document.getElementById('catalog-margin-histogram');
  if (histEl) {
    const bins = [0, 0, 0, 0, 0];
    activeProds.forEach(p => {
      const m = Number(p.margin) || 0;
      if (m <= 20) bins[0]++;
      else if (m <= 40) bins[1]++;
      else if (m <= 60) bins[2]++;
      else if (m <= 80) bins[3]++;
      else bins[4]++;
    });
    const maxCount = Math.max(...bins, 1);
    histEl.innerHTML = bins.map((count) => {
      const heightPct = (count / maxCount) * 100;
      return `
        <div style="display:flex;flex-direction:column;align-items:center;flex:1;height:100%;justify-content:flex-end;">
          <div style="font-size:11px;font-weight:600;color:var(--bo-gold-dark);margin-bottom:4px;">${count}</div>
          <div style="width:70%;height:${heightPct}%;background:var(--bo-gold);border-radius:4px 4px 0 0;min-height:4px;transition:height 0.3s;"></div>
        </div>`;
    }).join('');
  }
  
  // Fetch period date ranges
  const preset = document.getElementById('reports-date-preset')?.value || '30days';
  const { start, end } = getPeriodDateRange(preset, 'reports-start-date', 'reports-end-date');
  
  const rangeDisplay = document.getElementById('reports-date-display');
  if (rangeDisplay && start && end) {
    rangeDisplay.textContent = formatDateDisplay(start, end);
  }
  
  const periodInvoices = salesInvoices.filter(inv => {
    if (inv.deleted) return false;
    const ts = Number(inv.timestamp) || 0;
    return ts >= start.getTime() && ts <= end.getTime();
  });
  
  // 2. Sales & Margins Analytics
  const productStats = {};
  let totalGP = 0;
  let totalRev = 0;
  
  periodInvoices.forEach(inv => {
    const items = Array.isArray(inv.items) ? inv.items : [];
    items.forEach(item => {
      if (!item.name) return;
      const key = item.name;
      if (!productStats[key]) {
        productStats[key] = { name: key, qty: 0, revenue: 0, cost: 0, profit: 0 };
      }
      const qty = Number(item.qty) || 0;
      const rev = qty * (Number(item.unitPrice) || 0);
      const itemCost = Number(item.costPrice) || 0;
      const cost = qty * itemCost;
      const gp = rev - cost;
      
      productStats[key].qty += qty;
      productStats[key].revenue += rev;
      productStats[key].cost += cost;
      productStats[key].profit += gp;
      totalGP += gp;
      totalRev += rev;
    });
  });
  
  const topProdsBody = document.getElementById('rep-top-products-body');
  if (topProdsBody) {
    const sortedProds = Object.values(productStats).sort((a, b) => b.profit - a.profit);
    if (sortedProds.length === 0) {
      topProdsBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--bo-muted);padding:14px;">No products sold in this period.</td></tr>';
    } else {
      topProdsBody.innerHTML = sortedProds.slice(0, 10).map(p => {
        const share = totalGP > 0 ? ((p.profit / totalGP) * 100).toFixed(1) : '0';
        return `
          <tr>
            <td><strong>${p.name}</strong></td>
            <td style="text-align:right;">${p.qty}</td>
            <td style="text-align:right;">₹${Math.round(p.revenue).toLocaleString('en-IN')}</td>
            <td style="text-align:right;color:var(--bo-success);font-weight:600;">₹${Math.round(p.profit).toLocaleString('en-IN')}</td>
            <td style="text-align:right;"><span class="badge badge-green">${share}%</span></td>
          </tr>`;
      }).join('');
    }
  }
  
  // Quadrants
  const prodList = Object.values(productStats);
  let meanVol = 0;
  let meanMargin = 0;
  if (prodList.length > 0) {
    meanVol = prodList.reduce((sum, p) => sum + p.qty, 0) / prodList.length;
    meanMargin = prodList.reduce((sum, p) => sum + (p.revenue > 0 ? (p.profit / p.revenue * 100) : 0), 0) / prodList.length;
  }
  
  const quadrantLists = { stars: [], drivers: [], specialists: [], underperformers: [] };
  prodList.forEach(p => {
    const margin = p.revenue > 0 ? (p.profit / p.revenue * 100) : 0;
    if (p.qty >= meanVol) {
      if (margin >= meanMargin) quadrantLists.stars.push(p.name);
      else quadrantLists.drivers.push(p.name);
    } else {
      if (margin >= meanMargin) quadrantLists.specialists.push(p.name);
      else quadrantLists.underperformers.push(p.name);
    }
  });
  
  const renderQuad = (id, arr) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = arr.length > 0 ? arr.slice(0, 4).join(', ') + (arr.length > 4 ? '...' : '') : 'None';
    }
  };
  renderQuad('quadrant-stars', quadrantLists.stars);
  renderQuad('quadrant-drivers', quadrantLists.drivers);
  renderQuad('quadrant-specialists', quadrantLists.specialists);
  renderQuad('quadrant-underperformers', quadrantLists.underperformers);
  
  // Category Sales Contribution
  const catStats = {};
  periodInvoices.forEach(inv => {
    const items = Array.isArray(inv.items) ? inv.items : [];
    items.forEach(item => {
      const cp = catalogProducts.find(p => p.name.toLowerCase().trim() === item.name.toLowerCase().trim());
      const cat = cp ? cp.cat : (item.description || 'Custom');
      
      if (!catStats[cat]) {
        catStats[cat] = { name: cat, qty: 0, revenue: 0, cost: 0, profit: 0 };
      }
      const qty = Number(item.qty) || 0;
      const rev = qty * (Number(item.unitPrice) || 0);
      const itemCost = Number(item.costPrice) || 0;
      const cost = qty * itemCost;
      const gp = rev - cost;
      
      catStats[cat].qty += qty;
      catStats[cat].revenue += rev;
      catStats[cat].cost += cost;
      catStats[cat].profit += gp;
    });
  });
  
  const catMetricsEl = document.getElementById('rep-category-metrics');
  if (catMetricsEl) {
    const entries = Object.values(catStats).sort((a, b) => b.revenue - a.revenue);
    if (entries.length === 0) {
      catMetricsEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--bo-muted);font-size:12.5px;">No sales by category.</div>';
    } else {
      catMetricsEl.innerHTML = entries.map(c => {
        const margin = c.revenue > 0 ? Math.round((c.profit / c.revenue) * 100) : 0;
        return `
          <div class="card-sm" style="border:1px solid var(--bo-border);background:var(--bo-white);border-radius:8px;">
            <div style="font-weight:600;font-size:13.5px;margin-bottom:8px;color:var(--bo-brown);">${c.name}</div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;"><span style="color:var(--bo-muted);">Revenue:</span><strong>₹${Math.round(c.revenue).toLocaleString('en-IN')}</strong></div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;"><span style="color:var(--bo-muted);">Gross Profit:</span><strong style="color:var(--bo-success);">₹${Math.round(c.profit).toLocaleString('en-IN')}</strong></div>
            <div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:var(--bo-muted);">Avg. Margin:</span><strong>${margin}%</strong></div>
          </div>`;
      }).join('');
    }
  }
  
  // 3. Cost Component Analysis
  const el2 = document.getElementById('cost-analysis');
  if (el2) {
    const periodOrders = savedOrders.filter(o => {
      if (o.deleted) return false;
      const ts = Number(o.timestamp) || 0;
      return ts >= start.getTime() && ts <= end.getTime();
    });
    
    if (periodOrders.length === 0) {
      el2.innerHTML = '<div style="color:var(--bo-muted);font-size:12.5px;padding:20px;text-align:center;">No recipe calculations in this period.</div>';
    } else {
      let raw = 0, labour = 0, pack = 0, deco = 0;
      periodOrders.forEach(o => {
        raw += Number(o.summary && o.summary.rawCost) || 0;
        labour += Number(o.labour && o.labour.totalCost) || 0;
        pack += Number(o.summary && o.summary.packCost) || 0;
        deco += Number(o.summary && o.summary.decoCost) || 0;
      });
      
      const sum = raw + labour + pack + deco;
      const cats = ['Raw Materials', 'Labour', 'Packaging', 'Decoration'];
      const colors = ['var(--bo-gold)', 'var(--bo-rose)', '#B4C4A8', '#C4B4E8'];
      
      if (sum === 0) {
        el2.innerHTML = '<div style="color:var(--bo-muted);font-size:12.5px;padding:20px;text-align:center;">All recipes in period have zero cost.</div>';
      } else {
        const vals = [
          Math.round((raw / sum) * 100),
          Math.round((labour / sum) * 100),
          Math.round((pack / sum) * 100),
          Math.round((deco / sum) * 100),
        ];
        el2.innerHTML = cats.map((c, i) => `
          <div style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px;">
              <span>${c}</span>
              <span style="font-weight:500;">${vals[i]}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width:${vals[i]}%;background:${colors[i]};"></div>
            </div>
          </div>`).join('');
      }
    }
  }
  
  // Top Cost Drivers (Ingredients & Packaging)
  const driversIngEl = document.getElementById('cost-drivers-ingredients');
  if (driversIngEl) {
    const sortedIngs = ingredientsMaster.filter(i => !i.deleted).sort((a, b) => b.rate - a.rate);
    driversIngEl.innerHTML = sortedIngs.slice(0, 5).map(i => `
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;">
        <span>${i.name}</span>
        <strong style="color:var(--bo-gold-dark);">₹${i.rate.toFixed(2)}/${i.unit}</strong>
      </div>`).join('');
  }
  
  const driversPackEl = document.getElementById('cost-drivers-packaging');
  if (driversPackEl) {
    const sortedPacks = packagingMaster.filter(p => !p.deleted).sort((a, b) => b.rate - a.rate);
    driversPackEl.innerHTML = sortedPacks.slice(0, 5).map(p => `
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;">
        <span>${p.name}</span>
        <strong style="color:var(--bo-gold-dark);">₹${p.rate.toFixed(2)}</strong>
      </div>`).join('');
  }
  
  // 4. Customer Insights & Order Behaviour
  const customerStats = {};
  let totalBasketItems = 0;
  let weekdayRev = 0;
  
  periodInvoices.forEach(inv => {
    const phone = inv.customerPhone || 'Walk-in';
    const name = inv.customerName || 'Walk-in Customer';
    if (!customerStats[phone]) {
      customerStats[phone] = { name, freq: 0, revenue: 0 };
    }
    customerStats[phone].freq++;
    const amt = Number(inv.totalAmount) || 0;
    customerStats[phone].revenue += amt;
    
    const items = Array.isArray(inv.items) ? inv.items : [];
    items.forEach(i => { totalBasketItems += (Number(i.qty) || 0); });
    
    const ts = Number(inv.timestamp) || 0;
    const dayOfWeek = new Date(ts).getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      weekdayRev += amt;
    }
  });
  
  const topCustBody = document.getElementById('rep-top-customers-body');
  if (topCustBody) {
    const sortedCusts = Object.values(customerStats).sort((a, b) => b.revenue - a.revenue);
    if (sortedCusts.length === 0) {
      topCustBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--bo-muted);padding:14px;">No customer transactions in period.</td></tr>';
    } else {
      topCustBody.innerHTML = sortedCusts.slice(0, 5).map(c => {
        const aov = c.freq > 0 ? (c.revenue / c.freq) : 0;
        return `
          <tr>
            <td><strong>${c.name}</strong></td>
            <td style="text-align:right;">${c.freq}</td>
            <td style="text-align:right;font-weight:500;color:var(--bo-gold-dark);">₹${Math.round(c.revenue).toLocaleString('en-IN')}</td>
            <td style="text-align:right;">₹${Math.round(aov).toLocaleString('en-IN')}</td>
          </tr>`;
      }).join('');
    }
  }
  
  const totalCusts = Object.keys(customerStats).length;
  let repeatCusts = 0;
  Object.values(customerStats).forEach(c => {
    if (c.freq > 1) repeatCusts++;
  });
  
  const repeatPct = totalCusts > 0 ? Math.round((repeatCusts / totalCusts) * 100) : 0;
  const weekdayPct = totalRev > 0 ? Math.round((weekdayRev / totalRev) * 100) : 0;
  const avgBasket = periodInvoices.length > 0 ? (totalBasketItems / periodInvoices.length).toFixed(1) : '0.0';
  
  const repeatPctEl = document.getElementById('rep-repeat-customer-pct');
  if (repeatPctEl) repeatPctEl.textContent = repeatPct + '%';
  const repeatBarEl = document.getElementById('rep-repeat-customer-bar');
  if (repeatBarEl) repeatBarEl.style.width = repeatPct + '%';
  
  const weekdayPctEl = document.getElementById('rep-weekday-sales-pct');
  if (weekdayPctEl) weekdayPctEl.textContent = weekdayPct + '%';
  const weekdayBarEl = document.getElementById('rep-weekday-sales-bar');
  if (weekdayBarEl) weekdayBarEl.style.width = weekdayPct + '%';
  
  const avgBasketEl = document.getElementById('rep-avg-basket-size');
  if (avgBasketEl) avgBasketEl.textContent = avgBasket;
  
  // 5. AI Business Diagnostics Insights
  const insightsContainer = document.getElementById('ai-insights-list');
  if (insightsContainer) {
    const insights = [];
    
    let avgMargin = 0;
    if (prodList.length > 0) {
      avgMargin = prodList.reduce((sum, p) => sum + (p.revenue > 0 ? (p.profit / p.revenue * 100) : 0), 0) / prodList.length;
    }
    if (avgMargin < 40 && prodList.length > 0) {
      insights.push({
        type: 'warning',
        title: 'Low Gross Margins Detected',
        desc: `Your average sales margin is ${Math.round(avgMargin)}%, which is below the target 40%. Consider increasing selling prices or negotiating raw material rates.`
      });
    } else if (avgMargin >= 50 && prodList.length > 0) {
      insights.push({
        type: 'success',
        title: 'Healthy Gross Margins',
        desc: `Great job! Your average sales margin is a strong ${Math.round(avgMargin)}%, well above industry baseline targets.`
      });
    }
    
    if (repeatPct < 25 && totalCusts > 3) {
      insights.push({
        type: 'info',
        title: 'Low Repeat Orders',
        desc: `Only ${repeatPct}% of customers ordered more than once in this period. Consider introducing loyalty rewards or WhatsApp follow-up campaigns.`
      });
    } else if (repeatPct >= 40 && totalCusts > 3) {
      insights.push({
        type: 'success',
        title: 'High Customer Loyalty',
        desc: `${repeatPct}% repeat customer ratio is excellent, indicating high customer satisfaction and product quality.`
      });
    }
    
    const periodOrders = savedOrders.filter(o => !o.deleted && Number(o.timestamp) >= start.getTime() && Number(o.timestamp) <= end.getTime());
    if (periodOrders.length > 0) {
      let raw = 0, labour = 0;
      periodOrders.forEach(o => {
        raw += Number(o.summary?.rawCost) || 0;
        labour += Number(o.labour?.totalCost) || 0;
      });
      if (labour > raw * 1.5) {
        insights.push({
          type: 'warning',
          title: 'Labour Costs Exceeding Material Budgets',
          desc: `Production labour is disproportionately high compared to ingredient costs. Check active time estimates or review staff efficiency.`
        });
      }
    }
    
    const sortedCats = Object.values(catStats).sort((a, b) => b.revenue - a.revenue);
    if (sortedCats.length > 0) {
      const topCat = sortedCats[0];
      const share = totalRev > 0 ? ((topCat.revenue / totalRev) * 100).toFixed(0) : '0';
      if (share > 50) {
        insights.push({
          type: 'info',
          title: `High Category Concentration in ${topCat.name}`,
          desc: `${topCat.name} accounts for ${share}% of all revenue. While this is your core strength, consider diversifying catalog products to reduce reliance.`
        });
      }
    }

    if (insights.length === 0) {
      insightsContainer.innerHTML = '<div style="color:var(--bo-muted);font-size:12.5px;padding:12px 0;">Not enough data in period to generate diagnostics. Add more calculations and invoices.</div>';
    } else {
      insightsContainer.innerHTML = insights.map(ins => {
        const borderCol = ins.type === 'success' ? 'var(--bo-success)' : (ins.type === 'warning' ? 'var(--bo-danger)' : 'var(--bo-info)');
        const bgCol = ins.type === 'success' ? 'rgba(45,106,79,0.05)' : (ins.type === 'warning' ? 'rgba(155,35,53,0.05)' : 'rgba(26,74,122,0.05)');
        const icon = ins.type === 'success' ? '✅' : (ins.type === 'warning' ? '⚠️' : 'ℹ️');
        return `
          <div style="border-left:4px solid ${borderCol};background:${bgCol};padding:14px;border-radius:0 8px 8px 0;box-shadow:0 1px 4px rgba(0,0,0,0.02);margin-bottom:10px;">
            <div style="font-weight:600;font-size:13px;display:flex;align-items:center;gap:6px;color:var(--bo-brown);">
              <span>${icon}</span> <span>${ins.title}</span>
            </div>
            <div style="font-size:12px;color:var(--bo-muted);margin-top:4px;line-height:1.45;">${ins.desc}</div>
          </div>`;
      }).join('');
    }
  }
}

// ── Canonical name helper (strips trailing weight like 100GM, 500G, 1KG) ────
function extractCanonicalName(name) {
  if (!name) return '';
  // Remove trailing weight patterns: 100GM, 500GMS, 1KG, 200G, 250 GM, 100 GMS, 500ML, 1LTR, etc.
  return name.replace(/\s*(\d+(?:\.\d+)?)\s*(kg|gm|gms|grams|gram|g|ml|l|ltr|litre|litres|oz|lb|lbs|pcs|pc|piece|pieces|pack|pkt|packet)s?\s*\.?$/i, '').trim();
}

// ── Add Ingredient Modal — redesigned with package size ───────────────────────
function showAddIngredient() {
  openModal(`
    <div class="modal-header"><h3>Add New Ingredient</h3><button class="btn btn-sm" onclick="closeModalBtn()"><i class="ti ti-x"></i></button></div>
    <div class="modal-body">
      <form id="add-ing-form" onsubmit="saveNewMasterIngredient(event)">
        <div class="form-group"><label class="form-label required">Ingredient Name <span style="font-size:11px;color:var(--bo-muted);">(include brand &amp; size, e.g. AMUL BUTTER 100GM)</span></label><input type="text" id="new-ing-name" required placeholder="e.g. AMUL BUTTER UNSALTED 100GM" oninput="_updateIngRatePreview()"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label required">Category</label>
            <select id="new-ing-cat" required>
              <option value="Dry">Dry Goods</option><option value="Dairy">Dairy</option><option value="Chocolate">Chocolate</option>
              <option value="Fruit">Fruits</option><option value="Spice">Spices</option><option value="Flavour">Flavours / Extracts</option>
              <option value="Add-in">Add-ins</option><option value="Nuts">Nuts &amp; Seeds</option><option value="Other">Other</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label required">Standard Unit</label>
            <select id="new-ing-unit" required onchange="_updateIngRatePreview()">
              <option value="g">g (grams)</option>
              <option value="kg">kg</option>
              <option value="ml">ml</option>
              <option value="litre">litre</option>
              <option value="piece">piece (eggs, whole fruits, etc.)</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label required">Package Size <span style="font-size:11px;color:var(--bo-muted);">How much is in this pack?</span></label>
            <input type="number" id="new-ing-pkg-size" required min="0.01" step="0.01" placeholder="e.g. 100" oninput="_updateIngRatePreview()">
          </div>
          <div class="form-group"><label class="form-label required">Total Purchase Price (₹) <span style="font-size:11px;color:var(--bo-muted);">for this pack</span></label>
            <input type="number" id="new-ing-rate" required min="0" step="0.01" placeholder="e.g. 62" oninput="_updateIngRatePreview()">
          </div>
        </div>
        <div id="new-ing-rate-preview" style="background:rgba(196,154,60,0.08);border:1px solid rgba(196,154,60,0.25);border-radius:6px;padding:8px 12px;font-size:12.5px;margin-bottom:10px;display:none;">
          <div><span style="color:var(--bo-muted);">Computed rate: </span><strong id="new-ing-rate-val" style="color:var(--bo-gold-dark);">—</strong></div>
          <div id="new-ing-canonical-warn" style="display:none;margin-top:6px;padding:6px 8px;background:rgba(196,154,60,0.12);border-radius:4px;font-size:11.5px;color:var(--bo-gold-dark);"></div>
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;margin-top:10px;"><i class="ti ti-plus"></i> Add to Master List</button>
      </form>
    </div>`);
}

function _updateIngRatePreview() {
  const pkgSizeEl = document.getElementById('new-ing-pkg-size');
  const priceEl   = document.getElementById('new-ing-rate');
  const unitEl    = document.getElementById('new-ing-unit');
  const nameEl    = document.getElementById('new-ing-name');
  const preview   = document.getElementById('new-ing-rate-preview');
  const val       = document.getElementById('new-ing-rate-val');
  const warn      = document.getElementById('new-ing-canonical-warn');
  if (!pkgSizeEl || !priceEl || !unitEl) return;
  const pkgSize    = parseFloat(pkgSizeEl.value)  || 0;
  const totalPrice = parseFloat(priceEl.value)    || 0;
  const unit = unitEl.value || 'g';
  if (pkgSize > 0 && totalPrice > 0) {
    const ratePerUnit = totalPrice / pkgSize;
    if (preview) preview.style.display = 'block';
    if (val) val.textContent = '₹' + ratePerUnit.toFixed(4) + ' per ' + unit;
    if (nameEl && warn) {
      const canonical = extractCanonicalName(nameEl.value);
      const matches = canonical.length > 3
        ? ingredientsMaster.filter(i => !i.deleted && extractCanonicalName(i.name).toLowerCase() === canonical.toLowerCase() && i.name.toLowerCase() !== nameEl.value.toLowerCase())
        : [];
      if (matches.length > 0) {
        warn.style.display = 'block';
        warn.textContent = '⚠️ Similar items: ' + matches.map(m => m.name).join(', ') + '. A weighted average rate will be computed.';
      } else {
        warn.style.display = 'none';
      }
    }
  } else {
    if (preview) preview.style.display = 'none';
  }
}


async function saveNewMasterIngredient(e) {
  e.preventDefault();
  var name    = document.getElementById('new-ing-name').value.trim();
  var cat     = document.getElementById('new-ing-cat').value;
  var unit    = document.getElementById('new-ing-unit').value;
  var pkgSize = parseFloat(document.getElementById('new-ing-pkg-size').value) || 0;
  var totalPrice = parseFloat(document.getElementById('new-ing-rate').value) || 0;

  if (pkgSize <= 0) { showToast('Package size must be greater than 0!', true); return; }

  // Compute rate per standard unit
  var ratePerUnit = totalPrice / pkgSize;

  // Check for exact name duplicate
  if (ingredientsMaster.some(i => !i.deleted && i.name.toLowerCase() === name.toLowerCase())) {
    showToast('An ingredient with this exact name already exists!', true); return;
  }

  // Check for canonical name matches (same product, different pack size)
  var canonical = extractCanonicalName(name);
  var canonicalMatches = canonical.length > 3
    ? ingredientsMaster.filter(i => !i.deleted && extractCanonicalName(i.name).toLowerCase() === canonical.toLowerCase())
    : [];

  if (canonicalMatches.length > 0) {
    // Weighted average: combine stock quantities and costs
    var existingTotalQty = canonicalMatches.reduce((s, m) => s + (Number(m.stockQty) || 0), 0);
    var existingTotalCost = canonicalMatches.reduce((s, m) => s + (Number(m.stockQty) || 0) * (Number(m.rate) || 0), 0);
    // Add new pack: pkgSize units at ratePerUnit
    var newWeightedRate = (existingTotalCost + pkgSize * ratePerUnit) / (existingTotalQty + pkgSize);
    var displayRate = isFinite(newWeightedRate) ? newWeightedRate : ratePerUnit;
    var existingNames = canonicalMatches.map(m => m.name).join(', ');
    var doAdd = confirm(`Found similar item(s): ${existingNames}\n\nAdding "${name}" as a new pack size.\nWeighted average rate across all pack sizes: \u20b9${displayRate.toFixed(4)} per ${unit}\n\nClick OK to add this new pack size.`);
    if (!doAdd) return;
  }

  try {
    var saved = await API.addIngredient({ name, cat, unit, rate: ratePerUnit, packageSize: pkgSize, totalPurchasePrice: totalPrice });
    ingredientsMaster.push(saved);
    renderMaterialsMaster();
    closeModalBtn();
    showToast(`Ingredient added! Rate: \u20b9${ratePerUnit.toFixed(4)} per ${unit}`);
  } catch (err) { showToast('Failed to add ingredient!', true); }
}


// ── Add Packaging Modal ───────────────────────────────────────
function showAddPackaging() {
  openModal(`
    <div class="modal-header"><h3>Add New Packaging Item</h3><button class="btn btn-sm" onclick="closeModalBtn()"><i class="ti ti-x"></i></button></div>
    <div class="modal-body">
      <form id="add-pack-form" onsubmit="saveNewMasterPackaging(event)">
        <div class="form-group"><label class="form-label required">Item Name</label><input type="text" id="new-pack-name" required placeholder="e.g. Cake Box Luxury (8 inch)"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label required">Type</label>
            <select id="new-pack-type" required>
              <option value="Box">Box</option><option value="Board">Board</option><option value="Bag">Bag</option>
              <option value="Sticker">Sticker</option><option value="Card">Card</option><option value="Accessory">Accessory</option>
              <option value="Filler">Filler</option><option value="Other">Other</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Size / Variant</label><input type="text" id="new-pack-size" placeholder="e.g. 8x8 inch"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label required">Rate (₹)</label><input type="number" id="new-pack-rate" required min="0" step="0.01" placeholder="e.g. 45"></div>
          <div class="form-group"><label class="form-label">Vendor</label><input type="text" id="new-pack-vendor" placeholder="e.g. LocalSupply"></div>
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;margin-top:10px;"><i class="ti ti-plus"></i> Add to Packaging List</button>
      </form>
    </div>`);
}

async function saveNewMasterPackaging(e) {
  e.preventDefault();
  var name   = document.getElementById('new-pack-name').value;
  var type   = document.getElementById('new-pack-type').value;
  var size   = document.getElementById('new-pack-size').value || 'Standard';
  var rate   = parseFloat(document.getElementById('new-pack-rate').value) || 0;
  var vendor = document.getElementById('new-pack-vendor').value || 'Unknown';
  if (packagingMaster.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    alert('A packaging item with this name already exists!'); return;
  }
  try {
    var saved = await API.addPackaging({ name, type, size, rate, vendor });
    packagingMaster.push(saved);
    renderPackagingMaster();
    closeModalBtn();
    showToast('Packaging item added!');
  } catch (err) { showToast('Failed to add packaging item!', true); }
}

// ── Add Product Modal ─────────────────────────────────────────
function showAddProduct() {
  var calcCost = parseFloat(document.getElementById('r-cost').textContent) || 0;
  var calcSell = parseFloat(document.getElementById('r-selling').textContent) || 0;
  var calcName = document.getElementById('calc-name').value || '';
  openModal(`
    <div class="modal-header"><h3>Add Product to Catalog</h3><button class="btn btn-sm" onclick="closeModalBtn()"><i class="ti ti-x"></i></button></div>
    <div class="modal-body">
      <form id="add-prod-form" onsubmit="saveNewCatalogProduct(event)">
        <div class="form-group"><label class="form-label required">Product Name</label><input type="text" id="new-prod-name" required value="${calcName}" placeholder="e.g. Premium Red Velvet Cake"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label required">Category</label><input type="text" id="new-prod-cat" required placeholder="e.g. Signature Cake"></div>
          <div class="form-group"><label class="form-label required">Emoji Icon</label><input type="text" id="new-prod-emoji" required value="🎂" style="text-align:center;font-size:18px;"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label required">Cost Price (₹)</label><input type="number" id="new-prod-cost" required min="0" step="0.01" value="${calcCost}"></div>
          <div class="form-group"><label class="form-label required">Selling Price (₹)</label><input type="number" id="new-prod-sell" required min="0" step="0.01" value="${calcSell}"></div>
        </div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;margin-top:10px;"><i class="ti ti-plus"></i> Add Product to Catalog</button>
      </form>
    </div>`);
}

async function saveNewCatalogProduct(e) {
  e.preventDefault();
  var name  = document.getElementById('new-prod-name').value;
  var cat   = document.getElementById('new-prod-cat').value;
  var emoji = document.getElementById('new-prod-emoji').value;
  var cost  = parseFloat(document.getElementById('new-prod-cost').value) || 0;
  var sell  = parseFloat(document.getElementById('new-prod-sell').value) || 0;
  try {
    var saved = await API.addProduct({ name, cat, emoji, cost, sell });
    catalogProducts.push(saved);
    renderProductCatalog();
    renderDashboardTable();
    closeModalBtn();
    showToast('Product added to catalog!');
  } catch (err) { showToast('Failed to add product!', true); }
}

// ── Autocomplete search ───────────────────────────────────────
var activeSuggestIndex = -1;
var activeMatches = [];

document.addEventListener('input', function(e) {
  if (e.target.classList.contains('ing-search'))  handleSearchInput(e.target, 'ingredient');
  else if (e.target.classList.contains('pack-search')) handleSearchInput(e.target, 'packaging');
  else if (e.target.classList.contains('deco-search')) handleSearchInput(e.target, 'decoration');
});
document.addEventListener('focusin', function(e) {
  if (e.target.classList.contains('ing-search'))  handleSearchInput(e.target, 'ingredient');
  else if (e.target.classList.contains('pack-search')) handleSearchInput(e.target, 'packaging');
  else if (e.target.classList.contains('deco-search')) handleSearchInput(e.target, 'decoration');
});
document.addEventListener('keydown', function(e) {
  var t = e.target;
  if (!t.classList.contains('ing-search') && !t.classList.contains('pack-search') && !t.classList.contains('deco-search')) return;
  var type   = t.classList.contains('ing-search') ? 'ingredient' : (t.classList.contains('pack-search') ? 'packaging' : 'decoration');
  var idx    = t.dataset.idx;
  var prefix = type === 'ingredient' ? 'ing' : (type === 'packaging' ? 'pac' : 'dec');
  var resEl  = document.getElementById(prefix + '-results-' + idx);
  if (!resEl || resEl.classList.contains('hidden')) return;
  var items  = resEl.querySelectorAll('.autocomplete-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); activeSuggestIndex=(activeSuggestIndex+1)%items.length; highlightSuggestItem(items,activeSuggestIndex); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); activeSuggestIndex=(activeSuggestIndex-1+items.length)%items.length; highlightSuggestItem(items,activeSuggestIndex); }
  else if (e.key === 'Enter') { e.preventDefault(); if (activeSuggestIndex>-1&&activeSuggestIndex<activeMatches.length) selectSuggestion(idx,activeMatches[activeSuggestIndex],type); }
  else if (e.key === 'Escape') { resEl.classList.add('hidden'); activeSuggestIndex=-1; }
});
document.addEventListener('click', function(e) {
  if (!e.target.closest('.autocomplete-wrapper')) {
    document.querySelectorAll('.autocomplete-results').forEach(el=>el.classList.add('hidden'));
    activeSuggestIndex = -1;
  }
});

function highlightSuggestItem(items, index) {
  items.forEach((item,i)=>{ item.classList.toggle('active', i===index); if(i===index)item.scrollIntoView({block:'nearest'}); });
}

function handleSearchInput(inputEl, type) {
  var query = inputEl.value.toLowerCase().trim();
  var idx = inputEl.dataset.idx;
  var prefix = type==='ingredient'?'ing':(type==='packaging'?'pac':'dec');
  var resEl = document.getElementById(prefix+'-results-'+idx);
  if (!resEl) return;
  var matches = [];
  if (type==='ingredient') matches=ingredientsMaster.filter(i=>!i.deleted&&i.name.toLowerCase().includes(query));
  else if(type==='packaging') matches=packagingMaster.filter(p=>!p.deleted&&p.name.toLowerCase().includes(query));
  else if(type==='decoration'){
    var mI=ingredientsMaster.filter(i=>!i.deleted&&['Dairy','Fruit','Spice','Flavour','Add-in','Nuts'].includes(i.cat)&&i.name.toLowerCase().includes(query));
    var mP=packagingMaster.filter(p=>!p.deleted&&['Sticker','Card','Accessory','Filler','Box','Board'].includes(p.type)&&p.name.toLowerCase().includes(query));
    matches=[...mI,...mP];
  }
  matches=matches.slice(0,8);
  activeMatches=matches;
  if(!matches.length){resEl.innerHTML='';resEl.classList.add('hidden');return;}
  resEl.innerHTML=matches.map((m,i)=>{
    var rateStr=m.vendor?`₹${m.rate} (${m.vendor})`:`₹${m.rate}/${m.unit}`;
    var label=m.cat||m.type||'Deco';
    return `<div class="autocomplete-item" data-idx="${i}" onclick="selectSuggestion(${idx},activeMatches[${i}],'${type}')"><span>${m.name}</span><span class="details">${label} • ${rateStr}</span></div>`;
  }).join('');
  resEl.classList.remove('hidden');
}

function selectSuggestion(idx,matched,type){
  if(type==='ingredient'){var ing=ingredients[idx];ing.name=matched.name;ing.masterId=matched.name;ing.unit=determineDefaultUnit(matched.unit,matched.name);ing.rate=convertMasterRate(matched.rate,matched.unit,ing.unit,matched.name);ing.wastage=ing.wastage||0;renderIngredients();}
  else if(type==='packaging'){var pack=packaging[idx];pack.name=matched.name;pack.qty=1;pack.unit='piece';pack.rate=matched.rate;renderPackaging();}
  else if(type==='decoration'){var deco=decorations[idx];deco.name=matched.name;deco.qty=1;deco.unit=matched.unit||'piece';deco.rate=matched.rate;renderDecorations();}
  recalculate();
  activeSuggestIndex=-1;
  document.querySelectorAll('.autocomplete-results').forEach(el=>el.classList.add('hidden'));
}

// ── Unit conversion ───────────────────────────────────────────
function parsePackageSize(name, unit) {
  const str = ((name || '') + ' ' + (unit || '')).toLowerCase();
  const regex = /(\d+(?:\.\d+)?)\s*(kg|g|gm|grams|ml|l|litre|litres|piece|pcs|pkt|packet|bag|set)\b/gi;
  let match;
  while ((match = regex.exec(str)) !== null) {
    const val = parseFloat(match[1]);
    const u = match[2].toLowerCase();
    if (val > 0) {
      if (u === 'kg') return { val: val * 1000, stdUnit: 'g' };
      if (u === 'g' || u === 'gm' || u === 'grams') return { val: val, stdUnit: 'g' };
      if (u === 'l' || u === 'litre' || u === 'litres') return { val: val * 1000, stdUnit: 'ml' };
      if (u === 'ml') return { val: val, stdUnit: 'ml' };
      if (u === 'piece' || u === 'pcs' || u === 'pkt' || u === 'packet' || u === 'bag' || u === 'set') return { val: val, stdUnit: 'piece' };
    }
  }
  const normUnit = (unit || '').toLowerCase().trim();
  if (normUnit === 'kg') return { val: 1000, stdUnit: 'g' };
  if (normUnit === 'g' || normUnit === 'gm') return { val: 1, stdUnit: 'g' };
  if (normUnit === 'l' || normUnit === 'litre') return { val: 1000, stdUnit: 'ml' };
  if (normUnit === 'ml') return { val: 1, stdUnit: 'ml' };
  return null;
}

function getConversionFactorV2(itemName, masterUnit, targetUnit) {
  masterUnit = (masterUnit || '').toLowerCase().trim();
  targetUnit = (targetUnit || '').toLowerCase().trim();
  if (masterUnit === targetUnit) return 1;
  const pkg = parsePackageSize(itemName, masterUnit);
  if (pkg) {
    let targetVal = 1;
    let targetStd = targetUnit;
    if (targetUnit === 'kg') {
      targetVal = 1000;
      targetStd = 'g';
    } else if (targetUnit === 'l' || targetUnit === 'litre') {
      targetVal = 1000;
      targetStd = 'ml';
    } else if (targetUnit === 'g' || targetUnit === 'gm') {
      targetStd = 'g';
    } else if (targetUnit === 'ml') {
      targetStd = 'ml';
    }
    if (pkg.stdUnit === targetStd) {
      return targetVal / pkg.val;
    }
  }
  return getUnitConversionFactor(masterUnit, targetUnit);
}

function getUnitConversionFactor(masterUnit,targetUnit){
  masterUnit=masterUnit.toLowerCase().trim();targetUnit=targetUnit.toLowerCase().trim();
  if(masterUnit===targetUnit)return 1;
  if(masterUnit==='kg'&&targetUnit==='g')return 1/1000;
  if(masterUnit==='g'&&targetUnit==='kg')return 1000;
  if((masterUnit==='litre'||masterUnit==='l')&&targetUnit==='ml')return 1/1000;
  if(masterUnit==='ml'&&(targetUnit==='litre'||targetUnit==='l'))return 1000;
  if(masterUnit==='500g'&&targetUnit==='g')return 1/500;
  if(masterUnit==='500g'&&targetUnit==='kg')return 2;
  if(masterUnit==='200g'&&targetUnit==='g')return 1/200;
  if(masterUnit==='200g'&&targetUnit==='kg')return 5;
  if(masterUnit.includes('250g')&&targetUnit==='g')return 1/250;
  if(masterUnit.includes('250g')&&targetUnit==='kg')return 4;
  if(masterUnit==='350g'&&targetUnit==='g')return 1/350;
  if(masterUnit==='50g'&&targetUnit==='g')return 1/50;
  if(masterUnit.includes('100g')&&targetUnit==='g')return 1/100;
  if(masterUnit==='30ml'&&targetUnit==='ml')return 1/30;
  return 1;
}
function determineDefaultUnit(u, name){
  u=u.toLowerCase().trim();
  if(u==='kg')return'g';
  if(u==='litre'||u==='l')return'ml';
  if(u.includes('g'))return'g';
  if(u.includes('ml'))return'ml';
  if(name){
    const pkg=parsePackageSize(name, u);
    if(pkg && (pkg.stdUnit==='g' || pkg.stdUnit==='ml')) return pkg.stdUnit;
  }
  return u;
}
function convertMasterRate(rate,masterUnit,targetUnit,itemName){return +((rate*getConversionFactorV2(itemName,masterUnit,targetUnit)).toFixed(4));}
function onIngredientUnitChange(idx,newUnit){var ing=ingredients[idx];ing.unit=newUnit;var m=ingredientsMaster.find(x=>x.name===ing.name);if(m)ing.rate=convertMasterRate(m.rate,m.unit,newUnit,ing.name);recalculate();}
function onPackagingUnitChange(idx,newUnit){var p=packaging[idx];p.unit=newUnit;var m=packagingMaster.find(x=>x.name===p.name);if(m)p.rate=m.rate;recalculate();}
function onDecorationUnitChange(idx,newUnit){var d=decorations[idx];d.unit=newUnit;var m=packagingMaster.find(x=>x.name===d.name)||ingredientsMaster.find(x=>x.name===d.name);if(m){d.rate=ingredientsMaster.includes(m)?convertMasterRate(m.rate,m.unit,newUnit,d.name):m.rate;}recalculate();}

// ── Ingredient / Decoration / Packaging management ────────────
function addIngredient(name,qty,unit,rate){var id='ing-'+Date.now()+'-'+Math.random();ingredients.push({id,name:name||'',qty:qty||0,unit:unit||'g',rate:rate||0,wastage:0});renderIngredients();recalculate();}
function addDecoItem(name){var id='deco-'+Date.now()+'-'+Math.random();decorations.push({id,name:name||'',qty:1,unit:'piece',rate:0});renderDecorations();recalculate();}
function addPackItem(name){var id='pack-'+Date.now()+'-'+Math.random();packaging.push({id,name:name||'',qty:1,unit:'piece',rate:0});renderPackaging();recalculate();}
function addDecoration(){addDecoItem('');}
function addPackaging(){addPackItem('');}

function renderIngredients(){
  var el=document.getElementById('ingredient-list');
  if(!ingredients.length){el.innerHTML='<div style="color:var(--bo-muted);font-size:13px;padding:8px 0;">No ingredients yet. Click + Add to start.</div>';return;}
  el.innerHTML=ingredients.map((ing,i)=>`
    <div class="ingredient-row" data-id="${ing.id}">
      <div class="autocomplete-wrapper">
        <input type="text" class="autocomplete-input ing-search" placeholder="Ingredient name" value="${ing.name}" data-idx="${i}" autocomplete="off" onchange="ingredients[${i}].name=this.value;recalculate()">
        <div class="autocomplete-results hidden" id="ing-results-${i}"></div>
      </div>
      <input type="number" placeholder="Qty" value="${ing.qty||''}" min="0" step="0.01" onchange="ingredients[${i}].qty=+this.value;recalculate()">
      <select onchange="onIngredientUnitChange(${i},this.value)">
        ${['g','kg','ml','litre','piece'].map(u=>`<option${ing.unit===u?' selected':''}>${u}</option>`).join('')}
      </select>
      <input type="number" placeholder="Rate ₹" value="${ing.rate||''}" min="0" step="0.0001" onchange="ingredients[${i}].rate=+this.value;recalculate()">
      <input type="number" placeholder="0%" value="${ing.wastage||''}" min="0" max="50" step="1" onchange="ingredients[${i}].wastage=+this.value;recalculate()" style="width:60px;">
      <button class="remove-btn" onclick="removeIngredient('${ing.id}')"><i class="ti ti-x"></i></button>
    </div>`).join('');
}

function renderDecorations(){
  var el=document.getElementById('decoration-list');
  if(!decorations.length){el.innerHTML='<div style="color:var(--bo-muted);font-size:13px;padding:8px 0;">No decoration items yet.</div>';return;}
  el.innerHTML=decorations.map((d,i)=>`
    <div class="ingredient-row" data-id="${d.id}">
      <div class="autocomplete-wrapper">
        <input type="text" class="autocomplete-input deco-search" placeholder="Decoration item" value="${d.name}" data-idx="${i}" autocomplete="off" onchange="decorations[${i}].name=this.value;recalculate()">
        <div class="autocomplete-results hidden" id="dec-results-${i}"></div>
      </div>
      <input type="number" placeholder="Qty" value="${d.qty||''}" min="0" step="0.01" onchange="decorations[${i}].qty=+this.value;recalculate()">
      <select onchange="onDecorationUnitChange(${i},this.value)">
        ${['piece','g','ml','sheet','packet','set'].map(u=>`<option${d.unit===u?' selected':''}>${u}</option>`).join('')}
      </select>
      <input type="number" placeholder="Rate ₹" value="${d.rate||''}" min="0" step="0.01" onchange="decorations[${i}].rate=+this.value;recalculate()">
      <span style="font-size:13px;font-weight:500;color:var(--bo-gold-dark);">₹${((d.qty||0)*(d.rate||0)).toFixed(2)}</span>
      <button class="remove-btn" onclick="removeDecoration('${d.id}')"><i class="ti ti-x"></i></button>
    </div>`).join('');
}

function renderPackaging(){
  var el=document.getElementById('packaging-list');
  if(!packaging.length){el.innerHTML='<div style="color:var(--bo-muted);font-size:13px;padding:8px 0;">No packaging items yet.</div>';return;}
  el.innerHTML=packaging.map((p,i)=>`
    <div class="ingredient-row" style="grid-template-columns:2fr 1fr 1fr 1fr auto;" data-id="${p.id}">
      <div class="autocomplete-wrapper">
        <input type="text" class="autocomplete-input pack-search" placeholder="Packaging item" value="${p.name}" data-idx="${i}" autocomplete="off" onchange="packaging[${i}].name=this.value;recalculate()">
        <div class="autocomplete-results hidden" id="pac-results-${i}"></div>
      </div>
      <input type="number" placeholder="Qty" value="${p.qty||''}" min="0" step="1" onchange="packaging[${i}].qty=+this.value;recalculate()">
      <select onchange="onPackagingUnitChange(${i},this.value)">
        ${['piece','pack','roll','set'].map(u=>`<option${p.unit===u?' selected':''}>${u}</option>`).join('')}
      </select>
      <input type="number" placeholder="Rate ₹" value="${p.rate||''}" min="0" step="0.01" onchange="packaging[${i}].rate=+this.value;recalculate()">
      <button class="remove-btn" onclick="removePackaging('${p.id}')"><i class="ti ti-x"></i></button>
    </div>`).join('');
}

function removeIngredient(id){ingredients=ingredients.filter(i=>i.id!==id);renderIngredients();recalculate();}
function removeDecoration(id){decorations=decorations.filter(d=>d.id!==id);renderDecorations();recalculate();}
function removePackaging(id){packaging=packaging.filter(p=>p.id!==id);renderPackaging();recalculate();}

// ── Calculator ────────────────────────────────────────────────
function recalculate(){
  var rawTotal=ingredients.reduce((sum,i)=>{var c=(i.qty||0)*(i.rate||0);return sum+c*(1+((i.wastage||0)/100));},0);
  document.getElementById('raw-total').textContent=rawTotal.toFixed(2);
  document.getElementById('r-raw').textContent=rawTotal.toFixed(2);

  var decoTotal=decorations.reduce((sum,d)=>sum+(d.qty||0)*(d.rate||0),0);
  document.getElementById('deco-total').textContent=decoTotal.toFixed(2);
  document.getElementById('r-deco').textContent=decoTotal.toFixed(2);

  var packTotal=packaging.reduce((sum,p)=>sum+(p.qty||0)*(p.rate||0),0);
  document.getElementById('pack-total').textContent=packTotal.toFixed(2);
  document.getElementById('r-pack').textContent=packTotal.toFixed(2);

  // Labour — Direct COGS (Simple effort points vs Advanced active time-minutes)
  var method = document.getElementById('labour-method')?.value || 'advanced';
  var batchSize = parseFloat(document.getElementById('calc-batch').value) || 1;
  var labourTotal = 0;
  var activeMins = 0;
  
  if (method === 'simple') {
    var effortPoints = parseFloat(document.getElementById('labour-effort-level')?.value) || 1.0;
    var costPerPoint = getLabourCostPerEffortPoint();
    labourTotal = effortPoints * costPerPoint * batchSize;
    
    var totalPoints = effortPoints * batchSize;
    document.getElementById('labour-hours').textContent = totalPoints.toFixed(1) + ' pts';
    document.getElementById('labour-total').textContent = labourTotal.toFixed(2);
    document.getElementById('r-labour').textContent = labourTotal.toFixed(2);
  } else {
    var batchActiveMins = parseFloat(document.getElementById('labour-prep')?.value) || 0;
    var batchStaff = parseFloat(document.getElementById('labour-batch-staff')?.value) || 1;
    var unitActiveMins = parseFloat(document.getElementById('labour-unit-active')?.value) || 0;
    var unitStaff = parseFloat(document.getElementById('labour-unit-staff')?.value) || 1;
    
    activeMins = (batchActiveMins * batchStaff) + (unitActiveMins * unitStaff * batchSize);
    var derivedRate = parseFloat(document.getElementById('labour-rate')?.value) || 0;
    labourTotal = (activeMins / 60) * derivedRate;
    
    document.getElementById('labour-hours').textContent = (activeMins / 60).toFixed(1) + ' hrs';
    document.getElementById('labour-total').textContent = labourTotal.toFixed(2);
    document.getElementById('r-labour').textContent = labourTotal.toFixed(2);
  }

  // Overheads — Completely removed from product cost calculation
  var overheadInCost = 0;
  if (document.getElementById('overhead-total')) document.getElementById('overhead-total').textContent = '0.00';
  if (document.getElementById('r-overhead')) document.getElementById('r-overhead').textContent = '0.00';
  var ohTimeDisplay = document.getElementById('overhead-time-display');
  if (ohTimeDisplay) ohTimeDisplay.textContent = '0.0 hrs';
  var ohRow = document.getElementById('overhead-breakdown-row');
  if (ohRow) ohRow.style.display = 'none';

  // COGS subtotal (Direct only)
  var cogsTotal = rawTotal + decoTotal + packTotal + labourTotal;
  var cogsTotalEl = document.getElementById('r-cogs');
  if (cogsTotalEl) cogsTotalEl.textContent = cogsTotal.toFixed(2);

  var misc=+(document.getElementById('misc-cost').value)||0;
  document.getElementById('r-misc').textContent=misc.toFixed(2);

  var subtotal=rawTotal+decoTotal+packTotal+labourTotal+overheadInCost+misc;
  var wastagePct=+(document.getElementById('wastage-pct').value)||0;
  var bufferPct=+(document.getElementById('buffer-pct').value)||0;
  var wastageTotal=subtotal*(wastagePct/100)+subtotal*(bufferPct/100);
  document.getElementById('wastage-total').textContent=wastageTotal.toFixed(2);
  document.getElementById('r-wastage').textContent=wastageTotal.toFixed(2);

  var grandCost=subtotal+wastageTotal;
  document.getElementById('r-cost').textContent=grandCost.toFixed(2);

  var servings=+(document.getElementById('calc-servings').value)||1;
  document.getElementById('r-per-serving').textContent=(grandCost/servings).toFixed(2);
  document.getElementById('r-breakeven').textContent=grandCost.toFixed(2);

  // Selling price — GST-inclusive already, no separate GST markup
  var marginPct=+(document.getElementById('margin-slider').value)||60;
  var calcSell=grandCost*(1+marginPct/100);
  var finalSell=applyPriceRule(calcSell,document.getElementById('price-rule').value);
  document.getElementById('r-selling').textContent=finalSell;
  var profit=finalSell-grandCost;
  var profitPct=grandCost>0?(profit/grandCost*100):0;
  document.getElementById('r-profit').textContent=profit.toFixed(0);
  document.getElementById('r-profit-pct').textContent=profitPct.toFixed(1);
  document.getElementById('r-wholesale').textContent=(finalSell*0.8).toFixed(0);

  renderCompositionBars(grandCost,{'Raw Materials':rawTotal,'Decoration':decoTotal,'Packaging':packTotal,'Direct Labour':labourTotal,'Overheads (Op.)':overheadInCost,'Wastage/Buffer':wastageTotal,'Misc':misc});
}

function applyPriceRule(price,rule){
  if(rule==='round50')return Math.ceil(price/50)*50;
  if(rule==='round100')return Math.ceil(price/100)*100;
  if(rule==='end9'){var b=Math.ceil(price/10)*10;return b%10===0?b-1:b;}
  if(rule==='end99'){return Math.ceil(price/100)*100-1;}
  return Math.round(price);
}

function renderCompositionBars(total,breakdown){
  var el=document.getElementById('composition-bars');
  if(total===0){el.innerHTML='<div style="font-size:12px;color:var(--bo-muted);">Enter costs to see breakdown.</div>';return;}
  var colors={'Raw Materials':'var(--bo-gold)','Decoration':'var(--bo-rose-dark)','Packaging':'#5D8A5E','Labour':'#7A6BAD','Overheads':'#C47A3C','Wastage/Buffer':'#A0A090','Misc':'var(--bo-muted)'};
  el.innerHTML=Object.entries(breakdown).filter(([,v])=>v>0).map(([k,v])=>`
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:3px;">
        <span style="color:var(--bo-muted);">${k}</span>
        <span style="font-weight:500;">${(v/total*100).toFixed(1)}% <span style="color:var(--bo-muted);font-weight:400;">(₹${v.toFixed(0)})</span></span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100,v/total*100)}%;background:${colors[k]||'var(--bo-gold)'};"></div></div>
    </div>`).join('');
}

// ── Dynamic category fields ───────────────────────────────────
function onCategoryChange(){
  var cat=document.getElementById('calc-category').value;
  var df=document.getElementById('dynamic-fields');
  df.innerHTML='';
  if(cat==='fruit-cake'){df.innerHTML=`<div class="section-divider"><span>Fruit Cake Details</span></div><div class="form-row"><div class="form-group"><label class="form-label">Cake Size</label><select id="cat-fruit-size"><option>500g</option><option>1kg</option><option>1.5kg</option><option>2kg</option><option>Custom</option></select></div><div class="form-group"><label class="form-label">Sponge Type</label><select id="cat-fruit-sponge"><option>Vanilla</option><option>Chocolate</option><option>Butterscotch</option><option>Eggless Vanilla</option></select></div></div><div class="form-row"><div class="form-group"><label class="form-label">Cream Type</label><select id="cat-fruit-cream"><option>Fresh Whipped Cream</option><option>Butter Cream</option><option>Ganache</option></select></div><div class="form-group"><label class="form-label">Filling</label><select id="cat-fruit-filling"><option>Fruit Compote</option><option>Jam</option><option>Cream Only</option><option>Custard</option></select></div></div><div class="form-row"><div class="form-group"><label class="form-label">Fruits Used</label><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">${['Strawberry','Kiwi','Blueberry','Mango','Grapes','Pineapple','Cherry'].map(f=>`<label style="font-size:12px;display:flex;align-items:center;gap:4px;"><input type="checkbox" class="cat-fruit-fruit" data-fruit="${f}"> ${f}</label>`).join('')}</div></div><div class="form-group"><label class="form-label">Glaze / Jelly</label><select id="cat-fruit-glaze"><option>None</option><option>Fruit Glaze</option><option>Piping Gel</option><option>Mirror Glaze</option></select></div></div>`;}
  else if(cat==='theme-cake'){df.innerHTML=`<div class="section-divider"><span>Theme Cake Details</span></div><div class="form-row"><div class="form-group"><label class="form-label">Theme / Occasion</label><input type="text" id="cat-theme-occasion" placeholder="e.g. Unicorn, Birthday, Wedding"></div><div class="form-group"><label class="form-label">Fondant Weight (g)</label><input type="number" id="cat-theme-fondant-weight" placeholder="Grams of fondant" oninput="recalculate()"></div></div><div class="form-row"><div class="form-group"><label class="form-label">Color Scheme</label><input type="text" id="cat-theme-color-scheme" placeholder="e.g. Pink &amp; Gold"></div><div class="form-group"><label class="form-label">Tiers</label><select id="cat-theme-tiers"><option>1 Tier</option><option>2 Tier</option><option>3 Tier</option></select></div></div><div class="form-row"><div class="form-group"><label class="form-label">Special Add-ons</label><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">${['Custom Topper','Edible Print','Sugar Flowers','Figurines','Luster Dust','LED Lights'].map(f=>`<label style="font-size:12px;display:flex;align-items:center;gap:4px;"><input type="checkbox" class="cat-theme-addon" data-addon="${f}"> ${f}</label>`).join('')}</div></div><div class="form-group"><label class="form-label">Decoration Hours</label><input type="number" id="cat-theme-hours" placeholder="Extra deco hours" oninput="recalculate()"></div></div>`;}
  else if(cat==='fusion-cake'){df.innerHTML=`<div class="section-divider"><span>Fusion Cake Details</span></div><div class="form-row"><div class="form-group"><label class="form-label">Fusion Flavour</label><select id="cat-fusion-flavour"><option>Rasmalai</option><option>Gulab Jamun</option><option>Kesar Pista</option><option>Mango Alphonso</option><option>Thandai</option><option>Paan</option><option>Motichoor</option></select></div><div class="form-group"><label class="form-label">Main Mithai Qty</label><input type="text" id="cat-fusion-quantity" placeholder="e.g. 6 pieces rasmalai"></div></div>`;}
  else if(cat==='brownie'){df.innerHTML=`<div class="section-divider"><span>Brownie Details</span></div><div class="form-row"><div class="form-group"><label class="form-label">Box Size</label><select id="cat-brownie-size"><option>4 pieces</option><option>6 pieces</option><option>8 pieces</option><option>12 pieces</option><option>16 pieces</option></select></div><div class="form-group"><label class="form-label">Flavour Mix</label><input type="text" id="cat-brownie-mix" placeholder="e.g. 4 Fudgy, 4 Biscoff"></div></div>`;}
  else if(cat==='bread'){df.innerHTML=`<div class="section-divider"><span>Bread Details</span></div><div class="form-row"><div class="form-group"><label class="form-label">Bread Type</label><select id="cat-bread-type"><option>White Sandwich</option><option>Whole Wheat</option><option>Multigrain</option><option>Sourdough</option><option>Garlic Herb</option></select></div><div class="form-group"><label class="form-label">Loaf Weight (g)</label><input type="number" id="cat-bread-weight" value="400" oninput="recalculate()"></div></div>`;}
}

function getCategoryDetails(){
  var cat=document.getElementById('calc-category').value;
  if(!cat)return null;
  var d={};
  if(cat==='fruit-cake'){var fruits=[];document.querySelectorAll('.cat-fruit-fruit').forEach(cb=>{if(cb.checked)fruits.push(cb.dataset.fruit);});d={size:document.getElementById('cat-fruit-size')?.value,sponge:document.getElementById('cat-fruit-sponge')?.value,cream:document.getElementById('cat-fruit-cream')?.value,filling:document.getElementById('cat-fruit-filling')?.value,glaze:document.getElementById('cat-fruit-glaze')?.value,fruits};}
  else if(cat==='theme-cake'){var addons=[];document.querySelectorAll('.cat-theme-addon').forEach(cb=>{if(cb.checked)addons.push(cb.dataset.addon);});d={theme:document.getElementById('cat-theme-occasion')?.value,fondantWeight:document.getElementById('cat-theme-fondant-weight')?.value,colorScheme:document.getElementById('cat-theme-color-scheme')?.value,tiers:document.getElementById('cat-theme-tiers')?.value,hours:document.getElementById('cat-theme-hours')?.value,addons};}
  else if(cat==='fusion-cake'){d={flavour:document.getElementById('cat-fusion-flavour')?.value,mithaiQty:document.getElementById('cat-fusion-quantity')?.value};}
  else if(cat==='brownie'){d={boxSize:document.getElementById('cat-brownie-size')?.value,flavourMix:document.getElementById('cat-brownie-mix')?.value};}
  else if(cat==='bread'){d={breadType:document.getElementById('cat-bread-type')?.value,loafWeight:document.getElementById('cat-bread-weight')?.value};}
  return d;
}

function restoreCategoryDetails(cat,details){
  if(!cat||!details)return;
  document.getElementById('calc-category').value=cat;
  onCategoryChange();
  setTimeout(()=>{
    if(cat==='fruit-cake'){
      if(document.getElementById('cat-fruit-size'))document.getElementById('cat-fruit-size').value=details.size||'1kg';
      if(document.getElementById('cat-fruit-sponge'))document.getElementById('cat-fruit-sponge').value=details.sponge||'Vanilla';
      if(document.getElementById('cat-fruit-cream'))document.getElementById('cat-fruit-cream').value=details.cream||'Fresh Whipped Cream';
      if(document.getElementById('cat-fruit-filling'))document.getElementById('cat-fruit-filling').value=details.filling||'Fruit Compote';
      if(document.getElementById('cat-fruit-glaze'))document.getElementById('cat-fruit-glaze').value=details.glaze||'None';
      if(details.fruits)document.querySelectorAll('.cat-fruit-fruit').forEach(cb=>{cb.checked=details.fruits.includes(cb.dataset.fruit);});
    }else if(cat==='theme-cake'){
      if(document.getElementById('cat-theme-occasion'))document.getElementById('cat-theme-occasion').value=details.theme||'';
      if(document.getElementById('cat-theme-fondant-weight'))document.getElementById('cat-theme-fondant-weight').value=details.fondantWeight||'';
      if(document.getElementById('cat-theme-color-scheme'))document.getElementById('cat-theme-color-scheme').value=details.colorScheme||'';
      if(document.getElementById('cat-theme-tiers'))document.getElementById('cat-theme-tiers').value=details.tiers||'1 Tier';
      if(document.getElementById('cat-theme-hours'))document.getElementById('cat-theme-hours').value=details.hours||'';
      if(details.addons)document.querySelectorAll('.cat-theme-addon').forEach(cb=>{cb.checked=details.addons.includes(cb.dataset.addon);});
    }else if(cat==='fusion-cake'){
      if(document.getElementById('cat-fusion-flavour'))document.getElementById('cat-fusion-flavour').value=details.flavour||'Rasmalai';
      if(document.getElementById('cat-fusion-quantity'))document.getElementById('cat-fusion-quantity').value=details.mithaiQty||'';
    }else if(cat==='brownie'){
      if(document.getElementById('cat-brownie-size'))document.getElementById('cat-brownie-size').value=details.boxSize||'8 pieces';
      if(document.getElementById('cat-brownie-mix'))document.getElementById('cat-brownie-mix').value=details.flavourMix||'';
    }else if(cat==='bread'){
      if(document.getElementById('cat-bread-type'))document.getElementById('cat-bread-type').value=details.breadType||'White Sandwich';
      if(document.getElementById('cat-bread-weight'))document.getElementById('cat-bread-weight').value=details.loafWeight||400;
    }
    recalculate();
  },50);
}

// ── Templates ─────────────────────────────────────────────────
function loadTemplate(type){
  navigate('calculator');
  setTimeout(()=>{
    resetCalc();
    var catMap={'fruit-cake':'fruit-cake','theme-cake':'theme-cake','brownie-box':'brownie','cookie-box':'cookie','fusion-cake':'fusion-cake','choco-box':'chocolate','bread':'bread','gift-box':'gift-box'};
    document.getElementById('calc-category').value=catMap[type]||'custom';
    onCategoryChange();
    var templates={
      'fruit-cake':{name:'Fruit Cake (1kg) — Custom Order',ings:[{name:'Maida',qty:250,unit:'g',rate:0.04,wastage:3},{name:'Butter (Amul)',qty:120,unit:'g',rate:0.24,wastage:2},{name:'Sugar (Fine)',qty:180,unit:'g',rate:0.05,wastage:1},{name:'Eggs',qty:3,unit:'piece',rate:8,wastage:0},{name:'Whipping Cream',qty:300,unit:'ml',rate:0.28,wastage:5},{name:'Strawberry (fresh)',qty:150,unit:'g',rate:0.2,wastage:10},{name:'Kiwi',qty:2,unit:'piece',rate:30,wastage:8}],deco:[{name:'Fruit Glaze',qty:30,unit:'ml',rate:0.8}],pack:[{name:'Cake Box 1kg',qty:1,unit:'piece',rate:45},{name:'Cake Board 8"',qty:1,unit:'piece',rate:12},{name:'Carry Bag (small)',qty:1,unit:'piece',rate:15},{name:'BlissOven Sticker',qty:2,unit:'piece',rate:3},{name:'Message Card',qty:1,unit:'piece',rate:5}]},
      'theme-cake':{name:'Custom Theme Cake (1kg)',ings:[{name:'Maida',qty:250,unit:'g',rate:0.04,wastage:3},{name:'Butter (Amul)',qty:150,unit:'g',rate:0.24,wastage:2},{name:'Sugar (Fine)',qty:200,unit:'g',rate:0.05,wastage:1},{name:'Eggs',qty:3,unit:'piece',rate:8,wastage:0},{name:'Fresh Cream (25% fat)',qty:250,unit:'ml',rate:0.18,wastage:5}],deco:[{name:'Fondant Weight',qty:400,unit:'g',rate:0.35},{name:'Cake Topper',qty:1,unit:'piece',rate:80},{name:'Candle Set',qty:1,unit:'set',rate:25}],pack:[{name:'Cake Box 1kg',qty:1,unit:'piece',rate:45},{name:'Cake Board 8"',qty:1,unit:'piece',rate:12},{name:'Carry Bag (large)',qty:1,unit:'piece',rate:22},{name:'BlissOven Sticker',qty:2,unit:'piece',rate:3},{name:'Ribbon',qty:1,unit:'piece',rate:8},{name:'Message Card',qty:1,unit:'piece',rate:5}]},
    };
    var tmpl=templates[type];
    if(tmpl){
      document.getElementById('calc-name').value=tmpl.name;
      ingredients=[];decorations=[];packaging=[];
      (tmpl.ings||[]).forEach(i=>ingredients.push({id:'ing-'+Date.now()+Math.random(),...i}));
      (tmpl.deco||[]).forEach(d=>decorations.push({id:'deco-'+Date.now()+Math.random(),...d}));
      (tmpl.pack||[]).forEach(p=>packaging.push({id:'pack-'+Date.now()+Math.random(),...p}));
      renderIngredients();renderDecorations();renderPackaging();
      document.getElementById('labour-prep').value=30;document.getElementById('labour-bake').value=45;
      document.getElementById('labour-deco').value=type==='theme-cake'?90:45;document.getElementById('labour-pack').value=15;
      recalculate();
    }
  },100);
}

function quickCalc(name){var m={'Rasmalai Cake':'fusion-cake','Fruit Cake':'fruit-cake','Brownie Box':'brownie-box','Cookie Box':'cookie-box'};loadTemplate(m[name]||'fruit-cake');}

function resetCalc(){
  ingredients=[];decorations=[];packaging=[];
  currentEditingOrderId=null;
  var banner=document.getElementById('calc-edit-banner');if(banner)banner.remove();
  renderIngredients();renderDecorations();renderPackaging();
  document.getElementById('calc-name').value='';
  document.getElementById('calc-category').value='';
  document.getElementById('dynamic-fields').innerHTML='';
  var owEl=document.getElementById('calc-output-weight');if(owEl)owEl.value='';
  var ouEl=document.getElementById('calc-output-unit');if(ouEl)ouEl.value='g';
  var obEl=document.getElementById('labour-oven-batches');if(obEl)obEl.value=1;
  var ohToggle=document.getElementById('overhead-include-toggle');if(ohToggle)ohToggle.checked=true;
  
  if (document.getElementById('labour-method')) document.getElementById('labour-method').value = 'advanced';
  if (document.getElementById('labour-effort-level')) document.getElementById('labour-effort-level').value = '1.0';
  if (document.getElementById('labour-prep')) document.getElementById('labour-prep').value = 30;
  if (document.getElementById('labour-batch-staff')) document.getElementById('labour-batch-staff').value = 1;
  if (document.getElementById('labour-unit-active')) document.getElementById('labour-unit-active').value = 15;
  if (document.getElementById('labour-unit-staff')) document.getElementById('labour-unit-staff').value = 1;
  toggleLabourMethod();
  
  recalculate();
}

function toggleLabourMethod() {
  const method = document.getElementById('labour-method')?.value || 'advanced';
  const simpleSec = document.getElementById('labour-simple-section');
  const advancedSec = document.getElementById('labour-advanced-section');
  const hoursLabel = document.getElementById('labour-hours-label');
  
  if (method === 'simple') {
    if (simpleSec) simpleSec.classList.remove('hidden');
    if (advancedSec) advancedSec.classList.add('hidden');
    if (hoursLabel) hoursLabel.textContent = 'Effort Points';
  } else {
    if (simpleSec) simpleSec.classList.add('hidden');
    if (advancedSec) advancedSec.classList.remove('hidden');
    if (hoursLabel) hoursLabel.textContent = 'Active labour time';
  }
}

// ── Save Order ────────────────────────────────────────────────
async function saveOrder(){
  var name=document.getElementById('calc-name').value||'';
  if(!name.trim()){showToast('Please enter a product/order name first!',true);return;}
  var id=currentEditingOrderId||('order-'+Date.now());
  var cat=document.getElementById('calc-category').value;

  var snapshot={};
  ingredientsMaster.forEach(m=>{snapshot[m.name]={rate:m.rate,unit:m.unit};});
  packagingMaster.forEach(m=>{snapshot[m.name]={rate:m.rate};});

  var method = document.getElementById('labour-method')?.value || 'advanced';
  var effortLevel = parseFloat(document.getElementById('labour-effort-level')?.value) || 1.0;
  var prep = +(document.getElementById('labour-prep')?.value)||0;
  var batchStaff = +(document.getElementById('labour-batch-staff')?.value)||1;
  var unitActive = +(document.getElementById('labour-unit-active')?.value)||0;
  var unitStaff = +(document.getElementById('labour-unit-staff')?.value)||1;

  var order={
    id,name,category:cat,
    date:new Date().toLocaleDateString('en-IN'),
    timestamp:Date.now(),
    batchSize:+(document.getElementById('calc-batch').value)||1,
    servings:+(document.getElementById('calc-servings').value)||8,
    categoryDetails:getCategoryDetails(),
    ingredients:JSON.parse(JSON.stringify(ingredients)),
    decorations:JSON.parse(JSON.stringify(decorations)),
    packaging:JSON.parse(JSON.stringify(packaging)),
    labour:{
      method,
      effortLevel,
      prep,
      batchStaff,
      unitActive,
      unitStaff,
      bake: 0,
      deco: 0,
      pack: 0,
      rate:+(document.getElementById('labour-rate').value)||0,
      hours:parseFloat(document.getElementById('labour-hours').textContent)||0,
      totalCost:parseFloat(document.getElementById('r-labour').textContent)||0
    },
    overheads:{elec:0,gas:0,water:0,rent:0,admin:0,delivery:0,rate:0,totalCost:0},
    wastage:{pct:+(document.getElementById('wastage-pct').value)||0,bufferPct:+(document.getElementById('buffer-pct').value)||0,totalCost:parseFloat(document.getElementById('r-wastage').textContent)||0},
    misc:{cost:+(document.getElementById('misc-cost').value)||0,notes:document.getElementById('misc-notes').value||''},
    outputWeight:+(document.getElementById('calc-output-weight')?.value)||0,
    outputUnit:document.getElementById('calc-output-unit')?.value||'g',
    ovenBatches: 1,
    includeOverhead: false,
    summary:{rawCost:parseFloat(document.getElementById('r-raw').textContent)||0,decoCost:parseFloat(document.getElementById('r-deco').textContent)||0,packCost:parseFloat(document.getElementById('r-pack').textContent)||0,cogsTotal:parseFloat(document.getElementById('r-cogs')?.textContent)||0,totalCost:parseFloat(document.getElementById('r-cost').textContent)||0,perServing:parseFloat(document.getElementById('r-per-serving').textContent)||0,breakeven:parseFloat(document.getElementById('r-breakeven').textContent)||0,targetMargin:+(document.getElementById('margin-slider').value)||60,pricingRule:document.getElementById('price-rule').value,sellingPrice:parseFloat(document.getElementById('r-selling').textContent)||0,profitAmount:parseFloat(document.getElementById('r-profit').textContent)||0,profitPct:parseFloat(document.getElementById('r-profit-pct').textContent)||0},
    rateSnapshot:snapshot
  };

  try {
    await API.saveOrder(order);
    savedOrders=await API.getOrders();
    document.getElementById('dash-orders').textContent=savedOrders.filter(o=>!o.deleted).length;
    currentEditingOrderId=null;
    var banner=document.getElementById('calc-edit-banner');if(banner)banner.remove();
    renderSavedOrdersList();
    showToast('Calculation saved to database! ✓');
    navigate('orders');
  } catch(err){ showToast('Failed to save calculation!',true); }
}

function loadOrderForEdit(orderId){
  var order=savedOrders.find(o=>o.id===orderId);if(!order)return;
  currentEditingOrderId=order.id;
  navigate('calculator');
  var contentEl=document.querySelector('#page-calculator .content');
  var oldBanner=document.getElementById('calc-edit-banner');if(oldBanner)oldBanner.remove();
  var banner=document.createElement('div');
  banner.id='calc-edit-banner';banner.className='edit-banner';
  banner.innerHTML=`<div><span class="badge badge-gold" style="margin-right:8px;">EDITING</span><span>Editing <strong>${order.name}</strong> (Saved ${order.date})</span></div><div style="display:flex;gap:10px;"><button class="btn btn-sm" onclick="applyCurrentMasterRates('${order.id}')"><i class="ti ti-refresh"></i> Update to Current Rates</button><button class="btn btn-sm btn-danger" onclick="cancelEdit()"><i class="ti ti-x"></i> Cancel</button></div>`;
  contentEl.insertBefore(banner,contentEl.firstChild);
  document.getElementById('calc-name').value=order.name;
  document.getElementById('calc-batch').value=order.batchSize||1;
  document.getElementById('calc-servings').value=order.servings||8;
  restoreCategoryDetails(order.category,order.categoryDetails);
  ingredients=JSON.parse(JSON.stringify(order.ingredients||[]));
  decorations=JSON.parse(JSON.stringify(order.decorations||[]));
  packaging=JSON.parse(JSON.stringify(order.packaging||[]));
  renderIngredients();renderDecorations();renderPackaging();
  
  if(order.labour){
    const l = order.labour;
    if (l.method) {
      document.getElementById('labour-method').value = l.method;
      document.getElementById('labour-effort-level').value = l.effortLevel || 1.0;
      document.getElementById('labour-prep').value = l.prep || 0;
      document.getElementById('labour-batch-staff').value = l.batchStaff || 1;
      document.getElementById('labour-unit-active').value = l.unitActive || 0;
      document.getElementById('labour-unit-staff').value = l.unitStaff || 1;
    } else {
      // Migrate legacy time fields on load
      document.getElementById('labour-method').value = 'advanced';
      document.getElementById('labour-prep').value = l.prep || 0;
      document.getElementById('labour-batch-staff').value = 1;
      document.getElementById('labour-unit-active').value = (l.deco || 0) + (l.pack || 0);
      document.getElementById('labour-unit-staff').value = 1;
    }
    toggleLabourMethod();
  }
  
  if(order.wastage){document.getElementById('wastage-pct').value=order.wastage.pct;document.getElementById('wastage-val').textContent=order.wastage.pct+'%';document.getElementById('buffer-pct').value=order.wastage.bufferPct;document.getElementById('buffer-val').textContent=order.wastage.bufferPct+'%';}
  if(order.misc){document.getElementById('misc-cost').value=order.misc.cost;document.getElementById('misc-notes').value=order.misc.notes;}
  if(order.outputWeight){var owEl=document.getElementById('calc-output-weight');if(owEl)owEl.value=order.outputWeight;var ouEl=document.getElementById('calc-output-unit');if(ouEl)ouEl.value=order.outputUnit||'g';}
  if(order.summary){document.getElementById('margin-slider').value=order.summary.targetMargin||60;document.getElementById('margin-pct-val').textContent=(order.summary.targetMargin||60)+'%';document.getElementById('price-rule').value=order.summary.pricingRule||'exact';}
  recalculate();
  showToast('Order loaded with historical rates!');
}

function cancelEdit(){currentEditingOrderId=null;var b=document.getElementById('calc-edit-banner');if(b)b.remove();resetCalc();showToast('Edit cancelled.');}

function applyCurrentMasterRates(){
  var n=0;
  ingredients.forEach(ing=>{var m=ingredientsMaster.find(x=>x.name===ing.name);if(m){var r=convertMasterRate(m.rate,m.unit,ing.unit,ing.name);if(ing.rate!==r){ing.rate=r;n++;}}});
  packaging.forEach(p=>{var m=packagingMaster.find(x=>x.name===p.name);if(m&&p.rate!==m.rate){p.rate=m.rate;n++;}});
  decorations.forEach(d=>{var m=packagingMaster.find(x=>x.name===d.name)||ingredientsMaster.find(x=>x.name===d.name);if(m){var r=ingredientsMaster.includes(m)?convertMasterRate(m.rate,m.unit,d.unit,d.name):m.rate;if(d.rate!==r){d.rate=r;n++;}}});
  renderIngredients();renderDecorations();renderPackaging();recalculate();
  showToast(`Updated ${n} item${n!==1?'s':''} to current master rates!`);
}

async function cloneOrder(orderId){
  var order=savedOrders.find(o=>o.id===orderId);if(!order)return;
  var clone=JSON.parse(JSON.stringify(order));
  clone.id='order-'+Date.now();clone.name=clone.name+' (Copy)';clone.date=new Date().toLocaleDateString('en-IN');clone.timestamp=Date.now();
  delete clone.deleted;delete clone.deletedAt;
  try{
    await API.saveOrder(clone);savedOrders=await API.getOrders();
    document.getElementById('dash-orders').textContent=savedOrders.filter(o=>!o.deleted).length;
    renderSavedOrdersList();showToast('Order cloned successfully!');
  }catch(err){showToast('Failed to clone order!',true);}
}

// ── Confirmation modal ────────────────────────────────────────
var _confirmCallback=null;
function showConfirm(opts){
  document.getElementById('confirm-title').textContent=opts.title||'Confirm action';
  document.getElementById('confirm-body').innerHTML=opts.body||'';
  var btn=document.getElementById('confirm-action-btn');
  btn.className='btn btn-sm '+(opts.actionClass||'btn-danger-solid');
  document.getElementById('confirm-btn-label').textContent=opts.actionLabel||'Confirm';
  document.getElementById('confirm-btn-icon').className='ti '+(opts.btnIcon||'ti-trash');
  var icon=document.getElementById('confirm-icon');
  icon.className='confirm-modal-icon'+(opts.iconRestore?' restore':'');
  document.getElementById('confirm-icon-i').className='ti '+(opts.btnIcon||'ti-trash');
  _confirmCallback=opts.callback;
  document.getElementById('confirm-overlay').classList.remove('hidden');
}
function cancelConfirm(){document.getElementById('confirm-overlay').classList.add('hidden');_confirmCallback=null;}
function executeConfirm(){document.getElementById('confirm-overlay').classList.add('hidden');if(_confirmCallback){_confirmCallback();_confirmCallback=null;}}

// ── Saved Orders CRUD ─────────────────────────────────────────
function softDeleteOrderConfirm(orderId){
  var order=savedOrders.find(o=>o.id===orderId);if(!order)return;
  showConfirm({title:'Delete this order?',body:`<strong>"${order.name}"</strong> will be marked as deleted. You can restore it anytime.`,actionLabel:'Delete',btnIcon:'ti-trash',callback:async()=>{
    try{order.deleted=true;order.deletedAt=Date.now();await API.softDeleteOrder(orderId);savedOrders=await API.getOrders();document.getElementById('dash-orders').textContent=savedOrders.filter(o=>!o.deleted).length;renderSavedOrdersList();showToast('Order deleted.');}catch(e){showToast('Failed!',true);}
  }});
}

async function restoreOrder(orderId){
  var order=savedOrders.find(o=>o.id===orderId);if(!order)return;
  showConfirm({title:'Restore this order?',body:`<strong>"${order.name}"</strong> will be made active again.`,actionLabel:'Restore',actionClass:'btn-success-solid',btnIcon:'ti-restore',iconRestore:true,callback:async()=>{
    try{await API.restoreOrder(orderId);savedOrders=await API.getOrders();document.getElementById('dash-orders').textContent=savedOrders.filter(o=>!o.deleted).length;renderSavedOrdersList();showToast('Order restored!');}catch(e){showToast('Failed!',true);}
  }});
}

function hardDeleteOrder(orderId){
  var order=savedOrders.find(o=>o.id===orderId);if(!order)return;
  showConfirm({title:'Permanently delete?',body:`<strong>"${order.name}"</strong> will be <strong>permanently removed</strong>. This cannot be undone.`,actionLabel:'Delete Forever',btnIcon:'ti-trash-x',callback:async()=>{
    try{await API.hardDeleteOrder(orderId);savedOrders=await API.getOrders();document.getElementById('dash-orders').textContent=savedOrders.filter(o=>!o.deleted).length;renderSavedOrdersList();showToast('Order permanently deleted.');}catch(e){showToast('Failed!',true);}
  }});
}
function deleteOrderConfirm(id){softDeleteOrderConfirm(id);}

// ── Bulk delete ───────────────────────────────────────────────
function updateBulkBar(){var c=document.querySelectorAll('.order-check:checked');var bar=document.getElementById('bulk-action-bar');if(!bar)return;if(c.length>0){bar.classList.remove('hidden');document.getElementById('bulk-count').textContent=c.length;}else{bar.classList.add('hidden');}var all=document.querySelectorAll('.order-check');var sa=document.getElementById('select-all-orders');if(sa)sa.checked=all.length>0&&c.length===all.length;}
function toggleSelectAll(cb){document.querySelectorAll('.order-check').forEach(c=>c.checked=cb.checked);updateBulkBar();}
function clearBulkSelection(){document.querySelectorAll('.order-check').forEach(c=>c.checked=false);var bar=document.getElementById('bulk-action-bar');if(bar)bar.classList.add('hidden');var sa=document.getElementById('select-all-orders');if(sa)sa.checked=false;}

function bulkDeleteOrders(){
  var checked=Array.from(document.querySelectorAll('.order-check:checked')).map(c=>c.value);
  if(!checked.length)return;
  showConfirm({title:`Delete ${checked.length} order(s)?`,body:`These <strong>${checked.length} orders</strong> will be marked as deleted. You can restore them later.`,actionLabel:`Delete ${checked.length} Orders`,btnIcon:'ti-trash',callback:async()=>{
    try{for(var id of checked){var o=savedOrders.find(x=>x.id===id);if(o){o.deleted=true;o.deletedAt=Date.now();await API.softDeleteOrder(id);}}savedOrders=await API.getOrders();document.getElementById('dash-orders').textContent=savedOrders.filter(o=>!o.deleted).length;renderSavedOrdersList();showToast(`${checked.length} orders deleted.`);}catch(e){showToast('Bulk delete failed!',true);}
  }});
}

// ── Ingredients CRUD ──────────────────────────────────────────
function softDeleteIngredient(idx){
  var item=ingredientsMaster[idx];if(!item)return;
  showConfirm({title:'Delete this ingredient?',body:`<strong>"${item.name}"</strong> will be removed from active use. Historical orders are unaffected.`,actionLabel:'Delete',btnIcon:'ti-trash',callback:async()=>{
    try{item.deleted=true;item.deletedAt=Date.now();await API.softDeleteIngredient(item.id);renderIngredientsMaster();showToast(`"${item.name}" deleted.`);}catch(e){showToast('Delete failed!',true);}
  }});
}
async function restoreIngredient(idx){
  var item=ingredientsMaster[idx];if(!item)return;
  showConfirm({title:'Restore ingredient?',body:`<strong>"${item.name}"</strong> will be active again.`,actionLabel:'Restore',actionClass:'btn-success-solid',btnIcon:'ti-restore',iconRestore:true,callback:async()=>{
    try{await API.restoreIngredient(item.id);delete item.deleted;delete item.deletedAt;renderIngredientsMaster();showToast(`"${item.name}" restored!`);}catch(e){showToast('Restore failed!',true);}
  }});
}
function hardDeleteIngredient(idx){
  var item=ingredientsMaster[idx];if(!item)return;
  showConfirm({title:'Permanently delete ingredient?',body:`<strong>"${item.name}"</strong> will be <strong>permanently removed</strong>. Historical orders are unaffected. This cannot be undone.`,actionLabel:'Delete Forever',btnIcon:'ti-trash-x',callback:async()=>{
    try{await API.hardDeleteIngredient(item.id);ingredientsMaster.splice(idx,1);renderIngredientsMaster();showToast(`"${item.name}" permanently deleted.`);}catch(e){showToast('Delete failed!',true);}
  }});
}

// ── Packaging CRUD ────────────────────────────────────────────
function softDeletePackagingItem(idx){
  var item=packagingMaster[idx];if(!item)return;
  showConfirm({title:'Delete this packaging item?',body:`<strong>"${item.name}"</strong> will be marked as deleted.`,actionLabel:'Delete',btnIcon:'ti-trash',callback:async()=>{
    try{item.deleted=true;item.deletedAt=Date.now();await API.softDeletePackaging(item.id);renderPackagingMaster();showToast(`"${item.name}" deleted.`);}catch(e){showToast('Delete failed!',true);}
  }});
}
async function restorePackagingItem(idx){
  var item=packagingMaster[idx];if(!item)return;
  showConfirm({title:'Restore packaging item?',body:`<strong>"${item.name}"</strong> will be active again.`,actionLabel:'Restore',actionClass:'btn-success-solid',btnIcon:'ti-restore',iconRestore:true,callback:async()=>{
    try{await API.restorePackaging(item.id);delete item.deleted;delete item.deletedAt;renderPackagingMaster();showToast(`"${item.name}" restored!`);}catch(e){showToast('Restore failed!',true);}
  }});
}
function hardDeletePackagingItem(idx){
  var item=packagingMaster[idx];if(!item)return;
  showConfirm({title:'Permanently delete packaging item?',body:`<strong>"${item.name}"</strong> will be permanently removed.`,actionLabel:'Delete Forever',btnIcon:'ti-trash-x',callback:async()=>{
    try{await API.hardDeletePackaging(item.id);packagingMaster.splice(idx,1);renderPackagingMaster();showToast(`"${item.name}" permanently deleted.`);}catch(e){showToast('Delete failed!',true);}
  }});
}

// ── Product Catalog CRUD ──────────────────────────────────────
function softDeleteCatalogProduct(idx){
  var item=catalogProducts[idx];if(!item)return;
  showConfirm({title:'Delete this product?',body:`<strong>"${item.name}"</strong> will be removed from the active catalog.`,actionLabel:'Delete',btnIcon:'ti-trash',callback:async()=>{
    try{item.deleted=true;item.deletedAt=Date.now();await API.softDeleteProduct(item.id);renderProductCatalog();renderDashboardTable();showToast(`"${item.name}" removed from catalog.`);}catch(e){showToast('Delete failed!',true);}
  }});
}
async function restoreCatalogProduct(idx){
  var item=catalogProducts[idx];if(!item)return;
  showConfirm({title:'Restore product?',body:`<strong>"${item.name}"</strong> will be active again.`,actionLabel:'Restore',actionClass:'btn-success-solid',btnIcon:'ti-restore',iconRestore:true,callback:async()=>{
    try{await API.restoreProduct(item.id);delete item.deleted;delete item.deletedAt;renderProductCatalog();renderDashboardTable();showToast(`"${item.name}" restored!`);}catch(e){showToast('Restore failed!',true);}
  }});
}
function hardDeleteCatalogProduct(idx){
  var item=catalogProducts[idx];if(!item)return;
  showConfirm({title:'Permanently delete product?',body:`<strong>"${item.name}"</strong> will be permanently removed.`,actionLabel:'Delete Forever',btnIcon:'ti-trash-x',callback:async()=>{
    try{await API.hardDeleteProduct(item.id);catalogProducts.splice(idx,1);renderProductCatalog();renderDashboardTable();showToast(`"${item.name}" permanently deleted.`);}catch(e){showToast('Delete failed!',true);}
  }});
}

// ── Saved Orders List ─────────────────────────────────────────
function renderSavedOrdersList(){
  var el=document.getElementById('saved-orders-content');
  var showDeleted=document.getElementById('order-show-deleted')?.checked;
  var allVisible=showDeleted?savedOrders:savedOrders.filter(o=>!o.deleted);
  if(allVisible.length===0&&savedOrders.length===0){el.innerHTML=`<div style="text-align:center;padding:40px;color:var(--bo-muted);"><i class="ti ti-receipt" style="font-size:40px;opacity:0.3;display:block;margin-bottom:12px;"></i>No saved calculations yet. Use the Cost Calculator to create and save orders.</div>`;return;}
  var searchQuery=document.getElementById('order-search').value.toLowerCase().trim();
  var catFilter=document.getElementById('order-filter-category').value;
  var filtered=allVisible.filter(o=>{var ms=o.name.toLowerCase().includes(searchQuery);var mc=!catFilter||o.category===catFilter;return ms&&mc;});
  if(!filtered.length){el.innerHTML=`<div style="text-align:center;padding:40px;color:var(--bo-muted);"><i class="ti ti-search" style="font-size:40px;opacity:0.3;display:block;margin-bottom:12px;"></i>No orders match your search.</div>`;return;}

  el.innerHTML=`
    <div id="bulk-action-bar" class="bulk-bar hidden"><span><i class="ti ti-checkbox" style="margin-right:6px;"></i><span id="bulk-count">0</span> order(s) selected</span><div style="display:flex;gap:8px;"><button class="btn btn-sm btn-danger-solid" onclick="bulkDeleteOrders()"><i class="ti ti-trash"></i> Delete Selected</button><button class="btn btn-sm" onclick="clearBulkSelection()" style="color:var(--bo-warm);border-color:rgba(245,230,204,0.3);background:transparent;"><i class="ti ti-x"></i> Clear</button></div></div>
    <table>
      <thead><tr>
        <th class="checkbox-cell"><input type="checkbox" class="row-check" id="select-all-orders" onchange="toggleSelectAll(this)"></th>
        <th>Order Name</th><th>Category</th><th>Date</th><th>Cost Price</th><th>Selling Price</th><th>Margin</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${filtered.map(o=>{
          var isDeleted=!!o.deleted;
          var s=o.summary||{};
          return `<tr class="${isDeleted?'soft-deleted':''}">
            <td class="checkbox-cell">${isDeleted?'':'<input type="checkbox" class="row-check order-check" value="'+o.id+'" onchange="updateBulkBar()">'}
            </td>
            <td style="font-weight:500;">${o.name}${isDeleted?'<span class="deleted-tag"><i class="ti ti-trash" style="font-size:9px;"></i> Deleted</span>':''}</td>
            <td><span class="badge badge-info">${o.category||'—'}</span></td>
            <td style="color:var(--bo-muted);font-size:12px;">${o.date||''}</td>
            <td>₹${(s.totalCost||0).toFixed(0)}</td>
            <td style="color:var(--bo-success);font-weight:500;">₹${s.sellingPrice||0}</td>
            <td><span class="badge badge-green">${(s.profitPct||0).toFixed(1)}%</span></td>
            <td>
              <div style="display:flex;gap:4px;">
                ${isDeleted
                  ?`<button class="btn btn-sm btn-success-solid" onclick="restoreOrder('${o.id}')"><i class="ti ti-restore"></i></button><button class="btn btn-sm btn-danger-solid" onclick="hardDeleteOrder('${o.id}')"><i class="ti ti-trash-x"></i></button>`
                  :`<button class="btn btn-sm" onclick="loadOrderForEdit('${o.id}')"><i class="ti ti-edit"></i></button><button class="btn btn-sm" onclick="viewOrderInvoice('${o.id}')"><i class="ti ti-receipt"></i></button><button class="btn btn-sm" onclick="cloneOrder('${o.id}')"><i class="ti ti-copy"></i></button><button class="btn btn-sm btn-danger" onclick="softDeleteOrderConfirm('${o.id}')"><i class="ti ti-trash"></i></button>`
                }
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function clearSavedOrdersFilters(){document.getElementById('order-search').value='';document.getElementById('order-filter-category').value='';document.getElementById('order-show-deleted').checked=false;renderSavedOrdersList();}

// ── Invoice view ──────────────────────────────────────────────
function viewOrderInvoice(orderId){
  var order=savedOrders.find(o=>o.id===orderId);if(!order)return;
  var s=order.summary||{};
  var catLabel={'fruit-cake':'Fruit Cake','theme-cake':'Theme Cake','brownie':'Brownie Box','cookie':'Cookie Box','fusion-cake':'Fusion Cake','chocolate':'Chocolate Box','bread':'Artisan Bread','gift-box':'Gift Box','cake':'Celebration Cake','cupcake':'Cupcakes','custom':'Fully Custom'}[order.category]||order.category||'Custom Order';
  openModal(`
    <div class="modal-header"><h3>Cost Sheet — ${order.name}</h3>
      <div style="display:flex;gap:6px;"><button class="btn btn-sm btn-gold" onclick="window.print()"><i class="ti ti-printer"></i> Print</button><button class="btn btn-sm" onclick="closeModalBtn()"><i class="ti ti-x"></i></button></div>
    </div>
    <div class="modal-body">
      <div class="invoice-container">
        <div class="invoice-header">
          <div><div class="invoice-title">BlissOven</div><div style="font-size:12px;color:var(--bo-muted);">Cost Calculation Sheet</div></div>
          <div style="text-align:right;font-size:12px;color:var(--bo-muted);"><div>${order.date||''}</div><div>ID: ${order.id}</div></div>
        </div>
        <div class="invoice-details">
          <div><strong>Product:</strong> ${order.name}</div>
          <div><strong>Category:</strong> ${catLabel}</div>
          <div><strong>Batch Size:</strong> ${order.batchSize||1}</div>
          <div><strong>Servings:</strong> ${order.servings||8}</div>
          ${order.outputWeight?`<div><strong>Output Weight:</strong> ${order.outputWeight} ${order.outputUnit||'g'}</div>`:''}
        </div>
        <div class="invoice-section-title">Raw Materials</div>
        <table><thead><tr><th>Ingredient</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr></thead>
        <tbody>${(order.ingredients||[]).map(i=>`<tr><td>${i.name}</td><td>${i.qty}</td><td>${i.unit}</td><td>₹${i.rate}</td><td>₹${((i.qty||0)*(i.rate||0)*(1+(i.wastage||0)/100)).toFixed(2)}</td></tr>`).join('')}</tbody></table>
        ${(order.decorations||[]).length?`<div class="invoice-section-title">Decoration</div><table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${order.decorations.map(d=>`<tr><td>${d.name}</td><td>${d.qty}</td><td>${d.unit}</td><td>₹${d.rate}</td><td>₹${((d.qty||0)*(d.rate||0)).toFixed(2)}</td></tr>`).join('')}</tbody></table>`:''}
        ${(order.packaging||[]).length?`<div class="invoice-section-title">Packaging</div><table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${order.packaging.map(p=>`<tr><td>${p.name}</td><td>${p.qty}</td><td>₹${p.rate}</td><td>₹${((p.qty||0)*(p.rate||0)).toFixed(2)}</td></tr>`).join('')}</tbody></table>`:''}
        <div class="invoice-summary-grid">
          <div>
            <div class="invoice-total-row"><span>Raw Materials</span><span>₹${(s.rawCost||0).toFixed(2)}</span></div>
            <div class="invoice-total-row"><span>Decoration</span><span>₹${(s.decoCost||0).toFixed(2)}</span></div>
            <div class="invoice-total-row"><span>Packaging</span><span>₹${(s.packCost||0).toFixed(2)}</span></div>
            <div class="invoice-total-row"><span>Labour</span><span>₹${(order.labour?.totalCost||0).toFixed(2)}</span></div>
          </div>
          <div>
            ${(order.overheads?.totalCost||0) > 0 ? `<div class="invoice-total-row"><span>Overheads</span><span>₹${(order.overheads?.totalCost||0).toFixed(2)}</span></div>` : ''}
            <div class="invoice-total-row"><span>Wastage &amp; Buffer</span><span>₹${(order.wastage?.totalCost||0).toFixed(2)}</span></div>
            <div class="invoice-total-row"><span>Miscellaneous</span><span>₹${(order.misc?.cost||0).toFixed(2)}</span></div>
            <div class="invoice-total-row grand"><span>Total Cost Price</span><span>₹${(s.totalCost||0).toFixed(2)}</span></div>
          </div>
        </div>
        <div style="margin-top:12px;padding:12px;background:rgba(45,106,79,0.06);border-radius:8px;border:1px solid rgba(45,106,79,0.2);">
          <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:500;color:var(--bo-success);"><span>Suggested Selling Price</span><span>₹${s.sellingPrice||0}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--bo-muted);margin-top:4px;"><span>Profit: ₹${s.profitAmount||0} (${(s.profitPct||0).toFixed(1)}%)</span><span>Per Serving: ₹${(s.perServing||0).toFixed(2)}</span></div>
        </div>
      </div>
    </div>`);
}

// ── Overhead calculator ───────────────────────────────────────
function calcDailyOverhead(){
  deriveSettingsRates();
}

// ── Modal helpers ─────────────────────────────────────────────
function openModal(html){
  document.getElementById('modal-content').innerHTML=html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModalBtn(){document.getElementById('modal-overlay').classList.add('hidden');}
function closeModal(e){if(e.target===document.getElementById('modal-overlay'))closeModalBtn();}

// ── Toast ─────────────────────────────────────────────────────
var _toastTimer=null;
function showToast(msg, isError) {
  var t = document.getElementById('toast');
  var m = document.getElementById('toast-msg');
  if (!t || !m) return;
  
  m.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  
  // Force a browser reflow to ensure CSS transition triggers properly
  t.offsetHeight; 
  
  t.classList.add('show');
  
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    t.classList.remove('show');
  }, 3000);
}

// ── Start ─────────────────────────────────────────────────────
// Boot via auth flow — initAuth() calls initApp() after login
document.addEventListener('DOMContentLoaded', initAuth);

// ============================================================
// BakeFlow ERP — New Modules (Auth, Materials, Sales, Customers)
// ============================================================

// ── Auth / Session ───────────────────────────────────────────

async function initAuth() {
  const stored = localStorage.getItem('bakeflow_session');
  if (stored) {
    try {
      currentSession = JSON.parse(stored);
      applySession();
      return;
    } catch(e) { localStorage.removeItem('bakeflow_session'); }
  }
  // Show auth overlay
  document.getElementById('auth-overlay').style.display = 'flex';
  document.getElementById('main-app').style.display = 'none';
  document.getElementById('loading-overlay').classList.add('hidden');
  // Load config
  try { businessConfig = await API.getConfig(); } catch(e) {}
  initGoogleSignIn();
}

function initGoogleSignIn() {
  if (!businessConfig.googleClientId || !window.google) return;
  try {
    google.accounts.id.initialize({
      client_id: businessConfig.googleClientId,
      callback: handleGoogleCredential,
      auto_select: false,
    });
    google.accounts.id.renderButton(
      document.getElementById('g-signin-btn'),
      { theme: 'outline', size: 'large', text: 'signin_with', width: 280 }
    );
  } catch(e) { console.warn('Google Sign-In init failed:', e.message); }
}

function handleGoogleCredential(response) {
  try {
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    window._pendingGoogleProfile = { name: payload.name, email: payload.email, picture: payload.picture || '' };
    window._pendingGoogleCredential = response.credential; // Store raw Google token
    
    // Auto-select Admin in the modal
    const adminRadio = document.querySelector('input[name="role"][value="admin"]');
    if (adminRadio) {
      adminRadio.checked = true;
      onRoleChange('admin');
    }
    showRoleModal();
  } catch(e) { showToast('Google sign-in error', true); }
}



async function showRoleModal() {
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('role-modal').classList.remove('hidden');
  document.getElementById('role-modal').style.display = 'flex';
  try {
    const googleToken = window._pendingGoogleCredential;
    const emps = await API.getEmployees(googleToken);
    const sel = document.getElementById('employee-select');
    if (sel) sel.innerHTML = emps.map(e => `<option value="${e.username || e.index}">${e.name}</option>`).join('') || '<option value="">No employees configured</option>';
  } catch(e) {}
}

function onRoleChange(role) {
  const wrap = document.getElementById('employee-select-wrap');
  if (wrap) wrap.classList.toggle('hidden', role !== 'employee');
}

function openOTPModal() {
  document.getElementById('role-modal').style.display = 'none';
  document.getElementById('role-modal').classList.add('hidden');
  
  document.getElementById('otp-modal').classList.remove('hidden');
  document.getElementById('otp-modal').style.display = 'flex';
  
  document.getElementById('otp-step-request').classList.remove('hidden');
  document.getElementById('otp-step-request').style.display = 'block';
  document.getElementById('otp-step-verify').classList.add('hidden');
  document.getElementById('otp-step-verify').style.display = 'none';
  
  document.getElementById('otp-email').value = '';
  document.getElementById('otp-code').value = '';
  document.getElementById('otp-password').value = '';
  document.getElementById('otp-confirm-password').value = '';
  
  document.getElementById('otp-error').style.display = 'none';
  document.getElementById('otp-success').style.display = 'none';
}

function closeOTPModal() {
  document.getElementById('otp-modal').style.display = 'none';
  document.getElementById('otp-modal').classList.add('hidden');
  
  document.getElementById('role-modal').classList.remove('hidden');
  document.getElementById('role-modal').style.display = 'flex';
}

async function requestOTP() {
  const email = (document.getElementById('otp-email').value || '').trim();
  const errEl = document.getElementById('otp-error');
  const succEl = document.getElementById('otp-success');
  errEl.style.display = 'none';
  succEl.style.display = 'none';

  if (!email) {
    errEl.textContent = 'Please enter your registered owner email.';
    errEl.style.display = 'block';
    return;
  }

  showLoading('Generating WhatsApp verification code…');
  try {
    const res = await API.requestOTP(email);
    hideLoading();
    
    succEl.textContent = res.message || 'Verification code sent successfully!';
    succEl.style.display = 'block';
    
    document.getElementById('otp-step-request').classList.add('hidden');
    document.getElementById('otp-step-request').style.display = 'none';
    document.getElementById('otp-step-verify').classList.remove('hidden');
    document.getElementById('otp-step-verify').style.display = 'block';
  } catch (err) {
    hideLoading();
    errEl.textContent = err.message || 'Failed to request OTP code.';
    errEl.style.display = 'block';
  }
}

async function verifyOTP() {
  const email = (document.getElementById('otp-email').value || '').trim();
  const otp = (document.getElementById('otp-code').value || '').trim();
  const password = document.getElementById('otp-password').value;
  const confirmPassword = document.getElementById('otp-confirm-password').value;

  const errEl = document.getElementById('otp-error');
  const succEl = document.getElementById('otp-success');
  errEl.style.display = 'none';
  succEl.style.display = 'none';

  if (!otp || !password || !confirmPassword) {
    errEl.textContent = 'All fields are required.';
    errEl.style.display = 'block';
    return;
  }
  if (password.length < 8) {
    errEl.textContent = 'Password must be at least 8 characters long.';
    errEl.style.display = 'block';
    return;
  }
  if (password !== confirmPassword) {
    errEl.textContent = 'Passwords do not match.';
    errEl.style.display = 'block';
    return;
  }

  showLoading('Verifying code and resetting password…');
  try {
    const res = await API.verifyOTP(email, otp, password);
    hideLoading();
    
    succEl.textContent = '✓ Password reset successfully! Redirecting you to login…';
    succEl.style.display = 'block';
    
    setTimeout(() => {
      closeOTPModal();
      document.getElementById('role-password').value = password;
    }, 2000);
  } catch (err) {
    hideLoading();
    errEl.textContent = err.message || 'Verification failed.';
    errEl.style.display = 'block';
  }
}

function togglePassVis() {
  const inp = document.getElementById('role-password');
  const icon = document.getElementById('pass-eye-icon');
  if (!inp) return;
  if (inp.type === 'password') { inp.type = 'text'; if (icon) icon.className = 'ti ti-eye-off'; }
  else { inp.type = 'password'; if (icon) icon.className = 'ti ti-eye'; }
}

function backToSignin() {
  document.getElementById('role-modal').style.display = 'none';
  document.getElementById('role-modal').classList.add('hidden');
  document.getElementById('auth-overlay').style.display = 'flex';
}

// ── Demo Login (password-modal flow) ─────────────────────────

function showDemoModal() {
  document.getElementById('auth-overlay').style.display = 'none';
  const m = document.getElementById('demo-modal');
  m.classList.remove('hidden');
  m.style.display = 'flex';
  const inp = document.getElementById('demo-password-input');
  if (inp) { inp.value = ''; inp.focus(); }
  const errEl = document.getElementById('demo-error');
  if (errEl) errEl.style.display = 'none';
}

function closeDemoModal() {
  const m = document.getElementById('demo-modal');
  m.classList.add('hidden');
  m.style.display = 'none';
  document.getElementById('auth-overlay').style.display = 'flex';
}

function toggleDemoPassVis() {
  const inp = document.getElementById('demo-password-input');
  const icon = document.getElementById('demo-eye-icon');
  if (!inp) return;
  if (inp.type === 'password') { inp.type = 'text'; if (icon) icon.className = 'ti ti-eye-off'; }
  else { inp.type = 'password'; if (icon) icon.className = 'ti ti-eye'; }
}

async function submitDemoLogin() {
  const password = (document.getElementById('demo-password-input').value || '').trim();
  const errEl = document.getElementById('demo-error');
  const btn = document.getElementById('demo-submit-btn');

  if (!password) {
    errEl.textContent = 'Please enter the demo password.';
    errEl.style.display = 'block';
    return;
  }

  errEl.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Entering demo…'; }

  try {
    const res = await fetch('/api/auth/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Incorrect demo password');

    const session = {
      name: data.user.name || 'Demo User',
      email: data.user.email || 'demo@bakeflow.app',
      picture: data.user.picture || '',
      role: data.user.role,
      userId: data.user.userId || null,
      loginTime: Date.now(),
      isDemo: true
    };
    localStorage.setItem('bakeflow_token', data.token);
    localStorage.setItem('bakeflow_session', JSON.stringify(session));
    currentSession = session;
    document.getElementById('demo-modal').style.display = 'none';
    document.getElementById('demo-modal').classList.add('hidden');
    applySession();
  } catch (err) {
    errEl.textContent = err.message || 'Incorrect demo password. Please try again.';
    errEl.style.display = 'block';
    if (btn) { btn.disabled = false; btn.textContent = 'Enter Demo →'; }
  }
}

// Keep old name as alias (backward-compat with cached JS)
function loginDemo() { showDemoModal(); }

async function submitRole() {
  const roleInput = document.querySelector('input[name="role"]:checked');
  if (!roleInput) { showRoleError('Please select a role (Admin or Employee)'); return; }
  const role = roleInput.value;
  const password = (document.getElementById('role-password').value || '').trim();
  const empIdx = role === 'employee' ? (document.getElementById('employee-select').value || null) : null;
  if (!password) { showRoleError('Please enter your password'); return; }

  try {
    let result;
    if (role === 'admin') {
      const googleToken = window._pendingGoogleCredential;
      if (!googleToken) {
        showRoleError('Please sign in with Google first to verify your identity.');
        return;
      }
      result = await API.loginGoogle(googleToken, password);
    } else {
      result = await API.loginEmployee(empIdx, password, window._pendingGoogleCredential);
    }

    const session = {
      name: result.user.name || 'User',
      email: result.user.email || '',
      picture: result.user.picture || '',
      role: result.user.role,
      userId: result.user.userId || null,
      employeeIndex: result.user.employeeIndex || null,
      loginTime: Date.now(),
    };
    
    localStorage.setItem('bakeflow_token', result.token);
    localStorage.setItem('bakeflow_session', JSON.stringify(session));
    currentSession = session;
    document.getElementById('role-modal').style.display = 'none';
    document.getElementById('role-modal').classList.add('hidden');
    applySession();
    try { await API.log('LOGIN', 'Role: ' + session.role, 'Auth', ''); } catch(e) {}
  } catch(err) {
    showRoleError(err.message || 'Incorrect password or authentication failed.');
  }
}


function showRoleError(msg) {
  const el = document.getElementById('role-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; setTimeout(() => { el.style.display = 'none'; }, 3500); }
}

function applySession() {
  // Show main app
  document.getElementById('main-app').style.display = 'flex';
  document.getElementById('auth-overlay').style.display = 'none';
  const roleModal = document.getElementById('role-modal');
  if (roleModal) { roleModal.style.display = 'none'; roleModal.classList.add('hidden'); }

  // Demo mode banner + body class (fixes sidebar/header overlap)
  const demoBanner = document.getElementById('demo-banner');
  const isDemo = currentSession && (currentSession.isDemo || currentSession.role === 'demo_admin');
  document.body.classList.toggle('demo-mode', isDemo);
  if (demoBanner) {
    if (isDemo) {
      demoBanner.classList.remove('hidden');
      demoBanner.style.display = 'flex';
    } else {
      demoBanner.classList.add('hidden');
      demoBanner.style.display = 'none';
    }
  }

  // Sidebar user card
  const suName = document.getElementById('su-name');
  const suRole = document.getElementById('su-role');
  const suAvatar = document.getElementById('su-avatar');
  if (suName) suName.textContent = currentSession.name + (isDemo ? ' (Demo)' : '');
  const hasAdminPrivileges = currentSession.role === 'admin' || currentSession.role === 'owner' || currentSession.role === 'platform_admin' || currentSession.role === 'demo_admin';
  if (suRole) {
    if (currentSession.role === 'owner') suRole.textContent = '👑 Owner';
    else if (currentSession.role === 'admin') suRole.textContent = '🔑 Admin';
    else if (currentSession.role === 'demo_admin') suRole.textContent = '🧁 Demo Mode';
    else if (currentSession.role === 'platform_admin') suRole.textContent = '🏛️ Platform Admin';
    else suRole.textContent = '👤 Employee';
  }
  if (isDemo && suAvatar) {
    suAvatar.innerHTML = '🧁';
  } else if (suAvatar && currentSession.picture) {
    suAvatar.innerHTML = `<img src="${currentSession.picture}" alt="">`;
  }

  // Apply admin/employee CSS class for visibility
  document.body.classList.toggle('role-admin', hasAdminPrivileges);
  document.body.classList.toggle('role-employee', !hasAdminPrivileges);

  // Also imperatively show/hide admin-only elements (belt & suspenders)
  document.querySelectorAll('.admin-only').forEach(el => {
    const tag = el.tagName.toLowerCase();
    if (hasAdminPrivileges) {
      if (tag === 'div' && el.classList.contains('stats-grid')) el.style.display = 'grid';
      else if (tag === 'div' && el.classList.contains('nav-section')) el.style.display = 'block';
      else el.style.display = '';
      el.style.removeProperty('display') ; // let CSS class handle it
    }
  });

  updateGreeting();
  initApp();
}

function showSuspensionBlock(message) {
  // Hide main app content
  const mainApp = document.getElementById('main-app');
  if (mainApp) mainApp.style.display = 'none';

  // Create block overlay if it doesn't exist
  let overlay = document.getElementById('suspension-block-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'suspension-block-overlay';
    overlay.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(18,18,18,0.96);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:"Outfit",sans-serif;color:#fff;padding:24px;text-align:center;';
    document.body.appendChild(overlay);
  }

  const isPlatformAdmin = currentSession && currentSession.role === 'platform_admin';
  const adminBtn = isPlatformAdmin ? `<button class="btn btn-gold" style="margin-top:20px;padding:12px 24px;width:100%" onclick="window.location.href='/admin/'">Go to Platform Admin Console →</button>` : '';

  overlay.innerHTML = `
    <div class="auth-card" style="max-width:450px;background:#1e1e1e;border:1px solid rgba(239,68,68,0.3);box-shadow:0 8px 32px rgba(239,68,68,0.15);padding:40px 24px;border-radius:12px;text-align:center;">
      <div style="width:64px;height:64px;background:rgba(239,68,68,0.1);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:#ef4444;font-size:32px;">
        <i class="ti ti-shield-x"></i>
      </div>
      <h2 style="font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:600;margin-bottom:12px;color:#ef4444;">Bakery Account Suspended</h2>
      <p style="color:#a3a3a3;font-size:14px;line-height:1.6;margin-bottom:20px;">${message || 'This bakery account has been suspended by the platform administrator. Access to calculations and settings is currently blocked.'}</p>
      <div style="display:flex;flex-direction:column;gap:12px;align-items:center;width:100%">
        ${adminBtn}
        <button class="btn" style="background:#2e2e2e;color:#fff;border:none;padding:10px 20px;width:100%" onclick="signOut()">Log Out &amp; Return</button>
      </div>
    </div>
  `;
}

function signOut() {
  if (currentSession) {
    try { API.log('LOGOUT', 'Session ended', 'Auth', ''); } catch(e) {}
  }
  document.body.classList.remove('demo-mode');
  localStorage.removeItem('bakeflow_session');
  localStorage.removeItem('bakeflow_token');
  currentSession = null;
  location.reload();
}

// ── Greeting ─────────────────────────────────────────────────

function updateGreeting() {
  const el = document.getElementById('dash-greeting');
  if (!el || !currentSession) return;
  const firstName = (currentSession.name || 'User').split(' ')[0];
  const h = new Date().getHours();
  const prefix = h >= 5 && h < 12 ? 'Good morning' :
                 h >= 12 && h < 17 ? 'Good afternoon' :
                 h >= 17 && h < 21 ? 'Good evening' : 'Working late';
  el.textContent = `${prefix}, ${firstName} ✦`;
}

// ── Dashboard Enhancements ───────────────────────────────────

async function loadDashboardData() {
  updateGreeting();

  // Low stock
  const allItems = [
    ...ingredientsMaster.filter(i => !i.deleted),
    ...packagingMaster.filter(p => !p.deleted),
  ];
  const lowItems = allItems.filter(i => Number(i.minAlert) > 0 && Number(i.stockQty) <= Number(i.minAlert));
  const dashLS = document.getElementById('dash-lowstock');
  if (dashLS) dashLS.textContent = lowItems.length;

  const lowEl = document.getElementById('dash-lowstock-list');
  if (lowEl) {
    if (allItems.length === 0) {
      lowEl.innerHTML = '<div style="color:var(--bo-muted);font-size:13px;">⚠️ No inventory items added yet. <span style="cursor:pointer;text-decoration:underline;color:var(--bo-gold-dark);" onclick="navigate(\'materials\')">Add materials →</span></div>';
    } else if (lowItems.length === 0) {
      lowEl.innerHTML = '<div style="color:var(--bo-success);font-size:13px;">✅ All items well stocked!</div>';
    } else {
      lowEl.innerHTML = lowItems.slice(0, 5).map(i => `
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(232,213,190,0.3);font-size:12.5px;">
          <span>${i.name}</span>
          <span style="color:${Number(i.stockQty)===0?'var(--bo-danger)':'var(--bo-gold-dark)'};font-weight:500;">${Number(i.stockQty)===0?'Out of Stock':i.stockQty+' '+(i.unit||'')}</span>
        </div>`).join('');
    }
  }

  // Recent invoices
  const riEl = document.getElementById('dash-recent-invoices');
  if (riEl && salesInvoices.length > 0) {
    riEl.innerHTML = salesInvoices.slice(0, 5).map(inv => `
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(232,213,190,0.3);font-size:12.5px;">
        <span style="font-weight:500;min-width:110px;">${inv.invoiceNumber}</span>
        <span style="color:var(--bo-muted);flex:1;padding:0 8px;">${inv.customerName}</span>
        <span style="color:var(--bo-gold-dark);font-weight:500;">₹${Number(inv.totalAmount).toFixed(0)}</span>
      </div>`).join('');
  } else if (riEl) {
    riEl.innerHTML = '<div style="color:var(--bo-muted);font-size:13px;">No invoices yet.</div>';
  }

  // Admin stats
  if (currentSession && currentSession.role === 'admin') {
    const monthNow = new Date().getMonth();
    const yearNow = new Date().getFullYear();
    const monthRevenue = salesInvoices
      .filter(i => { const d = new Date(i.timestamp); return d.getMonth() === monthNow && d.getFullYear() === yearNow; })
      .reduce((s, i) => s + Number(i.totalAmount), 0);
    const revEl = document.getElementById('dash-revenue');
    if (revEl) revEl.textContent = '₹' + monthRevenue.toLocaleString('en-IN');
    const invEl = document.getElementById('dash-invoices');
    if (invEl) invEl.textContent = salesInvoices.length;
    const custEl = document.getElementById('dash-customers');
    if (custEl) custEl.textContent = customersDB.length;
  }
}

// ── Raw Materials Master (merged ingredients + packaging) ────

function switchMaterialTab(tab) {
  currentMaterialTab = tab;
  document.getElementById('tab-ing').classList.toggle('active', tab === 'ingredients');
  document.getElementById('tab-pack').classList.toggle('active', tab === 'packaging');
  document.getElementById('mat-ingredients-section').classList.toggle('hidden', tab !== 'ingredients');
  document.getElementById('mat-packaging-section').classList.toggle('hidden', tab === 'ingredients');
}

function renderMaterialsMaster() {
  const showDeleted = document.getElementById('mat-show-deleted') && document.getElementById('mat-show-deleted').checked;
  renderMaterialIngredients(showDeleted);
  renderMaterialPackaging(showDeleted);
  updateMaterialStats();
}

function updateMaterialStats() {
  const activeIngs = ingredientsMaster.filter(i => !i.deleted);
  const activePacks = packagingMaster.filter(p => !p.deleted);
  const activeAllLength = activeIngs.length + activePacks.length;
  
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('mat-total', activeAllLength);
  el('mat-ing-count', activeIngs.length);
  el('mat-pack-count', activePacks.length);
}

function getStockBadge(item) {
  const qty = Number(item.stockQty) || 0;
  const min = Number(item.minAlert) || 0;
  if (qty === 0) return '<span class="mat-status-badge mat-status-out">❌ Out of Stock</span>';
  if (min > 0 && qty <= min) return `<span class="mat-status-badge mat-status-low">⚠️ Low (${qty})</span>`;
  return `<span class="mat-status-badge mat-status-in">✅ In Stock</span>`;
}

function renderMaterialIngredients(showDeleted) {
  const body = document.getElementById('mat-ing-body');
  if (!body) return;
  const list = showDeleted ? ingredientsMaster : ingredientsMaster.filter(i => !i.deleted);
  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--bo-muted);padding:24px;">No ingredients yet. Click "Add Item" to get started.</td></tr>`;
    return;
  }
  body.innerHTML = list.map((item) => {
    const idx = ingredientsMaster.indexOf(item);
    const isDel = !!item.deleted;
    return `
    <tr class="${isDel ? 'soft-deleted' : ''}">
      <td style="font-weight:500;">${item.name}${isDel ? '<span class="deleted-tag"> Deleted</span>' : ''}</td>
      <td><span class="badge badge-info">${item.cat}</span></td>
      <td>${item.unit}</td>
      <td>
        <div style="display:flex;align-items:center;gap:4px;">
          <input type="number" id="mat-ing-rate-${idx}" value="${item.rate}" style="width:70px;padding:4px 6px;font-size:12px;" ${isDel ? 'disabled' : ''}>
          <button class="btn btn-sm" style="padding:3px 5px;" onclick="viewIngredientHistory(${idx})" title="History"><i class="ti ti-history"></i></button>
        </div>
      </td>
      <td><input type="number" id="mat-ing-stock-${idx}" value="${item.stockQty || 0}" style="width:65px;padding:4px 6px;font-size:12px;" ${isDel ? 'disabled' : ''}></td>
      <td><input type="number" id="mat-ing-min-${idx}" value="${item.minAlert || 0}" style="width:65px;padding:4px 6px;font-size:12px;" ${isDel ? 'disabled' : ''}></td>
      <td>${getStockBadge(item)}</td>
      <td style="font-size:12px;color:var(--bo-muted);">${item.updated || ''}</td>
      <td style="display:flex;gap:4px;align-items:center;">
        ${isDel
          ? `<button class="btn btn-sm btn-success-solid" onclick="restoreIngredient(${idx})"><i class="ti ti-restore"></i></button>
             <button class="btn btn-sm btn-danger-solid" onclick="hardDeleteIngredient(${idx})"><i class="ti ti-trash-x"></i></button>`
          : `<button class="btn btn-sm" onclick="updateMaterialItem('ingredient',${idx})">Update</button>
             <button class="btn btn-sm btn-danger" onclick="softDeleteIngredient(${idx})"><i class="ti ti-trash"></i></button>`
        }
      </td>
    </tr>`;
  }).join('');
}

function renderMaterialPackaging(showDeleted) {
  const body = document.getElementById('mat-pack-body');
  if (!body) return;
  const list = showDeleted ? packagingMaster : packagingMaster.filter(p => !p.deleted);
  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--bo-muted);padding:24px;">No packaging items yet. Click "Add Item" to get started.</td></tr>`;
    return;
  }
  body.innerHTML = list.map((item) => {
    const idx = packagingMaster.indexOf(item);
    const isDel = !!item.deleted;
    return `
    <tr class="${isDel ? 'soft-deleted' : ''}">
      <td style="font-weight:500;">${item.name}${isDel ? '<span class="deleted-tag"> Deleted</span>' : ''}</td>
      <td><span class="badge badge-gold">${item.type}</span></td>
      <td>${item.size}</td>
      <td>
        <div style="display:flex;align-items:center;gap:4px;">
          <input type="number" id="mat-pack-rate-${idx}" value="${item.rate}" style="width:70px;padding:4px 6px;font-size:12px;" ${isDel ? 'disabled' : ''}>
          <button class="btn btn-sm" style="padding:3px 5px;" onclick="viewPackagingHistory(${idx})" title="History"><i class="ti ti-history"></i></button>
        </div>
      </td>
      <td><input type="number" id="mat-pack-stock-${idx}" value="${item.stockQty || 0}" style="width:65px;padding:4px 6px;font-size:12px;" ${isDel ? 'disabled' : ''}></td>
      <td><input type="number" id="mat-pack-min-${idx}" value="${item.minAlert || 0}" style="width:65px;padding:4px 6px;font-size:12px;" ${isDel ? 'disabled' : ''}></td>
      <td>${getStockBadge(item)}</td>
      <td style="font-size:12px;color:var(--bo-muted);">${item.vendor}</td>
      <td style="display:flex;gap:4px;align-items:center;">
        ${isDel
          ? `<button class="btn btn-sm btn-success-solid" onclick="restorePackagingItem(${idx})"><i class="ti ti-restore"></i></button>
             <button class="btn btn-sm btn-danger-solid" onclick="hardDeletePackagingItem(${idx})"><i class="ti ti-trash-x"></i></button>`
          : `<button class="btn btn-sm" onclick="updateMaterialItem('packaging',${idx})">Update</button>
             <button class="btn btn-sm btn-danger" onclick="softDeletePackagingItem(${idx})"><i class="ti ti-trash"></i></button>`
        }
      </td>
    </tr>`;
  }).join('');
}

async function updateMaterialItem(type, idx) {
  try {
    if (type === 'ingredient') {
      const item = ingredientsMaster[idx];
      const newRate  = parseFloat(document.getElementById(`mat-ing-rate-${idx}`).value) || 0;
      const newStock = parseInt(document.getElementById(`mat-ing-stock-${idx}`).value) || 0;
      const newMin   = parseInt(document.getElementById(`mat-ing-min-${idx}`).value) || 0;
      if (newRate !== item.rate) {
        const oldRate = item.rate;
        item.rate = newRate;
        item.updated = new Date().toLocaleDateString('en-IN');
        if (!item.rateHistory) item.rateHistory = [];
        item.rateHistory.unshift({ date: item.updated, timestamp: Date.now(), oldRate, newRate });
        await API.updateIngredientRate(item.id, newRate, item.rateHistory);
      }
      item.stockQty = newStock;
      item.minAlert = newMin;
      await API.updateIngredientStock(item.id, newStock, newMin);
    } else {
      const item = packagingMaster[idx];
      const newRate  = parseFloat(document.getElementById(`mat-pack-rate-${idx}`).value) || 0;
      const newStock = parseInt(document.getElementById(`mat-pack-stock-${idx}`).value) || 0;
      const newMin   = parseInt(document.getElementById(`mat-pack-min-${idx}`).value) || 0;
      if (newRate !== item.rate) {
        const oldRate = item.rate;
        item.rate = newRate;
        if (!item.rateHistory) item.rateHistory = [];
        item.rateHistory.unshift({ date: new Date().toLocaleDateString('en-IN'), timestamp: Date.now(), oldRate, newRate });
        await API.updatePackagingRate(item.id, newRate, item.rateHistory);
      }
      item.stockQty = newStock;
      item.minAlert = newMin;
      await API.updatePackagingStock(item.id, newStock, newMin);
    }
    renderMaterialsMaster();
    showToast('Updated successfully!');
  } catch(err) { showToast('Update failed: ' + err.message, true); }
}

function showAddMaterialModal() {
  if (currentMaterialTab === 'ingredients') showAddIngredient();
  else showAddPackaging();
}

// ── AI Invoice Scanner ───────────────────────────────────────

function showScanInvoice() {
  _scanFile = null; _scanItems = [];
  openModal(`
    <div class="modal-header"><h3>🤖 Scan Supplier Invoice</h3><button class="btn btn-sm" onclick="closeModalBtn()"><i class="ti ti-x"></i></button></div>
    <div class="modal-body">
      <div id="scan-dropzone" style="border:2px dashed var(--bo-gold);border-radius:10px;padding:36px;text-align:center;cursor:pointer;transition:all 0.2s;" onclick="document.getElementById('scan-file-input').click()" ondragover="event.preventDefault();this.style.background='rgba(196,154,60,0.08)';this.style.borderColor='var(--bo-gold-dark)';" ondragleave="this.style.background='';this.style.borderColor='var(--bo-gold)';" ondrop="handleScanDrop(event)">
        <i class="ti ti-photo-scan" style="font-size:42px;color:var(--bo-gold);display:block;margin-bottom:10px;"></i>
        <div style="font-weight:500;margin-bottom:4px;font-size:14px;">Drop invoice image here or click to upload</div>
        <div style="font-size:12px;color:var(--bo-muted);">Supports JPG, PNG, WebP</div>
      </div>
      <input type="file" id="scan-file-input" accept="image/jpeg,image/png,image/webp" style="display:none;" onchange="handleScanFile(this.files[0])">

      <!-- Upload confirmation + preview (hidden until file selected) -->
      <div id="scan-preview-wrap" style="display:none;margin-top:16px;">
        <div style="background:rgba(45,106,79,0.07);border:1px solid rgba(45,106,79,0.25);border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px;margin-bottom:14px;">
          <span style="font-size:24px;">✅</span>
          <div style="flex:1;min-width:0;">
            <div id="scan-filename" style="font-weight:500;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Image uploaded</div>
            <div id="scan-filesize" style="font-size:11px;color:var(--bo-muted);margin-top:2px;"></div>
          </div>
          <button onclick="document.getElementById('scan-file-input').click()" class="btn btn-sm" style="flex-shrink:0;"><i class="ti ti-refresh"></i> Change</button>
        </div>
        <div style="text-align:center;border-radius:8px;overflow:hidden;margin-bottom:14px;background:var(--bo-cream);">
          <img id="scan-preview" style="max-height:160px;max-width:100%;object-fit:contain;display:block;margin:0 auto;">
        </div>
        <button id="scan-btn" class="btn btn-gold" style="width:100%;justify-content:center;font-size:14px;padding:12px;" onclick="runScan()">
          <i class="ti ti-sparkles"></i> Scan with Gemini AI
        </button>
        <div id="scan-status" style="display:none;text-align:center;padding:14px;font-size:13px;color:var(--bo-muted);">
          <div style="display:inline-block;width:18px;height:18px;border:2px solid var(--bo-gold);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;vertical-align:middle;margin-right:8px;"></div>
          <span id="scan-status-text">Uploading image to Gemini AI…</span>
          <div style="font-size:11px;margin-top:6px;color:var(--bo-muted);">⏱ Usually takes 5–15 seconds</div>
        </div>
      </div>

      <!-- Results (hidden until scan complete) -->
      <div id="scan-results" style="display:none;margin-top:16px;">
        <div style="font-weight:500;margin-bottom:8px;font-size:13.5px;">Detected Items — review &amp; confirm:</div>
        <div id="scan-items-list"></div>
        <div style="margin-top:8px;"><label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;"><input type="checkbox" id="scan-update-stock" checked> Also update stock quantity from invoice quantities</label></div>
        <button id="scan-import-btn" class="btn btn-gold" style="margin-top:12px;width:100%;justify-content:center;" onclick="confirmScanImport()"><i class="ti ti-check"></i> Import Selected Items</button>
      </div>
    </div>`);
}

function handleScanFile(file) {
  if (!file) return;

  // Check if file is HEIC/HEIF
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'heic' || ext === 'heif') {
    alert("⚠️ Apple HEIC format is not supported natively by web browsers.\n\nPlease convert this image to a standard JPG, PNG, or WebP format first, then upload it.");
    // Reset inputs
    document.getElementById('scan-file-input').value = "";
    return;
  }

  _scanFile = file;

  // Show preview wrap
  document.getElementById('scan-preview-wrap').style.display = 'block';
  document.getElementById('scan-results').style.display = 'none';

  // Show filename and size
  const nameEl = document.getElementById('scan-filename');
  const sizeEl = document.getElementById('scan-filesize');
  if (nameEl) nameEl.textContent = file.name;
  if (sizeEl) {
    const kb = (file.size / 1024).toFixed(1);
    const mb = (file.size / (1024*1024)).toFixed(2);
    sizeEl.textContent = file.size > 1024*1024 ? mb + ' MB · Ready to scan' : kb + ' KB · Ready to scan';
  }

  // Show image preview
  const url = URL.createObjectURL(file);
  document.getElementById('scan-preview').src = url;

  // Update dropzone to confirm upload
  const dz = document.getElementById('scan-dropzone');
  if (dz) {
    dz.style.background = 'rgba(45,106,79,0.04)';
    dz.style.borderColor = 'rgba(45,106,79,0.4)';
    dz.innerHTML = `<i class="ti ti-check" style="font-size:32px;color:var(--bo-success);display:block;margin-bottom:8px;"></i>
      <div style="font-weight:500;color:var(--bo-success);margin-bottom:4px;">Image ready!</div>
      <div style="font-size:12px;color:var(--bo-muted);">Click to change image</div>`;
  }
}

function handleScanDrop(e) {
  e.preventDefault();
  e.currentTarget.style.background = '';
  const file = e.dataTransfer.files[0];
  if (file) handleScanFile(file);
}

async function runScan() {
  if (!_scanFile) { showToast('Please upload an image first', true); return; }

  // Show scanning state
  const btn = document.getElementById('scan-btn');
  const statusEl = document.getElementById('scan-status');
  const statusText = document.getElementById('scan-status-text');
  if (btn) btn.style.display = 'none';
  if (statusEl) statusEl.style.display = 'block';

  // Animated status messages to reassure user
  const messages = [
    'Uploading image to Gemini AI…',
    'Reading your invoice…',
    'Extracting line items…',
    'Almost done, finalising results…'
  ];
  let msgIdx = 0;
  const msgTimer = setInterval(() => {
    msgIdx = (msgIdx + 1) % messages.length;
    if (statusText) statusText.textContent = messages[msgIdx];
  }, 3500);

  try {
    await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const base64 = ev.target.result.split(',')[1];
          const mimeType = _scanFile.type || 'image/jpeg';
          const result = await API.scanInvoice(base64, mimeType);
          _scanItems = result.items || [];
          clearInterval(msgTimer);
          if (statusEl) statusEl.style.display = 'none';
          renderScanResults(_scanItems);
          resolve();
        } catch(err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsDataURL(_scanFile);
    });
  } catch(e) {
    clearInterval(msgTimer);
    if (statusEl) statusEl.style.display = 'none';
    if (btn) btn.style.display = 'block';
    showToast('Scan failed: ' + e.message, true);
  }
}

function renderScanResults(items) {
  document.getElementById('scan-results').style.display = 'block';
  if (items.length === 0) {
    document.getElementById('scan-items-list').innerHTML = '<div style="color:var(--bo-muted);font-size:13px;padding:10px 0;">No items detected. Try a clearer image.</div>';
    return;
  }
  document.getElementById('scan-items-list').innerHTML = items.map((item, i) => `
    <div style="display:grid;grid-template-columns:2fr 0.5fr 0.8fr 1fr 1fr auto;gap:6px;align-items:center;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(232,213,190,0.3);">
      <input type="text" id="scan-name-${i}" value="${item.name}" style="font-size:12px;padding:4px 6px;">
      <input type="number" id="scan-qty-${i}" value="${item.quantity || 1}" style="font-size:12px;padding:4px 6px;">
      <input type="text" id="scan-unit-${i}" value="${item.unit || ''}" style="font-size:12px;padding:4px 6px;">
      <input type="number" id="scan-price-${i}" value="${item.unitPrice || 0}" style="font-size:12px;padding:4px 6px;">
      <select id="scan-type-${i}" style="font-size:12px;padding:4px 6px;">
        <option value="ingredient" ${item.type !== 'packaging' ? 'selected' : ''}>Ingredient</option>
        <option value="packaging" ${item.type === 'packaging' ? 'selected' : ''}>Packaging</option>
      </select>
      <input type="checkbox" id="scan-check-${i}" checked style="width:16px;height:16px;accent-color:var(--bo-gold);">
    </div>`).join('');
}

async function confirmScanImport() {
  const btn = document.getElementById('scan-import-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div style="display:inline-block;width:12px;height:12px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:6px;vertical-align:middle;"></div> Importing...`;
  }

  const updateStock = document.getElementById('scan-update-stock') && document.getElementById('scan-update-stock').checked;
  let imported = 0, updated = 0, errors = 0;

  // Helper: normalize name for fuzzy matching (lowercase, strip special chars/spaces)
  function normalizeName(n) {
    return (n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  for (let i = 0; i < _scanItems.length; i++) {
    if (!document.getElementById(`scan-check-${i}`).checked) continue;
    const name  = document.getElementById(`scan-name-${i}`).value.trim();
    const qty   = parseInt(document.getElementById(`scan-qty-${i}`).value) || 1;
    const unit  = document.getElementById(`scan-unit-${i}`).value || 'piece';
    const price = parseFloat(document.getElementById(`scan-price-${i}`).value) || 0;
    const type  = document.getElementById(`scan-type-${i}`).value;
    if (!name) continue;

    const normScanned = normalizeName(name);

    try {
      if (type === 'ingredient') {
        const existing = ingredientsMaster.find(m => !m.deleted && normalizeName(m.name) === normScanned);
        if (existing) {
          if (updateStock) {
            const newQty = (Number(existing.stockQty) || 0) + qty;
            const result = await API.updateIngredientStock(existing.id, newQty, Number(existing.minAlert) || 0);
            // Update local array using the server-confirmed value
            existing.stockQty = result && result.stockQty !== undefined ? Number(result.stockQty) : newQty;
            updated++;
          } else {
            updated++;
          }
        } else {
          const saved = await API.addIngredient({ name, cat: 'Other', unit, rate: price });
          if (updateStock) {
            await API.updateIngredientStock(saved.id, qty, 0);
            saved.stockQty = qty;
          } else {
            saved.stockQty = 0;
          }
          saved.minAlert = 0;
          ingredientsMaster.push(saved);
          imported++;
        }
      } else {
        const existing = packagingMaster.find(m => !m.deleted && normalizeName(m.name) === normScanned);
        if (existing) {
          if (updateStock) {
            const newQty = (Number(existing.stockQty) || 0) + qty;
            const result = await API.updatePackagingStock(existing.id, newQty, Number(existing.minAlert) || 0);
            existing.stockQty = result && result.stockQty !== undefined ? Number(result.stockQty) : newQty;
            updated++;
          } else {
            updated++;
          }
        } else {
          const saved = await API.addPackaging({ name, type: 'Other', size: 'Standard', rate: price, vendor: 'Supplier' });
          if (updateStock) {
            await API.updatePackagingStock(saved.id, qty, 0);
            saved.stockQty = qty;
          } else {
            saved.stockQty = 0;
          }
          saved.minAlert = 0;
          packagingMaster.push(saved);
          imported++;
        }
      }
    } catch(e) {
      console.warn('Import item failed:', name, e.message);
      errors++;
    }
  }

  // Reload from server to guarantee UI reflects true state
  try {
    const [freshIngs, freshPacks] = await Promise.all([API.getIngredients(), API.getPackaging()]);
    ingredientsMaster = freshIngs;
    packagingMaster   = freshPacks;
  } catch(e) { console.warn('Refresh after import failed:', e.message); }

  closeModalBtn();
  renderMaterialsMaster();

  const parts = [];
  if (imported > 0) parts.push(`${imported} new item${imported !== 1 ? 's' : ''} added`);
  if (updated > 0)  parts.push(`${updated} restocked`);
  if (errors > 0)   parts.push(`${errors} failed`);
  showToast(`✅ ${parts.length ? parts.join(', ') : 'Done'}!`);
}

// ── Customer Database ────────────────────────────────────────

async function loadCustomers() {
  try { customersDB = await API.getCustomers(); } catch(e) { console.warn('Customers load failed:', e.message); }
}

function renderCustomerList() {
  const body = document.getElementById('customers-table-body');
  if (!body) return;
  const q = ((document.getElementById('cust-search') && document.getElementById('cust-search').value) || '').toLowerCase();
  const list = customersDB.filter(c => !c.deleted &&
    (c.name.toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.city || '').toLowerCase().includes(q)));
  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--bo-muted);">No customers yet. Click "Add Customer" to get started.</td></tr>`;
    return;
  }
  body.innerHTML = list.map(c => `
    <tr>
      <td style="font-weight:500;">${c.name}</td>
      <td>${c.phone || '—'}</td>
      <td>${c.city || '—'}${c.pincode?' <span style="font-size:11px;color:var(--bo-muted);">('+c.pincode+')</span>':''}</td>
      <td>${c.totalOrders || 0}</td>
      <td>₹${Number(c.totalValue || 0).toLocaleString('en-IN')}</td>
      <td style="font-size:12px;color:var(--bo-muted);">${c.lastOrderDate || '—'}</td>
      <td style="display:flex;gap:4px;">
        <button class="btn btn-sm" onclick="navigate('sales')" title="New Invoice"><i class="ti ti-receipt"></i></button>
        <button class="btn btn-sm btn-danger" onclick="deleteCustomerEntry('${c.id}')" title="Delete"><i class="ti ti-trash"></i></button>
      </td>
    </tr>`).join('');
}

function showAddCustomer() {
  openModal(`
    <div class="modal-header"><h3>Add Customer</h3><button class="btn btn-sm" onclick="closeModalBtn()"><i class="ti ti-x"></i></button></div>
    <div class="modal-body">
      <form onsubmit="saveNewCustomer(event)">
        <div class="form-group"><label class="form-label required">Full Name</label><input type="text" id="nc-name" required placeholder="Customer full name" autofocus></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label required">Phone (WhatsApp)</label><input type="text" id="nc-phone" required placeholder="+91 XXXXX XXXXX"></div>
          <div class="form-group"><label class="form-label">Email</label><input type="email" id="nc-email" placeholder="email@example.com"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">City</label><input type="text" id="nc-city" placeholder="e.g. Mumbai"></div>
          <div class="form-group"><label class="form-label">Pincode <span style="font-size:11px;color:var(--bo-muted);">(6 digits)</span></label><input type="text" id="nc-pincode" placeholder="e.g. 282001" maxlength="6" pattern="[0-9]{6}"></div>
        </div>
        <div class="form-group"><label class="form-label">Delivery Address <span style="font-size:11px;color:var(--bo-muted);">(for delivery coordination)</span></label><textarea id="nc-address" rows="2" placeholder="e.g. Flat 5B, Rose Apartments, MG Road, Near City Park" style="width:100%;resize:vertical;"></textarea></div>
        <div class="form-group"><label class="form-label">Notes</label><input type="text" id="nc-notes" placeholder="Preferences, allergies, special instructions, etc."></div>
        <button type="submit" class="btn btn-gold" style="width:100%;justify-content:center;margin-top:8px;"><i class="ti ti-plus"></i> Add Customer</button>
      </form>
    </div>`);
}

async function saveNewCustomer(e) {
  e.preventDefault();
  try {
    const data = {
      name:    document.getElementById('nc-name').value.trim(),
      phone:   document.getElementById('nc-phone').value.trim(),
      email:   document.getElementById('nc-email').value.trim(),
      city:    document.getElementById('nc-city').value.trim(),
      pincode: document.getElementById('nc-pincode').value.trim(),
      address: document.getElementById('nc-address').value.trim(),
      notes:   document.getElementById('nc-notes').value.trim(),
    };
    const saved = await API.addCustomer(data);
    customersDB.push(saved);
    renderCustomerList();
    closeModalBtn();
    showToast('Customer added!');
  } catch(err) { showToast('Failed to add: ' + err.message, true); }
}

async function deleteCustomerEntry(id) {
  try {
    await API.deleteCustomer(id);
    customersDB = customersDB.filter(c => c.id !== id);
    renderCustomerList();
    showToast('Customer deleted');
  } catch(err) { showToast('Delete failed', true); }
}

// ── Sales Invoice Page ───────────────────────────────────────

function initSalesPage() {
  currentSaleItems = [];
  currentSaleCustomer = null;
  const selCust = document.getElementById('sale-selected-cust');
  if (selCust) selCust.style.display = 'none';
  const discEl = document.getElementById('sale-discount'); if (discEl) discEl.value = '0';
  const gstEl  = document.getElementById('sale-gst'); if (gstEl) gstEl.value = '0';
  const noteEl = document.getElementById('sale-notes'); if (noteEl) noteEl.value = '';
  const payEl  = document.getElementById('sale-payment'); if (payEl) payEl.value = 'Cash';
  const srch   = document.getElementById('sale-cust-search'); if (srch) srch.value = '';
  const invNum = document.getElementById('inv-number'); if (invNum) invNum.textContent = 'New';
  const invDate = document.getElementById('inv-date');
  if (invDate) invDate.textContent = new Date().toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'});
  const invBiz = document.getElementById('inv-business-name');
  if (invBiz) invBiz.textContent = businessConfig.businessName || 'BakeFlow';
  const invPhone = document.getElementById('inv-business-phone');
  if (invPhone) invPhone.textContent = businessConfig.businessPhone || '';
  const invBy = document.getElementById('inv-generated-by');
  if (invBy) invBy.textContent = (currentSession && currentSession.name) || 'Unknown';
  renderSaleItems();
  updateSaleTotals();
}

function searchSaleCustomers() {
  const q = ((document.getElementById('sale-cust-search') && document.getElementById('sale-cust-search').value) || '').toLowerCase();
  const results = document.getElementById('sale-cust-results');
  if (!results) return;
  if (!q) { results.classList.add('hidden'); return; }
  const matches = customersDB.filter(c => c.name.toLowerCase().includes(q) || (c.phone || '').includes(q));
  results.classList.remove('hidden');
  results.innerHTML = matches.slice(0, 6).map(c => `
    <div class="cust-result-item" onclick="selectSaleCustomer('${c.id}')">
      <div><strong>${c.name}</strong> <span style="font-size:12px;color:var(--bo-muted);">— ${c.phone || ''} ${c.city ? '(' + c.city + ')' : ''}</span></div>
      <i class="ti ti-chevron-right" style="color:var(--bo-muted);font-size:14px;"></i>
    </div>`).join('') ||
    `<div style="padding:10px 14px;color:var(--bo-muted);font-size:12px;">No match. <span style="cursor:pointer;color:var(--bo-gold-dark);" onclick="showAddCustomerForSale()">Add new?</span></div>`;
}

function selectSaleCustomer(id) {
  const c = customersDB.find(x => x.id === id);
  if (!c) return;
  currentSaleCustomer = c;
  const results = document.getElementById('sale-cust-results'); if (results) results.classList.add('hidden');
  const srch = document.getElementById('sale-cust-search'); if (srch) srch.value = '';
  const sel = document.getElementById('sale-selected-cust'); if (sel) sel.style.display = 'block';
  const sName = document.getElementById('sale-cust-name'); if (sName) sName.textContent = c.name;
  const sDet  = document.getElementById('sale-cust-detail'); if (sDet) sDet.textContent = [c.phone, c.city, c.pincode].filter(Boolean).join(' · ');
  updateInvoicePreview();
}

function clearSaleCustomer() {
  currentSaleCustomer = null;
  const sel = document.getElementById('sale-selected-cust'); if (sel) sel.style.display = 'none';
  updateInvoicePreview();
}

function showAddCustomerForSale() {
  const results = document.getElementById('sale-cust-results'); if (results) results.classList.add('hidden');
  showAddCustomer();
}

function showAddSaleItemFromCatalog() {
  const active = catalogProducts.filter(p => !p.deleted);
  openModal(`
    <div class="modal-header"><h3>Add from Catalog</h3><button class="btn btn-sm" onclick="closeModalBtn()"><i class="ti ti-x"></i></button></div>
    <div class="modal-body">
      ${active.length === 0
        ? '<div style="color:var(--bo-muted);padding:16px;text-align:center;">No products in catalog yet.</div>'
        : active.map(p => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid var(--bo-border);">
            <div><span style="font-size:18px;">${p.emoji}</span> <strong>${p.name}</strong> <span style="font-size:12px;color:var(--bo-muted);">— ₹${p.sell}</span></div>
            <button class="btn btn-sm btn-gold" onclick="addSaleItemFromProduct('${p.id}');closeModalBtn();">Add</button>
          </div>`).join('')
      }
    </div>`);
}

function addSaleItemFromProduct(productId) {
  const p = catalogProducts.find(x => x.id === productId);
  if (!p) return;
  currentSaleItems.push({ id: Date.now() + '', name: p.name, description: p.cat, qty: 1, unitPrice: p.sell, costPrice: p.cost || 0 });
  renderSaleItems();
  updateSaleTotals();
}

function addCustomSaleItem() {
  currentSaleItems.push({ id: Date.now() + '', name: '', description: '', qty: 1, unitPrice: 0, costPrice: 0 });
  renderSaleItems();
  updateSaleTotals();
}

function renderSaleItems() {
  const container = document.getElementById('sale-items-list');
  const empty     = document.getElementById('sale-items-empty');
  if (!container) return;
  if (currentSaleItems.length === 0) {
    container.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  container.innerHTML = currentSaleItems.map((item, i) => `
    <div class="sale-item-row">
      <input type="text" value="${item.name}" placeholder="Item name" oninput="updateSaleItem(${i},'name',this.value)">
      <input type="number" value="${item.qty}" min="0.1" step="0.1" style="width:60px;" oninput="updateSaleItem(${i},'qty',this.value)">
      <input type="number" value="${item.unitPrice}" min="0" style="width:80px;" oninput="updateSaleItem(${i},'unitPrice',this.value)">
      <span style="font-size:13px;font-weight:500;color:var(--bo-gold-dark);white-space:nowrap;">₹${(item.qty * item.unitPrice).toFixed(2)}</span>
      <button class="remove-btn" onclick="removeSaleItem(${i})"><i class="ti ti-x"></i></button>
    </div>`).join('');
}

function updateSaleItem(idx, field, val) {
  if (!currentSaleItems[idx]) return;
  currentSaleItems[idx][field] = (field === 'qty' || field === 'unitPrice') ? (parseFloat(val) || 0) : val;
  updateSaleTotals();
}

function removeSaleItem(idx) {
  currentSaleItems.splice(idx, 1);
  renderSaleItems();
  updateSaleTotals();
}

function updateSaleTotals() {
  const subtotal = currentSaleItems.reduce((s, i) => s + (i.qty * i.unitPrice), 0);
  const discount = parseFloat((document.getElementById('sale-discount') && document.getElementById('sale-discount').value) || 0) || 0;
  const gstPct   = parseFloat((document.getElementById('sale-gst') && document.getElementById('sale-gst').value) || 0) || 0;
  const gstAmt   = ((subtotal - discount) * gstPct) / 100;
  const total    = subtotal - discount + gstAmt;
  const fmt = n => Number(n).toFixed(2);
  const elSet = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  elSet('sale-subtotal', fmt(subtotal));
  elSet('sale-discount-show', fmt(discount));
  elSet('sale-gst-amt', fmt(gstAmt));
  elSet('sale-total', fmt(total));
  updateInvoicePreview();
}

function updateInvoicePreview() {
  const subtotal = currentSaleItems.reduce((s, i) => s + (i.qty * i.unitPrice), 0);
  const discount = parseFloat((document.getElementById('sale-discount') && document.getElementById('sale-discount').value) || 0) || 0;
  const gstPct   = parseFloat((document.getElementById('sale-gst') && document.getElementById('sale-gst').value) || 0) || 0;
  const gstAmt   = ((subtotal - discount) * gstPct) / 100;
  const total    = subtotal - discount + gstAmt;
  const fmt = n => Number(n).toFixed(2);
  const elSet = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  const elStyle = (id, prop, val) => { const e = document.getElementById(id); if (e) e.style[prop] = val; };

  // Customer
  elSet('inv-cust-name',   currentSaleCustomer ? currentSaleCustomer.name : '—');
  const custDetailParts = currentSaleCustomer ? [currentSaleCustomer.phone, currentSaleCustomer.city, currentSaleCustomer.pincode].filter(Boolean) : [];
  const custAddressLine = currentSaleCustomer && currentSaleCustomer.address ? currentSaleCustomer.address : '';
  const custDetailStr = currentSaleCustomer ? (custDetailParts.join(' · ') + (custAddressLine ? ' | ' + custAddressLine : '')) : 'Select a customer above';
  elSet('inv-cust-detail', custDetailStr);

  // Items table
  const tbody = document.getElementById('inv-items-body');
  if (tbody) {
    tbody.innerHTML = currentSaleItems.length === 0
      ? '<tr><td colspan="4" style="color:var(--bo-muted);text-align:center;padding:10px;">Add items above</td></tr>'
      : currentSaleItems.map(i => `<tr><td>${i.name||'—'}</td><td style="text-align:right;">${i.qty}</td><td style="text-align:right;">₹${Number(i.unitPrice).toFixed(2)}</td><td style="text-align:right;">₹${(i.qty*i.unitPrice).toFixed(2)}</td></tr>`).join('');
  }

  // Totals
  elSet('inv-subtotal', fmt(subtotal));
  elSet('inv-total', fmt(total));
  elStyle('inv-discount-row', 'display', discount > 0 ? '' : 'none');
  elSet('inv-discount', fmt(discount));
  elStyle('inv-gst-row', 'display', gstPct > 0 ? '' : 'none');
  elSet('inv-gst-pct', gstPct);
  elSet('inv-gst-amt', fmt(gstAmt));

  // Meta
  const payment = (document.getElementById('sale-payment') && document.getElementById('sale-payment').value) || 'Cash';
  elSet('inv-payment', payment);
  const notes = (document.getElementById('sale-notes') && document.getElementById('sale-notes').value) || '';
  elStyle('inv-notes-row', 'display', notes ? '' : 'none');
  elSet('inv-notes', notes);
}

function printInvoice() {
  updateInvoicePreview();
  window.print();
}

async function sendSaleWhatsApp() {
  if (!currentSaleCustomer) { showToast('Please select a customer first', true); return; }
  if (currentSaleItems.length === 0) { showToast('Please add at least one item', true); return; }
  showToast('Saving invoice…');
  const saleId = await doSaveSale();
  if (!saleId) return;
  await depleteInventoryForSaleItems(currentSaleItems);
  try {
    await API.sendSaleWhatsApp(saleId);
    salesInvoices = await API.getSales();
    showToast('✅ WhatsApp sent & stock depleted!');
  } catch(e) { showToast('WhatsApp failed: ' + e.message, true); }
}

async function saveSaleInvoice() {
  if (!currentSaleCustomer) { showToast('Please select a customer first', true); return; }
  if (currentSaleItems.length === 0) { showToast('Please add at least one item', true); return; }
  const id = await doSaveSale();
  if (id) {
    await depleteInventoryForSaleItems(currentSaleItems);
    showToast('✅ Invoice saved & stock depleted!');
    salesInvoices = await API.getSales();
    initSalesPage();
  }
}

async function depleteInventoryForSaleItems(items) {
  if (!items || items.length === 0) return;
  let depletedCount = 0;

  // Helper to normalize strings for exact matching
  function cleanStr(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  }

  for (const item of items) {
    if (!item.name) continue;

    // Find the saved recipe calculation matching this catalog product name
    const recipe = savedOrders.find(o => !o.deleted && cleanStr(o.name) === cleanStr(item.name));
    if (!recipe) {
      console.log('[Depletion] No recipe calculation found for item:', item.name);
      continue;
    }

    const qtySold = Number(item.qty) || 0;
    const batchSize = Number(recipe.batchSize) || 1;
    const multiplier = qtySold / batchSize;

    // 1. Deplete recipe ingredients
    if (recipe.ingredients && recipe.ingredients.length > 0) {
      for (const ing of recipe.ingredients) {
        if (!ing.name) continue;
        const normName = cleanStr(ing.name);
        const masterIng = ingredientsMaster.find(m => !m.deleted && cleanStr(m.name) === normName);
        if (masterIng) {
          const factor = getConversionFactorV2(ing.name, masterIng.unit, ing.unit);
          const totalUsed = ing.qty * factor * multiplier;
          try {
            // Atomic: server does stockQty = stockQty - totalUsed — no race condition
            await API.decrementIngredientStock(masterIng.id, totalUsed);
            depletedCount++;
          } catch (e) {
            console.warn('[Depletion] Failed for ingredient:', ing.name, e.message);
          }
        }
      }
    }

    // 2. Deplete packaging items
    if (recipe.packaging && recipe.packaging.length > 0) {
      for (const pack of recipe.packaging) {
        if (!pack.name) continue;
        const normName = cleanStr(pack.name);
        const masterPack = packagingMaster.find(m => !m.deleted && cleanStr(m.name) === normName);
        if (masterPack) {
          const factor = getConversionFactorV2(pack.name, masterPack.unit, pack.unit);
          const totalUsed = pack.qty * factor * multiplier;
          try {
            await API.decrementPackagingStock(masterPack.id, totalUsed);
            depletedCount++;
          } catch (e) {
            console.warn('[Depletion] Failed for packaging:', pack.name, e.message);
          }
        }
      }
    }

    // 3. Deplete decoration items
    if (recipe.decorations && recipe.decorations.length > 0) {
      for (const deco of recipe.decorations) {
        if (!deco.name) continue;
        const normName = cleanStr(deco.name);
        const masterIng = ingredientsMaster.find(m => !m.deleted && cleanStr(m.name) === normName);
        const masterPack = packagingMaster.find(m => !m.deleted && cleanStr(m.name) === normName);
        if (masterIng) {
          const factor = getConversionFactorV2(deco.name, masterIng.unit, deco.unit);
          const totalUsed = deco.qty * factor * multiplier;
          try {
            await API.decrementIngredientStock(masterIng.id, totalUsed);
            depletedCount++;
          } catch (e) { console.warn('[Depletion] Failed for deco ingredient:', deco.name, e.message); }
        } else if (masterPack) {
          const factor = getConversionFactorV2(deco.name, masterPack.unit, deco.unit);
          const totalUsed = deco.qty * factor * multiplier;
          try {
            await API.decrementPackagingStock(masterPack.id, totalUsed);
            depletedCount++;
          } catch (e) { console.warn('[Depletion] Failed for deco packaging:', deco.name, e.message); }
        }
      }
    }
  }

  if (depletedCount > 0) {
    try {
      const [freshIngs, freshPacks] = await Promise.all([API.getIngredients(), API.getPackaging()]);
      ingredientsMaster = freshIngs;
      packagingMaster   = freshPacks;
      renderMaterialsMaster();
    } catch (e) {
      console.warn('[Depletion] Reload master items failed:', e.message);
    }
  }
}

async function restoreInventoryForSaleItems(items) {
  if (!items || items.length === 0) return;
  let restoredCount = 0;

  function cleanStr(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  }

  for (const item of items) {
    if (!item.name) continue;

    const recipe = savedOrders.find(o => !o.deleted && cleanStr(o.name) === cleanStr(item.name));
    if (!recipe) {
      console.log('[Restoration] No recipe calculation found for item:', item.name);
      continue;
    }

    const qtySold = Number(item.qty) || 0;
    const batchSize = Number(recipe.batchSize) || 1;
    const multiplier = qtySold / batchSize;

    // 1. Restore recipe ingredients
    if (recipe.ingredients && recipe.ingredients.length > 0) {
      for (const ing of recipe.ingredients) {
        if (!ing.name) continue;
        const normName = cleanStr(ing.name);
        const masterIng = ingredientsMaster.find(m => !m.deleted && cleanStr(m.name) === normName);
        if (masterIng) {
          const factor = getConversionFactorV2(ing.name, masterIng.unit, ing.unit);
          const totalUsed = ing.qty * factor * multiplier;
          try {
            await API.incrementIngredientStock(masterIng.id, totalUsed);
            restoredCount++;
          } catch (e) { console.warn('[Restoration] Failed for ingredient:', ing.name, e.message); }
        }
      }
    }

    // 2. Restore packaging items
    if (recipe.packaging && recipe.packaging.length > 0) {
      for (const pack of recipe.packaging) {
        if (!pack.name) continue;
        const normName = cleanStr(pack.name);
        const masterPack = packagingMaster.find(m => !m.deleted && cleanStr(m.name) === normName);
        if (masterPack) {
          const factor = getConversionFactorV2(pack.name, masterPack.unit, pack.unit);
          const totalUsed = pack.qty * factor * multiplier;
          try {
            await API.incrementPackagingStock(masterPack.id, totalUsed);
            restoredCount++;
          } catch (e) { console.warn('[Restoration] Failed for packaging:', pack.name, e.message); }
        }
      }
    }

    // 3. Restore decoration items
    if (recipe.decorations && recipe.decorations.length > 0) {
      for (const deco of recipe.decorations) {
        if (!deco.name) continue;
        const normName = cleanStr(deco.name);
        const masterIng = ingredientsMaster.find(m => !m.deleted && cleanStr(m.name) === normName);
        const masterPack = packagingMaster.find(m => !m.deleted && cleanStr(m.name) === normName);
        if (masterIng) {
          const factor = getConversionFactorV2(deco.name, masterIng.unit, deco.unit);
          const totalUsed = deco.qty * factor * multiplier;
          try {
            await API.incrementIngredientStock(masterIng.id, totalUsed);
            restoredCount++;
          } catch (e) { console.warn('[Restoration] Failed for deco ingredient:', deco.name, e.message); }
        } else if (masterPack) {
          const factor = getConversionFactorV2(deco.name, masterPack.unit, deco.unit);
          const totalUsed = deco.qty * factor * multiplier;
          try {
            await API.incrementPackagingStock(masterPack.id, totalUsed);
            restoredCount++;
          } catch (e) { console.warn('[Restoration] Failed for deco packaging:', deco.name, e.message); }
        }
      }
    }
  }

  if (restoredCount > 0) {
    try {
      const [freshIngs, freshPacks] = await Promise.all([API.getIngredients(), API.getPackaging()]);
      ingredientsMaster = freshIngs;
      packagingMaster   = freshPacks;
      renderMaterialsMaster();
    } catch (e) {
      console.warn('[Restoration] Reload master items failed:', e.message);
    }
  }
}

async function doSaveSale() {
  const finalItems = currentSaleItems.map(item => {
    let cost = Number(item.costPrice) || 0;
    if (cost === 0 && item.name) {
      const cp = catalogProducts.find(p => !p.deleted && p.name.toLowerCase().trim() === item.name.toLowerCase().trim());
      if (cp) {
        cost = Number(cp.cost) || 0;
      } else {
        const rec = savedOrders.find(o => !o.deleted && o.name.toLowerCase().trim() === item.name.toLowerCase().trim());
        if (rec && rec.summary) {
          cost = Number(rec.summary.totalCost) || 0;
        }
      }
    }
    return { ...item, costPrice: cost };
  });

  const subtotal = finalItems.reduce((s, i) => s + (i.qty * i.unitPrice), 0);
  const discount = parseFloat((document.getElementById('sale-discount') && document.getElementById('sale-discount').value) || 0) || 0;
  const gstPct   = parseFloat((document.getElementById('sale-gst') && document.getElementById('sale-gst').value) || 0) || 0;
  const gstAmt   = ((subtotal - discount) * gstPct) / 100;
  const total    = subtotal - discount + gstAmt;
  try {
    const sale = await API.createSale({
      customerId:    currentSaleCustomer ? currentSaleCustomer.id   : '',
      customerName:  currentSaleCustomer ? currentSaleCustomer.name : '',
      customerPhone:   currentSaleCustomer ? currentSaleCustomer.phone   : '',
      customerCity:    currentSaleCustomer ? currentSaleCustomer.city    : '',
      customerPincode: currentSaleCustomer ? currentSaleCustomer.pincode : '',
      customerAddress: currentSaleCustomer ? currentSaleCustomer.address : '',
      items: finalItems,
      subtotal, discountAmt: discount, gstPct, gstAmt, totalAmount: total,
      paymentMethod: (document.getElementById('sale-payment') && document.getElementById('sale-payment').value) || 'Cash',
      notes: (document.getElementById('sale-notes') && document.getElementById('sale-notes').value) || '',
    });
    const numEl = document.getElementById('inv-number'); if (numEl) numEl.textContent = sale.invoiceNumber;
    return sale.id;
  } catch(e) {
    showToast('Save failed: ' + e.message, true);
    return null;
  }
}

function resetSale() { initSalesPage(); }

// ── All Invoices List ────────────────────────────────────────

function renderInvoiceList() {
  const body = document.getElementById('invoices-table-body');
  if (!body) return;

  // Calculate summary metrics
  const activeInvoices = salesInvoices.filter(i => !i.deleted);
  const totalRev = activeInvoices.reduce((sum, i) => sum + (Number(i.totalAmount) || 0), 0);
  const totalCount = activeInvoices.length;
  const avgVal = totalCount > 0 ? (totalRev / totalCount) : 0;
  const pendingCredit = activeInvoices.filter(i => (i.paymentMethod || '').toLowerCase() === 'credit').length;

  // Update DOM elements if they exist
  const totalRevEl = document.getElementById('inv-total-rev');
  const countEl = document.getElementById('inv-count');
  const avgEl = document.getElementById('inv-avg');
  const pendingEl = document.getElementById('inv-pending');

  if (totalRevEl) totalRevEl.textContent = `₹${totalRev.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (countEl) countEl.textContent = totalCount;
  if (avgEl) avgEl.textContent = `₹${avgVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (pendingEl) pendingEl.textContent = pendingCredit;

  const q = ((document.getElementById('inv-search') && document.getElementById('inv-search').value) || '').toLowerCase();
  const filterPay = ((document.getElementById('inv-filter-payment') && document.getElementById('inv-filter-payment').value) || '');
  
  const list = salesInvoices.filter(i => {
    if (i.deleted) return false;
    const matchesSearch = ((i.customerName || '').toLowerCase().includes(q) || (i.invoiceNumber || '').toLowerCase().includes(q));
    const matchesPayment = !filterPay || (i.paymentMethod || '') === filterPay;
    return matchesSearch && matchesPayment;
  });

  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--bo-muted);">No matching invoices found. <span style="cursor:pointer;color:var(--bo-gold-dark);" onclick="navigate('sales')">Create one →</span></td></tr>`;
    return;
  }
  body.innerHTML = list.map(inv => {
    const itemCount = Array.isArray(inv.items) ? inv.items.length : 0;
    return `
    <tr>
      <td style="font-weight:500;">${inv.invoiceNumber}</td>
      <td>${inv.customerName || '—'}</td>
      <td style="font-size:12px;color:var(--bo-muted);">${itemCount} item${itemCount!==1?'s':''}</td>
      <td style="color:var(--bo-gold-dark);font-weight:500;">₹${Number(inv.totalAmount).toLocaleString('en-IN')}</td>
      <td><span class="badge badge-gold">${inv.paymentMethod || '—'}</span></td>
      <td style="font-size:12px;">${inv.createdBy || '—'}</td>
      <td style="font-size:12px;color:var(--bo-muted);">${inv.date || ''}</td>
      <td>${inv.whatsappSent ? '<span class="badge badge-green">✅ Sent</span>' : '<span class="badge badge-rose">✗ No</span>'}</td>
      <td style="display:flex;gap:4px;">
        ${!inv.whatsappSent ? `<button class="btn btn-sm" onclick="resendWhatsApp('${inv.id}')" title="Send WhatsApp"><i class="ti ti-brand-whatsapp"></i></button>` : ''}
        <button class="btn btn-sm btn-danger" onclick="deleteSaleEntry('${inv.id}')"><i class="ti ti-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

async function resendWhatsApp(id) {
  showToast('Sending WhatsApp…');
  try {
    await API.sendSaleWhatsApp(id);
    salesInvoices = await API.getSales();
    renderInvoiceList();
    showToast('✅ WhatsApp sent!');
  } catch(e) { showToast('WhatsApp failed: ' + e.message, true); }
}

async function deleteSaleEntry(id) {
  const sale = salesInvoices.find(i => i.id === id);
  try {
    await API.deleteSale(id);
    if (sale && sale.items) {
      await restoreInventoryForSaleItems(sale.items);
    }
    salesInvoices = salesInvoices.filter(i => i.id !== id);
    await loadCustomers(); // Reload customer database to sync totals
    renderInvoiceList();
    showToast('Invoice deleted & stock restored');
  } catch(err) { showToast('Delete failed', true); }
}

// ── Sales Reports (Admin only) ───────────────────────────────

function onSalesDatePresetChange() {
  const val = document.getElementById('salesreports-date-preset').value;
  const custom = document.getElementById('salesreports-custom-dates');
  if (val === 'custom') {
    custom.classList.remove('hidden');
    if (!document.getElementById('salesreports-start-date').value) {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      document.getElementById('salesreports-start-date').value = d.toISOString().split('T')[0];
      document.getElementById('salesreports-end-date').value = new Date().toISOString().split('T')[0];
    }
  } else {
    custom.classList.add('hidden');
  }
  renderSalesReports();
}

function renderSalesReports() {
  const preset = document.getElementById('salesreports-date-preset')?.value || '30days';
  const { start, end } = getPeriodDateRange(preset, 'salesreports-start-date', 'salesreports-end-date');
  const prior = getPriorPeriodDateRange(start, end);
  
  const rangeDisplay = document.getElementById('salesreports-date-display');
  if (rangeDisplay && start && end) {
    rangeDisplay.textContent = formatDateDisplay(start, end);
  }
  
  // Filter invoices for both periods
  const currentPeriodInvoices = salesInvoices.filter(i => {
    if (i.deleted) return false;
    const ts = Number(i.timestamp) || 0;
    return ts >= start.getTime() && ts <= end.getTime();
  });
  
  const priorPeriodInvoices = salesInvoices.filter(i => {
    if (i.deleted) return false;
    const ts = Number(i.timestamp) || 0;
    return ts >= prior.start.getTime() && ts <= prior.end.getTime();
  });
  
  // Calculate Current Period Metrics
  const revCurrent = currentPeriodInvoices.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0);
  let cogsMatCurrent = 0;
  let cogsLabourCurrent = 0;
  
  currentPeriodInvoices.forEach(inv => {
    const items = Array.isArray(inv.items) ? inv.items : [];
    items.forEach(item => {
      const qty = Number(item.qty) || 0;
      const cost = Number(item.costPrice) || 0;
      const totalItemCost = qty * cost;
      
      const recipe = savedOrders.find(o => !o.deleted && o.name.toLowerCase().trim() === item.name.toLowerCase().trim());
      if (recipe && recipe.summary && recipe.summary.totalCost > 0) {
        const sum = recipe.summary;
        const totalRecipeCost = Number(sum.totalCost) || 1;
        const matCost = (Number(sum.rawCost) || 0) + (Number(sum.packCost) || 0) + (Number(sum.decoCost) || 0);
        const labCost = Number(recipe.labour?.totalCost) || 0;
        
        cogsMatCurrent += totalItemCost * (matCost / totalRecipeCost);
        cogsLabourCurrent += totalItemCost * (labCost / totalRecipeCost);
      } else {
        cogsMatCurrent += totalItemCost;
      }
    });
  });
  const cogsTotalCurrent = cogsMatCurrent + cogsLabourCurrent;
  const gpCurrent = revCurrent - cogsTotalCurrent;
  const gpmCurrent = revCurrent > 0 ? (gpCurrent / revCurrent * 100) : 0;
  const opexCurrent = getOperatingExpensesForPeriod(start, end);
  const opCurrent = gpCurrent - opexCurrent;
  const opmCurrent = revCurrent > 0 ? (opCurrent / revCurrent * 100) : 0;
  
  // Calculate Prior Period Metrics
  const revPrior = priorPeriodInvoices.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0);
  let cogsMatPrior = 0;
  let cogsLabourPrior = 0;
  
  priorPeriodInvoices.forEach(inv => {
    const items = Array.isArray(inv.items) ? inv.items : [];
    items.forEach(item => {
      const qty = Number(item.qty) || 0;
      const cost = Number(item.costPrice) || 0;
      const totalItemCost = qty * cost;
      
      const recipe = savedOrders.find(o => !o.deleted && o.name.toLowerCase().trim() === item.name.toLowerCase().trim());
      if (recipe && recipe.summary && recipe.summary.totalCost > 0) {
        const sum = recipe.summary;
        const totalRecipeCost = Number(sum.totalCost) || 1;
        const matCost = (Number(sum.rawCost) || 0) + (Number(sum.packCost) || 0) + (Number(sum.decoCost) || 0);
        const labCost = Number(recipe.labour?.totalCost) || 0;
        
        cogsMatPrior += totalItemCost * (matCost / totalRecipeCost);
        cogsLabourPrior += totalItemCost * (labCost / totalRecipeCost);
      } else {
        cogsMatPrior += totalItemCost;
      }
    });
  });
  const cogsTotalPrior = cogsMatPrior + cogsLabourPrior;
  const gpPrior = revPrior - cogsTotalPrior;
  const gpmPrior = revPrior > 0 ? (gpPrior / revPrior * 100) : 0;
  const opexPrior = getOperatingExpensesForPeriod(prior.start, prior.end);
  const opPrior = gpPrior - opexPrior;
  const opmPrior = revPrior > 0 ? (opPrior / revPrior * 100) : 0;
  
  // DOM Updates
  const elSet = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  
  elSet('sr-revenue', '₹' + Math.round(revCurrent).toLocaleString('en-IN'));
  elSet('sr-cogs', '₹' + Math.round(cogsTotalCurrent).toLocaleString('en-IN'));
  elSet('sr-gross-profit', '₹' + Math.round(gpCurrent).toLocaleString('en-IN'));
  elSet('sr-gross-margin-pct', Math.round(gpmCurrent) + '%');
  elSet('sr-operating-margin-pct', Math.round(opmCurrent) + '%');
  
  const updateChange = (id, curr, priorVal) => {
    const badge = document.getElementById(id);
    if (badge) {
      const info = formatChangeBadge(curr, priorVal);
      badge.textContent = info.text;
      badge.className = 'badge ' + info.cls;
    }
  };
  updateChange('sr-revenue-change', revCurrent, revPrior);
  updateChange('sr-cogs-change', cogsTotalCurrent, cogsTotalPrior);
  
  elSet('sr-orders-count', currentPeriodInvoices.length);
  const aov = currentPeriodInvoices.length > 0 ? (revCurrent / currentPeriodInvoices.length) : 0;
  elSet('sr-avg-order-value', '₹' + Math.round(aov).toLocaleString('en-IN'));
  elSet('sr-operating-expenses', '₹' + Math.round(opexCurrent).toLocaleString('en-IN'));
  
  const waSent = currentPeriodInvoices.filter(i => i.whatsappSent).length;
  elSet('sr-wa-sent', waSent);
  
  // P&L Period Comparison Table
  const pctChangeStr = (curr, pr) => {
    if (pr === 0) return curr === 0 ? '0.0%' : 'New';
    const pct = ((curr - pr) / Math.abs(pr)) * 100;
    return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
  };
  
  elSet('pl-rev-current', '₹' + Math.round(revCurrent).toLocaleString('en-IN'));
  elSet('pl-rev-prior', '₹' + Math.round(revPrior).toLocaleString('en-IN'));
  elSet('pl-rev-change', pctChangeStr(revCurrent, revPrior));
  
  elSet('pl-cogs-mat-current', '₹' + Math.round(cogsMatCurrent).toLocaleString('en-IN'));
  elSet('pl-cogs-mat-prior', '₹' + Math.round(cogsMatPrior).toLocaleString('en-IN'));
  elSet('pl-cogs-mat-change', pctChangeStr(cogsMatCurrent, cogsMatPrior));
  
  elSet('pl-cogs-labour-current', '₹' + Math.round(cogsLabourCurrent).toLocaleString('en-IN'));
  elSet('pl-cogs-labour-prior', '₹' + Math.round(cogsLabourPrior).toLocaleString('en-IN'));
  elSet('pl-cogs-labour-change', pctChangeStr(cogsLabourCurrent, cogsLabourPrior));
  
  elSet('pl-gp-current', '₹' + Math.round(gpCurrent).toLocaleString('en-IN'));
  elSet('pl-gp-prior', '₹' + Math.round(gpPrior).toLocaleString('en-IN'));
  elSet('pl-gp-change', pctChangeStr(gpCurrent, gpPrior));
  
  elSet('pl-gpm-current', Math.round(gpmCurrent) + '%');
  elSet('pl-gpm-prior', Math.round(gpmPrior) + '%');
  elSet('pl-gpm-change', (gpmCurrent - gpmPrior).toFixed(1) + '%');
  
  elSet('pl-opex-current', '₹' + Math.round(opexCurrent).toLocaleString('en-IN'));
  elSet('pl-opex-prior', '₹' + Math.round(opexPrior).toLocaleString('en-IN'));
  elSet('pl-opex-change', pctChangeStr(opexCurrent, opexPrior));
  
  elSet('pl-op-current', '₹' + Math.round(opCurrent).toLocaleString('en-IN'));
  elSet('pl-op-prior', '₹' + Math.round(opPrior).toLocaleString('en-IN'));
  elSet('pl-op-change', pctChangeStr(opCurrent, opPrior));
  
  elSet('pl-opm-current', Math.round(opmCurrent) + '%');
  elSet('pl-opm-prior', Math.round(opmPrior) + '%');
  elSet('pl-opm-change', (opmCurrent - opmPrior).toFixed(1) + '%');
  
  // Operating Loss Warning & Styling
  const lossAlert = document.getElementById('operating-loss-alert');
  const lossAlertAmt = document.getElementById('loss-alert-amount');
  const opProfitVal = document.getElementById('sr-operating-profit');
  const opProfitCard = document.getElementById('sr-operating-profit-card');
  const plOpRow = document.getElementById('pl-operating-profit-row');
  
  if (opCurrent < 0) {
    if (lossAlert) lossAlert.classList.remove('hidden');
    if (lossAlertAmt) lossAlertAmt.textContent = '₹' + Math.round(Math.abs(opCurrent)).toLocaleString('en-IN');
    
    if (opProfitVal) {
      opProfitVal.textContent = '-₹' + Math.round(Math.abs(opCurrent)).toLocaleString('en-IN');
      opProfitVal.style.color = 'var(--bo-danger)';
    }
    if (opProfitCard) {
      opProfitCard.style.borderColor = 'rgba(155,35,53,0.3)';
      opProfitCard.style.background = 'rgba(155,35,53,0.03)';
    }
    if (plOpRow) {
      plOpRow.style.background = 'rgba(155,35,53,0.05)';
      const cells = plOpRow.querySelectorAll('td');
      if (cells[1]) cells[1].style.color = 'var(--bo-danger)';
    }
  } else {
    if (lossAlert) lossAlert.classList.add('hidden');
    if (opProfitVal) {
      opProfitVal.textContent = '₹' + Math.round(opCurrent).toLocaleString('en-IN');
      opProfitVal.style.color = 'var(--bo-success)';
    }
    if (opProfitCard) {
      opProfitCard.style.borderColor = 'var(--bo-border)';
      opProfitCard.style.background = 'var(--bo-white)';
    }
    if (plOpRow) {
      plOpRow.style.background = 'rgba(45,106,79,0.05)';
      const cells = plOpRow.querySelectorAll('td');
      if (cells[1]) cells[1].style.color = 'var(--bo-success)';
    }
  }
  
  // Payments Breakdown
  const payments = {};
  currentPeriodInvoices.forEach(i => {
    const method = i.paymentMethod || 'Cash';
    payments[method] = (payments[method] || 0) + Number(i.totalAmount);
  });
  
  const maxPayment = Math.max(...Object.values(payments), 1);
  const paymentBreakdownEl = document.getElementById('sr-payment-breakdown');
  if (paymentBreakdownEl) {
    if (Object.keys(payments).length === 0) {
      paymentBreakdownEl.innerHTML = '<div style="color:var(--bo-muted);font-size:12.5px;padding:8px 0;">No sales transactions.</div>';
    } else {
      const colors = { UPI: 'var(--bo-info)', Cash: 'var(--bo-success)', Card: 'var(--bo-gold)', Credit: 'var(--bo-danger)', 'Bank Transfer': '#7A6BAD' };
      paymentBreakdownEl.innerHTML = Object.entries(payments).map(([m, val]) => `
        <div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px;">
            <span>${m}</span>
            <strong style="color:var(--bo-gold-dark);">₹${Math.round(val).toLocaleString('en-IN')}</strong>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${(val/maxPayment*100).toFixed(0)}%;background:${colors[m]||'var(--bo-gold)'};"></div>
          </div>
        </div>`).join('');
    }
  }
  
  // Table
  const tb = document.getElementById('sr-table-body');
  if (tb) {
    if (currentPeriodInvoices.length === 0) {
      tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--bo-muted);padding:14px;">No invoices in this period.</td></tr>';
    } else {
      tb.innerHTML = currentPeriodInvoices.slice(0, 15).map(inv => `
        <tr>
          <td style="font-weight:500;">${inv.invoiceNumber}</td>
          <td>${inv.customerName || '—'}</td>
          <td><span class="badge badge-gold">${inv.paymentMethod || '—'}</span></td>
          <td style="font-size:12px;">${inv.createdBy || '—'}</td>
          <td style="font-size:12px;color:var(--bo-muted);">${inv.date || ''}</td>
          <td style="text-align:right;color:var(--bo-gold-dark);font-weight:600;">₹${Number(inv.totalAmount).toLocaleString('en-IN')}</td>
        </tr>`).join('');
    }
  }
}

// ── Audit Log (Admin only) ───────────────────────────────────

async function renderAuditLog() {
  const body = document.getElementById('audit-table-body');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--bo-muted);">Loading…</td></tr>';
  try {
    const logs = await API.getAuditLog();
    const q = ((document.getElementById('audit-search') && document.getElementById('audit-search').value) || '').toLowerCase();
    const filtered = logs.filter(l =>
      (l.action || '').toLowerCase().includes(q) ||
      (l.employeeName || '').toLowerCase().includes(q) ||
      (l.details || '').toLowerCase().includes(q)
    );
    if (filtered.length === 0) {
      body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--bo-muted);">No audit log entries found.</td></tr>';
      return;
    }
    body.innerHTML = filtered.slice(0, 100).map(l => `
      <tr>
        <td style="font-size:12px;color:var(--bo-muted);white-space:nowrap;">${l.date || ''} ${l.time || ''}</td>
        <td style="font-weight:500;">${l.employeeName || '—'}</td>
        <td><span class="badge badge-gold">${l.action || '—'}</span></td>
        <td style="font-size:12px;color:var(--bo-muted);">${l.details || ''}</td>
      </tr>`).join('');
  } catch(e) {
    body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--bo-danger);">Failed to load audit log.</td></tr>';
  }
}
