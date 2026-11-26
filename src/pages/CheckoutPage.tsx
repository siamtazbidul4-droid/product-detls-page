import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Lock,
  Mail,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Truck,
  User as UserIcon,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { isValidBangladeshPhone } from '../../shared/bangladeshLocations.ts';
import { useAppDispatch, useAppSelector } from '../app/hooks.ts';
import {
  BangladeshLocationSelector,
  type BangladeshLocationValue,
} from '../components/checkout/BangladeshLocationSelector.tsx';
import { CheckoutHeroBanner } from '../components/checkout/CheckoutHeroBanner.tsx';
import { CheckoutOrderSummary } from '../components/checkout/CheckoutOrderSummary.tsx';
import { CheckoutSupportSection } from '../components/checkout/CheckoutSupportSection.tsx';
import {
  PaymentMethodSelector,
  type PaymentChannelChoice,
} from '../components/checkout/PaymentMethodSelector.tsx';
import { SeoHead } from '../components/ui/SeoHead.tsx';
import { openAuthModal, updateUserState } from '../features/auth/authSlice.ts';
import {
  applyServerCoupon,
  clearCartAfterOrder,
  removeServerCoupon,
  syncServerCart,
  updateGuestCartQty,
  updateServerCartQty,
} from '../features/cart/cartSlice.ts';
import { pushToast } from '../features/toast/toastSlice.ts';
import { apiRequest } from '../lib/api.ts';
import type {
  CheckoutBannerConfig,
  OrderRecord,
  SavedAddress,
  StoreSettings,
} from '../types/domain.ts';

type GenderChoice = '' | 'male' | 'female' | 'other' | 'prefer_not_to_say';

interface CheckoutFieldErrors {
  contactEmail?: string;
  contactPhone?: string;
  fullName?: string;
  divisionCode?: string;
  districtCode?: string;
  upazilaCode?: string;
  areaCode?: string;
  houseAddress?: string;
  termsAccepted?: string;
}

