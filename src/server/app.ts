/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Express Application
 * Decoupled and modular backend application assembly.
 */

import express from 'express';
import { foodDb } from './db.ts';
import { foodConfig } from './config.ts';
import { isFirestoreAdminConfigured, isUsingServiceAccount } from './firebaseAdmin.ts';
import { authenticateToken } from './auth.ts';
import { authRouter } from './routes/authRoutes.ts';
import { merchantRouter } from './routes/merchantRoutes.ts';
import { driverRouter } from './routes/driverRoutes.ts';
import { orderRouter } from './routes/orderRoutes.ts';
import { adminRouter } from './routes/adminRoutes.ts';

export const app = express();

// Global body parsers (limit 15mb for base64 image uploads)
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Lazy asynchronous database synchronization middleware for Serverless & Cold-Starts
app.use(async (req, res, next) => {
  try {
    await foodDb.ensureInitialized();
  } catch {
    // Continue with resilient local snapshot
  }
  next();
});

// Attach user authentication from tokens or headers
app.use(authenticateToken);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'tumpang-food',
    database: {
      isolatedDatabaseId: foodConfig.databaseId,
      firebaseAdminConfigured: isFirestoreAdminConfigured(),
      usingServiceAccount: isUsingServiceAccount()
    },
    timestamp: new Date().toISOString()
  });
});

// Mount decoupled routers
app.use('/api', authRouter);
app.use('/api/merchants', merchantRouter);
app.use('/api/drivers', driverRouter);
app.use('/api/orders', orderRouter);
app.use('/api', adminRouter);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[TumpangFood Server Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Terjadi kesalahan internal pada server Tumpang Food.'
  });
});
