import { useState } from 'react';
import { CheckCircle2, Search, Truck } from 'lucide-react';
import { SeoHead } from '../components/ui/SeoHead.tsx';
import { apiRequest } from '../lib/api.ts';

interface TrackedOrderResult {
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  trackingNumber: string | null;
  courierName: string | null;
  createdAt: string;
  statusHistory: Array<{
    status: string;
    note?: string;
    createdAt: string;
  }>;
}

export function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackedOrderResult | null>(null);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        orderNumber: orderNumber.trim(),
        phone: phone.trim(),
      });
      const data = await apiRequest<TrackedOrderResult>(`/api/orders/track?${params.toString()}`);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'No matching order found.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
      <SeoHead
        title="Track Your Order"
        description="Track your NOVARA COMMERCE shipment status across Bangladesh using your order number and phone."
      />

      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Track Your Order</h1>
            <p className="text-sm text-slate-500">
              Enter your order number and billing/shipping phone number.
            </p>
          </div>
        </div>

        <form onSubmit={handleTrack} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            required
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="Order # (e.g. NVR-2611-A1B2C3)"
            className="h-11 px-3.5 rounded-xl border border-slate-200 text-sm font-mono focus:border-emerald-600 focus:outline-none"
          />
          <input
            type="tel"
            required
            minLength={4}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone or last 4 digits"
            className="h-11 px-3.5 rounded-xl border border-slate-200 text-sm focus:border-emerald-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="h-11 px-5 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Search className="w-4 h-4" />
            {loading ? 'Checking...' : 'Track Order'}
          </button>
        </form>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-mono font-bold text-slate-900">{result.orderNumber}</p>
                <p className="text-xs text-slate-500">
                  Ordered {new Date(result.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold uppercase">
                  {result.orderStatus.replace(/_/g, ' ')}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold uppercase">
                  Fulfillment: {result.fulfillmentStatus}
                </span>
              </div>
            </div>

            {result.courierName && (
              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-700">
                Courier: <strong>{result.courierName}</strong> · Tracking:{' '}
                <strong className="font-mono">{result.trackingNumber || 'Assigned'}</strong>
              </div>
            )}

            <div className="space-y-2.5">
              {result.statusHistory.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900 capitalize">
                      {item.status.replace(/_/g, ' ')}
                    </p>
                    {item.note && <p className="text-xs text-slate-600">{item.note}</p>}
                    <p className="text-[11px] text-slate-400">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
