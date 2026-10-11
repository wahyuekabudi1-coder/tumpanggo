/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Firebase Admin SDK Module
 * Server-side trusted administrative database client.
 * Implements IAM credential loading, custom database targeting, and atomic transactions.
 */

import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore, Transaction } from 'firebase-admin/firestore';
import { foodConfig } from './config.ts';

let adminApp: App | null = null;
let adminDb: Firestore | null = null;
let isConfiguredWithServiceAccount = false;

// Helper to remove undefined fields recursively for Firestore compatibility
export function removeUndefinedFields(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefinedFields);
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      cleaned[key] = removeUndefinedFields(val);
    }
  }
  return cleaned;
}

try {
  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT;
  
  // Try loading projectId from firebase-applet-config.json if not present in env
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (!projectId && fs.existsSync(configPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (raw.projectId) {
        projectId = raw.projectId;
      }
    } catch {
      // Ignore
    }
  }

  projectId = projectId || 'gen-lang-client-0238078208';

  // Check for server-side service account credentials via environment variables
  // Never expose or hardcode private keys in source code!
  const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  let credentialOption: any = undefined;

  if (serviceAccountEnv && serviceAccountEnv.trim().length > 0) {
    try {
      let rawJson = serviceAccountEnv.trim();
      // Support base64-encoded JSON or direct JSON string
      if (rawJson.startsWith('{')) {
        const parsed = JSON.parse(rawJson);
        credentialOption = cert(parsed);
        if (parsed.project_id) {
          projectId = parsed.project_id;
        }
      } else {
        const decoded = Buffer.from(rawJson, 'base64').toString('utf-8');
        const parsed = JSON.parse(decoded);
        credentialOption = cert(parsed);
        if (parsed.project_id) {
          projectId = parsed.project_id;
        }
      }
      isConfiguredWithServiceAccount = true;
      console.log('[TumpangFood Admin] Loaded server-side Service Account credentials from environment.');
    } catch (err: any) {
      console.error('[TumpangFood Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', err.message);
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    isConfiguredWithServiceAccount = true;
    console.log('[TumpangFood Admin] Using GOOGLE_APPLICATION_CREDENTIALS path.');
  }

  if (getApps().length === 0) {
    const initOptions: any = { projectId };
    if (credentialOption) {
      initOptions.credential = credentialOption;
    }
    adminApp = initializeApp(initOptions);
  } else {
    adminApp = getApps()[0];
  }

  // Initialize Firestore targeting the dedicated isolated database ID
  adminDb = getFirestore(adminApp, foodConfig.databaseId);
  console.log(`[TumpangFood Admin] Firebase Admin SDK initialized for database "${foodConfig.databaseId}" on project "${projectId}".`);
} catch (e: any) {
  console.error('[TumpangFood Admin] Failed to initialize Firebase Admin SDK:', e.message);
  adminApp = null;
  adminDb = null;
}

export function getAdminDb(): Firestore | null {
  return adminDb;
}

export function isFirestoreAdminConfigured(): boolean {
  return adminDb !== null;
}

export function isUsingServiceAccount(): boolean {
  return isConfiguredWithServiceAccount;
}

/**
 * Safe administrative setDoc write. Bypasses client Firestore Security Rules.
 */
export async function safeAdminSetDoc(collectionName: string, docId: string, data: any): Promise<boolean> {
  if (!adminDb) return false;
  try {
    const cleaned = removeUndefinedFields(data);
    await adminDb.collection(collectionName).doc(docId).set(cleaned, { merge: true });
    return true;
  } catch (err: any) {
    console.warn(`[TumpangFood Admin] safeAdminSetDoc failed for ${collectionName}/${docId}:`, err.message);
    return false;
  }
}

/**
 * Safe administrative deleteDoc write.
 */
export async function safeAdminDeleteDoc(collectionName: string, docId: string): Promise<boolean> {
  if (!adminDb) return false;
  try {
    await adminDb.collection(collectionName).doc(docId).delete();
    return true;
  } catch (err: any) {
    console.warn(`[TumpangFood Admin] safeAdminDeleteDoc failed for ${collectionName}/${docId}:`, err.message);
    return false;
  }
}

/**
 * Safe administrative getDoc read.
 */
export async function safeAdminGetDoc(collectionName: string, docId: string): Promise<any | null> {
  if (!adminDb) return null;
  try {
    const snap = await adminDb.collection(collectionName).doc(docId).get();
    if (snap.exists) {
      return snap.data();
    }
    return null;
  } catch (err: any) {
    console.warn(`[TumpangFood Admin] safeAdminGetDoc failed for ${collectionName}/${docId}:`, err.message);
    return null;
  }
}

/**
 * Safe administrative getDocs read across collection.
 */
export async function safeAdminGetDocs(collectionName: string): Promise<any[]> {
  if (!adminDb) return [];
  try {
    const snap = await adminDb.collection(collectionName).get();
    return snap.docs.map(doc => doc.data());
  } catch (err: any) {
    console.warn(`[TumpangFood Admin] safeAdminGetDocs failed for ${collectionName}:`, err.message);
    return [];
  }
}

/**
 * Executes a distributed atomic ACID transaction on Firestore Admin.
 */
export async function runAdminTransaction<T>(
  updateFunction: (transaction: Transaction) => Promise<T>
): Promise<T> {
  if (!adminDb) {
    throw new Error('Firebase Admin Firestore instance is not initialized.');
  }
  return await adminDb.runTransaction(updateFunction);
}
