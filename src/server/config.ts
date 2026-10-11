/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Configuration Module
 * Isolates runtime environment variables, database identifiers, and system defaults.
 */

import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Determine runtime JWT Secret
let runtimeJwtSecret = process.env.FOOD_AUTH_SECRET;
if (process.env.NODE_ENV === 'production') {
  if (!runtimeJwtSecret || runtimeJwtSecret.trim().length < 32) {
    throw new Error('[TumpangFood Security] Variabel lingkungan FOOD_AUTH_SECRET wajib disetel dan memiliki minimal 32 karakter pada lingkungan produksi.');
  }
} else {
  // In development, if secret is not set, generate a cryptographic random secret
  if (!runtimeJwtSecret) {
    runtimeJwtSecret = crypto.randomBytes(32).toString('hex');
  }
}

// Serverless / Vercel filesystem adaptation
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const localDbFile = isServerless 
  ? path.join('/tmp', 'tumpang_food_db.json')
  : path.join(process.cwd(), 'tumpang_food_db.json');

// Security & Authentication Configuration
let runtimeAdminPassword = process.env.FOOD_ADMIN_PASSWORD;
let runtimeAdminEmail = process.env.FOOD_ADMIN_EMAIL;

if (process.env.NODE_ENV === 'production') {
  if (!runtimeAdminPassword || runtimeAdminPassword.trim().length < 8) {
    throw new Error('[TumpangFood Security] Variabel lingkungan FOOD_ADMIN_PASSWORD wajib disetel dengan minimal 8 karakter pada lingkungan produksi.');
  }
  if (!runtimeAdminEmail || !runtimeAdminEmail.includes('@')) {
    throw new Error('[TumpangFood Security] Variabel lingkungan FOOD_ADMIN_EMAIL wajib disetel dengan alamat email sah pada lingkungan produksi.');
  }
} else {
  if (!runtimeAdminPassword) {
    runtimeAdminPassword = 'TumpangGoAdmin#2026';
  }
  if (!runtimeAdminEmail) {
    runtimeAdminEmail = 'tumpanggo@gmail.com';
  }
}

export const foodConfig = {
  // Server port
  port: parseInt(process.env.PORT || process.env.FOOD_PORT || '3000', 10),
  host: '0.0.0.0',
  isServerless,

  // Database settings
  databaseId: process.env.FOOD_DATABASE_ID || 'ai-studio-tumpangfood-99caef89-a69c-4fe1-80be-2c79f3dcb85c',
  localDbFile,
  legacyDbFile: path.join(process.cwd(), 'tumpang_db.json'),
  
  // Security & Authentication
  jwtSecret: runtimeJwtSecret,
  adminEmail: runtimeAdminEmail.toLowerCase(),
  adminPassword: runtimeAdminPassword,
  
  // System operational defaults
  defaults: {
    serviceFee: 2000,
    deliveryFeePerKm: 1500,
    defaultDeliveryFee: 5000,
    commissionPercent: 10,
    paymentExpiryMinutes: 10,
    qrisImage: 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
  }
};