export function CheckoutPage({ storeSettings }: { storeSettings?: StoreSettings | null }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const { items, appliedCouponCode } = useAppSelector((s) => s.cart);

  // Step 1: Contact Information
  const [contactEmail, setContactEmail] = useState(user?.email || '');
  const [contactPhone, setContactPhone] = useState(user?.phone || '');

  // Step 2: Personal Information
  const [fullName, setFullName] = useState(user?.name || '');
  const [gender, setGender] = useState<GenderChoice>(user?.gender || '');

  // Step 3: Shipping Address
  const [selectedAddressId, setSelectedAddressId] = useState<string>('new');
  const [saveNewAddress, setSaveNewAddress] = useState(true);
  const [addressLabel, setAddressLabel] = useState('Home');
  const [locationValue, setLocationValue] = useState<BangladeshLocationValue>({
    divisionCode: '',
    districtCode: '',
    upazilaCode: '',
    areaCode: '',
  });
  const [houseAddress, setHouseAddress] = useState('');
  const [roadStreet, setRoadStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');

  // Delivery speed & Step 4 Payment
  const [deliveryMethod, setDeliveryMethod] = useState<'standard' | 'express'>('standard');
  const [paymentChannel, setPaymentChannel] = useState<PaymentChannelChoice>('cod');
  const [gatewayConfigured, setGatewayConfigured] = useState(false);

  // Terms & Notes
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [customerNote, setCustomerNote] = useState('');
  const [errors, setErrors] = useState<CheckoutFieldErrors>({});

  // CMS Banner & Authoritative Quote
  const [banner, setBanner] = useState<CheckoutBannerConfig | null>(null);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number>(
    storeSettings?.shipping?.freeShippingThreshold ?? 999
  );
  const [expressSurcharge, setExpressSurcharge] = useState<number>(
    storeSettings?.shipping?.expressSurcharge ?? 80
  );
  const [quote, setQuote] = useState<{
    subtotal: number;
    discountAmount: number;
    shippingCharge: number;
    taxRate?: number;
    taxAmount: number;
    totalAmount: number;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(
    () => `chk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  // Load CMS checkout banner & gateway status
  useEffect(() => {
    apiRequest<{
      banner: CheckoutBannerConfig;
      taxRate: number;
      shipping?: { freeShippingThreshold?: number; expressSurcharge?: number };
    }>('/api/cms/public/checkout-banner')
      .then((res) => {
        setBanner(res.banner);
        if (res.shipping?.freeShippingThreshold !== undefined) {
          setFreeShippingThreshold(res.shipping.freeShippingThreshold);
        }
        if (res.shipping?.expressSurcharge !== undefined) {
          setExpressSurcharge(res.shipping.expressSurcharge);
        }
      })
      .catch(() => {});

    apiRequest<{ gatewayConfigured: boolean }>('/api/payments/status')
      .then((res) => {
        setGatewayConfigured(res.gatewayConfigured);
        if (res.gatewayConfigured) {
          setPaymentChannel((prev) => (prev === 'cod' ? 'card' : prev));
        } else {
          setPaymentChannel('cod');
        }
      })
      .catch(() => setGatewayConfigured(false));
  }, []);

  // Pre-fill authenticated customer info without clobbering manual edits
  useEffect(() => {
    if (!user) return;
    setContactEmail((prev) => prev || user.email || '');
    setContactPhone((prev) => prev || user.phone || '');
    setFullName((prev) => prev || user.name || '');
    if (user.gender) {
      setGender((prev) => prev || user.gender || '');
    }

    if (user.savedAddresses?.length > 0) {
      const def = user.savedAddresses.find((a) => a.isDefault) || user.savedAddresses[0];
      setSelectedAddressId((prev) => (prev === 'new' && user.savedAddresses.length > 0 ? def._id : prev));
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void dispatch(syncServerCart());
  }, [user, dispatch]);

  const activeSavedAddress: SavedAddress | undefined = useMemo(
    () => user?.savedAddresses?.find((a) => a._id === selectedAddressId),
    [user?.savedAddresses, selectedAddressId]
  );

  const effectiveAddressCodes = activeSavedAddress
    ? {
        divisionCode: activeSavedAddress.divisionCode,
        districtCode: activeSavedAddress.districtCode,
        upazilaCode: activeSavedAddress.upazilaCode,
        areaCode: activeSavedAddress.areaCode,
      }
    : locationValue;

  // Fetch authoritative server quote whenever cart, location, delivery speed, or coupon changes
  useEffect(() => {
    if (!user || items.length === 0) {
      setQuote(null);
      return;
    }
    apiRequest<{
      subtotal: number;
      discountAmount: number;
      shippingCharge: number;
      taxRate?: number;
      taxAmount: number;
      totalAmount: number;
    }>('/api/orders/quote', {
      method: 'POST',
      body: JSON.stringify({
        divisionCode: effectiveAddressCodes.divisionCode || undefined,
        districtCode: effectiveAddressCodes.districtCode || undefined,
        upazilaCode: effectiveAddressCodes.upazilaCode || undefined,
        areaCode: effectiveAddressCodes.areaCode || undefined,
        deliveryMethod,
        couponCode: appliedCouponCode || null,
      }),
    })
      .then(setQuote)
      .catch(() => {});
  }, [
    user,
    items,
    effectiveAddressCodes.divisionCode,
    effectiveAddressCodes.districtCode,
    effectiveAddressCodes.upazilaCode,
    effectiveAddressCodes.areaCode,
    deliveryMethod,
    appliedCouponCode,
  ]);

  const allItemsCodEligible = useMemo(
    () => items.every((item) => item.codEligible !== false),
    [items]
  );

  const handleApplyCoupon = async (code: string) => {
    try {
      await dispatch(applyServerCoupon(code)).unwrap();
      dispatch(pushToast({ variant: 'success', message: `Coupon ${code} applied.` }));
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Unable to apply coupon.',
        })
      );
    }
  };

  const handleRemoveCoupon = async () => {
    try {
      await dispatch(removeServerCoupon()).unwrap();
      dispatch(pushToast({ variant: 'info', message: 'Coupon removed.' }));
    } catch {
      // ignore
    }
  };

  const handleRemoveItem = async (productId: string, variantId?: string | null) => {
    if (user) {
      try {
        await dispatch(updateServerCartQty({ productId, variantId: variantId || null, quantity: 0 })).unwrap();
        dispatch(pushToast({ variant: 'info', message: 'Item removed from cart.' }));
      } catch (err) {
        dispatch(
          pushToast({
            variant: 'error',
            message: err instanceof Error ? err.message : 'Unable to remove item.',
          })
        );
      }
    } else {
      dispatch(updateGuestCartQty({ productId, variantId: variantId || null, quantity: 0 }));
    }
  };

  const validateForm = (): CheckoutFieldErrors => {
    const nextErrors: CheckoutFieldErrors = {};
    if (!contactEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      nextErrors.contactEmail = 'Please enter a valid email address.';
    }
    if (!contactPhone.trim() || !isValidBangladeshPhone(contactPhone)) {
      nextErrors.contactPhone = 'Enter a valid Bangladesh mobile number (e.g. 017XXXXXXXX).';
    }
    if (fullName.trim().length < 2) {
      nextErrors.fullName = 'Please enter your full name.';
    }

    if (!activeSavedAddress) {
      if (!locationValue.divisionCode) nextErrors.divisionCode = 'Please select a Division.';
      if (!locationValue.districtCode) nextErrors.districtCode = 'Please select a District.';
      if (!locationValue.upazilaCode) nextErrors.upazilaCode = 'Please select a Thana / Upazila.';
      if (!locationValue.areaCode) nextErrors.areaCode = 'Please select a Union / Ward.';
      if (houseAddress.trim().length < 3) {
        nextErrors.houseAddress = 'Enter your house, road, and area address (at least 3 characters).';
      }
    }

    if (!termsAccepted) {
      nextErrors.termsAccepted = 'Please agree to the Terms & Conditions and Privacy Policy.';
    }
    return nextErrors;
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const validationErrors = validateForm();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      dispatch(
        pushToast({
          variant: 'warning',
          message: 'Please complete all highlighted checkout fields.',
        })
      );
      return;
    }

    const backendPaymentMethod: 'cod' | 'sslcommerz' =
      paymentChannel === 'cod' ? 'cod' : 'sslcommerz';

    if (backendPaymentMethod === 'sslcommerz' && !gatewayConfigured) {
      dispatch(
        pushToast({
          variant: 'error',
          message: 'Online payment gateway is not configured. Please choose Cash on Delivery.',
        })
      );
      return;
    }

    setSubmitting(true);
    try {
      const shippingAddress = activeSavedAddress
        ? {
            recipientName: activeSavedAddress.recipientName || fullName.trim(),
            phone: activeSavedAddress.phone || contactPhone.trim(),
            divisionCode: activeSavedAddress.divisionCode,
            districtCode: activeSavedAddress.districtCode,
            upazilaCode: activeSavedAddress.upazilaCode,
            areaCode: activeSavedAddress.areaCode,
            houseAddress: activeSavedAddress.houseAddress,
            roadStreet: activeSavedAddress.roadStreet,
            landmark: activeSavedAddress.landmark,
            deliveryInstructions: activeSavedAddress.deliveryInstructions,
          }
        : {
            recipientName: fullName.trim(),
            phone: contactPhone.trim(),
            divisionCode: locationValue.divisionCode,
            districtCode: locationValue.districtCode,
            upazilaCode: locationValue.upazilaCode,
            areaCode: locationValue.areaCode,
            houseAddress: houseAddress.trim(),
            roadStreet: roadStreet.trim() || undefined,
            landmark: landmark.trim() || undefined,
            deliveryInstructions: deliveryInstructions.trim() || undefined,
          };

      if (!activeSavedAddress && saveNewAddress && user) {
        try {
          const addrRes = await apiRequest<{ addresses: SavedAddress[] }>('/api/users/addresses', {
            method: 'POST',
            body: JSON.stringify({
              label: addressLabel.trim() || 'Home',
              ...shippingAddress,
              isDefault: user.savedAddresses.length === 0,
            }),
          });
          dispatch(updateUserState({ ...user, savedAddresses: addrRes.addresses }));
        } catch {
          // Do not block order placement if address save fails
        }
      }

      const res = await apiRequest<{
        order: OrderRecord;
        payment?: { gatewayUrl?: string };
      }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey,
          contactInfo: {
            email: contactEmail.trim(),
            phone: contactPhone.trim(),
          },
          personalInfo: {
            fullName: fullName.trim(),
            gender: gender || null,
          },
          shippingAddress,
          deliveryMethod,
          paymentMethod: backendPaymentMethod,
          paymentChannel,
          termsAccepted: true,
          couponCode: appliedCouponCode || null,
          customerNote: customerNote.trim() || undefined,
        }),
      });

      dispatch(clearCartAfterOrder());

      if (res.payment?.gatewayUrl) {
        window.location.href = res.payment.gatewayUrl;
      } else {
        navigate(`/order-success/${res.order.orderNumber}`);
      }
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          title: 'Checkout Failed',
          message: err instanceof Error ? err.message : 'Unable to place order.',
        })
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[#F8FAFC] min-h-screen">
      <SeoHead title="Secure Checkout – NOVARA COMMERCE" noindex />

      <CheckoutHeroBanner banner={banner} />

      <div className="max-w-7xl mx-auto px-4 py-8 sm:py-10 space-y-8">
        {!user ? (
          <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#16A34A] flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900">
              Sign In to Complete Your Order
            </h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Your shopping cart ({items.reduce((s, i) => s + i.quantity, 0)} items) is safely preserved. Sign in or create an account to confirm your Bangladesh delivery address and track your order.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => dispatch(openAuthModal({ mode: 'login', returnTo: '/checkout' }))}
                className="px-6 py-2.5 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-bold transition-colors"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => dispatch(openAuthModal({ mode: 'register', returnTo: '/checkout' }))}
                className="px-6 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold transition-colors"
              >
                Create Account
              </button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#16A34A] flex items-center justify-center mx-auto">
              <ShoppingBag className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900">Your cart is empty</h2>
            <p className="text-sm text-slate-600">
              Add products to your cart before proceeding to checkout.
            </p>
            <Link
              to="/shop"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-bold transition-colors"
            >
              <span>Browse Products</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handlePlaceOrder}
            noValidate
            className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start"
          >
            {/* Left Column: Steps 1 - 4 + Terms + CTA */}
            <div className="lg:col-span-8 space-y-6">
              {/* Step 1: Contact Information */}
              <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 rounded-full bg-[#16A34A] text-white text-sm font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900">Contact Information</h2>
                    <p className="text-xs text-slate-500">
                      Enter your contact details to receive order updates
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="chk-email"
                      className="block text-xs font-bold text-slate-800 mb-1.5"
                    >
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="chk-email"
                        type="email"
                        required
                        value={contactEmail}
                        onChange={(e) => {
                          setContactEmail(e.target.value);
                          if (errors.contactEmail) setErrors((p) => ({ ...p, contactEmail: undefined }));
                        }}
                        placeholder="you@example.com"
                        className={`w-full h-11 pl-10 pr-3 rounded-xl border text-sm focus:outline-none ${
                          errors.contactEmail
                            ? 'border-red-400 focus:border-red-500'
                            : 'border-slate-200 focus:border-[#16A34A]'
                        }`}
                      />
                    </div>
                    {errors.contactEmail && (
                      <p className="text-[11px] font-medium text-red-600 mt-1">
                        {errors.contactEmail}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="chk-phone"
                      className="block text-xs font-bold text-slate-800 mb-1.5"
                    >
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="chk-phone"
                        type="tel"
                        required
                        value={contactPhone}
                        onChange={(e) => {
                          setContactPhone(e.target.value);
                          if (errors.contactPhone) setErrors((p) => ({ ...p, contactPhone: undefined }));
                        }}
                        placeholder="01XXXXXXXXX"
                        className={`w-full h-11 pl-10 pr-3 rounded-xl border text-sm focus:outline-none ${
                          errors.contactPhone
                            ? 'border-red-400 focus:border-red-500'
                            : 'border-slate-200 focus:border-[#16A34A]'
                        }`}
                      />
                    </div>
                    {errors.contactPhone && (
                      <p className="text-[11px] font-medium text-red-600 mt-1">
                        {errors.contactPhone}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* Step 2: Personal Information */}
              <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 rounded-full bg-[#16A34A] text-white text-sm font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900">Personal Information</h2>
                    <p className="text-xs text-slate-500">Tell us about yourself</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="chk-fullname"
                      className="block text-xs font-bold text-slate-800 mb-1.5"
                    >
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="chk-fullname"
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => {
                          setFullName(e.target.value);
                          if (errors.fullName) setErrors((p) => ({ ...p, fullName: undefined }));
                        }}
                        placeholder="Enter your full name"
                        className={`w-full h-11 pl-10 pr-3 rounded-xl border text-sm focus:outline-none ${
                          errors.fullName
                            ? 'border-red-400 focus:border-red-500'
                            : 'border-slate-200 focus:border-[#16A34A]'
                        }`}
                      />
                    </div>
                    {errors.fullName && (
                      <p className="text-[11px] font-medium text-red-600 mt-1">
                        {errors.fullName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="chk-gender"
                      className="block text-xs font-bold text-slate-800 mb-1.5"
                    >
                      Gender <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <select
                      id="chk-gender"
                      value={gender}
                      onChange={(e) => setGender(e.target.value as GenderChoice)}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:border-[#16A34A] focus:outline-none"
                    >
                      <option value="">Select Gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* Step 3: Shipping Address */}
              <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="w-8 h-8 rounded-full bg-[#16A34A] text-white text-sm font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                      3
                    </span>
                    <div>
                      <h2 className="text-lg font-extrabold text-slate-900">Shipping Address</h2>
                      <p className="text-xs text-slate-500">Where should we deliver your order?</p>
                    </div>
                  </div>
                </div>

                {/* Saved Addresses Selector if customer has saved addresses */}
                {user.savedAddresses?.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {user.savedAddresses.map((addr) => (
                      <button
                        key={addr._id}
                        type="button"
                        onClick={() => {
                          setSelectedAddressId(addr._id);
                          setErrors((p) => ({
                            ...p,
                            divisionCode: undefined,
                            districtCode: undefined,
                            upazilaCode: undefined,
                            areaCode: undefined,
                            houseAddress: undefined,
                          }));
                        }}
                        className={`p-3.5 rounded-xl border text-left transition-colors ${
                          selectedAddressId === addr._id
                            ? 'border-2 border-[#16A34A] bg-emerald-50/40'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-900 inline-flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-[#16A34A]" />
                            {addr.label}
                          </span>
                          {addr.isDefault && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-slate-800 mt-1">
                          {addr.recipientName} · {addr.phone}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                          {addr.houseAddress}, {addr.areaName}, {addr.upazilaName},{' '}
                          {addr.districtName}, {addr.divisionName}
                        </p>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSelectedAddressId('new')}
                      className={`p-3.5 rounded-xl border border-dashed flex items-center justify-center gap-2 text-xs font-bold transition-colors ${
                        selectedAddressId === 'new'
                          ? 'border-2 border-[#16A34A] bg-emerald-50/40 text-emerald-800'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Plus className="w-4 h-4" />
                      <span>Use a Different Address</span>
                    </button>
                  </div>
                )}

                {selectedAddressId === 'new' && (
                  <div className="space-y-4">
                    <BangladeshLocationSelector
                      value={locationValue}
                      onChange={(next) => {
                        setLocationValue(next);
                        setErrors((p) => ({
                          ...p,
                          divisionCode: undefined,
                          districtCode: undefined,
                          upazilaCode: undefined,
                          areaCode: undefined,
                        }));
                      }}
                      errors={{
                        divisionCode: errors.divisionCode,
                        districtCode: errors.districtCode,
                        upazilaCode: errors.upazilaCode,
                        areaCode: errors.areaCode,
                      }}
                      idPrefix="chk"
                    />

                    <div>
                      <label
                        htmlFor="chk-house"
                        className="block text-xs font-bold text-slate-800 mb-1.5"
                      >
                        Home Address <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="chk-house"
                          type="text"
                          required
                          value={houseAddress}
                          onChange={(e) => {
                            setHouseAddress(e.target.value);
                            if (errors.houseAddress) {
                              setErrors((p) => ({ ...p, houseAddress: undefined }));
                            }
                          }}
                          placeholder="House No, Road No, Area, Landmark..."
                          className={`w-full h-11 pl-10 pr-3 rounded-xl border text-sm focus:outline-none ${
                            errors.houseAddress
                              ? 'border-red-400 focus:border-red-500'
                              : 'border-slate-200 focus:border-[#16A34A]'
                          }`}
                        />
                      </div>
                      {errors.houseAddress && (
                        <p className="text-[11px] font-medium text-red-600 mt-1">
                          {errors.houseAddress}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={roadStreet}
                        onChange={(e) => setRoadStreet(e.target.value)}
                        placeholder="Road / Sector (optional)"
                        aria-label="Road or Sector"
                        className="h-10 px-3.5 rounded-xl border border-slate-200 text-xs focus:border-[#16A34A] focus:outline-none"
                      />
                      <input
                        type="text"
                        value={landmark}
                        onChange={(e) => setLandmark(e.target.value)}
                        placeholder="Nearby Landmark (optional)"
                        aria-label="Nearby Landmark"
                        className="h-10 px-3.5 rounded-xl border border-slate-200 text-xs focus:border-[#16A34A] focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={saveNewAddress}
                          onChange={(e) => setSaveNewAddress(e.target.checked)}
                          className="rounded accent-[#16A34A]"
                        />
                        <span>Save this address to my account for faster checkout</span>
                      </label>
                      {saveNewAddress && (
                        <input
                          type="text"
                          value={addressLabel}
                          onChange={(e) => setAddressLabel(e.target.value)}
                          placeholder="Label (Home / Office)"
                          aria-label="Address label"
                          className="h-9 px-3 rounded-lg border border-slate-200 text-xs w-36 focus:border-[#16A34A] focus:outline-none"
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Delivery Speed & Optional Courier Note */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-[#16A34A]" />
                    <span>Delivery Speed</span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDeliveryMethod('standard')}
                      className={`p-3 rounded-xl border text-left transition-colors ${
                        deliveryMethod === 'standard'
                          ? 'border-2 border-[#16A34A] bg-emerald-50/40'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <p className="text-xs font-bold text-slate-900">Standard Delivery</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Free on orders over ৳{freeShippingThreshold.toLocaleString()} · 1–5 days
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryMethod('express')}
                      className={`p-3 rounded-xl border text-left transition-colors ${
                        deliveryMethod === 'express'
                          ? 'border-2 border-[#16A34A] bg-emerald-50/40'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <p className="text-xs font-bold text-slate-900">Express Priority</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Priority dispatch (+৳{expressSurcharge} surcharge)
                      </p>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                    placeholder="Optional delivery instructions for rider (e.g. call upon arrival)..."
                    aria-label="Delivery instructions"
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-xs focus:border-[#16A34A] focus:outline-none"
                  />
                </div>
              </section>

              {/* Step 4: Payment Method + Terms + CTA */}
              <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 rounded-full bg-[#16A34A] text-white text-sm font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                    4
                  </span>
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900">Payment Method</h2>
                    <p className="text-xs text-slate-500">Choose your preferred payment method</p>
                  </div>
                </div>

                <PaymentMethodSelector
                  value={paymentChannel}
                  onChange={setPaymentChannel}
                  gatewayConfigured={gatewayConfigured}
                  codEligible={allItemsCodEligible}
                />

                <div className="pt-2 space-y-2">
                  <label htmlFor="chk-terms" className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      id="chk-terms"
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => {
                        setTermsAccepted(e.target.checked);
                        if (errors.termsAccepted) {
                          setErrors((p) => ({ ...p, termsAccepted: undefined }));
                        }
                      }}
                      className="mt-0.5 w-4 h-4 rounded accent-[#16A34A]"
                    />
                    <span>
                      I agree to the{' '}
                      <Link
                        to="/policies/terms"
                        className="text-[#16A34A] font-semibold underline hover:text-emerald-800"
                      >
                        Terms &amp; Conditions
                      </Link>{' '}
                      and{' '}
                      <Link
                        to="/policies/privacy"
                        className="text-[#16A34A] font-semibold underline hover:text-emerald-800"
                      >
                        Privacy Policy
                      </Link>
                      .
                    </span>
                  </label>
                  {errors.termsAccepted && (
                    <p className="text-[11px] font-medium text-red-600">{errors.termsAccepted}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-13 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-base font-extrabold flex items-center justify-center gap-2.5 shadow-sm transition-colors disabled:opacity-60"
                >
                  <Lock className="w-4 h-4" />
                  <span>{submitting ? 'Placing Order...' : 'Place Order Now'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
                  <span>Your information is secure and encrypted</span>
                </p>
              </section>
            </div>

            {/* Right Column: Order Summary + Confidence */}
            <aside className="lg:col-span-4">
              <CheckoutOrderSummary
                items={items}
                quote={quote}
                couponCode={appliedCouponCode || ''}
                freeShippingThreshold={freeShippingThreshold}
                onApplyCoupon={handleApplyCoupon}
                onRemoveCoupon={handleRemoveCoupon}
                onRemoveItem={handleRemoveItem}
              />
            </aside>
          </form>
        )}

        <CheckoutSupportSection />
      </div>
    </div>
  );
}
