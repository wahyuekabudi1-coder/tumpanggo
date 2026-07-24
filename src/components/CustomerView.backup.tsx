import React, { useState, useEffect, useRef } from 'react';
import { 
  Merchant, MenuItem, Category, Order, OrderItem, OrderStatus, SystemConfig 
} from '../types.ts';
import MapPicker from './MapPicker.tsx';
import Logo from './Logo.tsx';
import { compressImage, compressBase64 } from '../utils/imageCompressor.ts';
import { 
  Search, ShoppingBag, Store, MapPin, Clock, Star, ArrowLeft, Plus, Minus, Trash2, 
  CheckCircle2, ArrowRight, Share2, Phone, Calendar, ClipboardList, RefreshCw, X,
  Download, Smartphone, Info, Home, UserPlus, Bike, Users, XCircle, Key, ShieldCheck
} from 'lucide-react';

interface CustomerViewProps {
  onSwitchView?: (view: string) => void;
  systemConfig: SystemConfig;
  onOpenAuthModal?: () => void;
  onSelectRole?: (role: 'CUSTOMER' | 'MERCHANT' | 'DRIVER' | 'ADMIN', id?: string) => void;
  onInstantDashboard?: (role: 'ADMIN' | 'MERCHANT' | 'DRIVER') => void;
}

export const CULINARY_CATEGORIES = [
  { id: 'all', name: 'Semua', emoji: '🍔' },
  { id: 'bakso_mie', name: 'Bakso & Mie', emoji: '🍜' },
  { id: 'nasi_lauk', name: 'Nasi & Lauk', emoji: '🍛' },
  { id: 'sate_bakaran', name: 'Sate & Bakaran', emoji: '🍢' },
  { id: 'cemilan', name: 'Cemilan & Jajanan', emoji: '🍘' },
  { id: 'minuman', name: 'Minuman Segar', emoji: '🥤' }
];

