/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Vercel Serverless Function Entry Point for Tumpang Food API
 * Directly exports the Express application without Vite or development server dependencies.
 */

import { app } from '../src/server/app';

export default app;
