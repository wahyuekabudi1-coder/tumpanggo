/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Administrative Routes
 * Manages system parameters, partner onboarding, payouts, and licenses.
 * Strictly protected with Admin-only RBAC middleware.
 */

import { Router, Request, Response } from 'express';
import { foodDb } from '../db.ts';
import { requireRole } from '../auth.ts';

export const adminRouter = Router();

// --- SYSTEM CONFIG ---
// Public read for customer fee calculations and QRIS display
adminRouter.get('/config', (req: Request, res: Response) => {
  res.json(foodDb.getConfig());
});

adminRouter.put('/config', requireRole(['ADMIN']), (req: Request, res: Response) => {
  const { userId, ...updates } = req.body;
  try {
    const config = foodDb.updateConfig(req.user?.userId || userId || 'admin', updates);
    res.json(config);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- PARTNER REGISTRATIONS ---
adminRouter.get('/partner-registrations', requireRole(['ADMIN']), (req: Request, res: Response) => {
  res.json(foodDb.getPartnerRegistrations());
});

// Public application submission
adminRouter.post('/partner-registrations', (req: Request, res: Response) => {
  try {
    const created = foodDb.createPartnerRegistration(req.body);
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

adminRouter.put('/partner-registrations/:id/approve', requireRole(['ADMIN']), (req: Request, res: Response) => {
  const { userId } = req.body;
  const result = foodDb.approvePartnerRegistration(req.user?.userId || userId || 'admin', req.params.id);
  if (result.success) {
    res.json({ success: true, registration: result.registration });
  } else {
    res.status(400).json({ error: result.error });
  }
});

adminRouter.post('/partner-registrations/:id/reject', requireRole(['ADMIN']), (req: Request, res: Response) => {
  const { userId } = req.body;
  const success = foodDb.rejectPartnerRegistration(req.user?.userId || userId || 'admin', req.params.id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Registration not found' });
  }
});

// --- SETTLEMENTS (Admin Only) ---
adminRouter.get('/settlements', requireRole(['ADMIN']), (req: Request, res: Response) => {
  res.json(foodDb.getSettlements());
});

adminRouter.post('/settlements', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const settlementData = req.body;
  try {
    const actorId = req.user?.userId || 'admin';
    const created = await foodDb.createSettlement(actorId, settlementData);
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

adminRouter.put('/settlements/:id', requireRole(['ADMIN']), (req: Request, res: Response) => {
  const updates = req.body;
  try {
    const actorId = req.user?.userId || 'admin';
    const updated = foodDb.updateSettlement(actorId, req.params.id, updates);
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

adminRouter.post('/settlements/generate', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const actorId = req.user?.userId || 'admin';
    const created = await foodDb.generateHPlusOneSettlements(actorId);
    res.json({ count: created.length, settlements: created });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

adminRouter.post('/settlements/:id/confirm', requireRole(['ADMIN']), (req: Request, res: Response) => {
  try {
    const actorId = req.user?.userId || 'admin';
    const confirmed = foodDb.confirmSettlement(actorId, req.params.id);
    res.json(confirmed);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// --- CONTRACT LICENSES (Admin Only) ---
adminRouter.get('/licenses', requireRole(['ADMIN']), (req: Request, res: Response) => {
  res.json(foodDb.getLicenses());
});

adminRouter.post('/licenses', requireRole(['ADMIN']), (req: Request, res: Response) => {
  const { userId, key, durationDays } = req.body;
  try {
    const created = foodDb.createLicense(req.user?.userId || userId || 'admin', key, Number(durationDays || 30));
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// --- AUDIT LOGS (Admin Only) ---
adminRouter.get('/logs', requireRole(['ADMIN']), (req: Request, res: Response) => {
  res.json(foodDb.getLogs());
});
