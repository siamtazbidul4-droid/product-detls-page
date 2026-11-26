import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../app/hooks.ts';
import { openAuthModal } from '../../features/auth/authSlice.ts';
import {
  setCartDrawerOpen,
  updateGuestCartQty,
  updateServerCartQty,
} from '../../features/cart/cartSlice.ts';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { formatBdt } from '../../lib/api.ts';
import { SafeImage } from '../ui/SafeImage.tsx';

export function CartDrawer() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { items, subtotal, discountAmount, drawerOpen } = useAppSelector((s) => s.cart);
  const user = useAppSelector((s) => s.auth.user);

  if (!drawerOpen) return null;

  const handleQtyChange = async (productId: string, variantId: string | null, nextQty: number) => {
    if (user) {
      try {
        await dispatch(updateServerCartQty({ productId, variantId, quantity: nextQty })).unwrap();
      } catch (err) {
        dispatch(
          pushToast({
            variant: 'error',
            message: err instanceof Error ? err.message : 'Unable to update quantity.',
          })
        );
      }
    } else {
      dispatch(updateGuestCartQty({ productId, variantId, quantity: nextQty }));
    }
  };

  const handleProceedToCheckout = () => {
    dispatch(setCartDrawerOpen(false));
    if (!user) {
      dispatch(openAuthModal({ mode: 'login', returnTo: '/checkout' }));
      dispatch(
        pushToast({
          variant: 'info',
          message: 'Please sign in or create an account to complete checkout.',
        })
      );
      return;
    }
    navigate('/checkout');
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex justify-end bg-slate-950/50 backdrop-blur-[1px]"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dispatch(setCartDrawerOpen(false));
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Shopping Cart"
        className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900">
              Your Cart ({items.length} {items.length === 1 ? 'item' : 'items'})
            </h2>
          </div>
          <button
            type="button"
            onClick={() => dispatch(setCartDrawerOpen(false))}
            aria-label="Close cart drawer"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12">
              <ShoppingBag className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-800">Your shopping cart is empty</p>
              <p className="text-xs text-slate-500 mt-1 mb-5">
                Explore authentic electronics, fashion, books, and essentials across Bangladesh.
              </p>
              <button
                type="button"
                onClick={() => {
                  dispatch(setCartDrawerOpen(false));
                  navigate('/shop');
                }}
                className="px-4 py-2 rounded-lg bg-[#16A34A] text-white text-xs font-semibold"
              >
                Start Shopping
              </button>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={`${item.productId}-${item.variantId || 'base'}`}
                className="flex gap-3 p-3 rounded-xl border border-slate-200 bg-white"
              >
                <div className="w-16 h-16 rounded-lg bg-slate-50 overflow-hidden shrink-0">
                  <SafeImage
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full h-full object-contain p-1"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 line-clamp-1">{item.name}</p>
                  {item.variantTitle && (
                    <p className="text-xs text-slate-500 mt-0.5">{item.variantTitle}</p>
                  )}
                  <p className="text-sm font-bold text-emerald-600 mt-1 tabular-nums">
                    {formatBdt(item.unitPrice)}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="inline-flex items-center border border-slate-200 rounded-lg">
                      <button
                        type="button"
                        aria-label={`Decrease quantity for ${item.name}`}
                        onClick={() =>
                          handleQtyChange(item.productId, item.variantId, item.quantity - 1)
                        }
                        className="p-1.5 text-slate-600 hover:bg-slate-100"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-2.5 text-xs font-semibold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase quantity for ${item.name}`}
                        onClick={() =>
                          handleQtyChange(item.productId, item.variantId, item.quantity + 1)
                        }
                        className="p-1.5 text-slate-600 hover:bg-slate-100"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => handleQtyChange(item.productId, item.variantId, 0)}
                      className="p-1.5 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="p-5 border-t border-slate-200 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Subtotal</span>
              <span className="font-bold text-slate-900 tabular-nums">{formatBdt(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex items-center justify-between text-sm text-emerald-700">
                <span>Coupon Discount</span>
                <span className="font-semibold tabular-nums">-{formatBdt(discountAmount)}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  dispatch(setCartDrawerOpen(false));
                  navigate('/cart');
                }}
                className="py-2.5 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold"
              >
                View Cart
              </button>
              <button
                type="button"
                onClick={handleProceedToCheckout}
                className="py-2.5 px-4 rounded-lg bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-semibold"
              >
                Checkout
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
