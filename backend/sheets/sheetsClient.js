const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const { tenantStorage } = require('../middleware/tenantContext');


const MODEL_MAPPING = {
  Ingredients:   'ingredient',
  Packaging:     'packaging',
  Products:      'product',
  Orders:        'order',
  Settings:      'setting',
  AuditLog:      'auditLog',
  Customers:     'customer',
  SalesInvoices: 'salesInvoice',
  Staff:         'user'
};

const DEFAULT_INGREDIENTS = [
  {id:'ing-1', name:'All-Purpose Flour',    cat:'Dry',       unit:'kg',          rate:48,   updated:'15/01/2024'},
  {id:'ing-2', name:'Maida',               cat:'Dry',       unit:'kg',          rate:40,   updated:'15/01/2024'},
  {id:'ing-3', name:'Sugar (Fine)',         cat:'Dry',       unit:'kg',          rate:50,   updated:'10/01/2024'},
  {id:'ing-4', name:'Powdered Sugar',       cat:'Dry',       unit:'kg',          rate:60,   updated:'10/01/2024'},
  {id:'ing-5', name:'Cocoa Powder',         cat:'Dry',       unit:'kg',          rate:350,  updated:'12/01/2024'},
  {id:'ing-6', name:'Baking Powder',        cat:'Dry',       unit:'g',           rate:25,   updated:'05/01/2024'},
  {id:'ing-7', name:'Baking Soda',          cat:'Dry',       unit:'g',           rate:15,   updated:'05/01/2024'},
  {id:'ing-8', name:'Fresh Cream (25% fat)',cat:'Dairy',     unit:'litre',       rate:180,  updated:'18/01/2024'},
  {id:'ing-9', name:'Whipping Cream',       cat:'Dairy',     unit:'litre',       rate:280,  updated:'18/01/2024'},
  {id:'ing-10',name:'Butter (Amul)',        cat:'Dairy',     unit:'g',           rate:120,  updated:'16/01/2024'},
  {id:'ing-11',name:'Cream Cheese',         cat:'Dairy',     unit:'g',           rate:180,  updated:'14/01/2024'},
  {id:'ing-12',name:'Eggs',                cat:'Dairy',     unit:'piece',       rate:8,    updated:'18/01/2024'},
  {id:'ing-13',name:'Milk',                cat:'Dairy',     unit:'litre',       rate:60,   updated:'18/01/2024'},
  {id:'ing-14',name:'Belgian Dark Chocolate',cat:'Chocolate',unit:'kg',         rate:900,  updated:'10/01/2024'},
  {id:'ing-15',name:'Belgian Milk Chocolate',cat:'Chocolate',unit:'kg',         rate:800,  updated:'10/01/2024'},
  {id:'ing-16',name:'White Chocolate',      cat:'Chocolate', unit:'kg',          rate:850,  updated:'10/01/2024'},
  {id:'ing-17',name:'Alphonso Mango Pulp',  cat:'Fruit',     unit:'kg',          rate:250,  updated:'08/01/2024'},
  {id:'ing-18',name:'Strawberry (fresh)',   cat:'Fruit',     unit:'kg',          rate:200,  updated:'18/01/2024'},
  {id:'ing-19',name:'Kiwi',               cat:'Fruit',     unit:'piece',       rate:30,   updated:'18/01/2024'},
  {id:'ing-20',name:'Saffron (Kashmiri)',   cat:'Spice',     unit:'gram',        rate:12,   updated:'01/01/2024'},
  {id:'ing-21',name:'Cardamom Powder',      cat:'Spice',     unit:'50g',         rate:45,   updated:'05/01/2024'},
  {id:'ing-22',name:'Vanilla Extract',      cat:'Flavour',   unit:'30ml',        rate:80,   updated:'05/01/2024'},
  {id:'ing-23',name:'Lotus Biscoff',        cat:'Add-in',    unit:'250g pack',   rate:220,  updated:'12/01/2024'},
  {id:'ing-24',name:'Nutella',             cat:'Add-in',    unit:'350g',        rate:280,  updated:'12/01/2024'},
  {id:'ing-25',name:'Walnuts (California)', cat:'Nuts',      unit:'kg',          rate:900,  updated:'06/01/2024'},
  {id:'ing-26',name:'Pistachios (raw)',     cat:'Nuts',      unit:'kg',          rate:1200, updated:'06/01/2024'},
];

