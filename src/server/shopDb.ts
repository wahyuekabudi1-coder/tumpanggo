/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop Isolated Database Module
 * Manages persistent storage, data integrity, and Firestore synchronization
 * specifically for Tumpang Shop marketplace, decoupled completely from Tumpang Food.
 */

import fs from 'fs';
import path from 'path';
import { 
  ShopProduct, ShopCategory, ShopOrder, ShopConfig, ShopAuditLog,
  ShopPaymentStatus, ShopOrderStatus, ShopOrderItem
} from '../types/shop';
import { shopConfig } from './config';
import { 
  getAdminDb, safeAdminSetDoc, safeAdminDeleteDoc, safeAdminGetDoc, 
  safeAdminGetDocs, removeUndefinedFields, isFirestoreAdminConfigured 
} from './firebaseAdmin';

const SHOP_DB_FILE = shopConfig.localDbFile;

interface ShopDatabaseSchema {
  config: ShopConfig;
  categories: ShopCategory[];
  products: ShopProduct[];
  orders: ShopOrder[];
  auditLogs: ShopAuditLog[];
}

const initialShopConfig: ShopConfig = {
  id: 'shop_config_default',
  storeName: shopConfig.defaults.storeName,
  storeAddress: shopConfig.defaults.storeAddress,
  storePhone: shopConfig.defaults.storePhone,
  isOpen: shopConfig.defaults.isOpen,
  qrisImage: shopConfig.defaults.qrisImage,
  defaultDeliveryFee: shopConfig.defaults.defaultDeliveryFee,
  serviceFee: shopConfig.defaults.serviceFee,
  minOrderAmount: shopConfig.defaults.minOrderAmount,
  updatedAt: new Date().toISOString()
};

