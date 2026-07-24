import React, { useState, useEffect } from 'react';
import { 
  Merchant, MenuItem, Category, Order, OrderStatus, Settlement, SettlementStatus 
} from '../types.ts';
import { compressImage } from '../utils/imageCompressor.ts';
import { 
  Store, ClipboardList, Utensils, Award, TrendingUp, Calendar, Clock, DollarSign, 
  Settings, LogOut, Plus, Check, X, ShieldAlert, Edit, Trash2, CheckSquare, Layers
} from 'lucide-react';

interface MerchantViewProps {
  merchantId: string;
  onLogout: () => void;
}

export default function MerchantView({ merchantId, onLogout }: MerchantViewProps) {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  
  // Tab control: 'dashboard' | 'orders' | 'menu' | 'settlement' | 'profile'
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Loading & Action states
  const [loading, setLoading] = useState(true);
  const [cookEstimateInput, setCookEstimateInput] = useState<Record<string, number>>({});
  const [rejectModal, setRejectModal] = useState<{ orderId: string; visible: boolean; reason: string } | null>(null);

  // Menu editor states
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);

  // Profil Form
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileOwner, setProfileOwner] = useState('');
  const [profileBankName, setProfileBankName] = useState('');
  const [profileBankAccount, setProfileBankAccount] = useState('');
  const [profileBankHolder, setProfileBankHolder] = useState('');
  const [profileDesc, setProfileDesc] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [profileBanner, setProfileBanner] = useState('');
  const [profileOpenTime, setProfileOpenTime] = useState('08:00');
  const [profileCloseTime, setProfileCloseTime] = useState('21:00');
  const [profileCategory, setProfileCategory] = useState('Nasi & Lauk');
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const [isDraggingBanner, setIsDraggingBanner] = useState(false);

  // Pre-order & Licensing settings
  const [preOrderOnly, setPreOrderOnly] = useState(false);
  const [allowInstantAndPreOrder, setAllowInstantAndPreOrder] = useState(false);
  const [preOrderMinAmount, setPreOrderMinAmount] = useState<number>(0);
  const [preOrderLeadDays, setPreOrderLeadDays] = useState<number>(1);
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    fetchMerchantData();
  }, [merchantId]);

  const fetchMerchantData = async () => {
    setLoading(true);
    try {
      // 1. Get profile
      const profRes = await fetch(`/api/merchants/${merchantId}`);
      if (profRes.ok) {
        const mData: Merchant = await profRes.json();
        setMerchant(mData);
        setProfileName(mData.name);
        setProfilePhone(mData.phone);
        setProfileOwner(mData.ownerName);
        setProfileBankName(mData.bankName || '');
        setProfileBankAccount(mData.bankAccount || '');
        setProfileBankHolder(mData.bankHolder || '');
        setProfileDesc(mData.description || '');
        setProfileImage(mData.image || '');
        setProfileBanner(mData.bannerImage || '');
        setProfileOpenTime(mData.openTime || '08:00');
        setProfileCloseTime(mData.closeTime || '21:00');
        setProfileCategory(mData.category || 'Nasi & Lauk');
        
        // Populate pre-order settings
        setPreOrderOnly(mData.preOrderOnly || false);
        setAllowInstantAndPreOrder(mData.allowInstantAndPreOrder || false);
        setPreOrderMinAmount(mData.preOrderMinAmount || 0);
        setPreOrderLeadDays(mData.preOrderLeadDays || 1);
      }

      // 2. Get orders
      const ordRes = await fetch(`/api/merchants/${merchantId}/orders`);
      const ordData = await ordRes.json();
      setOrders(ordData);

      // 3. Get Menu
      const menuRes = await fetch(`/api/merchants/${merchantId}/menu`);
      const menuData = await menuRes.json();
      setMenuItems(menuData);

      // 4. Get categories
      const catRes = await fetch(`/api/merchants/${merchantId}/categories`);
      const catData = await catRes.json();
      setCategories(catData);

      // 5. Get settlements
      const setRes = await fetch(`/api/merchants/${merchantId}/settlements`);
      const setData = await setRes.json();
      setSettlements(setData);

    } catch (e) {
      console.error('Error fetching merchant data:', e);
    } finally {
      setLoading(false);
    }
  };

  // Toggle Buka/Tutup
  const toggleOpenStatus = async () => {
    if (!merchant) return;
    const newStatus = !merchant.active;
    try {
      const res = await fetch(`/api/merchants/${merchantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: newStatus, role: 'MERCHANT', userId: merchantId })
      });
      if (res.ok) {
        const updated = await res.json();
        setMerchant(updated);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Order Actions
  const acceptOrder = async (orderId: string) => {
    const cookTime = cookEstimateInput[orderId] || 15;
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: OrderStatus.COOKING, 
          cookingTimeMinutes: cookTime,
          role: 'MERCHANT',
          userId: merchantId
        })
      });
      if (res.ok) {
        fetchMerchantData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const rejectOrder = async (orderId: string, reason: string) => {
    if (!reason.trim()) {
      alert('Alasan penolakan wajib diisi');
      return;
    }
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: OrderStatus.CANCELLED, 
          cancelReason: reason,
          role: 'MERCHANT',
          userId: merchantId
        })
      });
      if (res.ok) {
        setRejectModal(null);
        fetchMerchantData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const setOrderReady = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: OrderStatus.READY_FOR_PICKUP,
          role: 'MERCHANT',
          userId: merchantId
        })
      });
      if (res.ok) {
        fetchMerchantData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Menu item management
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem?.name || !editingItem?.price || !editingItem?.categoryId) {
      alert('Mohon isi nama, harga, dan kategori menu');
      return;
    }

    const url = editingItem.id 
      ? `/api/merchants/${merchantId}/menu/${editingItem.id}` 
      : `/api/merchants/${merchantId}/menu`;
    
    const method = editingItem.id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editingItem,
          price: Number(editingItem.price),
          available: editingItem.available !== undefined ? editingItem.available : true,
          allowInstant: merchant.isPremium ? (editingItem.allowInstant !== false) : true
        })
      });
      if (res.ok) {
        setShowItemForm(false);
        setEditingItem(null);
        fetchMerchantData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteItem = async (id: string) => {
    if (confirm('Hapus menu makanan ini?')) {
      try {
        const res = await fetch(`/api/merchants/${merchantId}/menu/${id}`, {
          method: 'DELETE'
        });
        if (res.ok) fetchMerchantData();
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Category management
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory?.name) return;

    const url = editingCategory.id 
      ? `/api/merchants/${merchantId}/categories/${editingCategory.id}` 
      : `/api/merchants/${merchantId}/categories`;
    const method = editingCategory.id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingCategory)
      });
      if (res.ok) {
        setShowCategoryForm(false);
        setEditingCategory(null);
        fetchMerchantData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteCategory = async (id: string) => {
    if (confirm('Hapus kategori ini? Semua menu dalam kategori ini juga akan terhapus.')) {
      try {
        const res = await fetch(`/api/merchants/${merchantId}/categories/${id}`, {
          method: 'DELETE'
        });
        if (res.ok) fetchMerchantData();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleLogoUpload = async (file: File) => {
    try {
      const compressed = await compressImage(file, 400, 400, 0.6);
      setProfileImage(compressed);
    } catch (err) {
      console.error('Error compressing logo:', err);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBannerUpload = async (file: File) => {
    try {
      const compressed = await compressImage(file, 800, 400, 0.6);
      setProfileBanner(compressed);
    } catch (err) {
      console.error('Error compressing banner:', err);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileBanner(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const renderCommissionBreakdown = (subtotal: number) => {
    const commission = subtotal * 0.1;
    const netEarnings = subtotal * 0.9;
    return (
      <div className="bg-slate-50 rounded-xl p-3 border border-slate-150 flex flex-col gap-1 text-[11px] mt-2">
        <div className="flex justify-between text-slate-500 font-medium">
          <span>Harga Asli Makanan (Kotor):</span>
          <span>Rp {subtotal.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-red-500 font-medium">
          <span>Potongan Komisi (10%):</span>
          <span>-Rp {commission.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-emerald-700 font-extrabold border-t border-slate-200/60 pt-1.5 mt-1">
          <span>Pendapatan Toko (Bersih H+1):</span>
          <span>Rp {netEarnings.toLocaleString()}</span>
        </div>
      </div>
    );
  };

  // Update profile
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/merchants/${merchantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileName,
          phone: profilePhone,
          ownerName: profileOwner,
          bankName: profileBankName,
          bankAccount: profileBankAccount,
          bankHolder: profileBankHolder,
          description: profileDesc,
          image: profileImage,
          bannerImage: profileBanner,
          openTime: profileOpenTime,
          closeTime: profileCloseTime,
          category: profileCategory,
          preOrderOnly,
          allowInstantAndPreOrder,
          preOrderMinAmount: Number(preOrderMinAmount || 0),
          preOrderLeadDays: Number(preOrderLeadDays || 1),
          role: 'MERCHANT',
          userId: merchantId
        })
      });
      if (res.ok) {
        alert('Profil berhasil diperbarui!');
        fetchMerchantData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Redeem contract license
  const handleRedeemLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKeyInput.trim()) return;
    setRedeeming(true);
    try {
      const res = await fetch(`/api/merchants/${merchantId}/redeem-license`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: licenseKeyInput })
      });
      if (res.ok) {
        alert('Kontrak Lisensi Berhasil Diaktifkan! Selamat, Toko Anda sekarang berstatus PREMIUM.');
        setLicenseKeyInput('');
        fetchMerchantData();
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal mengaktifkan lisensi.');
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan koneksi.');
    } finally {
      setRedeeming(false);
    }
  };

  // Render Pre-Order Delivery Badge for Orders
  const renderOrderPreOrderInfo = (o: Order) => {
    if (!o.preOrderDate) return null;
    return (
      <div className="bg-amber-50 border border-amber-200/50 rounded-xl p-2.5 text-[11px] text-amber-900 font-medium flex items-center gap-2 shadow-sm mt-1">
        <Calendar className="w-4 h-4 text-amber-700 shrink-0" />
        <div>
          <span className="text-[10px] font-bold text-amber-800 uppercase block tracking-wider mb-0.5">Tanggal Pre-Order</span>
          <span className="font-extrabold text-amber-950">{new Date(o.preOrderDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>
    );
  };

  // Filter lists
  const newOrders = orders.filter(o => o.status === OrderStatus.PAYMENT_VERIFIED);
  const activeCookingOrders = orders.filter(o => o.status === OrderStatus.COOKING);
  const readyPickupOrders = orders.filter(o => o.status === OrderStatus.READY_FOR_PICKUP);
  const onDeliveryOrders = orders.filter(o => o.status === OrderStatus.ORDER_PICKED_UP);
  const completedOrdersToday = orders.filter(o => o.status === OrderStatus.COMPLETED);

  const getTodayEarnings = () => {
    // subtotal of all COMPLETED orders today
    return completedOrdersToday.reduce((sum, o) => sum + o.subtotal, 0);
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col justify-center items-center font-sans">
        <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 text-sm mt-3 font-semibold">Memuat Dasbor Merchant...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen pb-24 relative font-sans">
      {/* Header */}
      <header className="bg-white p-4 sticky top-0 z-50 rounded-b-3xl border-b-4 border-emerald-600 shadow-md shadow-emerald-900/10">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-emerald-700" />
            <div className="flex flex-col">
              <span className="font-display font-bold text-sm text-emerald-900 tracking-tight truncate max-w-[200px]">{merchant?.name}</span>
              <span className="text-[10px] text-emerald-700 font-bold tracking-wide uppercase">Merchant Portal</span>
            </div>
          </div>
          <button 
            onClick={toggleOpenStatus}
            className={`text-xs font-bold px-3 py-1.5 rounded-full shadow transition-all ${
              merchant?.active 
                ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            {merchant?.active ? 'BUKA 🟢' : 'TUTUP 🔴'}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="p-4 flex flex-col gap-5">
        
        {/* Reject Modal */}
        {rejectModal?.visible && (
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-slate-100">
              <h4 className="font-display font-bold text-base text-slate-800">Alasan Penolakan</h4>
              <textarea
                value={rejectModal.reason}
                onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
                placeholder="Misal: Bahan habis, menu tidak tersedia..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs mt-3 focus:outline-none focus:border-rose-500"
                rows={3}
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setRejectModal(null)}
                  className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200"
                >
                  Batal
                </button>
                <button
                  onClick={() => rejectOrder(rejectModal.orderId, rejectModal.reason)}
                  className="flex-1 py-2 text-xs font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 shadow-md"
                >
                  Tolak Pesanan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 1. DASHBOARD TAB */}
        {activeTab === 'dashboard' && merchant && (
          <div className="flex flex-col gap-5">
            {/* Store Banner */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-950 text-white p-5 rounded-2xl shadow-lg flex justify-between items-center">
              <div className="flex flex-col">
                <span className="text-[10px] text-rose-500 uppercase font-extrabold tracking-wider">Pemilik: {merchant.ownerName}</span>
                <h3 className="font-display font-bold text-lg mt-0.5">Halo, {merchant.ownerName}!</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">Kelola pesanan Anda hari ini dengan cepat dan teliti.</p>
              </div>
              <TrendingUp className="w-10 h-10 text-rose-500 opacity-30" />
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[9px] text-emerald-600 font-extrabold uppercase tracking-wider block">Pendapatan Bersih (H+1)</span>
                  <span className="font-display font-bold text-base text-emerald-700 block mt-1">Rp {(getTodayEarnings() * 0.9).toLocaleString()}</span>
                </div>
                <div className="mt-2 pt-1.5 border-t border-slate-100 text-[9px] text-slate-500 flex flex-col gap-0.5">
                  <div className="flex justify-between">
                    <span>Harga Asli:</span>
                    <span className="font-semibold text-slate-700">Rp {getTodayEarnings().toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-red-500">
                    <span>Komisi (10%):</span>
                    <span className="font-semibold">-Rp {(getTodayEarnings() * 0.1).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Status Resto</span>
                  <span className={`font-semibold text-sm mt-1 flex items-center gap-1 ${merchant.active ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {merchant.active ? 'Menerima Order' : 'Tutup Sementara'}
                  </span>
                </div>
                <div className="mt-2 pt-1.5 border-t border-slate-100 text-[9px] text-slate-400 flex flex-col gap-0.5">
                  <span>Buka: {merchant.openTime} - {merchant.closeTime}</span>
                  <span>Dari {completedOrdersToday.length} pesanan selesai</span>
                </div>
              </div>
            </div>

            {/* Orders summary logs */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
              <h4 className="font-display font-bold text-sm text-slate-800 border-b border-slate-100 pb-2 flex justify-between items-center">
                <span>Antrean Pesanan</span>
                <button onClick={() => setActiveTab('orders')} className="text-[11px] text-rose-600 font-bold hover:underline">Lihat Semua</button>
              </h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="text-xl font-extrabold text-slate-800">{newOrders.length}</span>
                  <p className="text-[10px] text-slate-500 font-medium mt-0.5">Order Baru</p>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="text-xl font-extrabold text-slate-800">{activeCookingOrders.length}</span>
                  <p className="text-[10px] text-slate-500 font-medium mt-0.5">Dimasak</p>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="text-xl font-extrabold text-slate-800">{readyPickupOrders.length}</span>
                  <p className="text-[10px] text-slate-500 font-medium mt-0.5">Siap Ambil</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. ORDERS TAB */}
        {activeTab === 'orders' && (
          <div className="flex flex-col gap-4">
            <h3 className="font-display font-bold text-base text-slate-800">Kelola Pesanan Aktif</h3>

            {/* A. NEW ORDERS Queue (PAYMENT_VERIFIED) */}
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                <h4 className="font-display font-bold text-sm text-slate-700">Pesanan Baru Masuk ({newOrders.length})</h4>
              </div>
              
              {newOrders.length === 0 ? (
                <p className="text-slate-400 text-xs bg-white p-4 rounded-xl border border-slate-200 text-center">Belum ada pesanan baru yang masuk saat ini.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {newOrders.map(o => (
                    <div key={o.id} className="bg-white border-2 border-amber-300 rounded-xl p-4 shadow-sm flex flex-col gap-3">
                      <div className="flex justify-between items-start border-b border-slate-100 pb-2">
                        <div>
                          <span className="font-mono text-xs font-bold text-slate-800">{o.id}</span>
                          <p className="text-[10px] text-slate-400 mt-0.5">Nama: {o.customerName}</p>
                        </div>
                        <span className="font-display font-bold text-rose-600 text-xs">Rp {o.total.toLocaleString()}</span>
                      </div>

                      {/* Items */}
                      <div className="text-xs text-slate-600 flex flex-col gap-1">
                        {o.items.map((it, i) => (
                          <div key={i} className="flex justify-between font-medium">
                            <span>{it.quantity}x {it.name}</span>
                            <span>Rp {(it.price * it.quantity).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>

                      {o.deliveryDetails && (
                        <div className="bg-slate-50 p-2 rounded-lg text-[11px] text-slate-500">
                          <span className="font-bold text-slate-700">Catatan:</span> {o.deliveryDetails}
                        </div>
                      )}

                      {renderOrderPreOrderInfo(o)}

                      {renderCommissionBreakdown(o.subtotal)}

                      {/* Estimate selection & actions */}
                      <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Estimasi Masak:</label>
                          <select
                            value={cookEstimateInput[o.id] || 15}
                            onChange={(e) => setCookEstimateInput({ ...cookEstimateInput, [o.id]: Number(e.target.value) })}
                            className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none"
                          >
                            <option value={15}>15 Menit</option>
                            <option value={30}>30 Menit</option>
                            <option value={45}>45 Menit</option>
                            <option value={60}>60 Menit</option>
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setRejectModal({ orderId: o.id, visible: true, reason: '' })}
                            className="flex-1 py-2 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            Tolak
                          </button>
                          <button
                            onClick={() => acceptOrder(o.id)}
                            className="flex-1 py-2 text-xs font-bold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
                          >
                            Mulai Memasak
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* B. COOKING ORDERS */}
            <div className="mt-2">
              <h4 className="font-display font-bold text-sm text-slate-700 mb-2.5">Sedang Dimasak ({activeCookingOrders.length})</h4>
              {activeCookingOrders.length === 0 ? (
                <p className="text-slate-400 text-xs bg-white p-4 rounded-xl border border-slate-200 text-center">Tidak ada pesanan yang sedang dimasak.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {activeCookingOrders.map(o => (
                    <div key={o.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                        <span className="font-mono text-xs font-bold text-slate-800">{o.id}</span>
                        <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Clock className="w-3 h-3 animate-spin" />
                          Dimasak ({o.cookingTimeMinutes || 30}m)
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 flex flex-col gap-1">
                        {o.items.map((it, i) => (
                          <div key={i} className="flex justify-between font-semibold">
                            <span>{it.quantity}x {it.name}</span>
                          </div>
                        ))}
                      </div>

                      {renderOrderPreOrderInfo(o)}

                      {renderCommissionBreakdown(o.subtotal)}

                      <button
                        onClick={() => setOrderReady(o.id)}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                      >
                        Pesanan Siap Diambil 🔔
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* C. READY FOR PICKUP */}
            <div className="mt-2">
              <h4 className="font-display font-bold text-sm text-slate-700 mb-2.5">Siap Diambil Kurir ({readyPickupOrders.length})</h4>
              {readyPickupOrders.length === 0 ? (
                <p className="text-slate-400 text-xs bg-white p-4 rounded-xl border border-slate-200 text-center">Tidak ada pesanan siap dijemput.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {readyPickupOrders.map(o => (
                    <div key={o.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-mono font-bold text-slate-500">{o.id}</span>
                        <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full">Menunggu Penjemputan</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{o.customerName}</p>
                      <p className="text-xs text-slate-500">Kurir ditugaskan: <span className="font-bold text-emerald-600">{o.driverName || 'Mencari driver...'}</span></p>

                      {renderCommissionBreakdown(o.subtotal)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* D. ON DELIVERY */}
            <div className="mt-4">
              <h4 className="font-display font-bold text-sm text-slate-700 mb-2.5">Sedang Diantar Kurir ({onDeliveryOrders.length})</h4>
              {onDeliveryOrders.length === 0 ? (
                <p className="text-slate-400 text-xs bg-white p-4 rounded-xl border border-slate-200 text-center">Tidak ada pesanan sedang diantar.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {onDeliveryOrders.map(o => (
                    <div key={o.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-mono font-bold text-slate-500">{o.id}</span>
                        <span className="text-[10px] font-bold bg-sky-50 text-sky-700 px-2.5 py-0.5 rounded-full animate-pulse">Sedang Diantar</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{o.customerName}</p>
                      <p className="text-xs text-slate-500">Kurir pengantar: <span className="font-bold text-emerald-600">{o.driverName || 'Kurir'}</span></p>

                      {renderCommissionBreakdown(o.subtotal)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* E. COMPLETED ORDERS */}
            <div className="mt-4 border-t border-slate-200 pt-4">
              <h4 className="font-display font-bold text-sm text-slate-700 mb-2.5">Pesanan Selesai ({completedOrdersToday.length})</h4>
              <p className="text-slate-500 text-[11px] mb-3 leading-relaxed">Berikut adalah pesanan yang sudah selesai dikirim dan dana penjualannya masuk ke saldo akumulasi penarikan Anda.</p>
              {completedOrdersToday.length === 0 ? (
                <p className="text-slate-400 text-xs bg-white p-4 rounded-xl border border-slate-200 text-center">Belum ada pesanan yang selesai hari ini.</p>
              ) : (
                <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-1">
                  {completedOrdersToday.map(o => (
                    <div key={o.id} className="bg-white border border-emerald-100 rounded-xl p-4 shadow-sm flex flex-col gap-2.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-mono font-bold text-slate-800">{o.id}</span>
                        <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          Selesai ✅
                        </span>
                      </div>
                      <div className="flex justify-between items-start border-b border-slate-100 pb-1.5">
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{o.customerName}</p>
                          <p className="text-[10px] text-slate-500">Kurir: {o.driverName || 'Driver'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-rose-600">Rp {o.subtotal.toLocaleString()}</p>
                          <p className="text-[9px] text-slate-400">Subtotal Makanan</p>
                        </div>
                      </div>
                      {/* Items details */}
                      <div className="text-[11px] text-slate-500 flex flex-col gap-0.5">
                        {o.items.map((it, idx) => (
                          <div key={idx} className="flex justify-between font-medium">
                            <span>{it.quantity}x {it.name}</span>
                            <span>Rp {(it.price * it.quantity).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                      {o.deliveryProof && (
                        <div className="mt-1 bg-slate-50 border border-slate-100 rounded-lg p-2 flex flex-col gap-1.5">
                          <span className="text-[10px] font-semibold text-slate-500">Foto Bukti Pengantaran (Auto-Selesai):</span>
                          <img src={o.deliveryProof} alt="Bukti Pengantaran" className="w-full h-24 object-cover rounded-md" referrerPolicy="no-referrer" />
                        </div>
                      )}

                      {renderCommissionBreakdown(o.subtotal)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. MENU & CATEGORY TAB */}
        {activeTab === 'menu' && (
          <div className="flex flex-col gap-5">
            {/* Form category and item trigger */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditingCategory({ name: '' });
                  setShowCategoryForm(true);
                }}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-all"
              >
                <Layers className="w-4 h-4" />
                + Kategori
              </button>
              <button
                onClick={() => {
                  setEditingItem({ name: '', description: '', price: 0, categoryId: categories[0]?.id || '', available: true, allowInstant: true });
                  setShowItemForm(true);
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-all"
              >
                <Plus className="w-4 h-4" />
                + Menu Makanan
              </button>
            </div>

            {/* Category Form Modal */}
            {showCategoryForm && editingCategory && (
              <form onSubmit={handleSaveCategory} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                <h4 className="font-display font-semibold text-sm text-slate-800">{editingCategory.id ? 'Edit Kategori' : 'Kategori Baru'}</h4>
                <input
                  type="text"
                  required
                  value={editingCategory.name || ''}
                  onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                  placeholder="Nama Kategori (misal: Cemilan, Minuman)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-500"
                />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowCategoryForm(false)} className="px-3 py-1.5 text-xs font-bold text-slate-500 bg-slate-100 rounded-lg">Batal</button>
                  <button type="submit" className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 rounded-lg">Simpan</button>
                </div>
              </form>
            )}

            {/* Item Form Modal */}
            {showItemForm && editingItem && (
              <form onSubmit={handleSaveItem} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3.5">
                <h4 className="font-display font-semibold text-sm text-slate-800">{editingItem.id ? 'Edit Menu' : 'Menu Makanan Baru'}</h4>
                
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Nama Menu</label>
                  <input
                    type="text"
                    required
                    value={editingItem.name || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    placeholder="Bakso Kuah, Es Campur..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Harga (IDR)</label>
                    <input
                      type="number"
                      required
                      value={editingItem.price || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, price: Number(e.target.value) })}
                      placeholder="15000"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Kategori</label>
                    <select
                      value={editingItem.categoryId || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, categoryId: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none"
                    >
                      <option value="">Pilih Kategori</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">
                    Rincian & Komposisi Menu (Terlihat saat pelanggan mengklik menu)
                  </label>
                  <textarea
                    value={editingItem.description || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                    placeholder="Contoh: 1 Bakso Halus Besar, 1 Bakso Urat, Tahu, Mie Kuning & Bihun, dengan Kuah Kaldu Sapi Gurih..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-500"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Foto Menu (Tautan Gambar)</label>
                  <input
                    type="text"
                    value={editingItem.image || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, image: e.target.value })}
                    placeholder="https://images.unsplash.com/photo-..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="flex flex-col gap-2 bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="chkAvailable"
                      checked={editingItem.available !== false}
                      onChange={(e) => setEditingItem({ ...editingItem, available: e.target.checked })}
                      className="rounded text-rose-500"
                    />
                    <label htmlFor="chkAvailable" className="text-xs font-semibold text-slate-700">Tersedia untuk Dipesan</label>
                  </div>
                  <div className="flex items-center gap-2 border-t border-slate-200/50 pt-2 mt-1">
                    <input
                      type="checkbox"
                      id="chkAllowInstant"
                      disabled={!merchant.isPremium}
                      checked={merchant.isPremium ? (editingItem.allowInstant !== false) : true}
                      onChange={(e) => setEditingItem({ ...editingItem, allowInstant: e.target.checked })}
                      className={`rounded ${merchant.isPremium ? 'text-rose-500 cursor-pointer' : 'text-slate-300 cursor-not-allowed'}`}
                    />
                    <label htmlFor="chkAllowInstant" className={`text-xs font-semibold flex items-center gap-1.5 ${merchant.isPremium ? 'text-slate-700 cursor-pointer' : 'text-slate-400 cursor-not-allowed'}`}>
                      Bisa Dipesan Instan (Langsung)
                      {!merchant.isPremium && (
                        <span className="text-[9px] bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider flex items-center gap-0.5 shadow-sm">
                          👑 Lisensi Premium
                        </span>
                      )}
                    </label>
                  </div>
                  <p className="text-[9px] text-slate-400 pl-5 leading-normal">
                    {merchant.isPremium 
                      ? 'Jika dinonaktifkan (Off), menu ini hanya bisa dipesan melalui metode Pre-Order (PO).'
                      : 'Aktifkan kontrak lisensi premium toko untuk dapat mengubah menu menjadi Hanya Pre-Order (PO).'}
                  </p>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Batas Minimal Order Pre-Order (Opsional)</label>
                  <input
                    type="number"
                    value={editingItem.preOrderMinAmount || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, preOrderMinAmount: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="Contoh: 25 (Dikosongkan untuk mengikuti batas default toko)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-500"
                    min="1"
                  />
                  <p className="text-[9px] text-slate-400 mt-0.5">
                    Hanya berlaku jika pelanggan memilih metode Pre-Order. Jika kosong, akan memakai batas minimal default toko.
                  </p>
                </div>

                <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                  <button type="button" onClick={() => setShowItemForm(false)} className="px-3 py-1.5 text-xs font-bold text-slate-500 bg-slate-100 rounded-lg">Batal</button>
                  <button type="submit" className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 rounded-lg">Simpan</button>
                </div>
              </form>
            )}

            {/* List Kategori Editor */}
            <div className="flex flex-col gap-3">
              <h4 className="font-display font-bold text-sm text-slate-800">Daftar Menu</h4>
              
              {categories.map(cat => {
                const itemsInCat = menuItems.filter(item => item.categoryId === cat.id);
                return (
                  <div key={cat.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                    {/* Category Header */}
                    <div className="flex justify-between items-center border-b border-slate-100 pb-2.5 mb-3">
                      <span className="font-display font-bold text-sm text-slate-800">{cat.name} ({itemsInCat.length})</span>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setEditingCategory(cat);
                            setShowCategoryForm(true);
                          }}
                          className="p-1 hover:bg-slate-100 text-slate-500 rounded"
                          title="Edit Kategori"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => deleteCategory(cat.id)}
                          className="p-1 hover:bg-red-50 text-red-500 rounded"
                          title="Hapus Kategori"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Items list inside category */}
                    {itemsInCat.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic">Belum ada menu di kategori ini.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {itemsInCat.map(item => (
                          <div key={item.id} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0 text-xs">
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-800">{item.name}</span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] text-rose-600 font-bold">Rp {item.price.toLocaleString()}</span>
                                {item.preOrderMinAmount && (
                                  <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[8px] px-1 py-0.5 rounded font-extrabold uppercase tracking-wider">
                                    Min. Order: {item.preOrderMinAmount}
                                  </span>
                                )}
                                {merchant.isPremium && (
                                  item.allowInstant === false ? (
                                    <span className="bg-purple-50 text-purple-700 border border-purple-200 text-[8px] px-1 py-0.5 rounded font-extrabold uppercase tracking-wider">
                                      Hanya Pre-Order
                                    </span>
                                  ) : (
                                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[8px] px-1 py-0.5 rounded font-extrabold uppercase tracking-wider">
                                      Bisa Instan & PO
                                    </span>
                                  )
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={async () => {
                                  const toggled = !item.available;
                                  try {
                                    const res = await fetch(`/api/merchants/${merchantId}/menu/${item.id}`, {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ available: toggled })
                                    });
                                    if (res.ok) fetchMerchantData();
                                  } catch (err) {
                                    console.error(err);
                                  }
                                }}
                                className={`px-2 py-1 text-[10px] font-bold rounded ${
                                  item.available 
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                                }`}
                              >
                                {item.available ? 'Tersedia' : 'Habis'}
                              </button>
                              <button 
                                onClick={() => {
                                  setEditingItem(item);
                                  setShowItemForm(true);
                                }}
                                className="p-1 hover:bg-slate-100 text-slate-500 rounded"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => deleteItem(item.id)}
                                className="p-1 hover:bg-red-50 text-red-500 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. SETTLEMENT TAB */}
        {activeTab === 'settlement' && (
          <div className="flex flex-col gap-4">
            <h3 className="font-display font-bold text-base text-slate-800"> Settlement & Pendapatan</h3>
            <p className="text-slate-500 text-xs leading-relaxed">Dana bersih dari penjualan pesanan selesai ditransfer oleh Admin menggunakan sistem Settlement H+1 ke rekening Anda (dipotong biaya komisi 10%).</p>

            {settlements.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <TrendingUp className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-slate-400 text-xs mt-2">Belum ada riwayat settlement pencairan dana.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {settlements.map(set => (
                  <div key={set.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-2.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[10px] text-slate-400 font-mono">{set.id}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        set.status === SettlementStatus.SETTLEMENT_COMPLETED 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-amber-100 text-amber-800 animate-pulse'
                      }`}>
                        {set.status === SettlementStatus.SETTLEMENT_COMPLETED ? 'Telah Ditransfer' : 'Menunggu Transfer'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-slate-50 text-slate-600">
                      <div>
                        <span>Gross Sales ({set.orderCount} pesanan):</span>
                        <p className="font-bold text-slate-800 mt-0.5">Rp {set.totalSales.toLocaleString()}</p>
                      </div>
                      <div>
                        <span>Potongan Komisi (10%):</span>
                        <p className="font-semibold text-red-600 mt-0.5">-Rp {set.totalCommission.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="flex justify-between items-end">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-400">Rekening Tujuan:</span>
                        <span className="text-[10px] font-medium text-slate-700">{set.bankName} - {set.bankAccount}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] text-slate-400">Dana Bersih:</span>
                        <span className="font-display font-bold text-rose-600 text-sm">Rp {set.amountToPay.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 5. PROFILE TAB */}
        {activeTab === 'profile' && merchant && (
          <form onSubmit={handleUpdateProfile} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
            <h3 className="font-display font-bold text-base text-slate-800 border-b border-slate-100 pb-2.5">Pengaturan Profil Toko</h3>

            {/* LOGO UPLOAD */}
            <div>
              <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block mb-1.5">Logo Toko / Merchant</label>
              <div className="flex items-center gap-4">
                {profileImage ? (
                  <div className="relative w-16 h-16 rounded-full border border-slate-200 overflow-hidden bg-slate-50 flex-shrink-0 group">
                    <img src={profileImage} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <button
                      type="button"
                      onClick={() => setProfileImage('')}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity text-[10px] font-bold"
                    >
                      Hapus
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400 flex-shrink-0">
                    <Store className="w-6 h-6" />
                  </div>
                )}
                
                <div 
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingLogo(true); }}
                  onDragLeave={() => setIsDraggingLogo(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingLogo(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleLogoUpload(file);
                  }}
                  onClick={() => document.getElementById('logo-input')?.click()}
                  className={`flex-1 border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all ${
                    isDraggingLogo 
                      ? 'border-rose-500 bg-rose-50/50' 
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100/50'
                  }`}
                >
                  <input 
                    id="logo-input"
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoUpload(file);
                    }}
                  />
                  <p className="text-[11px] font-medium text-slate-700">Tarik logo ke sini atau <span className="text-rose-600 font-bold">pilih file</span></p>
                  <p className="text-[9px] text-slate-400 mt-0.5">Format JPG/PNG, Maks. 2MB</p>
                </div>
              </div>
            </div>

            {/* BANNER UPLOAD */}
            <div>
              <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block mb-1.5">Banner Toko (Gambar Cover)</label>
              {profileBanner && (
                <div className="relative w-full h-24 rounded-xl border border-slate-200 overflow-hidden bg-slate-50 mb-2 group">
                  <img src={profileBanner} alt="Banner" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  <button
                    type="button"
                    onClick={() => setProfileBanner('')}
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity text-xs font-bold"
                  >
                    Hapus Banner
                  </button>
                </div>
              )}
              
              <div 
                onDragOver={(e) => { e.preventDefault(); setIsDraggingBanner(true); }}
                onDragLeave={() => setIsDraggingBanner(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingBanner(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleBannerUpload(file);
                }}
                onClick={() => document.getElementById('banner-input')?.click()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                  isDraggingBanner 
                    ? 'border-rose-500 bg-rose-50/50' 
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100/50'
                }`}
              >
                <input 
                  id="banner-input"
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleBannerUpload(file);
                  }}
                />
                <p className="text-[11px] font-medium text-slate-700">Tarik banner toko ke sini atau <span className="text-rose-600 font-bold">pilih file</span></p>
                <p className="text-[9px] text-slate-400 mt-0.5">Format JPG/PNG, Rekomendasi lanskap, Maks. 3MB</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Nama Toko / Merchant</label>
              <input
                type="text"
                required
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Nama Pemilik</label>
                <input
                  type="text"
                  required
                  value={profileOwner}
                  onChange={(e) => setProfileOwner(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">WhatsApp Pemilik</label>
                <input
                  type="tel"
                  required
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Deskripsi Toko</label>
              <textarea
                value={profileDesc}
                onChange={(e) => setProfileDesc(e.target.value)}
                rows={2}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Kategori Kuliner</label>
              <select
                value={profileCategory}
                onChange={(e) => setProfileCategory(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none mt-1 font-medium"
              >
                <option value="Bakso & Mie">🍜 Bakso & Mie</option>
                <option value="Nasi & Lauk">🍛 Nasi & Lauk</option>
                <option value="Sate & Bakaran">🍢 Sate & Bakaran</option>
                <option value="Cemilan & Jajanan">🍘 Cemilan & Jajanan</option>
                <option value="Minuman Segar">🥤 Minuman Segar</option>
                <option value="Lainnya">🏪 Lainnya</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" /> Jam Buka
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 08:00"
                  value={profileOpenTime}
                  onChange={(e) => setProfileOpenTime(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" /> Jam Tutup
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 21:00"
                  value={profileCloseTime}
                  onChange={(e) => setProfileCloseTime(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none mt-1"
                />
              </div>
            </div>

            <h4 className="font-display font-semibold text-xs text-slate-500 uppercase tracking-wider border-t border-slate-100 pt-3 mt-1">Informasi Settlement Bank</h4>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="text-xs font-bold text-slate-600 block mb-1">Bank</label>
                <input
                  type="text"
                  required
                  placeholder="BCA, BRI"
                  value={profileBankName}
                  onChange={(e) => setProfileBankName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-bold text-slate-600 block mb-1">No Rekening</label>
                <input
                  type="text"
                  required
                  value={profileBankAccount}
                  onChange={(e) => setProfileBankAccount(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Nama Pemilik Rekening</label>
              <input
                type="text"
                required
                value={profileBankHolder}
                onChange={(e) => setProfileBankHolder(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none mt-1"
              />
            </div>

            {/* PREMIUM & PRE-ORDER SETTINGS */}
            <div className="border-t border-slate-100 pt-4 mt-1 flex flex-col gap-3">
              <h4 className="font-display font-bold text-xs text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Award className="w-4 h-4 text-rose-500" />
                Sistem Pre-Order & Lisensi Kontrak
              </h4>

              {/* Status Kontrak Premium */}
              {merchant.isPremium ? (
                <div className="bg-gradient-to-br from-amber-50 to-orange-100/60 border border-amber-200 rounded-xl p-3.5 flex flex-col gap-1 shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-extrabold text-amber-800 flex items-center gap-1">
                      👑 Kontrak Premium Aktif
                    </span>
                    <span className="text-[9px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full uppercase">
                      Premium
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-700 leading-relaxed mt-1">
                    Toko Anda terikat kontrak lisensi berbayar aktif. Fitur pre-order dan minimal pembelian telah terbuka sepenuhnya.
                  </p>
                  <div className="text-[10px] text-slate-500 font-medium mt-1.5 flex justify-between">
                    <span>Kode Lisensi: <span className="font-mono font-bold text-slate-700">{merchant.licenseKey}</span></span>
                    <span>Hingga: <span className="font-bold text-slate-700">{merchant.licenseExpiresAt ? new Date(merchant.licenseExpiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</span></span>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col gap-3.5">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      🔒 Fitur Pre-Order Terkunci
                    </span>
                    <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                      Sistem Pre-Order (pesan dahulu dengan minimal order, seperti <strong>Fitri Kue</strong>) hanya tersedia bagi toko berbayar (kontrak/sewa khusus).
                    </p>
                  </div>
                  
                  {/* Redeem License Action Form (sub-action inside main profile page) */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Aktivasi Kode Lisensi Kontrak</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Contoh: TUMPANG-PREM-FITRI-KUE"
                        value={licenseKeyInput}
                        onChange={(e) => setLicenseKeyInput(e.target.value)}
                        className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-rose-500"
                      />
                      <button
                        type="button"
                        onClick={handleRedeemLicense}
                        disabled={redeeming}
                        className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg transition-all"
                      >
                        {redeeming ? 'Proses...' : 'Aktivasi'}
                      </button>
                    </div>
                    <div className="bg-rose-50/50 border border-rose-100 p-2 rounded-lg text-[10px] text-slate-600 mt-1 flex flex-col gap-1">
                      <p className="font-medium text-slate-500 leading-tight">
                        *Gunakan kode demo <strong className="font-mono text-rose-700">TUMPANG-PREM-FITRI-KUE</strong>
                      </p>
                      <button
                        type="button"
                        onClick={async () => {
                          setLicenseKeyInput('TUMPANG-PREM-FITRI-KUE');
                          setRedeeming(true);
                          try {
                            const res = await fetch(`/api/merchants/${merchantId}/redeem-license`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ key: 'TUMPANG-PREM-FITRI-KUE' })
                            });
                            if (res.ok) {
                              alert('Kontrak Lisensi Berhasil Diaktifkan! Selamat, Toko Anda sekarang berstatus PREMIUM.');
                              setLicenseKeyInput('');
                              fetchMerchantData();
                            } else {
                              const err = await res.json();
                              alert(err.error || 'Gagal mengaktifkan lisensi.');
                            }
                          } catch (err) {
                            console.error(err);
                          } finally {
                            setRedeeming(false);
                          }
                        }}
                        className="text-left text-[10px] text-rose-600 font-black hover:underline cursor-pointer bg-transparent border-0 p-0 flex items-center gap-1"
                      >
                        👉 Klik disini untuk Aktivasi Instan (Pre-Order) &rarr;
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Konfigurasi Pre-Order */}
              <div className={`p-4 rounded-xl border flex flex-col gap-4 ${
                merchant.isPremium 
                  ? 'bg-white border-slate-200 shadow-sm' 
                  : 'bg-slate-100/50 border-slate-200/60 opacity-60 select-none'
              }`}>
                <div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-2">Tipe Sistem Pemesanan & Pengantaran</h4>
                  <p className="text-[10px] text-slate-400 mb-3.5 leading-normal">
                    Pilih bagaimana pelanggan dapat memesan makanan dari outlet Anda di aplikasi/website customer.
                  </p>

                  <div className="flex flex-col gap-2.5">
                    {/* Opsi 1: Hanya Instan */}
                    <label className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      !preOrderOnly && !allowInstantAndPreOrder
                        ? 'bg-rose-50/40 border-rose-200 ring-1 ring-rose-200' 
                        : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
                    }`}>
                      <input
                        type="radio"
                        name="preOrderSystem"
                        disabled={!merchant.isPremium}
                        checked={!preOrderOnly && !allowInstantAndPreOrder}
                        onChange={() => {
                          setPreOrderOnly(false);
                          setAllowInstantAndPreOrder(false);
                        }}
                        className="text-rose-600 focus:ring-rose-500 h-4 w-4 mt-0.5 cursor-pointer"
                      />
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">🚀 Pengantaran Instan Saja (Standard)</span>
                        <span className="text-[10px] text-slate-400 mt-0.5">Pelanggan memesan dan langsung diantar seketika (seperti GoFood/GrabFood).</span>
                      </div>
                    </label>

                    {/* Opsi 2: Hanya Pre-Order */}
                    <label className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      preOrderOnly && !allowInstantAndPreOrder
                        ? 'bg-amber-50/40 border-amber-200 ring-1 ring-amber-200' 
                        : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
                    }`}>
                      <input
                        type="radio"
                        name="preOrderSystem"
                        disabled={!merchant.isPremium}
                        checked={preOrderOnly && !allowInstantAndPreOrder}
                        onChange={() => {
                          setPreOrderOnly(true);
                          setAllowInstantAndPreOrder(false);
                        }}
                        className="text-amber-600 focus:ring-amber-500 h-4 w-4 mt-0.5 cursor-pointer"
                      />
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">📅 Hanya Pre-Order Saja (Catering/Kue)</span>
                        <span className="text-[10px] text-slate-400 mt-0.5">Pelanggan wajib memesan jauh-jauh hari (H-min) dan memilih tanggal pengantaran. Tombol checkout instan dinonaktifkan.</span>
                      </div>
                    </label>

                    {/* Opsi 3: Dual Sistem */}
                    <label className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      !preOrderOnly && allowInstantAndPreOrder
                        ? 'bg-emerald-50/40 border-emerald-200 ring-1 ring-emerald-200' 
                        : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
                    }`}>
                      <input
                        type="radio"
                        name="preOrderSystem"
                        disabled={!merchant.isPremium}
                        checked={!preOrderOnly && allowInstantAndPreOrder}
                        onChange={() => {
                          setPreOrderOnly(false);
                          setAllowInstantAndPreOrder(true);
                        }}
                        className="text-emerald-600 focus:ring-emerald-500 h-4 w-4 mt-0.5 cursor-pointer"
                      />
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">👑 Dual Sistem (Pre-Order ATAU Instan)</span>
                        <span className="text-[10px] text-slate-400 mt-0.5">Bebaskan pelanggan Anda untuk langsung checkout pesanan instan hari ini, ATAU jadwalkan Pre-Order untuk hari lain.</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Sub-konfigurasi Pre-Order (tampil jika opsi Pre-Order atau Dual terpilih) */}
                {(preOrderOnly || allowInstantAndPreOrder) && (
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 animate-fadeIn">
                    <div>
                      <label className="text-[10px] font-extrabold text-slate-600 block mb-1">Minimal Jumlah (Porsi/Item)</label>
                      <div className="flex items-center gap-1.5 mt-1">
                        <button
                          type="button"
                          disabled={!merchant.isPremium || preOrderMinAmount <= 1}
                          onClick={() => setPreOrderMinAmount(prev => Math.max(1, prev - 1))}
                          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 flex items-center justify-center font-bold text-slate-700 transition-all border border-slate-200 cursor-pointer text-xs"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          disabled={!merchant.isPremium}
                          value={preOrderMinAmount}
                          onChange={(e) => setPreOrderMinAmount(Math.max(1, Number(e.target.value)))}
                          className="w-12 bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs text-center font-bold text-slate-700 focus:outline-none focus:border-rose-500"
                        />
                        <button
                          type="button"
                          disabled={!merchant.isPremium}
                          onClick={() => setPreOrderMinAmount(prev => prev + 1)}
                          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 flex items-center justify-center font-bold text-slate-700 transition-all border border-slate-200 cursor-pointer text-xs"
                        >
                          +
                        </button>
                        <span className="text-[10px] text-slate-400 font-bold ml-1">Porsi</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-extrabold text-slate-600 block mb-1">Notice Persiapan (Hari)</label>
                      <select
                        disabled={!merchant.isPremium}
                        value={preOrderLeadDays}
                        onChange={(e) => setPreOrderLeadDays(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:outline-none"
                      >
                        <option value={1}>H-1 Pemesanan</option>
                        <option value={2}>H-2 Pemesanan</option>
                        <option value={3}>H-3 Pemesanan</option>
                        <option value={5}>H-5 Pemesanan</option>
                        <option value={7}>H-7 Pemesanan</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="submit"
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all shadow-md text-xs"
              >
                Perbarui Profil
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="p-3 bg-slate-100 text-red-600 hover:bg-red-50 font-bold rounded-xl transition-all border border-slate-200 text-xs flex items-center justify-center gap-1"
              >
                <LogOut className="w-4 h-4" />
                Keluar
              </button>
            </div>
          </form>
        )}

      </main>

      {/* Footer Nav Bar */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-slate-200 flex justify-around p-2.5 z-50 shadow-lg">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 text-xs font-semibold ${
            activeTab === 'dashboard' ? 'text-rose-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <TrendingUp className="w-5 h-5" />
          <span>Dasbor</span>
        </button>
        
        <button
          onClick={() => setActiveTab('orders')}
          className={`flex flex-col items-center gap-1 text-xs font-semibold relative ${
            activeTab === 'orders' ? 'text-rose-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <ClipboardList className="w-5 h-5" />
          <span>Pesanan</span>
          {newOrders.length > 0 && (
            <span className="absolute top-[-3px] right-[4px] bg-amber-500 text-white font-extrabold text-[9px] w-4 h-4 rounded-full flex items-center justify-center border-2 border-white animate-pulse">
              {newOrders.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('menu')}
          className={`flex flex-col items-center gap-1 text-xs font-semibold ${
            activeTab === 'menu' ? 'text-rose-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Utensils className="w-5 h-5" />
          <span>Menu</span>
        </button>

        <button
          onClick={() => setActiveTab('settlement')}
          className={`flex flex-col items-center gap-1 text-xs font-semibold ${
            activeTab === 'settlement' ? 'text-rose-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <DollarSign className="w-5 h-5" />
          <span>Settlement</span>
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center gap-1 text-xs font-semibold ${
            activeTab === 'profile' ? 'text-rose-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span>Toko</span>
        </button>
      </nav>
    </div>
  );
}
