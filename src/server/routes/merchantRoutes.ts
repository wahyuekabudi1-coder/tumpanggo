/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Merchant Routes
 * Manages merchant profiles, menu catalogs, orders, and license redemptions.
 */

import { Router, Request, Response } from 'express';
import { foodDb } from '../db.ts';
import { requireRole, requireMerchantOwner } from '../auth.ts';

export const merchantRouter = Router();

// --- MERCHANT PROFILES ---
merchantRouter.get('/', (req: Request, res: Response) => {
  res.json(foodDb.getMerchants());
});

merchantRouter.get('/:id', (req: Request, res: Response) => {
  const m = foodDb.getMerchantById(req.params.id);
  if (!m) return res.status(404).json({ error: 'Merchant not found' });
  res.json(m);
});

merchantRouter.post('/', requireRole(['ADMIN']), (req: Request, res: Response) => {
  const { userId, ...merchantData } = req.body;
  try {
    const created = foodDb.createMerchant(userId || 'admin', merchantData);
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

merchantRouter.put('/:id', requireMerchantOwner('id'), (req: Request, res: Response) => {
  const { userId, role, ...updates } = req.body;
  try {
    const updated = foodDb.updateMerchant(userId || req.params.id, req.params.id, updates, role || 'MERCHANT');
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

merchantRouter.delete('/:id', requireRole(['ADMIN']), (req: Request, res: Response) => {
  const { userId } = req.body;
  const success = foodDb.deleteMerchant(userId || 'admin', req.params.id);
  if (success) res.json({ success: true });
  else res.status(404).json({ error: 'Merchant not found' });
});

// --- MENU CATEGORIES ---
merchantRouter.get('/:id/categories', (req: Request, res: Response) => {
  res.json(foodDb.getCategories(req.params.id));
});

merchantRouter.post('/:id/categories', requireMerchantOwner('id'), (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nama kategori wajib diisi.' });
  }
  try {
    const created = foodDb.createCategory(req.params.id, name.trim());
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

merchantRouter.put('/:merchantId/categories/:id', requireMerchantOwner('merchantId'), (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nama kategori wajib diisi.' });
  }
  try {
    const updated = foodDb.updateCategory(req.params.merchantId, req.params.id, name.trim());
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

merchantRouter.delete('/:merchantId/categories/:id', requireMerchantOwner('merchantId'), (req: Request, res: Response) => {
  const success = foodDb.deleteCategory(req.params.merchantId, req.params.id);
  if (success) res.json({ success: true });
  else res.status(404).json({ error: 'Category not found' });
});

// --- MENU ITEMS ---
merchantRouter.get('/:id/menu', (req: Request, res: Response) => {
  res.json(foodDb.getMenuItemsByMerchant(req.params.id));
});

merchantRouter.post('/:id/menu', requireMerchantOwner('id'), (req: Request, res: Response) => {
  try {
    const created = foodDb.createMenuItem(req.params.id, req.body);
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

merchantRouter.put('/:merchantId/menu/:id', requireMerchantOwner('merchantId'), (req: Request, res: Response) => {
  try {
    const updated = foodDb.updateMenuItem(req.params.merchantId, req.params.id, req.body);
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

merchantRouter.delete('/:merchantId/menu/:id', requireMerchantOwner('merchantId'), (req: Request, res: Response) => {
  const success = foodDb.deleteMenuItem(req.params.merchantId, req.params.id);
  if (success) res.json({ success: true });
  else res.status(404).json({ error: 'Menu item not found' });
});

// --- ORDERS & SETTLEMENTS ---
merchantRouter.get('/:merchantId/orders', (req: Request, res: Response) => {
  res.json(foodDb.getOrdersByMerchant(req.params.merchantId));
});

merchantRouter.get('/:merchantId/settlements', (req: Request, res: Response) => {
  res.json(foodDb.getSettlementsByMerchant(req.params.merchantId));
});

// --- LICENSE REDEMPTION ---
merchantRouter.post('/:id/redeem-license', requireMerchantOwner('id'), (req: Request, res: Response) => {
  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ error: 'Kode lisensi wajib diisi.' });
  }
  try {
    const updatedMerchant = foodDb.redeemLicense(req.params.id, key);
    res.json(updatedMerchant);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
