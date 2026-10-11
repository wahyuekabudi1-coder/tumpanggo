/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Administrative Routes
 * Manages system parameters, partner onboarding, payouts, and licenses.
 */

import { Router, Request, Response } from 'express';
import { foodDb } from '../db.ts';
import { requireRole } from '../auth.ts';

export const adminRouter = Router();

// --- SYSTEM CONFIG ---
adminRouter.get('/config', (req: Request, res: Response) => {
  res.json(foodDb.getConfig());
});

adminRouter.put('/config', (req: Request, res: Response) => {
  const { userId, ...updates } = req.body;
  try {
    const config = foodDb.updateConfig(userId || 'admin', updates);
    res.json(config);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- PARTNER REGISTRATIONS ---
adminRouter.get('/partner-registrations', (req: Request, res: Response) => {
  res.json(foodDb.getPartnerRegistrations());
});

adminRouter.post('/partner-registrations', (req: Request, res: Response) => {
  try {
    const created = foodDb.createPartnerRegistration(req.body);
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

adminRouter.put('/partner-registrations/:id/approve', (req: Request, res: Response) => {
  const { userId } = req.body;
  const result = foodDb.approvePartnerRegistration(userId || 'admin', req.params.id);
  if (result.success) {
    res.json({ success: true, registration: result.registration });
  } else {
    res.status(400).json({ error: result.error });
  }
});

adminRouter.post('/partner-registrations/:id/reject', (req: Request, res: Response) => {
  const { userId } = req.body;
  const success = foodDb.rejectPartnerRegistration(userId || 'admin', req.params.id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Registration not found' });
  }
});

// --- SETTLEMENTS ---
adminRouter.get('/settlements', (req: Request, res: Response) => {
  res.json(foodDb.getSettlements());
});

// Direct settlement creation from Admin UI
adminRouter.post('/settlements', (req: Request, res: Response) => {
  const { userId, ...settlementData } = req.body;
  try {
    const created = foodDb.createSettlement(userId || 'admin', settlementData);
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

adminRouter.put('/settlements/:id', (req: Request, res: Response) => {
  const { userId, ...updates } = req.body;
  try {
    const updated = foodDb.updateSettlement(userId || 'admin', req.params.id, updates);
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

adminRouter.post('/settlements/generate', (req: Request, res: Response) => {
  const { userId } = req.body;
  try {
    const created = foodDb.generateHPlusOneSettlements(userId || 'admin');
    res.json({ count: created.length, settlements: created });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

adminRouter.post('/settlements/:id/confirm', (req: Request, res: Response) => {
  const { userId } = req.body;
  try {
    const confirmed = foodDb.confirmSettlement(userId || 'admin', req.params.id);
    res.json(confirmed);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// --- LICENSES ---
adminRouter.get('/licenses', (req: Request, res: Response) => {
  res.json(foodDb.getLicenses());
});

adminRouter.post('/licenses', (req: Request, res: Response) => {
  const { userId, key, durationDays } = req.body;
  try {
    const created = foodDb.createLicense(userId || 'admin', key, Number(durationDays || 30));
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// --- LOGS ---
adminRouter.get('/logs', (req: Request, res: Response) => {
  res.json(foodDb.getLogs());
});
