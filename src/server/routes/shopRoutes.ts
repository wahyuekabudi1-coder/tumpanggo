/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop Dedicated API Router
 * Handles catalog browsing, order placement, and strictly isolated Shop Admin operations.
 */

import { Router, Request, Response } from 'express';
import { shopDb } from '../shopDb';
import { shopConfig } from '../config';
import { createShopAuthToken, requireShopAdmin } from '../auth';
import { ShopOrderStatus } from '../../types/shop';

export const shopRouter = Router();

// ==========================================
// 1. SHOP AUTHENTICATION (ISOLATED ADMIN)
// ==========================================

/**
 * POST /api/shop/auth/login
 * Authenticates Shop Administrator using dedicated credentials.
 * Does not accept Food Admin credentials.
 */
shopRouter.post('/auth/login', (req: Request, res: Response) => {
  const { username, email, password } = req.body;
  const targetUser = (username || email || '').trim().toLowerCase();
  const targetPass = (password || '').trim();

  if (!targetUser || !targetPass) {
    return res.status(400).json({ error: 'Email dan kata sandi wajib diisi.' });
  }

  const isMatchingEmail = targetUser === shopConfig.adminEmail || targetUser === 'shopadmin';
  const isMatchingPassword = targetPass === shopConfig.adminPassword;

  if (!isMatchingEmail || !isMatchingPassword) {
    return res.status(401).json({ 
      error: 'Kredensial Administrator Tumpang Shop salah. Pastikan menggunakan akun khusus Tumpang Shop.' 
    });
  }

  const token = createShopAuthToken({
    userId: 'shop_admin_master',
    role: 'SHOP_ADMIN',
    email: targetUser,
    scope: 'shop'
  });

  shopDb.logAudit('SHOP_ADMIN_LOGIN', `Admin ${targetUser} berhasil login ke portal Shop`, 'shop_admin_master');

  return res.json({
    token,
    role: 'SHOP_ADMIN',
    user: {
      id: 'shop_admin_master',
      name: 'Administrator Tumpang Shop',
      email: shopConfig.adminEmail
    }
  });
});

/**
 * GET /api/shop/auth/me
 * Checks token validity for Shop Admin
 */
shopRouter.get('/auth/me', requireShopAdmin, (req: Request, res: Response) => {
  return res.json({
    user: req.user,
    store: shopDb.getConfig().storeName
  });
});

// ==========================================
// 2. PUBLIC / CUSTOMER BROWSING & CONFIG
// ==========================================

/**
 * GET /api/shop/config
 * Retrieves store settings, operational hours, fees, and QRIS
 */
