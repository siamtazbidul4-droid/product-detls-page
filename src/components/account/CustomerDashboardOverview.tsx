import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Heart, MapPin, Package, RefreshCw, ShieldCheck, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiRequest, formatBdt } from '../../lib/api.ts';
import type { AuthUser, CustomerDashboardSummary } from '../../types/domain.ts';

export function CustomerDashboardOverview({ user }: { user: AuthUser }) {
  const [data, setData] = useState<CustomerDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(() => {
    setLoading(true);
    setError(null);
    apiRequest<CustomerDashboardSummary>('/api/users/dashboard')
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load dashboard summary.');
      })
      .finally(() => setLoading(false));
  }, [user.id]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const stats = data?.summary;

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white border border-[#DCE8DF] rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#15803D]">
            Customer Dashboard
          </p>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-0.5">
            Welcome back, {user.name}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review your recent orders, saved wishlist items, delivery addresses, and account tier.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${
              user.emailVerified
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{user.emailVerified ? 'Email Verified' : 'Email Unverified'}</span>
          </span>
        </div>
      </div>

      {/* KPI Summary Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          to="/account/orders"
          className="bg-white border border-[#DCE8DF] rounded-2xl p-4 hover:border-emerald-300 transition-colors shadow-2xs"
        >
          <div className="w-9 h-9 rounded-xl bg-[#EAF7EE] text-[#15803D] flex items-center justify-center mb-3">
            <Package className="w-4 h-4" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 tabular-nums">
            {loading ? '—' : stats?.ordersCount ?? 0}
          </p>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">Total Orders</p>
        </Link>

        <Link
          to="/account/wishlist"
          className="bg-white border border-[#DCE8DF] rounded-2xl p-4 hover:border-emerald-300 transition-colors shadow-2xs"
        >
          <div className="w-9 h-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center mb-3">
            <Heart className="w-4 h-4" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 tabular-nums">
            {loading ? user.wishlist?.length ?? 0 : stats?.wishlistCount ?? user.wishlist?.length ?? 0}
          </p>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">Wishlist Items</p>
        </Link>

        <Link
          to="/account/addresses"
          className="bg-white border border-[#DCE8DF] rounded-2xl p-4 hover:border-emerald-300 transition-colors shadow-2xs"
        >
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
            <MapPin className="w-4 h-4" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 tabular-nums">
            {loading ? user.savedAddresses?.length ?? 0 : stats?.addressesCount ?? 0}
          </p>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">Saved Addresses</p>
        </Link>

        <Link
          to="/account/reviews"
          className="bg-white border border-[#DCE8DF] rounded-2xl p-4 hover:border-emerald-300 transition-colors shadow-2xs"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center mb-3">
            <Star className="w-4 h-4" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 tabular-nums">
            {loading ? '—' : stats?.reviewsCount ?? 0}
          </p>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">Submitted Reviews</p>
        </Link>
      </div>

      {/* Recent Orders */}
      <div className="bg-white border border-[#DCE8DF] rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-900">Recent Orders</h2>
          <Link
            to="/account/orders"
            className="inline-flex items-center gap-1 text-xs font-bold text-[#15803D] hover:underline"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {[1, 2].map((n) => (
              <div key={n} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-8 border border-amber-200 bg-amber-50/40 rounded-xl space-y-2.5 px-4">
            <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
            <p className="text-sm font-bold text-slate-900">Unable to load dashboard data</p>
            <p className="text-xs text-slate-600">{error}</p>
            <button
              type="button"
              onClick={loadDashboard}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        ) : !data || data.recentOrders.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl space-y-2">
            <p className="text-sm font-semibold text-slate-700">No recent orders found</p>
            <Link
              to="/shop"
              className="inline-block px-4 py-2 rounded-xl bg-[#15803D] text-white text-xs font-semibold"
            >
              Browse Catalog
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.recentOrders.map((order) => (
              <div
                key={order._id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <Link
                    to={`/account/orders/${order.orderNumber}`}
                    className="font-mono text-sm font-bold text-slate-900 hover:text-[#15803D]"
                  >
                    {order.orderNumber}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {new Date(order.createdAt).toLocaleDateString()} · {order.items.length} item(s)
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-0.5 rounded bg-[#EAF7EE] text-[#14532D] text-[11px] font-bold uppercase">
                    {order.orderStatus.replace(/_/g, ' ')}
                  </span>
                  <span className="font-mono text-sm font-bold text-slate-900">
                    {formatBdt(order.totalAmount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
