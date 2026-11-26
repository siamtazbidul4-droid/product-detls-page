import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Copy, RefreshCw, TicketPercent } from 'lucide-react';
import { useAppDispatch } from '../../app/hooks.ts';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { apiRequest, formatBdt } from '../../lib/api.ts';
import type { CustomerCouponData } from '../../types/domain.ts';

export function CustomerCouponsView() {
  const dispatch = useAppDispatch();
  const [data, setData] = useState<CustomerCouponData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadCoupons = useCallback(() => {
    setLoading(true);
    setError(null);
    apiRequest<CustomerCouponData>('/api/marketing/my-coupons')
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load available coupons.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      dispatch(pushToast({ variant: 'success', message: `Copied coupon ${code}` }));
      window.setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      dispatch(pushToast({ variant: 'info', message: `Coupon code: ${code}` }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#DCE8DF] rounded-2xl p-6 shadow-xs space-y-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Available Coupons & Offers</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Apply any eligible promo code during checkout to save on your order.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((n) => (
              <div key={n} className="h-28 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-10 border border-amber-200 bg-amber-50/40 rounded-xl space-y-2.5 px-4">
            <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
            <p className="text-sm font-bold text-slate-900">Unable to load coupons</p>
            <p className="text-xs text-slate-600">{error}</p>
            <button
              type="button"
              onClick={loadCoupons}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        ) : !data || data.coupons.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
            <TicketPercent className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No active coupons right now</p>
            <p className="text-xs text-slate-500 mt-1">
              Check back soon for seasonal discount codes and flash offers.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.coupons.map((coupon) => (
              <div
                key={coupon._id}
                className="rounded-xl border border-[#CBE0D1] bg-gradient-to-br from-[#F4FBF6] to-white p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-block font-mono text-sm font-extrabold text-[#14532D] bg-[#EAF7EE] border border-[#C6DEC9] px-2.5 py-1 rounded-lg">
                      {coupon.code}
                    </span>
                    <p className="text-base font-extrabold text-slate-900 mt-2">
                      {coupon.type === 'percentage'
                        ? `${coupon.value}% OFF`
                        : `${formatBdt(coupon.value)} OFF`}
                    </p>
                    {coupon.description && (
                      <p className="text-xs text-slate-600 mt-0.5">{coupon.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopy(coupon.code)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-[#15803D] text-xs font-semibold text-slate-700"
                  >
                    {copiedCode === coupon.code ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#15803D]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                  <span>Min. Order: {formatBdt(coupon.minOrderAmount || 0)}</span>
                  {coupon.maxDiscountCap ? (
                    <span>Up to {formatBdt(coupon.maxDiscountCap)}</span>
                  ) : null}
                  {coupon.expiresAt && (
                    <span>Valid until {new Date(coupon.expiresAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {data && data.redemptions.length > 0 && (
        <div className="bg-white border border-[#DCE8DF] rounded-2xl p-6 shadow-xs space-y-3">
          <h2 className="text-lg font-extrabold text-slate-900">Your Coupon Redemption History</h2>
          <div className="divide-y divide-slate-100">
            {data.redemptions.map((item) => (
              <div key={item._id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono font-bold text-slate-900">{item.code}</span>
                  <span className="text-slate-500 ml-2">
                    {item.orderId?.orderNumber ? `Order ${item.orderId.orderNumber}` : ''}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-[#15803D]">
                    Saved {formatBdt(item.discountAmount ?? item.discountApplied ?? 0)}
                  </span>
                  <span className="text-slate-400 ml-2">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
