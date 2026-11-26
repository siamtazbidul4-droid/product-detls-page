import { useState } from 'react';
import { ArrowRight, Minus, Plus, ShoppingBag, Tag, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../app/hooks.ts';
import { openAuthModal } from '../features/auth/authSlice.ts';
import {
  applyServerCoupon,
  removeServerCoupon,
  updateGuestCartQty,
  updateServerCartQty,
} from '../features/cart/cartSlice.ts';
import { pushToast } from '../features/toast/toastSlice.ts';
import { formatBdt } from '../lib/api.ts';
import { SafeImage } from '../components/ui/SafeImage.tsx';
import { SeoHead } from '../components/ui/SeoHead.tsx';

export function CartPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const { items, subtotal, discountAmount, appliedCouponCode, couponMessage, loading } = useAppSelector(
    (s) => s.cart
  );
  const [couponInput, setCouponInput] = useState('');

  const handleQty = async (productId: string, variantId: string | null, qty: number) => {
    if (user) {
      try {
        await dispatch(updateServerCartQty({ productId, variantId, quantity: qty })).unwrap();
      } catch (err) {
        dispatch(pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Error' }));
      }
    } else {
      dispatch(updateGuestCartQty({ productId, variantId, quantity: qty }));
    }
  };

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      dispatch(openAuthModal({ mode: 'login', returnTo: '/cart' }));
      dispatch(pushToast({ variant: 'info', message: 'Sign in to validate and apply coupons.' }));
      return;
    }
    try {
      await dispatch(applyServerCoupon(couponInput)).unwrap();
      dispatch(pushToast({ variant: 'success', message: 'Coupon applied.' }));
      setCouponInput('');
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Invalid or ineligible coupon.',
        })
      );
    }
  };

  const handleProceed = () => {
    if (!user) {
      dispatch(openAuthModal({ mode: 'login', returnTo: '/checkout' }));
      dispatch(pushToast({ variant: 'info', message: 'Please sign in or register to proceed to checkout.' }));
      return;
    }
    navigate('/checkout');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <SeoHead title="Shopping Cart – NOVARA COMMERCE" noindex />
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Shopping Cart</h1>

      {items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-base font-bold text-slate-900">Your cart is empty</p>
          <p className="text-xs text-slate-500 mt-1 mb-5">Browse our catalog to add products.</p>
          <Link to="/shop" className="inline-flex px-5 py-2.5 rounded-lg bg-[#16A34A] text-white text-xs font-semibold">
            Continue Shopping
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
            {items.map((item) => (
              <div key={`${item.productId}-${item.variantId || 'base'}`} className="p-4 sm:p-5 flex gap-4 items-center">
                <Link to={`/product/${item.slug}`} className="w-20 h-20 rounded-xl bg-slate-50 shrink-0 overflow-hidden">
                  <SafeImage src={item.imageUrl} alt={item.name} className="w-full h-full object-contain p-1.5" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/product/${item.slug}`} className="text-sm font-bold text-slate-900 hover:text-emerald-700">
                    {item.name}
                  </Link>
                  {item.variantTitle && <p className="text-xs text-slate-500 mt-0.5">{item.variantTitle}</p>}
                  {item.staleWarning && <p className="text-xs text-amber-600 mt-1">{item.staleWarning}</p>}
                  <p className="text-sm font-bold text-emerald-600 mt-1 tabular-nums">{formatBdt(item.unitPrice)}</p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center border border-slate-200 rounded-lg">
                    <button
                      type="button"
                      aria-label={`Decrease ${item.name}`}
                      disabled={loading}
                      onClick={() => void handleQty(item.productId, item.variantId, item.quantity - 1)}
                      className="p-2 hover:bg-slate-100"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-3 text-xs font-bold tabular-nums">{item.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Increase ${item.name}`}
                      disabled={loading}
                      onClick={() => void handleQty(item.productId, item.variantId, item.quantity + 1)}
                      className="p-2 hover:bg-slate-100"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => void handleQty(item.productId, item.variantId, 0)}
                    className="p-2 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
            <h2 className="text-base font-bold text-slate-900">Order Summary</h2>

            <form onSubmit={handleApplyCoupon} className="space-y-2">
              <label htmlFor="cart-coupon" className="block text-xs font-semibold text-slate-700">
                Promo / Coupon Code
              </label>
              <div className="flex gap-2">
                <input
                  id="cart-coupon"
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="e.g. NOVARA10"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs uppercase"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                >
                  Apply
                </button>
              </div>
              {appliedCouponCode && (
                <div className="flex items-center justify-between text-xs bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-lg">
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Tag className="w-3.5 h-3.5" />
                    {appliedCouponCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => void dispatch(removeServerCoupon())}
                    className="text-red-600 hover:underline font-medium"
                  >
                    Remove
                  </button>
                </div>
              )}
              {couponMessage && <p className="text-xs text-amber-700">{couponMessage}</p>}
            </form>

            <div className="space-y-2 text-sm border-t border-slate-100 pt-4">
              <div className="flex justify-between">
                <span className="text-slate-600">Subtotal</span>
                <span className="font-semibold tabular-nums">{formatBdt(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount</span>
                  <span className="font-semibold tabular-nums">-{formatBdt(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-extrabold text-slate-900 pt-2 border-t border-slate-100">
                <span>Estimated Total</span>
                <span className="tabular-nums">{formatBdt(Math.max(0, subtotal - discountAmount))}</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Delivery charge calculated at checkout based on Bangladesh district.
              </p>
            </div>

            <button
              type="button"
              onClick={handleProceed}
              className="w-full py-3 px-4 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <span>Proceed to Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