export default function CustomerView({ onSwitchView, systemConfig, onOpenAuthModal, onSelectRole, onInstantDashboard }: CustomerViewProps) {
  // Navigation / Tab state
  // 'home' | 'merchant-detail' | 'cart' | 'checkout' | 'payment' | 'tracking' | 'history'
  const [activeTab, setActiveTab] = useState<string>('home');
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [selectedMerchantMenu, setSelectedMerchantMenu] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedMerchantCategory, setSelectedMerchantCategory] = useState<string>('all');
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Cart state
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [cartMerchantId, setCartMerchantId] = useState<string | null>(null);
  const [cartMerchant, setCartMerchant] = useState<Merchant | null>(null);
  const [showClearCartConfirm, setShowClearCartConfirm] = useState<{ pendingItem: MenuItem; pendingMerchant: Merchant } | null>(null);

  // Checkout form state
  const [checkoutName, setCheckoutName] = useState('');
  const [checkoutPhone, setCheckoutPhone] = useState('');
  const [checkoutAddress, setCheckoutAddress] = useState('');
  const [checkoutDetails, setCheckoutDetails] = useState('');
  const [checkoutLandmark, setCheckoutLandmark] = useState('');
  const [checkoutLat, setCheckoutLat] = useState(-7.9482);
  const [checkoutLng, setCheckoutLng] = useState(112.7612);
  const [preOrderDate, setPreOrderDate] = useState('');
  const [checkoutDeliveryType, setCheckoutDeliveryType] = useState<'INSTANT' | 'PREORDER'>('INSTANT');

  useEffect(() => {
    if (cartMerchant) {
      if (cartMerchant.preOrderOnly) {
        setCheckoutDeliveryType('PREORDER');
      } else {
        setCheckoutDeliveryType('INSTANT');
      }
    } else if (selectedMerchant) {
      if (selectedMerchant.preOrderOnly) {
        setCheckoutDeliveryType('PREORDER');
      } else {
        setCheckoutDeliveryType('INSTANT');
      }
    }
  }, [cartMerchant, selectedMerchant]);

  // Helper to determine the pre-order minimum quantity for a cart item or menu item
  const getMenuItemPreOrderMin = (item: { menuItemId?: string; id?: string; preOrderMinAmount?: number }) => {
    const isPreOrder = cartMerchant?.preOrderOnly || checkoutDeliveryType === 'PREORDER';
    if (!isPreOrder) return 1;

    const itemId = item.menuItemId || item.id;
    const menuItem = selectedMerchantMenu.find(m => m.id === itemId);
    const itemMin = menuItem?.preOrderMinAmount ?? item.preOrderMinAmount;

    const merchantMin = cartMerchant?.preOrderMinAmount;

    return Number(itemMin) || Number(merchantMin) || 1;
  };

  // Active Order / Tracking state
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<string>('');
  const [paymentProofUrl, setPaymentProofUrl] = useState('');
  const [paymentProofFile, setPaymentProofFile] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  // History search state
  const [historyPhone, setHistoryPhone] = useState('');
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historySearched, setHistorySearched] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Partner registration states
  const [partnerName, setPartnerName] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [partnerType, setPartnerType] = useState<'MERCHANT' | 'DRIVER'>('MERCHANT');
  const [partnerStoreName, setPartnerStoreName] = useState('');
  const [partnerStoreAddress, setPartnerStoreAddress] = useState('');
  const [partnerCategory, setPartnerCategory] = useState('Bakso & Mie');
  const [partnerVehicle, setPartnerVehicle] = useState('');
  const [partnerArea, setPartnerArea] = useState('');
  const [partnerSubmitLoading, setPartnerSubmitLoading] = useState(false);
  const [partnerSubmitSuccess, setPartnerSubmitSuccess] = useState(false);

  // Active registration tracking states
  const [submittedPartnerId, setSubmittedPartnerId] = useState<string | null>(
    localStorage.getItem('tumpang_submitted_partner_id')
  );
  const [submittedPartnerEmail, setSubmittedPartnerEmail] = useState<string | null>(
    localStorage.getItem('tumpang_submitted_partner_email')
  );
  const [activeRegistration, setActiveRegistration] = useState<any>(null);
  const [checkingRegistration, setCheckingRegistration] = useState(false);

  // Fetch partner registration status
  const checkMyPartnerRegistration = async () => {
    const id = localStorage.getItem('tumpang_submitted_partner_id');
    const email = localStorage.getItem('tumpang_submitted_partner_email');
    if (!id && !email) {
      setActiveRegistration(null);
      return;
    }
    setCheckingRegistration(true);
    try {
      const res = await fetch('/api/partner-registrations');
      if (res.ok) {
        const data = await res.json();
        const match = data.find((r: any) => r.id === id || r.email?.trim().toLowerCase() === email?.trim().toLowerCase());
        if (match) {
          setActiveRegistration(match);
        } else {
          setActiveRegistration(null);
        }
      }
    } catch (e) {
      console.error('Error checking partner registration:', e);
    } finally {
      setCheckingRegistration(false);
    }
  };

  const resetPartnerForm = () => {
    // Clear local storage tracking
    localStorage.removeItem('tumpang_submitted_partner_id');
    localStorage.removeItem('tumpang_submitted_partner_email');
    
    // Clear tracking states
    setSubmittedPartnerId(null);
    setSubmittedPartnerEmail(null);
    setActiveRegistration(null);
    setPartnerSubmitSuccess(false);
    
    // Reset form inputs
    setPartnerName('');
    setPartnerPhone('');
    setPartnerEmail('');
    setPartnerType('MERCHANT');
    setPartnerStoreName('');
    setPartnerStoreAddress('');
    setPartnerCategory('Bakso & Mie');
    setPartnerVehicle('');
    setPartnerArea('');
    
    // Reset steps and files
    setPartnerStep(1);
    setBusinessPhoto('');
    setIdPhoto('');
    setContractPhoto('');
    setSignatureSigned(false);
    setPartnerTermsAccepted(false);
  };

  useEffect(() => {
    if (activeTab === 'partner-register') {
      checkMyPartnerRegistration();
    }
  }, [activeTab]);

  // High-fidelity Multi-step and Attachment states
  const [partnerStep, setPartnerStep] = useState<number>(1);
  const [businessPhoto, setBusinessPhoto] = useState<string>('');
  const [idPhoto, setIdPhoto] = useState<string>('');
  const [contractPhoto, setContractPhoto] = useState<string>('');
  const [partnerLat, setPartnerLat] = useState<number>(-7.9482);
  const [partnerLng, setPartnerLng] = useState<number>(112.7612);
  const [signatureSigned, setSignatureSigned] = useState<boolean>(false);
  const [partnerTermsAccepted, setPartnerTermsAccepted] = useState<boolean>(false);

  // Canvas Drawing Signature logic
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a'; // Slate-900
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = async () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
      try {
        const compressed = await compressBase64(dataUrl, 600, 600, 0.5);
        setContractPhoto(compressed);
      } catch (e) {
        setContractPhoto(dataUrl);
      }
      setSignatureSigned(true);
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setContractPhoto('');
        setSignatureSigned(false);
      }
    }
  };

  const handlePartnerFileChange = async (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 800, 800, 0.6);
        setter(compressed);
      } catch (err) {
        console.error('Error compressing file:', err);
        // Fallback to standard reader
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setter(reader.result);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handlePartnerRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (partnerType === 'MERCHANT') {
      if (!partnerName || !partnerPhone || !partnerEmail) {
        alert('Mohon lengkapi Nama, No WhatsApp, dan Email Anda.');
        return;
      }
      if (!partnerStoreName || !partnerStoreAddress) {
        alert('Mohon lengkapi Nama Toko dan Alamat Toko Anda.');
        return;
      }
    } else {
      // Driver mode
      if (!partnerName || !partnerPhone || !partnerVehicle || !partnerArea) {
        alert('Mohon lengkapi Nama, No WhatsApp, Nomor Plat, dan Wilayah Operasional Anda.');
        return;
      }
    }
    if (!partnerTermsAccepted) {
      alert('Anda harus menyetujui Syarat dan Ketentuan Kemitraan Tumpang Food terlebih dahulu.');
      return;
    }

    setPartnerSubmitLoading(true);
    try {
      const payload: any = {
        name: partnerName,
        phone: partnerPhone,
        type: partnerType,
        status: 'PENDING',
        latitude: partnerLat,
        longitude: partnerLng,
        businessPhoto: businessPhoto,
        idPhoto: idPhoto,
        contractPhoto: contractPhoto,
      };

      if (partnerType === 'MERCHANT') {
        payload.email = partnerEmail.trim().toLowerCase();
        payload.storeName = partnerStoreName;
        payload.storeAddress = partnerStoreAddress;
        payload.category = partnerCategory;
      } else {
        payload.vehicleNumber = partnerVehicle;
        payload.operatingArea = partnerArea;
        // Optional: save empty string for email
        payload.email = '';
      }

      const res = await fetch('/api/partner-registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          localStorage.setItem('tumpang_submitted_partner_id', data.id);
          localStorage.setItem('tumpang_submitted_partner_email', payload.email || payload.phone);
          setSubmittedPartnerId(data.id);
          setSubmittedPartnerEmail(payload.email || payload.phone);
          // Set active registration immediately
          setActiveRegistration(data);
        }
        setPartnerSubmitSuccess(true);
        // Clear form
        setPartnerName('');
        setPartnerPhone('');
        setPartnerEmail('');
        setPartnerStoreName('');
        setPartnerStoreAddress('');
        setPartnerVehicle('');
        setPartnerArea('');
        setBusinessPhoto('');
        setIdPhoto('');
        setContractPhoto('');
        setSignatureSigned(false);
        setPartnerTermsAccepted(false);
        setPartnerStep(1);
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal mengirimkan pendaftaran.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat mengirim pendaftaran.');
    } finally {
      setPartnerSubmitLoading(false);
    }
  };

  // PWA states and handlers
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);
  const [showPWAInfo, setShowPWAInfo] = useState(false);
  const [dismissedPrompt, setDismissedPrompt] = useState(() => {
    return localStorage.getItem('tumpang_pwa_dismissed') === 'true';
  });

  useEffect(() => {
    // Check if already running in standalone mode (installed)
    const checkStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                           (window.navigator as any).standalone === true;
    setIsStandalone(checkStandalone);

    // Check if iOS
    const checkiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(checkiOS);

    // Event listener for Android/Chrome beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Event listener for successful install
    const handleAppInstalled = () => {
      console.log('App was successfully installed');
      setIsInstallable(false);
      setDeferredPrompt(null);
      setIsStandalone(true);
      setInstallSuccess(true);
      setTimeout(() => setInstallSuccess(false), 6000);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      setDeferredPrompt(null);
      setIsInstallable(false);
    } else if (isIOS) {
      setShowIOSPrompt(true);
    } else {
      // Manual/Fallback explanation
      setShowPWAInfo(true);
    }
  };

  const dismissInstallPrompt = () => {
    setDismissedPrompt(true);
    localStorage.setItem('tumpang_pwa_dismissed', 'true');
  };

  // Fetch initial data
  useEffect(() => {
    fetchMerchants();
  }, []);

  const fetchMerchants = async () => {
    try {
      const res = await fetch('/api/merchants');
      const data = await res.json();
      setMerchants(data);
    } catch (e) {
      console.error('Error fetching merchants:', e);
    }
  };

  const loadMerchantDetail = async (merchant: Merchant) => {
    setSelectedMerchant(merchant);
    try {
      // Get menu
      const menuRes = await fetch(`/api/merchants/${merchant.id}/menu`);
      const menuData = await menuRes.json();
      setSelectedMerchantMenu(menuData);

      // Get categories
      const catRes = await fetch(`/api/merchants/${merchant.id}/categories`);
      const catData = await catRes.json();
      setCategories(catData);
      
      setSelectedCategory('all');
      setActiveTab('merchant-detail');
    } catch (e) {
      console.error('Error loading merchant detail:', e);
    }
  };

  // Cart operations
  const addToCart = (item: MenuItem, merchant: Merchant) => {
    if (!merchant.active) {
      alert('Toko sedang tutup. Anda tidak dapat memesan dari toko yang sedang tutup.');
      return;
    }

    if (cartMerchantId && cartMerchantId !== merchant.id) {
      setShowClearCartConfirm({ pendingItem: item, pendingMerchant: merchant });
      return;
    }

    let targetDeliveryType = checkoutDeliveryType;
    if (merchant.isPremium && item.allowInstant === false && checkoutDeliveryType === 'INSTANT') {
      setCheckoutDeliveryType('PREORDER');
      targetDeliveryType = 'PREORDER';
    }

    const isPreOrder = merchant.preOrderOnly || (merchant.allowInstantAndPreOrder && targetDeliveryType === 'PREORDER');
    const itemMinQty = isPreOrder ? (Number(item.preOrderMinAmount) || Number(merchant.preOrderMinAmount) || 1) : 1;
    const initialQty = itemMinQty > 0 ? itemMinQty : 1;

    setCart(prev => {
      const existing = prev.find(i => i.menuItemId === item.id);
      if (existing) {
        const currentQty = Number(existing.quantity || 0);
        const newQty = currentQty < itemMinQty ? itemMinQty : currentQty + 1;
        return prev.map(i => i.menuItemId === item.id ? { ...i, quantity: newQty, preOrderMinAmount: itemMinQty, allowInstant: item.allowInstant } : i);
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: initialQty, preOrderMinAmount: itemMinQty, allowInstant: item.allowInstant }];
    });
    setCartMerchantId(merchant.id);
    setCartMerchant(merchant);
  };

  const handleClearCartAndAdd = () => {
    if (!showClearCartConfirm) return;
    const { pendingItem, pendingMerchant } = showClearCartConfirm;
    
    let targetDeliveryType = checkoutDeliveryType;
    if (pendingMerchant.isPremium && pendingItem.allowInstant === false && checkoutDeliveryType === 'INSTANT') {
      setCheckoutDeliveryType('PREORDER');
      targetDeliveryType = 'PREORDER';
    }

    const isPreOrder = pendingMerchant.preOrderOnly || (pendingMerchant.allowInstantAndPreOrder && targetDeliveryType === 'PREORDER');
    const itemMinQty = isPreOrder ? (Number(pendingItem.preOrderMinAmount) || Number(pendingMerchant.preOrderMinAmount) || 1) : 1;
    const initialQty = itemMinQty > 0 ? itemMinQty : 1;

    setCart([{ menuItemId: pendingItem.id, name: pendingItem.name, price: pendingItem.price, quantity: initialQty, preOrderMinAmount: itemMinQty, allowInstant: pendingItem.allowInstant }]);
    setCartMerchantId(pendingMerchant.id);
    setCartMerchant(pendingMerchant);
    setShowClearCartConfirm(null);
  };

  const updateCartQuantity = (menuItemId: string, change: number) => {
    setCart(prev => {
      const isPreOrder = cartMerchant?.preOrderOnly || (cartMerchant?.allowInstantAndPreOrder && checkoutDeliveryType === 'PREORDER');
      
      const updated = prev.map(i => {
        if (i.menuItemId === menuItemId) {
          const itemMinQty = isPreOrder ? (Number(i.preOrderMinAmount) || Number(cartMerchant?.preOrderMinAmount) || 1) : 1;
          const targetMinQty = itemMinQty > 0 ? itemMinQty : 1;
          
          const qty = i.quantity + change;
          
          if (change < 0 && qty < targetMinQty) {
            return null; // Directly drops to 0 (removes from cart)
          }
          
          return qty > 0 ? { ...i, quantity: qty } : null;
        }
        return i;
      }).filter(Boolean) as OrderItem[];

      if (updated.length === 0) {
        setCartMerchantId(null);
        setCartMerchant(null);
      }
      return updated;
    });
  };

  const removeFromCart = (menuItemId: string) => {
    setCart(prev => {
      const updated = prev.filter(i => i.menuItemId !== menuItemId);
      if (updated.length === 0) {
        setCartMerchantId(null);
        setCartMerchant(null);
      }
      return updated;
    });
  };

  // Calculations
  const getSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const getDeliveryFee = () => {
    // 5000 flat standard, or configured
    return systemConfig?.defaultDeliveryFee || 5000;
  };

  const getServiceFee = () => {
    return systemConfig?.serviceFee || 2000;
  };

  // Submit checkout
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutName || !checkoutPhone || !checkoutAddress) {
      alert('Mohon lengkapi Nama, No WhatsApp, dan Alamat Pengantaran');
      return;
    }

    if (cart.length === 0 || !cartMerchantId) {
      alert('Keranjang Anda kosong');
      return;
    }

    const isPreOrder = cartMerchant?.preOrderOnly || checkoutDeliveryType === 'PREORDER';

    // Validate that instant delivery does not contain pre-order-only items
    if (!isPreOrder && cartMerchant?.isPremium) {
      const nonInstantItems = cart.filter(item => item.allowInstant === false);
      if (nonInstantItems.length > 0) {
        const itemNames = nonInstantItems.map(item => `- ${item.name}`).join('\n');
        alert(`Beberapa item dalam keranjang Anda hanya bisa dipesan melalui Pre-Order (tidak bisa dipesan langsung):\n${itemNames}\n\nSilakan ubah metode pemesanan ke Pre-Order atau hapus item tersebut.`);
        return;
      }
    }

    // Pre-order Validation for Premium/Pre-Order merchants
    if (isPreOrder) {
      if (!preOrderDate) {
        alert('Mohon tentukan Tanggal Pengiriman Terlebih Dahulu untuk pesanan Pre-Order.');
        return;
      }

      // Check item-specific minimums
      const invalidItems = cart.filter(item => {
        const min = getMenuItemPreOrderMin(item);
        return item.quantity < min;
      });

      if (invalidItems.length > 0) {
        const itemAlerts = invalidItems.map(item => `- ${item.name} (baru ${item.quantity} dari minimal ${getMenuItemPreOrderMin(item)} porsi)`).join('\n');
        alert(`Beberapa item dalam keranjang Anda belum memenuhi batas minimal order:\n${itemAlerts}\n\nMohon sesuaikan jumlah pesanan Anda.`);
        return;
      }

      // Check merchant-level total minimum order quantity (porsi/item)
      const minQty = Number(cartMerchant?.preOrderMinAmount || 0);
      const totalQty = cart.reduce((sum, item) => Number(sum) + Number(item.quantity), 0);
      if (totalQty < minQty) {
        alert(`Minimal total pembelian untuk pesanan Pre-Order ini adalah ${minQty} porsi. Keranjang belanja Anda baru berisi ${totalQty} porsi. Silakan tambah jumlah item.`);
        return;
      }

      // Check lead notice days
      const selected = new Date(preOrderDate);
      selected.setHours(0,0,0,0);
      const minDate = new Date();
      minDate.setDate(minDate.getDate() + (Number(cartMerchant?.preOrderLeadDays) || 1));
      minDate.setHours(0,0,0,0);

      if (selected < minDate) {
        const leadDays = Number(cartMerchant?.preOrderLeadDays) || 1;
        alert(`Pesanan Pre-Order memerlukan persiapan minimal ${leadDays} hari. Tanggal pengiriman terdekat yang diperbolehkan adalah ${minDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}.`);
        return;
      }
    }

    const payload = {
      customerName: checkoutName,
      customerPhone: checkoutPhone,
      deliveryAddress: checkoutAddress,
      deliveryDetails: checkoutDetails,
      landmark: checkoutLandmark,
      latitude: checkoutLat,
      longitude: checkoutLng,
      items: cart,
      merchantId: cartMerchantId,
      subtotal: getSubtotal(),
      deliveryFee: isPreOrder ? 0 : getDeliveryFee(),
      serviceFee: getServiceFee(),
      preOrderDate: isPreOrder ? preOrderDate : undefined
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const order: Order = await res.json();
      
      if (res.ok) {
        setActiveOrder(order);
        setTrackingOrderId(order.id);
        // Clear cart
        setCart([]);
        setCartMerchantId(null);
        setCartMerchant(null);
        setPreOrderDate(''); // Reset pre-order date state
        setActiveTab('payment');
      } else {
        alert(order.cancelReason || 'Gagal membuat pesanan');
      }
    } catch (e) {
      console.error('Checkout error:', e);
      alert('Terjadi kesalahan saat memproses pesanan.');
    }
  };

  // Handle proof upload (simulate)
  const handlePaymentProofUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const proof = paymentProofFile || paymentProofUrl;
    if (!proof) {
      alert('Silakan pilih file bukti pembayaran atau masukkan tautan gambar.');
      return;
    }

    if (!activeOrder) return;
    setUploadLoading(true);

    try {
      const res = await fetch(`/api/orders/${activeOrder.id}/upload-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentProof: proof })
      });
      const updatedOrder = await res.json();
      if (res.ok) {
        setActiveOrder(updatedOrder);
        alert('Bukti pembayaran berhasil diunggah. Menunggu verifikasi admin.');
      } else {
        alert('Gagal mengunggah bukti pembayaran.');
      }
    } catch (err) {
      console.error('Error uploading payment:', err);
    } finally {
      setUploadLoading(false);
    }
  };

  // Handle file selection and convert to Base64
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 800, 800, 0.6);
        setPaymentProofFile(compressed);
      } catch (err) {
        console.error('Error compressing payment proof:', err);
        // Fallback
        const reader = new FileReader();
        reader.onloadend = () => {
          setPaymentProofFile(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  // Live order refresh
  const refreshActiveOrder = async () => {
    if (!trackingOrderId) return;
    try {
      const res = await fetch(`/api/orders/${trackingOrderId}`);
      if (res.ok) {
        const order = await res.json();
        setActiveOrder(order);
      }
    } catch (e) {
      console.error('Error refreshing order:', e);
    }
  };

  // Search History
  const searchHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!historyPhone) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/orders/customer/${historyPhone}`);
      const data = await res.json();
      setHistoryOrders(data);
      setHistorySearched(true);
    } catch (err) {
      console.error('History fetch error:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const getMerchantCategory = (m: Merchant): string => {
    if (m.category) return m.category;
    const name = m.name.toLowerCase();
    if (name.includes('bakso') || name.includes('mie') || name.includes('pangsit')) {
      return 'Bakso & Mie';
    }
    if (name.includes('sate') || name.includes('bakar')) {
      return 'Sate & Bakaran';
    }
    if (name.includes('nasi') || name.includes('warung') || name.includes('kedai') || name.includes('dapur')) {
      return 'Nasi & Lauk';
    }
    if (name.includes('es') || name.includes('kopi') || name.includes('jus') || name.includes('boba') || name.includes('teh')) {
      return 'Minuman Segar';
    }
    if (name.includes('martabak') || name.includes('snack') || name.includes('cemilan') || name.includes('roti') || name.includes('kue')) {
      return 'Cemilan & Jajanan';
    }
    // Fallback based on id
    if (m.id === 'm1') return 'Bakso & Mie';
    if (m.id === 'm2') return 'Sate & Bakaran';
    if (m.id === 'm3') return 'Nasi & Lauk';
    return 'Nasi & Lauk';
  };

  // Filter merchants by search query and category
  const filteredMerchants = merchants.filter(m => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = m.name.toLowerCase().includes(query) || m.description.toLowerCase().includes(query) || m.address.toLowerCase().includes(query);
    
    if (selectedMerchantCategory === 'all') {
      return matchesSearch;
    }
    
    const mCategory = getMerchantCategory(m);
    const selectedCatObj = CULINARY_CATEGORIES.find(c => c.id === selectedMerchantCategory);
    if (!selectedCatObj) return matchesSearch;
    
    return matchesSearch && mCategory === selectedCatObj.name;
  });

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen shadow-xl pb-24 relative font-sans">
      {/* Header */}
      <header className="bg-rose-500 text-white p-4 sticky top-0 z-50 shadow-md">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center">
              <Logo size={38} variant="white" />
            </div>
            <div className="flex flex-col">
              <span className="font-display font-bold text-lg tracking-tight leading-tight">Tumpang Food</span>
              <span className="text-[9px] text-rose-100 font-medium">Layanan Pesan Antar Kuliner Tumpang</span>
            </div>
          </div>
          {onOpenAuthModal ? (
            <button 
              onClick={onOpenAuthModal}
              className="text-[10px] bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-full font-bold border border-white/15 backdrop-blur-sm flex items-center gap-1 cursor-pointer transition-all active:scale-95 text-white"
            >
              🔑 Portal Demo
            </button>
          ) : (
            <div className="text-[10px] bg-white/20 px-2.5 py-1 rounded-full font-bold border border-white/15 backdrop-blur-sm">
              UMKM Lokal
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="p-4">
        {showClearCartConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-100">
              <h4 className="font-display font-bold text-lg text-slate-800">Ganti Toko?</h4>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                Keranjang Anda berisi menu dari <span className="font-semibold text-slate-800">{cartMerchant?.name}</span>. 
                Memasukkan menu dari <span className="font-semibold text-slate-800">{showClearCartConfirm.pendingMerchant.name}</span> akan mengosongkan keranjang sebelumnya.
              </p>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowClearCartConfirm(null)}
                  className="flex-1 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleClearCartAndAdd}
                  className="flex-1 py-2.5 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/20"
                >
                  Ganti & Tambah
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PWA Install Success Alert */}
        {installSuccess && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white font-semibold py-3.5 px-6 rounded-2xl shadow-xl z-[120] flex items-center gap-2.5 border border-emerald-500 text-xs w-[90%] max-w-sm animate-bounce">
            <CheckCircle2 className="w-5 h-5 text-white flex-shrink-0 animate-pulse" />
            <span>Aplikasi Tumpang Food berhasil dipasang di layar utama Anda! 🎉</span>
          </div>
        )}

        {/* iOS PWA Install Instruction Modal */}
        {showIOSPrompt && (
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[110] backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100">
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                  <Smartphone className="w-5 h-5" />
                </div>
                <button 
                  onClick={() => setShowIOSPrompt(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <h4 className="font-display font-bold text-base text-slate-800 mt-4">Pasang Tumpang Food di iPhone</h4>
              <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">
                Safari di iPhone tidak mendukung instalasi otomatis satu-klik, namun Anda bisa memasangnya secara manual dengan langkah mudah berikut:
              </p>

              <div className="space-y-3.5 mt-5 text-xs text-slate-700">
                <div className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold flex-shrink-0 text-[10px]">1</div>
                  <p className="leading-relaxed">Buka situs ini menggunakan browser <span className="font-bold text-slate-800">Safari</span> di iPhone Anda.</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold flex-shrink-0 text-[10px]">2</div>
                  <p className="leading-relaxed flex-1">Ketuk tombol <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] inline-flex items-center gap-1">Bagikan (Share) <Share2 className="w-3 h-3 text-blue-500" /></span> di bar navigasi Safari.</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold flex-shrink-0 text-[10px]">3</div>
                  <p className="leading-relaxed text-slate-700">Gulir ke bawah dan pilih menu <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">Tambahkan ke Layar Utama (Add to Home Screen)</span>.</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold flex-shrink-0 text-[10px]">4</div>
                  <p className="leading-relaxed">Ketuk <span className="font-bold text-rose-600">Tambah</span> di sudut kanan atas. Selesai! Aplikasi siap dibuka dari layar utama HP.</p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSPrompt(false)}
                className="w-full mt-6 py-2.5 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        )}

        {/* PWA Educational Information Modal */}
        {showPWAInfo && (
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[110] backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                  <Info className="w-5 h-5" />
                </div>
                <button 
                  onClick={() => setShowPWAInfo(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <h4 className="font-display font-bold text-base text-slate-800 mt-4">Apa itu Fitur Aplikasi (PWA)?</h4>
              <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">
                <span className="font-semibold text-rose-600">PWA (Progressive Web App)</span> adalah teknologi modern yang memungkinkan website Tumpang Food diubah menjadi aplikasi ponsel/komputer yang ringan.
              </p>

              <div className="mt-5 space-y-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <h5 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    🚀 Ringan & Hemat Memori
                  </h5>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Tidak perlu mengunduh puluhan megabyte dari Play Store/App Store. Aplikasi ini terpasang dalam hitungan detik dan sangat hemat kuota data Anda.
                  </p>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <h5 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    📱 Langsung di Layar Utama HP
                  </h5>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Tumpang Food akan memiliki ikon cantik di layar utama ponsel/komputer Anda, dapat dibuka sekali ketuk tanpa repot membuka browser atau mengetik alamat web.
                  </p>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <h5 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    ⚙️ Cara Pasang Manual
                  </h5>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Jika tombol pasang tidak muncul, ketuk tombol <span className="font-bold text-slate-800">Titik Tiga (⋮)</span> di kanan atas browser Chrome Anda, lalu pilih <span className="font-bold text-rose-600">"Instal Aplikasi"</span> atau <span className="font-bold text-rose-600">"Tambahkan ke Layar Utama"</span>.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowPWAInfo(false)}
                className="w-full mt-6 py-2.5 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                Tutup & Kembali
              </button>
            </div>
          </div>
        )}

        {/* 1. HOME TAB */}
        {activeTab === 'home' && (
          <div className="flex flex-col gap-5">
            {/* PWA Install Promo Banner */}
            {!isStandalone && !dismissedPrompt && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/70 p-4 rounded-2xl shadow-sm relative overflow-hidden flex flex-col gap-3">
                <button 
                  onClick={dismissInstallPrompt}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  title="Sembunyikan"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white flex-shrink-0 shadow-md">
                    <Smartphone className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="flex-1 pr-6">
                    <h4 className="font-display font-bold text-xs text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                      Pasang Aplikasi Tumpang Food
                      <span className="bg-amber-200/70 text-amber-800 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full uppercase">PWA</span>
                    </h4>
                    <p className="text-[11px] text-amber-800 mt-1 font-medium leading-relaxed">
                      Jadikan web ini sebagai aplikasi di HP Anda! Hemat memori, cepat dibuka langsung dari layar utama tanpa browser.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 text-xs">
                  <button 
                    onClick={handleInstallClick}
                    className="flex-1 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-extrabold py-2 px-3 rounded-xl shadow-md shadow-rose-600/10 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 animate-bounce" />
                    Pasang Sekarang
                  </button>
                  <button 
                    onClick={() => setShowPWAInfo(true)}
                    className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Info className="w-3.5 h-3.5" />
                    Apa itu PWA?
                  </button>
                </div>
              </div>
            )}
            {/* Promo Banner */}
            <div className="relative bg-gradient-to-br from-rose-500 to-pink-600 text-white p-5 rounded-2xl shadow-lg shadow-rose-500/10 overflow-hidden">
              <div className="relative z-10 max-w-[70%]">
                <span className="bg-white/20 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full">Kecamatan Tumpang</span>
                <h3 className="font-display font-bold text-lg leading-tight mt-1">Cita Rasa Lokal Langsung ke Rumah!</h3>
                <p className="text-xs text-white/80 mt-1 leading-relaxed">Nikmati hidangan khas Tumpang, dimasak segar oleh UMKM terbaik.</p>
              </div>
              <div className="absolute right-[-20px] bottom-[-20px] opacity-20">
                <Store className="w-40 h-40" />
              </div>
            </div>

            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari Bakso, Sate, Warung..."
                className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-rose-500 transition-colors shadow-sm"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Culinary Categories Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-display font-bold text-xs text-slate-700 uppercase tracking-wider">Kategori Kuliner Tumpang</h4>
                {selectedMerchantCategory !== 'all' && (
                  <button 
                    onClick={() => setSelectedMerchantCategory('all')}
                    className="text-[10px] text-rose-600 font-bold hover:underline"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1.5 -mx-4 px-4 scrollbar-thin scrollbar-thumb-slate-200">
                {CULINARY_CATEGORIES.map(cat => {
                  const isActive = selectedMerchantCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedMerchantCategory(cat.id)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-200 cursor-pointer ${
                        isActive
                          ? 'bg-rose-600 text-white shadow-md shadow-rose-600/25 scale-[1.02] border border-rose-600'
                          : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 shadow-sm'
                      }`}
                    >
                      <span className="text-sm">{cat.emoji}</span>
                      <span>{cat.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Merchant List */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-display font-bold text-base text-slate-800">Daftar Toko Kuliner UMKM</h3>
                <span className="text-[11px] font-semibold text-slate-500">{filteredMerchants.length} Toko</span>
              </div>

              {filteredMerchants.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <Store className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="text-slate-400 text-sm mt-2">Tidak menemukan toko kuliner yang cocok.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3.5">
                  {filteredMerchants.map((merchant) => (
                    <div 
                      key={merchant.id}
                      onClick={() => loadMerchantDetail(merchant)}
                      className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer group flex flex-col"
                    >
                      {/* Image */}
                      <div className="relative w-full h-36 bg-slate-100 overflow-hidden">
                        <img 
                          src={merchant.bannerImage || merchant.image} 
                          alt={merchant.name} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          referrerPolicy="no-referrer"
                        />
                        {/* Open/Close Badge */}
                        <div className="absolute top-3 right-3">
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md uppercase tracking-wider ${
                            merchant.active 
                              ? 'bg-emerald-500 text-white' 
                              : 'bg-slate-600 text-white'
                          }`}>
                            {merchant.active ? 'Buka' : 'Tutup'}
                          </span>
                        </div>
                        {/* Rating */}
                        <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur-sm text-amber-400 text-xs px-2 py-1 rounded-lg flex items-center gap-1 font-bold">
                          <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-400" />
                          <span>{merchant.rating.toFixed(1)}</span>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-4">
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="font-display font-bold text-base text-slate-800 group-hover:text-rose-600 transition-colors leading-snug">
                            {merchant.name}
                          </h4>
                          <span className="bg-rose-50 text-rose-600 font-extrabold text-[9px] px-2 py-0.5 rounded uppercase tracking-wider whitespace-nowrap border border-rose-100 flex items-center gap-0.5">
                            {CULINARY_CATEGORIES.find(c => c.name === getMerchantCategory(merchant))?.emoji || '🍛'}{' '}
                            {getMerchantCategory(merchant)}
                          </span>
                        </div>
                        <p className="text-slate-500 text-xs line-clamp-1.5 mt-1 leading-relaxed">
                          {merchant.description}
                        </p>
                        
                        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 font-medium">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {merchant.openTime} - {merchant.closeTime}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 line-clamp-1" />
                            {merchant.address.split(',')[0]}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Demo Dashboard Access Card */}
            <div id="demo-dashboard-quick-access" className="mt-8 bg-gradient-to-br from-slate-900 via-slate-850 to-slate-950 text-white rounded-2xl p-5 border border-slate-800 shadow-xl relative overflow-hidden">
              <div className="absolute right-[-15px] top-[-15px] w-24 h-24 bg-rose-500/10 rounded-full blur-xl"></div>
              <div className="relative z-10 flex flex-col gap-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-lg">🔑</span>
                  <div>
                    <h4 className="font-display font-bold text-xs uppercase tracking-wider text-amber-400">Pusat Portal & Dashboard Demo</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">Beralih peran secara instan untuk mensimulasikan alur Tumpang Food</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-1">
                  {/* Admin Button */}
                  <button
                    id="btn-switch-admin"
                    onClick={() => {
                      if (onSelectRole) onSelectRole('ADMIN');
                    }}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-950 transition-all text-center cursor-pointer active:scale-95 group"
                  >
                    <span className="text-xl group-hover:scale-110 transition-transform mb-1">🛡️</span>
                    <span className="font-bold text-[10px] tracking-tight">Admin Portal</span>
                    <span className="text-[8px] text-slate-400 font-medium mt-0.5 truncate w-full">Verifikasi QRIS</span>
                  </button>

                  {/* Merchant Button */}
                  <button
                    id="btn-switch-merchant"
                    onClick={() => {
                      if (onSelectRole) onSelectRole('MERCHANT');
                    }}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-950 transition-all text-center cursor-pointer active:scale-95 group"
                  >
                    <span className="text-lg group-hover:scale-110 transition-transform mb-1">🏪</span>
                    <span className="font-bold text-[10px] tracking-tight">Merchant</span>
                    <span className="text-[8px] text-slate-400 font-medium mt-0.5 truncate w-full">Atur Menu/Pesanan</span>
                  </button>

                  {/* Driver Button */}
                  <button
                    id="btn-switch-driver"
                    onClick={() => {
                      if (onSelectRole) onSelectRole('DRIVER');
                    }}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-950 transition-all text-center cursor-pointer active:scale-95 group"
                  >
                    <span className="text-lg group-hover:scale-110 transition-transform mb-1">🚴</span>
                    <span className="font-bold text-[10px] tracking-tight">Kurir/Driver</span>
                    <span className="text-[8px] text-slate-400 font-medium mt-0.5 truncate w-full">Antar Makanan</span>
                  </button>
                </div>

                {/* Instant Simulation Bypass Section */}
                <div className="border-t border-slate-800/60 pt-3 mt-1 flex flex-col gap-2">
                  <span className="text-[9px] font-bold text-amber-500 uppercase tracking-wider block">⚡ Masuk Dashboard Langsung (Simulasi Bypass)</span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      id="btn-instant-admin"
                      onClick={() => {
                        if (onInstantDashboard) onInstantDashboard('ADMIN');
                      }}
                      className="py-2.5 px-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-all text-center cursor-pointer font-bold text-[9px] active:scale-95 flex flex-col items-center justify-center gap-1"
                    >
                      <span>🛡️ Admin</span>
                    </button>
                    <button
                      id="btn-instant-merchant"
                      onClick={() => {
                        if (onInstantDashboard) onInstantDashboard('MERCHANT');
                      }}
                      className="py-2.5 px-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all text-center cursor-pointer font-bold text-[9px] active:scale-95 flex flex-col items-center justify-center gap-1"
                    >
                      <span>🏪 Merchant</span>
                    </button>
                    <button
                      id="btn-instant-driver"
                      onClick={() => {
                        if (onInstantDashboard) onInstantDashboard('DRIVER');
                      }}
                      className="py-2.5 px-1 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-all text-center cursor-pointer font-bold text-[9px] active:scale-95 flex flex-col items-center justify-center gap-1"
                    >
                      <span>🚴 Driver</span>
                    </button>
                  </div>
                </div>

                <div className="text-[9px] text-slate-400 text-center bg-slate-950/30 py-1.5 rounded-lg border border-slate-800/50 mt-1">
                  💡 Klik salah satu tombol di atas untuk membuka pemilih peran Multi-Persona
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. MERCHANT DETAIL TAB */}
        {activeTab === 'merchant-detail' && selectedMerchant && (
          <div className="flex flex-col gap-4 pb-36">
            {/* Back to list */}
            <button 
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 text-sm font-semibold self-start"
            >
              <ArrowLeft className="w-4 h-4" />
              Kembali
            </button>

            {/* Shop Details Card */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="w-full h-32 bg-slate-100 relative">
                <img 
                  src={selectedMerchant.bannerImage || selectedMerchant.image} 
                  alt={selectedMerchant.name} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
                <div className="absolute top-3 right-3">
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md uppercase tracking-wider ${
                    selectedMerchant.active ? 'bg-emerald-500 text-white' : 'bg-slate-600 text-white'
                  }`}>
                    {selectedMerchant.active ? 'Buka' : 'Tutup'}
                  </span>
                </div>
              </div>
              <div className="px-4 pb-4 pt-2 relative">
                {/* Logo overlapping banner */}
                <div className="absolute -top-10 left-4 w-16 h-16 rounded-full border-4 border-white bg-white shadow-md overflow-hidden">
                  <img 
                    src={selectedMerchant.image} 
                    alt="Logo" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                
                <div className="pl-20 pt-1 min-h-[30px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display font-bold text-lg text-slate-800 leading-snug">{selectedMerchant.name}</h3>
                    <span className="bg-rose-50 text-rose-600 font-extrabold text-[9px] px-2 py-0.5 rounded uppercase tracking-wider border border-rose-100 flex items-center gap-0.5">
                      {CULINARY_CATEGORIES.find(c => c.name === getMerchantCategory(selectedMerchant))?.emoji || '🍛'}{' '}
                      {getMerchantCategory(selectedMerchant)}
                    </span>
                  </div>
                  <p className="text-slate-500 text-xs mt-1 leading-relaxed">{selectedMerchant.description}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-y-2 gap-x-4 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4 text-slate-400" />
                    Buka {selectedMerchant.openTime} - {selectedMerchant.closeTime}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                    {selectedMerchant.rating.toFixed(1)} Bintang
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    {selectedMerchant.address}
                  </span>
                </div>
              </div>
            </div>

            {/* Menu Sections */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-display font-bold text-base text-slate-800">Daftar Menu Makanan</h4>
              </div>

              {/* Category selector */}
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all ${
                    selectedCategory === 'all' 
                      ? 'bg-rose-500 text-white shadow-md shadow-rose-500/10' 
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  Semua Menu
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all ${
                      selectedCategory === cat.id 
                        ? 'bg-rose-500 text-white shadow-md shadow-rose-500/10' 
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* Menu List */}
              <div className="flex flex-col gap-3 mt-3">
                {selectedMerchantMenu
                  .filter(item => selectedCategory === 'all' || item.categoryId === selectedCategory)
                  .map(item => (
                    <div 
                      key={item.id}
                      className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm flex gap-3 items-center"
                    >
                      {item.image && (
                        <img 
                          src={item.image} 
                          alt={item.name} 
                          className="w-16 h-16 rounded-lg object-cover bg-slate-100 flex-shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h5 className="font-semibold text-slate-800 truncate text-sm">{item.name}</h5>
                        <p className="text-slate-500 text-xs line-clamp-1 mt-0.5">{item.description}</p>
                        <span className="font-display font-bold text-rose-600 text-xs inline-block mt-2">
                          Rp {item.price.toLocaleString('id-ID')}
                        </span>
                        {selectedMerchant.isPremium && item.allowInstant === false && (
                          <span className="ml-2 bg-purple-50 text-purple-600 border border-purple-100 text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase tracking-wider">
                            Hanya Pre-Order
                          </span>
                        )}
                      </div>

                      {/* Quantity Selector or Add Button */}
                      {(() => {
                        const cartItem = cart.find(i => i.menuItemId === item.id);
                        if (cartItem) {
                          return (
                            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                              {/* Decrease button */}
                              <button
                                type="button"
                                onClick={() => updateCartQuantity(item.id, -1)}
                                className="w-7 h-7 rounded-lg hover:bg-rose-50 text-slate-500 hover:text-rose-600 flex items-center justify-center transition-all"
                                title="Kurangi Jumlah"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              
                              <span className="w-6 text-center text-xs font-bold font-mono text-slate-800">
                                {cartItem.quantity}
                              </span>

                              {/* Increase button */}
                              <button
                                type="button"
                                onClick={() => updateCartQuantity(item.id, 1)}
                                className="w-7 h-7 rounded-lg hover:bg-slate-50 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-all"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        }

                        return (
                          <button
                            onClick={() => addToCart(item, selectedMerchant)}
                            disabled={!item.available || !selectedMerchant.active}
                            className={`p-2 rounded-xl border transition-all ${
                              !item.available || !selectedMerchant.active
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-600 shadow-sm'
                            }`}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        );
                      })()}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* 3. CART SUMMARY */}
        {cart.length > 0 && activeTab !== 'checkout' && activeTab !== 'payment' && (
          <div className="fixed bottom-[68px] left-4 right-4 max-w-sm mx-auto bg-slate-900 text-white p-3.5 rounded-2xl shadow-xl flex justify-between items-center z-[100] animate-bounce">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <ShoppingBag className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-rose-300 tracking-wider">Keranjang {cartMerchant?.name?.split(' ')[0]}</span>
                <span className="text-xs font-semibold">{cart.length} Item • Rp {getSubtotal().toLocaleString('id-ID')}</span>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('checkout')}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-1 shadow-md shadow-rose-600/15"
            >
              Checkout
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 4. CHECKOUT TAB */}
        {activeTab === 'checkout' && cartMerchant && (
          <form onSubmit={handleCheckout} className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={() => setActiveTab('merchant-detail')}
                className="p-1 hover:bg-slate-200 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h3 className="font-display font-bold text-lg text-slate-800">Konfirmasi Pemesanan</h3>
            </div>

            {/* Merchant Recap */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Toko Tujuan</span>
              <p className="font-semibold text-slate-800 text-sm mt-0.5">{cartMerchant.name}</p>
            </div>

            {/* Daftar Pesanan Anda */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <h4 className="font-display font-semibold text-xs text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
                  <ShoppingBag className="w-3.5 h-3.5 text-rose-500" />
                  Daftar Pesanan Anda
                </h4>
                <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">
                  {cart.length} Menu
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {cart.map((item) => {
                  const minQty = getMenuItemPreOrderMin(item);
                  const isPreOrder = cartMerchant.preOrderOnly || checkoutDeliveryType === 'PREORDER';
                  const isBelowMin = isPreOrder && item.quantity < minQty;

                  return (
                    <div 
                      key={item.menuItemId} 
                      className={`flex gap-3 items-center p-3 rounded-xl border transition-colors ${
                        isBelowMin 
                          ? 'border-rose-200 bg-rose-50/10' 
                          : 'border-slate-100 bg-slate-50/30'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <h5 className="font-semibold text-slate-800 text-xs truncate">{item.name}</h5>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                          Rp {item.price.toLocaleString('id-ID')} / porsi
                        </p>
                        
                        {isPreOrder && minQty > 1 && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ${
                              isBelowMin 
                                ? 'bg-rose-100 text-rose-700 border border-rose-200' 
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            }`}>
                              Min. Order: {minQty}
                            </span>
                            {isBelowMin && (
                              <span className="text-[9px] text-rose-600 font-bold animate-pulse">
                                (Kurang {minQty - item.quantity} porsi)
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Quantity Selector */}
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-sm">
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.menuItemId, -1)}
                            className="w-5 h-5 rounded-md hover:bg-slate-50 text-slate-500 font-bold text-xs flex items-center justify-center transition-colors"
                            title="Kurangi Jumlah"
                          >
                            -
                          </button>
                          <span className="w-6 text-center text-xs font-bold font-mono text-slate-800">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.menuItemId, 1)}
                            className="w-5 h-5 rounded-md hover:bg-slate-50 text-slate-500 font-bold text-xs flex items-center justify-center transition-colors"
                            title="Tambah Jumlah"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* If Merchant is Premium and supports both Instant and Pre-Order, allow selection */}
            {cartMerchant.isPremium && cartMerchant.allowInstantAndPreOrder && (
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm flex flex-col gap-2.5">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Metode Pemesanan</span>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setCheckoutDeliveryType('INSTANT')}
                    className={`py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      checkoutDeliveryType === 'INSTANT'
                        ? 'bg-white text-rose-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>🚀 Kirim Instan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckoutDeliveryType('PREORDER')}
                    className={`py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      checkoutDeliveryType === 'PREORDER'
                        ? 'bg-white text-amber-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>📅 Pre-Order</span>
                  </button>
                </div>
              </div>
            )}

            {/* Pre-order Delivery Date Selector */}
            {(cartMerchant.preOrderOnly || (cartMerchant.allowInstantAndPreOrder && checkoutDeliveryType === 'PREORDER')) && (
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 shadow-sm flex flex-col gap-2.5">
                <div className="flex justify-between items-center border-b border-amber-200/60 pb-2">
                  <h4 className="font-display font-semibold text-xs text-amber-900 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-amber-700" />
                    Tanggal Pengiriman Pre-Order
                  </h4>
                  <span className="text-[9px] bg-amber-200 text-amber-900 font-extrabold px-2 py-0.5 rounded-full uppercase">
                    Wajib H-{cartMerchant.preOrderLeadDays || 1}
                  </span>
                </div>
                
                <p className="text-[10px] text-amber-700 leading-relaxed">
                  Toko ini membutuhkan waktu persiapan minimal <strong>{cartMerchant.preOrderLeadDays || 1} hari</strong>. Silakan pilih tanggal pengiriman Anda di bawah ini:
                </p>

                <div>
                  <input
                    type="date"
                    required
                    value={preOrderDate}
                    onChange={(e) => setPreOrderDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs focus:outline-none focus:border-rose-500 font-bold text-slate-700"
                  />
                </div>
              </div>
            )}

            {/* Customer Inputs */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3.5">
              <h4 className="font-display font-semibold text-sm text-slate-700 border-b border-slate-100 pb-2">Detail Penerima</h4>
              
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={checkoutName}
                  onChange={(e) => setCheckoutName(e.target.value)}
                  placeholder="Masukkan nama Anda"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:outline-none focus:border-rose-500 mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">No WhatsApp (Aktif)</label>
                <input
                  type="tel"
                  required
                  value={checkoutPhone}
                  onChange={(e) => setCheckoutPhone(e.target.value)}
                  placeholder="Contoh: 0812XXXXXXXX"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:outline-none focus:border-rose-500 mt-1"
                />
              </div>
            </div>

            {/* Pin Location on Map */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
              <h4 className="font-display font-semibold text-sm text-slate-700 border-b border-slate-100 pb-2">Tandai Peta Pengantaran</h4>
              <div className="w-full h-[250px] overflow-hidden rounded-xl">
                <MapPicker 
                  initialLat={checkoutLat}
                  initialLng={checkoutLng}
                  onLocationSelected={(lat, lng, address) => {
                    setCheckoutLat(lat);
                    setCheckoutLng(lng);
                    if (address && !checkoutAddress) {
                      setCheckoutAddress(address);
                    }
                  }}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Detail Alamat Lengkap</label>
                <textarea
                  required
                  rows={2}
                  value={checkoutAddress}
                  onChange={(e) => setCheckoutAddress(e.target.value)}
                  placeholder="Nama jalan, nomor rumah, RT/RW, Dusun..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:outline-none focus:border-rose-500 mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Patokan Lokasi (Opsional)</label>
                <input
                  type="text"
                  value={checkoutLandmark}
                  onChange={(e) => setCheckoutLandmark(e.target.value)}
                  placeholder="Contoh: Depan masjid, sebelah konter pulsa"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:outline-none focus:border-rose-500 mt-1"
                />
              </div>
            </div>

            {/* Portions/Items Progress and Validation for Pre-order */}
            {(() => {
              const isPreOrder = cartMerchant.preOrderOnly || checkoutDeliveryType === 'PREORDER';
              if (!isPreOrder) return null;

              const invalidItems = cart.filter(item => {
                const min = getMenuItemPreOrderMin(item);
                return item.quantity < min;
              });

              const hasInvalidItem = invalidItems.length > 0;
              const merchantMin = Number(cartMerchant.preOrderMinAmount || 0);
              const totalQty = cart.reduce((sum, item) => Number(sum) + Number(item.quantity), 0);
              const isTotalInvalid = totalQty < merchantMin;

              const isBlocked = hasInvalidItem || isTotalInvalid;

              return (
                <div className={`p-4 rounded-xl border flex flex-col gap-2 text-xs transition-all ${
                  !isBlocked 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                    : 'bg-rose-50 border-rose-200 text-rose-800 animate-pulse'
                }`}>
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      <ClipboardList className="w-4 h-4" />
                      Status Batas Minimal Order Pre-Order:
                    </span>
                    <span className="font-mono text-[9px] bg-white/60 px-2 py-0.5 rounded-full border border-slate-200/40">
                      {isBlocked ? '⚠️ BELUM TERPENUHI' : '✓ TERPENUHI'}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5 mt-1">
                    {/* Overall merchant min check */}
                    {merchantMin > 0 && (
                      <div className="flex justify-between items-center text-[11px]">
                        <span>• Total Order Toko (Min. {merchantMin} porsi):</span>
                        <span className={`font-bold ${totalQty >= merchantMin ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {totalQty} / {merchantMin} porsi
                        </span>
                      </div>
                    )}

                    {/* Item-specific checks */}
                    {cart.map(item => {
                      const min = getMenuItemPreOrderMin(item);
                      const satisfies = item.quantity >= min;
                      if (min <= 1) return null; // No custom minimum
                      return (
                        <div key={item.menuItemId} className="flex justify-between items-center text-[11px] pl-3 border-l-2 border-slate-200">
                          <span className="truncate max-w-[180px]">{item.name}:</span>
                          <span className={`font-bold ${satisfies ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {item.quantity} / {min} porsi {satisfies ? '✓' : `(Kurang ${min - item.quantity})`}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[10px] opacity-90 leading-normal border-t border-slate-200/40 pt-1.5 mt-1 font-medium">
                    {!isBlocked 
                      ? '✓ Semua syarat jumlah minimal pesanan terpenuhi! Anda dapat melakukan checkout.' 
                      : '⚠️ Silakan sesuaikan jumlah pesanan Anda agar memenuhi batas minimal sebelum menekan tombol checkout.'}
                  </p>
                </div>
              );
            })()}

            {/* Ringkasan Biaya */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h4 className="font-display font-semibold text-sm text-slate-700 border-b border-slate-100 pb-2 mb-3">Ringkasan Pembayaran</h4>
              <div className="flex flex-col gap-2.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal Makanan</span>
                  <span className="font-semibold">Rp {getSubtotal().toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ongkos Kirim</span>
                  {(() => {
                    const isPreOrder = cartMerchant.preOrderOnly || checkoutDeliveryType === 'PREORDER';
                    if (isPreOrder) {
                      return (
                        <span className="font-extrabold text-amber-600 flex flex-col items-end">
                          <span>Negosiasi (COD)</span>
                          <span className="text-[9px] text-slate-400 font-normal">Hubungi Admin/Seller</span>
                        </span>
                      );
                    }
                    return <span className="font-semibold">Rp {getDeliveryFee().toLocaleString('id-ID')}</span>;
                  })()}
                </div>
                <div className="flex justify-between">
                  <span>Biaya Layanan</span>
                  <span className="font-semibold">Rp {getServiceFee().toLocaleString('id-ID')}</span>
                </div>
                <div className="border-t border-slate-100 pt-2.5 flex justify-between text-sm font-bold text-slate-800">
                  <span>Estimasi Total</span>
                  <span className="text-rose-600 flex flex-col items-end">
                    {(() => {
                      const isPreOrder = cartMerchant.preOrderOnly || checkoutDeliveryType === 'PREORDER';
                      const deliveryVal = isPreOrder ? 0 : getDeliveryFee();
                      const finalTotal = getSubtotal() + deliveryVal + getServiceFee();
                      return (
                        <>
                          <span>Rp {finalTotal.toLocaleString('id-ID')}*</span>
                          {isPreOrder && <span className="text-[9px] text-amber-600 font-medium mt-0.5">(Belum Termasuk Ongkir COD)</span>}
                        </>
                      );
                    })()}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
                *Total akhir akan ditambahkan 3 digit Kode Unik Pembayaran (Rp 1 - Rp 99) pada halaman berikutnya untuk mempermudah verifikasi.
              </p>
            </div>

            {(() => {
              const isPreOrder = cartMerchant.preOrderOnly || checkoutDeliveryType === 'PREORDER';
              
              const invalidItems = isPreOrder ? cart.filter(item => {
                const min = getMenuItemPreOrderMin(item);
                return item.quantity < min;
              }) : [];

              const hasInvalidItem = invalidItems.length > 0;
              const merchantMin = Number(cartMerchant.preOrderMinAmount || 0);
              const totalQty = cart.reduce((sum, item) => Number(sum) + Number(item.quantity), 0);
              const isTotalInvalid = isPreOrder && totalQty < merchantMin;

              const isBlocked = isPreOrder && (hasInvalidItem || isTotalInvalid);

              return (
                <button
                  type="submit"
                  disabled={isBlocked}
                  className={`w-full py-3 font-bold rounded-xl transition-all text-sm flex items-center justify-center gap-1.5 ${
                    isBlocked
                      ? 'bg-slate-200 text-slate-400 border border-slate-300 shadow-none cursor-not-allowed'
                      : 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/20 cursor-pointer'
                  }`}
                >
                  {isBlocked ? 'Batas Minimal Order Belum Terpenuhi' : 'Proses ke Pembayaran'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              );
            })()}
          </form>
        )}

        {/* 5. PAYMENT / BILLING TAB */}
        {activeTab === 'payment' && activeOrder && (
          <div className="flex flex-col gap-4">
            <h3 className="font-display font-bold text-lg text-slate-800 text-center">QRIS Tumpang Food</h3>
            
            {/* Countdown / Status alerts */}
            <div className="bg-amber-50 border border-amber-100 text-amber-800 p-3.5 rounded-xl text-xs flex flex-col gap-1">
              <span className="font-bold">⚠️ Selesaikan Pembayaran Anda</span>
              <span>Lakukan transfer pas sesuai nominal hingga tiga digit terakhir. Batas waktu transfer adalah 10 menit.</span>
            </div>

            {/* Invoice Bill Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col items-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">TOTAL TRANSFER</span>
              <h2 className="font-display font-extrabold text-2xl text-slate-800 mt-1">
                Rp {activeOrder.total.toLocaleString('id-ID')}
              </h2>
              
              {/* Unique Code Highlights */}
              <div className="mt-2 bg-rose-50 text-rose-700 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                <span>Termasuk Kode Unik: </span>
                <span className="bg-rose-600 text-white px-1.5 py-0.5 rounded text-[10px]">+{activeOrder.uniqueCode}</span>
              </div>

              {/* QRIS Code Image */}
              <div className="w-56 h-56 bg-slate-50 border-2 border-slate-100 rounded-xl overflow-hidden mt-6 flex flex-col items-center justify-center relative p-3">
                <img 
                  src={systemConfig?.qrisImage || 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=400&auto=format&fit=crop&q=60'} 
                  alt="QRIS Code" 
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-slate-900/5 hover:bg-transparent transition-colors"></div>
              </div>
              <p className="text-[10px] text-slate-400 text-center mt-3 font-semibold tracking-wide uppercase">QRIS RESMI TUMPANG FOOD</p>
            </div>

            {/* Upload Proof */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h4 className="font-display font-semibold text-sm text-slate-800 border-b border-slate-100 pb-2.5">Unggah Bukti Pembayaran</h4>
              
              <form onSubmit={handlePaymentProofUpload} className="flex flex-col gap-3.5 mt-4">
                {/* File picker */}
                <div>
                  <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Pilih Foto Bukti</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100 cursor-pointer"
                  />
                </div>

                {/* URL paste helper */}
                <div>
                  <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Atau Tautan Gambar (Url)</label>
                  <input
                    type="text"
                    value={paymentProofUrl}
                    onChange={(e) => {
                      setPaymentProofUrl(e.target.value);
                      setPaymentProofFile(null);
                    }}
                    placeholder="https://example.com/bukti.jpg"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-500"
                  />
                </div>

                {/* Preview Selected Photo */}
                {(paymentProofFile || paymentProofUrl) && (
                  <div className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden mt-2 relative">
                    <img 
                      src={paymentProofFile || paymentProofUrl} 
                      alt="Preview Bukti" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={uploadLoading || (!paymentProofFile && !paymentProofUrl)}
                  className={`w-full py-2.5 font-bold rounded-xl transition-all shadow-md text-xs flex items-center justify-center gap-1.5 ${
                    uploadLoading || (!paymentProofFile && !paymentProofUrl)
                      ? 'bg-slate-200 text-slate-400 border-slate-300 shadow-none cursor-not-allowed'
                      : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/10'
                  }`}
                >
                  {uploadLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      Mengirim...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Kirim Bukti Pembayaran
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Check Tracking */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setTrackingOrderId(activeOrder.id);
                  setActiveTab('tracking');
                }}
                className="flex-1 py-3 bg-slate-900 text-white hover:bg-slate-800 font-semibold rounded-xl transition-all text-xs text-center"
              >
                Pantau Status Pesanan
              </button>
            </div>
          </div>
        )}

        {/* 6. TRACKING PESANAN TAB */}
        {activeTab === 'tracking' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setActiveTab('home')}
                className="p-1 hover:bg-slate-200 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h3 className="font-display font-bold text-lg text-slate-800">Detail & Pelacakan Pesanan</h3>
            </div>

            {/* Manual Refresh / Tracker input if no active order */}
            {!activeOrder ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-3">
                <p className="text-slate-500 text-xs leading-relaxed">Masukkan ID Pesanan Anda untuk memantau status secara langsung.</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={trackingOrderId}
                    onChange={(e) => setTrackingOrderId(e.target.value)}
                    placeholder="ord_xxxxx"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none"
                  />
                  <button
                    onClick={refreshActiveOrder}
                    className="px-4 py-2 bg-rose-600 text-white font-bold rounded-xl text-xs"
                  >
                    Lacak
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Active Info Header */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">ID PESANAN</span>
                      <span className="font-mono text-sm font-bold text-slate-800 mt-0.5">{activeOrder.id}</span>
                    </div>
                    <button
                      onClick={refreshActiveOrder}
                      className="p-1.5 hover:bg-slate-100 text-slate-500 rounded-lg transition-colors border border-slate-200 shadow-sm"
                      title="Perbarui Status"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Order Core Info */}
                  <div className="grid grid-cols-2 gap-3 mt-3.5 text-xs text-slate-600">
                    <div>
                      <span className="text-slate-400 font-medium">Toko Kuliner:</span>
                      <p className="font-semibold text-slate-800 mt-0.5">{activeOrder.merchantName}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium">Penerima:</span>
                      <p className="font-semibold text-slate-800 mt-0.5">{activeOrder.customerName}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium">No WhatsApp:</span>
                      <p className="font-semibold text-slate-800 mt-0.5">{activeOrder.customerPhone}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium">Driver:</span>
                      <p className="font-semibold text-emerald-600 mt-0.5">{activeOrder.driverName || 'Menunggu penugasan...'}</p>
                    </div>
                    
                    {activeOrder.preOrderDate && (
                      <div className="col-span-2 bg-amber-50 border border-amber-200/60 p-2.5 rounded-xl text-amber-900 mt-1">
                        <span className="font-bold flex items-center gap-1 text-[10px] text-amber-800 uppercase tracking-wide">
                          📅 Tanggal Pengantaran Pre-Order
                        </span>
                        <p className="font-extrabold text-sm mt-0.5">{new Date(activeOrder.preOrderDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tracking Progress Steps */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <h4 className="font-display font-semibold text-sm text-slate-800 border-b border-slate-100 pb-2.5 mb-4">Status Pengantaran</h4>
                  
                  <div className="flex flex-col gap-5 relative pl-4 border-l border-slate-200">
                    
                    {/* Step 1: Menunggu pembayaran */}
                    <div className="relative">
                      <div className={`absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full ring-4 ${
                        activeOrder.status === OrderStatus.WAITING_PAYMENT 
                          ? 'bg-rose-500 ring-rose-100 animate-ping' 
                          : 'bg-emerald-500 ring-emerald-100'
                      }`} />
                      <span className="text-xs font-bold text-slate-800">Pesanan Dibuat</span>
                      <p className="text-[11px] text-slate-500 mt-0.5">Pesanan berhasil dicatat dengan kode unik.</p>
                    </div>

                    {/* Step 2: Menunggu verifikasi */}
                    <div className="relative">
                      <div className={`absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full ring-4 ${
                        [OrderStatus.WAITING_PAYMENT].includes(activeOrder.status) 
                          ? 'bg-slate-200 ring-slate-100' 
                          : activeOrder.status === OrderStatus.WAITING_PAYMENT_VERIFICATION 
                            ? 'bg-rose-500 ring-rose-100' 
                            : 'bg-emerald-500 ring-emerald-100'
                      }`} />
                      <span className="text-xs font-bold text-slate-800">Verifikasi Pembayaran</span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {activeOrder.status === OrderStatus.WAITING_PAYMENT 
                          ? 'Menunggu unggahan bukti transfer.' 
                          : activeOrder.status === OrderStatus.WAITING_PAYMENT_VERIFICATION 
                            ? 'Admin sedang memverifikasi bukti pembayaran.' 
                            : 'Pembayaran telah dikonfirmasi oleh Admin.'}
                      </p>
                    </div>

                    {/* Step 3: Memasak */}
                    <div className="relative">
                      <div className={`absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full ring-4 ${
                        [OrderStatus.WAITING_PAYMENT, OrderStatus.WAITING_PAYMENT_VERIFICATION, OrderStatus.PAYMENT_REJECTED].includes(activeOrder.status) 
                          ? 'bg-slate-200 ring-slate-100' 
                          : activeOrder.status === OrderStatus.COOKING 
                            ? 'bg-rose-500 ring-rose-100' 
                            : [OrderStatus.PAYMENT_VERIFIED].includes(activeOrder.status)
                              ? 'bg-amber-500 ring-amber-100'
                              : 'bg-emerald-500 ring-emerald-100'
                      }`} />
                      <span className="text-xs font-bold text-slate-800">Diproses Toko</span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {activeOrder.status === OrderStatus.COOKING 
                          ? `Toko sedang memasak. Estimasi waktu: ${activeOrder.cookingTimeMinutes || 30} menit.` 
                          : [OrderStatus.PAYMENT_VERIFIED].includes(activeOrder.status)
                            ? 'Pesanan diteruskan ke toko, menunggu respon...'
                            : [OrderStatus.WAITING_PAYMENT, OrderStatus.WAITING_PAYMENT_VERIFICATION].includes(activeOrder.status)
                              ? 'Menunggu pembayaran selesai.'
                              : 'Toko telah menyelesaikan proses memasak.'}
                      </p>
                    </div>

                    {/* Step 4: Menuju lokasi */}
                    <div className="relative">
                      <div className={`absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full ring-4 ${
                        [OrderStatus.READY_FOR_PICKUP, OrderStatus.ORDER_PICKED_UP].includes(activeOrder.status)
                          ? 'bg-rose-500 ring-rose-100'
                          : [OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(activeOrder.status)
                            ? 'bg-emerald-500 ring-emerald-100'
                            : 'bg-slate-200 ring-slate-100'
                      }`} />
                      <span className="text-xs font-bold text-slate-800">Pengantaran oleh Kurir</span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {activeOrder.status === OrderStatus.READY_FOR_PICKUP 
                          ? 'Pesanan siap dijemput. Kurir menuju toko.' 
                          : activeOrder.status === OrderStatus.ORDER_PICKED_UP 
                            ? `Kurir (${activeOrder.driverName || 'Kurir'}) sedang membawa makanan ke lokasi Anda.` 
                            : [OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(activeOrder.status)
                              ? 'Makanan telah diambil dan diantar oleh kurir.'
                              : 'Menunggu proses memasak selesai.'}
                      </p>
                    </div>

                    {/* Step 5: Sampai */}
                    <div className="relative">
                      <div className={`absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full ring-4 ${
                        [OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(activeOrder.status)
                          ? 'bg-emerald-500 ring-emerald-100'
                          : 'bg-slate-200 ring-slate-100'
                      }`} />
                      <span className="text-xs font-bold text-slate-800">Pesanan Selesai (Sudah Terkirim)</span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {[OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(activeOrder.status)
                          ? 'Terima kasih, pesanan telah selesai secara otomatis setelah driver mengirimkan bukti pengantaran!' 
                          : 'Menunggu pengantaran kurir.'}
                      </p>
                    </div>
                  </div>

                  {/* Terminal / Cancel / Rejections states */}
                  {activeOrder.status === OrderStatus.PAYMENT_REJECTED && (
                    <div className="mt-5 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-800">
                      <span className="font-bold">❌ Pembayaran Ditolak</span>
                      <p className="mt-0.5">Alasan: {activeOrder.cancelReason || 'Bukti transfer tidak sesuai nominal.'}</p>
                      <button 
                        onClick={() => setActiveTab('payment')} 
                        className="mt-2 text-rose-600 font-bold hover:underline"
                      >
                        Kirim Ulang Bukti Pembayaran
                      </button>
                    </div>
                  )}

                  {activeOrder.status === OrderStatus.CANCELLED && (
                    <div className="mt-5 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-800">
                      <span className="font-bold">❌ Pesanan Dibatalkan</span>
                      <p className="mt-0.5">Alasan: {activeOrder.cancelReason || 'Dibatalkan oleh sistem atau toko.'}</p>
                    </div>
                  )}
                </div>
                
                {/* Back to Home */}
                <button
                  onClick={() => {
                    setActiveOrder(null);
                    setTrackingOrderId('');
                    setActiveTab('home');
                  }}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl text-xs text-center transition-colors"
                >
                  Kembali Belanja
                </button>
              </div>
            )}
          </div>
        )}

        {/* 7. HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setActiveTab('home')}
                className="p-1 hover:bg-slate-200 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h3 className="font-display font-bold text-lg text-slate-800">Riwayat Pembelian</h3>
            </div>

            {/* Search History Form */}
            <form onSubmit={searchHistory} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-3">
              <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">CARI BERDASARKAN NO WHATSAPP</span>
              <div className="flex gap-2">
                <input
                  type="tel"
                  required
                  value={historyPhone}
                  onChange={(e) => setHistoryPhone(e.target.value)}
                  placeholder="Masukkan nomor WhatsApp saat checkout"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500"
                />
                <button
                  type="submit"
                  disabled={historyLoading}
                  className="px-5 py-3 bg-rose-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 hover:bg-rose-700 shadow-md shadow-rose-600/10"
                >
                  {historyLoading ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    'Cari'
                  )}
                </button>
              </div>
            </form>

            {/* History Results */}
            {historySearched && (
              <div className="flex flex-col gap-3 mt-2">
                <h4 className="font-display font-semibold text-sm text-slate-700">Ditemukan ({historyOrders.length}) Pesanan</h4>
                
                {historyOrders.length === 0 ? (
                  <div className="text-center py-8 bg-white border border-slate-200 rounded-xl">
                    <ClipboardList className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-slate-400 text-xs mt-2">Belum ada riwayat pesanan untuk nomor ini.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {historyOrders.map(o => (
                      <div 
                        key={o.id}
                        onClick={() => {
                          setActiveOrder(o);
                          setTrackingOrderId(o.id);
                          setActiveTab('tracking');
                        }}
                        className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col gap-2"
                      >
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-mono font-bold text-slate-500">{o.id}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            o.status === OrderStatus.COMPLETED 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : o.status === OrderStatus.CANCELLED || o.status === OrderStatus.EXPIRED
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                          }`}>
                            {o.status}
                          </span>
                        </div>

                        <div className="flex justify-between items-end mt-1">
                          <div className="flex flex-col">
                            <h5 className="font-semibold text-slate-800 text-sm leading-snug">{o.merchantName}</h5>
                            <span className="text-[10px] text-slate-400 mt-0.5">{new Date(o.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          </div>
                          <span className="font-display font-bold text-rose-600 text-xs">
                            Rp {o.total.toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 8. PARTNER REGISTER TAB */}
        {activeTab === 'partner-register' && (
          <div className="flex flex-col gap-5 pb-6">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setActiveTab('home')}
                className="p-1 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5 text-slate-700" />
              </button>
              <h3 className="font-display font-extrabold text-lg text-slate-800 tracking-tight">Kemitraan Tumpang Food</h3>
            </div>

            {checkingRegistration ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-xl flex flex-col items-center justify-center gap-3 animate-pulse">
                <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-slate-500 text-xs font-semibold">Memeriksa status kemitraan Anda...</span>
              </div>
            ) : activeRegistration ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl flex flex-col gap-5 animate-fade-in">
                {/* Header Status */}
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Status Pengajuan</span>
                    <h4 className="font-display font-extrabold text-base text-slate-800">{activeRegistration.storeName || activeRegistration.name}</h4>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold shadow-sm ${
                    activeRegistration.status === 'APPROVED' || activeRegistration.status === 'ACTIVATED'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      : activeRegistration.status === 'REJECTED'
                        ? 'bg-red-50 text-red-700 border border-red-100'
                        : 'bg-amber-50 text-amber-700 border border-amber-100 animate-pulse'
                  }`}>
                    {activeRegistration.status === 'APPROVED' || activeRegistration.status === 'ACTIVATED'
                      ? '✓ DISETUJUI'
                      : activeRegistration.status === 'REJECTED'
                        ? '✗ DITOLAK'
                        : '⏳ MENUNGGU VERIFIKASI'}
                  </span>
                </div>

                {/* Status-specific body */}
                {(activeRegistration.status === 'APPROVED' || activeRegistration.status === 'ACTIVATED') ? (
                  <div className="flex flex-col gap-4 text-center items-center py-2 animate-fade-in">
                    <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm animate-bounce">
                      <CheckCircle2 className="w-9 h-9" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <h3 className="font-display font-extrabold text-lg text-slate-800">🎉 Selamat! Pendaftaran Berhasil!</h3>
                      <p className="text-slate-500 text-xs leading-relaxed max-w-sm">
                        Akun mitra kuliner Anda telah resmi aktif di platform Tumpang Food. Gunakan data berikut untuk mengelola toko Anda.
                      </p>
                    </div>

                    {/* Access Credentials Card */}
                    <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left flex flex-col gap-3">
                      <div className="border-b border-slate-200/60 pb-2 flex justify-between items-center">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">KREDENSIAL AKSES PORTAL</span>
                        <span className="bg-rose-50 text-rose-700 text-[9px] font-bold px-2 py-0.5 rounded-full border border-rose-100">Aktif</span>
                      </div>
                      <div className="flex flex-col gap-2.5 text-xs text-slate-600">
                        <div className="flex justify-between items-center">
                          <span>Email Terdaftar</span>
                          <span className="font-bold text-slate-800 font-mono">{activeRegistration.email}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Kata Sandi (Password)</span>
                          <span className="font-bold text-slate-800 font-mono bg-amber-100 px-2 py-0.5 rounded border border-amber-200 select-all">{activeRegistration.password || 'TF-1234'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Direct Login Button */}
                    <button
                      onClick={() => {
                        // Redirect to portal login screen with roles
                        window.location.href = `/?role=merchant&id=${activeRegistration.storeId || ''}`;
                      }}
                      className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-rose-600/20 text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      Akses Portal Merchant Sekarang
                    </button>
                  </div>
                ) : activeRegistration.status === 'REJECTED' ? (
                  <div className="flex flex-col gap-4 text-center items-center py-2">
                    <div className="w-16 h-16 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center text-red-600 shadow-sm">
                      <XCircle className="w-9 h-9" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <h3 className="font-display font-extrabold text-base text-slate-800">Pengajuan Belum Disetujui</h3>
                      <p className="text-slate-500 text-xs leading-relaxed max-w-sm">
                        Mohon maaf, pengajuan kemitraan Anda saat ini belum dapat disetujui oleh tim peninjau Tumpang Food.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 py-2">
                    {/* Pending State */}
                    <div className="flex items-center gap-3 bg-amber-50 border border-amber-100/80 rounded-xl p-3 text-xs text-amber-800">
                      <span className="text-base">⏳</span>
                      <span className="font-medium">Data pendaftaran Anda sedang dalam peninjauan verifikasi oleh Administrator.</span>
                    </div>

                    {/* Step-by-Step Status Flow */}
                    <div className="flex flex-col gap-3.5 mt-2 pl-2">
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold">✓</span>
                          <div className="w-0.5 h-6 bg-slate-200"></div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-800">Data Pendaftaran Terkirim</span>
                          <span className="text-[10px] text-slate-400">Berkas profil & kontrak Anda berhasil disimpan</span>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold animate-pulse">2</span>
                          <div className="w-0.5 h-6 bg-slate-200"></div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-800">Verifikasi Dokumen & Kontrak</span>
                          <span className="text-[10px] text-slate-400">Tim Admin sedang meninjau kelengkapan berkas fisik & KTP Anda</span>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-[10px] font-bold">3</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-400">Aktivasi Akun Portal</span>
                          <span className="text-[10px] text-slate-400">Sandi akses akan otomatis dirilis di halaman ini</span>
                        </div>
                      </div>
                    </div>

                    {/* Admin Contact info */}
                    <div className="text-center mt-3 py-3 border-t border-slate-100">
                      <p className="text-[11px] text-slate-500">
                        Butuh bantuan atau ingin proses lebih cepat? Hubungi Admin WhatsApp:
                      </p>
                      <a 
                        href="https://wa.me/628123456789" 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 mt-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-1.5 rounded-full text-[11px] border border-emerald-100 transition-colors"
                      >
                        <span>🟢 Hubungi Admin (WhatsApp)</span>
                      </a>
                    </div>
                  </div>
                )}

                {/* Reset button to clear local storage */}
                <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-2.5">
                  <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                    💡 <strong>Catatan:</strong> Pendaftaran <span className="font-semibold">{activeRegistration.storeName || activeRegistration.name}</span> yang sudah dikirim <strong>tidak akan terhapus dari sistem</strong>. Tombol di bawah hanya untuk mengosongkan halaman ini agar Anda atau merchant lain dapat mengisi pendaftaran baru.
                  </p>
                  <button
                    type="button"
                    onClick={resetPartnerForm}
                    className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 border border-slate-200 cursor-pointer shadow-sm hover:scale-[1.01] active:scale-[0.99]"
                  >
                    ➕ Mendaftar Merchant / Outlet Baru
                  </button>
                </div>
              </div>
            ) : partnerSubmitSuccess ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-6 text-center shadow-xl flex flex-col items-center gap-4 animate-fade-in">
                <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm animate-bounce">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <h4 className="font-display font-bold text-base text-slate-800">Pendaftaran Berhasil Dikirim!</h4>
                <p className="text-slate-500 text-xs leading-relaxed max-w-xs">
                  Terima kasih telah mendaftar. Data Anda telah disimpan dalam sistem kami. Hubungi Administrator di WhatsApp <span className="font-semibold text-rose-600">sawahjayagroup@gmail.com</span> untuk verifikasi & aktivasi instan akun Anda.
                </p>
                <button
                  onClick={resetPartnerForm}
                  className="mt-2 w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Kirim Pendaftaran Lain
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Info Cards / Benefits */}
                <div className="bg-gradient-to-br from-rose-500 to-red-600 text-white rounded-2xl p-5 shadow-lg flex flex-col gap-1.5 relative overflow-hidden">
                  <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
                  <h4 className="font-display font-bold text-sm">Pendaftaran Kemitraan Tumpang Food</h4>
                  <p className="text-[11px] text-rose-100 leading-relaxed">
                    Tumpang Food membantu UMKM lokal dan mitra pengantar (kurir) menjangkau ribuan pelanggan di Tumpang & sekitarnya dengan sistem kemitraan yang praktis.
                  </p>
                </div>

                {/* Tipe Kemitraan Switcher */}
                <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200/50">
                  <button
                    type="button"
                    onClick={() => {
                      setPartnerType('MERCHANT');
                      setPartnerStep(1);
                    }}
                    className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      partnerType === 'MERCHANT'
                        ? 'bg-rose-500 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <span>🍲 Mitra Toko / Merchant</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPartnerType('DRIVER');
                      setPartnerStep(1);
                    }}
                    className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      partnerType === 'DRIVER'
                        ? 'bg-rose-500 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <span>🏍️ Mitra Kurir / Driver</span>
                  </button>
                </div>

                 {/* Progress Tracker */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between text-[11px] font-bold">
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${partnerStep >= 1 ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-400'}`}>1</span>
                      <span className={partnerStep === 1 ? 'text-rose-600' : 'text-slate-500'}>Profil & Dokumen</span>
                    </div>
                    <div className="h-px bg-slate-200 flex-1 mx-3"></div>
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${partnerStep >= 2 ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-400'}`}>2</span>
                      <span className={partnerStep === 2 ? 'text-rose-600' : 'text-slate-500'}>Tanda Tangan Kontrak</span>
                    </div>
                    <div className="h-px bg-slate-200 flex-1 mx-3"></div>
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${partnerStep >= 3 ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-400'}`}>3</span>
                      <span className={partnerStep === 3 ? 'text-rose-600' : 'text-slate-500'}>Kirim</span>
                    </div>
                  </div>

                 {/* Registration Form */}
                 <form onSubmit={(e) => {
                   e.preventDefault();
                   if (partnerStep < 3) {
                     if (partnerStep === 1) {
                       if (partnerType === 'MERCHANT') {
                         if (!partnerName || !partnerPhone || !partnerEmail || !partnerStoreName || !partnerStoreAddress) {
                           alert('Mohon lengkapi profil dan alamat toko Anda.');
                           return;
                         }
                         if (!businessPhoto || !idPhoto) {
                           alert('Mohon unggah Foto Tempat Usaha dan Foto KTP Anda sebelum melanjutkan.');
                           return;
                         }
                       } else {
                         if (!partnerName || !partnerPhone || !partnerVehicle || !partnerArea) {
                           alert('Mohon lengkapi profil, nomor plat kendaraan, dan wilayah operasional Anda.');
                           return;
                         }
                         if (!businessPhoto || !idPhoto) {
                           alert('Mohon unggah Foto Kendaraan dan Foto KTP/SIM Anda sebelum melanjutkan.');
                           return;
                         }
                       }
                       setPartnerStep(2);
                     } else if (partnerStep === 2) {
                       if (!contractPhoto) {
                         alert('Mohon unduh draf kontrak, cetak, beri Materai Rp10.000 fisik, tanda tangani secara basah, lalu foto/scan dan unggah kembali berkas tersebut.');
                         return;
                       }
                       setPartnerStep(3);
                     }
                   } else {
                     handlePartnerRegister(e);
                   }
                 }} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4">

                  {/* STEP 1: Profil & Alamat */}
                  {partnerStep === 1 && (
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          {partnerType === 'MERCHANT' ? 'Nama Lengkap Pemilik' : 'Nama Lengkap Driver'}
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Masukkan nama lengkap Anda sesuai KTP"
                          value={partnerName}
                          onChange={(e) => setPartnerName(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500 focus:bg-white transition-colors"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className={partnerType === 'MERCHANT' ? 'flex flex-col gap-1' : 'col-span-2 flex flex-col gap-1'}>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nomor WhatsApp</label>
                          <input
                            type="tel"
                            required
                            placeholder="Contoh: 081234567890"
                            value={partnerPhone}
                            onChange={(e) => setPartnerPhone(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500 focus:bg-white transition-colors"
                          />
                        </div>
                        {partnerType === 'MERCHANT' && (
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Alamat Email Akses</label>
                            <input
                              type="email"
                              required
                              placeholder="Contoh: merchant@gmail.com"
                              value={partnerEmail}
                              onChange={(e) => setPartnerEmail(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500 focus:bg-white transition-colors"
                            />
                          </div>
                        )}
                      </div>

                      {partnerType === 'MERCHANT' ? (
                        <>
                          <div className="flex flex-col gap-1 border-t border-slate-100 pt-3">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nama Toko / UMKM Kuliner</label>
                            <input
                              type="text"
                              required
                              placeholder="Contoh: Warung Soto Mak Nyus Tumpang"
                              value={partnerStoreName}
                              onChange={(e) => setPartnerStoreName(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500 focus:bg-white transition-colors"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kategori Menu Kuliner</label>
                            <select
                              value={partnerCategory}
                              onChange={(e) => setPartnerCategory(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500 focus:bg-white transition-colors cursor-pointer"
                            >
                              <option value="Bakso & Mie">🍜 Bakso & Mie</option>
                              <option value="Nasi & Lauk">🍛 Nasi & Lauk</option>
                              <option value="Sate & Bakaran">🍢 Sate & Bakaran</option>
                              <option value="Cemilan & Jajanan">🍘 Cemilan & Jajanan</option>
                              <option value="Minuman Segar">🥤 Minuman Segar</option>
                              <option value="Lainnya">🍽️ Kuliner Lainnya</option>
                            </select>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Alamat Lengkap Toko</label>
                            <textarea
                              required
                              placeholder="Sebutkan alamat lengkap, jalan, RT/RW, kelurahan di Kecamatan Tumpang"
                              rows={2}
                              value={partnerStoreAddress}
                              onChange={(e) => setPartnerStoreAddress(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500 focus:bg-white transition-colors"
                            ></textarea>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex flex-col gap-1 border-t border-slate-100 pt-3">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nomor Plat / Seri Kendaraan</label>
                            <input
                              type="text"
                              required
                              placeholder="Contoh: N 1234 XX (Motor / Mobil)"
                              value={partnerVehicle}
                              onChange={(e) => setPartnerVehicle(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500 focus:bg-white transition-colors"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Wilayah Operasional Utama</label>
                            <select
                              value={partnerArea}
                              onChange={(e) => setPartnerArea(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500 focus:bg-white transition-colors cursor-pointer"
                            >
                              <option value="">-- Pilih Wilayah Operasional --</option>
                              <option value="Tumpang Kota">📍 Tumpang Kota</option>
                              <option value="Desa Jeru">📍 Desa Jeru</option>
                              <option value="Desa Pulungdowo">📍 Desa Pulungdowo</option>
                              <option value="Desa Slamet">📍 Desa Slamet</option>
                              <option value="Desa Wringinsongo">📍 Desa Wringinsongo</option>
                              <option value="Desa Kidal">📍 Desa Kidal</option>
                              <option value="Desa Ngingit">📍 Desa Ngingit</option>
                              <option value="Desa Duwet">📍 Desa Duwet</option>
                              <option value="Desa Pandanajeng">📍 Desa Pandanajeng</option>
                              <option value="Desa Malangsuko">📍 Desa Malangsuko</option>
                              <option value="Desa Bokor">📍 Desa Bokor</option>
                            </select>
                          </div>
                        </>
                      )}

                      {/* Coordinate/Location Picker */}
                      <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          {partnerType === 'MERCHANT' ? 'Koordinat Tempat Usaha (Untuk Kurir)' : 'Koordinat Rumah / Titik Mangkal Base'}
                        </label>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-col">
                            <span className="text-[9px] font-semibold text-slate-400">Latitude</span>
                            <input 
                              type="number" 
                              step="0.000001" 
                              value={partnerLat} 
                              onChange={(e) => setPartnerLat(parseFloat(e.target.value) || -7.9482)}
                              className="bg-transparent border-none outline-none p-0 text-xs font-bold font-mono mt-0.5" 
                            />
                          </div>
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-col">
                            <span className="text-[9px] font-semibold text-slate-400">Longitude</span>
                            <input 
                              type="number" 
                              step="0.000001" 
                              value={partnerLng} 
                              onChange={(e) => setPartnerLng(parseFloat(e.target.value) || 112.7612)}
                              className="bg-transparent border-none outline-none p-0 text-xs font-bold font-mono mt-0.5" 
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.geolocation.getCurrentPosition(
                              (pos) => {
                                setPartnerLat(pos.coords.latitude);
                                setPartnerLng(pos.coords.longitude);
                                alert('Lokasi berhasil dideteksi!');
                              },
                              () => {
                                // Use default random coordinates in Tumpang area to simulate success
                                setPartnerLat(-7.9482 + (Math.random() - 0.5) * 0.01);
                                setPartnerLng(112.7612 + (Math.random() - 0.5) * 0.01);
                                alert('Gagal mendeteksi koordinat otomatis. Kami menggunakan koordinat titik pusat Kecamatan Tumpang.');
                              }
                            );
                          }}
                          className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-[10px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        >
                          📍 Gunakan Lokasi Saya Sekarang
                        </button>
                      </div>

                      {/* Image Attachments Uploaders */}
                      <div className="border-t border-slate-100 pt-3 flex flex-col gap-3">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Unggah Dokumen Pendukung</span>
                        
                        {/* Business Photo */}
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[10px] text-slate-600 font-bold">
                            {partnerType === 'MERCHANT' ? '1. Foto Tempat Usaha / Outlet UMKM' : '1. Foto Kendaraan Bersama Plat Nomor'}
                          </span>
                          <div className="flex items-center gap-3">
                            <label className="flex-1 border-2 border-dashed border-slate-200 hover:border-rose-400 bg-slate-50 rounded-xl p-4 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors text-center">
                              <input 
                                type="file" 
                                accept="image/*" 
                                onChange={(e) => handlePartnerFileChange(e, setBusinessPhoto)} 
                                className="hidden" 
                              />
                              <Store className="w-5 h-5 text-slate-400" />
                              <span className="text-[10px] font-bold text-slate-700">
                                {partnerType === 'MERCHANT' ? 'Pilih Foto Tempat Usaha' : 'Pilih Foto Kendaraan'}
                              </span>
                              <span className="text-[8px] text-slate-400">Format JPG, PNG (Max 5MB)</span>
                            </label>
                            {businessPhoto && (
                              <div className="w-16 h-16 rounded-xl border border-slate-200 overflow-hidden relative group">
                                <img src={businessPhoto} alt="Foto Pendukung" className="w-full h-full object-cover" />
                                <button 
                                  type="button" 
                                  onClick={() => setBusinessPhoto('')} 
                                  className="absolute inset-0 bg-red-600/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold cursor-pointer"
                                >
                                  Hapus
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ID Card Photo */}
                        <div className="flex flex-col gap-1.5 mt-1">
                          <span className="text-[10px] text-slate-600 font-bold">
                            {partnerType === 'MERCHANT' ? '2. Foto KTP / Kartu Identitas' : '2. Foto KTP / SIM Mitra Kurir'}
                          </span>
                          <div className="flex items-center gap-3">
                            <label className="flex-1 border-2 border-dashed border-slate-200 hover:border-rose-400 bg-slate-50 rounded-xl p-4 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors text-center">
                              <input 
                                type="file" 
                                accept="image/*" 
                                onChange={(e) => handlePartnerFileChange(e, setIdPhoto)} 
                                className="hidden" 
                              />
                              <Users className="w-5 h-5 text-slate-400" />
                              <span className="text-[10px] font-bold text-slate-700">
                                {partnerType === 'MERCHANT' ? 'Pilih Foto KTP' : 'Pilih Foto KTP/SIM'}
                              </span>
                              <span className="text-[8px] text-slate-400">Identitas pemilik usaha atau pengemudi</span>
                            </label>
                            {idPhoto && (
                              <div className="w-16 h-16 rounded-xl border border-slate-200 overflow-hidden relative group">
                                <img src={idPhoto} alt="Foto KTP/SIM" className="w-full h-full object-cover" />
                                <button 
                                  type="button" 
                                  onClick={() => setIdPhoto('')} 
                                  className="absolute inset-0 bg-red-600/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold cursor-pointer"
                                >
                                  Hapus
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>
                  )}

                  {/* STEP 2: Unduh & Tanda Tangan Kontrak */}
                  {partnerStep === 2 && (
                    <div className="flex flex-col gap-4 animate-fadeIn">
                      
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <span className="text-[10px] font-bold text-slate-700 block border-b border-slate-200 pb-1">Draf Dokumen Kontrak Perjanjian Kerjasama</span>
                        <div className="mt-2 text-[9px] text-slate-500 font-mono leading-relaxed h-[250px] overflow-y-auto pr-1 border border-slate-100 rounded-lg p-2 bg-white">
                          <p className="font-bold text-slate-800 text-center mb-1 text-[10px]">
                            {partnerType === 'MERCHANT' 
                              ? 'SURAT PERJANJIAN KERJA SAMA KEMITRAAN UMKM KULINER TUMPANG FOOD' 
                              : 'SURAT PERJANJIAN KERJA SAMA KEMITRAAN MITRA KURIR (DRIVER) TUMPANG FOOD'}
                          </p>
                          
                          <p className="font-bold text-slate-700 mt-2">PASAL 1: Para Pihak</p>
                          <p className="mb-1">Perjanjian Kerja Sama Kemitraan ini dibuat dan disepakati oleh:</p>
                          <p className="ml-2"><strong>PIHAK PERTAMA:</strong> Pengelola Platform Digital dan Layanan Pengantaran Tumpang Food, selanjutnya disebut "Tumpang Food".</p>
                          <p className="ml-2">
                            <strong>PIHAK KEDUA:</strong>{' '}
                            {partnerType === 'MERCHANT' ? (
                              <>{partnerName || '....................'} selaku Pemilik atau penanggung jawab usaha kuliner "{partnerStoreName || '....................'}", selanjutnya disebut "Merchant".</>
                            ) : (
                              <>{partnerName || '....................'} selaku Mitra Kurir Mandiri dengan Kendaraan No Plat {partnerVehicle || '....................'} di Wilayah {partnerArea || '....................'}, selanjutnya disebut "Mitra Driver".</>
                            )}
                          </p>

                          <p className="font-bold text-slate-700 mt-2">PASAL 2: Ruang Lingkup Kemitraan</p>
                          {partnerType === 'MERCHANT' ? (
                            <ol className="list-decimal ml-4 gap-0.5">
                              <li>Pihak Pertama menyediakan platform digital Tumpang Food sebagai media promosi, pemesanan makanan dan minuman, pembayaran, pengelolaan transaksi, serta layanan pengantaran kepada pelanggan.</li>
                              <li>Pihak Kedua memberikan kuasa kepada Pihak Pertama untuk memasarkan dan menerima pesanan atas produk yang dijual melalui aplikasi Tumpang Food.</li>
                              <li>Seluruh layanan pengantaran pesanan kepada pelanggan merupakan tanggung jawab Pihak Pertama melalui Driver Tumpang Food.</li>
                              <li>Merchant hanya bertanggung jawab menyiapkan pesanan sesuai standar kualitas dan menyerahkannya kepada Driver Tumpang Food.</li>
                              <li>Merchant tidak berkewajiban menyediakan layanan pengantaran sendiri terhadap pesanan yang diterima melalui aplikasi Tumpang Food, kecuali terdapat kesepakatan tertulis yang berbeda.</li>
                            </ol>
                          ) : (
                            <ol className="list-decimal ml-4 gap-0.5">
                              <li>Pihak Pertama menugaskan Pihak Kedua untuk menyediakan jasa pengantaran makanan/minuman yang dipesan Pelanggan melalui Platform Tumpang Food.</li>
                              <li>Pihak Kedua bertindak sebagai penyedia jasa mandiri (independen) dan bukan merupakan karyawan dari Pihak Pertama.</li>
                              <li>Pihak Kedua wajib mengantarkan pesanan dengan aman, higienis, utuh, dan sesuai dengan estimasi waktu pengiriman sistem.</li>
                            </ol>
                          )}

                          <p className="font-bold text-slate-700 mt-2">
                            {partnerType === 'MERCHANT' ? 'PASAL 3: Pendaftaran Merchant' : 'PASAL 3: Pendaftaran Mitra Driver'}
                          </p>
                          {partnerType === 'MERCHANT' ? (
                            <>
                              <p className="mb-1">Merchant wajib mengisi data yang benar meliputi: Nama Pemilik ({partnerName || '-'}), Nama Usaha ({partnerStoreName || '-'}), Email ({partnerEmail || '-'}), Nomor WhatsApp ({partnerPhone || '-'}), Alamat ({partnerStoreAddress || '-'}), Lokasi Usaha, Foto KTP, Foto Tempat Usaha, serta dokumen pendukung lainnya.</p>
                              <p>Merchant wajib mengunduh, mencetak, menandatanganinya di atas materai Rp10.000, kemudian mengunggah kembali Surat Perjanjian ini sebelum pendaftaran dapat diproses.</p>
                            </>
                          ) : (
                            <>
                              <p className="mb-1">Mitra Driver wajib melengkapi data profil asli berupa: Nama Lengkap ({partnerName || '-'}), No WhatsApp ({partnerPhone || '-'}), Plat Kendaraan ({partnerVehicle || '-'}), Wilayah Operasional ({partnerArea || '-'}), Koordinat Base, Foto KTP/SIM, Foto Kendaraan, serta berkas pendukung lainnya.</p>
                              <p>Mitra Driver wajib menyetujui, mencetak, menandatangani di atas materai Rp10.000 fisik, lalu mengunggah draf kontrak ini kembali untuk diperiksa.</p>
                            </>
                          )}

                          <p className="font-bold text-slate-700 mt-2">
                            {partnerType === 'MERCHANT' ? 'PASAL 4: Verifikasi Merchant' : 'PASAL 4: Verifikasi Mitra Driver'}
                          </p>
                          <ol className="list-decimal ml-4">
                            <li>Seluruh data akan diverifikasi oleh Tumpang Food.</li>
                            <li>Tumpang Food berhak menerima atau menolak pendaftaran {partnerType === 'MERCHANT' ? 'Merchant' : 'Mitra Driver'} apabila ditemukan data yang tidak sesuai.</li>
                            <li>Keputusan hasil verifikasi menjadi kewenangan Tumpang Food.</li>
                          </ol>

                           {partnerType === 'MERCHANT' ? (
                            <>
                              <p className="font-bold text-slate-700 mt-2">PASAL 5: Sistem Pembayaran</p>
                              <ol className="list-decimal ml-4">
                                <li>Seluruh pembayaran transaksi dilakukan melalui QRIS resmi milik Tumpang Food.</li>
                                <li>Dana transaksi akan diterima terlebih dahulu oleh Pihak Pertama.</li>
                                <li>Merchant tidak diperkenankan menerima pembayaran secara langsung dari pelanggan atas transaksi yang berasal dari aplikasi Tumpang Food, kecuali mendapat persetujuan tertulis dari Pihak Pertama.</li>
                                <li>Setelah transaksi dinyatakan selesai, dana akan diproses untuk pencairan kepada Merchant sesuai ketentuan dalam Perjanjian ini.</li>
                              </ol>

                              <p className="font-bold text-slate-700 mt-2">PASAL 6: Biaya Layanan, Komisi, Ongkos Pengantaran, dan Pencairan Dana</p>
                              <ol className="list-decimal ml-4">
                                <li>Merchant menyetujui bahwa Pihak Pertama berhak memperoleh komisi sebesar 10% (sepuluh persen) dari nilai subtotal makanan atau minuman yang terjual pada setiap transaksi melalui aplikasi Tumpang Food.</li>
                                <li>Biaya Layanan (Service Fee) dibebankan kepada Pelanggan (Customer) sebagai biaya penggunaan platform digital Tumpang Food dan bukan merupakan potongan dari pendapatan Merchant.</li>
                                <li>Besaran Biaya Layanan kepada Pelanggan ditetapkan oleh Tumpang Food sesuai kebijakan yang berlaku dan dapat berubah sewaktu-waktu dengan pemberitahuan melalui aplikasi.</li>
                                <li>Biaya pengantaran (ongkos kirim) yang dibayarkan oleh Pelanggan merupakan pendapatan Pihak Pertama sebagai penyedia layanan pengantaran melalui Driver Tumpang Food dan bukan merupakan bagian dari pendapatan Merchant.</li>
                                <li>Dana hasil penjualan Merchant akan dipotong komisi sebesar 10% (sepuluh persen) sebelum ditransfer ke rekening Merchant.</li>
                                <li>Dana hasil penjualan Merchant setelah dipotong komisi akan ditransfer ke rekening Merchant paling lambat H+1 (satu hari kalender) setelah transaksi dinyatakan selesai.</li>
                                <li>Apabila H+1 jatuh pada hari libur nasional, cuti bersama, atau terjadi gangguan sistem perbankan, pencairan dana akan dilakukan pada hari kerja berikutnya.</li>
                                <li>Merchant wajib memastikan bahwa data rekening bank yang didaftarkan adalah benar, aktif, dan atas nama yang sah. Pihak Pertama tidak bertanggung jawab atas keterlambatan atau kegagalan pencairan yang disebabkan oleh kesalahan data rekening yang diberikan oleh Merchant.</li>
                                <li>Pihak Pertama berhak melakukan perubahan terhadap kebijakan Biaya Layanan kepada Pelanggan dengan pemberitahuan melalui aplikasi atau media komunikasi resmi Tumpang Food. Perubahan tersebut tidak memengaruhi besaran komisi Merchant, kecuali ditentukan lain melalui kesepakatan tertulis antara Pihak Pertama dan Merchant.</li>
                              </ol>

                              <p className="font-bold text-slate-700 mt-2">PASAL 7: Harga Produk</p>
                              <ol className="list-decimal ml-4">
                                <li>Merchant berhak menentukan harga jual setiap produk yang dipasarkan melalui aplikasi Tumpang Food.</li>
                                <li>Merchant bertanggung jawab atas kebenaran harga yang ditampilkan pada aplikasi.</li>
                                <li>Perubahan harga hanya dapat dilakukan melalui Dashboard Merchant.</li>
                                <li>Tumpang Food tidak bertanggung jawab atas kerugian akibat kesalahan harga yang diinput oleh Merchant.</li>
                              </ol>

                              <p className="font-bold text-slate-700 mt-2">PASAL 8: Hak dan Kewajiban Merchant</p>
                              <p className="mb-0.5">Merchant wajib:</p>
                              <ul className="list-disc ml-4 mb-1">
                                <li>Menyediakan makanan sesuai pesanan.</li>
                                <li>Menjaga kualitas dan kebersihan makanan.</li>
                                <li>Menyelesaikan pesanan tepat waktu.</li>
                                <li>Menyerahkan pesanan kepada Driver Tumpang Food.</li>
                                <li>Tidak mengenakan biaya tambahan di luar harga yang tercantum pada aplikasi.</li>
                                <li>Memperbarui stok dan harga apabila terdapat perubahan.</li>
                                <li>Menjaga kerahasiaan akun Merchant.</li>
                              </ul>
                              <p className="mb-0.5">Merchant dilarang:</p>
                              <ul className="list-disc ml-4">
                                <li>Menjual barang ilegal.</li>
                                <li>Menjual makanan kedaluwarsa.</li>
                                <li>Memalsukan transaksi.</li>
                                <li>Mengalihkan transaksi ke luar aplikasi.</li>
                                <li>Menyalahgunakan sistem Tumpang Food.</li>
                              </ul>

                              <p className="font-bold text-slate-700 mt-2">PASAL 9: Hak Pihak Pertama</p>
                              <p className="mb-0.5">Pihak Pertama berhak:</p>
                              <ul className="list-disc ml-4">
                                <li>Melakukan verifikasi Merchant.</li>
                                <li>Menentukan besaran biaya layanan sesuai kebijakan perusahaan.</li>
                                <li>Memotong komisi sebesar 10% dari setiap transaksi Merchant serta biaya layanan harian sesuai skema yang berlaku.</li>
                                <li>Mengelola pembayaran pelanggan.</li>
                                <li>Mengelola layanan pengantaran.</li>
                                <li>Menentukan Driver yang akan mengambil pesanan.</li>
                                <li>Menolak transaksi yang terindikasi penipuan.</li>
                                <li>Melakukan audit apabila diperlukan.</li>
                                <li>Menangguhkan atau mengakhiri kerja sama apabila Merchant melanggar ketentuan.</li>
                              </ul>

                              <p className="font-bold text-slate-700 mt-2">PASAL 10: Penangguhan dan Pengakhiran Kerja Sama</p>
                              <p className="mb-0.5">Tumpang Food berhak menangguhkan atau mengakhiri kerja sama apabila Merchant:</p>
                              <ul className="list-disc ml-4">
                                <li>Memberikan data palsu.</li>
                                <li>Melakukan penipuan.</li>
                                <li>Menjual produk yang dilarang.</li>
                                <li>Melanggar ketentuan dalam Perjanjian ini.</li>
                              </ul>
                            </>
                          ) : (
                            <>
                              <p className="font-bold text-slate-700 mt-2">PASAL 5: Sistem Pendapatan & Ongkos Kirim</p>
                              <ol className="list-decimal ml-4">
                                <li>Mitra Driver berhak menerima pembayaran delivery fee (ongkos kirim) atas setiap pengantaran pesanan yang berhasil diselesaikan secara penuh ke saldo dompet aplikasi Driver Tumpang Food.</li>
                                <li>Besaran tarif pengantaran dihitung secara otomatis oleh sistem Tumpang Food berdasarkan jarak tempuh (kilometer) dan kondisi operasional wilayah Kecamatan Tumpang.</li>
                                <li>Pembagian pendapatan dan potongan komisi platform (jika ada) akan dipotong secara otomatis di dalam saldo dompet Driver sesuai kebijakan resmi platform.</li>
                              </ol>

                              <p className="font-bold text-slate-700 mt-2">PASAL 6: Tata Tertib, Kode Etik & Sanksi</p>
                              <ol className="list-decimal ml-4">
                                <li>Driver wajib mengenakan pakaian yang rapi, sopan, bersih, serta menjaga integritas nama baik Tumpang Food di hadapan pelanggan dan merchant.</li>
                                <li>Driver wajib mematuhi seluruh peraturan lalu lintas dan memiliki SIM serta dokumen kendaraan fisik (STNK) yang sah dan aktif.</li>
                                <li>Driver dilarang keras melakukan kecurangan berupa transaksi fiktif, pemalsuan lokasi GPS, atau bekerjasama secara curang dengan merchant/pelanggan.</li>
                                <li>Apabila terbukti melanggar kode etik atau melakukan kecurangan, Pihak Pertama berhak melakukan pembekuan saldo serta penangguhan akun (suspend) sementara maupun permanen.</li>
                              </ol>
                            </>
                          )}

                          <p className="font-bold text-slate-700 mt-2">PASAL 11: Keadaan Kahar (Force Majeure)</p>
                          <p>Kedua belah pihak dibebaskan dari tanggung jawab apabila tidak dapat melaksanakan kewajibannya akibat bencana alam, kebakaran, perang, gangguan sistem nasional, atau keadaan lain di luar kendali para pihak.</p>

                          <p className="font-bold text-slate-700 mt-2">PASAL 12: Penyelesaian Perselisihan</p>
                          <ol className="list-decimal ml-4">
                            <li>Apabila terjadi perselisihan, kedua belah pihak sepakat menyelesaikannya terlebih dahulu melalui musyawarah.</li>
                            <li>Apabila tidak tercapai kesepakatan, penyelesaian dilakukan sesuai dengan ketentuan hukum yang berlaku di Republik Indonesia.</li>
                          </ol>

                          <p className="font-bold text-slate-700 mt-2">PASAL 13: Penutup</p>
                          <p className="mb-1">Dengan menandatangani Perjanjian ini, Merchant menyatakan telah membaca, memahami, dan menyetujui seluruh isi Perjanjian Kerja Sama Kemitraan Tumpang Food tanpa adanya paksaan dari pihak mana pun.</p>
                          <p>Perjanjian ini mulai berlaku sejak tanggal disetujui oleh Tumpang Food.</p>

                          <p className="mt-4 text-center border-t border-slate-200 pt-3 font-semibold">TANDA TANGAN</p>
                          <p className="text-center text-[8px] text-slate-400 mb-2">Malang, {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                          
                          <div className="grid grid-cols-2 text-center mt-3 font-semibold text-slate-700">
                            <div>
                              <p>PIHAK PERTAMA,</p>
                              <p>TUMPANG FOOD</p>
                              <br /><br /><br />
                              <p className="underline">(...............................)</p>
                              <p className="text-[7px] text-slate-400 font-normal">Nama Jelas</p>
                            </div>
                            <div>
                              <p>PIHAK KEDUA,</p>
                              <p>MERCHANT</p>
                              <p className="text-[7px] text-slate-400 font-normal mt-0.5">(Materai Rp10.000)</p>
                              <br /><br />
                              <p className="underline font-bold">(...............................)</p>
                              <p className="text-[8px] font-normal text-slate-400">Nama Pemilik / Owner "{partnerStoreName || 'Nama Toko'}"</p>
                            </div>
                          </div>
                        </div>

                        {/* Download Contract Button */}
                        <button
                          type="button"
                          onClick={() => {
                            const contractText = `SURAT PERJANJIAN KERJA SAMA KEMITRAAN UMKM KULINER TUMPANG FOOD\n` +
                              `========================================================================\n\n` +
                              `PASAL 1\n` +
                              `Para Pihak\n\n` +
                              `Perjanjian Kerja Sama Kemitraan ini dibuat dan disepakati oleh:\n\n` +
                              `PIHAK PERTAMA\n` +
                              `Pengelola Platform Digital dan Layanan Pengantaran Tumpang Food, selanjutnya disebut "Tumpang Food".\n\n` +
                              `PIHAK KEDUA\n` +
                              `Nama Pemilik : ${partnerName || '....................'}\n` +
                              `Nama Usaha   : "${partnerStoreName || '....................'}"\n` +
                              `Email        : ${partnerEmail || '....................'}\n` +
                              `WhatsApp     : ${partnerPhone || '....................'}\n` +
                              `Alamat       : ${partnerStoreAddress || '....................'}\n` +
                              `selanjutnya disebut "Merchant".\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 2\n` +
                              `Ruang Lingkup Kerja Sama\n\n` +
                              `1. Pihak Pertama menyediakan platform digital Tumpang Food sebagai media promosi, pemesanan makanan dan minuman, pembayaran, pengelolaan transaksi, serta layanan pengantaran kepada pelanggan.\n` +
                              `2. Pihak Kedua memberikan kuasa kepada Pihak Pertama untuk memasarkan dan menerima pesanan atas produk yang dijual melalui aplikasi Tumpang Food.\n` +
                              `3. Seluruh layanan pengantaran pesanan kepada pelanggan merupakan tanggung jawab Pihak Pertama melalui Driver Tumpang Food.\n` +
                              `4. Merchant hanya bertanggung jawab menyiapkan pesanan sesuai standar kualitas dan menyerahkannya kepada Driver Tumpang Food.\n` +
                              `5. Merchant tidak berkewajiban menyediakan layanan pengantaran sendiri terhadap pesanan yang diterima melalui aplikasi Tumpang Food, kecuali terdapat kesepakatan tertulis yang berbeda.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 3\n` +
                              `Pendaftaran Merchant\n\n` +
                              `Merchant wajib mengisi data yang benar meliputi: Nama Pemilik, Nama Usaha, Email, Nomor WhatsApp, Alamat, Lokasi Usaha, Foto KTP, Foto Tempat Usaha, dan Dokumen pendukung lainnya.\n` +
                              `Merchant wajib mengunduh, mencetak, menandatanganinya di atas materai Rp10.000, kemudian mengunggah kembali Surat Perjanjian ini sebelum pendaftaran dapat diproses.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 4\n` +
                              `Verifikasi Merchant\n\n` +
                              `1. Seluruh data akan diverifikasi oleh Tumpang Food.\n` +
                              `2. Tumpang Food berhak menerima atau menolak pendaftaran Merchant apabila ditemukan data yang tidak sesuai.\n` +
                              `3. Keputusan hasil verifikasi menjadi kewenangan Tumpang Food.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 5\n` +
                              `Sistem Pembayaran\n\n` +
                              `1. Seluruh pembayaran transaksi dilakukan melalui QRIS resmi milik Tumpang Food.\n` +
                              `2. Dana transaksi akan diterima terlebih dahulu oleh Pihak Pertama.\n` +
                              `3. Merchant tidak diperkenankan menerima pembayaran secara langsung dari pelanggan atas transaksi yang berasal dari aplikasi Tumpang Food, kecuali mendapat persetujuan tertulis dari Pihak Pertama.\n` +
                              `4. Setelah transaksi dinyatakan selesai, dana akan diproses untuk pencairan kepada Merchant sesuai ketentuan dalam Perjanjian ini.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 6\n` +
                              `Biaya Layanan, Komisi, Ongkos Pengantaran, dan Pencairan Dana\n\n` +
                              `1. Merchant menyetujui bahwa Pihak Pertama berhak memperoleh komisi sebesar 10% (sepuluh persen) dari nilai subtotal makanan atau minuman yang terjual pada setiap transaksi melalui aplikasi Tumpang Food.\n` +
                              `2. Biaya Layanan (Service Fee) dibebankan kepada Pelanggan (Customer) sebagai biaya penggunaan platform digital Tumpang Food dan bukan merupakan potongan dari pendapatan Merchant.\n` +
                              `3. Besaran Biaya Layanan kepada Pelanggan ditetapkan oleh Tumpang Food sesuai kebijakan yang berlaku dan dapat berubah sewaktu-waktu dengan pemberitahuan melalui aplikasi.\n` +
                              `4. Biaya pengantaran (ongkos kirim) yang dibayarkan oleh Pelanggan merupakan pendapatan Pihak Pertama sebagai penyedia layanan pengantaran melalui Driver Tumpang Food dan bukan merupakan bagian dari pendapatan Merchant.\n` +
                              `5. Dana hasil penjualan Merchant akan dipotong komisi sebesar 10% (sepuluh persen) sebelum ditransfer ke rekening Merchant.\n` +
                              `6. Dana hasil penjualan Merchant setelah dipotong komisi akan ditransfer ke rekening Merchant paling lambat H+1 (satu hari kalender) setelah transaksi dinyatakan selesai.\n` +
                              `7. Apabila H+1 jatuh pada hari libur nasional, cuti bersama, atau terjadi gangguan sistem perbankan, pencairan dana akan dilakukan pada hari kerja berikutnya.\n` +
                              `8. Merchant wajib memastikan bahwa data rekening bank yang didaftarkan adalah benar, aktif, dan atas nama yang sah. Pihak Pertama tidak bertanggung jawab atas keterlambatan atau kegagalan pencairan yang disebabkan oleh kesalahan data rekening yang diberikan oleh Merchant.\n` +
                              `9. Pihak Pertama berhak melakukan perubahan terhadap kebijakan Biaya Layanan kepada Pelanggan dengan pemberitahuan melalui aplikasi atau media komunikasi resmi Tumpang Food. Perubahan tersebut tidak memengaruhi besaran komisi Merchant, kecuali ditentukan lain melalui kesepakatan tertulis antara Pihak Pertama dan Merchant.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 7\n` +
                              `Harga Produk\n\n` +
                              `1. Merchant berhak menentukan harga jual setiap produk yang dipasarkan melalui aplikasi Tumpang Food.\n` +
                              `2. Merchant bertanggung jawab atas kebenaran harga yang ditampilkan pada aplikasi.\n` +
                              `3. Perubahan harga hanya dapat dilakukan melalui Dashboard Merchant.\n` +
                              `4. Tumpang Food tidak bertanggung jawab atas kerugian akibat kesalahan harga yang diinput oleh Merchant.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 8\n` +
                              `Hak dan Kewajiban Merchant\n\n` +
                              `Merchant wajib:\n` +
                              `- Menyediakan makanan sesuai pesanan.\n` +
                              `- Menjaga kualitas dan kebersihan makanan.\n` +
                              `- Menyelesaikan pesanan tepat waktu.\n` +
                              `- Menyerahkan pesanan kepada Driver Tumpang Food.\n` +
                              `- Tidak mengenakan biaya tambahan di luar harga yang tercantum pada aplikasi.\n` +
                              `- Memperbarui stok dan harga apabila terdapat perubahan.\n` +
                              `- Menjaga kerahasiaan akun Merchant.\n\n` +
                              `Merchant dilarang:\n` +
                              `- Menjual barang ilegal.\n` +
                              `- Menjual makanan kedaluwarsa.\n` +
                              `- Memalsukan transaksi.\n` +
                              `- Mengalihkan transaksi ke luar aplikasi.\n` +
                              `- Menyalahgunakan sistem Tumpang Food.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 9\n` +
                              `Hak Pihak Pertama\n\n` +
                              `Pihak Pertama berhak:\n` +
                              `- Melakukan verifikasi Merchant.\n` +
                              `- Menentukan besaran biaya layanan sesuai kebijakan perusahaan.\n` +
                              `- Memotong komisi sebesar 10% dari setiap transaksi Merchant serta biaya layanan harian.\n` +
                              `- Mengelola pembayaran pelanggan.\n` +
                              `- Mengelola layanan pengantaran.\n` +
                              `- Menentukan Driver yang akan mengambil pesanan.\n` +
                              `- Menolak transaksi yang terindikasi penipuan.\n` +
                              `- Melakukan audit apabila diperlukan.\n` +
                              `- Menangguhkan atau mengakhiri kerja sama apabila Merchant melanggar ketentuan.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 10\n` +
                              `Penangguhan dan Pengakhiran Kerja Sama\n\n` +
                              `Tumpang Food berhak menangguhkan atau mengakhiri kerja sama apabila Merchant:\n` +
                              `- Memberikan data palsu.\n` +
                              `- Melakukan penipuan.\n` +
                              `- Menjual produk yang dilarang.\n` +
                              `- Melanggar ketentuan dalam Perjanjian ini.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 11\n` +
                              `Keadaan Kahar (Force Majeure)\n\n` +
                              `Kedua belah pihak dibebaskan dari tanggung jawab apabila tidak dapat melaksanakan kewajibannya akibat bencana alam, kebakaran, perang, gangguan sistem nasional, atau keadaan lain di luar kendali para pihak.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 12\n` +
                              `Penyelesaian Perselisihan\n\n` +
                              `1. Apabila terjadi perselisihan, kedua belah pihak sepakat menyelesaikannya terlebih dahulu melalui musyawarah.\n` +
                              `2. Apabila tidak tercapai kesepakatan, penyelesaian dilakukan sesuai dengan ketentuan hukum yang berlaku di Republik Indonesia.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 13\n` +
                              `Penutup\n\n` +
                              `Dengan menandatangani Perjanjian ini, Merchant menyatakan telah membaca, memahami, dan menyetujui seluruh isi Perjanjian Kerja Sama Kemitraan Tumpang Food tanpa adanya paksaan dari pihak mana pun.\n` +
                              `Perjanjian ini mulai berlaku sejak tanggal disetujui oleh Tumpang Food.\n\n\n` +
                              `                               TANDA TANGAN\n\n` +
                              `Malang, ${new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}\n\n` +
                              `      PIHAK PERTAMA,                              PIHAK KEDUA,\n` +
                              `       TUMPANG FOOD                                MERCHANT\n\n\n` +
                              `                                              [ MATERAI Rp10.000 ]\n\n\n` +
                              `  ( ________________________ )              ( ________________________ )\n` +
                              `          Nama Jelas                                 Nama Jelas\n` +
                              `                                            Owner "${partnerStoreName || 'Nama Toko'}"`;
                            
                            const blob = new Blob([contractText], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = `Kontrak_Kemitraan_${(partnerStoreName || 'Toko').replace(/\s+/g, '_')}.txt`;
                            link.click();
                            URL.revokeObjectURL(url);
                            alert('File Kontrak berhasil diunduh ke komputer Anda. Silakan simpan, cetak, beri Materai Rp10.000 fisik, dan tanda tangani.');
                          }}
                          className="w-full mt-2.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-[10px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Unduh Dokumen Kontrak (.txt)
                        </button>
                      </div>

                      {/* Instructions for Physical Sign and Stamp */}
                      <div className="flex flex-col gap-2.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Panduan Penyelesaian Kontrak Fisik</span>
                        
                        <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 flex flex-col gap-2.5 text-[10px] text-slate-700 leading-relaxed">
                          <div className="flex gap-2">
                            <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center font-bold text-[8px] flex-shrink-0 mt-0.5">1</span>
                            <p><strong>Unduh draf kontrak</strong> di atas menggunakan tombol <strong>"Unduh Dokumen Kontrak (.txt)"</strong>.</p>
                          </div>
                          <div className="flex gap-2">
                            <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center font-bold text-[8px] flex-shrink-0 mt-0.5">2</span>
                            <p><strong>Cetak (Print)</strong> dokumen draf tersebut pada kertas fisik.</p>
                          </div>
                          <div className="flex gap-2">
                            <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center font-bold text-[8px] flex-shrink-0 mt-0.5">3</span>
                            <p>Tempelkan <strong>Materai Rp10.000 Fisik</strong> pada area tanda tangan Pihak Kedua, lalu bubuhkan <strong>tanda tangan basah</strong> Anda di atas materai tersebut.</p>
                          </div>
                          <div className="flex gap-2">
                            <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center font-bold text-[8px] flex-shrink-0 mt-0.5">4</span>
                            <p><strong>Foto atau Pindai (Scan)</strong> dokumen kontrak bermaterai tersebut secara utuh dan jelas (tulisan harus terbaca terang).</p>
                          </div>
                          <div className="flex gap-2">
                            <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center font-bold text-[8px] flex-shrink-0 mt-0.5">5</span>
                            <p><strong>Unggah kembali</strong> hasil foto/scan dokumen kontrak bermaterai tersebut pada tombol di bawah ini.</p>
                          </div>
                        </div>

                        {/* File Upload Component */}
                        <div className="flex flex-col gap-1.5 mt-1 border-t border-slate-100 pt-3">
                          <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">Unggah Foto / Hasil Scan Kontrak Bermaterai Rp10.000</label>
                          <div className="flex items-center gap-3">
                            <label className="flex-1 border-2 border-dashed border-slate-200 hover:border-rose-400 bg-slate-50 rounded-xl p-4 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors text-center">
                              <input 
                                type="file" 
                                accept="image/*" 
                                onChange={(e) => {
                                  handlePartnerFileChange(e, (dataUrl) => {
                                    setContractPhoto(dataUrl);
                                    setSignatureSigned(true);
                                  });
                                }} 
                                className="hidden" 
                              />
                              <ClipboardList className="w-5 h-5 text-slate-400" />
                              <span className="text-[10px] font-bold text-slate-700">Pilih Foto Kontrak Bermaterai Anda</span>
                              <span className="text-[8px] text-slate-400">Format gambar JPG, PNG (seluruh kertas kontrak terlihat utuh)</span>
                            </label>
                            {contractPhoto && (
                              <div className="w-16 h-16 rounded-xl border border-slate-200 overflow-hidden relative group">
                                <img src={contractPhoto} alt="Hasil Kontrak Bermaterai" className="w-full h-full object-cover" />
                                <button 
                                  type="button" 
                                  onClick={() => {
                                    setContractPhoto('');
                                    setSignatureSigned(false);
                                  }} 
                                  className="absolute inset-0 bg-red-600/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold cursor-pointer"
                                >
                                  Hapus
                                </button>
                              </div>
                            )}
                          </div>
                          {signatureSigned && (
                            <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-0.5 mt-1 justify-center">
                              ✓ Dokumen Kontrak Bermaterai Rp10.000 Berhasil Diunggah!
                            </span>
                          )}
                        </div>
                      </div>

                    </div>
                  )}

                  {/* STEP 3: Ringkasan Sebelum Kirim */}
                  {partnerStep === 3 && (
                    <div className="flex flex-col gap-4">
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2 text-xs">
                        <span className="font-bold text-slate-800 text-center text-sm border-b border-slate-200 pb-1">Ringkasan Berkas Pendaftaran</span>
                        
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div>
                            <span className="text-slate-400 block font-semibold">Nama Pemilik</span>
                            <span className="text-slate-800 font-bold">{partnerName}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-semibold">Toko UMKM</span>
                            <span className="text-slate-800 font-bold">{partnerStoreName}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-semibold">Email Kunci</span>
                            <span className="text-slate-800 font-bold">{partnerEmail}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-semibold">No WhatsApp</span>
                            <span className="text-slate-800 font-bold">{partnerPhone}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-400 block font-semibold">Alamat Usaha</span>
                            <span className="text-slate-800 font-bold">{partnerStoreAddress}</span>
                          </div>
                        </div>

                        <div className="border-t border-slate-200/60 pt-2 flex justify-between gap-1 text-[8px] font-bold text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-slate-400 uppercase">Tempat Usaha</span>
                            <img src={businessPhoto} className="w-10 h-10 object-cover rounded border border-slate-200" />
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-slate-400 uppercase">KTP Pemilik</span>
                            <img src={idPhoto} className="w-10 h-10 object-cover rounded border border-slate-200" />
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-slate-400 uppercase">Tanda Tangan</span>
                            <img src={contractPhoto} className="w-10 h-10 object-cover rounded border border-slate-200 bg-white" />
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start gap-2.5">
                        <input
                          id="agree-merchant-terms"
                          type="checkbox"
                          checked={partnerTermsAccepted}
                          onChange={(e) => setPartnerTermsAccepted(e.target.checked)}
                          className="w-4 h-4 mt-0.5 rounded text-rose-600 focus:ring-rose-500 border-slate-300 accent-rose-600 cursor-pointer"
                        />
                        <label htmlFor="agree-merchant-terms" className="text-[11px] text-slate-600 leading-normal cursor-pointer font-medium">
                          Saya menyatakan bahwa seluruh berkas di atas adalah benar dan sah, serta saya menyetujui seluruh ketentuan dalam <strong>Surat Perjanjian Kerja Sama Kemitraan Tumpang Food</strong>.
                        </label>
                      </div>

                      <div className="text-[10px] text-slate-400 text-center leading-relaxed">
                        Dengan menekan tombol Kirim, Anda secara sah mengirim berkas pendaftaran kemitraan beserta tanda tangan digital untuk ditinjau oleh Admin Tumpang Food.
                      </div>
                    </div>
                  )}

                   {/* Wizard Navigation Action Buttons */}
                  <div className="flex gap-2.5 mt-2 border-t border-slate-100 pt-3">
                    {partnerStep > 1 && (
                      <button
                        type="button"
                        onClick={() => setPartnerStep((prev) => prev - 1)}
                        className="py-3 px-4 border border-slate-200 hover:border-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer flex-shrink-0"
                      >
                        Kembali
                      </button>
                    )}

                    <button
                      type="submit"
                      disabled={
                        partnerSubmitLoading || 
                        (partnerStep === 3 && !partnerTermsAccepted)
                      }
                      className="w-full py-3 bg-rose-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 hover:bg-rose-700 disabled:opacity-60 shadow-lg shadow-rose-600/10 cursor-pointer"
                    >
                      {partnerSubmitLoading ? (
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      ) : partnerStep < 3 ? (
                        'Lanjut ke Tanda Tangan Kontrak'
                      ) : (
                        'Kirim Formulir Pendaftaran'
                      )}
                    </button>
                  </div>

                </form>
              </div>
            )}

            {/* Quick Demo Dashboard Access Card */}
            <div id="demo-dashboard-quick-access-partner" className="mt-8 bg-gradient-to-br from-slate-900 via-slate-850 to-slate-950 text-white rounded-2xl p-5 border border-slate-800 shadow-xl relative overflow-hidden">
              <div className="absolute right-[-15px] top-[-15px] w-24 h-24 bg-rose-500/10 rounded-full blur-xl"></div>
              <div className="relative z-10 flex flex-col gap-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-lg">🔑</span>
                  <div>
                    <h4 className="font-display font-bold text-xs uppercase tracking-wider text-amber-400">Pusat Portal & Dashboard Demo</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">Beralih peran secara instan untuk mensimulasikan alur Tumpang Food</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-1">
                  {/* Admin Button */}
                  <button
                    id="btn-switch-admin-partner"
                    onClick={() => {
                      if (onSelectRole) onSelectRole('ADMIN');
                    }}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-950 transition-all text-center cursor-pointer active:scale-95 group"
                  >
                    <span className="text-xl group-hover:scale-110 transition-transform mb-1">🛡️</span>
                    <span className="font-bold text-[10px] tracking-tight">Admin Portal</span>
                    <span className="text-[8px] text-slate-400 font-medium mt-0.5 truncate w-full">Verifikasi QRIS</span>
                  </button>

                  {/* Merchant Button */}
                  <button
                    id="btn-switch-merchant-partner"
                    onClick={() => {
                      if (onSelectRole) onSelectRole('MERCHANT');
                    }}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-950 transition-all text-center cursor-pointer active:scale-95 group"
                  >
                    <span className="text-lg group-hover:scale-110 transition-transform mb-1">🏪</span>
                    <span className="font-bold text-[10px] tracking-tight">Merchant</span>
                    <span className="text-[8px] text-slate-400 font-medium mt-0.5 truncate w-full">Atur Menu/Pesanan</span>
                  </button>

                  {/* Driver Button */}
                  <button
                    id="btn-switch-driver-partner"
                    onClick={() => {
                      if (onSelectRole) onSelectRole('DRIVER');
                    }}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-950 transition-all text-center cursor-pointer active:scale-95 group"
                  >
                    <span className="text-lg group-hover:scale-110 transition-transform mb-1">🚴</span>
                    <span className="font-bold text-[10px] tracking-tight">Kurir/Driver</span>
                    <span className="text-[8px] text-slate-400 font-medium mt-0.5 truncate w-full">Antar Makanan</span>
                  </button>
                </div>

                {/* Instant Simulation Bypass Section */}
                <div className="border-t border-slate-800/60 pt-3 mt-1 flex flex-col gap-2">
                  <span className="text-[9px] font-bold text-amber-500 uppercase tracking-wider block">⚡ Masuk Dashboard Langsung (Simulasi Bypass)</span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      id="btn-instant-admin-partner"
                      onClick={() => {
                        if (onInstantDashboard) onInstantDashboard('ADMIN');
                      }}
                      className="py-2.5 px-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-all text-center cursor-pointer font-bold text-[9px] active:scale-95 flex flex-col items-center justify-center gap-1"
                    >
                      <span>🛡️ Admin</span>
                    </button>
                    <button
                      id="btn-instant-merchant-partner"
                      onClick={() => {
                        if (onInstantDashboard) onInstantDashboard('MERCHANT');
                      }}
                      className="py-2.5 px-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all text-center cursor-pointer font-bold text-[9px] active:scale-95 flex flex-col items-center justify-center gap-1"
                    >
                      <span>🏪 Merchant</span>
                    </button>
                    <button
                      id="btn-instant-driver-partner"
                      onClick={() => {
                        if (onInstantDashboard) onInstantDashboard('DRIVER');
                      }}
                      className="py-2.5 px-1 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-all text-center cursor-pointer font-bold text-[9px] active:scale-95 flex flex-col items-center justify-center gap-1"
                    >
                      <span>🚴 Driver</span>
                    </button>
                  </div>
                </div>

                <div className="text-[9px] text-slate-400 text-center bg-slate-950/30 py-1.5 rounded-lg border border-slate-800/50 mt-1">
                  💡 Klik salah satu tombol di atas untuk membuka pemilih peran Multi-Persona
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Sticky Bottom Navigation Footer (Shopee Food Style) */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-slate-100 px-6 py-2.5 flex justify-between items-center z-[90] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] rounded-t-3xl">
        {/* Beranda */}
        <button 
          onClick={() => {
            setSelectedMerchant(null);
            setActiveTab('home');
          }}
          className={`flex flex-col items-center gap-1.5 flex-1 py-1 cursor-pointer transition-all ${
            (activeTab === 'home' || activeTab === 'merchant-detail' || activeTab === 'cart' || activeTab === 'checkout')
              ? 'text-rose-600 font-extrabold scale-105' 
              : 'text-slate-400 hover:text-slate-600 font-semibold'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Beranda</span>
        </button>

        {/* Riwayat Pesanan */}
        <button 
          onClick={() => {
            setHistorySearched(false);
            setHistoryPhone('');
            setHistoryOrders([]);
            setActiveTab('history');
          }}
          className={`flex flex-col items-center gap-1.5 flex-1 py-1 cursor-pointer transition-all ${
            (activeTab === 'history' || activeTab === 'tracking' || activeTab === 'payment')
              ? 'text-rose-600 font-extrabold scale-105' 
              : 'text-slate-400 hover:text-slate-600 font-semibold'
          }`}
        >
          <ClipboardList className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Riwayat Pesanan</span>
        </button>

        {/* Pendaftaran Merchant */}
        <button 
          id="nav-partner-register"
          onClick={() => {
            setActiveTab('partner-register');
          }}
          className={`flex flex-col items-center gap-1.5 flex-1 py-1 cursor-pointer transition-all ${
            activeTab === 'partner-register' 
              ? 'text-rose-600 font-extrabold scale-105' 
              : 'text-slate-400 hover:text-slate-600 font-semibold'
          }`}
        >
          <UserPlus className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Pendaftaran</span>
        </button>

        {/* Portal Demo */}
        <button 
          id="nav-portal-demo"
          onClick={onOpenAuthModal}
          className="flex flex-col items-center gap-1.5 flex-1 py-1 cursor-pointer transition-all text-amber-600 hover:text-amber-700 font-extrabold hover:scale-105"
        >
          <Key className="w-5 h-5 animate-pulse text-amber-500" />
          <span className="text-[10px] tracking-tight">Portal Demo</span>
        </button>
      </nav>
    </div>
  );
}
