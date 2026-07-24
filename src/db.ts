import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { 
  Merchant, Category, MenuItem, Order, OrderItem, Driver, Settlement, AuditLog, SystemConfig, 
  OrderStatus, SettlementStatus, AssignmentMode, PartnerRegistration, LicenseKey, calculateTieredServiceFee
} from './types.ts';

const DB_FILE = path.join(process.cwd(), 'tumpang_db.json');

// --- FIREBASE FIRESTORE INITIALIZATION ---
let db: any = null;
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    console.log('Firebase Client SDK initialized successfully in backend.');
  } else {
    console.warn('firebase-applet-config.json not found. Running in local fallback mode.');
  }
} catch (e) {
  console.error('Failed to initialize Firebase Client SDK:', e);
}

// --- ERROR HANDLING SPECS ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: 'SYSTEM_BACKEND',
      email: 'sawahjayagroup@gmail.com',
      emailVerified: true,
      isAnonymous: false,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
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
  partnerRegistrations?: PartnerRegistration[];
  licenses?: LicenseKey[];
}

// Default Seed Data
const initialConfig: SystemConfig = {
  serviceFee: 2000,
  deliveryFeePerKm: 1500,
  defaultDeliveryFee: 5000,
  commissionPercent: 10,
  assignmentMode: AssignmentMode.AUTOMATIC,
  qrisImage: 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
  systemOpen: true
};

