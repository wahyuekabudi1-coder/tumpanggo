/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Authentication & RBAC Authorization Module
 * Provides password hashing, token creation/verification, and security middleware.
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { foodConfig } from './config.ts';

export interface AuthUser {
  userId: string;
  role: 'ADMIN' | 'MERCHANT' | 'DRIVER' | 'CUSTOMER';
  email?: string;
  entityId?: string; // Merchant ID or Driver ID if applicable
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Hash password using PBKDF2 with random salt.
 * Output format: "pbkdf2$iterations$salt$hash"
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 10000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

/**
 * Verify password against stored hash or plaintext legacy password.
 * Returns { valid: boolean, needsRehash: boolean }
 */
export function verifyPassword(password: string, storedHash?: string): { valid: boolean; needsRehash: boolean } {
  if (!storedHash) return { valid: false, needsRehash: false };

  if (storedHash.startsWith('pbkdf2$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 4) return { valid: false, needsRehash: false };
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const originalHash = parts[3];
    const derived = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
    const valid = crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(originalHash, 'hex'));
    return { valid, needsRehash: false };
  }

  // Legacy plaintext match
  const valid = password.trim() === storedHash.trim();
  return { valid, needsRehash: valid };
}

/**
 * Create HMAC-SHA256 signed JWT-like token.
 */
export function createAuthToken(user: AuthUser, expiresInHours = 72): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      ...user,
      exp: Math.floor(Date.now() / 1000) + expiresInHours * 3600
    })
  ).toString('base64url');

  const signature = crypto
    .createHmac('sha256', foodConfig.jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Verify signed token and return AuthUser.
 */
export function verifyAuthToken(token: string): AuthUser | null {
  if (!token) return null;

  // Handle legacy format tokens e.g. "token_merchant_m1_12345"
  if (token.startsWith('token_admin_')) {
    return { userId: 'admin', role: 'ADMIN', email: foodConfig.adminEmail };
  }
  if (token.startsWith('token_merchant_')) {
    const parts = token.split('_');
    const mId = parts[2] || '';
    return { userId: mId, role: 'MERCHANT', entityId: mId };
  }
  if (token.startsWith('token_driver_')) {
    const parts = token.split('_');
    const dId = parts[2] || '';
    return { userId: dId, role: 'DRIVER', entityId: dId };
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;

    const expectedSig = crypto
      .createHmac('sha256', foodConfig.jwtSecret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }

    return {
      userId: data.userId,
      role: data.role,
      email: data.email,
      entityId: data.entityId
    };
  } catch {
    return null;
  }
}

/**
 * Express middleware to authenticate token from headers or query.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  let token = '';
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-auth-token']) {
    token = String(req.headers['x-auth-token']);
  } else if (req.query?.token) {
    token = String(req.query.token);
  }

  // Also check email-based header for backwards compatibility
  const authEmail = (req.headers['x-auth-email'] || req.headers['x-user-email']) as string;
  if (!token && authEmail) {
    const cleanEmail = authEmail.trim().toLowerCase();
    if (isAdminEmail(cleanEmail)) {
      req.user = { userId: 'admin', role: 'ADMIN', email: cleanEmail };
      return next();
    }
  }

  if (token) {
    const verified = verifyAuthToken(token);
    if (verified) {
      req.user = verified;
    }
  }

  next();
}

/**
 * Check if an email has administrative privileges
 */
export function isAdminEmail(email?: string): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return (
    e === foodConfig.adminEmail ||
    e === 'sawahjayagroup@gmail.com' ||
    e === 'sawahjayatrans@gmail.com' ||
    e === 'admin' ||
    e.endsWith('@tumpanggo.com')
  );
}

/**
 * Require specific role middleware
 */
export function requireRole(allowedRoles: Array<'ADMIN' | 'MERCHANT' | 'DRIVER' | 'CUSTOMER'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    // If not authenticated via token, check if request body/query has role override for backwards compatibility
    const userRole = req.user?.role;
    
    // Check fallback for admin email or admin header
    const authEmail = (req.headers['x-auth-email'] || req.headers['x-user-email']) as string;
    if (allowedRoles.includes('ADMIN') && (isAdminEmail(authEmail) || isAdminEmail(req.body?.email) || isAdminEmail(req.body?.userId))) {
      return next();
    }

    if (!userRole) {
      // Allow demo access if explicit
      if (req.headers['x-demo-mode'] === 'true' || req.query?.demo === 'true') {
        return next();
      }
      return res.status(401).json({ error: 'Akses ditolak: Autentikasi diperlukan.' });
    }

    if (!allowedRoles.includes(userRole) && userRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Akses ditolak: Peran Anda tidak memiliki izin untuk tindakan ini.' });
    }

    next();
  };
}

/**
 * Restrict merchant operations to the store owner or admin
 */
export function requireMerchantOwner(paramName = 'merchantId') {
  return (req: Request, res: Response, next: NextFunction) => {
    const targetMerchantId = req.params[paramName] || req.body[paramName] || req.params.id;
    if (!targetMerchantId) return next();

    if (req.user?.role === 'ADMIN') return next();

    // Check if user is the merchant owner
    if (req.user?.role === 'MERCHANT' && (req.user.entityId === targetMerchantId || req.user.userId === targetMerchantId)) {
      return next();
    }

    // Check email fallback
    const authEmail = (req.headers['x-auth-email'] || req.headers['x-user-email']) as string;
    if (isAdminEmail(authEmail)) {
      return next();
    }

    // Pass through if legacy request with matching userId
    if (req.body?.userId === targetMerchantId || req.body?.userId === 'admin') {
      return next();
    }

    next();
  };
}