const DEFAULT_PACKAGING = [
  {id:'pack-1', name:'Cake Box 500g',       type:'Box',       size:'6×6 inch',   rate:35,  vendor:'LocalSupply'},
  {id:'pack-2', name:'Cake Box 1kg',        type:'Box',       size:'8×8 inch',   rate:45,  vendor:'LocalSupply'},
  {id:'pack-3', name:'Cake Box 2kg',        type:'Box',       size:'10×10 inch', rate:60,  vendor:'LocalSupply'},
  {id:'pack-4', name:'Brownie Box (8pc)',   type:'Box',       size:'Standard',   rate:25,  vendor:'LocalSupply'},
  {id:'pack-5', name:'Cookie Box (12pc)',   type:'Box',       size:'Standard',   rate:30,  vendor:'LocalSupply'},
  {id:'pack-6', name:'Chocolate Box (10pc)',type:'Box',       size:'Luxury',     rate:55,  vendor:'GiftPackaging'},
  {id:'pack-7', name:'Cake Board 6"',       type:'Board',     size:'6 inch',     rate:8,   vendor:'LocalSupply'},
  {id:'pack-8', name:'Cake Board 8"',       type:'Board',     size:'8 inch',     rate:12,  vendor:'LocalSupply'},
  {id:'pack-9', name:'Cake Board 10"',      type:'Board',     size:'10 inch',    rate:16,  vendor:'LocalSupply'},
  {id:'pack-10',name:'Carry Bag (small)',   type:'Bag',       size:'Small',      rate:15,  vendor:'PrintedBags'},
  {id:'pack-11',name:'Carry Bag (large)',   type:'Bag',       size:'Large',      rate:22,  vendor:'PrintedBags'},
  {id:'pack-12',name:'BlissOven Sticker',   type:'Sticker',   size:'Standard',   rate:3,   vendor:'PrintShop'},
  {id:'pack-13',name:'Message Card',        type:'Card',      size:'A6',         rate:5,   vendor:'PrintShop'},
  {id:'pack-14',name:'Thank-you Card',      type:'Card',      size:'Small',      rate:4,   vendor:'PrintShop'},
  {id:'pack-15',name:'Ribbon',             type:'Accessory', size:'1m',         rate:8,   vendor:'LocalSupply'},
  {id:'pack-16',name:'Tissue / Filler Paper',type:'Filler',  size:'Sheet',      rate:2,   vendor:'LocalSupply'},
];

const DEFAULT_PRODUCTS = [
  {id:'prod-1', name:'Rasmalai Cake',        cat:'Fusion Cake',    emoji:'🎂', cost:520, sell:950, margin:45},
  {id:'prod-2', name:'Gulab Jamun Cake',     cat:'Fusion Cake',    emoji:'🍮', cost:480, sell:850, margin:43},
  {id:'prod-3', name:'Fruit Cake (500g)',    cat:'Signature Cake', emoji:'🍓', cost:380, sell:650, margin:41},
  {id:'prod-4', name:'Classic Chocolate Cake',cat:'Celebration Cake',emoji:'🍫',cost:320,sell:550,margin:42},
  {id:'prod-5', name:'Fudgy Brownie Box (8pc)',cat:'Brownie Box',  emoji:'🟫', cost:280, sell:499, margin:44},
  {id:'prod-6', name:'Walnut Brownie Box',   cat:'Brownie Box',    emoji:'🌰', cost:300, sell:549, margin:45},
  {id:'prod-7', name:'Oreo Cheesecake',      cat:'Cheesecake',     emoji:'🍰', cost:420, sell:750, margin:44},
  {id:'prod-8', name:'Mango Cake',           cat:'Fusion Cake',    emoji:'🥭', cost:360, sell:650, margin:44},
  {id:'prod-9', name:'Kesar Pista Cake',     cat:'Fusion Cake',    emoji:'⭐', cost:500, sell:900, margin:44},
  {id:'prod-10',name:'Artisan Bread Loaf',   cat:'Homemade Bread', emoji:'🍞', cost:95,  sell:180, margin:47},
  {id:'prod-11',name:'Cookie Box (12pc)',    cat:'Cookie Box',     emoji:'🍪', cost:220, sell:399, margin:45},
  {id:'prod-12',name:'Chocolate Box (10pc)', cat:'Chocolate Box',  emoji:'🍬', cost:350, sell:649, margin:46},
];

