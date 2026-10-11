/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Driver Routes
 * Handles courier profile operations, status toggles, and delivery assignments.
 */

import { Router, Request, Response } from 'express';
import { foodDb } from '../db.ts';
import { requireRole } from '../auth.ts';

export const driverRouter = Router();

driverRouter.get('/', (req: Request, res: Response) => {
  res.json(foodDb.getDrivers());
});

driverRouter.get('/:id', (req: Request, res: Response) => {
  const d = foodDb.getDriverById(req.params.id);
  if (!d) return res.status(404).json({ error: 'Driver not found' });
  res.json(d);
});

driverRouter.post('/', requireRole(['ADMIN']), (req: Request, res: Response) => {
  const { userId, ...driverData } = req.body;
  try {
    const created = foodDb.createDriver(userId || 'admin', driverData);
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

driverRouter.put('/:id', (req: Request, res: Response) => {
  const { userId, role, ...updates } = req.body;
  try {
    const updated = foodDb.updateDriver(userId || req.params.id, req.params.id, updates, role || 'DRIVER');
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

driverRouter.delete('/:id', requireRole(['ADMIN']), (req: Request, res: Response) => {
  const { userId } = req.body;
  const success = foodDb.deleteDriver(userId || 'admin', req.params.id);
  if (success) res.json({ success: true });
  else res.status(404).json({ error: 'Driver not found' });
});

driverRouter.get('/:driverId/orders', (req: Request, res: Response) => {
  res.json(foodDb.getOrdersByDriver(req.params.driverId));
});
