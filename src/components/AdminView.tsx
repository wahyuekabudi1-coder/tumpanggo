import React, { useState, useEffect } from 'react';
import { 
  Order, OrderStatus, Merchant, Driver, Settlement, SettlementStatus, SystemConfig 
} from '../types.ts';
import { 
  ShieldCheck, CheckSquare, ClipboardList, Store, Users, DollarSign, Settings, 
  Check, X, FileText, AlertTriangle, Play, Truck, Award, RefreshCw, ZoomIn, Eye,
  UserPlus
} from 'lucide-react';

interface AdminViewProps {
  onLogout: () => void;
  systemConfig: SystemConfig;
  onUpdateConfig: (config: SystemConfig) => void;
}

export default function AdminView({ onLogout, systemConfig, onUpdateConfig }: AdminViewProps) {
  // Tabs: 'verify' | 'orders' | 'merchants' | 'drivers' | 'settlements' | 'settings' | 'licenses'
  const [activeTab, setActiveTab] = useState('verify');
  const [orders, setOrders] = useState<Order[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [partnerRegistrations, setPartnerRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // License administration states
  const [licenses, setLicenses] = useState<any[]>([]);
  const [newLicenseKey, setNewLicenseKey] = useState('');
  const [newLicenseDuration, setNewLicenseDuration] = useState(30);
  const [generatingLicense, setGeneratingLicense] = useState(false);

  // States for editing merchant email
  const [editingMerchantId, setEditingMerchantId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  // States for editing driver email
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const [editingDriverEmail, setEditingDriverEmail] = useState('');
  const [savingDriverEmail, setSavingDriverEmail] = useState(false);

  // Modal / Selection states
  const [paymentRejectModal, setPaymentRejectModal] = useState<{ orderId: string; reason: string } | null>(null);
  const [assignDriverModal, setAssignDriverModal] = useState<{ orderId: string; selectedDriverId: string } | null>(null);
  const [showImageModal, setShowImageModal] = useState<string | null>(null);

  // Settlement creation form states
  const [selectedSettlementMerchantId, setSelectedSettlementMerchantId] = useState('');
  const [previewSettlement, setPreviewSettlement] = useState<{ orderCount: number; totalSales: number; commission: number; netAmount: number; eligibleOrders: Order[] } | null>(null);

  // Config settings form states
  const [qrisInput, setQrisInput] = useState(systemConfig.qrisImage || '');
  const [deliveryFeeInput, setDeliveryFeeInput] = useState(systemConfig.defaultDeliveryFee || 5000);
  const [serviceFeeInput, setServiceFeeInput] = useState(systemConfig.serviceFee || 2000);

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const ordRes = await fetch('/api/orders');
      const ordData = await ordRes.json();
      setOrders(ordData);

      const merRes = await fetch('/api/merchants');
      const merData = await merRes.json();
      setMerchants(merData);

      const drRes = await fetch('/api/drivers');
      const drData = await drRes.json();
      setDrivers(drData);

      const setRes = await fetch('/api/settlements');
      const setData = await setRes.json();
      setSettlements(setData);

      const prRes = await fetch('/api/partner-registrations');
      const prData = await prRes.json();
      setPartnerRegistrations(prData);

      // Fetch contract licenses
      const licRes = await fetch('/api/licenses');
      if (licRes.ok) {
        const licData = await licRes.json();
        setLicenses(licData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleApprovePartner = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menyetujui pendaftaran ini? Toko/Kurir baru akan otomatis didaftarkan ke sistem.')) return;
    try {
      const reg = partnerRegistrations.find(r => r.id === id);
      const res = await fetch(`/api/partner-registrations/${id}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'admin' })
      });
      if (res.ok) {
        const approvedData = await res.json();
        const approvedReg = approvedData.registration;

        if (reg && reg.type === 'MERCHANT') {
          // Generate automated email
          const simulatedEmail = {
            id: 'email_' + Math.random().toString(36).substr(2, 9),
            to: reg.email,
            from: 'Tumpang Food Admin <admin@tumpangfood.com>',
            subject: `🎉 Pendaftaran Toko ${approvedReg?.storeName || reg.storeName || reg.name} Disetujui!`,
            body: `Halo ${approvedReg?.name || reg.name},\n\nSelamat! Pendaftaran kemitraan Anda untuk "${approvedReg?.storeName || reg.storeName || (reg.name + ' Store')}" telah disetujui oleh tim peninjau Tumpang Food.\n\nAkun Anda telah aktif secara otomatis. Berikut adalah data akses portal merchant Anda:\n\nEmail: ${approvedReg?.email || reg.email}\nKata Sandi: ${approvedReg?.password || 'TF-1234'}\n\nSilakan klik tombol di bawah ini atau gunakan tautan berikut untuk masuk ke portal:\n${window.location.origin}/?role=merchant&id=${approvedReg?.storeId || ''}`,
            linkUrl: `?role=merchant&id=${approvedReg?.storeId || ''}`,
            createdAt: new Date().toISOString(),
            read: false
          };
          const existingEmailsStr = localStorage.getItem('tumpang_simulated_emails') || '[]';
          const existingEmails = JSON.parse(existingEmailsStr);
          existingEmails.unshift(simulatedEmail);
          localStorage.setItem('tumpang_simulated_emails', JSON.stringify(existingEmails));
          
          // Dispatch custom event to notify other components
          window.dispatchEvent(new Event('tumpang_new_email'));
        }

        alert(`Pendaftaran berhasil disetujui! Toko baru telah didaftarkan dengan sandi: ${approvedReg?.password || ''}. Email notifikasi telah dikirim.`);
        fetchAdminData();
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal menyetujui pendaftaran.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat menyetujui pendaftaran.');
    }
  };

  const handleRejectPartner = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menolak pendaftaran ini?')) return;
    try {
      const res = await fetch(`/api/partner-registrations/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'admin' })
      });
      if (res.ok) {
        alert('Pendaftaran telah ditolak.');
        fetchAdminData();
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal menolak pendaftaran.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat menolak pendaftaran.');
    }
  };

  const handleSaveMerchantEmail = async (merchantId: string) => {
    setSavingEmail(true);
    try {
      const res = await fetch(`/api/merchants/${merchantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: editingEmail, userId: 'admin', role: 'ADMIN' })
      });
      if (res.ok) {
        setEditingMerchantId(null);
        setEditingEmail('');
        fetchAdminData();
      } else {
        alert('Gagal memperbarui email merchant.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat menyimpan email.');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSaveDriverEmail = async (driverId: string) => {
    setSavingDriverEmail(true);
    try {
      const res = await fetch(`/api/drivers/${driverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: editingDriverEmail, userId: 'admin', role: 'ADMIN' })
      });
      if (res.ok) {
        setEditingDriverId(null);
        setEditingDriverEmail('');
        fetchAdminData();
      } else {
        alert('Gagal memperbarui email driver.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat menyimpan email driver.');
    } finally {
      setSavingDriverEmail(false);
    }
  };

  // Payment Verification actions
  const verifyPayment = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: OrderStatus.PAYMENT_VERIFIED, role: 'ADMIN' })
      });
      if (res.ok) {
        fetchAdminData();
        alert('Pembayaran BERHASIL diverifikasi! Pesanan diteruskan ke dapur merchant.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const rejectPayment = async (orderId: string, reason: string) => {
    if (!reason.trim()) {
      alert('Alasan penolakan wajib diisi.');
      return;
    }
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: OrderStatus.PAYMENT_REJECTED, 
          cancelReason: reason,
          role: 'ADMIN' 
        })
      });
      if (res.ok) {
        setPaymentRejectModal(null);
        fetchAdminData();
        alert('Pembayaran ditolak. Customer akan diberitahu alasan penolakan.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Driver Assignment actions
  const assignDriver = async (orderId: string, driverId: string) => {
    if (!driverId) return;
    try {
      const res = await fetch(`/api/orders/${orderId}/assign-driver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId })
      });
      if (res.ok) {
        setAssignDriverModal(null);
        fetchAdminData();
        alert('Driver berhasil ditugaskan ke pesanan ini!');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // License Management actions
  const handleGenerateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLicenseKey.trim()) {
      alert('Masukkan atau buat kode lisensi terlebih dahulu');
      return;
    }
    setGeneratingLicense(true);
    try {
      const res = await fetch('/api/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newLicenseKey,
          durationDays: newLicenseDuration,
          userId: 'admin'
        })
      });
      if (res.ok) {
        alert('Kode lisensi berhasil dibuat!');
        setNewLicenseKey('');
        // Refresh licenses list
        const licRes = await fetch('/api/licenses');
        if (licRes.ok) {
          const licData = await licRes.json();
          setLicenses(licData);
        }
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal membuat kode lisensi.');
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan koneksi.');
    } finally {
      setGeneratingLicense(false);
    }
  };

  const handleGenerateRandomKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'TUMPANG-PREM-';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewLicenseKey(result);
  };

  // Settlement generation mechanics
  const handleMerchantSelectForSettlement = (merchantId: string) => {
    setSelectedSettlementMerchantId(merchantId);
    if (!merchantId) {
      setPreviewSettlement(null);
      return;
    }

    // Filter COMPLETED orders of this merchant that don't have settlementId
    const eligible = orders.filter(o => 
      o.merchantId === merchantId && 
      o.status === OrderStatus.COMPLETED && 
      !o.settlementId
    );

    const totalSales = eligible.reduce((sum, o) => sum + o.subtotal, 0);
    const commission = Math.round(totalSales * 0.1); // 10%
    const netAmount = totalSales - commission;

    setPreviewSettlement({
      orderCount: eligible.length,
      totalSales,
      commission,
      netAmount,
      eligibleOrders: eligible
    });
  };

  const createSettlement = async () => {
    if (!selectedSettlementMerchantId || !previewSettlement || previewSettlement.orderCount === 0) {
      alert('Tidak ada transaksi selesai yang dapat dicairkan.');
      return;
    }

    try {
      const res = await fetch('/api/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: selectedSettlementMerchantId,
          orderIds: previewSettlement.eligibleOrders.map(o => o.id),
          totalSales: previewSettlement.totalSales,
          totalCommission: previewSettlement.commission,
          amountToPay: previewSettlement.netAmount,
          orderCount: previewSettlement.orderCount
        })
      });

      if (res.ok) {
        alert('Settlement pencairan dana berhasil dibuat dengan status WAITING_TRANSFER!');
        setSelectedSettlementMerchantId('');
        setPreviewSettlement(null);
        fetchAdminData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const completeSettlementTransfer = async (settlementId: string) => {
    if (!confirm('Tandai settlement ini telah ditransfer ke rekening merchant?')) return;
    try {
      const res = await fetch(`/api/settlements/${settlementId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: SettlementStatus.SETTLEMENT_COMPLETED })
      });
      if (res.ok) {
        fetchAdminData();
        alert('Status settlement diperbarui menjadi TELAH DITRANSFER!');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // System Config adjustment
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrisImage: qrisInput,
          defaultDeliveryFee: Number(deliveryFeeInput),
          serviceFee: Number(serviceFeeInput)
        })
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdateConfig(updated);
        alert('Konfigurasi sistem berhasil disimpan!');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Lists filtering
  const pendingVerifications = orders.filter(o => o.status === OrderStatus.WAITING_PAYMENT_VERIFICATION);
  const activeOrders = orders.filter(o => ![OrderStatus.COMPLETED, OrderStatus.CANCELLED].includes(o.status));

  if (loading) {
    return (
      <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col justify-center items-center font-sans">
        <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 text-sm mt-3 font-semibold">Memuat Panel Administrasi...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen pb-24 relative font-sans">
      {/* Header */}
      <header className="bg-white p-4 sticky top-0 z-50 rounded-b-3xl border-b-4 border-emerald-600 shadow-md shadow-emerald-900/10">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-700" />
            <div className="flex flex-col">
              <span className="font-display font-bold text-sm text-emerald-900 tracking-tight">Tumpang Food Admin</span>
              <span className="text-[10px] text-emerald-700 font-bold tracking-wide uppercase">Control Center</span>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="text-xs bg-red-50 hover:bg-red-100 text-red-700 font-bold px-2.5 py-1 rounded border border-red-200 transition-all cursor-pointer"
          >
            Keluar
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="p-4 flex flex-col gap-5">
        
        {/* Zoom Image Modal */}
        {showImageModal && (
          <div 
            className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-[200] cursor-zoom-out"
            onClick={() => setShowImageModal(null)}
          >
            <img src={showImageModal} alt="Zoomed Proof" className="max-w-full max-h-[85vh] object-contain rounded-lg" />
            <span className="absolute top-4 right-4 text-white font-bold bg-white/10 px-3 py-1.5 rounded-full text-xs">Tutup (Klik Luar)</span>
          </div>
        )}

        {/* Reject payment details dialog */}
        {paymentRejectModal && (
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-slate-100">
              <h4 className="font-display font-bold text-base text-slate-800">Tolak Pembayaran QRIS</h4>
              <p className="text-slate-500 text-xs mt-1">Berikan alasan mengapa pembayaran ini ditolak (akan tampil di portal customer).</p>
              
              <textarea
                value={paymentRejectModal.reason}
                onChange={(e) => setPaymentRejectModal({ ...paymentRejectModal, reason: e.target.value })}
                placeholder="Contoh: Bukti transfer buram, nominal transfer kurang Rp 5.000..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs mt-3 focus:outline-none focus:border-rose-500"
                rows={3}
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setPaymentRejectModal(null)}
                  className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200"
                >
                  Batal
                </button>
                <button
                  onClick={() => rejectPayment(paymentRejectModal.orderId, paymentRejectModal.reason)}
                  className="flex-1 py-2 text-xs font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 shadow-md"
                >
                  Kirim Tolak
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 1. TABS: VERIFY PAYMENTS */}
        {activeTab === 'verify' && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="font-display font-bold text-base text-slate-800">Verifikasi Bukti Transfer ({pendingVerifications.length})</h3>
              <button onClick={fetchAdminData} className="p-1.5 hover:bg-slate-100 text-slate-500 rounded-lg">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {pendingVerifications.length === 0 ? (
              <div className="text-center py-10 bg-white border border-slate-200 rounded-2xl">
                <CheckSquare className="w-10 h-10 text-slate-200 mx-auto" />
                <p className="text-slate-400 text-xs mt-2">Semua pembayaran QRIS telah selesai diverifikasi.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {pendingVerifications.map(o => (
                  <div key={o.id} className="bg-white border-l-4 border-l-rose-500 border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3.5">
                    <div className="flex justify-between items-start border-b border-slate-100 pb-2">
                      <div>
                        <span className="font-mono text-[10px] font-bold text-slate-400">{o.id}</span>
                        <p className="text-xs font-bold text-slate-800 mt-0.5">Cust: {o.customerName}</p>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="font-display font-extrabold text-rose-600 text-sm">Rp {o.total.toLocaleString()}</span>
                        <span className="text-[9px] text-rose-500 font-bold bg-rose-50 px-1.5 py-0.5 rounded mt-1">Kode Unik: +{o.uniqueCode}</span>
                      </div>
                    </div>

                    {/* Image proof thumbnail */}
                    {o.paymentProof && (
                      <div className="relative group w-full h-36 bg-slate-50 rounded-lg overflow-hidden border border-slate-150 flex items-center justify-center">
                        <img 
                          src={o.paymentProof} 
                          alt="Bukti Bayar" 
                          className="w-full h-full object-contain cursor-zoom-in"
                          onClick={() => setShowImageModal(o.paymentProof)}
                        />
                        <div className="absolute bottom-2 right-2 bg-slate-900/80 backdrop-blur-sm p-1 rounded-md text-white">
                          <ZoomIn className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => setPaymentRejectModal({ orderId: o.id, reason: '' })}
                        className="flex-1 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors"
                      >
                        Tolak Bukti
                      </button>
                      <button
                        onClick={() => verifyPayment(o.id)}
                        className="flex-1 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow"
                      >
                        Verifikasi Sesuai ✅
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. TABS: ORDERS MANAGEMENT */}
        {activeTab === 'orders' && (
          <div className="flex flex-col gap-4">
            <h3 className="font-display font-bold text-base text-slate-800">Manajemen Semua Pesanan</h3>

            {orders.length === 0 ? (
              <p className="text-slate-400 text-xs text-center py-10 bg-white border rounded-xl">Belum ada transaksi di sistem.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {orders.map(o => {
                  const availableDrivers = drivers.filter(d => d.online);
                  return (
                    <div key={o.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
                      <div className="flex justify-between items-start border-b border-slate-100 pb-2">
                        <div>
                          <span className="font-mono text-xs text-slate-500">{o.id}</span>
                          <p className="font-semibold text-slate-800 text-xs mt-0.5">{o.merchantName}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          o.status === OrderStatus.COMPLETED 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : o.status === OrderStatus.CANCELLED
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}>
                          {o.status}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600">
                        <p><span className="font-bold text-slate-700">Penerima:</span> {o.customerName} ({o.customerPhone})</p>
                        <p className="mt-1"><span className="font-bold text-slate-700">Total:</span> Rp {o.total.toLocaleString()}</p>
                        
                        {/* Driver assign section */}
                        <div className="mt-3.5 pt-3 border-t border-slate-50 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Kirim via Kurir:</span>
                          
                          {/* If completed or cancelled, display static */}
                          {[OrderStatus.COMPLETED, OrderStatus.DELIVERED, OrderStatus.CANCELLED].includes(o.status) ? (
                            <span className="font-semibold text-emerald-600 text-xs">{o.driverName || 'Tidak ada'}</span>
                          ) : (
                            <select
                              value={o.driverId || ''}
                              onChange={(e) => assignDriver(o.id, e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none"
                            >
                              <option value="">Pilih Driver Online</option>
                              {availableDrivers.map(d => (
                                <option key={d.id} value={d.id}>{d.name} {d.online ? '🟢' : '⚪'}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 3. TABS: MERCHANTS ROSTER */}
        {activeTab === 'merchants' && (
          <div className="flex flex-col gap-4">
            <h3 className="font-display font-bold text-base text-slate-800">UMKM Terdaftar ({merchants.length})</h3>
            
            <div className="flex flex-col gap-3">
              {merchants.map(m => (
                <div key={m.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <img src={m.image} alt={m.name} className="w-12 h-12 rounded-xl object-cover bg-slate-100 flex-shrink-0" referrerPolicy="no-referrer" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <h5 className="font-semibold text-slate-800 text-xs truncate">{m.name}</h5>
                        {m.isPremium && (
                          <span className="bg-amber-100 border border-amber-200 text-amber-900 font-extrabold text-[8px] px-1.5 py-0.2 rounded uppercase flex items-center gap-0.5">
                            👑 PREM
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium truncate">Owner: {m.ownerName} • <span className="text-rose-600 font-bold">{m.category || 'Nasi & Lauk'}</span></p>
                      <span className="text-[10px] text-slate-500 mt-1 block">Tlp: {m.phone}</span>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        m.active 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {m.active ? 'BUKA' : 'TUTUP'}
                      </span>
                      {m.preOrderOnly && (
                        <span className="text-[8px] text-amber-700 bg-amber-50 border border-amber-200 font-extrabold px-1.5 py-0.5 rounded">
                          PRE-ORDER
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Show Premium Contract Expiry or Pre-order settings */}
                  {(m.isPremium || m.preOrderOnly) && (
                    <div className="bg-slate-50 border border-slate-150 rounded-xl p-2.5 text-[9px] text-slate-500 font-medium flex flex-col gap-1">
                      {m.isPremium && (
                        <div className="flex justify-between">
                          <span>Lisensi: <span className="font-mono font-bold text-slate-700">{m.licenseKey}</span></span>
                          <span>Hingga: <span className="font-bold text-slate-700">{m.licenseExpiresAt ? new Date(m.licenseExpiresAt).toLocaleDateString('id-ID') : '-'}</span></span>
                        </div>
                      )}
                      {m.preOrderOnly && (
                        <div className="flex justify-between border-t border-slate-200/50 pt-1 mt-1">
                          <span>Sistem: <span className="text-amber-700 font-bold">Pre-Order H-{m.preOrderLeadDays || 1}</span></span>
                          <span>Min. Order: <span className="text-slate-700 font-bold">{(m.preOrderMinAmount || 0)} Porsi/Item</span></span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="border-t border-slate-100 pt-3 flex flex-col gap-2">
                    {editingMerchantId === m.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="email"
                          placeholder="Masukkan email terdaftar..."
                          value={editingEmail}
                          onChange={(e) => setEditingEmail(e.target.value)}
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-rose-500 focus:bg-white"
                        />
                        <button
                          onClick={() => handleSaveMerchantEmail(m.id)}
                          disabled={savingEmail}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold disabled:opacity-55 cursor-pointer"
                        >
                          Simpan
                        </button>
                        <button
                          onClick={() => { setEditingMerchantId(null); setEditingEmail(''); }}
                          disabled={savingEmail}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-medium disabled:opacity-55 cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center bg-slate-50 border border-slate-100/50 rounded-xl px-3 py-2">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Email Akses Terdaftar:</span>
                          <span className="text-xs text-slate-700 font-medium truncate mt-0.5 max-w-[200px]">
                            {m.email || '⚠️ Belum diatur'}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setEditingMerchantId(m.id);
                            setEditingEmail(m.email || '');
                          }}
                          className="text-[10px] text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer"
                        >
                          Atur Email
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. TABS: DRIVERS ROSTER */}
        {activeTab === 'drivers' && (
          <div className="flex flex-col gap-4">
            <h3 className="font-display font-bold text-base text-slate-800">Kurir Internal ({drivers.length})</h3>

            <div className="flex flex-col gap-3">
              {drivers.map(d => (
                <div key={d.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3.5">
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-800 text-sm">{d.name}</span>
                      <span className="text-xs text-slate-500 mt-0.5">{d.phone}</span>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                      d.online 
                        ? 'bg-emerald-100 text-emerald-800' 
                        : 'bg-slate-100 text-slate-400'
                    }`}>
                      {d.online ? 'ONLINE 🟢' : 'OFFLINE ⚪'}
                    </span>
                  </div>

                  <div className="border-t border-slate-100 pt-3 flex flex-col gap-2">
                    {editingDriverId === d.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="email"
                          placeholder="Masukkan email driver..."
                          value={editingDriverEmail}
                          onChange={(e) => setEditingDriverEmail(e.target.value)}
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-rose-500 focus:bg-white"
                        />
                        <button
                          onClick={() => handleSaveDriverEmail(d.id)}
                          disabled={savingDriverEmail}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold disabled:opacity-55 cursor-pointer"
                        >
                          Simpan
                        </button>
                        <button
                          onClick={() => { setEditingDriverId(null); setEditingDriverEmail(''); }}
                          disabled={savingDriverEmail}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-medium disabled:opacity-55 cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center bg-slate-50 border border-slate-100/50 rounded-xl px-3 py-2">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Email Akses Driver:</span>
                          <span className="text-xs text-slate-700 font-medium truncate mt-0.5 max-w-[200px]">
                            {d.email || '⚠️ Belum diatur'}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setEditingDriverId(d.id);
                            setEditingDriverEmail(d.email || '');
                          }}
                          className="text-[10px] text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer"
                        >
                          Atur Email
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. TABS: SETTLEMENT DASHBOARD */}
        {activeTab === 'settlements' && (
          <div className="flex flex-col gap-5">
            {/* Generate form */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3.5">
              <h4 className="font-display font-bold text-xs text-slate-500 uppercase tracking-wider">Generate Rekap Settlement Toko</h4>
              
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Pilih Merchant</label>
                <select
                  value={selectedSettlementMerchantId}
                  onChange={(e) => handleMerchantSelectForSettlement(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none"
                >
                  <option value="">Pilih Toko untuk Pencairan</option>
                  {merchants.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* Settlement Preview if selected */}
              {previewSettlement && (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs text-slate-600 flex flex-col gap-2 animate-fadeIn">
                  <div className="flex justify-between">
                    <span>Transaksi Selesai Belum Settled:</span>
                    <span className="font-bold text-slate-800">{previewSettlement.orderCount} Pesanan</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Penjualan Kotor (Gross):</span>
                    <span className="font-semibold text-slate-800">Rp {previewSettlement.totalSales.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Komisi Sistem (10%):</span>
                    <span className="font-semibold text-red-600">-Rp {previewSettlement.commission.toLocaleString()}</span>
                  </div>
                  <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-slate-800 text-sm">
                    <span>Bersih Ditransfer:</span>
                    <span className="text-rose-600">Rp {previewSettlement.netAmount.toLocaleString()}</span>
                  </div>

                  <button
                    onClick={createSettlement}
                    disabled={previewSettlement.orderCount === 0}
                    className={`mt-3 py-2 text-xs font-bold rounded-xl text-center transition-colors shadow-sm ${
                      previewSettlement.orderCount === 0
                        ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none'
                        : 'bg-rose-600 text-white hover:bg-rose-700'
                    }`}
                  >
                    Generate Settlement
                  </button>
                </div>
              )}
            </div>

            {/* List Settlements */}
            <div className="flex flex-col gap-3">
              <h4 className="font-display font-bold text-sm text-slate-700 mb-0.5">Logs Settlement Payout</h4>
              
              {settlements.length === 0 ? (
                <p className="text-slate-400 text-xs italic text-center bg-white p-4 rounded-xl border">Belum ada logs pencairan dana.</p>
              ) : (
                settlements.map(set => (
                  <div key={set.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-2.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-mono text-[10px] text-slate-400">{set.id}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        set.status === SettlementStatus.SETTLEMENT_COMPLETED 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-amber-100 text-amber-800 animate-pulse'
                      }`}>
                        {set.status}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 grid grid-cols-2 gap-1.5 py-1.5 border-y border-slate-50">
                      <p><span className="font-bold text-slate-700">Toko:</span> {set.merchantName}</p>
                      <p className="text-right"><span className="font-bold text-slate-700">Net:</span> Rp {set.amountToPay.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-400 col-span-2">Rekening: {set.bankName} - {set.bankAccount} ({set.bankHolder})</p>
                    </div>

                    {set.status === SettlementStatus.WAITING_CONFIRMATION && (
                      <button
                        onClick={() => completeSettlementTransfer(set.id)}
                        className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg transition-colors shadow-sm"
                      >
                        Konfirmasi Transfer Selesai ✅
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 6. TABS: SETTINGS CONFIG */}
        {activeTab === 'settings' && (
          <>
            <form onSubmit={handleSaveConfig} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
              <h3 className="font-display font-bold text-base text-slate-800 border-b border-slate-100 pb-2.5">Konfigurasi Tarif Sistem</h3>

              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Tautan Gambar QRIS Toko (Utama)</label>
                <input
                  type="text"
                  required
                  value={qrisInput}
                  onChange={(e) => setQrisInput(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Biaya Ongkos Kirim (Flat)</label>
                  <input
                    type="number"
                    required
                    value={deliveryFeeInput}
                    onChange={(e) => setDeliveryFeeInput(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none mt-1"
                  />
                </div>
                <div className="col-span-1 md:col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                    Skema Biaya Layanan Bertingkat (Otomatis)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] text-slate-600">
                    <div className="bg-white p-2 rounded-lg border border-slate-200 text-center">
                      <p className="text-[10px] text-slate-400 font-semibold">Rp0 - Rp100rb</p>
                      <p className="font-bold text-emerald-600 mt-0.5">Rp 2.000</p>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200 text-center">
                      <p className="text-[10px] text-slate-400 font-semibold">&gt;Rp100rb - Rp300rb</p>
                      <p className="font-bold text-emerald-600 mt-0.5">Rp 3.000</p>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200 text-center">
                      <p className="text-[10px] text-slate-400 font-semibold">&gt;Rp300rb - Rp500rb</p>
                      <p className="font-bold text-emerald-600 mt-0.5">Rp 4.000</p>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200 text-center">
                      <p className="text-[10px] text-slate-400 font-semibold">&gt;Rp500rb - Rp700rb</p>
                      <p className="font-bold text-emerald-600 mt-0.5">Rp 5.000</p>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200 text-center col-span-2 sm:col-span-1">
                      <p className="text-[10px] text-slate-400 font-semibold">&gt;Rp700rb - Rp2jt</p>
                      <p className="font-bold text-emerald-600 mt-0.5">Rp 10.000</p>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all shadow-md text-xs mt-2"
              >
                Simpan Parameter Konfigurasi
              </button>
            </form>
            
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4 mt-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-display font-bold text-base text-slate-800">Pusat Tautan & WhatsApp Portal</h3>
                <p className="text-slate-500 text-[11px] mt-1 leading-relaxed">
                  Bagikan tautan mandiri di bawah ini untuk masing-masing pihak melalui WhatsApp. Ketika mereka membukanya, mereka akan diarahkan secara eksklusif ke portal mereka tanpa bisa mengakses menu portal lainnya.
                </p>
              </div>

              {/* General Links */}
              <div className="flex flex-col gap-2 bg-slate-50 p-3 rounded-xl border border-slate-150">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tautan Utama</span>
                
                <div className="flex flex-col gap-2 mt-1">
                  <div className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-200 text-xs">
                    <div>
                      <p className="font-bold text-slate-700">Portal Customer (Pembeli)</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{window.location.origin}/</p>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/`);
                        alert('Tautan Customer disalin!');
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] px-2.5 py-1.5 rounded-md transition-all cursor-pointer"
                    >
                      Salin
                    </button>
                  </div>

                  <div className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-200 text-xs">
                    <div>
                      <p className="font-bold text-slate-700">Portal Admin (Sistem)</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{window.location.origin}/?role=admin</p>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/?role=admin`);
                        alert('Tautan Admin disalin!');
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] px-2.5 py-1.5 rounded-md transition-all cursor-pointer"
                    >
                      Salin
                    </button>
                  </div>
                </div>
              </div>

              {/* Merchant Portal Links */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">Tautan Owner Merchant ({merchants.length})</span>
                <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
                  {merchants.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">Belum ada merchant terdaftar.</p>
                  ) : (
                    merchants.map((m) => {
                      const link = `${window.location.origin}/?role=merchant&id=${m.id}`;
                      return (
                        <div key={m.id} className="flex justify-between items-center bg-slate-50 p-2 rounded-xl border border-slate-150 text-xs">
                          <div className="truncate pr-2">
                            <p className="font-bold text-slate-800 truncate">{m.name}</p>
                            <p className="text-[9px] text-slate-400 truncate">Owner: {m.ownerName}</p>
                          </div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(link);
                              alert(`Tautan untuk ${m.name} berhasil disalin!`);
                            }}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-md transition-all flex-shrink-0 cursor-pointer"
                          >
                            Salin Link WA
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Driver Portal Links */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Tautan Kurir / Driver ({drivers.length})</span>
                <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
                  {drivers.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">Belum ada driver terdaftar.</p>
                  ) : (
                    drivers.map((d) => {
                      const link = `${window.location.origin}/?role=driver&id=${d.id}`;
                      return (
                        <div key={d.id} className="flex justify-between items-center bg-slate-50 p-2 rounded-xl border border-slate-150 text-xs">
                          <div className="truncate pr-2">
                            <p className="font-bold text-slate-800 truncate">{d.name}</p>
                            <p className="text-[9px] text-slate-400 truncate">Tlp: {d.phone}</p>
                          </div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(link);
                              alert(`Tautan untuk Kurir ${d.name} berhasil disalin!`);
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-md transition-all flex-shrink-0 cursor-pointer"
                          >
                            Salin Link WA
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* 7. TABS: PARTNER REGISTRATIONS */}
        {activeTab === 'mitra' && (
          <div className="flex flex-col gap-4 pb-12">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2.5">
              <h3 className="font-display font-extrabold text-lg text-slate-800 tracking-tight">Pendaftaran Mitra Baru</h3>
              <span className="bg-rose-500 text-white font-extrabold text-[10px] px-2.5 py-0.5 rounded-full">
                {partnerRegistrations.filter(r => r.status === 'PENDING').length} Baru
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {partnerRegistrations.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400">
                  <UserPlus className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs">Belum ada pendaftaran kemitraan baru.</p>
                </div>
              ) : (
                partnerRegistrations.map((reg) => (
                  <div key={reg.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                        reg.type === 'MERCHANT' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {reg.type === 'MERCHANT' ? '🍲 Toko / UMKM' : '🏍️ Kurir / Driver'}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                        reg.status === 'PENDING' 
                          ? 'bg-slate-100 text-slate-600 animate-pulse' 
                          : reg.status === 'APPROVED' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : 'bg-red-100 text-red-800'
                      }`}>
                        {reg.status}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1 border-b border-slate-100 pb-2">
                      <h4 className="font-bold text-slate-800 text-sm">{reg.name}</h4>
                      <p className="text-[11px] text-slate-500 font-medium">WhatsApp: {reg.phone}</p>
                      <p className="text-[11px] text-slate-500 font-medium">Email Portal: {reg.email}</p>
                      
                      {reg.type === 'MERCHANT' ? (
                        <div className="mt-1.5 bg-slate-50 border border-slate-100 rounded-lg p-2 text-[10px] text-slate-600 flex flex-col gap-0.5">
                          <span className="font-bold text-slate-800">Toko: {reg.storeName}</span>
                          <span>Kategori: {reg.category}</span>
                          <span>Alamat: {reg.storeAddress}</span>
                          {reg.latitude && reg.longitude && (
                            <span className="text-slate-500 font-mono">Koordinat: {reg.latitude.toFixed(6)}, {reg.longitude.toFixed(6)}</span>
                          )}
                          
                          {/* Document Previews */}
                          {(reg.businessPhoto || reg.idPhoto || reg.contractPhoto) && (
                            <div className="mt-2 pt-2 border-t border-slate-200/60 flex gap-2 overflow-x-auto">
                              {reg.businessPhoto && (
                                <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                                  <span className="text-[8px] font-bold text-slate-400 uppercase">Tempat Usaha</span>
                                  <img 
                                    src={reg.businessPhoto} 
                                    alt="Tempat Usaha" 
                                    className="w-12 h-12 object-cover rounded-lg border border-slate-200 cursor-zoom-in hover:opacity-85"
                                    onClick={() => {
                                      const w = window.open();
                                      w?.document.write(`<img src="${reg.businessPhoto}" style="max-width:100%; max-height:100vh; display:block; margin:auto;"/>`);
                                    }}
                                  />
                                </div>
                              )}
                              {reg.idPhoto && (
                                <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                                  <span className="text-[8px] font-bold text-slate-400 uppercase">Foto KTP / ID</span>
                                  <img 
                                    src={reg.idPhoto} 
                                    alt="Foto KTP" 
                                    className="w-12 h-12 object-cover rounded-lg border border-slate-200 cursor-zoom-in hover:opacity-85"
                                    onClick={() => {
                                      const w = window.open();
                                      w?.document.write(`<img src="${reg.idPhoto}" style="max-width:100%; max-height:100vh; display:block; margin:auto;"/>`);
                                    }}
                                  />
                                </div>
                              )}
                              {reg.contractPhoto && (
                                <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                                  <span className="text-[8px] font-bold text-slate-400 uppercase">Kontrak TTD</span>
                                  <img 
                                    src={reg.contractPhoto} 
                                    alt="Kontrak TTD" 
                                    className="w-12 h-12 object-cover rounded-lg border border-slate-200 cursor-zoom-in hover:opacity-85"
                                    onClick={() => {
                                      const w = window.open();
                                      w?.document.write(`<img src="${reg.contractPhoto}" style="max-width:100%; max-height:100vh; display:block; margin:auto;"/>`);
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-1.5 bg-slate-50 border border-slate-100 rounded-lg p-2 text-[10px] text-slate-600 flex flex-col gap-0.5">
                          <span className="font-bold text-slate-800">Detail Kendaraan: {reg.vehicleNumber}</span>
                          <span>Wilayah Operasional: {reg.operatingArea}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-slate-400">
                      <span>{new Date(reg.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      {reg.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRejectPartner(reg.id)}
                            className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                          >
                            Tolak
                          </button>
                          <button
                            onClick={() => handleApprovePartner(reg.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-1.5 rounded-lg cursor-pointer transition-all flex items-center gap-1 shadow-sm shadow-emerald-600/10"
                          >
                            Setujui & Buat Akun
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 7. TABS: LICENSES MANAGEMENT */}
        {activeTab === 'licenses' && (
          <div className="flex flex-col gap-4 pb-12 animate-fadeIn">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2.5">
              <h3 className="font-display font-extrabold text-base text-slate-800 tracking-tight">Kunci Lisensi Kontrak Premium</h3>
              <span className="bg-amber-500 text-white font-bold text-[10px] px-2.5 py-0.5 rounded-full">
                {licenses.length} Kunci
              </span>
            </div>

            {/* Generate form */}
            <form onSubmit={handleGenerateLicense} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
              <h4 className="font-display font-bold text-xs text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <Award className="w-4 h-4 text-rose-500" /> Generate Lisensi Kontrak Baru
              </h4>
              <p className="text-[10px] text-slate-400">Lisensi kontrak sewa premium digunakan untuk mengaktifkan sistem pre-order dan fitur minimal pembelanjaan bagi toko.</p>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Kode Lisensi</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Contoh: TUMPANG-PREM-FITRI-KUE"
                    value={newLicenseKey}
                    onChange={(e) => setNewLicenseKey(e.target.value.toUpperCase())}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:bg-white focus:border-rose-500 uppercase"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateRandomKey}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] px-3 py-1.5 rounded-lg border border-slate-250 transition-all"
                  >
                    Acak Kode
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Masa Aktif Lisensi</label>
                <select
                  value={newLicenseDuration}
                  onChange={(e) => setNewLicenseDuration(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:outline-none focus:bg-white"
                >
                  <option value={30}>30 Hari (1 Bulan)</option>
                  <option value={90}>90 Hari (3 Bulan)</option>
                  <option value={180}>180 Hari (6 Bulan)</option>
                  <option value={365}>365 Hari (1 Tahun)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={generatingLicense}
                className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5"
              >
                <Award className="w-4 h-4 text-rose-300" />
                {generatingLicense ? 'Membuat...' : 'Buat & Daftarkan Lisensi'}
              </button>
            </form>

            {/* List of licenses */}
            <div className="flex flex-col gap-3">
              <h4 className="font-display font-bold text-xs text-slate-700 uppercase tracking-wider">Daftar Kode Lisensi Aktif</h4>
              {licenses.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-slate-400">
                  <Award className="w-8 h-8 text-slate-200 mx-auto mb-1.5" />
                  <p className="text-[11px]">Belum ada kunci lisensi kontrak yang terdaftar.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {licenses.map((lic) => (
                    <div key={lic.key} className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-1 shadow-sm">
                      <div className="flex justify-between items-center">
                        <span className="font-mono font-bold text-slate-800 text-xs">{lic.key}</span>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                          lic.redeemed 
                            ? 'bg-red-50 text-red-700 border border-red-200/40' 
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200/40'
                        }`}>
                          {lic.redeemed ? 'Terpakai' : 'Aktif'}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                        <span>Durasi: {lic.durationDays} hari</span>
                        <span>Dibuat: {new Date(lic.createdAt).toLocaleDateString('id-ID')}</span>
                      </div>
                      {lic.redeemed && (
                        <div className="text-[9px] bg-slate-50 border border-slate-100 rounded p-1.5 text-slate-500 font-medium mt-1 flex flex-col">
                          <span>Diredeem oleh: <span className="font-bold text-slate-700 truncate">{lic.redeemedByMerchantName || lic.redeemedByMerchantId}</span></span>
                          <span>Tanggal: {new Date(lic.redeemedAt).toLocaleDateString('id-ID')}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* Footer Nav Bar */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-slate-200 flex justify-around p-2 z-50 shadow-lg">
        <button
          onClick={() => setActiveTab('verify')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold ${
            activeTab === 'verify' ? 'text-rose-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <CheckSquare className="w-5 h-5" />
          <span>Verifikasi</span>
          {pendingVerifications.length > 0 && (
            <span className="absolute top-[3px] right-[290px] bg-rose-500 text-white font-extrabold text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white animate-pulse">
              {pendingVerifications.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold ${
            activeTab === 'orders' ? 'text-rose-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <ClipboardList className="w-5 h-5" />
          <span>Orders</span>
        </button>

        <button
          onClick={() => setActiveTab('merchants')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold ${
            activeTab === 'merchants' ? 'text-rose-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Store className="w-5 h-5" />
          <span>Merchants</span>
        </button>

        <button
          onClick={() => setActiveTab('drivers')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold ${
            activeTab === 'drivers' ? 'text-rose-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Users className="w-5 h-5" />
          <span>Drivers</span>
        </button>

        <button
          onClick={() => setActiveTab('settlements')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold ${
            activeTab === 'settlements' ? 'text-rose-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <DollarSign className="w-5 h-5" />
          <span>Settlements</span>
        </button>

        <button
          onClick={() => setActiveTab('mitra')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold relative ${
            activeTab === 'mitra' ? 'text-rose-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <UserPlus className="w-5 h-5" />
          <span>Mitra</span>
          {partnerRegistrations.filter(r => r.status === 'PENDING').length > 0 && (
            <span className="absolute top-[2px] right-[4px] bg-rose-500 text-white font-extrabold text-[8px] w-3 h-3 rounded-full flex items-center justify-center border border-white animate-pulse">
              {partnerRegistrations.filter(r => r.status === 'PENDING').length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('licenses')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold ${
            activeTab === 'licenses' ? 'text-rose-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Award className="w-5 h-5" />
          <span>Lisensi</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold ${
            activeTab === 'settings' ? 'text-rose-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span>Settings</span>
        </button>
      </nav>
    </div>
  );
}