const initialMerchants: Merchant[] = [
  {
    id: 'm1',
    name: 'Bakso Solo Pak Kumis Tumpang',
    ownerName: 'Pak Kumis',
    phone: '081234567891',
    email: 'pakkumis@tumpangfood.com',
    address: 'Jl. Raya Tumpang No. 45, Tumpang, Malang',
    latitude: -7.9482,
    longitude: 112.7612,
    openTime: '09:00',
    closeTime: '21:00',
    bankName: 'Bank Mandiri',
    bankAccount: '1440023456789',
    bankHolder: 'Wahyudi Kumis',
    active: true,
    isPremium: true,
    rating: 4.8,
    cookTimeEstimate: '15 mins',
    image: 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=600&auto=format&fit=crop&q=80',
    description: 'Bakso Solo asli dengan tetelan melimpah and kaldu sapi murni yang gurih mantap.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'm2',
    name: 'Sate Khas Malang Tumpang',
    ownerName: 'Cak Ali',
    phone: '081234567892',
    email: 'cakali@tumpangfood.com',
    address: 'Jl. Kebon Agung No. 12, Tumpang, Malang',
    latitude: -7.9495,
    longitude: 112.7634,
    openTime: '16:00',
    closeTime: '22:30',
    bankName: 'Bank BCA',
    bankAccount: '3150987654',
    bankHolder: 'Ali Imron',
    active: true,
    rating: 4.7,
    cookTimeEstimate: '30 mins',
    image: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=600&auto=format&fit=crop&q=80',
    description: 'Sate ayam dan kambing empuk berbumbu kacang khas Malang racikan resep keluarga.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'm3',
    name: 'Warung Nasi Campur Bu Djoko',
    ownerName: 'Bu Djoko',
    phone: '081234567893',
    email: 'budjoko@tumpangfood.com',
    address: 'Jl. Alun-Alun Tumpang Timur No. 3, Tumpang, Malang',
    latitude: -7.9470,
    longitude: 112.7600,
    openTime: '07:00',
    closeTime: '17:00',
    bankName: 'Bank BRI',
    bankAccount: '002101034567503',
    bankHolder: 'Siti Djoko',
    active: true,
    rating: 4.9,
    cookTimeEstimate: '15 mins',
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80',
    description: 'Nasi campur legendaris dengan lauk lengkap: empal empuk, bali telur, mi goreng, sambal bajak.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const initialCategories: Category[] = [
  { id: 'c1_1', merchantId: 'm1', name: 'Makanan Utama', orderIndex: 1 },
  { id: 'c1_2', merchantId: 'm1', name: 'Minuman', orderIndex: 2 },
  { id: 'c2_1', merchantId: 'm2', name: 'Sate Ayam', orderIndex: 1 },
  { id: 'c2_2', merchantId: 'm2', name: 'Sate Kambing & Lontong', orderIndex: 2 },
  { id: 'c2_3', merchantId: 'm2', name: 'Minuman Segar', orderIndex: 3 },
  { id: 'c3_1', merchantId: 'm3', name: 'Nasi Rames', orderIndex: 1 },
  { id: 'c3_2', merchantId: 'm3', name: 'Sop & Rawon', orderIndex: 2 },
  { id: 'c3_3', merchantId: 'm3', name: 'Minuman', orderIndex: 3 }
];

const initialMenuItems: MenuItem[] = [
  {
    id: 'menu_1',
    merchantId: 'm1',
    categoryId: 'c1_1',
    name: 'Bakso Komplit Super',
    description: '1 bakso halus besar, 1 bakso urat besar, 3 bakso halus kecil, mie kuning, bihun, tahu basah, sayuran.',
    price: 18000,
    available: true,
    image: 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=300&auto=format&fit=crop&q=60',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'menu_2',
    merchantId: 'm1',
    categoryId: 'c1_1',
    name: 'Bakso Tetelan Gurih',
    description: 'Bakso campur ditambah dengan potongan tetelan daging sapi muda yang empuk dan gurih.',
    price: 22000,
    available: true,
    image: 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=300&auto=format&fit=crop&q=60',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'menu_3',
    merchantId: 'm1',
    categoryId: 'c1_1',
    name: 'Mie Ayam Bakso Solo',
    description: 'Mie telur kenyal dengan topping ayam semur gurih ditambah 2 butir bakso halus kecil.',
    price: 15000,
    available: true,
    image: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=300&auto=format&fit=crop&q=60',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'menu_4',
    merchantId: 'm1',
    categoryId: 'c1_2',
    name: 'Es Teh Manis Jumbo',
    description: 'Es teh manis segar ukuran gelas besar penawar dahaga.',
    price: 4000,
    available: true,
    image: 'https://images.unsplash.com/photo-1497534446932-c925b458314e?w=300&auto=format&fit=crop&q=60',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'menu_5',
    merchantId: 'm2',
    categoryId: 'c2_1',
    name: 'Sate Ayam Bumbu Kacang (10 Tusuk)',
    description: '10 tusuk sate daging dada ayam empuk dengan siraman bumbu kacang legit khas Malang.',
    price: 20000,
    available: true,
    image: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=300&auto=format&fit=crop&q=60',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'menu_6',
    merchantId: 'm2',
    categoryId: 'c2_2',
    name: 'Sate Kambing Empuk (10 Tusuk)',
    description: '10 tusuk sate kambing muda empuk dipanggang pas dengan kecap manis, irisan bawang merah dan cabai rawit.',
    price: 35000,
    available: true,
    image: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=300&auto=format&fit=crop&q=60',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'menu_7',
    merchantId: 'm2',
    categoryId: 'c2_2',
    name: 'Lontong Daun',
    description: 'Lontong tradisional dibungkus daun pisang yang harum dan pulen.',
    price: 5000,
    available: true,
    image: 'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?w=300&auto=format&fit=crop&q=60',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'menu_8',
    merchantId: 'm2',
    categoryId: 'c2_3',
    name: 'Es Jeruk Peras Segar',
    description: 'Es jeruk peras asli dari jeruk lokal pilihan yang segar asam manis.',
    price: 5000,
    available: true,
    image: 'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=300&auto=format&fit=crop&q=60',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'menu_9',
    merchantId: 'm3',
    categoryId: 'c3_1',
    name: 'Nasi Campur Spesial Empal',
    description: 'Nasi hangat, empal sapi manis gurih, mie kuning goreng, bali telur setengah, sambal bajak pedas mantap.',
    price: 25000,
    available: true,
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&auto=format&fit=crop&q=60',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'menu_10',
    merchantId: 'm3',
    categoryId: 'c3_1',
    name: 'Nasi Ayam Goreng Lalapan',
    description: 'Nasi, ayam goreng bumbu kuning renyah, tahu, tempe, lalapan segar, sambal tomat terasi.',
    price: 18000,
    available: true,
    image: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=300&auto=format&fit=crop&q=60',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'menu_11',
    merchantId: 'm3',
    categoryId: 'c3_2',
    name: 'Rawon Daging Sapi Bligo',
    description: 'Kuah rawon hitam pekat gurih berkaldu dengan irisan daging sapi empuk dan pelengkap tauge pendek.',
    price: 22000,
    available: true,
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&auto=format&fit=crop&q=60',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'menu_12',
    merchantId: 'm3',
    categoryId: 'c3_3',
    name: 'Teh Hangat Saring',
    description: 'Teh harum hangat diseduh tradisional dengan gula pasir murni.',
    price: 3000,
    available: true,
    image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=300&auto=format&fit=crop&q=60',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const initialDrivers: Driver[] = [
  {
    id: 'd1',
    name: 'Driver Budi Santoso',
    phone: '081234567001',
    email: 'budi@tumpangfood.com',
    active: true,
    online: true,
    latitude: -7.9480,
    longitude: 112.7610,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'd2',
    name: 'Driver Joko Prasetyo',
    phone: '081234567002',
    email: 'joko@tumpangfood.com',
    active: true,
    online: true,
    latitude: -7.9500,
    longitude: 112.7640,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export class Database {
  private data: DatabaseSchema;

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
      partnerRegistrations: []
    };
    this.load();
  }

  private isInitialized = false;

  // --- FIREBASE INITIAL SYNC ON APP START ---
  public async init() {
    if (this.isInitialized) return;
    if (!db) {
      console.warn('Firebase db is not initialized, skipping sync.');
      return;
    }
    this.isInitialized = true;

    try {
      console.log('Synchronizing state with Firebase Firestore...');

      // 1. System Config
      try {
        const configDoc = await getDoc(doc(db, 'systemConfig', 'config_1'));
        if (configDoc.exists()) {
          this.data.systemConfig = configDoc.data() as SystemConfig;
        } else {
          console.log('Seeding systemConfig to Firestore...');
          await setDoc(doc(db, 'systemConfig', 'config_1'), initialConfig);
          this.data.systemConfig = initialConfig;
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'systemConfig/config_1');
      }

      // 2. Merchants
      try {
        const merchantSnapshot = await getDocs(collection(db, 'merchants'));
        if (!merchantSnapshot.empty) {
          this.data.merchants = merchantSnapshot.docs.map(d => d.data() as Merchant);
        } else {
          console.log('Seeding merchants to Firestore...');
          for (const m of initialMerchants) {
            await setDoc(doc(db, 'merchants', m.id), m);
          }
          this.data.merchants = initialMerchants;
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'merchants');
      }

      // 3. Categories
      try {
        const categorySnapshot = await getDocs(collection(db, 'categories'));
        if (!categorySnapshot.empty) {
          this.data.categories = categorySnapshot.docs.map(d => d.data() as Category);
        } else {
          console.log('Seeding categories to Firestore...');
          for (const c of initialCategories) {
            await setDoc(doc(db, 'categories', c.id), c);
          }
          this.data.categories = initialCategories;
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'categories');
      }

      // 4. Menu Items
      try {
        const menuItemSnapshot = await getDocs(collection(db, 'menuItems'));
        if (!menuItemSnapshot.empty) {
          this.data.menuItems = menuItemSnapshot.docs.map(d => d.data() as MenuItem);
        } else {
          console.log('Seeding menuItems to Firestore...');
          for (const item of initialMenuItems) {
            await setDoc(doc(db, 'menuItems', item.id), item);
          }
          this.data.menuItems = initialMenuItems;
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'menuItems');
      }

      // 5. Drivers
      try {
        const driverSnapshot = await getDocs(collection(db, 'drivers'));
        if (!driverSnapshot.empty) {
          this.data.drivers = driverSnapshot.docs.map(d => d.data() as Driver);
        } else {
          console.log('Seeding drivers to Firestore...');
          for (const dr of initialDrivers) {
            await setDoc(doc(db, 'drivers', dr.id), dr);
          }
          this.data.drivers = initialDrivers;
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'drivers');
      }

      // 6. Orders
      try {
        const orderSnapshot = await getDocs(collection(db, 'orders'));
        this.data.orders = orderSnapshot.docs.map(d => d.data() as Order);
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'orders');
      }

      // 7. Settlements
      try {
        const settlementSnapshot = await getDocs(collection(db, 'settlements'));
        this.data.settlements = settlementSnapshot.docs.map(d => d.data() as Settlement);
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'settlements');
      }

      // 8. Audit Logs
      try {
        const logSnapshot = await getDocs(collection(db, 'auditLogs'));
        this.data.auditLogs = logSnapshot.docs.map(d => d.data() as AuditLog);
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'auditLogs');
      }

      // 9. Partner Registrations
      try {
        const registrationSnapshot = await getDocs(collection(db, 'partnerRegistrations'));
        this.data.partnerRegistrations = registrationSnapshot.docs.map(d => d.data() as PartnerRegistration);
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'partnerRegistrations');
      }

      // 10. Licenses
      try {
        const licenseSnapshot = await getDocs(collection(db, 'licenses'));
        if (!licenseSnapshot.empty) {
          this.data.licenses = licenseSnapshot.docs.map(d => d.data() as LicenseKey);
        } else {
          console.log('Seeding licenses to Firestore...');
          const initialLicensesList: LicenseKey[] = [
            { key: 'TUMPANG-PREM-FITRI-KUE', durationDays: 30, status: 'UNUSED', createdAt: new Date().toISOString() },
            { key: 'TUMPANG-PREM-DEMO-99', durationDays: 90, status: 'UNUSED', createdAt: new Date().toISOString() },
            { key: 'TUMPANG-PREM-BAKERY', durationDays: 365, status: 'UNUSED', createdAt: new Date().toISOString() }
          ];
          for (const lic of initialLicensesList) {
            await setDoc(doc(db, 'licenses', lic.key), lic);
          }
          this.data.licenses = initialLicensesList;
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'licenses');
      }

      console.log('Firebase Firestore state successfully integrated.');
      this.save(); // Sync to local file
    } catch (err) {
      console.error('Firestore init sync failed, using local database:', err);
    }
  }

  private load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(fileContent);
        if (!this.data.partnerRegistrations) {
          this.data.partnerRegistrations = [];
        }
        if (!this.data.licenses) {
          this.data.licenses = [
            { key: 'TUMPANG-PREM-FITRI-KUE', durationDays: 30, status: 'UNUSED', createdAt: new Date().toISOString() },
            { key: 'TUMPANG-PREM-DEMO-99', durationDays: 90, status: 'UNUSED', createdAt: new Date().toISOString() },
            { key: 'TUMPANG-PREM-BAKERY', durationDays: 365, status: 'UNUSED', createdAt: new Date().toISOString() }
          ];
        }
      } else {
        // Seed database
        this.data = {
          merchants: initialMerchants,
          categories: initialCategories,
          menuItems: initialMenuItems,
          orders: [],
          drivers: initialDrivers,
          settlements: [],
          auditLogs: [],
          systemConfig: initialConfig,
          partnerRegistrations: [],
          licenses: [
            { key: 'TUMPANG-PREM-FITRI-KUE', durationDays: 30, status: 'UNUSED', createdAt: new Date().toISOString() },
            { key: 'TUMPANG-PREM-DEMO-99', durationDays: 90, status: 'UNUSED', createdAt: new Date().toISOString() },
            { key: 'TUMPANG-PREM-BAKERY', durationDays: 365, status: 'UNUSED', createdAt: new Date().toISOString() }
          ]
        };
        this.save();
        this.log('SYSTEM', 'Database initialized and seeded.');
      }
    } catch (e) {
      console.error('Error loading database, resetting...', e);
      this.data = {
        merchants: initialMerchants,
        categories: initialCategories,
        menuItems: initialMenuItems,
        orders: [],
        drivers: initialDrivers,
        settlements: [],
        auditLogs: [],
        systemConfig: initialConfig,
        partnerRegistrations: [],
        licenses: [
          { key: 'TUMPANG-PREM-FITRI-KUE', durationDays: 30, status: 'UNUSED', createdAt: new Date().toISOString() },
          { key: 'TUMPANG-PREM-DEMO-99', durationDays: 90, status: 'UNUSED', createdAt: new Date().toISOString() },
          { key: 'TUMPANG-PREM-BAKERY', durationDays: 365, status: 'UNUSED', createdAt: new Date().toISOString() }
        ]
      };
      this.save();
    }
  }

  private save() {
    try {
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error saving database:', e);
    }
  }

  // Audit Logs
  public log(userId: string, details: string, role: 'ADMIN' | 'MERCHANT' | 'DRIVER' | 'SYSTEM' | 'CUSTOMER' = 'SYSTEM') {
    const log: AuditLog = {
      id: 'log_' + Math.random().toString(36).substr(2, 9),
      action: details.split(' ')[0] || 'ACTION',
      userId,
      role,
      details,
      createdAt: new Date().toISOString()
    };
    this.data.auditLogs.unshift(log);
    // Keep max 200 logs
    if (this.data.auditLogs.length > 200) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 200);
    }
    this.save();

    if (db) {
      setDoc(doc(db, 'auditLogs', log.id), log).catch(e => {
        console.error('Firestore write failure (auditLogs):', e);
      });
    }

    return log;
  }

  public getLogs(): AuditLog[] {
    return this.data.auditLogs;
  }

  // System Config
  public getConfig(): SystemConfig {
    return this.data.systemConfig;
  }

  public updateConfig(userId: string, newConfig: Partial<SystemConfig>): SystemConfig {
    this.data.systemConfig = { ...this.data.systemConfig, ...newConfig };
    this.save();
    this.log(userId, `Updated system configuration: ${JSON.stringify(newConfig)}`, 'ADMIN');

    if (db) {
      setDoc(doc(db, 'systemConfig', 'config_1'), this.data.systemConfig).catch(e => {
        console.error('Firestore write failure (systemConfig):', e);
      });
    }

    return this.data.systemConfig;
  }

  // Merchants
  public getMerchants(): Merchant[] {
    return this.data.merchants;
  }

  public getMerchantById(id: string): Merchant | undefined {
    return this.data.merchants.find(m => m.id === id);
  }

  public createMerchant(userId: string, merchant: Omit<Merchant, 'id' | 'createdAt' | 'updatedAt' | 'rating'>): Merchant {
    const newMerchant: Merchant = {
      ...merchant,
      id: 'm_' + Math.random().toString(36).substr(2, 9),
      rating: 5.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.data.merchants.push(newMerchant);
    this.save();
    this.log(userId, `Created merchant ${newMerchant.name}`, 'ADMIN');

    if (db) {
      setDoc(doc(db, 'merchants', newMerchant.id), newMerchant).catch(e => {
        console.error('Firestore write failure (merchants):', e);
      });
    }

    return newMerchant;
  }

  public updateMerchant(userId: string, id: string, updates: Partial<Merchant>, role: 'ADMIN' | 'MERCHANT' = 'MERCHANT'): Merchant {
    const index = this.data.merchants.findIndex(m => m.id === id);
    if (index === -1) throw new Error('Merchant not found');
    
    this.data.merchants[index] = {
      ...this.data.merchants[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save();
    this.log(userId, `Updated merchant ${this.data.merchants[index].name} fields: ${Object.keys(updates).join(', ')}`, role);

    if (db) {
      setDoc(doc(db, 'merchants', id), this.data.merchants[index]).catch(e => {
        console.error('Firestore write failure (merchants update):', e);
      });
    }

    return this.data.merchants[index];
  }

  public deleteMerchant(userId: string, id: string): boolean {
    const index = this.data.merchants.findIndex(m => m.id === id);
    if (index === -1) return false;
    const name = this.data.merchants[index].name;
    this.data.merchants.splice(index, 1);
    
    // clean menu items and categories locally and in Firestore
    const catsToClean = this.data.categories.filter(cat => cat.merchantId === id);
    const itemsToClean = this.data.menuItems.filter(item => item.merchantId === id);

    this.data.menuItems = this.data.menuItems.filter(item => item.merchantId !== id);
    this.data.categories = this.data.categories.filter(cat => cat.merchantId !== id);
    
    this.save();
    this.log(userId, `Deleted merchant ${name}`, 'ADMIN');

    if (db) {
      deleteDoc(doc(db, 'merchants', id)).catch(e => console.error(e));
      for (const cat of catsToClean) {
        deleteDoc(doc(db, 'categories', cat.id)).catch(e => console.error(e));
      }
      for (const item of itemsToClean) {
        deleteDoc(doc(db, 'menuItems', item.id)).catch(e => console.error(e));
      }
    }

    return true;
  }

  // Categories
  public getCategories(merchantId: string): Category[] {
    return this.data.categories
      .filter(c => c.merchantId === merchantId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  public createCategory(merchantId: string, name: string): Category {
    const existing = this.getCategories(merchantId);
    const orderIndex = existing.length > 0 ? Math.max(...existing.map(e => e.orderIndex)) + 1 : 1;
    const newCat: Category = {
      id: 'cat_' + Math.random().toString(36).substr(2, 9),
      merchantId,
      name,
      orderIndex
    };
    this.data.categories.push(newCat);
    this.save();
    this.log(merchantId, `Created category ${name}`, 'MERCHANT');

    if (db) {
      setDoc(doc(db, 'categories', newCat.id), newCat).catch(e => {
        console.error('Firestore write failure (categories):', e);
      });
    }

    return newCat;
  }

  public updateCategory(merchantId: string, id: string, name: string): Category {
    const cat = this.data.categories.find(c => c.id === id && c.merchantId === merchantId);
    if (!cat) throw new Error('Category not found');
    cat.name = name;
    this.save();

    if (db) {
      setDoc(doc(db, 'categories', id), cat).catch(e => {
        console.error('Firestore write failure (categories update):', e);
      });
    }

    return cat;
  }

  public deleteCategory(merchantId: string, id: string): boolean {
    const index = this.data.categories.findIndex(c => c.id === id && c.merchantId === merchantId);
    if (index === -1) return false;
    this.data.categories.splice(index, 1);
    
    const itemsToClean = this.data.menuItems.filter(item => item.categoryId === id);
    this.data.menuItems = this.data.menuItems.filter(item => item.categoryId !== id);
    this.save();

    if (db) {
      deleteDoc(doc(db, 'categories', id)).catch(e => console.error(e));
      for (const item of itemsToClean) {
        deleteDoc(doc(db, 'menuItems', item.id)).catch(e => console.error(e));
      }
    }

    return true;
  }

  // Menu Items
  public getMenuItemsByMerchant(merchantId: string): MenuItem[] {
    return this.data.menuItems.filter(item => item.merchantId === merchantId);
  }

  public createMenuItem(merchantId: string, item: Omit<MenuItem, 'id' | 'merchantId' | 'createdAt' | 'updatedAt'>): MenuItem {
    const newItem: MenuItem = {
      ...item,
      id: 'item_' + Math.random().toString(36).substr(2, 9),
      merchantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.data.menuItems.push(newItem);
    this.save();
    this.log(merchantId, `Created menu item ${newItem.name}`, 'MERCHANT');

    if (db) {
      setDoc(doc(db, 'menuItems', newItem.id), newItem).catch(e => {
        console.error('Firestore write failure (menuItems):', e);
      });
    }

    return newItem;
  }

  public updateMenuItem(merchantId: string, id: string, updates: Partial<MenuItem>): MenuItem {
    const index = this.data.menuItems.findIndex(item => item.id === id && item.merchantId === merchantId);
    if (index === -1) throw new Error('Menu item not found');
    
    this.data.menuItems[index] = {
      ...this.data.menuItems[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save();
    this.log(merchantId, `Updated menu item ${this.data.menuItems[index].name}`, 'MERCHANT');

    if (db) {
      setDoc(doc(db, 'menuItems', id), this.data.menuItems[index]).catch(e => {
        console.error('Firestore write failure (menuItems update):', e);
      });
    }

    return this.data.menuItems[index];
  }

  public deleteMenuItem(merchantId: string, id: string): boolean {
    const index = this.data.menuItems.findIndex(item => item.id === id && item.merchantId === merchantId);
    if (index === -1) return false;
    const name = this.data.menuItems[index].name;
    this.data.menuItems.splice(index, 1);
    this.save();
    this.log(merchantId, `Deleted menu item ${name}`, 'MERCHANT');

    if (db) {
      deleteDoc(doc(db, 'menuItems', id)).catch(e => {
        console.error('Firestore delete failure (menuItems):', e);
      });
    }

    return true;
  }

  // Drivers
  public getDrivers(): Driver[] {
    return this.data.drivers;
  }

  public getDriverById(id: string): Driver | undefined {
    return this.data.drivers.find(d => d.id === id);
  }

  public createDriver(userId: string, driver: Omit<Driver, 'id' | 'createdAt' | 'updatedAt'>): Driver {
    const newDriver: Driver = {
      ...driver,
      id: 'd_' + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.data.drivers.push(newDriver);
    this.save();
    this.log(userId, `Created driver ${newDriver.name}`, 'ADMIN');

    if (db) {
      setDoc(doc(db, 'drivers', newDriver.id), newDriver).catch(e => {
        console.error('Firestore write failure (drivers):', e);
      });
    }

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
    this.log(userId, `Updated driver ${this.data.drivers[index].name} online status to ${this.data.drivers[index].online}`, role);

    if (db) {
      setDoc(doc(db, 'drivers', id), this.data.drivers[index]).catch(e => {
        console.error('Firestore write failure (drivers update):', e);
      });
    }

    return this.data.drivers[index];
  }

  public deleteDriver(userId: string, id: string): boolean {
    const index = this.data.drivers.findIndex(d => d.id === id);
    if (index === -1) return false;
    const name = this.data.drivers[index].name;
    this.data.drivers.splice(index, 1);
    this.save();
    this.log(userId, `Deleted driver ${name}`, 'ADMIN');

    if (db) {
      deleteDoc(doc(db, 'drivers', id)).catch(e => {
        console.error('Firestore delete failure (drivers):', e);
      });
    }

    return true;
  }

  // Orders
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

  private generateUniqueCode(): number {
    const activeCodes = this.data.orders
      .filter(o => o.status === OrderStatus.WAITING_PAYMENT || o.status === OrderStatus.WAITING_PAYMENT_VERIFICATION)
      .map(o => o.uniqueCode);
    
    const maxAttempts = 100;
    for (let i = 0; i < maxAttempts; i++) {
      const code = Math.floor(Math.random() * 99) + 1;
      if (!activeCodes.includes(code)) {
        return code;
      }
    }
    return Math.floor(Math.random() * 99) + 1;
  }

  public createOrder(orderData: {
    customerName: string;
    customerPhone: string;
    deliveryAddress: string;
    deliveryDetails: string;
    landmark: string;
    latitude: number;
    longitude: number;
    items: OrderItem[];
    merchantId: string;
    subtotal: number;
    deliveryFee: number;
    serviceFee: number;
    preOrderDate?: string;
  }): Order {
    const merchant = this.getMerchantById(orderData.merchantId);
    if (!merchant) throw new Error('Merchant not found');
    if (!merchant.active) throw new Error('Merchant is currently closed');

    // Pre-order validation
    const isPreOrder = merchant.preOrderOnly || !!orderData.preOrderDate;
    if (isPreOrder) {
      const totalQty = orderData.items.reduce((sum, item) => sum + item.quantity, 0);
      const minQty = Number(merchant.preOrderMinAmount || 0);
      if (totalQty < minQty) {
        throw new Error(`Minimal pembelian untuk pesanan Pre-Order ini adalah ${minQty} porsi/item.`);
      }
      if (!orderData.preOrderDate) {
        throw new Error('Tanggal pengiriman/pre-order wajib ditentukan untuk pesanan Pre-Order');
      }
    }

    const serviceFee = calculateTieredServiceFee(orderData.subtotal);
    const uniqueCode = this.generateUniqueCode();
    const total = orderData.subtotal + orderData.deliveryFee + serviceFee + uniqueCode;

    const newOrder: Order = {
      ...orderData,
      serviceFee,
      id: 'ord_' + Math.random().toString(36).substr(2, 9),
      uniqueCode,
      total,
      status: OrderStatus.WAITING_PAYMENT,
      merchantName: merchant.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paymentExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    };

    this.data.orders.unshift(newOrder);
    this.save();
    this.log('CUSTOMER', `Created new order ${newOrder.id} with total Rp ${total.toLocaleString()} (Unique Code: ${uniqueCode})`, 'SYSTEM');

    if (db) {
      setDoc(doc(db, 'orders', newOrder.id), newOrder).catch(e => {
        console.error('Firestore write failure (orders):', e);
      });
    }

    return newOrder;
  }

  public updateOrder(userId: string, id: string, updates: Partial<Order>, role: 'ADMIN' | 'MERCHANT' | 'DRIVER' | 'SYSTEM' | 'CUSTOMER'): Order {
    const index = this.data.orders.findIndex(o => o.id === id);
    if (index === -1) throw new Error('Order not found');
    
    const prevStatus = this.data.orders[index].status;
    const updated = {
      ...this.data.orders[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.data.orders[index] = updated;
    this.save();

    if (updates.status && updates.status !== prevStatus) {
      this.log(userId, `Updated order ${id} status from ${prevStatus} to ${updates.status}`, role as any);
      
      if (updates.status === OrderStatus.PAYMENT_VERIFIED && this.data.systemConfig.assignmentMode === AssignmentMode.AUTOMATIC) {
        this.autoAssignDriver(id);
      }
    } else {
      this.log(userId, `Updated order ${id} details`, role as any);
    }

    if (db) {
      setDoc(doc(db, 'orders', id), this.data.orders[index]).catch(e => {
        console.error('Firestore write failure (orders update):', e);
      });
    }

    return updated;
  }

  public autoAssignDriver(orderId: string): void {
    const order = this.getOrderById(orderId);
    if (!order) return;
    
    const availableDrivers = this.data.drivers.filter(d => d.online && d.active);
    if (availableDrivers.length === 0) {
      this.log('SYSTEM', `No active online drivers available for auto-assignment of order ${orderId}`, 'SYSTEM');
      return;
    }

    const driverTasksCount = availableDrivers.map(d => {
      const activeTasks = this.data.orders.filter(o => 
        o.driverId === d.id && 
        [OrderStatus.PAYMENT_VERIFIED, OrderStatus.COOKING, OrderStatus.READY_FOR_PICKUP, OrderStatus.ORDER_PICKED_UP].includes(o.status)
      ).length;
      return { driver: d, count: activeTasks };
    });

    driverTasksCount.sort((a, b) => a.count - b.count);
    const selectedDriver = driverTasksCount[0].driver;

    this.updateOrder('SYSTEM', orderId, {
      driverId: selectedDriver.id,
      driverName: selectedDriver.name
    }, 'SYSTEM');

    this.log('SYSTEM', `Auto-assigned driver ${selectedDriver.name} to order ${orderId}`, 'SYSTEM');
  }

  // Settlements
  public getSettlements(): Settlement[] {
    return this.data.settlements;
  }

  public getSettlementsByMerchant(merchantId: string): Settlement[] {
    return this.data.settlements.filter(s => s.merchantId === merchantId);
  }

  public createSettlement(userId: string, settlement: Omit<Settlement, 'id' | 'createdAt'>): Settlement {
    const newSettlement: Settlement = {
      ...settlement,
      id: 'set_' + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString()
    };
    this.data.settlements.unshift(newSettlement);
    this.save();
    this.log(userId, `Created settlement of Rp ${settlement.amountToPay.toLocaleString()} for ${settlement.merchantName}`, 'ADMIN');

    if (db) {
      setDoc(doc(db, 'settlements', newSettlement.id), newSettlement).catch(e => {
        console.error('Firestore write failure (settlements):', e);
      });
    }

    return newSettlement;
  }

  public confirmSettlement(userId: string, id: string): Settlement {
    const index = this.data.settlements.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Settlement not found');
    
    this.data.settlements[index] = {
      ...this.data.settlements[index],
      status: SettlementStatus.SETTLEMENT_COMPLETED,
      paidAt: new Date().toISOString()
    };
    this.save();
    this.log(userId, `Confirmed settlement payment of Rp ${this.data.settlements[index].amountToPay.toLocaleString()} to ${this.data.settlements[index].merchantName}`, 'ADMIN');

    if (db) {
      setDoc(doc(db, 'settlements', id), this.data.settlements[index]).catch(e => {
        console.error('Firestore write failure (settlements update):', e);
      });
    }

    return this.data.settlements[index];
  }

  public generateHPlusOneSettlements(userId: string): Settlement[] {
    const unsettledOrders = this.data.orders.filter(o => o.status === OrderStatus.COMPLETED);
    if (unsettledOrders.length === 0) {
      return [];
    }

    const targetOrders = this.data.orders.filter(o => o.status === OrderStatus.COMPLETED && !(o as any).isSettled);
    if (targetOrders.length === 0) {
      return [];
    }

    const grouped = new Map<string, Order[]>();
    for (const o of targetOrders) {
      const list = grouped.get(o.merchantId) || [];
      list.push(o);
      grouped.set(o.merchantId, list);
    }

    const newSettlements: Settlement[] = [];
    const commissionPercent = this.data.systemConfig.commissionPercent;

    for (const [merchantId, orders] of grouped.entries()) {
      const merchant = this.getMerchantById(merchantId);
      if (!merchant) continue;

      const orderCount = orders.length;
      const totalSales = orders.reduce((sum, o) => sum + o.subtotal, 0);
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
        bankHolder: merchant.bankHolder
      });

      for (const o of orders) {
        (o as any).isSettled = true;
        if (db) {
          setDoc(doc(db, 'orders', o.id), o).catch(e => {
            console.error('Firestore write failure (order settlement state):', e);
          });
        }
      }
      
      newSettlements.push(settlement);
    }

    this.save();
    return newSettlements;
  }

  // Partner Registrations
  public getPartnerRegistrations(): PartnerRegistration[] {
    return this.data.partnerRegistrations || [];
  }

  public createPartnerRegistration(reg: Omit<PartnerRegistration, 'id' | 'status' | 'createdAt'>): PartnerRegistration {
    const newReg: PartnerRegistration = {
      ...reg,
      id: 'reg_' + Math.random().toString(36).substr(2, 9),
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };
    if (!this.data.partnerRegistrations) {
      this.data.partnerRegistrations = [];
    }
    this.data.partnerRegistrations.push(newReg);
    this.save();
    this.log('CUSTOMER', `Submitted partner registration for ${newReg.name} (${newReg.type})`, 'CUSTOMER');

    if (db) {
      setDoc(doc(db, 'partnerRegistrations', newReg.id), newReg).catch(e => {
        console.error('Firestore write failure (partnerRegistrations):', e);
      });
    }
    return newReg;
  }

  public approvePartnerRegistration(userId: string, id: string): { success: boolean; error?: string; registration?: PartnerRegistration } {
    if (!this.data.partnerRegistrations) {
      this.data.partnerRegistrations = [];
    }
    const reg = this.data.partnerRegistrations.find(r => r.id === id);
    if (!reg) {
      return { success: false, error: 'Registration not found' };
    }
    if (reg.status !== 'PENDING') {
      return { success: false, error: 'Registration already processed' };
    }

    reg.status = 'APPROVED';

    if (reg.type === 'MERCHANT') {
      // Auto-generate password for merchant
      const generatedPassword = 'TF-' + Math.floor(1000 + Math.random() * 9000);
      reg.password = generatedPassword;

      // Create new merchant (fully active and activated)
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
        active: true, // Approved & live instantly
        cookTimeEstimate: '15-30 min',
        image: reg.businessPhoto || 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
        description: 'Toko baru bergabung di Tumpang Food!',
        category: reg.category || 'Nasi & Lauk',
        email: reg.email,
        isActivated: true, // Activated instantly
        password: generatedPassword,
        businessPhoto: reg.businessPhoto,
        idPhoto: reg.idPhoto,
        contractPhoto: reg.contractPhoto
      });

      reg.storeId = newMerchant.id;

      // Create a default menu category
      const categoryId = 'cat_' + Math.random().toString(36).substr(2, 9);
      const defaultCategory: Category = {
        id: categoryId,
        merchantId: newMerchant.id,
        name: 'Menu Utama',
        orderIndex: 0
      };
      this.data.categories.push(defaultCategory);
      if (db) {
        setDoc(doc(db, 'categories', defaultCategory.id), defaultCategory).catch(e => {
          console.error('Firestore write failure (categories default):', e);
        });
      }

      // Create a default food item
      const defaultItem: MenuItem = {
        id: 'item_' + Math.random().toString(36).substr(2, 9),
        merchantId: newMerchant.id,
        categoryId: categoryId,
        name: 'Nasi Goreng Spesial (Contoh)',
        description: 'Nasi goreng lezat dengan bumbu khas, telur, dan kerupuk.',
        price: 15000,
        available: true,
        image: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.data.menuItems.push(defaultItem);
      if (db) {
        setDoc(doc(db, 'menuItems', defaultItem.id), defaultItem).catch(e => {
          console.error('Firestore write failure (menuItems default):', e);
        });
      }

    } else if (reg.type === 'DRIVER') {
      // Create new driver
      const newDriver: Driver = {
        id: 'd_' + Math.random().toString(36).substr(2, 9),
        name: reg.name,
        phone: reg.phone,
        email: reg.email,
        active: true,
        online: false,
        latitude: -7.9482,
        longitude: 112.7612,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.data.drivers.push(newDriver);
      if (db) {
        setDoc(doc(db, 'drivers', newDriver.id), newDriver).catch(e => {
          console.error('Firestore write failure (drivers):', e);
        });
      }
    }

    this.save();
    this.log(userId, `Approved partner registration ${reg.id} (${reg.name})`, 'ADMIN');

    if (db) {
      setDoc(doc(db, 'partnerRegistrations', reg.id), reg).catch(e => {
        console.error('Firestore write failure (partnerRegistrations approve):', e);
      });
    }

    return { success: true, registration: reg };
  }

  public rejectPartnerRegistration(userId: string, id: string): boolean {
    if (!this.data.partnerRegistrations) {
      this.data.partnerRegistrations = [];
    }
    const reg = this.data.partnerRegistrations.find(r => r.id === id);
    if (!reg) return false;

    reg.status = 'REJECTED';
    this.save();
    this.log(userId, `Rejected partner registration ${reg.id} (${reg.name})`, 'ADMIN');

    if (db) {
      setDoc(doc(db, 'partnerRegistrations', reg.id), reg).catch(e => {
        console.error('Firestore write failure (partnerRegistrations reject):', e);
      });
    }
    return true;
  }

  public activateMerchant(email: string, passwordString: string): { success: boolean; merchant?: Merchant; error?: string } {
    const formattedEmail = email.trim().toLowerCase();
    const merchant = this.data.merchants.find(m => m.email?.trim().toLowerCase() === formattedEmail);
    if (!merchant) {
      return { success: false, error: 'Merchant dengan email tersebut tidak ditemukan.' };
    }
    
    merchant.active = true;
    merchant.isActivated = true;
    merchant.password = passwordString;
    merchant.updatedAt = new Date().toISOString();

    // Also update associated partner registration status to 'ACTIVATED' if found
    if (this.data.partnerRegistrations) {
      const reg = this.data.partnerRegistrations.find(r => r.email.trim().toLowerCase() === formattedEmail && r.type === 'MERCHANT');
      if (reg) {
        reg.status = 'ACTIVATED';
        if (db) {
          setDoc(doc(db, 'partnerRegistrations', reg.id), reg).catch(e => {
            console.error('Firestore write failure (partnerRegistrations activated):', e);
          });
        }
      }
    }

    this.save();
    this.log(merchant.id, `Activated merchant store ${merchant.name}`, 'MERCHANT');

    if (db) {
      setDoc(doc(db, 'merchants', merchant.id), merchant).catch(e => {
        console.error('Firestore write failure (merchants activation):', e);
      });
    }

    return { success: true, merchant };
  }

  // --- LICENSE MANAGEMENT ---
  public getLicenses(): LicenseKey[] {
    if (!this.data.licenses) {
      this.data.licenses = [];
    }
    return this.data.licenses;
  }

  public createLicense(userId: string, key: string, durationDays: number): LicenseKey {
    if (!this.data.licenses) {
      this.data.licenses = [];
    }
    const cleanKey = key.trim().toUpperCase();
    if (this.data.licenses.some(l => l.key === cleanKey)) {
      throw new Error('Kode lisensi sudah terdaftar');
    }
    const newLicense: LicenseKey = {
      key: cleanKey,
      durationDays,
      status: 'UNUSED',
      createdAt: new Date().toISOString()
    };
    this.data.licenses.unshift(newLicense);
    this.save();
    this.log(userId, `Created license key ${cleanKey} for ${durationDays} days`, 'ADMIN');

    if (db) {
      setDoc(doc(db, 'licenses', cleanKey), newLicense).catch(e => {
        console.error('Firestore write failure (licenses create):', e);
      });
    }

    return newLicense;
  }

  public redeemLicense(merchantId: string, key: string): Merchant {
    if (!this.data.licenses) {
      this.data.licenses = [];
    }
    const cleanKey = key.trim().toUpperCase();
    const licenseIndex = this.data.licenses.findIndex(l => l.key === cleanKey);
    if (licenseIndex === -1) {
      throw new Error('Kode lisensi tidak valid / tidak ditemukan.');
    }
    const license = this.data.licenses[licenseIndex];
    if (license.status === 'USED') {
      throw new Error('Kode lisensi ini sudah digunakan.');
    }

    const merchant = this.getMerchantById(merchantId);
    if (!merchant) {
      throw new Error('Merchant tidak ditemukan.');
    }

    // Mark license as used
    license.status = 'USED';
    license.usedByMerchantId = merchantId;
    license.usedByMerchantName = merchant.name;
    license.usedAt = new Date().toISOString();

    // Calculate premium expiration date
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + license.durationDays);

    // Update merchant to premium
    merchant.isPremium = true;
    merchant.licenseKey = cleanKey;
    merchant.licenseExpiresAt = expirationDate.toISOString();
    
    // Automatically set to Pre-Order mode by default since they bought/activated a pre-order license
    merchant.preOrderOnly = true;
    merchant.allowInstantAndPreOrder = false;
    if (merchant.preOrderMinAmount === undefined || merchant.preOrderMinAmount === 0) {
      merchant.preOrderMinAmount = 1; // Default starting minimum order
    }
    if (merchant.preOrderLeadDays === undefined || merchant.preOrderLeadDays === 0) {
      merchant.preOrderLeadDays = 1; // Default prep time of 1 day
    }

    merchant.updatedAt = new Date().toISOString();

    this.save();
    this.log(merchantId, `Redeemed license key ${cleanKey}. Store is now PREMIUM until ${expirationDate.toLocaleDateString()}`, 'MERCHANT');

    if (db) {
      setDoc(doc(db, 'licenses', cleanKey), license).catch(e => {
        console.error('Firestore write failure (license redeem):', e);
      });
      setDoc(doc(db, 'merchants', merchantId), merchant).catch(e => {
        console.error('Firestore write failure (merchant premium upgrade):', e);
      });
    }

    return merchant;
  }
}

export const dbInstance = new Database();