shopRouter.get('/config', (req: Request, res: Response) => {
  try {
    res.json(shopDb.getConfig());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/shop/categories
 * Retrieves active category list
 */
shopRouter.get('/categories', (req: Request, res: Response) => {
  try {
    const categories = shopDb.getCategories().filter(c => c.isActive);
    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/shop/products
 * Retrieves products with optional filters: ?category=slug_or_id & ?search=query
 */
shopRouter.get('/products', (req: Request, res: Response) => {
  try {
    const categoryParam = req.query.category as string | undefined;
    const searchParam = req.query.search as string | undefined;

    let categoryId = categoryParam;
    if (categoryParam && categoryParam !== 'all') {
      const matchSlug = shopDb.getCategories().find(c => c.slug === categoryParam || c.id === categoryParam);
      if (matchSlug) {
        categoryId = matchSlug.id;
      }
    }

    const products = shopDb.getProducts({
      categoryId,
      activeOnly: true,
      search: searchParam
    });

    res.json(products);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/shop/products/:id
 * Retrieves product details
 */
shopRouter.get('/products/:id', (req: Request, res: Response) => {
  try {
    const product = shopDb.getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Produk tidak ditemukan.' });
    }
    res.json(product);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. CUSTOMER ORDERS & TRACKING
// ==========================================

/**
 * POST /api/shop/orders
 * Places a customer shop order with server-side price and stock validation
 */
shopRouter.post('/orders', async (req: Request, res: Response) => {
  try {
    const newOrder = await shopDb.createOrder(req.body);
    res.status(201).json(newOrder);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Gagal membuat pesanan belanja.' });
  }
});

/**
 * GET /api/shop/orders/track/:id
 * Tracks an order status and payment verification.
 * PRIVACY GUARD: Requires phone query parameter (?phone=...) matching the order to prevent data leak.
 */
shopRouter.get('/orders/track/:id', (req: Request, res: Response) => {
  try {
    const phone = req.query.phone as string | undefined;
    if (!phone || phone.trim().length === 0) {
      return res.status(403).json({ 
        error: 'Untuk perlindungan privasi data pelanggan, nomor WhatsApp penerima wajib disertakan (?phone=...).' 
      });
    }

    const order = shopDb.getOrderByNumberAndPhone(req.params.id, phone.trim());
    if (!order) {
      return res.status(404).json({ 
        error: 'Pesanan tidak ditemukan atau nomor WhatsApp tidak sesuai dengan data pemesan.' 
      });
    }

    res.json(order);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shop/orders/lookup
 * Form-friendly lookup endpoint using both orderNumber and customerPhone.
 */
shopRouter.post('/orders/lookup', (req: Request, res: Response) => {
  try {
    const { orderNumber, customerPhone } = req.body;
    if (!orderNumber || !customerPhone) {
      return res.status(400).json({ 
        error: 'Nomor pesanan dan nomor WhatsApp wajib diisi.' 
      });
    }

    const order = shopDb.getOrderByNumberAndPhone(String(orderNumber).trim(), String(customerPhone).trim());
    if (!order) {
      return res.status(404).json({ 
        error: 'Pesanan tidak ditemukan atau nomor WhatsApp tidak cocok dengan nomor pesanan.' 
      });
    }

    res.json(order);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/shop/orders/customer/:phone
 * Retrieves past orders for customer by phone number
 */
shopRouter.get('/orders/customer/:phone', (req: Request, res: Response) => {
  try {
    const phone = req.params.phone;
    if (!phone || phone.trim().length < 8) {
      return res.status(400).json({ error: 'Nomor telepon tidak valid.' });
    }
    const orders = shopDb.getOrdersByCustomerPhone(phone.trim());
    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shop/orders/:id/payment-proof
 * Submits payment proof for verification
 */
shopRouter.post('/orders/:id/payment-proof', async (req: Request, res: Response) => {
  const { paymentProof, customerPhone } = req.body;
  if (!paymentProof || typeof paymentProof !== 'string' || paymentProof.trim().length === 0) {
    return res.status(400).json({ error: 'Bukti transfer pembayaran wajib dilampirkan.' });
  }

  try {
    // If customerPhone is supplied, verify ownership
    if (customerPhone) {
      const existing = shopDb.getOrderByNumberAndPhone(req.params.id, customerPhone);
      if (!existing) {
        return res.status(403).json({ error: 'Verifikasi nomor WhatsApp gagal untuk pesanan ini.' });
      }
    }

    const updated = await shopDb.uploadPaymentProof(req.params.id, paymentProof.trim());
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Gagal mengunggah bukti pembayaran.' });
  }
});

// ==========================================
// 4. PROTECTED SHOP ADMIN MANAGEMENT (requireShopAdmin)
// ==========================================

/**
 * PUT /api/shop/config
 * Updates store configuration
 */
shopRouter.put('/config', requireShopAdmin, async (req: Request, res: Response) => {
  try {
    const actor = req.user?.userId || 'shop_admin';
    const updated = await shopDb.updateConfig(actor, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/shop/admin/categories
 * Retrieves all categories including inactive ones
 */
shopRouter.get('/admin/categories', requireShopAdmin, (req: Request, res: Response) => {
  try {
    res.json(shopDb.getCategories());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shop/categories
 * Creates new category
 */
shopRouter.post('/categories', requireShopAdmin, async (req: Request, res: Response) => {
  try {
    const actor = req.user?.userId || 'shop_admin';
    const created = await shopDb.createCategory(actor, req.body);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/shop/categories/:id
 * Updates existing category
 */
shopRouter.put('/categories/:id', requireShopAdmin, async (req: Request, res: Response) => {
  try {
    const actor = req.user?.userId || 'shop_admin';
    const updated = await shopDb.updateCategory(actor, req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/shop/categories/:id
 * Deletes category
 */
shopRouter.delete('/categories/:id', requireShopAdmin, async (req: Request, res: Response) => {
  try {
    const actor = req.user?.userId || 'shop_admin';
    const success = await shopDb.deleteCategory(actor, req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Kategori tidak ditemukan.' });
    }
    res.json({ success: true, message: 'Kategori berhasil dihapus.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/shop/admin/products
 * Retrieves all products for admin view
 */
shopRouter.get('/admin/products', requireShopAdmin, (req: Request, res: Response) => {
  try {
    const categoryParam = req.query.category as string | undefined;
    const searchParam = req.query.search as string | undefined;
    const products = shopDb.getProducts({
      categoryId: categoryParam,
      activeOnly: false,
      search: searchParam
    });
    res.json(products);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shop/products
 * Creates new product
 */
shopRouter.post('/products', requireShopAdmin, async (req: Request, res: Response) => {
  try {
    const actor = req.user?.userId || 'shop_admin';
    const created = await shopDb.createProduct(actor, req.body);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/shop/products/:id
 * Updates product
 */
shopRouter.put('/products/:id', requireShopAdmin, async (req: Request, res: Response) => {
  try {
    const actor = req.user?.userId || 'shop_admin';
    const updated = await shopDb.updateProduct(actor, req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/shop/products/:id
 * Deletes product
 */
shopRouter.delete('/products/:id', requireShopAdmin, async (req: Request, res: Response) => {
  try {
    const actor = req.user?.userId || 'shop_admin';
    const success = await shopDb.deleteProduct(actor, req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Produk tidak ditemukan.' });
    }
    res.json({ success: true, message: 'Produk berhasil dihapus.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/shop/orders
 * Lists all orders for shop admin
 */
shopRouter.get('/orders', requireShopAdmin, (req: Request, res: Response) => {
  try {
    const paymentStatus = req.query.paymentStatus as string | undefined;
    const orderStatus = req.query.orderStatus as string | undefined;
    const orders = shopDb.getOrders({ paymentStatus, orderStatus });
    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shop/orders/:id/verify-payment
 * Approves or rejects payment proof
 */
shopRouter.post('/orders/:id/verify-payment', requireShopAdmin, async (req: Request, res: Response) => {
  const { approved, reason } = req.body;
  if (typeof approved !== 'boolean') {
    return res.status(400).json({ error: 'Status persetujuan (approved: boolean) wajib disertakan.' });
  }

  try {
    const actor = req.user?.userId || 'shop_admin';
    const updated = await shopDb.verifyPayment(actor, req.params.id, approved, reason);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PATCH /api/shop/orders/:id/status
 * Updates order processing status (NEW, PROCESSING, PACKED, SHIPPED, COMPLETED, CANCELLED)
 */
shopRouter.patch('/orders/:id/status', requireShopAdmin, async (req: Request, res: Response) => {
  const { status, reason } = req.body;
  if (!status || !Object.values(ShopOrderStatus).includes(status)) {
    return res.status(400).json({ 
      error: `Status pesanan tidak valid. Pilihan: ${Object.values(ShopOrderStatus).join(', ')}` 
    });
  }

  try {
    const actor = req.user?.userId || 'shop_admin';
    const updated = await shopDb.updateOrderStatus(actor, req.params.id, status as ShopOrderStatus, reason);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/shop/reports/summary
 * Returns overall store and transaction metrics
 */
shopRouter.get('/reports/summary', requireShopAdmin, (req: Request, res: Response) => {
  try {
    res.json(shopDb.getSummaryMetrics());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