const initialCategories: ShopCategory[] = [
  {
    id: 'scat_sembako',
    name: 'Sembako & Kebutuhan Pokok',
    slug: 'sembako',
    description: 'Beras, minyak goreng, gula, tepung, telur, dan sembako berkualitas.',
    icon: 'Package',
    orderIndex: 1,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'scat_bumbu',
    name: 'Sayur Segar & Bumbu Dapur',
    slug: 'bumbu-sayur',
    description: 'Bahan segar dari pasar Tumpang langsung ke dapur Anda.',
    icon: 'Carrot',
    orderIndex: 2,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'scat_khas',
    name: 'Oleh-Oleh & Khas Tumpang',
    slug: 'khas-tumpang',
    description: 'Kopi Semeru Dampit, keripik tempe sagu, dan jajanan khas Tumpang.',
    icon: 'Coffee',
    orderIndex: 3,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'scat_kebersihan',
    name: 'Kebersihan & Rumah Tangga',
    slug: 'kebersihan',
    description: 'Sabun, deterjen, sampo, dan perlengkapan kebersihan rumah.',
    icon: 'Sparkles',
    orderIndex: 4,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const initialProducts: ShopProduct[] = [
  {
    id: 'sprod_beras_5kg',
    sku: 'TS-SBK-001',
    name: 'Beras Premium Petani Tumpang 5kg',
    description: 'Beras putih pulen hasil panen langsung petani lokal lereng Gunung Semeru, bersih tanpa pemutih & pengawet.',
    categoryId: 'scat_sembako',
    price: 73500,
    stock: 45,
    unit: 'sak',
    images: ['https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=60'],
    variations: [
      {
        id: 'var_berat_beras',
        name: 'Pilihan Kemasan',
        options: [
          { id: 'opt_5kg', name: '5 kg (Standar)', priceDelta: 0, stock: 45, sku: 'TS-SBK-001-5KG' },
          { id: 'opt_10kg', name: '10 kg (Hemat)', priceDelta: 71500, stock: 20, sku: 'TS-SBK-001-10KG' }
        ]
      }
    ],
    isActive: true,
    isFeatured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'sprod_minyak_goreng_1l',
    sku: 'TS-SBK-002',
    name: 'Minyak Goreng MinyaKita 1 Liter',
    description: 'Minyak goreng kelapa sawit higienis terstandarisasi, jernih untuk aneka gorengan renyah.',
    categoryId: 'scat_sembako',
    price: 16500,
    stock: 80,
    unit: 'liter',
    images: ['https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500&auto=format&fit=crop&q=60'],
    variations: [
      {
        id: 'var_vol_minyak',
        name: 'Kemasan',
        options: [
          { id: 'opt_1l', name: 'Bantal 1 Liter', priceDelta: 0, stock: 50, sku: 'TS-SBK-002-1L' },
          { id: 'opt_2l', name: 'Pouch 2 Liter', priceDelta: 16500, stock: 30, sku: 'TS-SBK-002-2L' }
        ]
      }
    ],
    isActive: true,
    isFeatured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'sprod_gula_pasir_1kg',
    sku: 'TS-SBK-003',
    name: 'Gula Pasir Kristal Putih Rose Brand 1kg',
    description: 'Gula tebu kristal murni bermutu tinggi, bersih, manis alami untuk teh, kopi, dan adonan.',
    categoryId: 'scat_sembako',
    price: 18000,
    stock: 60,
    unit: 'kg',
    images: ['https://images.unsplash.com/photo-1581798459219-318e76aecc7b?w=500&auto=format&fit=crop&q=60'],
    isActive: true,
    isFeatured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'sprod_kopi_dampit_250g',
    sku: 'TS-KHS-001',
    name: 'Kopi Robusta Lereng Semeru Dampit 250gr',
    description: 'Kopi bubuk premium petik merah asli lereng selatan Semeru, aroma harum dengan citarasa cokelat pekat.',
    categoryId: 'scat_khas',
    price: 32000,
    stock: 35,
    unit: 'bungkus',
    images: ['https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500&auto=format&fit=crop&q=60'],
    variations: [
      {
        id: 'var_roast_kopi',
        name: 'Tingkat Gilingan',
        options: [
          { id: 'opt_halus', name: 'Bubuk Halus (Tubruk)', priceDelta: 0, stock: 20, sku: 'TS-KHS-001-FINE' },
          { id: 'opt_medium', name: 'Giling Medium (V60/Filter)', priceDelta: 0, stock: 15, sku: 'TS-KHS-001-MED' }
        ]
      }
    ],
    isActive: true,
    isFeatured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'sprod_keripik_tempe_tumpang',
    sku: 'TS-KHS-002',
    name: 'Keripik Tempe Sagu Renyah Khas Tumpang 200gr',
    description: 'Keripik tempe sagu legendaris gurih renyah tanpa pengawet, oleh-oleh favorit wisatawan Bromo & Tumpang.',
    categoryId: 'scat_khas',
    price: 15000,
    stock: 50,
    unit: 'bungkus',
    images: ['https://images.unsplash.com/photo-1613758201502-bd79b54a4181?w=500&auto=format&fit=crop&q=60'],
    isActive: true,
    isFeatured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'sprod_telur_ayam_1kg',
    sku: 'TS-SBK-004',
    name: 'Telur Ayam Negeri Segar Pilihan 1kg',
    description: 'Telur ayam peternak lokal Malang, isi 15-17 butir per kg, selalu fresh harian tanpa cangkang retak.',
    categoryId: 'scat_bumbu',
    price: 27500,
    stock: 40,
    unit: 'kg',
    images: ['https://images.unsplash.com/photo-1516467508483-a7212febe31a?w=500&auto=format&fit=crop&q=60'],
    isActive: true,
    isFeatured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'sprod_bawang_merah_500g',
    sku: 'TS-BMB-001',
    name: 'Bawang Merah Super Tumpang 500gr',
    description: 'Bawang merah kering pilihan dari petani lokal, aroma kuat, padat, dan tahan lama.',
    categoryId: 'scat_bumbu',
    price: 19000,
    stock: 30,
    unit: 'pack',
    images: ['https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=500&auto=format&fit=crop&q=60'],
    isActive: true,
    isFeatured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'sprod_sabun_nuvo_450ml',
    sku: 'TS-KBH-001',
    name: 'Sabun Mandi Cair Nuvo Family Refill 450ml',
    description: 'Perlindungan antibakteri keluarga dengan wangi segar menyejukkan, melembapkan kulit seharian.',
    categoryId: 'scat_kebersihan',
    price: 21500,
    stock: 25,
    unit: 'pouch',
    images: ['https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=500&auto=format&fit=crop&q=60'],
    isActive: true,
    isFeatured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export class ShopDatabase {
  private data: ShopDatabaseSchema;
  private isInitialized = false;

  constructor() {
    this.data = {
      config: initialShopConfig,
      categories: initialCategories,
      products: initialProducts,
      orders: [],
      auditLogs: []
    };
    this.loadFromFile();
  }

  public createBackup(): boolean {
    try {
      const backupPath = SHOP_DB_FILE + '.backup.json';
      fs.writeFileSync(backupPath, JSON.stringify(this.data, null, 2), 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  private loadFromFile() {
    try {
      if (fs.existsSync(SHOP_DB_FILE)) {
        const content = fs.readFileSync(SHOP_DB_FILE, 'utf-8');
        if (content && content.trim().length > 10) {
          const parsed = JSON.parse(content);
          this.data = {
            config: parsed.config || initialShopConfig,
            categories: Array.isArray(parsed.categories) ? parsed.categories : initialCategories,
            products: Array.isArray(parsed.products) ? parsed.products : initialProducts,
            orders: Array.isArray(parsed.orders) ? parsed.orders : [],
            auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : []
          };
          return;
        }
      }
    } catch (err: any) {
      console.warn('[TumpangShop DB] Gagal membaca file JSON lokal, menggunakan struktur default:', err.message);
    }

    // Write initial seed if file didn't exist
    this.saveToFile();
  }

  private saveToFile(): boolean {
    try {
      const dir = path.dirname(SHOP_DB_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(SHOP_DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
      return true;
    } catch (e: any) {
      console.error('[TumpangShop DB] Gagal menulis ke file JSON lokal:', e.message);
      return false;
    }
  }

  /**
   * Asynchronous cold-start initialization and bidirectional Firestore synchronization
   */
  public async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;

    if (!isFirestoreAdminConfigured()) {
      this.isInitialized = true;
      return;
    }

    try {
      const col = shopConfig.collections;

      // 1. Sync Shop Config
      const cloudConfig = await safeAdminGetDoc(col.config, 'main');
      if (cloudConfig) {
        this.data.config = { ...this.data.config, ...cloudConfig };
      } else {
        await safeAdminSetDoc(col.config, 'main', removeUndefinedFields(this.data.config));
      }

      // 2. Sync Shop Categories
      const cloudCats = await safeAdminGetDocs(col.categories);
      if (cloudCats && cloudCats.length > 0) {
        this.data.categories = cloudCats as ShopCategory[];
      } else {
        for (const cat of this.data.categories) {
          await safeAdminSetDoc(col.categories, cat.id, removeUndefinedFields(cat));
        }
      }

      // 3. Sync Shop Products
      const cloudProds = await safeAdminGetDocs(col.products);
      if (cloudProds && cloudProds.length > 0) {
        this.data.products = cloudProds as ShopProduct[];
      } else {
        for (const prod of this.data.products) {
          await safeAdminSetDoc(col.products, prod.id, removeUndefinedFields(prod));
        }
      }

      // 4. Sync Shop Orders
      const cloudOrders = await safeAdminGetDocs(col.orders);
      if (cloudOrders && cloudOrders.length > 0) {
        this.data.orders = cloudOrders as ShopOrder[];
      }

      this.saveToFile();
      this.isInitialized = true;
      console.log('[TumpangShop DB] Sinkronisasi Firestore Admin untuk Tumpang Shop berhasil.');
    } catch (err: any) {
      console.warn('[TumpangShop DB] Sinkronisasi cloud gagal atau offline, berjalan dengan cache lokal:', err.message);
      this.isInitialized = true;
    }
  }

  public logAudit(action: string, details: string, userId: string = 'shop_admin', role: 'SHOP_ADMIN' | 'SYSTEM' | 'CUSTOMER' = 'SHOP_ADMIN') {
    const entry: ShopAuditLog = {
      id: `slog_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      action,
      userId,
      role,
      details,
      createdAt: new Date().toISOString()
    };
    this.data.auditLogs.unshift(entry);
    if (this.data.auditLogs.length > 500) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 500);
    }
    safeAdminSetDoc(shopConfig.collections.auditLogs, entry.id, removeUndefinedFields(entry)).catch(() => {});
  }

  // ==========================================
  // CONFIG OPERATIONS
  // ==========================================

  public getConfig(): ShopConfig {
    return { ...this.data.config };
  }

  public async updateConfig(actorId: string, updates: Partial<ShopConfig>): Promise<ShopConfig> {
    this.data.config = {
      ...this.data.config,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.saveToFile();
    await safeAdminSetDoc(shopConfig.collections.config, 'main', removeUndefinedFields(this.data.config));
    this.logAudit('UPDATE_SHOP_CONFIG', `Config diperbarui oleh ${actorId}`, actorId);
    return { ...this.data.config };
  }

  // ==========================================
  // CATEGORY OPERATIONS
  // ==========================================

  public getCategories(): ShopCategory[] {
    return [...this.data.categories].sort((a, b) => a.orderIndex - b.orderIndex);
  }

  public getCategoryById(id: string): ShopCategory | undefined {
    return this.data.categories.find(c => c.id === id);
  }

  public async createCategory(actorId: string, input: Omit<ShopCategory, 'id' | 'createdAt' | 'updatedAt'>): Promise<ShopCategory> {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error('Nama kategori wajib diisi.');
    }

    const newCategory: ShopCategory = {
      id: `scat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: input.name.trim(),
      slug: input.slug ? input.slug.trim().toLowerCase() : input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: input.description || '',
      icon: input.icon || 'Package',
      orderIndex: typeof input.orderIndex === 'number' ? input.orderIndex : this.data.categories.length + 1,
      isActive: input.isActive ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.data.categories.push(newCategory);
    this.saveToFile();
    await safeAdminSetDoc(shopConfig.collections.categories, newCategory.id, removeUndefinedFields(newCategory));
    this.logAudit('CREATE_CATEGORY', `Kategori dibuat: ${newCategory.name}`, actorId);
    return newCategory;
  }

  public async updateCategory(actorId: string, id: string, updates: Partial<ShopCategory>): Promise<ShopCategory> {
    const index = this.data.categories.findIndex(c => c.id === id);
    if (index === -1) {
      throw new Error('Kategori tidak ditemukan.');
    }

    const current = this.data.categories[index];
    const updated: ShopCategory = {
      ...current,
      ...updates,
      id: current.id, // Immutable ID
      updatedAt: new Date().toISOString()
    };

    this.data.categories[index] = updated;
    this.saveToFile();
    await safeAdminSetDoc(shopConfig.collections.categories, id, removeUndefinedFields(updated));
    this.logAudit('UPDATE_CATEGORY', `Kategori diperbarui: ${updated.name}`, actorId);
    return updated;
  }

  public async deleteCategory(actorId: string, id: string): Promise<boolean> {
    // Check if products exist in category
    const hasProducts = this.data.products.some(p => p.categoryId === id);
    if (hasProducts) {
      throw new Error('Tidak dapat menghapus kategori yang masih memiliki produk aktif. Pindahkan produk terlebih dahulu.');
    }

    const index = this.data.categories.findIndex(c => c.id === id);
    if (index === -1) return false;

    const removedName = this.data.categories[index].name;
    this.data.categories.splice(index, 1);
    this.saveToFile();
    await safeAdminDeleteDoc(shopConfig.collections.categories, id);
    this.logAudit('DELETE_CATEGORY', `Kategori dihapus: ${removedName}`, actorId);
    return true;
  }

  // ==========================================
  // PRODUCT OPERATIONS
  // ==========================================

  public getProducts(filter?: { categoryId?: string; activeOnly?: boolean; search?: string }): ShopProduct[] {
    let result = [...this.data.products];

    if (filter?.activeOnly) {
      result = result.filter(p => p.isActive);
    }

    if (filter?.categoryId && filter.categoryId !== 'all') {
      result = result.filter(p => p.categoryId === filter.categoryId);
    }

    if (filter?.search && filter.search.trim().length > 0) {
      const q = filter.search.trim().toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.sku.toLowerCase().includes(q) || 
        p.description.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0));
  }

  public getProductById(id: string): ShopProduct | undefined {
    return this.data.products.find(p => p.id === id || p.sku.toLowerCase() === id.toLowerCase());
  }

  public async createProduct(actorId: string, input: Omit<ShopProduct, 'id' | 'createdAt' | 'updatedAt'>): Promise<ShopProduct> {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error('Nama produk wajib diisi.');
    }
    if (typeof input.price !== 'number' || input.price < 0) {
      throw new Error('Harga produk harus berupa angka valid non-negatif.');
    }
    if (typeof input.stock !== 'number' || input.stock < 0) {
      throw new Error('Stok produk harus berupa angka valid non-negatif.');
    }

    const sku = input.sku && input.sku.trim().length > 0 
      ? input.sku.trim().toUpperCase()
      : `TS-PRD-${Math.floor(1000 + Math.random() * 9000)}`;

    const newProduct: ShopProduct = {
      id: `sprod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sku,
      name: input.name.trim(),
      description: input.description || '',
      categoryId: input.categoryId || (this.data.categories[0]?.id || 'scat_sembako'),
      price: Math.round(input.price),
      stock: Math.floor(input.stock),
      unit: input.unit || 'pcs',
      images: Array.isArray(input.images) && input.images.length > 0 ? input.images : ['https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60'],
      variations: input.variations || [],
      isActive: input.isActive ?? true,
      isFeatured: input.isFeatured ?? false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.data.products.push(newProduct);
    this.saveToFile();
    await safeAdminSetDoc(shopConfig.collections.products, newProduct.id, removeUndefinedFields(newProduct));
    this.logAudit('CREATE_PRODUCT', `Produk dibuat: ${newProduct.name} (SKU: ${newProduct.sku})`, actorId);
    return newProduct;
  }

  public async updateProduct(actorId: string, id: string, updates: Partial<ShopProduct>): Promise<ShopProduct> {
    const index = this.data.products.findIndex(p => p.id === id);
    if (index === -1) {
      throw new Error('Produk tidak ditemukan.');
    }

    const current = this.data.products[index];

    // Validate price and stock if modified
    if (updates.price !== undefined && (typeof updates.price !== 'number' || updates.price < 0)) {
      throw new Error('Harga produk harus berupa angka valid non-negatif.');
    }
    if (updates.stock !== undefined && (typeof updates.stock !== 'number' || updates.stock < 0)) {
      throw new Error('Stok produk harus berupa angka valid non-negatif.');
    }

    const updated: ShopProduct = {
      ...current,
      ...updates,
      id: current.id, // Immutable ID
      price: updates.price !== undefined ? Math.round(updates.price) : current.price,
      stock: updates.stock !== undefined ? Math.floor(updates.stock) : current.stock,
      updatedAt: new Date().toISOString()
    };

    this.data.products[index] = updated;
    this.saveToFile();
    await safeAdminSetDoc(shopConfig.collections.products, id, removeUndefinedFields(updated));
    this.logAudit('UPDATE_PRODUCT', `Produk diperbarui: ${updated.name}`, actorId);
    return updated;
  }

  public async deleteProduct(actorId: string, id: string): Promise<boolean> {
    const index = this.data.products.findIndex(p => p.id === id);
    if (index === -1) return false;

    const removedName = this.data.products[index].name;
    this.data.products.splice(index, 1);
    this.saveToFile();
    await safeAdminDeleteDoc(shopConfig.collections.products, id);
    this.logAudit('DELETE_PRODUCT', `Produk dihapus: ${removedName}`, actorId);
    return true;
  }

  // ==========================================
  // ORDER OPERATIONS WITH PRICE & STOCK VALIDATION
  // ==========================================

  public async createOrder(input: {
    customerName: string;
    customerPhone: string;
    deliveryAddress: string;
    customerDistrict: string;
    shippingMethod?: string;
    deliveryNotes?: string;
    clientRequestId?: string;
    items: {
      productId: string;
      quantity: number;
      variationId?: string;
      optionId?: string;
    }[];
  }): Promise<ShopOrder> {
    // 1. Validate Store Status
    if (!this.data.config.isOpen) {
      throw new Error('Layanan Tumpang Shop saat ini sedang tutup. Silakan coba kembali saat toko dibuka.');
    }

    // 2. Validate Customer Details
    if (!input.customerName || input.customerName.trim().length === 0) {
      throw new Error('Nama pemesan wajib diisi.');
    }
    if (!input.customerPhone || input.customerPhone.trim().length === 0) {
      throw new Error('Nomor telepon / WhatsApp pemesan wajib diisi.');
    }
    const cleanPhone = input.customerPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 9) {
      throw new Error('Nomor WhatsApp tidak valid. Masukkan minimal 9 digit angka.');
    }
    if (!input.deliveryAddress || input.deliveryAddress.trim().length === 0) {
      throw new Error('Alamat pengantaran belanja wajib diisi.');
    }
    if (!input.customerDistrict || input.customerDistrict.trim().length === 0) {
      throw new Error('Kecamatan pengantaran belanja wajib dipilih.');
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error('Keranjang belanja kosong. Pilih minimal 1 produk.');
    }

    // 3. Prevent duplicate orders (Idempotency check & rapid double-submit guard)
    if (input.clientRequestId && input.clientRequestId.trim().length > 0) {
      const existingReq = this.data.orders.find(o => o.clientRequestId === input.clientRequestId?.trim());
      if (existingReq) {
        return existingReq;
      }
    }
    const recentWindow = new Date(Date.now() - 15000).toISOString();
    const duplicateRecent = this.data.orders.find(o => 
      o.customerPhone.replace(/[^0-9]/g, '') === cleanPhone &&
      o.createdAt >= recentWindow &&
      o.items.length === input.items.length &&
      o.items.every((it, idx) => it.productId === input.items[idx]?.productId && it.quantity === input.items[idx]?.quantity)
    );
    if (duplicateRecent) {
      return duplicateRecent;
    }

    // 4. Validate Products, Price, and Stock strictly on backend
    const validatedItems: ShopOrderItem[] = [];
    let subtotal = 0;

    for (const itemInput of input.items) {
      if (!itemInput.productId || !itemInput.quantity || itemInput.quantity < 1) {
        throw new Error('Kuantitas produk tidak valid.');
      }

      const product = this.data.products.find(p => p.id === itemInput.productId);
      if (!product) {
        throw new Error(`Produk dengan ID "${itemInput.productId}" tidak ditemukan.`);
      }
      if (!product.isActive) {
        throw new Error(`Produk "${product.name}" sedang tidak aktif atau tidak tersedia.`);
      }

      let unitPrice = product.price;
      let selectedVariation: ShopOrderItem['selectedVariation'] = undefined;

      // Handle variation if specified
      if (itemInput.variationId && itemInput.optionId && product.variations) {
        const variation = product.variations.find(v => v.id === itemInput.variationId);
        if (!variation) {
          throw new Error(`Variasi produk tidak valid untuk "${product.name}".`);
        }
        const option = variation.options.find(o => o.id === itemInput.optionId);
        if (!option) {
          throw new Error(`Pilihan variasi tidak valid untuk "${product.name}".`);
        }

        // Check variation-specific stock if defined
        if (typeof option.stock === 'number' && option.stock < itemInput.quantity) {
          throw new Error(`Stok variasi "${option.name}" untuk produk "${product.name}" tidak mencukupi (Tersisa: ${option.stock}, Diminta: ${itemInput.quantity}).`);
        }

        unitPrice = product.price + (option.priceDelta || 0);
        selectedVariation = {
          variationId: variation.id,
          variationName: variation.name,
          optionId: option.id,
          optionName: option.name
        };
      } else {
        // Check base product stock
        if (product.stock < itemInput.quantity) {
          throw new Error(`Stok untuk produk "${product.name}" tidak mencukupi (Tersisa: ${product.stock}, Diminta: ${itemInput.quantity}).`);
        }
      }

      const itemSubtotal = unitPrice * itemInput.quantity;
      subtotal += itemSubtotal;

      validatedItems.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        unit: product.unit,
        selectedVariation,
        price: unitPrice,
        quantity: itemInput.quantity,
        subtotal: itemSubtotal
      });
    }

    // 5. Validate Minimum Order Amount
    if (subtotal < this.data.config.minOrderAmount) {
      throw new Error(`Subtotal belanja minimal adalah Rp ${this.data.config.minOrderAmount.toLocaleString('id-ID')}. Subtotal saat ini: Rp ${subtotal.toLocaleString('id-ID')}`);
    }

    // 6. Calculate Fees based on Shipping Method & 3-Digit Unique Code
    const method = (input.shippingMethod || 'INSTANT').toUpperCase();
    let deliveryFee = this.data.config.defaultDeliveryFee;
    let shippingMethodLabel = 'Kurir Instan Tumpang Go';

    if (method === 'PICKUP') {
      deliveryFee = 0;
      shippingMethodLabel = 'Ambil Sendiri di Toko (Pickup)';
    } else if (method === 'REGULAR') {
      deliveryFee = Math.max(0, Math.round(this.data.config.defaultDeliveryFee * 0.7));
      shippingMethodLabel = 'Kurir Reguler (Kirim Besok Pagi)';
    }

    const serviceFee = this.data.config.serviceFee;
    const uniqueCode = Math.floor(100 + Math.random() * 899); // 100-999
    const total = subtotal + deliveryFee + serviceFee + uniqueCode;

    // 7. Deduct Stock in backend memory immediately
    for (const item of validatedItems) {
      const pIndex = this.data.products.findIndex(p => p.id === item.productId);
      if (pIndex !== -1) {
        const prod = this.data.products[pIndex];
        prod.stock = Math.max(0, prod.stock - item.quantity);

        if (item.selectedVariation && prod.variations) {
          const v = prod.variations.find(v => v.id === item.selectedVariation?.variationId);
          const opt = v?.options.find(o => o.id === item.selectedVariation?.optionId);
          if (opt) {
            opt.stock = Math.max(0, opt.stock - item.quantity);
          }
        }
        safeAdminSetDoc(shopConfig.collections.products, prod.id, removeUndefinedFields(prod)).catch(() => {});
      }
    }

    // 8. Generate Order Object with clear separation between Payment Status & Order Status
    const now = new Date();
    const expiryMinutes = shopConfig.defaults.paymentExpiryMinutes || 30;
    const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000).toISOString();

    const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, '');
    const dailyCount = this.data.orders.filter(o => o.createdAt.startsWith(now.toISOString().slice(0, 10))).length + 1;
    const orderNumber = `TS-${datePrefix}-${String(dailyCount).padStart(3, '0')}`;

    const newOrder: ShopOrder = {
      id: `sord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orderNumber,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      deliveryAddress: input.deliveryAddress.trim(),
      customerDistrict: input.customerDistrict.trim(),
      shippingMethod: method,
      shippingMethodLabel,
      deliveryNotes: input.deliveryNotes?.trim() || '',
      clientRequestId: input.clientRequestId?.trim(),
      items: validatedItems,
      subtotal,
      deliveryFee,
      serviceFee,
      uniqueCode,
      total,
      paymentStatus: ShopPaymentStatus.UNPAID,
      orderStatus: ShopOrderStatus.NEW,
      paymentExpiresAt: expiresAt,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    this.data.orders.unshift(newOrder);
    this.saveToFile();
    await safeAdminSetDoc(shopConfig.collections.orders, newOrder.id, removeUndefinedFields(newOrder));
    this.logAudit('CREATE_SHOP_ORDER', `Pesanan dibuat: ${newOrder.orderNumber} senilai Rp ${newOrder.total.toLocaleString('id-ID')}`, 'CUSTOMER', 'CUSTOMER');

    return newOrder;
  }

  public getOrders(filter?: { paymentStatus?: string; orderStatus?: string }): ShopOrder[] {
    let list = [...this.data.orders];

    if (filter?.paymentStatus && filter.paymentStatus !== 'all') {
      list = list.filter(o => o.paymentStatus === filter.paymentStatus);
    }

    if (filter?.orderStatus && filter.orderStatus !== 'all') {
      list = list.filter(o => o.orderStatus === filter.orderStatus);
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getOrderById(id: string): ShopOrder | undefined {
    return this.data.orders.find(o => o.id === id || o.orderNumber.toLowerCase() === id.toLowerCase());
  }

  /**
   * Secure lookup by order number / ID AND customer WhatsApp number.
   * Prevents leaking customer data when only orderNumber is known.
   */
  public getOrderByNumberAndPhone(orderNumberOrId: string, phone: string): ShopOrder | undefined {
    if (!orderNumberOrId || !phone) return undefined;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const normUserPhone = cleanPhone.startsWith('62') ? '0' + cleanPhone.slice(2) : cleanPhone;

    return this.data.orders.find(o => {
      const matchId = o.id.toLowerCase() === orderNumberOrId.toLowerCase() ||
                      o.orderNumber.toLowerCase() === orderNumberOrId.toLowerCase();
      if (!matchId) return false;

      const orderClean = o.customerPhone.replace(/[^0-9]/g, '');
      const normOrderPhone = orderClean.startsWith('62') ? '0' + orderClean.slice(2) : orderClean;

      return normUserPhone === normOrderPhone || 
             normUserPhone.endsWith(normOrderPhone.slice(-8)) || 
             normOrderPhone.endsWith(normUserPhone.slice(-8));
    });
  }

  public getOrdersByCustomerPhone(phone: string): ShopOrder[] {
    const clean = phone.replace(/[^0-9]/g, '');
    return this.data.orders.filter(o => {
      const orderPhone = o.customerPhone.replace(/[^0-9]/g, '');
      return orderPhone.endsWith(clean) || clean.endsWith(orderPhone);
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async uploadPaymentProof(orderId: string, proofUrl: string): Promise<ShopOrder> {
    const index = this.data.orders.findIndex(o => o.id === orderId);
    if (index === -1) {
      throw new Error('Pesanan tidak ditemukan.');
    }

    const order = this.data.orders[index];
    if (order.paymentStatus === ShopPaymentStatus.PAID) {
      throw new Error('Pesanan ini sudah terverifikasi lunas.');
    }
    if (order.orderStatus === ShopOrderStatus.CANCELLED) {
      throw new Error('Pesanan ini telah dibatalkan.');
    }

    order.paymentProof = proofUrl;
    order.paymentStatus = ShopPaymentStatus.WAITING_VERIFICATION;
    order.updatedAt = new Date().toISOString();

    this.saveToFile();
    await safeAdminSetDoc(shopConfig.collections.orders, order.id, removeUndefinedFields(order));
    this.logAudit('UPLOAD_PAYMENT_PROOF', `Bukti bayar diunggah untuk ${order.orderNumber}`, 'CUSTOMER', 'CUSTOMER');
    return { ...order };
  }

  public async verifyPayment(actorId: string, orderId: string, approved: boolean, reason?: string): Promise<ShopOrder> {
    const index = this.data.orders.findIndex(o => o.id === orderId);
    if (index === -1) {
      throw new Error('Pesanan tidak ditemukan.');
    }

    const order = this.data.orders[index];
    const now = new Date().toISOString();

    if (approved) {
      order.paymentStatus = ShopPaymentStatus.PAID;
      order.paymentVerifiedAt = now;
      if (order.orderStatus === ShopOrderStatus.NEW) {
        order.orderStatus = ShopOrderStatus.PROCESSING;
      }
      this.logAudit('VERIFY_PAYMENT_APPROVED', `Pembayaran pesanan ${order.orderNumber} diverifikasi sah`, actorId);
    } else {
      order.paymentStatus = ShopPaymentStatus.REJECTED;
      order.cancelReason = reason || 'Bukti transfer tidak valid atau dana belum masuk.';
      this.logAudit('VERIFY_PAYMENT_REJECTED', `Pembayaran pesanan ${order.orderNumber} ditolak: ${order.cancelReason}`, actorId);
    }

    order.updatedAt = now;
    this.saveToFile();
    await safeAdminSetDoc(shopConfig.collections.orders, order.id, removeUndefinedFields(order));
    return { ...order };
  }

  public async updateOrderStatus(actorId: string, orderId: string, newStatus: ShopOrderStatus, reason?: string): Promise<ShopOrder> {
    const index = this.data.orders.findIndex(o => o.id === orderId);
    if (index === -1) {
      throw new Error('Pesanan tidak ditemukan.');
    }

    const order = this.data.orders[index];
    const prevStatus = order.orderStatus;

    if (prevStatus === newStatus) {
      return { ...order };
    }

    // If order is cancelled and wasn't previously cancelled, replenish stock!
    if (newStatus === ShopOrderStatus.CANCELLED && prevStatus !== ShopOrderStatus.CANCELLED) {
      for (const item of order.items) {
        const pIndex = this.data.products.findIndex(p => p.id === item.productId);
        if (pIndex !== -1) {
          const prod = this.data.products[pIndex];
          prod.stock += item.quantity;

          if (item.selectedVariation && prod.variations) {
            const v = prod.variations.find(v => v.id === item.selectedVariation?.variationId);
            const opt = v?.options.find(o => o.id === item.selectedVariation?.optionId);
            if (opt) {
              opt.stock += item.quantity;
            }
          }
          safeAdminSetDoc(shopConfig.collections.products, prod.id, removeUndefinedFields(prod)).catch(() => {});
        }
      }
      order.cancelReason = reason || 'Pesanan dibatalkan.';
      if (order.paymentStatus === ShopPaymentStatus.UNPAID) {
        order.paymentStatus = ShopPaymentStatus.EXPIRED;
      }
    }

    order.orderStatus = newStatus;
    order.updatedAt = new Date().toISOString();

    this.saveToFile();
    await safeAdminSetDoc(shopConfig.collections.orders, order.id, removeUndefinedFields(order));
    this.logAudit('UPDATE_ORDER_STATUS', `Status pesanan ${order.orderNumber} diubah: ${prevStatus} -> ${newStatus}`, actorId);
    return { ...order };
  }

  // ==========================================
  // METRICS & REPORTING
  // ==========================================

  public getSummaryMetrics() {
    const totalOrders = this.data.orders.length;
    const paidOrders = this.data.orders.filter(o => o.paymentStatus === ShopPaymentStatus.PAID);
    const totalRevenue = paidOrders.reduce((acc, curr) => acc + curr.total, 0);
    const pendingPaymentVerifications = this.data.orders.filter(o => o.paymentStatus === ShopPaymentStatus.WAITING_VERIFICATION).length;
    const activeProducts = this.data.products.filter(p => p.isActive).length;
    const lowStockProducts = this.data.products.filter(p => p.stock <= 5).length;

    return {
      totalOrders,
      paidOrderCount: paidOrders.length,
      totalRevenue,
      pendingPaymentVerifications,
      activeProducts,
      lowStockProducts,
      isOpen: this.data.config.isOpen
    };
  }
}

// Global Singleton Instance for Tumpang Shop
export const shopDb = new ShopDatabase();