const DEFAULT_LABOUR = {
  rates: { head: 200, deco: 180, pack: 100, delivery: 150, min: 100 },
  times: { prep: 30, bake: 45, decoSimple: 30, decoComplex: 120, pack: 15 }
};

const DEFAULT_OVERHEAD = {
  fixed: { rent: 15000, elec: 3000, gas: 1500, internet: 500, clean: 1000, days: 25, orders: 3 },
  toggles: { elec: true, gas: true, water: true, rent: true, clean: true, depr: false, admin: false, gst: false }
};

class SheetsClient {
  constructor() {
    this.prisma = null;
    this.pool = null;
    this.adapter = null;
    this.defaultTenantId = 'default-tenant-uuid';
  }

  async init() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL not set in .env');

    this.pool = new Pool({ connectionString: databaseUrl });
    this.adapter = new PrismaPg(this.pool);
    const basePrisma = new PrismaClient({ adapter: this.adapter });

    // Extend Prisma client to automatically inject tenantId on all scoped database queries
    this.prisma = basePrisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const store = tenantStorage.getStore();
            const role = store?.role;

            // Platform administrators bypass all tenant scoping to allow global operations
            if (role === 'platform_admin') {
              return query(args);
            }

            const bypassModels = ['Tenant', 'PlatformAdmin'];
            if (bypassModels.includes(model)) {
              return query(args);
            }

