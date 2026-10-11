/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Order Routes
 * Handles order placements, recalculations, driver assignments, and payment proofs.
 */

import { Router, Request, Response } from 'express';
import { foodDb } from '../db.ts';
import { OrderStatus } from '../../types.ts';
import { requireRole } from '../auth.ts';

export const orderRouter = Router();

orderRouter.get('/', (req: Request, res: Response) => {
  res.json(foodDb.getOrders());
});

orderRouter.get('/:id', (req: Request, res: Response) => {
  const o = foodDb.getOrderById(req.params.id);
  if (!o) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  res.json(o);
});

orderRouter.get('/customer/:phone', (req: Request, res: Response) => {
  res.json(foodDb.getOrdersByCustomerPhone(req.params.phone));
});

orderRouter.post('/', (req: Request, res: Response) => {
  try {
    const created = foodDb.createOrder(req.body);
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Gagal membuat pesanan.' });
  }
});

orderRouter.put('/:id', (req: Request, res: Response) => {
  const { userId, role, ...updates } = req.body;
  try {
    const updated = foodDb.updateOrder(
      userId || req.user?.userId || 'system',
      req.params.id,
      updates,
      role || req.user?.role || 'SYSTEM'
    );
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Admin manual driver assignment
orderRouter.post('/:id/assign-driver', (req: Request, res: Response) => {
  const { driverId, userId } = req.body;
  if (!driverId) {
    return res.status(400).json({ error: 'Driver ID wajib disertakan.' });
  }
  try {
    const updated = foodDb.manualAssignDriver(userId || 'admin', req.params.id, driverId);
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Customer payment proof upload
orderRouter.post('/:id/upload-payment', (req: Request, res: Response) => {
  const { paymentProof } = req.body;
  if (!paymentProof) {
    return res.status(400).json({ error: 'Bukti pembayaran wajib diunggah.' });
  }

  try {
    const updated = foodDb.updateOrder(
      'CUSTOMER',
      req.params.id,
      {
        paymentProof,
        status: OrderStatus.WAITING_PAYMENT_VERIFICATION
      },
      'CUSTOMER'
    );
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Driver delivery proof upload
orderRouter.post('/:id/upload-delivery', (req: Request, res: Response) => {
  const { deliveryProof, userId } = req.body;
  if (!deliveryProof) {
    return res.status(400).json({ error: 'Bukti foto pengantaran wajib disertakan.' });
  }

  try {
    const updated = foodDb.updateOrder(
      userId || 'driver',
      req.params.id,
      {
        deliveryProof,
        status: OrderStatus.COMPLETED
      },
      'DRIVER'
    );
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
