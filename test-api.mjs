// src/server/app.ts
import express from "express";

// src/server/db.ts
import fs3 from "fs";
import path3 from "path";

// src/types.ts
function calculateTieredServiceFee(subtotal) {
  if (subtotal <= 1e5) return 2e3;
  if (subtotal <= 3e5) return 3e3;
  if (subtotal <= 5e5) return 4e3;
  if (subtotal <= 7e5) return 5e3;
  return 1e4;
}

// src/server/config.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();
var runtimeJwtSecret = process.env.FOOD_AUTH_SECRET;
if (!runtimeJwtSecret || runtimeJwtSecret.trim().length < 32) {
  if (process.env.NODE_ENV === "production") {
    console.warn("[TumpangFood Security] FOOD_AUTH_SECRET belum disetel (minimal 32 karakter). Menggunakan kunci aman kriptografi sementara.");
  }
  runtimeJwtSecret = crypto.randomBytes(32).toString("hex");
}
var isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
var localDbFile = isServerless ? path.join("/tmp", "tumpang_food_db.json") : path.join(process.cwd(), "tumpang_food_db.json");
var runtimeAdminPassword = process.env.FOOD_ADMIN_PASSWORD || "TumpangGoAdmin#2026";
var runtimeAdminEmail = process.env.FOOD_ADMIN_EMAIL || "tumpanggo@gmail.com";
function validateProductionEnvironment() {
  const errors = [];
  const secret = process.env.FOOD_AUTH_SECRET;
  if (!secret || secret.trim().length < 32) {
    errors.push("FOOD_AUTH_SECRET wajib disetel dan memiliki minimal 32 karakter.");
  }
  const adminEmail = process.env.FOOD_ADMIN_EMAIL;
  if (!adminEmail || !adminEmail.includes("@")) {
    errors.push("FOOD_ADMIN_EMAIL wajib disetel dengan alamat email yang sah.");
  }
  const adminPassword = process.env.FOOD_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.trim().length < 8) {
    errors.push("FOOD_ADMIN_PASSWORD wajib disetel dengan minimal 8 karakter.");
  }
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT;
  if (!projectId || projectId.trim().length === 0) {
    errors.push("FIREBASE_PROJECT_ID wajib disetel pada lingkungan produksi.");
  }
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!serviceAccount || serviceAccount.trim().length === 0) {
    errors.push("FIREBASE_SERVICE_ACCOUNT_KEY wajib disetel untuk otentikasi Firebase Admin SDK pada lingkungan produksi.");
  } else {
    const raw = serviceAccount.trim();
    let parsed = null;
    try {
      let cleanRaw = raw;
      if (cleanRaw.startsWith("'") && cleanRaw.endsWith("'") || cleanRaw.startsWith('"') && cleanRaw.endsWith('"')) {
        cleanRaw = cleanRaw.slice(1, -1);
      }
      if (cleanRaw.startsWith("{")) {
        parsed = JSON.parse(cleanRaw);
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(raw)) {
        parsed = JSON.parse(fs.readFileSync(raw, "utf-8"));
      } else {
        const decoded = Buffer.from(cleanRaw, "base64").toString("utf-8");
        if (decoded.trim().startsWith("{")) {
          parsed = JSON.parse(decoded);
        }
      }
    } catch {
    }
    if (!parsed || typeof parsed !== "object") {
      errors.push("FIREBASE_SERVICE_ACCOUNT_KEY tidak berformat JSON atau Base64 yang valid.");
    } else if (!parsed.client_email || !parsed.private_key) {
      errors.push('FIREBASE_SERVICE_ACCOUNT_KEY wajib memiliki field "client_email" dan "private_key".');
    }
  }
  const portVal = parseInt(process.env.PORT || process.env.FOOD_PORT || "3000", 10);
  if (isNaN(portVal) || portVal < 1 || portVal > 65535) {
    errors.push("PORT atau FOOD_PORT harus berupa angka port TCP yang valid (1-65535).");
  }
  return {
    isValid: errors.length === 0,
    errors
  };
}
if (process.env.NODE_ENV === "production") {
  const check = validateProductionEnvironment();
  if (!check.isValid) {
    console.warn(`[TumpangFood Security] Peringatan konfigurasi produksi:
- ${check.errors.join("\n- ")}`);
  }
}
var foodConfig = {
  isProduction: process.env.NODE_ENV === "production",
  // Server port
  port: parseInt(process.env.PORT || process.env.FOOD_PORT || "3000", 10),
  host: "0.0.0.0",
  isServerless,
  // Database settings
  databaseId: process.env.FOOD_DATABASE_ID || "ai-studio-tumpangfood-99caef89-a69c-4fe1-80be-2c79f3dcb85c",
  localDbFile,
  legacyDbFile: path.join(process.cwd(), "tumpang_db.json"),
  // Security & Authentication
  jwtSecret: runtimeJwtSecret || "dev_secret_fallback_do_not_use_in_prod",
  adminEmail: runtimeAdminEmail.toLowerCase(),
  adminPassword: runtimeAdminPassword,
  // System operational defaults
  defaults: {
    serviceFee: 2e3,
    deliveryFeePerKm: 1500,
    defaultDeliveryFee: 5e3,
    commissionPercent: 10,
    paymentExpiryMinutes: 10,
    qrisImage: "https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
  }
};

// src/server/auth.ts
import crypto2 from "crypto";
function hashPassword(password) {
  const salt = crypto2.randomBytes(16).toString("hex");
  const iterations = 1e4;
  const hash = crypto2.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}
function verifyPassword(password, storedHash) {
  if (!storedHash) return { valid: false, needsRehash: false };
  if (storedHash.startsWith("pbkdf2$")) {
    const parts = storedHash.split("$");
    if (parts.length !== 4) return { valid: false, needsRehash: false };
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const originalHash = parts[3];
    const derived = crypto2.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
    const valid2 = crypto2.timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(originalHash, "hex"));
    return { valid: valid2, needsRehash: false };
  }
  const valid = password.trim() === storedHash.trim();
  return { valid, needsRehash: valid };
}
function createAuthToken(user, expiresInHours = 72) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      ...user,
      exp: Math.floor(Date.now() / 1e3) + expiresInHours * 3600
    })
  ).toString("base64url");
  const signature = crypto2.createHmac("sha256", foodConfig.jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
function verifyAuthToken(token) {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expectedSig = crypto2.createHmac("sha256", foodConfig.jwtSecret).update(`${header}.${payload}`).digest("base64url");
    if (!crypto2.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (data.exp && data.exp < Math.floor(Date.now() / 1e3)) {
      return null;
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
function authenticateToken(req, res, next) {
  let token = "";
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (req.headers["x-auth-token"]) {
    token = String(req.headers["x-auth-token"]);
  }
  if (token) {
    const verified = verifyAuthToken(token);
    if (verified) {
      req.user = verified;
    }
  }
  next();
}
function isAdminEmail(email) {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return e === foodConfig.adminEmail || e === "sawahjayagroup@gmail.com" || e === "sawahjayatrans@gmail.com" || e === "admin" || e.endsWith("@tumpanggo.com");
}
function requireRole(allowedRoles) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Akses ditolak: Autentikasi diperlukan. Silakan login terlebih dahulu." });
    }
    if (user.role === "ADMIN") {
      return next();
    }
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: `Akses ditolak: Peran ${user.role} tidak memiliki izin untuk tindakan ini.` });
    }
    next();
  };
}
function requireMerchantOwner(paramName = "merchantId") {
  return (req, res, next) => {
    const targetMerchantId = req.params[paramName] || req.params.merchantId || req.params.id || req.body[paramName];
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Akses ditolak: Autentikasi diperlukan. Silakan login terlebih dahulu." });
    }
    if (user.role === "ADMIN") {
      return next();
    }
    if (user.role === "MERCHANT" && (user.entityId === targetMerchantId || user.userId === targetMerchantId)) {
      return next();
    }
    return res.status(403).json({ error: "Akses ditolak: Anda tidak memiliki izin untuk mengakses atau memodifikasi data toko ini." });
  };
}
function requireDriverSelf(paramName = "driverId") {
  return (req, res, next) => {
    const targetDriverId = req.params[paramName] || req.params.driverId || req.params.id || req.body[paramName];
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Akses ditolak: Autentikasi diperlukan. Silakan login terlebih dahulu." });
    }
    if (user.role === "ADMIN") {
      return next();
    }
    if (user.role === "DRIVER" && (user.entityId === targetDriverId || user.userId === targetDriverId)) {
      return next();
    }
    return res.status(403).json({ error: "Akses ditolak: Anda tidak memiliki izin untuk tugas kurir ini." });
  };
}

// src/server/services/orderService.ts
var OrderService = class {
  /**
   * Validates and recalculates an incoming order against official database records.
   * Prevents customer-side price tampering and validates pre-order rules.
   */
  static validateAndBuildOrder(input, merchant, menuItems, systemConfig, activeUniqueCodes) {
    if (!merchant) {
      throw new Error("Merchant tidak ditemukan.");
    }
    if (!merchant.active) {
      throw new Error(`Toko "${merchant.name}" saat ini sedang tutup dan tidak menerima pesanan.`);
    }
    if (!input.items || input.items.length === 0) {
      throw new Error("Keranjang belanja kosong. Silakan pilih menu terlebih dahulu.");
    }
    if (!input.customerName || !input.customerPhone || !input.deliveryAddress) {
      throw new Error("Mohon lengkapi Nama Pemesan, Nomor WhatsApp, dan Alamat Pengiriman.");
    }
    const isPreOrder = Boolean(merchant.preOrderOnly || input.preOrderDate);
    const totalItemCount = input.items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
    if (merchant.preOrderOnly && !input.preOrderDate) {
      throw new Error("Toko ini beroperasi dengan sistem Pre-Order. Mohon tentukan tanggal pengiriman.");
    }
    if (isPreOrder && merchant.preOrderMinAmount && totalItemCount < merchant.preOrderMinAmount) {
      throw new Error(`Minimal pemesanan untuk toko Pre-Order ini adalah ${merchant.preOrderMinAmount} porsi/item.`);
    }
    const validatedItems = [];
    let calculatedSubtotal = 0;
    for (const orderItemInput of input.items) {
      const quantity = Math.max(1, Math.floor(Number(orderItemInput.quantity) || 1));
      const menuItem = menuItems.find((m) => m.id === orderItemInput.menuItemId && m.merchantId === merchant.id);
      if (!menuItem) {
        throw new Error(`Menu dengan ID "${orderItemInput.menuItemId}" tidak ditemukan pada toko ini.`);
      }
      if (!menuItem.available) {
        throw new Error(`Maaf, menu "${menuItem.name}" saat ini sedang habis.`);
      }
      const officialPrice = Number(menuItem.price) || 0;
      calculatedSubtotal += officialPrice * quantity;
      validatedItems.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        price: officialPrice,
        quantity,
        allowInstant: menuItem.allowInstant,
        preOrderMinAmount: menuItem.preOrderMinAmount
      });
    }
    const calculatedServiceFee = calculateTieredServiceFee(calculatedSubtotal);
    let calculatedDeliveryFee = systemConfig.defaultDeliveryFee || 5e3;
    if (merchant.latitude && merchant.longitude && input.latitude && input.longitude) {
      const distanceKm = this.calculateDistanceKm(
        merchant.latitude,
        merchant.longitude,
        input.latitude,
        input.longitude
      );
      const feePerKm = systemConfig.deliveryFeePerKm || 1500;
      calculatedDeliveryFee = Math.max(
        systemConfig.defaultDeliveryFee || 5e3,
        Math.round(distanceKm * feePerKm)
      );
    }
    const uniqueCode = this.generateUniqueCode(activeUniqueCodes);
    const total = calculatedSubtotal + calculatedDeliveryFee + calculatedServiceFee + uniqueCode;
    const paymentExpiresAt = new Date(Date.now() + 10 * 60 * 1e3).toISOString();
    return {
      uniqueCode,
      total,
      status: "WAITING_PAYMENT" /* WAITING_PAYMENT */,
      merchantId: merchant.id,
      merchantName: merchant.name,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      deliveryAddress: input.deliveryAddress.trim(),
      deliveryDetails: input.deliveryDetails ? input.deliveryDetails.trim() : "",
      landmark: input.landmark ? input.landmark.trim() : "",
      latitude: input.latitude,
      longitude: input.longitude,
      items: validatedItems,
      subtotal: calculatedSubtotal,
      deliveryFee: calculatedDeliveryFee,
      serviceFee: calculatedServiceFee,
      paymentExpiresAt,
      preOrderDate: input.preOrderDate || ""
    };
  }
  /**
   * Generates a unique 2-digit verification code avoiding conflicts.
   */
  static generateUniqueCode(activeCodes) {
    for (let attempts = 0; attempts < 100; attempts++) {
      const code = Math.floor(Math.random() * 99) + 1;
      if (!activeCodes.includes(code)) {
        return code;
      }
    }
    return Math.floor(Math.random() * 99) + 1;
  }
  /**
   * Haversine formula to compute distance in km
   */
  static calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }
  /**
   * Validates state machine status transition
   */
  static isValidStatusTransition(currentStatus, targetStatus, role) {
    if (role === "ADMIN" || role === "SYSTEM") {
      return { allowed: true };
    }
    if (currentStatus === targetStatus) {
      return { allowed: true };
    }
    if (currentStatus === "COMPLETED" /* COMPLETED */ || currentStatus === "CANCELLED" /* CANCELLED */ || currentStatus === "EXPIRED" /* EXPIRED */) {
      return { allowed: false, reason: `Pesanan telah berada pada status final (${currentStatus}).` };
    }
    switch (role) {
      case "CUSTOMER":
        if (currentStatus === "WAITING_PAYMENT" /* WAITING_PAYMENT */ && (targetStatus === "WAITING_PAYMENT_VERIFICATION" /* WAITING_PAYMENT_VERIFICATION */ || targetStatus === "CANCELLED" /* CANCELLED */)) {
          return { allowed: true };
        }
        return { allowed: false, reason: "Pelanggan hanya dapat mengunggah bukti pembayaran atau membatalkan pesanan baru." };
      case "MERCHANT":
        if (currentStatus === "PAYMENT_VERIFIED" /* PAYMENT_VERIFIED */ && targetStatus === "COOKING" /* COOKING */) {
          return { allowed: true };
        }
        if (currentStatus === "COOKING" /* COOKING */ && targetStatus === "READY_FOR_PICKUP" /* READY_FOR_PICKUP */) {
          return { allowed: true };
        }
        return { allowed: false, reason: `Merchant tidak diizinkan mengubah status dari ${currentStatus} ke ${targetStatus}.` };
      case "DRIVER":
        if ((currentStatus === "READY_FOR_PICKUP" /* READY_FOR_PICKUP */ || currentStatus === "COOKING" /* COOKING */) && targetStatus === "ORDER_PICKED_UP" /* ORDER_PICKED_UP */) {
          return { allowed: true };
        }
        if ((currentStatus === "ORDER_PICKED_UP" /* ORDER_PICKED_UP */ || currentStatus === "DELIVERED" /* DELIVERED */) && targetStatus === "COMPLETED" /* COMPLETED */) {
          return { allowed: true };
        }
        return { allowed: false, reason: `Driver tidak diizinkan mengubah status dari ${currentStatus} ke ${targetStatus}.` };
      default:
        return { allowed: false, reason: "Peran tidak dikenali." };
    }
  }
};