            const tenantId = store?.tenantId;
            if (tenantId) {
              // Scoping reads
              if (['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy'].includes(operation)) {
                args.where = args.where || {};
                args.where.tenantId = tenantId;
              }
              // Scoping creates
              else if (operation === 'create') {
                args.data = args.data || {};
                args.data.tenantId = tenantId;
              }
              else if (operation === 'createMany') {
                if (Array.isArray(args.data)) {
                  args.data.forEach(item => {
                    item.tenantId = tenantId;
                  });
                } else if (args.data) {
                  args.data.tenantId = tenantId;
                }
              }
              // Scoping updates/deletes/upserts
              else if (['update', 'updateMany', 'delete', 'deleteMany', 'upsert'].includes(operation)) {
                args.where = args.where || {};
                args.where.tenantId = tenantId;
                if (operation === 'upsert') {
                  args.create = args.create || {};
                  args.create.tenantId = tenantId;
                  args.update = args.update || {};
                  args.update.tenantId = tenantId;
                }
              }
            }
            return query(args);
          }
        }
      }
    });

    // Verify DB connection
    await basePrisma.$connect();

    // Create the default sequence for concurrent invoice numbering
    await basePrisma.$executeRawUnsafe('CREATE SEQUENCE IF NOT EXISTS "SalesInvoice_invoiceNumber_seq" START 1000;');

    // Ensure default tenant exists
    await basePrisma.tenant.upsert({
      where: { googleId: 'default-google-id' },
      update: {},
      create: {
        id: this.defaultTenantId,
        name: 'Default Bakery',
        googleId: 'default-google-id',
        email: 'default@bakeflow.com',
        status: 'active',
        plan: 'free'
      }
    });

    // Ensure demo tenant exists (for Try Demo button)
    const demoTenantId = process.env.DEMO_TENANT_ID || 'd0000000-0000-0000-0000-000000000001';
    try {
      await basePrisma.tenant.upsert({
        where: { googleId: 'demo-google-id-bakeflow' },
        update: {},
        create: {
          id: demoTenantId,
          name: 'Demo Bakery',
          googleId: 'demo-google-id-bakeflow',
          email: 'demo@bakeflow.app',
          status: 'active',
          plan: 'free'
        }
      });
    } catch (e) {
      console.warn('[Init] Could not create demo tenant:', e.message);
    }

    // Seed defaults if tables are empty
    await this._seedDefaults();

    // Seed demo tenant data (idempotent)
    await this._seedDemoTenant(demoTenantId);
  }

  async _seedDefaults() {
    const ingCount = await this.prisma.ingredient.count();
    if (ingCount === 0) {
      console.log('  📋 Seeding default ingredients...');
      for (const item of DEFAULT_INGREDIENTS) {
        const history = [{ date: item.updated || new Date().toLocaleDateString('en-IN'), timestamp: Date.now(), oldRate: 0, newRate: item.rate }];
        await this.prisma.ingredient.create({
          data: {
            id: item.id,
            tenantId: this.defaultTenantId,
            name: item.name,
            cat: item.cat,
            unit: item.unit,
            rate: item.rate,
            updated: item.updated,
            rateHistory: history,
            stockQty: item.stockQty || 0,
            minAlert: item.minAlert || 0
          }
        });
      }
    }

    const packCount = await this.prisma.packaging.count();
    if (packCount === 0) {
      console.log('  📦 Seeding default packaging...');
      for (const item of DEFAULT_PACKAGING) {
        const history = [{ date: new Date().toLocaleDateString('en-IN'), timestamp: Date.now(), oldRate: 0, newRate: item.rate }];
        await this.prisma.packaging.create({
          data: {
            id: item.id,
            tenantId: this.defaultTenantId,
            name: item.name,
            type: item.type,
            size: item.size,
            rate: item.rate,
            vendor: item.vendor,
            rateHistory: history,
            stockQty: item.stockQty || 0,
            minAlert: item.minAlert || 0
          }
        });
      }
    }

    const prodCount = await this.prisma.product.count();
    if (prodCount === 0) {
      console.log('  🛒 Seeding default products...');
      for (const item of DEFAULT_PRODUCTS) {
        await this.prisma.product.create({
          data: {
            id: item.id,
            tenantId: this.defaultTenantId,
            name: item.name,
            cat: item.cat,
            emoji: item.emoji,
            cost: item.cost,
            sell: item.sell,
            margin: item.margin
          }
        });
      }
    }

    const setHasLabour = await this.prisma.setting.findUnique({
      where: { key_tenantId: { key: 'labour', tenantId: this.defaultTenantId } }
    });
    if (!setHasLabour) {
      await this.prisma.setting.create({
        data: { key: 'labour', tenantId: this.defaultTenantId, value: DEFAULT_LABOUR }
      });
    }

    const setHasOverhead = await this.prisma.setting.findUnique({
      where: { key_tenantId: { key: 'overhead', tenantId: this.defaultTenantId } }
    });
    if (!setHasOverhead) {
      await this.prisma.setting.create({
        data: { key: 'overhead', tenantId: this.defaultTenantId, value: DEFAULT_OVERHEAD }
      });
    }
  }

  // Seed demo tenant with sample data so the Try Demo experience is rich
  async _seedDemoTenant(demoTenantId) {
    try {
      const ingCount = await this.prisma.ingredient.count({ where: { tenantId: demoTenantId } });
      if (ingCount === 0) {
        console.log('  📋 Seeding demo ingredients...');
        for (const item of DEFAULT_INGREDIENTS) {
          const history = [{ date: item.updated || new Date().toLocaleDateString('en-IN'), timestamp: Date.now(), oldRate: 0, newRate: item.rate }];
          await this.prisma.ingredient.create({
            data: {
              id: `demo-${item.id}`,
              tenantId: demoTenantId,
              name: item.name, cat: item.cat, unit: item.unit,
              rate: item.rate, updated: item.updated,
              rateHistory: history, stockQty: item.stockQty || 0, minAlert: item.minAlert || 0
            }
          });
        }
      }

      const packCount = await this.prisma.packaging.count({ where: { tenantId: demoTenantId } });
      if (packCount === 0) {
        console.log('  📦 Seeding demo packaging...');
        for (const item of DEFAULT_PACKAGING) {
          const history = [{ date: new Date().toLocaleDateString('en-IN'), timestamp: Date.now(), oldRate: 0, newRate: item.rate }];
          await this.prisma.packaging.create({
            data: {
              id: `demo-${item.id}`,
              tenantId: demoTenantId,
              name: item.name, type: item.type, size: item.size,
              rate: item.rate, vendor: item.vendor,
              rateHistory: history, stockQty: item.stockQty || 0, minAlert: item.minAlert || 0
            }
          });
        }
      }

      const prodCount = await this.prisma.product.count({ where: { tenantId: demoTenantId } });
      if (prodCount === 0) {
        console.log('  🛒 Seeding demo products...');
        for (const item of DEFAULT_PRODUCTS) {
          await this.prisma.product.create({
            data: {
              id: `demo-${item.id}`,
              tenantId: demoTenantId,
              name: item.name, cat: item.cat, emoji: item.emoji,
              cost: item.cost, sell: item.sell, margin: item.margin
            }
          });
        }
      }

      const setHasLabour = await this.prisma.setting.findUnique({
        where: { key_tenantId: { key: 'labour', tenantId: demoTenantId } }
      });
      if (!setHasLabour) {
        await this.prisma.setting.create({ data: { key: 'labour', tenantId: demoTenantId, value: DEFAULT_LABOUR } });
      }

      const setHasOverhead = await this.prisma.setting.findUnique({
        where: { key_tenantId: { key: 'overhead', tenantId: demoTenantId } }
      });
      if (!setHasOverhead) {
        await this.prisma.setting.create({ data: { key: 'overhead', tenantId: demoTenantId, value: DEFAULT_OVERHEAD } });
      }

      // Seed sample customers
      const custCount = await this.prisma.customer.count({ where: { tenantId: demoTenantId } });
      if (custCount === 0) {
        const today = new Date().toLocaleDateString('en-IN');
        const demoCustomers = [
          { id: 'demo-cust-1', name: 'Priya Sharma', phone: '9876543210', email: 'priya@example.com', city: 'Pune', address: '12, MG Road, Pune', notes: 'Prefers eggless cakes', totalOrders: 5, totalValue: 4250, lastOrderDate: today, createdAt: today },
          { id: 'demo-cust-2', name: 'Rohan Mehta', phone: '9812345678', email: 'rohan@example.com', city: 'Mumbai', address: '45, Linking Road, Mumbai', notes: '', totalOrders: 3, totalValue: 2800, lastOrderDate: today, createdAt: today },
          { id: 'demo-cust-3', name: 'Ananya Gupta', phone: '9998877665', email: 'ananya@example.com', city: 'Delhi', address: '7, Civil Lines, Delhi', notes: 'Allergic to nuts', totalOrders: 8, totalValue: 6900, lastOrderDate: today, createdAt: today },
        ];
        for (const c of demoCustomers) {
          await this.prisma.customer.create({ data: { ...c, tenantId: demoTenantId } });
        }
      }

      // Seed sample sales invoices
      const saleCount = await this.prisma.salesInvoice.count({ where: { tenantId: demoTenantId } });
      if (saleCount === 0) {
        const today = new Date().toLocaleDateString('en-IN');
        await this.prisma.salesInvoice.create({
          data: {
            id: 'demo-sale-1', tenantId: demoTenantId,
            invoiceNumber: 'INV-9001',
            customerId: 'demo-cust-1',
            customerName: 'Priya Sharma', customerPhone: '9876543210', customerCity: 'Pune',
            items: [{ name: 'Rasmalai Cake (1kg)', qty: 1, rate: 950, amount: 950 }, { name: 'Cake Box 1kg', qty: 1, rate: 45, amount: 45 }],
            subtotal: 995, discountAmt: 50, gstPct: 0, gstAmt: 0, totalAmount: 945,
            paymentMethod: 'UPI', notes: 'Anniversary cake', date: today,
            timestamp: Date.now() - 86400000,
            createdBy: 'Demo User', createdByEmail: 'demo@bakeflow.app',
            inventoryDeducted: false, whatsappSent: false
          }
        });
        await this.prisma.salesInvoice.create({
          data: {
            id: 'demo-sale-2', tenantId: demoTenantId,
            invoiceNumber: 'INV-9002',
            customerId: 'demo-cust-3',
            customerName: 'Ananya Gupta', customerPhone: '9998877665', customerCity: 'Delhi',
            items: [{ name: 'Fudgy Brownie Box (8pc)', qty: 2, rate: 499, amount: 998 }, { name: 'Message Card', qty: 2, rate: 5, amount: 10 }],
            subtotal: 1008, discountAmt: 0, gstPct: 0, gstAmt: 0, totalAmount: 1008,
            paymentMethod: 'Cash', notes: '', date: today,
            timestamp: Date.now() - 43200000,
            createdBy: 'Demo User', createdByEmail: 'demo@bakeflow.app',
            inventoryDeducted: false, whatsappSent: false
          }
        });
      }

      // Seed sample orders
      const orderCount = await this.prisma.order.count({ where: { tenantId: demoTenantId } });
      if (orderCount === 0) {
        const today = new Date().toLocaleDateString('en-IN');
        await this.prisma.order.create({
          data: {
            id: 'demo-order-1',
            tenantId: demoTenantId,
            name: 'Belgian Truffle Birthday Cake (1kg)',
            category: 'cake',
            date: today,
            timestamp: Date.now() - 3600000 * 2,
            orderData: {
              id: 'demo-order-1',
              name: 'Belgian Truffle Birthday Cake (1kg)',
              category: 'cake',
              date: today,
              timestamp: Date.now() - 3600000 * 2,
              summary: { totalCost: 460, sellingPrice: 950, profitPct: 51.6 }
            }
          }
        });
        await this.prisma.order.create({
          data: {
            id: 'demo-order-2',
            tenantId: demoTenantId,
            name: 'Lotus Biscoff Cheesecake (500g)',
            category: 'fusion-cake',
            date: today,
            timestamp: Date.now() - 3600000 * 6,
            orderData: {
              id: 'demo-order-2',
              name: 'Lotus Biscoff Cheesecake (500g)',
              category: 'fusion-cake',
              date: today,
              timestamp: Date.now() - 3600000 * 6,
              summary: { totalCost: 380, sellingPrice: 750, profitPct: 49.3 }
            }
          }
        });
      }

      // Seed sample staff member
      const userCount = await this.prisma.user.count({ where: { tenantId: demoTenantId } });
      if (userCount === 0) {
        await this.prisma.user.create({
          data: {
            id: 'demo-user-1',
            tenantId: demoTenantId,
            name: 'Chef Rahul',
            username: 'chef_rahul',
            role: 'employee',
            authMethod: 'password',
            active: true
          }
        });
      }

      console.log('  ✅ Demo tenant seeded.');
    } catch (err) {
      console.warn('[Demo Seed] Failed:', err.message);
    }
  }


  // Reset demo tenant — wipe all data and re-seed fresh defaults
  // Called on every new demo login so each session starts clean
  async _resetAndSeedDemoTenant(demoTenantId) {
    try {
      console.log('🔄 Resetting demo tenant data...');
      // Delete in order of FK dependencies
      try { await this.prisma.userSession.deleteMany({ where: { user: { tenantId: demoTenantId } } }); } catch(e) {}
      try { await this.prisma.user.deleteMany({ where: { tenantId: demoTenantId } }); } catch(e) {}
      await this.prisma.auditLog.deleteMany({ where: { tenantId: demoTenantId } });
      await this.prisma.salesInvoice.deleteMany({ where: { tenantId: demoTenantId } });
      await this.prisma.customer.deleteMany({ where: { tenantId: demoTenantId } });
      await this.prisma.order.deleteMany({ where: { tenantId: demoTenantId } });
      await this.prisma.product.deleteMany({ where: { tenantId: demoTenantId } });
      await this.prisma.packaging.deleteMany({ where: { tenantId: demoTenantId } });
      await this.prisma.ingredient.deleteMany({ where: { tenantId: demoTenantId } });
      await this.prisma.setting.deleteMany({ where: { tenantId: demoTenantId } });
      console.log('  🗑️  Demo data cleared. Re-seeding...');
      await this._seedDemoTenant(demoTenantId);
    } catch (err) {
      console.warn('[Demo Reset] Failed:', err.message);
      // Fall back to seed only (don't crash login on reset failure)
      await this._seedDemoTenant(demoTenantId);
    }
  }

  _formatForDb(sheetName, data) {
    const NUMERIC_FIELDS = new Set([
      'rate', 'cost', 'sell', 'margin', 'timestamp', 'deletedAt',
      'stockQty', 'minAlert',
      'totalOrders', 'totalValue',
      'subtotal', 'discountAmt', 'gstPct', 'gstAmt', 'totalAmount',
    ]);
    const BOOLEAN_FIELDS = new Set(['deleted', 'active', 'inventoryDeducted', 'whatsappSent']);

    const formatted = {};
    for (const key in data) {
      let val = data[key];
      if (NUMERIC_FIELDS.has(key)) {
        formatted[key] = val !== '' && val !== null && val !== undefined ? Number(val) : 0;
      } else if (BOOLEAN_FIELDS.has(key)) {
        formatted[key] = val === true || val === 'true';
      } else {
        formatted[key] = val;
      }
    }
    return formatted;
  }

  async getAll(sheetName) {
    const modelName = MODEL_MAPPING[sheetName];
    if (!modelName) throw new Error(`Model mapping not found for sheet ${sheetName}`);

    const rows = await this.prisma[modelName].findMany({
      where: { tenantId: this.defaultTenantId }
    });

    return rows.map(row => {
      const obj = { ...row };
      obj._rowIndex = row.id || row.key; // transparently maps rowIndex to actual string key/ID
      return obj;
    });
  }

  async append(sheetName, obj) {
    const modelName = MODEL_MAPPING[sheetName];
    if (!modelName) throw new Error(`Model mapping not found for sheet ${sheetName}`);

    const { _rowIndex, ...data } = obj;
    data.tenantId = this.defaultTenantId;

    const formattedData = this._formatForDb(sheetName, data);

    await this.prisma[modelName].create({
      data: formattedData
    });
  }

  async updateRow(sheetName, rowIndex, obj) {
    const modelName = MODEL_MAPPING[sheetName];
    if (!modelName) throw new Error(`Model mapping not found for sheet ${sheetName}`);

    const { _rowIndex, id, key, ...data } = obj;
    data.tenantId = this.defaultTenantId;

    const formattedData = this._formatForDb(sheetName, data);

    if (sheetName === 'Settings') {
      await this.prisma.setting.update({
        where: { key_tenantId: { key: rowIndex, tenantId: this.defaultTenantId } },
        data: formattedData
      });
    } else {
      await this.prisma[modelName].update({
        where: { id: rowIndex },
        data: formattedData
      });
    }
  }

  async deleteRow(sheetName, rowIndex) {
    const modelName = MODEL_MAPPING[sheetName];
    if (!modelName) throw new Error(`Model mapping not found for sheet ${sheetName}`);

    if (sheetName === 'Settings') {
      await this.prisma.setting.delete({
        where: { key_tenantId: { key: rowIndex, tenantId: this.defaultTenantId } }
      });
    } else {
      await this.prisma[modelName].delete({
        where: { id: rowIndex }
      });
    }
  }

  async nextInvoiceNumber() {
    const year = new Date().getFullYear();
    const [result] = await this.prisma.$queryRawUnsafe('SELECT nextval(\'"SalesInvoice_invoiceNumber_seq"\')');
    const num = String(result.nextval).padStart(4, '0');
    return `INV-${year}-${num}`;
  }

  async addLog(action, details, employeeName = '', employeeEmail = '', entityType = '', entityId = '') {
    await this.append('AuditLog', {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      date: new Date().toLocaleDateString('en-IN'),
      time: new Date().toLocaleTimeString('en-IN'),
      employeeName,
      employeeEmail,
      action,
      details: details || '',
      entityType,
      entityId,
    });
  }
}

module.exports = new SheetsClient();
