/**
 * Comprehensive Backend and Database Test Script for Tumpang Shop
 * Uses native Node http server and fetch (no external testing libraries required).
 * 
 * Validates:
 * 1. Modul ShopDatabase terisolasi dari FoodDatabase
 * 2. API /api/shop/* (Kategori, Produk, Config, Order)
 * 3. Validasi harga & stok di backend (termasuk pengurangan stok dan pemulihan saat batal)
 * 4. Pemisahan PaymentStatus dan OrderStatus
 * 5. Isolasi autentikasi Shop Admin vs Food Admin
 * 6. Integritas layanan Tumpang Food
 */

import http from 'http';
import { app } from '../src/server/app';
import { foodDb } from '../src/server/db';
import { shopDb } from '../src/server/shopDb';
import { shopConfig, foodConfig } from '../src/server/config';
import { createAuthToken } from '../src/server/auth';
import { ShopOrderStatus, ShopPaymentStatus } from '../src/types/shop';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 MEMULAI PENGUJIAN BACKEND & DATABASE TUMPANG SHOP');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${detail ? `-> ${detail}` : ''}`);
      failed++;
    }
  }

  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`📡 Test server running on ${baseUrl}\n`);

  try {
    // 1. Inisialisasi Database
    console.log('--- 1. Uji Inisialisasi Database & Isolasi Data ---');
    await Promise.all([foodDb.ensureInitialized(), shopDb.ensureInitialized()]);

    const initialFoodMerchantsCount = foodDb.getMerchants().length;
    const initialShopProductsCount = shopDb.getProducts().length;

    assert(initialFoodMerchantsCount > 0, 'FoodDatabase memiliki merchant food yang utuh', `Count: ${initialFoodMerchantsCount}`);
    assert(initialShopProductsCount > 0, 'ShopDatabase memiliki produk shop mandiri', `Count: ${initialShopProductsCount}`);

    // Verifikasi konfigurasi shop mandiri
    const shopCfg = shopDb.getConfig();
    assert(Boolean(shopCfg && shopCfg.storeName), 'Shop Config terbaca mandiri', shopCfg.storeName);

    // 2. Uji API Publik Shop
    console.log('\n--- 2. Uji Endpoint Publik /api/shop/* ---');
    const resConfig = await fetch(`${baseUrl}/api/shop/config`);
    const configData = await resConfig.json();
    assert(resConfig.status === 200 && configData.storeName === shopCfg.storeName, 'GET /api/shop/config mengembalikan data konfigurasi');

    const resCats = await fetch(`${baseUrl}/api/shop/categories`);
    const catsData = await resCats.json();
    assert(resCats.status === 200 && Array.isArray(catsData) && catsData.length >= 4, 'GET /api/shop/categories mengembalikan kategori aktif');

    const resProds = await fetch(`${baseUrl}/api/shop/products`);
    const prodsData = await resProds.json();
    assert(resProds.status === 200 && Array.isArray(prodsData) && prodsData.length >= 6, 'GET /api/shop/products mengembalikan produk aktif');

    const sampleProduct = prodsData[0];
    const resProdDetail = await fetch(`${baseUrl}/api/shop/products/${sampleProduct.id}`);
    const prodDetailData = await resProdDetail.json();
    assert(resProdDetail.status === 200 && prodDetailData.sku === sampleProduct.sku, `GET /api/shop/products/:id mengembalikan detail produk (SKU: ${sampleProduct.sku})`);

    // 3. Uji Autentikasi & Otorisasi Shop Admin (Isolasi Ketat)
    console.log('\n--- 3. Uji Keamanan & Isolasi Autentikasi Shop Admin ---');
    
    // a. Akses tanpa token -> harus 401
    const resNoAuth = await fetch(`${baseUrl}/api/shop/admin/products`);
    assert(resNoAuth.status === 401, 'Endpoint terlindungi /api/shop/admin/products menolak request tanpa token (401)');

    // b. Login dengan kredensial Food Admin ke portal Shop -> harus 401
    const resFoodAdminOnShop = await fetch(`${baseUrl}/api/shop/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: foodConfig.adminEmail,
        password: foodConfig.adminPassword
      })
    });
    assert(resFoodAdminOnShop.status === 401, 'Portal Shop menolak kredensial Food Admin');

    // c. Token Food Admin digunakan untuk mengakses Shop Admin -> harus 403
    const foodAdminToken = createAuthToken({
      userId: 'admin',
      role: 'ADMIN',
      email: foodConfig.adminEmail
    });
    const resFoodTokenOnShop = await fetch(`${baseUrl}/api/shop/admin/products`, {
      headers: { 'Authorization': `Bearer ${foodAdminToken}` }
    });
    assert(resFoodTokenOnShop.status === 403, 'Endpoint Shop Admin menolak token Food Admin (403)');

    // d. Login dengan kredensial sah Shop Admin -> harus 200 & mendapat token SHOP_ADMIN
    const resShopLogin = await fetch(`${baseUrl}/api/shop/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: shopConfig.adminEmail,
        password: shopConfig.adminPassword
      })
    });
    const loginData = await resShopLogin.json();
    assert(resShopLogin.status === 200 && loginData.role === 'SHOP_ADMIN' && Boolean(loginData.token), 'Login Shop Admin berhasil dengan token JWT sah');
    const shopToken = loginData.token;

    // e. Menggunakan token Shop Admin sah ke endpoint terproteksi -> harus 200
    const resShopAuthAccess = await fetch(`${baseUrl}/api/shop/admin/products`, {
      headers: { 'Authorization': `Bearer ${shopToken}` }
    });
    const shopAdminProds = await resShopAuthAccess.json();
    assert(resShopAuthAccess.status === 200 && Array.isArray(shopAdminProds), 'Token Shop Admin berhasil mengakses endpoint terproteksi Shop');

    // 4. Uji Validasi Harga & Stok di Backend
    console.log('\n--- 4. Uji Validasi Harga & Stok Backend ---');

    // a. Order dengan stok melebihi batas -> harus ditolak (400)
    const targetProd = prodsData.find((p: any) => p.stock > 0);
    const excessiveQty = targetProd.stock + 999;
    const resExcessiveOrder = await fetch(`${baseUrl}/api/shop/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Budi Tester',
        customerPhone: '081299990001',
        deliveryAddress: 'Jl. Raya Tumpang No. 10',
        items: [{ productId: targetProd.id, quantity: excessiveQty }]
      })
    });
    const excessiveData = await resExcessiveOrder.json();
    assert(resExcessiveOrder.status === 400 && excessiveData.error.includes('Stok'), 'Order dengan kuantitas melebihi stok ditolak oleh backend (400)');

    // b. Order dengan manipulasi harga dari client -> backend wajib menghitung harga riil
    const initialStock = targetProd.stock;
    const orderQty = 2;
    const resValidOrder = await fetch(`${baseUrl}/api/shop/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Siti Rahmawati',
        customerPhone: '081299990002',
        deliveryAddress: 'Dusun Jago, Kec. Tumpang',
        items: [{ 
          productId: targetProd.id, 
          quantity: orderQty,
          price: 100 // Upaya manipulasi harga palsu Rp 100
        }]
      })
    });

    assert(resValidOrder.status === 201, 'Order dengan stok valid berhasil dibuat (201)');
    const createdOrder = await resValidOrder.json();

    // Verifikasi harga dihitung dari DB, bukan dari payload client Rp 100
    assert(createdOrder.items[0].price === targetProd.price, `Backend mengabaikan harga manipulasi client (Rp ${createdOrder.items[0].price} vs DB Rp ${targetProd.price})`);
    
    // Verifikasi pengurangan stok secara riil
    const reloadedProd = shopDb.getProductById(targetProd.id);
    assert(reloadedProd?.stock === initialStock - orderQty, `Stok produk berkurang otomatis dari ${initialStock} menjadi ${reloadedProd?.stock}`);

    // 5. Uji Pemisahan PaymentStatus dan OrderStatus
    console.log('\n--- 5. Uji Pemisahan PaymentStatus dan OrderStatus ---');
    assert(createdOrder.paymentStatus === ShopPaymentStatus.UNPAID, 'Status pembayaran awal adalah UNPAID');
    assert(createdOrder.orderStatus === ShopOrderStatus.NEW, 'Status pesanan awal adalah NEW');

    // a. Customer unggah bukti transfer
    const resUploadProof = await fetch(`${baseUrl}/api/shop/orders/${createdOrder.id}/payment-proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentProof: 'https://example.com/receipt-proof.jpg' })
    });
    const proofData = await resUploadProof.json();
    assert(resUploadProof.status === 200 && proofData.paymentStatus === ShopPaymentStatus.WAITING_VERIFICATION, 'Upload bukti bayar mengubah paymentStatus menjadi WAITING_VERIFICATION');

    // b. Admin Shop verifikasi pembayaran sah
    const resVerifyPay = await fetch(`${baseUrl}/api/shop/orders/${createdOrder.id}/verify-payment`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${shopToken}`
      },
      body: JSON.stringify({ approved: true })
    });
    const verifyData = await resVerifyPay.json();
    assert(resVerifyPay.status === 200 && verifyData.paymentStatus === ShopPaymentStatus.PAID && verifyData.orderStatus === ShopOrderStatus.PROCESSING, 'Verifikasi bayar sah mengubah paymentStatus -> PAID dan orderStatus -> PROCESSING');

    // c. Admin memperbarui alur fisik pesanan (PACKED -> SHIPPED -> COMPLETED)
    const resPacked = await fetch(`${baseUrl}/api/shop/orders/${createdOrder.id}/status`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${shopToken}`
      },
      body: JSON.stringify({ status: ShopOrderStatus.PACKED })
    });
    const packedData = await resPacked.json();
    assert(resPacked.status === 200 && packedData.orderStatus === ShopOrderStatus.PACKED, 'Update status pesanan ke PACKED');

    // 6. Uji Pemulihan Stok Saat Pesanan Dibatalkan
    console.log('\n--- 6. Uji Pemulihan Stok Saat Pembatalan ---');
    const stockBeforeCancel = shopDb.getProductById(targetProd.id)?.stock || 0;
    const resCancel = await fetch(`${baseUrl}/api/shop/orders/${createdOrder.id}/status`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${shopToken}`
      },
      body: JSON.stringify({ status: ShopOrderStatus.CANCELLED, reason: 'Pengujian pengembalian stok' })
    });
    const cancelData = await resCancel.json();
    assert(resCancel.status === 200 && cancelData.orderStatus === ShopOrderStatus.CANCELLED, 'Status pesanan berhasil diubah menjadi CANCELLED');

    const stockAfterCancel = shopDb.getProductById(targetProd.id)?.stock || 0;
    assert(stockAfterCancel === stockBeforeCancel + orderQty, `Stok produk pulih kembali (+${orderQty}) menjadi ${stockAfterCancel}`);

    // 7. Uji Integritas Tumpang Food (Tidak Ada Dampak Negatif)
    console.log('\n--- 7. Uji Integritas Tumpang Food ---');
    const finalFoodMerchantsCount = foodDb.getMerchants().length;
    assert(finalFoodMerchantsCount === initialFoodMerchantsCount, 'Jumlah merchant Tumpang Food tidak terpengaruh oleh aktivitas Shop');

    const resFoodHealth = await fetch(`${baseUrl}/api/health`);
    assert(resFoodHealth.status === 200, 'Health check Tumpang Food tetap berstatus 200 OK');

  } catch (err: any) {
    console.error('CRITICAL ERROR DURING TESTS:', err);
    failed++;
  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log(`📊 HASIL PENGUJIAN: ${passed} BERHASIL | ${failed} GAGAL`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
