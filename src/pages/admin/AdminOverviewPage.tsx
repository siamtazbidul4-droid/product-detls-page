import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Database,
  DollarSign,
  PackageX,
  RotateCcw,
  ShoppingBag,
  Star,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { hasPermission } from '../../../shared/rbac.ts';
import { useAppDispatch, useAppSelector } from '../../app/hooks.ts';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.tsx';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { apiRequest, formatBdt } from '../../lib/api.ts';

interface DashboardResponse {
  days: number;
  metrics: {
    grossSales: number;
    netSales: number;
    orderCount: number;
    avgOrderValue: number;
    pendingOrders: number;
    cancelledOrRefundedCount: number;
    lowStockCount: number;
    outOfStockCount: number;
    inventoryValuation: number;
    pendingReviewsCount: number;
    openReturnsCount: number;
  };
  recentAuditLogs: Array<{
    _id: string;
    actorEmail: string;
    actorRole: string;
    action: string;
    resourceType: string;
    createdAt: string;
  }>;
}

export function AdminOverviewPage() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const loadDashboard = (windowDays = days) => {
    setLoading(true);
    apiRequest<DashboardResponse>(`/api/support/admin/dashboard?days=${windowDays}`)
      .then((res) => setData(res))
      .catch((err) => {
        dispatch(
          pushToast({
            variant: 'error',
            message: err instanceof Error ? err.message : 'Unable to load dashboard KPIs.',
          })
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard(days);
  }, [days]);

  const handleSeedCatalog = async () => {
    setSeeding(true);
    try {
      const res = await apiRequest<{ seededProducts?: number; message?: string }>(
        '/api/support/admin/seed-catalog',
        { method: 'POST' }
      );
      setSeedConfirmOpen(false);
      dispatch(
        pushToast({
          variant: 'success',
          message: `Bangladesh catalog seeded (${res.seededProducts ?? 0} products written to MongoDB Atlas).`,
        })
      );
      loadDashboard(days);
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Catalog seed failed.',
        })
      );
    } finally {
      setSeeding(false);
    }
  };

  const m = data?.metrics;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Store Performance Overview</h2>
          <p className="text-xs text-slate-500">
            Live MongoDB Atlas metrics for sales, inventory, returns, and moderation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Reporting window"
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700"
          >
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={90}>Last 90 Days</option>
            <option value={365}>Last 365 Days</option>
          </select>

          {user && hasPermission(user.role, 'settings:write') && (
            <button
              type="button"
              onClick={() => setSeedConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#0B1A2B] hover:bg-slate-800 text-white text-xs font-semibold"
            >
              <Database className="w-3.5 h-3.5" /> Seed Bangladesh Catalog
            </button>
          )}
        </div>
      </div>

      {loading || !m ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} className="h-28 rounded-2xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Net Sales"
              value={formatBdt(m.netSales)}
              sub={`Gross: ${formatBdt(m.grossSales)}`}
              icon={DollarSign}
              tone="emerald"
            />
            <KpiCard
              label="Total Orders"
              value={String(m.orderCount)}
              sub={`Pending: ${m.pendingOrders} · Cancelled/Refunded: ${m.cancelledOrRefundedCount}`}
              icon={ShoppingBag}
              tone="blue"
            />
            <KpiCard
              label="Avg Order Value"
              value={formatBdt(m.avgOrderValue)}
              sub={`Inventory Value: ${formatBdt(m.inventoryValuation)}`}
              icon={TrendingUp}
              tone="emerald"
            />
            <KpiCard
              label="Stock Alerts"
              value={`${m.lowStockCount} Low / ${m.outOfStockCount} Out`}
              sub="Across active SKUs & variants"
              icon={m.outOfStockCount > 0 ? PackageX : AlertTriangle}
              tone={m.outOfStockCount > 0 ? 'red' : 'amber'}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link
              to="/admin/orders"
              className="bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-4 flex items-center justify-between transition-colors"
            >
              <div>
                <p className="text-xs font-semibold text-slate-500">Pending Orders</p>
                <p className="text-2xl font-extrabold font-mono text-slate-900 mt-1">
                  {m.pendingOrders}
                </p>
              </div>
              <ShoppingBag className="w-8 h-8 text-emerald-600/80" />
            </Link>

            <Link
              to="/admin/reviews"
              className="bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-4 flex items-center justify-between transition-colors"
            >
              <div>
                <p className="text-xs font-semibold text-slate-500">Pending Reviews</p>
                <p className="text-2xl font-extrabold font-mono text-slate-900 mt-1">
                  {m.pendingReviewsCount}
                </p>
              </div>
              <Star className="w-8 h-8 text-amber-500/80" />
            </Link>

            <Link
              to="/admin/orders"
              className="bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-4 flex items-center justify-between transition-colors"
            >
              <div>
                <p className="text-xs font-semibold text-slate-500">Open Return Requests</p>
                <p className="text-2xl font-extrabold font-mono text-slate-900 mt-1">
                  {m.openReturnsCount}
                </p>
              </div>
              <RotateCcw className="w-8 h-8 text-blue-600/80" />
            </Link>
          </div>
        </>
      )}

      {/* Recent Audit Trail */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
            Recent Security & Operations Audit Log
          </h3>
          <Link to="/admin/staff" className="text-xs font-semibold text-emerald-700 hover:underline">
            View Full Audit Trail
          </Link>
        </div>

        {!data?.recentAuditLogs?.length ? (
          <p className="text-xs text-slate-500 py-4">No audit entries recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Action</th>
                  <th className="text-left px-3 py-2 font-semibold">Resource</th>
                  <th className="text-left px-3 py-2 font-semibold">Actor</th>
                  <th className="text-right px-3 py-2 font-semibold">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentAuditLogs.map((log) => (
                  <tr key={log._id}>
                    <td className="px-3 py-2.5 font-mono font-semibold text-slate-800">
                      {log.action}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{log.resourceType}</td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {log.actorEmail}{' '}
                      <span className="text-[10px] text-slate-400">({log.actorRole})</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={seedConfirmOpen}
        onClose={() => setSeedConfirmOpen(false)}
        onConfirm={handleSeedCatalog}
        title="Seed Bangladesh Store Catalog"
        message="This idempotent action writes sample categories, brands, products, welcome coupon NOVARA10, and CMS defaults into your MongoDB Atlas database without overwriting existing records."
        confirmLabel="Seed Catalog Now"
        loading={seeding}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof DollarSign;
  tone: 'emerald' | 'blue' | 'amber' | 'red';
}) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }[tone];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="text-xl font-extrabold font-mono text-slate-900 mt-1">{value}</p>
        <p className="text-[11px] text-slate-500 mt-1">{sub}</p>
      </div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colors}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
  );
}