// src/server/firebaseAdmin.ts
import fs2 from "fs";
import path2 from "path";
import * as admin from "firebase-admin";
import { initializeApp as initializeApp2, getApps as getApps2, cert as cert2 } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
var adminApp = null;
var adminDb = null;
var isConfiguredWithServiceAccount = false;
var activeProjectId = "gen-lang-client-0238078208";
var activeClientEmailMasked = null;
function removeUndefinedFields(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefinedFields);
  const cleaned = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== void 0) {
      cleaned[key] = removeUndefinedFields(val);
    }
  }
  return cleaned;
}
function initFirebaseAdmin(serviceAccountOverride) {
  try {
    let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT;
    const configPath = path2.join(process.cwd(), "firebase-applet-config.json");
    if (!projectId && fs2.existsSync(configPath)) {
      try {
        const raw = JSON.parse(fs2.readFileSync(configPath, "utf-8"));
        if (raw.projectId) {
          projectId = raw.projectId;
        }
      } catch {
      }
    }
    projectId = projectId || "gen-lang-client-0238078208";
    activeProjectId = projectId;
    const rawInput = (serviceAccountOverride || process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").trim();
    let credentialOption = void 0;
    isConfiguredWithServiceAccount = false;
    activeClientEmailMasked = null;
    const certFn = cert2 || admin.cert || admin.credential?.cert;
    const initAppFn = initializeApp2 || admin.initializeApp;
    const getAppsFn = getApps2 || admin.getApps;
    if (rawInput.length > 0) {
      try {
        let cleanRaw = rawInput;
        if (cleanRaw.startsWith("'") && cleanRaw.endsWith("'") || cleanRaw.startsWith('"') && cleanRaw.endsWith('"')) {
          cleanRaw = cleanRaw.slice(1, -1);
        }
        let parsed = null;
        if (cleanRaw.startsWith("{")) {
          parsed = JSON.parse(cleanRaw);
        } else {
          try {
            const decoded = Buffer.from(cleanRaw, "base64").toString("utf-8");
            if (decoded.trim().startsWith("{")) {
              parsed = JSON.parse(decoded);
            }
          } catch {
          }
        }
        if (parsed && typeof parsed === "object") {
          if (parsed.private_key && typeof parsed.private_key === "string") {
            parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
          }
          if (parsed.project_id) {
            projectId = parsed.project_id;
            activeProjectId = parsed.project_id;
          }
          if (typeof certFn === "function") {
            credentialOption = certFn(parsed);
          }
          isConfiguredWithServiceAccount = true;
          if (parsed.client_email && typeof parsed.client_email === "string") {
            const parts = parsed.client_email.split("@");
            if (parts.length === 2) {
              const userPart = parts[0];
              const domainPart = parts[1];
              activeClientEmailMasked = `${userPart.substring(0, 3)}***@${domainPart}`;
            } else {
              activeClientEmailMasked = "configured_service_account";
            }
          }
          console.log(`[TumpangFood Admin] Loaded Service Account (Project: ${projectId}, ServiceAccount: ${activeClientEmailMasked || "verified"}).`);
        } else {
          console.warn("[TumpangFood Admin] FIREBASE_SERVICE_ACCOUNT_KEY is present but could not be parsed as valid JSON.");
        }
      } catch (err) {
        console.error("[TumpangFood Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:", err.message);
      }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs2.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      try {
        const fileContent = fs2.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf-8");
        const parsed = JSON.parse(fileContent);
        if (parsed.private_key && typeof parsed.private_key === "string") {
          parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
        }
        if (typeof certFn === "function") {
          credentialOption = certFn(parsed);
        }
        if (parsed.project_id) {
          projectId = parsed.project_id;
          activeProjectId = parsed.project_id;
        }
        isConfiguredWithServiceAccount = true;
        activeClientEmailMasked = parsed.client_email ? `${parsed.client_email.substring(0, 3)}***` : "file_credential";
        console.log("[TumpangFood Admin] Loaded Service Account from GOOGLE_APPLICATION_CREDENTIALS file.");
      } catch (err) {
        console.error("[TumpangFood Admin] Failed to parse GOOGLE_APPLICATION_CREDENTIALS file:", err.message);
      }
    }
    const currentApps = typeof getAppsFn === "function" ? getAppsFn() : [];
    if (currentApps.length === 0) {
      const initOptions = { projectId };
      if (credentialOption) {
        initOptions.credential = credentialOption;
      }
      if (typeof initAppFn === "function") {
        adminApp = initAppFn(initOptions);
      }
    } else {
      adminApp = currentApps[0];
    }
    const getFirestoreFn = getFirestore || admin.firestore;
    if (typeof getFirestoreFn === "function" && adminApp) {
      adminDb = getFirestoreFn(adminApp, foodConfig.databaseId);
    }
    console.log(`[TumpangFood Admin] Firebase Admin SDK initialized for database "${foodConfig.databaseId}" on project "${projectId}".`);
    return { success: true };
  } catch (e) {
    console.error("[TumpangFood Admin] Failed to initialize Firebase Admin SDK:", e.message);
    adminApp = null;
    adminDb = null;
    return { success: false, error: e.message };
  }
}
initFirebaseAdmin();
function getAdminDb() {
  return adminDb;
}
function isFirestoreAdminConfigured() {
  return adminDb !== null;
}
async function testFirestoreConnection() {
  const probeId = `probe_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  let canRead = false;
  let canWrite = false;
  let probeError = void 0;
  let diagnosticReason = "OK";
  if (!adminDb) {
    return {
      connected: false,
      canRead: false,
      canWrite: false,
      databaseId: foodConfig.databaseId,
      projectId: activeProjectId,
      usingServiceAccount: isConfiguredWithServiceAccount,
      authIdentity: isConfiguredWithServiceAccount ? "ServiceAccount" : "Sandbox-ADC",
      error: "Firebase Admin Firestore belum terinisialisasi.",
      diagnosticReason: "MISSING_CREDENTIALS",
      diagnosticDetail: "Firebase Admin SDK belum berhasil diinisialisasi karena ketiadaan konfigurasi dasar.",
      remediationStep: "Periksa file firebase-applet-config.json dan setel variabel lingkungan FIREBASE_PROJECT_ID."
    };
  }
  const probeRef = adminDb.collection("_systemConnectionProbe").doc(probeId);
  try {
    await probeRef.set({
      ping: true,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      probeOrigin: "TumpangFood Health Check"
    });
    canWrite = true;
  } catch (err) {
    probeError = err.message || String(err);
  }
  if (canWrite) {
    try {
      const snap = await probeRef.get();
      canRead = snap.exists;
      await probeRef.delete().catch(() => {
      });
    } catch (err) {
      probeError = probeError || err.message;
    }
  } else {
    try {
      const snap = await adminDb.collection("systemConfig").doc("config_1").get();
      canRead = snap.exists;
    } catch (err) {
      probeError = err.message || String(err);
    }
  }
  let diagnosticDetail = "Koneksi cloud Firestore Admin SDK aktif dan berhasil membaca/menulis data.";
  let remediationStep = void 0;
  if (probeError) {
    const lower = probeError.toLowerCase();
    if (lower.includes("permission_denied") || lower.includes("missing or insufficient permissions")) {
      if (!isConfiguredWithServiceAccount) {
        diagnosticReason = "MISSING_CREDENTIALS";
        diagnosticDetail = `Kredensial Service Account belum disetel di lingkungan produksi (FIREBASE_SERVICE_ACCOUNT_KEY kosong). Server menggunakan Application Default Credentials (ADC) bawaan container sandbox yang tidak memiliki izin IAM pada proyek "${activeProjectId}".`;
        remediationStep = "Generate Service Account JSON Key pada Google Cloud / Firebase Console (IAM & Admin -> Service Accounts), lalu masukkan isi JSON ke variabel lingkungan FIREBASE_SERVICE_ACCOUNT_KEY.";
      } else {
        diagnosticReason = "IAM_PERMISSION_DENIED";
        diagnosticDetail = `Service Account (${activeClientEmailMasked || "terpasang"}) ditolak oleh Google Cloud IAM (HTTP/gRPC 7 PERMISSION_DENIED). Akun layanan tersebut belum memiliki hak akses peran 'Cloud Datastore User' (roles/datastore.user) atau 'Firebase Admin' pada proyek "${activeProjectId}".`;
        remediationStep = `Buka Google Cloud Console -> IAM & Admin -> IAM, cari akun layanan "${activeClientEmailMasked || "Service Account"}", dan tambahkan peran "Cloud Datastore User" (roles/datastore.user).`;
      }
    } else if (lower.includes("not found") || lower.includes("database")) {
      diagnosticReason = "DATABASE_NOT_FOUND";
      diagnosticDetail = `Database "${foodConfig.databaseId}" tidak ditemukan pada proyek "${activeProjectId}". Pastikan database Firestore dengan ID tersebut sudah dibuat.`;
      remediationStep = `Buat database Firestore dengan ID "${foodConfig.databaseId}" di Firebase Console atau Google Cloud Console Firestore Databases.`;
    } else if (lower.includes("project") || lower.includes("not exist")) {
      diagnosticReason = "INVALID_PROJECT";
      diagnosticDetail = `Proyek Google Cloud "${activeProjectId}" tidak valid atau tidak dapat diakses.`;
      remediationStep = "Pastikan FIREBASE_PROJECT_ID sesuai dengan project ID di Firebase Console.";
    } else if (lower.includes("unavailable") || lower.includes("econnrefused") || lower.includes("deadline")) {
      diagnosticReason = "NETWORK_ERROR";
      diagnosticDetail = "Gagal menghubungi server Google Cloud Firestore karena kendala jaringan atau timeout.";
      remediationStep = "Periksa koneksi jaringan server dan pastikan firewall mengizinkan egress HTTPS/gRPC ke Google Cloud APIs.";
    } else {
      diagnosticReason = "UNKNOWN";
      diagnosticDetail = `Terjadi kesalahan saat menghubungi Firestore: ${probeError}`;
      remediationStep = "Periksa log server untuk rincian error gRPC/HTTP Firestore.";
    }
  }
  const isFullyConnected = canRead && canWrite;
  return {
    connected: isFullyConnected,
    canRead,
    canWrite,
    databaseId: foodConfig.databaseId,
    projectId: activeProjectId,
    usingServiceAccount: isConfiguredWithServiceAccount,
    authIdentity: isConfiguredWithServiceAccount ? `Custom Service Account (${activeClientEmailMasked || "configured"})` : "Default Sandbox Container ADC (No IAM on Project)",
    error: probeError,
    diagnosticReason: isFullyConnected ? "OK" : diagnosticReason,
    diagnosticDetail,
    remediationStep: isFullyConnected ? void 0 : remediationStep
  };
}
async function safeAdminSetDoc(collectionName, docId, data) {
  if (!adminDb) return false;
  try {
    const cleaned = removeUndefinedFields(data);
    await adminDb.collection(collectionName).doc(docId).set(cleaned, { merge: true });
    return true;
  } catch (err) {
    console.warn(`[TumpangFood Admin] safeAdminSetDoc failed for ${collectionName}/${docId}:`, err.message);
    return false;
  }
}
async function safeAdminDeleteDoc(collectionName, docId) {
  if (!adminDb) return false;
  try {
    await adminDb.collection(collectionName).doc(docId).delete();
    return true;
  } catch (err) {
    console.warn(`[TumpangFood Admin] safeAdminDeleteDoc failed for ${collectionName}/${docId}:`, err.message);
    return false;
  }
}
async function safeAdminGetDoc(collectionName, docId) {
  if (!adminDb) return null;
  try {
    const snap = await adminDb.collection(collectionName).doc(docId).get();
    if (snap.exists) {
      return snap.data();
    }
    return null;
  } catch (err) {
    console.warn(`[TumpangFood Admin] safeAdminGetDoc failed for ${collectionName}/${docId}:`, err.message);
    return null;
  }
}
async function safeAdminGetDocs(collectionName) {
  if (!adminDb) return [];
  try {
    const snap = await adminDb.collection(collectionName).get();
    return snap.docs.map((doc) => doc.data());
  } catch (err) {
    console.warn(`[TumpangFood Admin] safeAdminGetDocs failed for ${collectionName}:`, err.message);
    return [];
  }
}
async function runAdminTransaction(updateFunction) {
  if (!adminDb) {
    throw new Error("Firebase Admin Firestore instance is not initialized.");
  }
  return await adminDb.runTransaction(updateFunction);
}

// src/server/db.ts
var FOOD_DB_FILE = foodConfig.localDbFile;
var LEGACY_DB_FILE = foodConfig.legacyDbFile;
var safeFirestoreSetDoc = safeAdminSetDoc;
var initialConfig = {
  serviceFee: 2e3,
  deliveryFeePerKm: 1500,
  defaultDeliveryFee: 5e3,
  commissionPercent: 10,
  assignmentMode: "AUTOMATIC" /* AUTOMATIC */,
  qrisImage: "https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
  systemOpen: true
};
var FoodDatabase = class {
  constructor() {
    this.isInitialized = false;
    this.initPromise = null;
    this.settlementMutex = Promise.resolve();
    this.data = {
      merchants: [],
      categories: [],
      menuItems: [],
      orders: [],
      drivers: [],
      settlements: [],
      auditLogs: [],
      systemConfig: initialConfig,
      partnerRegistrations: [],
      licenses: []
    };
    this.loadAndMigrate();
  }
  createBackup() {
    try {
      const backupPath = FOOD_DB_FILE + ".backup.json";
      fs3.writeFileSync(backupPath, JSON.stringify(this.data, null, 2), "utf-8");
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Loads from food database file or migrates safely from backup / legacy file.
   */
  loadAndMigrate() {
    const backupPath = FOOD_DB_FILE + ".backup.json";
    try {
      if (fs3.existsSync(FOOD_DB_FILE)) {
        const content = fs3.readFileSync(FOOD_DB_FILE, "utf-8");
        if (content && content.trim().length > 10) {
          this.data = JSON.parse(content);
          this.ensureStructure();
          this.migratePasswords();
          this.createBackup();
          console.log("[TumpangFood DB] Loaded primary operational state from tumpang_food_db.json");
          return;
        }
      }
      if (fs3.existsSync(backupPath)) {
        console.warn("[TumpangFood DB] Primary database corrupted or empty. Recovering from backup snapshot...");
        const backupContent = fs3.readFileSync(backupPath, "utf-8");
        this.data = JSON.parse(backupContent);
        this.ensureStructure();
        this.save();
        console.log("[TumpangFood DB] Recovery from backup successful.");
        return;
      }
      if (fs3.existsSync(LEGACY_DB_FILE)) {
        console.log("[TumpangFood DB] Migrating data from legacy tumpang_db.json...");
        const legacyContent = fs3.readFileSync(LEGACY_DB_FILE, "utf-8");
        this.data = JSON.parse(legacyContent);
        this.ensureStructure();
        this.migratePasswords();
        this.save();
        this.createBackup();
        console.log("[TumpangFood DB] Migration complete! Saved to tumpang_food_db.json.");
      } else {
        this.seedInitial();
        this.save();
        this.createBackup();
      }
    } catch (err) {
      console.error("[TumpangFood DB] Error during load/migrate, attempting emergency recovery:", err);
      if (fs3.existsSync(backupPath)) {
        try {
          this.data = JSON.parse(fs3.readFileSync(backupPath, "utf-8"));
          this.ensureStructure();
          this.save();
          return;
        } catch {
        }
      }
      this.seedInitial();
      this.save();
    }
  }
  migratePasswords() {
    let changed = false;
    for (const m of this.data.merchants) {
      if (!m.password) {
        m.password = hashPassword(m.id + "123");
        changed = true;
      } else if (!m.password.startsWith("pbkdf2$")) {
        m.password = hashPassword(m.password);
        changed = true;
      }
    }
    for (const d of this.data.drivers) {
      if (!d.password) {
        d.password = hashPassword(d.id + "123");
        changed = true;
      } else if (!d.password.startsWith("pbkdf2$")) {
        d.password = hashPassword(d.password);
        changed = true;
      }
    }
    if (changed) this.save();
  }
  ensureStructure() {
    if (!this.data.merchants) this.data.merchants = [];
    if (!this.data.categories) this.data.categories = [];
    if (!this.data.menuItems) this.data.menuItems = [];
    if (!this.data.orders) this.data.orders = [];
    if (!this.data.drivers) this.data.drivers = [];
    if (!this.data.settlements) this.data.settlements = [];
    if (!this.data.auditLogs) this.data.auditLogs = [];
    if (!this.data.systemConfig) this.data.systemConfig = initialConfig;
    if (!this.data.partnerRegistrations) this.data.partnerRegistrations = [];
    if (!this.data.licenses) this.data.licenses = [];
  }
  seedInitial() {
    this.data.systemConfig = initialConfig;
    this.data.licenses = [
      { key: "TUMPANG-PREM-FITRI-KUE", durationDays: 30, status: "UNUSED", createdAt: (/* @__PURE__ */ new Date()).toISOString() },
      { key: "TUMPANG-PREM-DEMO-99", durationDays: 90, status: "UNUSED", createdAt: (/* @__PURE__ */ new Date()).toISOString() },
      { key: "TUMPANG-PREM-BAKERY", durationDays: 365, status: "UNUSED", createdAt: (/* @__PURE__ */ new Date()).toISOString() }
    ];
  }
  save() {
    try {
      const dir = path3.dirname(FOOD_DB_FILE);
      if (!fs3.existsSync(dir)) {
        fs3.mkdirSync(dir, { recursive: true });
      }
      fs3.writeFileSync(FOOD_DB_FILE, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (e) {
      if (e.code === "EROFS") {
        console.warn("[TumpangFood DB] Read-only filesystem detected. Disk write skipped; persisting in-memory and Firestore.");
      } else {
        console.error("[TumpangFood DB] Failed to save database file:", e);
      }
    }
  }
  async ensureInitialized() {
    if (this.isInitialized) return;
    if (!this.initPromise) {
      this.initPromise = this.init();
    }
    try {
      await this.initPromise;
    } catch (err) {
      this.initPromise = null;
      this.isInitialized = false;
      throw err;
    }
  }
  /**
   * Diagnostic assessment of runtime storage status: Cloud Firestore vs Local Resilient Snapshot.
   */
  async getStorageStatus() {
    const firestoreCheck = await testFirestoreConnection();
    return {
      storageMode: firestoreCheck.connected ? "cloud_firestore_active" : "local_resilient_snapshot",
      databaseId: firestoreCheck.databaseId,
      projectId: firestoreCheck.projectId,
      isProduction: foodConfig.isProduction,
      firestoreConfigured: isFirestoreAdminConfigured(),
      usingServiceAccount: firestoreCheck.usingServiceAccount,
      authIdentity: firestoreCheck.authIdentity,
      liveCloudConnected: firestoreCheck.connected,
      canRead: firestoreCheck.canRead,
      canWrite: firestoreCheck.canWrite,
      diagnosticReason: firestoreCheck.diagnosticReason,
      diagnosticDetail: firestoreCheck.diagnosticDetail,
      remediationStep: firestoreCheck.remediationStep,
      cloudError: firestoreCheck.error
    };
  }
  /**
   * Synchronize state with Firebase Firestore using timestamp-based conflict resolution.
   */
  async init() {
    if (this.isInitialized) return;
    if (!isFirestoreAdminConfigured()) {
      if (foodConfig.isProduction) {
        throw new Error("[Produksi] Firebase Admin SDK tidak terkonfigurasi. Operasi database ditolak demi integritas data.");
      }
      console.warn("[TumpangFood DB] Firestore Admin SDK not configured, operating with persistent local storage.");
      this.isInitialized = true;
      return;
    }
    if (foodConfig.isProduction) {
      const probe = await testFirestoreConnection();
      if (!probe.connected) {
        throw new Error(`[Produksi] Koneksi ke database Firestore "${foodConfig.databaseId}" pada proyek "${probe.projectId}" gagal (${probe.error}). Fallback ke JSON lokal dinonaktifkan pada lingkungan produksi.`);
      }
    }
    this.isInitialized = true;
    try {
      console.log("[TumpangFood DB] Syncing with Firestore database via Admin SDK:", foodConfig.databaseId);
      try {
        const remoteConfig = await safeAdminGetDoc("systemConfig", "config_1");
        if (remoteConfig) {
          this.data.systemConfig = { ...initialConfig, ...remoteConfig };
        } else {
          await safeAdminSetDoc("systemConfig", "config_1", this.data.systemConfig);
        }
      } catch (e) {
        console.warn("[TumpangFood DB] Failed to sync systemConfig with Firestore:", e.message);
      }
      try {
        const remoteMerchants = await safeAdminGetDocs("merchants");
        if (remoteMerchants.length > 0) {
          for (const rm of remoteMerchants) {
            const idx = this.data.merchants.findIndex((m) => m.id === rm.id);
            if (idx >= 0) {
              const localTime = new Date(this.data.merchants[idx].updatedAt || 0).getTime();
              const remoteTime = new Date(rm.updatedAt || 0).getTime();
              if (remoteTime >= localTime) {
                this.data.merchants[idx] = { ...this.data.merchants[idx], ...rm };
              } else {
                await safeAdminSetDoc("merchants", this.data.merchants[idx].id, this.data.merchants[idx]);
              }
            } else {
              this.data.merchants.push(rm);
            }
          }
        } else if (this.data.merchants.length > 0) {
          for (const m of this.data.merchants) {
            await safeAdminSetDoc("merchants", m.id, m);
          }
        }
      } catch (e) {
        console.warn("[TumpangFood DB] Failed to sync merchants with Firestore:", e.message);
      }
      try {
        const remoteCats = await safeAdminGetDocs("categories");
        if (remoteCats.length > 0) {
          for (const rc of remoteCats) {
            if (!this.data.categories.some((c) => c.id === rc.id)) {
              this.data.categories.push(rc);
            }
          }
        } else if (this.data.categories.length > 0) {
          for (const c of this.data.categories) {
            await safeAdminSetDoc("categories", c.id, c);
          }
        }
      } catch (e) {
        console.warn("[TumpangFood DB] Failed to sync categories with Firestore:", e.message);
      }
      try {
        const remoteItems = await safeAdminGetDocs("menuItems");
        if (remoteItems.length > 0) {
          for (const ri of remoteItems) {
            const idx = this.data.menuItems.findIndex((i) => i.id === ri.id);
            if (idx >= 0) {
              this.data.menuItems[idx] = { ...this.data.menuItems[idx], ...ri };
            } else {
              this.data.menuItems.push(ri);
            }
          }
        } else if (this.data.menuItems.length > 0) {
          for (const i of this.data.menuItems) {
            await safeAdminSetDoc("menuItems", i.id, i);
          }
        }
      } catch (e) {
        console.warn("[TumpangFood DB] Failed to sync menuItems with Firestore:", e.message);
      }
      try {
        const remoteDrivers = await safeAdminGetDocs("drivers");
        if (remoteDrivers.length > 0) {
          for (const rd of remoteDrivers) {
            const idx = this.data.drivers.findIndex((d) => d.id === rd.id);
            if (idx >= 0) {
              this.data.drivers[idx] = { ...this.data.drivers[idx], ...rd };
            } else {
              this.data.drivers.push(rd);
            }
          }
        } else if (this.data.drivers.length > 0) {
          for (const d of this.data.drivers) {
            await safeAdminSetDoc("drivers", d.id, d);
          }
        }
      } catch (e) {
        console.warn("[TumpangFood DB] Failed to sync drivers with Firestore:", e.message);
      }
      try {
        const remoteOrders = await safeAdminGetDocs("orders");
        if (remoteOrders.length > 0) {
          for (const ro of remoteOrders) {
            const idx = this.data.orders.findIndex((o) => o.id === ro.id);
            if (idx >= 0) {
              const localTime = new Date(this.data.orders[idx].updatedAt || this.data.orders[idx].createdAt || 0).getTime();
              const remoteTime = new Date(ro.updatedAt || ro.createdAt || 0).getTime();
              if (remoteTime >= localTime) {
                this.data.orders[idx] = { ...this.data.orders[idx], ...ro };
              } else {
                await safeAdminSetDoc("orders", this.data.orders[idx].id, this.data.orders[idx]);
              }
            } else {
              this.data.orders.push(ro);
            }
          }
        } else if (this.data.orders.length > 0) {
          for (const o of this.data.orders) {
            await safeAdminSetDoc("orders", o.id, o);
          }
        }
      } catch (e) {
        console.warn("[TumpangFood DB] Failed to sync orders with Firestore:", e.message);
      }
      try {
        const remoteSets = await safeAdminGetDocs("settlements");
        if (remoteSets.length > 0) {
          for (const rs of remoteSets) {
            const idx = this.data.settlements.findIndex((s) => s.id === rs.id);
            if (idx >= 0) {
              this.data.settlements[idx] = { ...this.data.settlements[idx], ...rs };
            } else {
              this.data.settlements.push(rs);
            }
          }
        } else if (this.data.settlements.length > 0) {
          for (const s of this.data.settlements) {
            await safeAdminSetDoc("settlements", s.id, s);
          }
        }
      } catch (e) {
        console.warn("[TumpangFood DB] Failed to sync settlements with Firestore:", e.message);
      }
      try {
        const remoteRegs = await safeAdminGetDocs("partnerRegistrations");
        if (remoteRegs.length > 0) {
          for (const rr of remoteRegs) {
            const idx = this.data.partnerRegistrations.findIndex((r) => r.id === rr.id);
            if (idx >= 0) {
              this.data.partnerRegistrations[idx] = { ...this.data.partnerRegistrations[idx], ...rr };
            } else {
              this.data.partnerRegistrations.push(rr);
            }
          }
        } else if (this.data.partnerRegistrations.length > 0) {
          for (const r of this.data.partnerRegistrations) {
            await safeAdminSetDoc("partnerRegistrations", r.id, r);
          }
        }
      } catch (e) {
        console.warn("[TumpangFood DB] Failed to sync partnerRegistrations with Firestore:", e.message);
      }
      try {
        const remoteLics = await safeAdminGetDocs("licenses");
        if (remoteLics.length > 0) {
          for (const rl of remoteLics) {
            const idx = this.data.licenses.findIndex((l) => l.key === rl.key);
            if (idx >= 0) {
              this.data.licenses[idx] = { ...this.data.licenses[idx], ...rl };
            } else {
              this.data.licenses.push(rl);
            }
          }
        } else if (this.data.licenses.length > 0) {
          for (const l of this.data.licenses) {
            await safeAdminSetDoc("licenses", l.key, l);
          }
        }
      } catch (e) {
        console.warn("[TumpangFood DB] Failed to sync licenses with Firestore:", e.message);
      }
      this.save();
      this.createBackup();
      console.log("[TumpangFood DB] Firestore Admin synchronization successful.");
    } catch (err) {
      console.error("[TumpangFood DB] Firestore sync failed, continuing locally:", err.message);
    }
  }
  // --- LOGGING ---
  log(userId, details, role = "SYSTEM") {
    const logItem = {
      id: "log_" + Math.random().toString(36).substring(2, 9),
      action: details.split(" ")[0] || "ACTION",
      userId,
      role,
      details,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.data.auditLogs.unshift(logItem);
    if (this.data.auditLogs.length > 250) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 250);
    }
    this.save();
    safeFirestoreSetDoc("auditLogs", logItem.id, logItem);
    return logItem;
  }
  getLogs() {
    return this.data.auditLogs;
  }
  // --- CONFIG ---
  getConfig() {
    return this.data.systemConfig;
  }
  async updateConfig(userId, updates) {
    const prevConfig = { ...this.data.systemConfig };
    this.data.systemConfig = { ...this.data.systemConfig, ...updates };
    this.save();
    this.log(userId, `Updated system configuration`, "ADMIN");
    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc("systemConfig", "config_1", this.data.systemConfig);
      if (!persisted) {
        this.data.systemConfig = prevConfig;
        this.save();
        throw new Error("[Produksi] Gagal menyimpan konfigurasi sistem ke cloud Firestore. Perubahan dibatalkan demi integritas data.");
      }
    } else {
      safeFirestoreSetDoc("systemConfig", "config_1", this.data.systemConfig);
    }
    return this.data.systemConfig;
  }
  // --- MERCHANTS ---
  getMerchants() {
    return this.data.merchants.map((m) => {
      const { password, ...safe } = m;
      return safe;
    });
  }
  getMerchantById(id) {
    const m = this.data.merchants.find((m2) => m2.id === id);
    if (!m) return void 0;
    const { password, ...safe } = m;
    return safe;
  }
  getMerchantByEmailOrPhone(identifier) {
    const clean = identifier.trim().toLowerCase();
    const cleanNumbers = identifier.replace(/[^0-9]/g, "");
    return this.data.merchants.find((m) => {
      const matchId = m.id.toLowerCase() === clean;
      const matchEmail = m.email && m.email.trim().toLowerCase() === clean;
      const matchPhone = m.phone === identifier;
      const matchCleanPhone = cleanNumbers.length >= 8 && m.phone.replace(/[^0-9]/g, "") === cleanNumbers;
      return matchId || matchEmail || matchPhone || matchCleanPhone;
    });
  }
  async createMerchant(userId, merchantData) {
    const newMerchant = {
      ...merchantData,
      id: "m_" + Math.random().toString(36).substring(2, 9),
      rating: 5,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (newMerchant.password && !newMerchant.password.startsWith("pbkdf2$")) {
      newMerchant.password = hashPassword(newMerchant.password);
    }
    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc("merchants", newMerchant.id, newMerchant);
      if (!persisted) {
        throw new Error("[Produksi] Gagal menyimpan merchant ke cloud Firestore. Transaksi dibatalkan demi menjaga integritas data.");
      }
    } else {
      safeFirestoreSetDoc("merchants", newMerchant.id, newMerchant);
    }
    this.data.merchants.push(newMerchant);
    this.save();
    this.log(userId, `Created merchant ${newMerchant.name}`, "ADMIN");
    return newMerchant;
  }
  async updateMerchant(userId, id, updates, role = "MERCHANT") {
    const index = this.data.merchants.findIndex((m) => m.id === id);
    if (index === -1) throw new Error("Merchant not found");
    const prevMerchant = { ...this.data.merchants[index] };
    const updatedData = { ...updates };
    if (updatedData.password && !updatedData.password.startsWith("pbkdf2$")) {
      updatedData.password = hashPassword(updatedData.password);
    }
    const nextMerchant = {
      ...this.data.merchants[index],
      ...updatedData,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc("merchants", id, nextMerchant);
      if (!persisted) {
        throw new Error("[Produksi] Gagal memperbarui merchant pada cloud Firestore. Perubahan dibatalkan demi integritas data.");
      }
    } else {
      safeFirestoreSetDoc("merchants", id, nextMerchant);
    }
    this.data.merchants[index] = nextMerchant;
    this.save();
    this.log(userId, `Updated merchant ${this.data.merchants[index].name}`, role);
    return this.data.merchants[index];
  }
  async deleteMerchant(userId, id) {
    const index = this.data.merchants.findIndex((m) => m.id === id);
    if (index === -1) return false;
    if (foodConfig.isProduction) {
      const deleted = await safeAdminDeleteDoc("merchants", id);
      if (!deleted) {
        throw new Error("[Produksi] Gagal menghapus merchant pada cloud Firestore. Operasi dibatalkan demi integritas data.");
      }
    } else {
      safeAdminDeleteDoc("merchants", id);
    }
    const name = this.data.merchants[index].name;
    this.data.merchants.splice(index, 1);
    this.data.categories = this.data.categories.filter((c) => c.merchantId !== id);
    this.data.menuItems = this.data.menuItems.filter((i) => i.merchantId !== id);
    this.save();
    this.log(userId, `Deleted merchant ${name}`, "ADMIN");
    return true;
  }
  async activateMerchant(email, passwordPlain) {
    const cleanEmail = email.trim().toLowerCase();
    const merchant = this.data.merchants.find((m) => m.email?.trim().toLowerCase() === cleanEmail);
    if (!merchant) {
      return { success: false, error: "Merchant dengan email tersebut tidak ditemukan." };
    }
    const prevMerchant = { ...merchant };
    merchant.active = true;
    merchant.isActivated = true;
    merchant.password = hashPassword(passwordPlain);
    merchant.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc("merchants", merchant.id, merchant);
      if (!persisted) {
        Object.assign(merchant, prevMerchant);
        throw new Error("[Produksi] Gagal mengaktifkan merchant pada cloud Firestore. Operasi dibatalkan.");
      }
    } else {
      safeFirestoreSetDoc("merchants", merchant.id, merchant);
    }
    if (this.data.partnerRegistrations) {
      const reg = this.data.partnerRegistrations.find((r) => r.email?.trim().toLowerCase() === cleanEmail && r.type === "MERCHANT");
      if (reg) {
        reg.status = "ACTIVATED";
        safeFirestoreSetDoc("partnerRegistrations", reg.id, reg);
      }
    }
    this.save();
    this.log(merchant.id, `Activated merchant store ${merchant.name}`, "MERCHANT");
    return { success: true, merchant };
  }
  // --- CATEGORIES ---
  getCategories(merchantId) {
    return this.data.categories.filter((c) => c.merchantId === merchantId).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  }
  async createCategory(merchantId, name) {
    const existing = this.getCategories(merchantId);
    const orderIndex = existing.length > 0 ? Math.max(...existing.map((e) => e.orderIndex)) + 1 : 1;
    const newCat = {
      id: "cat_" + Math.random().toString(36).substring(2, 9),
      merchantId,
      name: name.trim(),
      orderIndex
    };
    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc("categories", newCat.id, newCat);
      if (!persisted) {
        throw new Error("[Produksi] Gagal menyimpan kategori menu ke cloud Firestore. Operasi dibatalkan.");
      }
    } else {
      safeFirestoreSetDoc("categories", newCat.id, newCat);
    }
    this.data.categories.push(newCat);
    this.save();
    this.log(merchantId, `Created category ${name}`, "MERCHANT");
    return newCat;
  }
  async updateCategory(merchantId, id, name) {
    const cat = this.data.categories.find((c) => c.id === id && c.merchantId === merchantId);
    if (!cat) throw new Error("Category not found");
    const prevName = cat.name;
    cat.name = name.trim();
    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc("categories", id, cat);
      if (!persisted) {
        cat.name = prevName;
        throw new Error("[Produksi] Gagal memperbarui kategori menu di cloud Firestore. Operasi dibatalkan.");
      }
    } else {
      safeFirestoreSetDoc("categories", id, cat);
    }
    this.save();
    return cat;
  }
  async deleteCategory(merchantId, id) {
    const index = this.data.categories.findIndex((c) => c.id === id && c.merchantId === merchantId);
    if (index === -1) return false;
    if (foodConfig.isProduction) {
      const deleted = await safeAdminDeleteDoc("categories", id);
      if (!deleted) {
        throw new Error("[Produksi] Gagal menghapus kategori menu pada cloud Firestore. Operasi dibatalkan.");
      }
    } else {
      safeAdminDeleteDoc("categories", id);
    }
    this.data.categories.splice(index, 1);
    this.data.menuItems = this.data.menuItems.filter((i) => i.categoryId !== id);
    this.save();
    return true;
  }
  // --- MENU ITEMS ---
  getMenuItemsByMerchant(merchantId) {
    return this.data.menuItems.filter((i) => i.merchantId === merchantId);
  }
  getMenuItemById(id) {
    return this.data.menuItems.find((i) => i.id === id);
  }
  async createMenuItem(merchantId, itemData) {
    const newItem = {
      ...itemData,
      id: "item_" + Math.random().toString(36).substring(2, 9),
      merchantId,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc("menuItems", newItem.id, newItem);
      if (!persisted) {
        throw new Error("[Produksi] Gagal menyimpan item menu ke cloud Firestore. Operasi dibatalkan.");
      }
    } else {
      safeFirestoreSetDoc("menuItems", newItem.id, newItem);
    }
    this.data.menuItems.push(newItem);
    this.save();
    this.log(merchantId, `Created menu item ${newItem.name}`, "MERCHANT");
    return newItem;
  }
  async updateMenuItem(merchantId, id, updates) {
    const index = this.data.menuItems.findIndex((i) => i.id === id && i.merchantId === merchantId);
    if (index === -1) throw new Error("Menu item not found");
    const prevItem = { ...this.data.menuItems[index] };
    const nextItem = {
      ...this.data.menuItems[index],
      ...updates,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc("menuItems", id, nextItem);
      if (!persisted) {
        throw new Error("[Produksi] Gagal memperbarui item menu pada cloud Firestore. Operasi dibatalkan.");
      }
    } else {
      safeFirestoreSetDoc("menuItems", id, nextItem);
    }
    this.data.menuItems[index] = nextItem;
    this.save();
    this.log(merchantId, `Updated menu item ${this.data.menuItems[index].name}`, "MERCHANT");
    return this.data.menuItems[index];
  }
  async deleteMenuItem(merchantId, id) {
    const index = this.data.menuItems.findIndex((i) => i.id === id && i.merchantId === merchantId);
    if (index === -1) return false;
    if (foodConfig.isProduction) {
      const deleted = await safeAdminDeleteDoc("menuItems", id);
      if (!deleted) {
        throw new Error("[Produksi] Gagal menghapus item menu pada cloud Firestore. Operasi dibatalkan.");
      }
    } else {
      safeAdminDeleteDoc("menuItems", id);
    }
    const name = this.data.menuItems[index].name;
    this.data.menuItems.splice(index, 1);
    this.save();
    this.log(merchantId, `Deleted menu item ${name}`, "MERCHANT");
    return true;
  }
  // --- DRIVERS ---
  getDrivers() {
    return this.data.drivers.map((d) => {
      const { password, ...safe } = d;
      return safe;
    });
  }
  getDriverById(id) {
    const d = this.data.drivers.find((d2) => d2.id === id);
    if (!d) return void 0;
    const { password, ...safe } = d;
    return safe;
  }
  getDriverByEmailOrPhone(identifier) {
    const clean = identifier.trim().toLowerCase();
    const cleanPhone = identifier.replace(/[^0-9]/g, "");
    return this.data.drivers.find((d) => {
      const matchId = d.id.toLowerCase() === clean;
      const matchEmail = d.email && d.email.trim().toLowerCase() === clean;
      const matchPhone = d.phone === identifier;
      const matchCleanPhone = cleanPhone.length >= 8 && d.phone.replace(/[^0-9]/g, "") === cleanPhone;
      return matchId || matchEmail || matchPhone || matchCleanPhone;
    });
  }
  async createDriver(userId, driverData) {
    const newDriver = {
      ...driverData,
      id: "d_" + Math.random().toString(36).substring(2, 9),
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc("drivers", newDriver.id, newDriver);
      if (!persisted) {
        throw new Error("[Produksi] Gagal menyimpan driver ke cloud Firestore. Transaksi dibatalkan.");
      }
    } else {
      safeFirestoreSetDoc("drivers", newDriver.id, newDriver);
    }
    this.data.drivers.push(newDriver);
    this.save();
    this.log(userId, `Created driver ${newDriver.name}`, "ADMIN");
    return newDriver;
  }
  async updateDriver(userId, id, updates, role = "DRIVER") {
    const index = this.data.drivers.findIndex((d) => d.id === id);
    if (index === -1) throw new Error("Driver not found");
    const prevDriver = { ...this.data.drivers[index] };
    const nextDriver = {
      ...this.data.drivers[index],
      ...updates,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc("drivers", id, nextDriver);
      if (!persisted) {
        throw new Error("[Produksi] Gagal memperbarui driver pada cloud Firestore. Perubahan dibatalkan.");
      }
    } else {
      safeFirestoreSetDoc("drivers", id, nextDriver);
    }
    this.data.drivers[index] = nextDriver;
    this.save();
    this.log(userId, `Updated driver ${this.data.drivers[index].name}`, role);
    return this.data.drivers[index];
  }
  async deleteDriver(userId, id) {
    const index = this.data.drivers.findIndex((d) => d.id === id);
    if (index === -1) return false;
    if (foodConfig.isProduction) {
      const deleted = await safeAdminDeleteDoc("drivers", id);
      if (!deleted) {
        throw new Error("[Produksi] Gagal menghapus driver pada cloud Firestore. Operasi dibatalkan.");
      }
    } else {
      safeAdminDeleteDoc("drivers", id);
    }
    const name = this.data.drivers[index].name;
    this.data.drivers.splice(index, 1);
    this.save();
    this.log(userId, `Deleted driver ${name}`, "ADMIN");
    return true;
  }
  // --- ORDERS ---
  getOrders() {
    return this.data.orders;
  }
  getOrderById(id) {
    return this.data.orders.find((o) => o.id === id);
  }
  getOrdersByMerchant(merchantId) {
    return this.data.orders.filter((o) => o.merchantId === merchantId);
  }
  getOrdersByDriver(driverId) {
    return this.data.orders.filter((o) => o.driverId === driverId);
  }
  getOrdersByCustomerPhone(phone) {
    return this.data.orders.filter((o) => o.customerPhone === phone);
  }
  async createOrder(rawInput) {
    const merchant = this.getMerchantById(rawInput.merchantId);
    if (!merchant) throw new Error("Toko / Merchant tidak ditemukan.");
    const recentDuplicate = this.data.orders.find(
      (o) => o.merchantId === rawInput.merchantId && o.customerPhone === rawInput.customerPhone && Date.now() - new Date(o.createdAt).getTime() < 1e4 && o.status === "WAITING_PAYMENT" /* WAITING_PAYMENT */
    );
    if (recentDuplicate) {
      return recentDuplicate;
    }
    const activeUniqueCodes = this.data.orders.filter((o) => o.status === "WAITING_PAYMENT" /* WAITING_PAYMENT */ || o.status === "WAITING_PAYMENT_VERIFICATION" /* WAITING_PAYMENT_VERIFICATION */).map((o) => o.uniqueCode);
    const validatedOrderData = OrderService.validateAndBuildOrder(
      rawInput,
      merchant,
      this.data.menuItems,
      this.data.systemConfig,
      activeUniqueCodes
    );
    const newOrder = {
      ...validatedOrderData,
      id: "ord_" + Math.random().toString(36).substring(2, 9),
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.data.orders.unshift(newOrder);
    this.save();
    this.log("CUSTOMER", `Created order ${newOrder.id} Total: Rp ${newOrder.total.toLocaleString()} (UniqueCode: ${newOrder.uniqueCode})`, "CUSTOMER");
    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc("orders", newOrder.id, newOrder);
      if (!persisted) {
        this.data.orders.shift();
        this.save();
        throw new Error("[Produksi] Gagal menyimpan pesanan ke cloud Firestore. Transaksi dibatalkan secara aman demi mencegah kehilangan data.");
      }
    } else {
      safeFirestoreSetDoc("orders", newOrder.id, newOrder);
    }
    return newOrder;
  }
  async updateOrder(userId, id, updates, role) {
    const index = this.data.orders.findIndex((o) => o.id === id);
    if (index === -1) throw new Error("Order not found");
    const currentOrder = this.data.orders[index];
    const prevStatus = currentOrder.status;
    if (updates.status && updates.status !== prevStatus) {
      const check = OrderService.isValidStatusTransition(prevStatus, updates.status, role);
      if (!check.allowed) {
        throw new Error(check.reason || "Perubahan status pesanan tidak diizinkan.");
      }
    }
    if (role !== "ADMIN" && role !== "SYSTEM") {
      delete updates.subtotal;
      delete updates.deliveryFee;
      delete updates.serviceFee;
      delete updates.total;
      delete updates.uniqueCode;
    }
    this.data.orders[index] = {
      ...currentOrder,
      ...updates,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.save();
    if (updates.status && updates.status !== prevStatus) {
      this.log(userId, `Updated order ${id} status from ${prevStatus} to ${updates.status}`, role);
      if (updates.status === "PAYMENT_VERIFIED" /* PAYMENT_VERIFIED */ && this.data.systemConfig.assignmentMode === "AUTOMATIC" /* AUTOMATIC */) {
        await this.autoAssignDriver(id);
      }
    } else {
      this.log(userId, `Updated order ${id} details`, role);
    }
    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc("orders", id, this.data.orders[index]);
      if (!persisted) {
        this.data.orders[index] = currentOrder;
        this.save();
        throw new Error("[Produksi] Gagal memperbarui status pesanan pada cloud Firestore. Perubahan status dibatalkan.");
      }
    } else {
      safeFirestoreSetDoc("orders", id, this.data.orders[index]);
    }
    return this.data.orders[index];
  }
  async autoAssignDriver(orderId) {
    const order = this.getOrderById(orderId);
    if (!order) return;
    const availableDrivers = this.data.drivers.filter((d) => d.online && d.active);
    if (availableDrivers.length === 0) {
      this.log("SYSTEM", `No active drivers available for auto-assignment of order ${orderId}`, "SYSTEM");
      return;
    }
    const driverTaskCounts = availableDrivers.map((d) => {
      const activeTasks = this.data.orders.filter(
        (o) => o.driverId === d.id && ["PAYMENT_VERIFIED" /* PAYMENT_VERIFIED */, "COOKING" /* COOKING */, "READY_FOR_PICKUP" /* READY_FOR_PICKUP */, "ORDER_PICKED_UP" /* ORDER_PICKED_UP */].includes(o.status)
      ).length;
      return { driver: d, count: activeTasks };
    });
    driverTaskCounts.sort((a, b) => a.count - b.count);
    const selectedDriver = driverTaskCounts[0].driver;
    await this.updateOrder("SYSTEM", orderId, {
      driverId: selectedDriver.id,
      driverName: selectedDriver.name
    }, "SYSTEM");
  }
  async manualAssignDriver(userId, orderId, driverId) {
    const driver = this.getDriverById(driverId);
    if (!driver) throw new Error("Driver not found");
    const updated = await this.updateOrder(userId, orderId, {
      driverId: driver.id,
      driverName: driver.name
    }, "ADMIN");
    this.log(userId, `Assigned driver ${driver.name} to order ${orderId}`, "ADMIN");
    return updated;
  }
  // --- SETTLEMENTS ---
  getSettlements() {
    return this.data.settlements;
  }
  getSettlementsByMerchant(merchantId) {
    return this.data.settlements.filter((s) => s.merchantId === merchantId);
  }
  /**
   * Serializes settlement operations across the process and host instances to prevent concurrent double-settlements
   */
  async runWithSettlementLock(fn) {
    let release;
    const waitPromise = new Promise((resolve) => {
      release = resolve;
    });
    const currentMutex = this.settlementMutex;
    this.settlementMutex = currentMutex.then(() => waitPromise).catch(() => waitPromise);
    await currentMutex;
    const lockPath = path3.join(path3.dirname(FOOD_DB_FILE), "settlement_operation.lock");
    let fileLockAcquired = false;
    for (let attempts = 0; attempts < 30; attempts++) {
      try {
        const fd = fs3.openSync(lockPath, "wx");
        fs3.writeSync(fd, `${process.pid}:${Date.now()}`);
        fs3.closeSync(fd);
        fileLockAcquired = true;
        break;
      } catch (err) {
        if (err.code === "EEXIST") {
          try {
            const stats = fs3.statSync(lockPath);
            if (Date.now() - stats.mtimeMs > 15e3) {
              fs3.unlinkSync(lockPath);
              continue;
            }
          } catch {
          }
          await new Promise((r) => setTimeout(r, 100));
        } else {
          break;
        }
      }
    }
    try {
      return await fn();
    } finally {
      if (fileLockAcquired) {
        try {
          fs3.unlinkSync(lockPath);
        } catch {
        }
      }
      release();
    }
  }
  async createSettlement(userId, settlementData) {
    return this.runWithSettlementLock(async () => {
      const targetOrderIds = settlementData.orderIds || [];
      if (!Array.isArray(targetOrderIds) || targetOrderIds.length === 0) {
        throw new Error("Settlement wajib menyertakan setidaknya satu ID pesanan yang memenuhi syarat.");
      }
      const merchant = this.data.merchants.find((m) => m.id === settlementData.merchantId);
      if (!merchant) {
        throw new Error(`Merchant dengan ID "${settlementData.merchantId}" tidak ditemukan.`);
      }
      const verifiedOrders = [];
      for (const ordId of targetOrderIds) {
        const ord = this.data.orders.find((o) => o.id === ordId);
        if (!ord) {
          throw new Error(`Pesanan "${ordId}" tidak ditemukan dalam database.`);
        }
        if (ord.merchantId !== settlementData.merchantId) {
          throw new Error(`Pesanan "${ordId}" bukan milik merchant ${settlementData.merchantId}.`);
        }
        if (ord.status !== "COMPLETED" /* COMPLETED */) {
          throw new Error(`Pesanan "${ordId}" belum selesai (status: ${ord.status}). Hanya pesanan COMPLETED yang dapat dicairkan.`);
        }
        if (ord.isSettled === true || ord.settlementId) {
          throw new Error(`Pesanan "${ordId}" sudah pernah dicairkan dalam settlement sebelumnya. Pencairan ganda dicegah secara atomik.`);
        }
        verifiedOrders.push(ord);
      }
      const orderCount = verifiedOrders.length;
      const totalSales = verifiedOrders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
      const commissionPercent = this.data.systemConfig.commissionPercent || 10;
      const totalCommission = Math.round(totalSales * commissionPercent / 100);
      const amountToPay = Math.max(0, totalSales - totalCommission);
      const settlementId = "set_" + Math.random().toString(36).substring(2, 9);
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const newSettlement = {
        id: settlementId,
        merchantId: merchant.id,
        merchantName: merchant.name,
        orderCount,
        totalSales,
        totalCommission,
        amountToPay,
        status: settlementData.status || "WAITING_CONFIRMATION" /* WAITING_CONFIRMATION */,
        bankName: settlementData.bankName || merchant.bankName || "Bank Mandiri",
        bankAccount: settlementData.bankAccount || merchant.bankAccount || "-",
        bankHolder: settlementData.bankHolder || merchant.bankHolder || merchant.ownerName,
        createdAt: nowIso
      };
      const adminDb2 = getAdminDb();
      if (adminDb2) {
        try {
          await runAdminTransaction(async (transaction) => {
            for (const ordId of targetOrderIds) {
              const orderRef = adminDb2.collection("orders").doc(ordId);
              const remoteSnap = await transaction.get(orderRef);
              if (remoteSnap.exists) {
                const remoteData = remoteSnap.data();
                if (remoteData?.isSettled === true || remoteData?.settlementId) {
                  throw new Error(`Pesanan "${ordId}" telah dicairkan oleh instance backend lain. Pencairan ganda lintas-instance dicegah secara atomik.`);
                }
              }
            }
            for (const ord of verifiedOrders) {
              const orderRef = adminDb2.collection("orders").doc(ord.id);
              transaction.set(orderRef, removeUndefinedFields({
                ...ord,
                isSettled: true,
                settlementId,
                settledAt: nowIso,
                updatedAt: nowIso
              }), { merge: true });
            }
            const settlementRef = adminDb2.collection("settlements").doc(newSettlement.id);
            transaction.set(settlementRef, removeUndefinedFields(newSettlement));
          });
        } catch (txErr) {
          if (txErr.message && txErr.message.includes("telah dicairkan")) {
            throw txErr;
          }
          if (foodConfig.isProduction) {
            throw new Error(`[Produksi] Transaksi cloud Firestore gagal: ${txErr.message}. Pencairan dibatalkan demi menjaga integritas data keuangan.`);
          }
          console.warn("[TumpangFood DB] Distributed Firestore Admin transaction fallback in development mode:", txErr.message);
        }
      } else if (foodConfig.isProduction) {
        throw new Error("[Produksi] Firebase Admin Firestore wajib aktif dan terhubung untuk memproses pencairan dana (settlement).");
      }
      for (const ord of verifiedOrders) {
        ord.isSettled = true;
        ord.settlementId = settlementId;
        ord.settledAt = nowIso;
        ord.updatedAt = nowIso;
        safeFirestoreSetDoc("orders", ord.id, ord);
      }
      this.data.settlements.unshift(newSettlement);
      this.save();
      this.createBackup();
      this.log(
        userId,
        `Created settlement ${settlementId} of Rp ${amountToPay.toLocaleString()} for ${merchant.name} (${orderCount} pesanan)`,
        "ADMIN"
      );
      safeFirestoreSetDoc("settlements", newSettlement.id, newSettlement);
      return newSettlement;
    });
  }
  async updateSettlement(userId, id, updates) {
    const index = this.data.settlements.findIndex((s) => s.id === id);
    if (index === -1) throw new Error("Settlement not found");
    const nextSettlement = {
      ...this.data.settlements[index],
      ...updates,
      paidAt: updates.status === "SETTLEMENT_COMPLETED" /* SETTLEMENT_COMPLETED */ ? (/* @__PURE__ */ new Date()).toISOString() : this.data.settlements[index].paidAt
    };
    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc("settlements", id, nextSettlement);
      if (!persisted) {
        throw new Error("[Produksi] Gagal memperbarui settlement di cloud Firestore. Perubahan dibatalkan.");
      }
    } else {
      safeFirestoreSetDoc("settlements", id, nextSettlement);
    }
    this.data.settlements[index] = nextSettlement;
    this.save();
    this.createBackup();
    this.log(userId, `Updated settlement ${id} to status ${this.data.settlements[index].status}`, "ADMIN");
    return this.data.settlements[index];
  }
  async confirmSettlement(userId, id) {
    return this.updateSettlement(userId, id, { status: "SETTLEMENT_COMPLETED" /* SETTLEMENT_COMPLETED */ });
  }
  async generateHPlusOneSettlements(userId) {
    return this.runWithSettlementLock(async () => {
      const targetOrders = this.data.orders.filter(
        (o) => o.status === "COMPLETED" /* COMPLETED */ && !o.isSettled && !o.settlementId
      );
      if (targetOrders.length === 0) return [];
      const grouped = /* @__PURE__ */ new Map();
      for (const o of targetOrders) {
        const list = grouped.get(o.merchantId) || [];
        list.push(o);
        grouped.set(o.merchantId, list);
      }
      const createdSettlements = [];
      const commissionPercent = this.data.systemConfig.commissionPercent || 10;
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      for (const [merchantId, orders] of grouped.entries()) {
        const merchant = this.data.merchants.find((m) => m.id === merchantId);
        if (!merchant) continue;
        const orderCount = orders.length;
        const totalSales = orders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
        const totalCommission = Math.round(totalSales * commissionPercent / 100);
        const amountToPay = Math.max(0, totalSales - totalCommission);
        const settlementId = "set_" + Math.random().toString(36).substring(2, 9);
        const newSettlement = {
          id: settlementId,
          merchantId,
          merchantName: merchant.name,
          orderCount,
          totalSales,
          totalCommission,
          amountToPay,
          status: "WAITING_CONFIRMATION" /* WAITING_CONFIRMATION */,
          bankName: merchant.bankName || "Bank Mandiri",
          bankAccount: merchant.bankAccount || "-",
          bankHolder: merchant.bankHolder || merchant.ownerName,
          createdAt: nowIso
        };
        const adminDb2 = getAdminDb();
        if (adminDb2) {
          try {
            await runAdminTransaction(async (transaction) => {
              for (const o of orders) {
                const orderRef = adminDb2.collection("orders").doc(o.id);
                const snap = await transaction.get(orderRef);
                if (snap.exists) {
                  const data = snap.data();
                  if (data?.isSettled === true || data?.settlementId) {
                    throw new Error(`Order ${o.id} already settled.`);
                  }
                }
              }
              for (const o of orders) {
                const orderRef = adminDb2.collection("orders").doc(o.id);
                transaction.set(orderRef, removeUndefinedFields({
                  ...o,
                  isSettled: true,
                  settlementId,
                  settledAt: nowIso,
                  updatedAt: nowIso
                }), { merge: true });
              }
              const settlementRef = adminDb2.collection("settlements").doc(newSettlement.id);
              transaction.set(settlementRef, removeUndefinedFields(newSettlement));
            });
          } catch (txErr) {
            if (foodConfig.isProduction) {
              throw new Error(`[Produksi] Transaksi cloud Firestore gagal untuk merchant ${merchantId}: ${txErr.message}`);
            }
            console.warn(`[TumpangFood DB] H+1 atomic transaction fallback for ${merchantId}:`, txErr.message);
          }
        } else if (foodConfig.isProduction) {
          throw new Error("[Produksi] Firebase Admin Firestore wajib aktif untuk membuat H+1 settlements.");
        }
        for (const o of orders) {
          o.isSettled = true;
          o.settlementId = settlementId;
          o.settledAt = nowIso;
          o.updatedAt = nowIso;
          safeFirestoreSetDoc("orders", o.id, o);
        }
        this.data.settlements.unshift(newSettlement);
        safeFirestoreSetDoc("settlements", newSettlement.id, newSettlement);
        createdSettlements.push(newSettlement);
      }
      this.save();
      this.createBackup();
      this.log(userId, `Generated H+1 settlements for ${createdSettlements.length} merchants`, "ADMIN");
      return createdSettlements;
    });
  }
  // --- PARTNER REGISTRATIONS ---
  getPartnerRegistrations() {
    return this.data.partnerRegistrations;
  }
  async createPartnerRegistration(regData) {
    const newReg = {
      ...regData,
      id: "reg_" + Math.random().toString(36).substring(2, 9),
      status: "PENDING",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc("partnerRegistrations", newReg.id, newReg);
      if (!persisted) {
        throw new Error("[Produksi] Gagal menyimpan pendaftaran mitra ke cloud Firestore. Transaksi dibatalkan.");
      }
    } else {
      safeFirestoreSetDoc("partnerRegistrations", newReg.id, newReg);
    }
    this.data.partnerRegistrations.push(newReg);
    this.save();
    this.log("CUSTOMER", `Submitted partner registration for ${newReg.name} (${newReg.type})`, "CUSTOMER");
    return newReg;
  }
  async approvePartnerRegistration(userId, id) {
    const reg = this.data.partnerRegistrations.find((r) => r.id === id);
    if (!reg) return { success: false, error: "Registration not found" };
    if (reg.status !== "PENDING") return { success: false, error: "Registration already processed" };
    const prevStatus = reg.status;
    reg.status = "APPROVED";
    if (reg.type === "MERCHANT") {
      const generatedPassword = "TF-" + Math.floor(1e3 + Math.random() * 9e3);
      reg.password = generatedPassword;
      const newMerchant = await this.createMerchant(userId, {
        name: reg.storeName || reg.name + " Store",
        ownerName: reg.name,
        phone: reg.phone,
        address: reg.storeAddress || "Alamat Toko",
        latitude: reg.latitude || -7.9482,
        longitude: reg.longitude || 112.7612,
        openTime: "08:00",
        closeTime: "21:00",
        bankName: "Bank BRI",
        bankAccount: "1234567890",
        bankHolder: reg.name,
        active: true,
        cookTimeEstimate: "15-30 min",
        image: reg.businessPhoto || "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        description: "Toko baru bergabung di Tumpang Food!",
        category: reg.category || "Nasi & Lauk",
        email: reg.email,
        isActivated: true,
        password: hashPassword(generatedPassword),
        businessPhoto: reg.businessPhoto,
        idPhoto: reg.idPhoto,
        contractPhoto: reg.contractPhoto
      });
      reg.storeId = newMerchant.id;
      const defaultCategory = await this.createCategory(newMerchant.id, "Menu Utama");
      await this.createMenuItem(newMerchant.id, {
        categoryId: defaultCategory.id,
        name: "Nasi Goreng Spesial (Contoh)",
        description: "Nasi goreng lezat dengan bumbu khas, telur, dan kerupuk.",
        price: 15e3,
        available: true,
        image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
      });
    } else if (reg.type === "DRIVER") {
      await this.createDriver(userId, {
        name: reg.name,
        phone: reg.phone,
        email: reg.email,
        active: true,
        online: false,
        latitude: -7.9482,
        longitude: 112.7612
      });
    }
    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc("partnerRegistrations", reg.id, reg);
      if (!persisted) {
        reg.status = prevStatus;
        throw new Error("[Produksi] Gagal memperbarui status registrasi mitra ke cloud Firestore.");
      }
    } else {
      safeFirestoreSetDoc("partnerRegistrations", reg.id, reg);
    }
    this.save();
    this.log(userId, `Approved partner registration ${reg.id} (${reg.name})`, "ADMIN");
    return { success: true, registration: reg };
  }
  async rejectPartnerRegistration(userId, id) {
    const reg = this.data.partnerRegistrations.find((r) => r.id === id);
    if (!reg) return false;
    const prevStatus = reg.status;
    reg.status = "REJECTED";
    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc("partnerRegistrations", reg.id, reg);
      if (!persisted) {
        reg.status = prevStatus;
        throw new Error("[Produksi] Gagal menolak pendaftaran mitra pada cloud Firestore.");
      }
    } else {
      safeFirestoreSetDoc("partnerRegistrations", reg.id, reg);
    }
    this.save();
    this.log(userId, `Rejected partner registration ${reg.id} (${reg.name})`, "ADMIN");
    return true;
  }
  // --- LICENSES ---
  getLicenses() {
    return this.data.licenses;
  }
  async createLicense(userId, key, durationDays) {
    const cleanKey = key.trim().toUpperCase();
    if (this.data.licenses.some((l) => l.key === cleanKey)) {
      throw new Error("Kode lisensi sudah terdaftar");
    }
    const newLicense = {
      key: cleanKey,
      durationDays: Number(durationDays) || 30,
      status: "UNUSED",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc("licenses", cleanKey, newLicense);
      if (!persisted) {
        throw new Error("[Produksi] Gagal menyimpan lisensi ke cloud Firestore. Transaksi dibatalkan.");
      }
    } else {
      safeFirestoreSetDoc("licenses", cleanKey, newLicense);
    }
    this.data.licenses.unshift(newLicense);
    this.save();
    this.log(userId, `Created license key ${cleanKey} for ${durationDays} days`, "ADMIN");
    return newLicense;
  }
  async redeemLicense(merchantId, key) {
    return this.runWithSettlementLock(async () => {
      const cleanKey = key.trim().toUpperCase();
      const license = this.data.licenses.find((l) => l.key === cleanKey);
      if (!license) throw new Error("Kode lisensi tidak valid / tidak ditemukan.");
      if (license.status === "USED") throw new Error("Kode lisensi ini sudah digunakan.");
      const merchant = this.data.merchants.find((m) => m.id === merchantId);
      if (!merchant) throw new Error("Merchant tidak ditemukan.");
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const expirationDate = /* @__PURE__ */ new Date();
      expirationDate.setDate(expirationDate.getDate() + license.durationDays);
      const updatedLicense = {
        ...license,
        status: "USED",
        usedByMerchantId: merchantId,
        usedByMerchantName: merchant.name,
        usedAt: nowIso
      };
      const updatedMerchant = {
        ...merchant,
        isPremium: true,
        licenseKey: cleanKey,
        licenseExpiresAt: expirationDate.toISOString(),
        preOrderOnly: true,
        allowInstantAndPreOrder: false,
        preOrderMinAmount: merchant.preOrderMinAmount || 1,
        preOrderLeadDays: merchant.preOrderLeadDays || 1,
        updatedAt: nowIso
      };
      const adminDb2 = getAdminDb();
      if (adminDb2) {
        try {
          await runAdminTransaction(async (transaction) => {
            const licRef = adminDb2.collection("licenses").doc(cleanKey);
            const licSnap = await transaction.get(licRef);
            if (licSnap.exists) {
              const remoteLic = licSnap.data();
              if (remoteLic?.status === "USED") {
                throw new Error("Kode lisensi ini sudah digunakan oleh merchant lain.");
              }
            }
            transaction.set(licRef, removeUndefinedFields(updatedLicense), { merge: true });
            const merRef = adminDb2.collection("merchants").doc(merchantId);
            transaction.set(merRef, removeUndefinedFields(updatedMerchant), { merge: true });
          });
        } catch (txErr) {
          if (txErr.message && txErr.message.includes("sudah digunakan")) {
            throw txErr;
          }
          if (foodConfig.isProduction) {
            throw new Error(`[Produksi] Transaksi cloud Firestore gagal untuk redeem lisensi: ${txErr.message}`);
          }
          console.warn("[TumpangFood DB] Distributed Firestore Admin transaction fallback for license in dev mode:", txErr.message);
        }
      } else if (foodConfig.isProduction) {
        throw new Error("[Produksi] Firebase Admin Firestore wajib aktif untuk aktivasi lisensi.");
      }
      const licIndex = this.data.licenses.findIndex((l) => l.key === cleanKey);
      if (licIndex >= 0) this.data.licenses[licIndex] = updatedLicense;
      const merIndex = this.data.merchants.findIndex((m) => m.id === merchantId);
      if (merIndex >= 0) this.data.merchants[merIndex] = updatedMerchant;
      this.save();
      this.createBackup();
      this.log(merchantId, `Redeemed license key ${cleanKey}`, "MERCHANT");
      safeFirestoreSetDoc("licenses", cleanKey, updatedLicense);
      safeFirestoreSetDoc("merchants", merchantId, updatedMerchant);
      return updatedMerchant;
    });
  }
};
var foodDb = new FoodDatabase();

// src/server/routes/authRoutes.ts
import { Router } from "express";
var authRouter = Router();
authRouter.post("/login", (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username/Email dan kata sandi wajib diisi." });
  }
  const cleanUser = String(username).trim().toLowerCase();
  const cleanPass = String(password).trim();
  if (role === "ADMIN") {
    const isTargetAdmin = isAdminEmail(cleanUser);
    const isValidAdminPass = cleanPass === foodConfig.adminPassword;
    if (!isTargetAdmin || !isValidAdminPass) {
      return res.status(401).json({ error: "Email atau kata sandi Administrator salah." });
    }
    const token = createAuthToken({
      userId: "admin",
      role: "ADMIN",
      email: cleanUser
    });
    foodDb.log("admin", `Admin ${cleanUser} logged in successfully`, "ADMIN");
    return res.json({
      token,
      role: "ADMIN",
      user: { id: "admin", name: "Administrator Tumpang Go", username: cleanUser }
    });
  }
  if (role === "MERCHANT") {
    const merchant = foodDb.getMerchantByEmailOrPhone(username);
    if (!merchant) {
      return res.status(401).json({ error: "Email atau No. Telepon ini tidak terdaftar sebagai Merchant Toko." });
    }
    let isPasswordValid = false;
    if (merchant.password) {
      const { valid, needsRehash } = verifyPassword(cleanPass, merchant.password);
      isPasswordValid = valid;
      if (needsRehash) {
        foodDb.updateMerchant("SYSTEM", merchant.id, { password: hashPassword(cleanPass) }, "MERCHANT");
      }
    } else {
      return res.status(401).json({ error: "Akun toko belum memiliki kata sandi aktif. Silakan lakukan aktivasi akun terlebih dahulu." });
    }
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Kata sandi toko salah. Silakan periksa kembali." });
    }
    const token = createAuthToken({
      userId: merchant.id,
      role: "MERCHANT",
      email: merchant.email,
      entityId: merchant.id
    });
    foodDb.log(merchant.id, `Merchant ${merchant.name} logged in`, "MERCHANT");
    return res.json({
      token,
      role: "MERCHANT",
      user: { id: merchant.id, name: merchant.name, phone: merchant.phone, email: merchant.email }
    });
  }
  if (role === "DRIVER") {
    const driver = foodDb.getDriverByEmailOrPhone(username);
    if (!driver) {
      return res.status(401).json({ error: "No. WhatsApp atau Email ini tidak terdaftar sebagai Driver / Kurir." });
    }
    let isDriverPassValid = false;
    if (driver.password) {
      const { valid, needsRehash } = verifyPassword(cleanPass, driver.password);
      isDriverPassValid = valid;
      if (needsRehash) {
        foodDb.updateDriver("SYSTEM", driver.id, { password: hashPassword(cleanPass) }, "DRIVER");
      }
    } else {
      return res.status(401).json({ error: "Akun driver belum memiliki kata sandi aktif. Silakan hubungi admin untuk aktivasi." });
    }
    if (!isDriverPassValid) {
      return res.status(401).json({ error: "Kata sandi driver salah. Silakan periksa kembali." });
    }
    const token = createAuthToken({
      userId: driver.id,
      role: "DRIVER",
      email: driver.email,
      entityId: driver.id
    });
    foodDb.log(driver.id, `Driver ${driver.name} logged in`, "DRIVER");
    return res.json({
      token,
      role: "DRIVER",
      user: { id: driver.id, name: driver.name, phone: driver.phone }
    });
  }
  return res.status(400).json({ error: "Peran akun tidak dikenali." });
});
authRouter.post("/merchants/register", async (req, res) => {
  const { name, ownerName, phone, email, category, address, description, password } = req.body;
  if (!name || !ownerName || !phone || !password) {
    return res.status(400).json({ error: "Mohon lengkapi Nama Toko, Nama Pemilik, No. WhatsApp, dan Kata Sandi." });
  }
  try {
    const cleanPhone = String(phone).trim();
    const cleanEmail = email ? String(email).trim().toLowerCase() : "";
    const existingMerchants = foodDb.getMerchants();
    const duplicate = existingMerchants.find(
      (m) => m.phone && m.phone === cleanPhone || cleanEmail && m.email && m.email.toLowerCase() === cleanEmail
    );
    if (duplicate) {
      return res.status(400).json({ error: "No. HP/WhatsApp atau Email ini sudah terdaftar sebagai Merchant." });
    }
    const newMerchant = await foodDb.createMerchant("SYSTEM_REGISTER", {
      name: String(name).trim(),
      ownerName: String(ownerName).trim(),
      phone: cleanPhone,
      email: cleanEmail || void 0,
      category: category || "Nasi & Lauk",
      address: address ? String(address).trim() : "Kecamatan Tumpang, Kabupaten Malang",
      description: description ? String(description).trim() : "Mitra Kuliner UMKM Kecamatan Tumpang",
      image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500&auto=format&fit=crop&q=60",
      bannerImage: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&auto=format&fit=crop&q=60",
      openTime: "08:00",
      closeTime: "21:00",
      bankName: "Bank BRI",
      bankAccount: "1234567890",
      bankHolder: String(ownerName).trim(),
      active: true,
      isActivated: true,
      cookTimeEstimate: "15-30 min",
      password: String(password).trim(),
      latitude: -7.9482,
      longitude: 112.7612
    });
    const token = createAuthToken({
      userId: newMerchant.id,
      role: "MERCHANT",
      email: newMerchant.email,
      entityId: newMerchant.id
    });
    return res.status(201).json({
      success: true,
      message: "Pendaftaran Merchant berhasil!",
      merchant: newMerchant,
      token
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Gagal mendaftarkan toko." });
  }
});
authRouter.post("/merchants/activate", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email dan password wajib diisi." });
  }
  try {
    const result = await foodDb.activateMerchant(email, password);
    if (result.success) {
      res.json({ success: true, merchant: result.merchant });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// src/server/routes/merchantRoutes.ts
import { Router as Router2 } from "express";
var merchantRouter = Router2();
merchantRouter.get("/", (req, res) => {
  res.json(foodDb.getMerchants());
});
merchantRouter.get("/:id", (req, res) => {
  const m = foodDb.getMerchantById(req.params.id);
  if (!m) return res.status(404).json({ error: "Merchant not found" });
  res.json(m);
});
merchantRouter.post("/", requireRole(["ADMIN"]), async (req, res) => {
  const merchantData = req.body;
  try {
    const actorId = req.user?.userId || "admin";
    const created = await foodDb.createMerchant(actorId, merchantData);
    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
merchantRouter.put("/:id", requireMerchantOwner("id"), async (req, res) => {
  const updates = { ...req.body };
  delete updates.id;
  try {
    const actorId = req.user?.userId || req.user?.entityId || req.params.id;
    const actorRole = req.user?.role === "ADMIN" ? "ADMIN" : "MERCHANT";
    const updated = await foodDb.updateMerchant(actorId, req.params.id, updates, actorRole);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
merchantRouter.delete("/:id", requireRole(["ADMIN"]), async (req, res) => {
  const actorId = req.user?.userId || "admin";
  try {
    const success = await foodDb.deleteMerchant(actorId, req.params.id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: "Merchant not found" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
merchantRouter.get("/:id/categories", (req, res) => {
  res.json(foodDb.getCategories(req.params.id));
});
merchantRouter.post("/:id/categories", requireMerchantOwner("id"), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Nama kategori wajib diisi." });
  }
  try {
    const created = await foodDb.createCategory(req.params.id, name.trim());
    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
merchantRouter.put("/:merchantId/categories/:id", requireMerchantOwner("merchantId"), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Nama kategori wajib diisi." });
  }
  try {
    const updated = await foodDb.updateCategory(req.params.merchantId, req.params.id, name.trim());
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
merchantRouter.delete("/:merchantId/categories/:id", requireMerchantOwner("merchantId"), async (req, res) => {
  try {
    const success = await foodDb.deleteCategory(req.params.merchantId, req.params.id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: "Category not found" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
merchantRouter.get("/:id/menu", (req, res) => {
  res.json(foodDb.getMenuItemsByMerchant(req.params.id));
});
merchantRouter.post("/:id/menu", requireMerchantOwner("id"), async (req, res) => {
  try {
    const created = await foodDb.createMenuItem(req.params.id, req.body);
    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
merchantRouter.put("/:merchantId/menu/:id", requireMerchantOwner("merchantId"), async (req, res) => {
  try {
    const updated = await foodDb.updateMenuItem(req.params.merchantId, req.params.id, req.body);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
merchantRouter.delete("/:merchantId/menu/:id", requireMerchantOwner("merchantId"), async (req, res) => {
  try {
    const success = await foodDb.deleteMenuItem(req.params.merchantId, req.params.id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: "Menu item not found" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
merchantRouter.get("/:merchantId/orders", requireMerchantOwner("merchantId"), (req, res) => {
  res.json(foodDb.getOrdersByMerchant(req.params.merchantId));
});
merchantRouter.get("/:merchantId/settlements", requireMerchantOwner("merchantId"), (req, res) => {
  res.json(foodDb.getSettlementsByMerchant(req.params.merchantId));
});
merchantRouter.post("/:id/redeem-license", requireMerchantOwner("id"), async (req, res) => {
  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ error: "Kode lisensi wajib diisi." });
  }
  try {
    const updatedMerchant = await foodDb.redeemLicense(req.params.id, key);
    res.json(updatedMerchant);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// src/server/routes/driverRoutes.ts
import { Router as Router3 } from "express";
var driverRouter = Router3();
driverRouter.get("/", (req, res) => {
  const drivers = foodDb.getDrivers();
  const sanitized = drivers.map((d) => ({
    id: d.id,
    name: d.name,
    phone: d.phone,
    active: d.active
  }));
  res.json(sanitized);
});
driverRouter.get("/:id", requireDriverSelf("id"), (req, res) => {
  const d = foodDb.getDriverById(req.params.id);
  if (!d) return res.status(404).json({ error: "Driver not found" });
  res.json(d);
});
driverRouter.post("/", requireRole(["ADMIN"]), async (req, res) => {
  const { userId, ...driverData } = req.body;
  try {
    const created = await foodDb.createDriver(req.user?.userId || userId || "admin", driverData);
    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
driverRouter.put("/:id", requireDriverSelf("id"), async (req, res) => {
  const { userId, role, ...updates } = req.body;
  try {
    const updated = await foodDb.updateDriver(
      req.user?.userId || userId || req.params.id,
      req.params.id,
      updates,
      req.user?.role || role || "DRIVER"
    );
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
driverRouter.delete("/:id", requireRole(["ADMIN"]), async (req, res) => {
  const { userId } = req.body;
  try {
    const success = await foodDb.deleteDriver(req.user?.userId || userId || "admin", req.params.id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: "Driver not found" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
driverRouter.get("/:driverId/orders", requireDriverSelf("driverId"), (req, res) => {
  res.json(foodDb.getOrdersByDriver(req.params.driverId));
});

// src/server/routes/orderRoutes.ts
import { Router as Router4 } from "express";
var orderRouter = Router4();
orderRouter.get("/", (req, res) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: "Autentikasi diperlukan untuk melihat daftar pesanan." });
  }
  if (user.role === "ADMIN") {
    return res.json(foodDb.getOrders());
  }
  if (user.role === "MERCHANT" && user.entityId) {
    return res.json(foodDb.getOrdersByMerchant(user.entityId));
  }
  if (user.role === "DRIVER" && user.entityId) {
    return res.json(foodDb.getOrdersByDriver(user.entityId));
  }
  return res.status(403).json({ error: "Akses ditolak." });
});
orderRouter.get("/:id", (req, res) => {
  const o = foodDb.getOrderById(req.params.id);
  if (!o) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  res.json(o);
});
orderRouter.get("/customer/:phone", (req, res) => {
  res.json(foodDb.getOrdersByCustomerPhone(req.params.phone));
});
orderRouter.post("/", async (req, res) => {
  try {
    const created = await foodDb.createOrder(req.body);
    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: e.message || "Gagal membuat pesanan." });
  }
});
orderRouter.put("/:id", async (req, res) => {
  const user = req.user;
  const currentOrder = foodDb.getOrderById(req.params.id);
  if (!currentOrder) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  }
  const { userId, role, customerPhone, cancelReason, overrideExpired, ...rawUpdates } = req.body;
  const updates = { ...rawUpdates };
  delete updates.isSettled;
  delete updates.settlementId;
  delete updates.settledAt;
  delete updates.total;
  delete updates.subtotal;
  delete updates.serviceFee;
  delete updates.deliveryFee;
  delete updates.merchantId;
  delete updates.id;
  if (!user) {
    const isCustomerCancel = updates.status === "CANCELLED" /* CANCELLED */ && customerPhone && String(customerPhone).trim() === String(currentOrder.customerPhone).trim() && (currentOrder.status === "WAITING_PAYMENT" /* WAITING_PAYMENT */ || currentOrder.status === "WAITING_PAYMENT_VERIFICATION" /* WAITING_PAYMENT_VERIFICATION */);
    if (!isCustomerCancel) {
      return res.status(401).json({
        error: "Akses ditolak: Autentikasi diperlukan untuk mengubah status atau data pesanan."
      });
    }
    try {
      const updated = await foodDb.updateOrder(
        "CUSTOMER",
        req.params.id,
        {
          status: "CANCELLED" /* CANCELLED */,
          cancelReason: cancelReason || "Dibatalkan oleh Pelanggan"
        },
        "CUSTOMER"
      );
      return res.json(updated);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }
  if (user.role === "MERCHANT") {
    if (user.entityId !== currentOrder.merchantId && user.userId !== currentOrder.merchantId) {
      return res.status(403).json({
        error: "Akses ditolak: Anda tidak memiliki izin untuk mengelola pesanan milik toko lain."
      });
    }
    if (updates.status) {
      const allowedMerchantStatuses = [
        "COOKING" /* COOKING */,
        "READY_FOR_PICKUP" /* READY_FOR_PICKUP */,
        "CANCELLED" /* CANCELLED */
      ];
      if (!allowedMerchantStatuses.includes(updates.status)) {
        return res.status(403).json({
          error: `Merchant tidak diizinkan mengubah status pesanan ke ${updates.status}.`
        });
      }
    }
  }
  if (user.role === "DRIVER") {
    const isAssigned = currentOrder.driverId === user.entityId || currentOrder.driverId === user.userId;
    const canAcceptTask = !currentOrder.driverId && currentOrder.status === "READY_FOR_PICKUP" /* READY_FOR_PICKUP */;
    if (!isAssigned && !canAcceptTask) {
      return res.status(403).json({
        error: "Akses ditolak: Pesanan ini bukan tugas pengantaran Anda."
      });
    }
    if (updates.status) {
      const allowedDriverStatuses = [
        "ORDER_PICKED_UP" /* ORDER_PICKED_UP */,
        "COMPLETED" /* COMPLETED */
      ];
      if (!allowedDriverStatuses.includes(updates.status)) {
        return res.status(403).json({
          error: `Driver tidak diizinkan mengubah status pesanan ke ${updates.status}.`
        });
      }
    }
  }
  if (currentOrder.status === "EXPIRED" /* EXPIRED */ || currentOrder.status === "CANCELLED" /* CANCELLED */) {
    if (updates.status && updates.status !== currentOrder.status) {
      if (user.role === "ADMIN" && currentOrder.status === "EXPIRED" /* EXPIRED */) {
        if (!overrideExpired) {
          return res.status(400).json({
            error: "Pesanan telah KEDALUWARSA (EXPIRED). Verifikasi pembayaran tidak dapat dilakukan secara tidak sengaja. Sertakan persetujuan eksplisit pembayaran terlambat (overrideExpired: true) beserta catatan administrasi."
          });
        }
        foodDb.log(
          user.userId,
          `Admin explicitly approved late payment for expired order ${currentOrder.id}`,
          "ADMIN"
        );
      } else {
        return res.status(400).json({
          error: `Pesanan yang telah ${currentOrder.status} tidak dapat diaktifkan kembali secara langsung.`
        });
      }
    }
  }
  if (cancelReason) {
    updates.cancelReason = cancelReason;
  }
  try {
    const updated = await foodDb.updateOrder(
      user.userId || user.entityId || "system",
      req.params.id,
      updates,
      user.role
    );
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
orderRouter.post("/:id/assign-driver", requireRole(["ADMIN"]), async (req, res) => {
  const { driverId } = req.body;
  if (!driverId) {
    return res.status(400).json({ error: "Driver ID wajib disertakan." });
  }
  try {
    const updated = await foodDb.manualAssignDriver(req.user?.userId || "admin", req.params.id, driverId);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
orderRouter.post("/:id/upload-payment", async (req, res) => {
  const { paymentProof } = req.body;
  if (!paymentProof) {
    return res.status(400).json({ error: "Bukti pembayaran wajib diunggah." });
  }
  const order = foodDb.getOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  }
  const now = Date.now();
  const expiryTime = order.paymentExpiresAt ? new Date(order.paymentExpiresAt).getTime() : 0;
  if (expiryTime && now > expiryTime && order.status === "WAITING_PAYMENT" /* WAITING_PAYMENT */) {
    await foodDb.updateOrder("SYSTEM", order.id, { status: "EXPIRED" /* EXPIRED */ }, "SYSTEM");
    return res.status(400).json({
      error: "Waktu pembayaran untuk pesanan ini telah kedaluwarsa (melebihi 10 menit). Pesanan ditandai sebagai KEDALUWARSA dan tidak dapat diproses lagi."
    });
  }
  if (order.status === "EXPIRED" /* EXPIRED */) {
    return res.status(400).json({
      error: "Pesanan ini telah kedaluwarsa dan tidak dapat menerima bukti pembayaran lagi."
    });
  }
  if (order.status === "CANCELLED" /* CANCELLED */) {
    return res.status(400).json({
      error: "Pesanan ini telah dibatalkan dan tidak dapat menerima bukti pembayaran."
    });
  }
  try {
    const updated = await foodDb.updateOrder(
      "CUSTOMER",
      req.params.id,
      {
        paymentProof,
        status: "WAITING_PAYMENT_VERIFICATION" /* WAITING_PAYMENT_VERIFICATION */
      },
      "CUSTOMER"
    );
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
orderRouter.post("/:id/upload-delivery", requireRole(["DRIVER", "ADMIN"]), async (req, res) => {
  const { deliveryProof } = req.body;
  if (!deliveryProof) {
    return res.status(400).json({ error: "Bukti foto pengantaran wajib disertakan." });
  }
  const order = foodDb.getOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  }
  const user = req.user;
  if (user.role === "DRIVER") {
    if (order.driverId !== user.entityId && order.driverId !== user.userId) {
      return res.status(403).json({ error: "Akses ditolak: Anda bukan kurir yang ditugaskan untuk pesanan ini." });
    }
  }
  try {
    const updated = await foodDb.updateOrder(
      user.userId || user.entityId || "driver",
      req.params.id,
      {
        deliveryProof,
        status: "COMPLETED" /* COMPLETED */
      },
      user.role
    );
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// src/server/routes/adminRoutes.ts
import { Router as Router5 } from "express";
var adminRouter = Router5();
adminRouter.get("/config", (req, res) => {
  res.json(foodDb.getConfig());
});
adminRouter.put("/config", requireRole(["ADMIN"]), async (req, res) => {
  const { userId, ...updates } = req.body;
  try {
    const config = await foodDb.updateConfig(req.user?.userId || userId || "admin", updates);
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
adminRouter.get("/partner-registrations", requireRole(["ADMIN"]), (req, res) => {
  res.json(foodDb.getPartnerRegistrations());
});
adminRouter.post("/partner-registrations", async (req, res) => {
  try {
    const created = await foodDb.createPartnerRegistration(req.body);
    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
adminRouter.put("/partner-registrations/:id/approve", requireRole(["ADMIN"]), async (req, res) => {
  const { userId } = req.body;
  try {
    const result = await foodDb.approvePartnerRegistration(req.user?.userId || userId || "admin", req.params.id);
    if (result.success) {
      res.json({ success: true, registration: result.registration });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
adminRouter.post("/partner-registrations/:id/reject", requireRole(["ADMIN"]), async (req, res) => {
  const { userId } = req.body;
  try {
    const success = await foodDb.rejectPartnerRegistration(req.user?.userId || userId || "admin", req.params.id);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Registration not found" });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
adminRouter.get("/settlements", requireRole(["ADMIN"]), (req, res) => {
  res.json(foodDb.getSettlements());
});
adminRouter.post("/settlements", requireRole(["ADMIN"]), async (req, res) => {
  const settlementData = req.body;
  try {
    const actorId = req.user?.userId || "admin";
    const created = await foodDb.createSettlement(actorId, settlementData);
    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
adminRouter.put("/settlements/:id", requireRole(["ADMIN"]), async (req, res) => {
  const updates = req.body;
  try {
    const actorId = req.user?.userId || "admin";
    const updated = await foodDb.updateSettlement(actorId, req.params.id, updates);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
adminRouter.post("/settlements/generate", requireRole(["ADMIN"]), async (req, res) => {
  try {
    const actorId = req.user?.userId || "admin";
    const created = await foodDb.generateHPlusOneSettlements(actorId);
    res.json({ count: created.length, settlements: created });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
adminRouter.post("/settlements/:id/confirm", requireRole(["ADMIN"]), async (req, res) => {
  try {
    const actorId = req.user?.userId || "admin";
    const confirmed = await foodDb.confirmSettlement(actorId, req.params.id);
    res.json(confirmed);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
adminRouter.get("/licenses", requireRole(["ADMIN"]), (req, res) => {
  res.json(foodDb.getLicenses());
});
adminRouter.post("/licenses", requireRole(["ADMIN"]), async (req, res) => {
  const { userId, key, durationDays } = req.body;
  try {
    const created = await foodDb.createLicense(req.user?.userId || userId || "admin", key, Number(durationDays || 30));
    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
adminRouter.get("/logs", requireRole(["ADMIN"]), (req, res) => {
  res.json(foodDb.getLogs());
});

// src/server/app.ts
var app = express();
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use(async (req, res, next) => {
  try {
    await foodDb.ensureInitialized();
  } catch (err) {
    if (foodConfig.isProduction && req.path.startsWith("/api") && !req.path.startsWith("/api/health")) {
      return res.status(503).json({
        error: "[Produksi] Firestore Cloud tidak terhubung atau mengalami kegagalan otentikasi. Mode produksi menolak fallback ke data JSON lokal demi menjaga integritas data.",
        detail: err.message
      });
    }
  }
  next();
});
app.use(authenticateToken);
app.get("/api/health", async (req, res) => {
  const storageStatus = await foodDb.getStorageStatus();
  const isHealthy = storageStatus.liveCloudConnected;
  const isProd = foodConfig.isProduction;
  res.status(isProd && !isHealthy ? 503 : 200).json({
    status: isHealthy ? "healthy" : isProd ? "degraded_disconnected_from_cloud" : "ok_development_resilient_mode",
    system: "tumpang-food",
    environment: process.env.NODE_ENV || "development",
    database: storageStatus,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.get("/api/health/firestore-probe", async (req, res) => {
  const probe = await testFirestoreConnection();
  res.status(probe.connected ? 200 : 503).json({
    system: "tumpang-food",
    probeOrigin: "Dedicated Admin SDK Diagnostic Probe",
    result: probe,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.use("/api", authRouter);
app.use("/api/merchants", merchantRouter);
app.use("/api/drivers", driverRouter);
app.use("/api/orders", orderRouter);
app.use("/api", adminRouter);
app.use((err, req, res, next) => {
  console.error("[TumpangFood Server Error]", err);
  res.status(err.status || 500).json({
    error: err.message || "Terjadi kesalahan internal pada server Tumpang Food."
  });
});

// api/index.ts
var index_default = app;
export {
  index_default as default
};
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Configuration Module
 * Isolates runtime environment variables, database identifiers, and system defaults.
 */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Authentication & RBAC Authorization Module
 * Provides password hashing, token creation/verification, and strict security middleware.
 */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Order Validation & Transaction Service
 * Enforces price recalculations, menu availability checks, and order state machine rules.
 */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Firebase Admin SDK Module
 * Server-side trusted administrative database client.
 * Implements IAM credential loading, custom database targeting, and atomic transactions.
 */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Isolated Database Module
 * Manages persistent storage, data integrity, and Firestore synchronization.
 */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Authentication Routes
 * Handles secure user login, token issuance, and partner onboarding.
 * Strictly enforces valid credentials with PBKDF2 hashing and no fallback bypasses.
 */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Merchant Routes
 * Manages merchant profiles, menu catalogs, orders, and license redemptions.
 */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Driver Routes
 * Handles courier profile operations, status toggles, and delivery assignments.
 * Protected with RBAC so drivers can only view and manage their own profile and tasks.
 */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Order Routes
 * Handles order placements, recalculations, driver assignments, and payment proofs.
 * Enforces payment expiration rules, terminal state guards, and RBAC order visibility.
 */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Administrative Routes
 * Manages system parameters, partner onboarding, payouts, and licenses.
 * Strictly protected with Admin-only RBAC middleware.
 */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Express Application
 * Decoupled and modular backend application assembly.
 */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Vercel Serverless Function Entry Point for Tumpang Food API
 * Directly exports the Express application without Vite or development server dependencies.
 */
