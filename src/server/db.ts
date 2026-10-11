/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Isolated Database Module
 * Manages persistent storage, data integrity, and Firestore synchronization.
 */

import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import {
  Merchant, Category, MenuItem, Order, Driver, Settlement, AuditLog, SystemConfig,
  OrderStatus, SettlementStatus, AssignmentMode, PartnerRegistration, LicenseKey
} from '../types.ts';
import { foodConfig } from './config.ts';
import { hashPassword, verifyPassword } from './auth.ts';
import { OrderService } from './services/orderService.ts';

const FOOD_DB_FILE = foodConfig.localDbFile;
const LEGACY_DB_FILE = foodConfig.legacyDbFile;

// --- FIRESTORE CLIENT INITIALIZATION ---
let firestoreDb: any = null;
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const app = initializeApp(rawConfig);
    firestoreDb = getFirestore(app, foodConfig.databaseId);
    console.log(`[TumpangFood DB] Firestore initialized for database: ${foodConfig.databaseId}`);
  }
} catch (e) {
  console.error('[TumpangFood DB] Failed to initialize Firestore SDK:', e);
}

// Helper to remove undefined fields recursively for Firestore compatibility
function removeUndefinedFields(obj: any): any {
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

async function safeFirestoreSetDoc(colName: string, docId: string, data: any) {
  if (!firestoreDb) return;
  try {
    const cleaned = removeUndefinedFields(data);
    await setDoc(doc(firestoreDb, colName, docId), cleaned);
  } catch (err) {
    console.warn(`[TumpangFood DB] Firestore write failed for ${colName}/${docId}:`, err);
  }
}

interface DatabaseSchema {
  merchants: Merchant[];
  categories: Category[];
  menuItems: MenuItem[];
  orders: Order[];
  drivers: Driver[];
  settlements: Settlement[];
  auditLogs: AuditLog[];
  systemConfig: SystemConfig;
  partnerRegistrations: PartnerRegistration[];
  licenses: LicenseKey[];
}

const initialConfig: SystemConfig = {
  serviceFee: 2000,
  deliveryFeePerKm: 1500,
  defaultDeliveryFee: 5000,
  commissionPercent: 10,
  assignmentMode: AssignmentMode.AUTOMATIC,
  qrisImage: 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
  systemOpen: true
};

export class FoodDatabase {
  private data: DatabaseSchema;
  private isInitialized = false;

  constructor() {
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

  /**
   * Loads from food database file or migrates safely from legacy file if initial.
   */
  private loadAndMigrate() {
    try {
      if (fs.existsSync(FOOD_DB_FILE)) {
        const content = fs.readFileSync(FOOD_DB_FILE, 'utf-8');
        this.data = JSON.parse(content);
        this.ensureStructure();
        console.log('[TumpangFood DB] Loaded state from tumpang_food_db.json');
        return;
      }

      // Safe migration from legacy database file
      if (fs.existsSync(LEGACY_DB_FILE)) {
        console.log('[TumpangFood DB] Migrating data from legacy tumpang_db.json...');
        const legacyContent = fs.readFileSync(LEGACY_DB_FILE, 'utf-8');
        this.data = JSON.parse(legacyContent);
        this.ensureStructure();

        // Migrate passwords: ensure secure hashes
        for (const m of this.data.merchants) {
          if (m.password && !m.password.startsWith('pbkdf2$')) {
            m.password = hashPassword(m.password);
          }
        }

        this.save();
        console.log('[TumpangFood DB] Migration complete! Saved to tumpang_food_db.json.');
      } else {
        // Fresh initial seed
        this.seedInitial();
        this.save();
      }
    } catch (err) {
      console.error('[TumpangFood DB] Error during load/migrate:', err);
      this.seedInitial();
      this.save();
    }
  }

  private ensureStructure() {
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

  private seedInitial() {
    this.data.systemConfig = initialConfig;
    this.data.licenses = [
      { key: 'TUMPANG-PREM-FITRI-KUE', durationDays: 30, status: 'UNUSED', createdAt: new Date().toISOString() },
      { key: 'TUMPANG-PREM-DEMO-99', durationDays: 90, status: 'UNUSED', createdAt: new Date().toISOString() },
      { key: 'TUMPANG-PREM-BAKERY', durationDays: 365, status: 'UNUSED', createdAt: new Date().toISOString() }
    ];
  }

  public save() {
    try {
      fs.writeFileSync(FOOD_DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[TumpangFood DB] Failed to save database file:', e);
    }
  }

  /**
   * Synchronize state with Firebase Firestore
   */
  public async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (!firestoreDb) {
      console.warn('[TumpangFood DB] Firestore not available, continuing with local storage.');
      return;
    }

    try {
      console.log('[TumpangFood DB] Syncing with Firestore database:', foodConfig.databaseId);

      // System Config
      try {
        const configDoc = await getDoc(doc(firestoreDb, 'systemConfig', 'config_1'));
        if (configDoc.exists()) {
          this.data.systemConfig = { ...initialConfig, ...configDoc.data() } as SystemConfig;
        } else {
          await setDoc(doc(firestoreDb, 'systemConfig', 'config_1'), this.data.systemConfig);
        }
      } catch (e) {
        console.warn('[TumpangFood DB] Failed to sync systemConfig with Firestore:', e);
      }

      // Merchants
      try {
        const merchantSnap = await getDocs(collection(firestoreDb, 'merchants'));
        if (!merchantSnap.empty) {
          const remoteMerchants = merchantSnap.docs.map(d => d.data() as Merchant);
          // Merge remote merchants with local
          for (const rm of remoteMerchants) {
            const idx = this.data.merchants.findIndex(m => m.id === rm.id);
            if (idx >= 0) {
              this.data.merchants[idx] = { ...this.data.merchants[idx], ...rm };
            } else {
              this.data.merchants.push(rm);
            }
          }
        } else if (this.data.merchants.length > 0) {
          for (const m of this.data.merchants) {
            await setDoc(doc(firestoreDb, 'merchants', m.id), m);
          }
        }
      } catch (e) {
        console.warn('[TumpangFood DB] Failed to sync merchants with Firestore:', e);
      }

      // Categories
      try {
        const catSnap = await getDocs(collection(firestoreDb, 'categories'));
        if (!catSnap.empty) {
          const remoteCats = catSnap.docs.map(d => d.data() as Category);
          for (const rc of remoteCats) {
            if (!this.data.categories.some(c => c.id === rc.id)) {
              this.data.categories.push(rc);
            }
          }
        } else if (this.data.categories.length > 0) {
          for (const c of this.data.categories) {
            await setDoc(doc(firestoreDb, 'categories', c.id), c);
          }
        }
      } catch (e) {
        console.warn('[TumpangFood DB] Failed to sync categories with Firestore:', e);
      }

      // Menu Items
      try {
        const menuSnap = await getDocs(collection(firestoreDb, 'menuItems'));
        if (!menuSnap.empty) {
          const remoteItems = menuSnap.docs.map(d => d.data() as MenuItem);
          for (const ri of remoteItems) {
            const idx = this.data.menuItems.findIndex(i => i.id === ri.id);
            if (idx >= 0) {
              this.data.menuItems[idx] = { ...this.data.menuItems[idx], ...ri };
            } else {
              this.data.menuItems.push(ri);
            }
          }
        } else if (this.data.menuItems.length > 0) {
          for (const i of this.data.menuItems) {
            await setDoc(doc(firestoreDb, 'menuItems', i.id), i);
          }
        }
      } catch (e) {
        console.warn('[TumpangFood DB] Failed to sync menuItems with Firestore:', e);
      }

      // Orders
      try {
        const orderSnap = await getDocs(collection(firestoreDb, 'orders'));
        if (!orderSnap.empty) {
          const remoteOrders = orderSnap.docs.map(d => d.data() as Order);
          for (const ro of remoteOrders) {
            const idx = this.data.orders.findIndex(o => o.id === ro.id);
            if (idx >= 0) {
              this.data.orders[idx] = { ...this.data.orders[idx], ...ro };
            } else {
              this.data.orders.push(ro);
            }
          }
        }
      } catch (e) {
        console.warn('[TumpangFood DB] Failed to sync orders with Firestore:', e);
      }

      this.save();
      console.log('[TumpangFood DB] Firestore synchronization successful.');
    } catch (err) {
      console.error('[TumpangFood DB] Firestore sync failed, continuing locally:', err);
    }
  }

  // --- LOGGING ---
  public log(userId: string, details: string, role: 'ADMIN' | 'MERCHANT' | 'DRIVER' | 'SYSTEM' | 'CUSTOMER' = 'SYSTEM'): AuditLog {
    const logItem: AuditLog = {
      id: 'log_' + Math.random().toString(36).substring(2, 9),
      action: details.split(' ')[0] || 'ACTION',
      userId,
      role,
      details,
      createdAt: new Date().toISOString()
    };
    this.data.auditLogs.unshift(logItem);
    if (this.data.auditLogs.length > 250) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 250);
    }
    this.save();

    safeFirestoreSetDoc('auditLogs', logItem.id, logItem);
    return logItem;
  }

  public getLogs(): AuditLog[] {
    return this.data.auditLogs;
  }

  // --- CONFIG ---
  public getConfig(): SystemConfig {
    return this.data.systemConfig;
  }

  public updateConfig(userId: string, updates: Partial<SystemConfig>): SystemConfig {
    this.data.systemConfig = { ...this.data.systemConfig, ...updates };
    this.save();
    this.log(userId, `Updated system configuration`, 'ADMIN');

    safeFirestoreSetDoc('systemConfig', 'config_1', this.data.systemConfig);
    return this.data.systemConfig;
  }

  // --- MERCHANTS ---
  public getMerchants(): Merchant[] {
    return this.data.merchants;
  }

  public getMerchantById(id: string): Merchant | undefined {
    return this.data.merchants.find(m => m.id === id);
  }

  public getMerchantByEmailOrPhone(identifier: string): Merchant | undefined {
    const clean = identifier.trim().toLowerCase();
    const cleanNumbers = identifier.replace(/[^0-9]/g, '');
    return this.data.merchants.find(m => {
      const matchId = m.id.toLowerCase() === clean;
      const matchEmail = m.email && m.email.trim().toLowerCase() === clean;
      const matchPhone = m.phone === identifier;
      const matchCleanPhone = cleanNumbers.length >= 8 && m.phone.replace(/[^0-9]/g, '') === cleanNumbers;
      return matchId || matchEmail || matchPhone || matchCleanPhone;
    });
  }

  public createMerchant(userId: string, merchantData: Omit<Merchant, 'id' | 'createdAt' | 'updatedAt' | 'rating'>): Merchant {
    const newMerchant: Merchant = {
      ...merchantData,
      id: 'm_' + Math.random().toString(36).substring(2, 9),
      rating: 5.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (newMerchant.password && !newMerchant.password.startsWith('pbkdf2$')) {
      newMerchant.password = hashPassword(newMerchant.password);
    }

    this.data.merchants.push(newMerchant);
    this.save();
    this.log(userId, `Created merchant ${newMerchant.name}`, 'ADMIN');

    safeFirestoreSetDoc('merchants', newMerchant.id, newMerchant);
    return newMerchant;
  }

  public updateMerchant(userId: string, id: string, updates: Partial<Merchant>, role: 'ADMIN' | 'MERCHANT' = 'MERCHANT'): Merchant {
    const index = this.data.merchants.findIndex(m => m.id === id);
    if (index === -1) throw new Error('Merchant not found');

    const updatedData = { ...updates };
    if (updatedData.password && !updatedData.password.startsWith('pbkdf2$')) {
      updatedData.password = hashPassword(updatedData.password);
    }

    this.data.merchants[index] = {
      ...this.data.merchants[index],
      ...updatedData,
      updatedAt: new Date().toISOString()
    };
    this.save();
    this.log(userId, `Updated merchant ${this.data.merchants[index].name}`, role);

    safeFirestoreSetDoc('merchants', id, this.data.merchants[index]);
    return this.data.merchants[index];
  }

  public deleteMerchant(userId: string, id: string): boolean {
    const index = this.data.merchants.findIndex(m => m.id === id);
    if (index === -1) return false;

    const name = this.data.merchants[index].name;
    this.data.merchants.splice(index, 1);

    // Clean menu items and categories
    this.data.categories = this.data.categories.filter(c => c.merchantId !== id);
    this.data.menuItems = this.data.menuItems.filter(i => i.merchantId !== id);

    this.save();
    this.log(userId, `Deleted merchant ${name}`, 'ADMIN');

    if (firestoreDb) {
      deleteDoc(doc(firestoreDb, 'merchants', id)).catch(() => {});
    }
    return true;
  }

  public activateMerchant(email: string, passwordPlain: string): { success: boolean; merchant?: Merchant; error?: string } {
    const cleanEmail = email.trim().toLowerCase();
    const merchant = this.data.merchants.find(m => m.email?.trim().toLowerCase() === cleanEmail);
    if (!merchant) {
      return { success: false, error: 'Merchant dengan email tersebut tidak ditemukan.' };
    }

    merchant.active = true;
    merchant.isActivated = true;
    merchant.password = hashPassword(passwordPlain);
    merchant.updatedAt = new Date().toISOString();

    if (this.data.partnerRegistrations) {
      const reg = this.data.partnerRegistrations.find(r => r.email?.trim().toLowerCase() === cleanEmail && r.type === 'MERCHANT');
      if (reg) {
        reg.status = 'ACTIVATED';
        safeFirestoreSetDoc('partnerRegistrations', reg.id, reg);
      }
    }

    this.save();
    this.log(merchant.id, `Activated merchant store ${merchant.name}`, 'MERCHANT');

    safeFirestoreSetDoc('merchants', merchant.id, merchant);
    return { success: true, merchant };
  }

  // --- CATEGORIES ---
  public getCategories(merchantId: string): Category[] {
    return this.data.categories
      .filter(c => c.merchantId === merchantId)
      .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  }

  public createCategory(merchantId: string, name: string): Category {
    const existing = this.getCategories(merchantId);
    const orderIndex = existing.length > 0 ? Math.max(...existing.map(e => e.orderIndex)) + 1 : 1;
    const newCat: Category = {
      id: 'cat_' + Math.random().toString(36).substring(2, 9),
      merchantId,
      name: name.trim(),
      orderIndex
    };
    this.data.categories.push(newCat);
    this.save();
    this.log(merchantId, `Created category ${name}`, 'MERCHANT');

    safeFirestoreSetDoc('categories', newCat.id, newCat);
    return newCat;
  }

  public updateCategory(merchantId: string, id: string, name: string): Category {
    const cat = this.data.categories.find(c => c.id === id && c.merchantId === merchantId);
    if (!cat) throw new Error('Category not found');
    cat.name = name.trim();
    this.save();

    safeFirestoreSetDoc('categories', id, cat);
    return cat;
  }

  public deleteCategory(merchantId: string, id: string): boolean {
    const index = this.data.categories.findIndex(c => c.id === id && c.merchantId === merchantId);
    if (index === -1) return false;
    this.data.categories.splice(index, 1);
    this.data.menuItems = this.data.menuItems.filter(i => i.categoryId !== id);
    this.save();

    if (firestoreDb) {
      deleteDoc(doc(firestoreDb, 'categories', id)).catch(() => {});
    }
    return true;
  }

  // --- MENU ITEMS ---
  public getMenuItemsByMerchant(merchantId: string): MenuItem[] {
    return this.data.menuItems.filter(i => i.merchantId === merchantId);
  }

  public getMenuItemById(id: string): MenuItem | undefined {
    return this.data.menuItems.find(i => i.id === id);
  }

  public createMenuItem(merchantId: string, itemData: Omit<MenuItem, 'id' | 'merchantId' | 'createdAt' | 'updatedAt'>): MenuItem {
    const newItem: MenuItem = {
      ...itemData,
      id: 'item_' + Math.random().toString(36).substring(2, 9),
      merchantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.data.menuItems.push(newItem);
    this.save();
    this.log(merchantId, `Created menu item ${newItem.name}`, 'MERCHANT');

    safeFirestoreSetDoc('menuItems', newItem.id, newItem);
    return newItem;
  }

  public updateMenuItem(merchantId: string, id: string, updates: Partial<MenuItem>): MenuItem {
    const index = this.data.menuItems.findIndex(i => i.id === id && i.merchantId === merchantId);
    if (index === -1) throw new Error('Menu item not found');

    this.data.menuItems[index] = {
      ...this.data.menuItems[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save();
    this.log(merchantId, `Updated menu item ${this.data.menuItems[index].name}`, 'MERCHANT');

    safeFirestoreSetDoc('menuItems', id, this.data.menuItems[index]);
    return this.data.menuItems[index];
  }

  public deleteMenuItem(merchantId: string, id: string): boolean {
    const index = this.data.menuItems.findIndex(i => i.id === id && i.merchantId === merchantId);
    if (index === -1) return false;
    const name = this.data.menuItems[index].name;
    this.data.menuItems.splice(index, 1);
    this.save();
    this.log(merchantId, `Deleted menu item ${name}`, 'MERCHANT');

    if (firestoreDb) {
      deleteDoc(doc(firestoreDb, 'menuItems', id)).catch(() => {});
    }
    return true;
  }

  // --- DRIVERS ---
  public getDrivers(): Driver[] {
    return this.data.drivers;
  }

  public getDriverById(id: string): Driver | undefined {
    return this.data.drivers.find(d => d.id === id);
  }

  public getDriverByEmailOrPhone(identifier: string): Driver | undefined {
    const clean = identifier.trim().toLowerCase();
    const cleanPhone = identifier.replace(/[^0-9]/g, '');
    return this.data.drivers.find(d => {
      const matchId = d.id.toLowerCase() === clean;
      const matchEmail = d.email && d.email.trim().toLowerCase() === clean;
      const matchPhone = d.phone === identifier;
      const matchCleanPhone = cleanPhone.length >= 8 && d.phone.replace(/[^0-9]/g, '') === cleanPhone;
      return matchId || matchEmail || matchPhone || matchCleanPhone;
    });
  }

  public createDriver(userId: string, driverData: Omit<Driver, 'id' | 'createdAt' | 'updatedAt'>): Driver {
    const newDriver: Driver = {
      ...driverData,
      id: 'd_' + Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.data.drivers.push(newDriver);
    this.save();
    this.log(userId, `Created driver ${newDriver.name}`, 'ADMIN');

    safeFirestoreSetDoc('drivers', newDriver.id, newDriver);
    return newDriver;
  }

  public updateDriver(userId: string, id: string, updates: Partial<Driver>, role: 'ADMIN' | 'DRIVER' = 'DRIVER'): Driver {
    const index = this.data.drivers.findIndex(d => d.id === id);
    if (index === -1) throw new Error('Driver not found');

    this.data.drivers[index] = {
      ...this.data.drivers[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save();
    this.log(userId, `Updated driver ${this.data.drivers[index].name}`, role);

    safeFirestoreSetDoc('drivers', id, this.data.drivers[index]);
    return this.data.drivers[index];
  }

  public deleteDriver(userId: string, id: string): boolean {
    const index = this.data.drivers.findIndex(d => d.id === id);
    if (index === -1) return false;
    const name = this.data.drivers[index].name;
    this.data.drivers.splice(index, 1);
    this.save();
    this.log(userId, `Deleted driver ${name}`, 'ADMIN');

    if (firestoreDb) {
      deleteDoc(doc(firestoreDb, 'drivers', id)).catch(() => {});
    }
    return true;
  }

  // --- ORDERS ---
  public getOrders(): Order[] {
    return this.data.orders;
  }

  public getOrderById(id: string): Order | undefined {
    return this.data.orders.find(o => o.id === id);
  }

  public getOrdersByMerchant(merchantId: string): Order[] {
    return this.data.orders.filter(o => o.merchantId === merchantId);
  }

  public getOrdersByDriver(driverId: string): Order[] {
    return this.data.orders.filter(o => o.driverId === driverId);
  }

  public getOrdersByCustomerPhone(phone: string): Order[] {
    return this.data.orders.filter(o => o.customerPhone === phone);
  }

  public createOrder(rawInput: any): Order {
    const merchant = this.getMerchantById(rawInput.merchantId);
    if (!merchant) throw new Error('Toko / Merchant tidak ditemukan.');

    // Prevent duplicate orders submitted within 10 seconds with identical details
    const recentDuplicate = this.data.orders.find(o => 
      o.merchantId === rawInput.merchantId &&
      o.customerPhone === rawInput.customerPhone &&
      Date.now() - new Date(o.createdAt).getTime() < 10000 &&
      o.status === OrderStatus.WAITING_PAYMENT
    );
    if (recentDuplicate) {
      return recentDuplicate;
    }

    const activeUniqueCodes = this.data.orders
      .filter(o => o.status === OrderStatus.WAITING_PAYMENT || o.status === OrderStatus.WAITING_PAYMENT_VERIFICATION)
      .map(o => o.uniqueCode);

    const validatedOrderData = OrderService.validateAndBuildOrder(
      rawInput,
      merchant,
      this.data.menuItems,
      this.data.systemConfig,
      activeUniqueCodes
    );

    const newOrder: Order = {
      ...validatedOrderData,
      id: 'ord_' + Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.data.orders.unshift(newOrder);
    this.save();
    this.log('CUSTOMER', `Created order ${newOrder.id} Total: Rp ${newOrder.total.toLocaleString()} (UniqueCode: ${newOrder.uniqueCode})`, 'CUSTOMER');

    safeFirestoreSetDoc('orders', newOrder.id, newOrder);
    return newOrder;
  }

  public updateOrder(
    userId: string,
    id: string,
    updates: Partial<Order>,
    role: 'ADMIN' | 'MERCHANT' | 'DRIVER' | 'SYSTEM' | 'CUSTOMER'
  ): Order {
    const index = this.data.orders.findIndex(o => o.id === id);
    if (index === -1) throw new Error('Order not found');

    const currentOrder = this.data.orders[index];
    const prevStatus = currentOrder.status;

    // Validate state transition if status is being updated
    if (updates.status && updates.status !== prevStatus) {
      const check = OrderService.isValidStatusTransition(prevStatus, updates.status, role);
      if (!check.allowed) {
        throw new Error(check.reason || 'Perubahan status pesanan tidak diizinkan.');
      }
    }

    // Customer or merchant cannot alter financials or item prices
    if (role !== 'ADMIN' && role !== 'SYSTEM') {
      delete (updates as any).subtotal;
      delete (updates as any).deliveryFee;
      delete (updates as any).serviceFee;
      delete (updates as any).total;
      delete (updates as any).uniqueCode;
    }

    this.data.orders[index] = {
      ...currentOrder,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save();

    if (updates.status && updates.status !== prevStatus) {
      this.log(userId, `Updated order ${id} status from ${prevStatus} to ${updates.status}`, role);

      // Auto-assign driver when payment is verified if configured
      if (
        updates.status === OrderStatus.PAYMENT_VERIFIED &&
        this.data.systemConfig.assignmentMode === AssignmentMode.AUTOMATIC
      ) {
        this.autoAssignDriver(id);
      }
    } else {
      this.log(userId, `Updated order ${id} details`, role);
    }

    safeFirestoreSetDoc('orders', id, this.data.orders[index]);
    return this.data.orders[index];
  }

  public autoAssignDriver(orderId: string): void {
    const order = this.getOrderById(orderId);
    if (!order) return;

    const availableDrivers = this.data.drivers.filter(d => d.online && d.active);
    if (availableDrivers.length === 0) {
      this.log('SYSTEM', `No active drivers available for auto-assignment of order ${orderId}`, 'SYSTEM');
      return;
    }

    // Assign to driver with least active tasks
    const driverTaskCounts = availableDrivers.map(d => {
      const activeTasks = this.data.orders.filter(o =>
        o.driverId === d.id &&
        [OrderStatus.PAYMENT_VERIFIED, OrderStatus.COOKING, OrderStatus.READY_FOR_PICKUP, OrderStatus.ORDER_PICKED_UP].includes(o.status)
      ).length;
      return { driver: d, count: activeTasks };
    });

    driverTaskCounts.sort((a, b) => a.count - b.count);
    const selectedDriver = driverTaskCounts[0].driver;

    this.updateOrder('SYSTEM', orderId, {
      driverId: selectedDriver.id,
      driverName: selectedDriver.name
    }, 'SYSTEM');
  }

  public manualAssignDriver(userId: string, orderId: string, driverId: string): Order {
    const driver = this.getDriverById(driverId);
    if (!driver) throw new Error('Driver not found');

    const updated = this.updateOrder(userId, orderId, {
      driverId: driver.id,
      driverName: driver.name
    }, 'ADMIN');

    this.log(userId, `Assigned driver ${driver.name} to order ${orderId}`, 'ADMIN');
    return updated;
  }

  // --- SETTLEMENTS ---
  public getSettlements(): Settlement[] {
    return this.data.settlements;
  }

  public getSettlementsByMerchant(merchantId: string): Settlement[] {
    return this.data.settlements.filter(s => s.merchantId === merchantId);
  }

  public createSettlement(userId: string, settlementData: Omit<Settlement, 'id' | 'createdAt'> & { orderIds?: string[] }): Settlement {
    const newSettlement: Settlement = {
      id: 'set_' + Math.random().toString(36).substring(2, 9),
      merchantId: settlementData.merchantId,
      merchantName: settlementData.merchantName,
      orderCount: settlementData.orderCount,
      totalSales: settlementData.totalSales,
      totalCommission: settlementData.totalCommission,
      amountToPay: settlementData.amountToPay,
      status: settlementData.status || SettlementStatus.WAITING_CONFIRMATION,
      bankName: settlementData.bankName,
      bankAccount: settlementData.bankAccount,
      bankHolder: settlementData.bankHolder,
      createdAt: new Date().toISOString()
    };

    // Mark eligible orders as settled
    if (settlementData.orderIds && Array.isArray(settlementData.orderIds)) {
      for (const ordId of settlementData.orderIds) {
        const ord = this.data.orders.find(o => o.id === ordId);
        if (ord) {
          (ord as any).isSettled = true;
          safeFirestoreSetDoc('orders', ord.id, ord);
        }
      }
    }

    this.data.settlements.unshift(newSettlement);
    this.save();
    this.log(userId, `Created settlement of Rp ${newSettlement.amountToPay.toLocaleString()} for ${newSettlement.merchantName}`, 'ADMIN');

    safeFirestoreSetDoc('settlements', newSettlement.id, newSettlement);
    return newSettlement;
  }

  public updateSettlement(userId: string, id: string, updates: Partial<Settlement>): Settlement {
    const index = this.data.settlements.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Settlement not found');

    this.data.settlements[index] = {
      ...this.data.settlements[index],
      ...updates,
      paidAt: updates.status === SettlementStatus.SETTLEMENT_COMPLETED ? new Date().toISOString() : this.data.settlements[index].paidAt
    };
    this.save();
    this.log(userId, `Updated settlement ${id} to status ${this.data.settlements[index].status}`, 'ADMIN');

    safeFirestoreSetDoc('settlements', id, this.data.settlements[index]);
    return this.data.settlements[index];
  }

  public confirmSettlement(userId: string, id: string): Settlement {
    return this.updateSettlement(userId, id, { status: SettlementStatus.SETTLEMENT_COMPLETED });
  }

  public generateHPlusOneSettlements(userId: string): Settlement[] {
    const targetOrders = this.data.orders.filter(o => o.status === OrderStatus.COMPLETED && !(o as any).isSettled);
    if (targetOrders.length === 0) return [];

    const grouped = new Map<string, Order[]>();
    for (const o of targetOrders) {
      const list = grouped.get(o.merchantId) || [];
      list.push(o);
      grouped.set(o.merchantId, list);
    }

    const createdSettlements: Settlement[] = [];
    const commissionPercent = this.data.systemConfig.commissionPercent || 10;

    for (const [merchantId, orders] of grouped.entries()) {
      const merchant = this.getMerchantById(merchantId);
      if (!merchant) continue;

      const orderCount = orders.length;
      const totalSales = orders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
      const totalCommission = Math.round((totalSales * commissionPercent) / 100);
      const amountToPay = totalSales - totalCommission;

      const settlement = this.createSettlement(userId, {
        merchantId,
        merchantName: merchant.name,
        orderCount,
        totalSales,
        totalCommission,
        amountToPay,
        status: SettlementStatus.WAITING_CONFIRMATION,
        bankName: merchant.bankName,
        bankAccount: merchant.bankAccount,
        bankHolder: merchant.bankHolder,
        orderIds: orders.map(o => o.id)
      });
      createdSettlements.push(settlement);
    }

    return createdSettlements;
  }

  // --- PARTNER REGISTRATIONS ---
  public getPartnerRegistrations(): PartnerRegistration[] {
    return this.data.partnerRegistrations;
  }

  public createPartnerRegistration(regData: Omit<PartnerRegistration, 'id' | 'status' | 'createdAt'>): PartnerRegistration {
    const newReg: PartnerRegistration = {
      ...regData,
      id: 'reg_' + Math.random().toString(36).substring(2, 9),
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };
    this.data.partnerRegistrations.push(newReg);
    this.save();
    this.log('CUSTOMER', `Submitted partner registration for ${newReg.name} (${newReg.type})`, 'CUSTOMER');

    safeFirestoreSetDoc('partnerRegistrations', newReg.id, newReg);
    return newReg;
  }

  public approvePartnerRegistration(userId: string, id: string): { success: boolean; error?: string; registration?: PartnerRegistration } {
    const reg = this.data.partnerRegistrations.find(r => r.id === id);
    if (!reg) return { success: false, error: 'Registration not found' };
    if (reg.status !== 'PENDING') return { success: false, error: 'Registration already processed' };

    reg.status = 'APPROVED';

    if (reg.type === 'MERCHANT') {
      const generatedPassword = 'TF-' + Math.floor(1000 + Math.random() * 9000);
      reg.password = generatedPassword;

      const newMerchant = this.createMerchant(userId, {
        name: reg.storeName || (reg.name + ' Store'),
        ownerName: reg.name,
        phone: reg.phone,
        address: reg.storeAddress || 'Alamat Toko',
        latitude: reg.latitude || -7.9482,
        longitude: reg.longitude || 112.7612,
        openTime: '08:00',
        closeTime: '21:00',
        bankName: 'Bank BRI',
        bankAccount: '1234567890',
        bankHolder: reg.name,
        active: true,
        cookTimeEstimate: '15-30 min',
        image: reg.businessPhoto || 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
        description: 'Toko baru bergabung di Tumpang Food!',
        category: reg.category || 'Nasi & Lauk',
        email: reg.email,
        isActivated: true,
        password: hashPassword(generatedPassword),
        businessPhoto: reg.businessPhoto,
        idPhoto: reg.idPhoto,
        contractPhoto: reg.contractPhoto
      });

      reg.storeId = newMerchant.id;

      // Add default category and item
      const defaultCategory = this.createCategory(newMerchant.id, 'Menu Utama');
      this.createMenuItem(newMerchant.id, {
        categoryId: defaultCategory.id,
        name: 'Nasi Goreng Spesial (Contoh)',
        description: 'Nasi goreng lezat dengan bumbu khas, telur, dan kerupuk.',
        price: 15000,
        available: true,
        image: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3'
      });
    } else if (reg.type === 'DRIVER') {
      this.createDriver(userId, {
        name: reg.name,
        phone: reg.phone,
        email: reg.email,
        active: true,
        online: false,
        latitude: -7.9482,
        longitude: 112.7612
      });
    }

    this.save();
    this.log(userId, `Approved partner registration ${reg.id} (${reg.name})`, 'ADMIN');

    safeFirestoreSetDoc('partnerRegistrations', reg.id, reg);
    return { success: true, registration: reg };
  }

  public rejectPartnerRegistration(userId: string, id: string): boolean {
    const reg = this.data.partnerRegistrations.find(r => r.id === id);
    if (!reg) return false;
    reg.status = 'REJECTED';
    this.save();
    this.log(userId, `Rejected partner registration ${reg.id} (${reg.name})`, 'ADMIN');

    safeFirestoreSetDoc('partnerRegistrations', reg.id, reg);
    return true;
  }

  // --- LICENSES ---
  public getLicenses(): LicenseKey[] {
    return this.data.licenses;
  }

  public createLicense(userId: string, key: string, durationDays: number): LicenseKey {
    const cleanKey = key.trim().toUpperCase();
    if (this.data.licenses.some(l => l.key === cleanKey)) {
      throw new Error('Kode lisensi sudah terdaftar');
    }
    const newLicense: LicenseKey = {
      key: cleanKey,
      durationDays: Number(durationDays) || 30,
      status: 'UNUSED',
      createdAt: new Date().toISOString()
    };
    this.data.licenses.unshift(newLicense);
    this.save();
    this.log(userId, `Created license key ${cleanKey} for ${durationDays} days`, 'ADMIN');

    safeFirestoreSetDoc('licenses', cleanKey, newLicense);
    return newLicense;
  }

  public redeemLicense(merchantId: string, key: string): Merchant {
    const cleanKey = key.trim().toUpperCase();
    const license = this.data.licenses.find(l => l.key === cleanKey);
    if (!license) throw new Error('Kode lisensi tidak valid / tidak ditemukan.');
    if (license.status === 'USED') throw new Error('Kode lisensi ini sudah digunakan.');

    const merchant = this.getMerchantById(merchantId);
    if (!merchant) throw new Error('Merchant tidak ditemukan.');

    license.status = 'USED';
    license.usedByMerchantId = merchantId;
    license.usedByMerchantName = merchant.name;
    license.usedAt = new Date().toISOString();

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + license.durationDays);

    merchant.isPremium = true;
    merchant.licenseKey = cleanKey;
    merchant.licenseExpiresAt = expirationDate.toISOString();
    merchant.preOrderOnly = true;
    merchant.allowInstantAndPreOrder = false;
    if (!merchant.preOrderMinAmount) merchant.preOrderMinAmount = 1;
    if (!merchant.preOrderLeadDays) merchant.preOrderLeadDays = 1;
    merchant.updatedAt = new Date().toISOString();

    this.save();
    this.log(merchantId, `Redeemed license key ${cleanKey}`, 'MERCHANT');

    safeFirestoreSetDoc('licenses', cleanKey, license);
    safeFirestoreSetDoc('merchants', merchantId, merchant);
    return merchant;
  }
}

export const foodDb = new FoodDatabase();
