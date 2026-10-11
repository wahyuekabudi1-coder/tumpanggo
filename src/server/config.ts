/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Configuration Module
 * Isolates runtime environment variables, database identifiers, and system defaults.
 */

import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const foodConfig = {
  // Server port
  port: parseInt(process.env.PORT || process.env.FOOD_PORT || '3000', 10),
  host: '0.0.0.0',

  // Database settings
  databaseId: process.env.FOOD_DATABASE_ID || 'ai-studio-tumpangfood-99caef89-a69c-4fe1-80be-2c79f3dcb85c',
  localDbFile: path.join(process.cwd(), 'tumpang_food_db.json'),
  legacyDbFile: path.join(process.cwd(), 'tumpang_db.json'),
  
  // Security & Authentication
  jwtSecret: process.env.FOOD_AUTH_SECRET || 'tumpanggo_food_secure_jwt_token_secret_key_2026',
  adminEmail: (process.env.FOOD_ADMIN_EMAIL || 'tumpanggo@gmail.com').toLowerCase(),
  adminPassword: process.env.FOOD_ADMIN_PASSWORD || 'admin',
  
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
