import { useState } from 'react';
import {
  HelpCircle,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Tag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { formatBdt } from '../../lib/api.ts';
import type { CartItem } from '../../types/domain.ts';
import { SafeImage } from '../ui/SafeImage.tsx';

interface CheckoutOrderSummaryProps {
  items: CartItem[];
  quote: {
    subtotal: number;
    discountAmount: number;
    shippingCharge: number;
    taxRate?: number;
    taxAmount: number;
    totalAmount: number;
  } | null;
  couponCode: string;
  freeShippingThreshold: number;
  onApplyCoupon: (code: string) => Promise<void>;
  onRemoveCoupon: () => Promise<void>;
  onRemoveItem: (productId: string, variantId?: string | null) => Promise<void>;
}

export function CheckoutOrderSummary({
  items,
  quote,
  couponCode,
  freeShippingThreshold,
  onApplyCoupon,
  onRemoveCoupon,
  onRemoveItem,
}: CheckoutOrderSummaryProps) {
  const [couponInput, setCouponInput] = useState(couponCode || '');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [showShippingTip, setShowShippingTip] = useState(false);

  const fallbackSubtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const subtotal = quote?.subtotal ?? fallbackSubtotal;
  const discountAmount = quote?.discountAmount ?? 0;
  const shippingCharge = quote?.shippingCharge ?? 0;
  const taxRate = quote?.taxRate ?? 0;
  const taxAmount = quote?.taxAmount ?? 0;
  const totalAmount = quote?.totalAmount ?? Math.max(0, subtotal - discountAmount + shippingCharge + taxAmount);

  const handleCouponSubmit = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setApplyingCoupon(true);
    try {
      await onApplyCoupon(code);
    } finally {
      setApplyingCoupon(false);
    }
  };

  return (
    <div className="space-y-4 lg:sticky lg:top-28">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5">
          <ShoppingCart className="w-5 h-5 text-[#16A34A]" />
          <h2 className="text-lg font-extrabold text-slate-900">Order Summary</h2>
        </div>

        <div className="rounded-xl bg-[#ECFDF5] border border-emerald-100 px-3.5 py-2 text-xs font-bold text-slate-800">
          Items ({items.reduce((sum, i) => sum + i.quantity, 0)})
        </div>

        <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto pr-1">
          {items.map((item) => {
            const key = `${item.productId}-${item.variantId || 'base'}`;
            const isRemoving = removingKey === key;
            return (
              <div key={key} className="py-3 first:pt-1 last:pb-1 flex items-start gap-3">
                <SafeImage
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-14 h-14 rounded-xl object-cover border border-slate-100 bg-slate-50 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                      {item.name}
                    </p>
                    <button
                      type="button"
                      disabled={isRemoving}
                      aria-label={`Remove ${item.name} from order`}
                      onClick={async () => {
                        setRemovingKey(key);
                        try {
                          await onRemoveItem(item.productId, item.variantId);
                        } finally {
                          setRemovingKey(null);
                        }
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {item.variantTitle && (
                    <p className="text-[11px] text-slate-500 mt-0.5">{item.variantTitle}</p>
                  )}
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="font-extrabold text-[#16A34A] tabular-nums">
                      {formatBdt(item.unitPrice)}
                    </span>
                    <span className="text-slate-600 font-medium">Qty: {item.quantity}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Coupon Input */}
        <div className="pt-2 border-t border-slate-100">
          {couponCode ? (
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-emerald-800">
                <Tag className="w-3.5 h-3.5" />
                Coupon {couponCode} applied
              </span>
              <button
                type="button"
                onClick={async () => {
                  await onRemoveCoupon();
                  setCouponInput('');
                }}
                aria-label="Remove coupon"
                className="text-emerald-700 hover:text-red-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleCouponSubmit();
                  }
                }}
                placeholder="Promo / coupon code"
                aria-label="Promo code"
                className="flex-1 h-9 px-3 rounded-xl border border-slate-200 text-xs font-mono uppercase focus:border-[#16A34A] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void handleCouponSubmit()}
                disabled={applyingCoupon || !couponInput.trim()}
                className="px-3.5 h-9 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-50"
              >
                {applyingCoupon ? '...' : 'Apply'}
              </button>
            </div>
          )}
        </div>

        {/* Pricing Breakdown */}
        <div className="border-t border-slate-100 pt-4 space-y-2.5 text-sm">
          <div className="flex items-center justify-between text-slate-600">
            <span>Subtotal</span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {formatBdt(subtotal)}
            </span>
          </div>

          {discountAmount > 0 && (
            <div className="flex items-center justify-between text-emerald-700">
              <span>Discount</span>
              <span className="font-semibold tabular-nums">-{formatBdt(discountAmount)}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-slate-600 relative">
            <span className="inline-flex items-center gap-1">
              Shipping
              <button
                type="button"
                aria-label="Shipping calculation details"
                onClick={() => setShowShippingTip((v) => !v)}
                className="text-slate-400 hover:text-slate-600"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </span>
            <span
              className={`font-semibold tabular-nums ${
                shippingCharge === 0 ? 'text-[#16A34A]' : 'text-slate-900'
              }`}
            >
              {shippingCharge === 0 ? 'Free' : formatBdt(shippingCharge)}
            </span>
          </div>

          {showShippingTip && (
            <p className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600">
              Free standard shipping on orders over {formatBdt(freeShippingThreshold)}. Zone rates apply otherwise based on selected District &amp; Thana.
            </p>
          )}

          <div className="flex items-center justify-between text-slate-600">
            <span>Tax {taxRate > 0 ? `(${taxRate}%)` : '(0%)'}</span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {formatBdt(taxAmount)}
            </span>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <span className="text-base font-extrabold text-slate-900">Total</span>
            <span className="text-2xl font-extrabold text-[#16A34A] tabular-nums">
              {formatBdt(totalAmount)}
            </span>
          </div>
        </div>
      </div>

      {/* Shop with Confidence Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-center gap-2 text-sm font-extrabold text-slate-900">
          <span className="w-6 h-6 rounded-full bg-emerald-100 text-[#16A34A] flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </span>
          <span>Shop with Confidence</span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="space-y-1">
            <Truck className="w-5 h-5 text-[#16A34A] mx-auto" />
            <p className="text-[11px] font-bold text-slate-800 leading-tight">Free Shipping</p>
            <p className="text-[10px] text-slate-500 leading-tight">
              Orders Over {formatBdt(freeShippingThreshold)}
            </p>
          </div>
          <div className="space-y-1">
            <RotateCcw className="w-5 h-5 text-[#16A34A] mx-auto" />
            <p className="text-[11px] font-bold text-slate-800 leading-tight">7 Days</p>
            <p className="text-[10px] text-slate-500 leading-tight">Easy Return</p>
          </div>
          <div className="space-y-1">
            <ShieldCheck className="w-5 h-5 text-[#16A34A] mx-auto" />
            <p className="text-[11px] font-bold text-slate-800 leading-tight">Secure</p>
            <p className="text-[10px] text-slate-500 leading-tight text-[#16A34A] font-semibold">
              Payment
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
