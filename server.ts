import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { dbInstance } from './src/db.ts';
import { OrderStatus, SettlementStatus, AssignmentMode } from './src/types.ts';

export const app = express();

// Initialize and synchronize with Firestore
dbInstance.init().catch(err => {
  console.error('Failed to sync Firestore on server start:', err);
});

// Middleware
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Ensure DB is initialized before processing requests
app.use(async (req, res, next) => {
  try {
    await dbInstance.init();
  } catch (err) {
    console.error('Database initialization error:', err);
  }
  next();
});

async function startServer() {
  const PORT = 3000;

  // API Routes - Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Login Endpoint (Demonstration & Simulation for RBAC)
  app.post('/api/login', (req, res) => {
    const { username, password, role } = req.body;

    // 1. Admin login (Demo Quick Login - bypass requirement for password/email)
    if (role === 'ADMIN') {
      const cleanUser = (username && username.trim()) ? username.trim().toLowerCase() : 'tumpanggo@gmail.com';
      dbInstance.log('admin', 'Admin logged in successfully (Demo)', 'ADMIN');
      return res.json({
        token: 'token_admin_' + Date.now(),
        role: 'ADMIN',
        user: { id: 'admin', name: 'Administrator Tumpang Go', username: cleanUser }
      });
    }

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    // 2. Merchant login
    if (role === 'MERCHANT') {
      // Find merchant by id, phone, or email
      const merchants = dbInstance.getMerchants();
      const merchant = merchants.find(m => 
        m.id.toLowerCase() === cleanUser || 
        m.phone === username || 
        (username.replace(/[^0-9]/g, '').length >= 8 && m.phone.replace(/[^0-9]/g, '') === username.replace(/[^0-9]/g, '')) ||
        (m.email && m.email.trim().toLowerCase() === cleanUser)
      );

      if (!merchant) {
        return res.status(401).json({ error: 'Email / No. Telepon ini tidak terdaftar sebagai Merchant / Toko. Silakan periksa kembali.' });
      }

      const expectedPass = merchant.id + '123'; // e.g. m1123
      const customPassword = merchant.password;
      const isActivated = merchant.isActivated;

      if (
        (isActivated && customPassword && cleanPass === customPassword) ||
        cleanPass === expectedPass || 
        cleanPass === 'merchant123' ||
        cleanPass === '123456'
      ) {
        dbInstance.log(merchant.id, `Merchant ${merchant.name} logged in`, 'MERCHANT');
        return res.json({
          token: 'token_merchant_' + merchant.id + '_' + Date.now(),
          role: 'MERCHANT',
          user: { id: merchant.id, name: merchant.name, phone: merchant.phone, email: merchant.email }
        });
      }

      return res.status(401).json({ error: 'Kata sandi toko salah. Silakan periksa kembali.' });
    }

    // 3. Driver login
    if (role === 'DRIVER') {
      const drivers = dbInstance.getDrivers();
      const driver = drivers.find(d => 
        d.id.toLowerCase() === cleanUser || 
        d.phone === username || 
        (username.replace(/[^0-9]/g, '').length >= 8 && d.phone.replace(/[^0-9]/g, '') === username.replace(/[^0-9]/g, '')) ||
        (d.email && d.email.trim().toLowerCase() === cleanUser)
      );

      if (!driver) {
        return res.status(401).json({ error: 'No. WhatsApp / Email ini tidak terdaftar sebagai Driver / Kurir. Silakan periksa kembali.' });
      }

      const expectedPass = driver.id + '123';
      if (cleanPass === expectedPass || cleanPass === 'driver123' || cleanPass === '123456') {
        dbInstance.log(driver.id, `Driver ${driver.name} logged in`, 'DRIVER');
        return res.json({
          token: 'token_driver_' + driver.id + '_' + Date.now(),
          role: 'DRIVER',
          user: { id: driver.id, name: driver.name, phone: driver.phone }
        });
      }

      return res.status(401).json({ error: 'Kata sandi driver salah. Silakan periksa kembali.' });
    }

    return res.status(400).json({ error: 'User not found or role mismatch' });
  });

  // Config endpoints
  app.get('/api/config', (req, res) => {
    res.json(dbInstance.getConfig());
  });

  app.put('/api/config', (req, res) => {
    const { userId, ...updates } = req.body;
    try {
      const config = dbInstance.updateConfig(userId || 'admin', updates);
      res.json(config);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Merchants endpoints
  app.get('/api/merchants', (req, res) => {
    res.json(dbInstance.getMerchants());
  });

  app.post('/api/merchants/register', (req, res) => {
    const { name, ownerName, phone, email, category, address, description, password } = req.body;
    if (!name || !ownerName || !phone || !password) {
      return res.status(400).json({ error: 'Mohon lengkapi Nama Toko, Nama Pemilik, No. WhatsApp, dan Kata Sandi.' });
    }

    try {
      const cleanPhone = phone.trim();
      const cleanEmail = email ? email.trim().toLowerCase() : '';
      
      const existingMerchants = dbInstance.getMerchants();
      const duplicate = existingMerchants.find(m => 
        (m.phone && m.phone === cleanPhone) || 
        (cleanEmail && m.email && m.email.toLowerCase() === cleanEmail)
      );

      if (duplicate) {
        return res.status(400).json({ error: 'No. HP/WhatsApp atau Email ini sudah terdaftar sebagai Merchant.' });
      }

      const merchantId = 'm_' + Date.now().toString(36);
      const newMerchant = {
        id: merchantId,
        name: name.trim(),
        ownerName: ownerName.trim(),
        phone: cleanPhone,
        email: cleanEmail || `${merchantId}@tumpangfood.id`,
        category: category || 'Nasi & Lauk',
        address: address ? address.trim() : 'Kecamatan Tumpang, Kabupaten Malang',
        description: description ? description.trim() : 'Mitra Kuliner UMKM Kecamatan Tumpang',
        image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500&auto=format&fit=crop&q=60',
        bannerImage: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&auto=format&fit=crop&q=60',
        rating: 5.0,
        openTime: '08:00',
        closeTime: '21:00',
        active: true,
        isActivated: true,
        password: password.trim(),
        commissionPercent: 10,
      };

      const created = dbInstance.createMerchant('SYSTEM_REGISTER', newMerchant as any);
      dbInstance.log(created.id, `Merchant ${created.name} registered via Portal`, 'MERCHANT');

      return res.status(201).json({
        success: true,
        message: 'Pendaftaran Merchant berhasil!',
        merchant: created,
        token: 'token_merchant_' + created.id + '_' + Date.now()
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Gagal mendaftarkan toko.' });
    }
  });

  app.get('/api/merchants/:id', (req, res) => {
    const m = dbInstance.getMerchantById(req.params.id);
    if (!m) return res.status(404).json({ error: 'Merchant not found' });
    res.json(m);
  });

  app.post('/api/merchants', (req, res) => {
    const { userId, ...merchantData } = req.body;
    try {
      const created = dbInstance.createMerchant(userId || 'admin', merchantData);
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put('/api/merchants/:id', (req, res) => {
    const { userId, role, ...updates } = req.body;
    try {
      const updated = dbInstance.updateMerchant(userId || 'admin', req.params.id, updates, role);
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/merchants/:id', (req, res) => {
    const { userId } = req.body;
    const success = dbInstance.deleteMerchant(userId || 'admin', req.params.id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: 'Merchant not found' });
  });

  // Menu categories
  app.get('/api/merchants/:id/categories', (req, res) => {
    res.json(dbInstance.getCategories(req.params.id));
  });

  app.post('/api/merchants/:id/categories', (req, res) => {
    const { name } = req.body;
    try {
      const created = dbInstance.createCategory(req.params.id, name);
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put('/api/merchants/:merchantId/categories/:id', (req, res) => {
    const { name } = req.body;
    try {
      const updated = dbInstance.updateCategory(req.params.merchantId, req.params.id, name);
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/merchants/:merchantId/categories/:id', (req, res) => {
    const success = dbInstance.deleteCategory(req.params.merchantId, req.params.id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: 'Category not found' });
  });

  // Menu Items
  app.get('/api/merchants/:id/menu', (req, res) => {
    res.json(dbInstance.getMenuItemsByMerchant(req.params.id));
  });

  app.post('/api/merchants/:id/menu', (req, res) => {
    try {
      const created = dbInstance.createMenuItem(req.params.id, req.body);
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put('/api/merchants/:merchantId/menu/:id', (req, res) => {
    try {
      const updated = dbInstance.updateMenuItem(req.params.merchantId, req.params.id, req.body);
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/merchants/:merchantId/menu/:id', (req, res) => {
    const success = dbInstance.deleteMenuItem(req.params.merchantId, req.params.id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: 'Menu item not found' });
  });

  // Drivers
  app.get('/api/drivers', (req, res) => {
    res.json(dbInstance.getDrivers());
  });

  app.get('/api/drivers/:id', (req, res) => {
    const d = dbInstance.getDriverById(req.params.id);
    if (!d) return res.status(404).json({ error: 'Driver not found' });
    res.json(d);
  });

  app.post('/api/drivers', (req, res) => {
    const { userId, ...driverData } = req.body;
    try {
      const created = dbInstance.createDriver(userId || 'admin', driverData);
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put('/api/drivers/:id', (req, res) => {
    const { userId, role, ...updates } = req.body;
    try {
      const updated = dbInstance.updateDriver(userId || req.params.id, req.params.id, updates, role);
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/drivers/:id', (req, res) => {
    const { userId } = req.body;
    const success = dbInstance.deleteDriver(userId || 'admin', req.params.id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: 'Driver not found' });
  });

  // Partner Registrations
  app.get('/api/partner-registrations', (req, res) => {
    res.json(dbInstance.getPartnerRegistrations());
  });

  app.post('/api/partner-registrations', (req, res) => {
    try {
      const created = dbInstance.createPartnerRegistration(req.body);
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put('/api/partner-registrations/:id/approve', (req, res) => {
    const { userId } = req.body;
    const result = dbInstance.approvePartnerRegistration(userId || 'admin', req.params.id);
    if (result.success) {
      res.json({ success: true, registration: result.registration });
    } else {
      res.status(400).json({ error: result.error });
    }
  });

  app.post('/api/partner-registrations/:id/reject', (req, res) => {
    const { userId } = req.body;
    const success = dbInstance.rejectPartnerRegistration(userId || 'admin', req.params.id);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Registration not found' });
    }
  });

  app.post('/api/merchants/activate', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi' });
    }
    const result = dbInstance.activateMerchant(email, password);
    if (result.success) {
      res.json({ success: true, merchant: result.merchant });
    } else {
      res.status(400).json({ error: result.error });
    }
  });

  // Orders
  app.get('/api/orders', (req, res) => {
    res.json(dbInstance.getOrders());
  });

  app.get('/api/orders/:id', (req, res) => {
    const o = dbInstance.getOrderById(req.params.id);
    if (!o) return res.status(404).json({ error: 'Order not found' });
    res.json(o);
  });

  app.get('/api/orders/customer/:phone', (req, res) => {
    res.json(dbInstance.getOrdersByCustomerPhone(req.params.phone));
  });

  app.get('/api/merchants/:merchantId/orders', (req, res) => {
    res.json(dbInstance.getOrdersByMerchant(req.params.merchantId));
  });

  app.get('/api/drivers/:driverId/orders', (req, res) => {
    res.json(dbInstance.getOrdersByDriver(req.params.driverId));
  });

  app.post('/api/orders', (req, res) => {
    try {
      const created = dbInstance.createOrder(req.body);
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put('/api/orders/:id', (req, res) => {
    const { userId, role, ...updates } = req.body;
    try {
      const updated = dbInstance.updateOrder(userId || 'system', req.params.id, updates, role || 'SYSTEM');
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Upload actions (Simulated upload since we store locally/base64 or placeholders)
  app.post('/api/orders/:id/upload-payment', (req, res) => {
    const { paymentProof } = req.body;
    if (!paymentProof) return res.status(400).json({ error: 'Payment proof is required' });
    
    try {
      const updated = dbInstance.updateOrder('CUSTOMER', req.params.id, {
        paymentProof,
        status: OrderStatus.WAITING_PAYMENT_VERIFICATION
      }, 'SYSTEM');
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/orders/:id/upload-delivery', (req, res) => {
    const { deliveryProof, userId } = req.body;
    if (!deliveryProof) return res.status(400).json({ error: 'Delivery proof is required' });
    
    try {
      const updated = dbInstance.updateOrder(userId || 'driver', req.params.id, {
        deliveryProof,
        status: OrderStatus.COMPLETED
      }, 'DRIVER');
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Settlements
  app.get('/api/settlements', (req, res) => {
    res.json(dbInstance.getSettlements());
  });

  app.get('/api/merchants/:merchantId/settlements', (req, res) => {
    res.json(dbInstance.getSettlementsByMerchant(req.params.merchantId));
  });

  app.post('/api/settlements/generate', (req, res) => {
    const { userId } = req.body;
    try {
      const created = dbInstance.generateHPlusOneSettlements(userId || 'admin');
      res.json({ count: created.length, settlements: created });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/settlements/:id/confirm', (req, res) => {
    const { userId } = req.body;
    try {
      const confirmed = dbInstance.confirmSettlement(userId || 'admin', req.params.id);
      res.json(confirmed);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Licenses API Endpoints
  app.get('/api/licenses', (req, res) => {
    res.json(dbInstance.getLicenses());
  });

  app.post('/api/licenses', (req, res) => {
    const { userId, key, durationDays } = req.body;
    try {
      const created = dbInstance.createLicense(userId || 'admin', key, Number(durationDays || 30));
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/merchants/:id/redeem-license', (req, res) => {
    const { key } = req.body;
    try {
      const updatedMerchant = dbInstance.redeemLicense(req.params.id, key);
      res.json(updatedMerchant);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // System logs
  app.get('/api/logs', (req, res) => {
    res.json(dbInstance.getLogs());
  });

  // Vite middleware for development (fallback to dev if dist folder doesn't exist)
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

  if (process.env.NODE_ENV !== 'production' || !hasDist) {
    console.log('Starting Vite development server middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('Serving production static files from dist...');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tumpang Food Server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}
