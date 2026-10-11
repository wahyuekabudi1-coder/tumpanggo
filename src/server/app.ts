/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Express Application
 * Decoupled and modular backend application assembly.
 */

import express from 'express';
import { foodDb } from './db';
import { foodConfig } from './config';
import { isFirestoreAdminConfigured, isUsingServiceAccount, testFirestoreConnection } from './firebaseAdmin';
import { authenticateToken } from './auth';
import { authRouter } from './routes/authRoutes';
import { merchantRouter } from './routes/merchantRoutes';
import { driverRouter } from './routes/driverRoutes';
import { orderRouter } from './routes/orderRoutes';
import { adminRouter } from './routes/adminRoutes';

export const app = express();

// Global body parsers (limit 15mb for base64 image uploads)
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Lazy asynchronous database synchronization middleware for Serverless & Cold-Starts
app.use(async (req, res, next) => {
  try {
    await foodDb.ensureInitialized();
  } catch (err: any) {
    if (foodConfig.isProduction && req.path.startsWith('/api') && !req.path.startsWith('/api/health')) {
      return res.status(503).json({
        error: '[Produksi] Firestore Cloud tidak terhubung atau mengalami kegagalan otentikasi. Mode produksi menolak fallback ke data JSON lokal demi menjaga integritas data.',
        detail: err.message
      });
    }
  }
  next();
});

// Attach user authentication from tokens or headers
app.use(authenticateToken);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const storageStatus = await foodDb.getStorageStatus();
  const isHealthy = storageStatus.liveCloudConnected;
  const isProd = foodConfig.isProduction;

  res.status(isProd && !isHealthy ? 503 : 200).json({
    status: isHealthy ? 'healthy' : (isProd ? 'degraded_disconnected_from_cloud' : 'ok_development_resilient_mode'),
    system: 'tumpang-food',
    environment: process.env.NODE_ENV || 'development',
    database: storageStatus,
    timestamp: new Date().toISOString()
  });
});

// Dedicated Firestore Connection Probe endpoint for on-demand validation
app.get('/api/health/firestore-probe', async (req, res) => {
  const probe = await testFirestoreConnection();
  res.status(probe.connected ? 200 : 503).json({
    system: 'tumpang-food',
    probeOrigin: 'Dedicated Admin SDK Diagnostic Probe',
    result: probe,
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
