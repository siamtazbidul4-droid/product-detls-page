import { useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useAppDispatch } from '../../app/hooks.ts';
import { Modal } from '../../components/ui/Modal.tsx';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { apiRequest, formatBdt } from '../../lib/api.ts';

interface CouponRecord {
  _id: string;
  code: string;
  description?: string;
  type: 'fixed' | 'percentage';
  value: number;
  maxDiscountCap?: number | null;
  minOrderAmount: number;
  usageLimit?: number | null;
  usedCount: number;
  perCustomerLimit?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  isActive: boolean;
}

interface RedemptionRecord {
  _id: string;
  code: string;
  discountAmount: number;
  createdAt: string;
  userId?: { name: string; email: string } | null;
}

export function AdminMarketingPage() {
  const dispatch = useAppDispatch();
  const [coupons, setCoupons] = useState<CouponRecord[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CouponRecord | null>(null);
  const [form, setForm] = useState({
    code: '',
    description: '',
    type: 'percentage' as 'fixed' | 'percentage',
    value: 10,
    maxDiscountCap: '',
    minOrderAmount: 500,
    usageLimit: '',
    perCustomerLimit: '1',
    startsAt: '',
    expiresAt: '',
    isActive: true,
  });
  const [saving, setSaving] = useState(false);

  const loadCoupons = () => {
    setLoading(true);
    apiRequest<{ coupons: CouponRecord[]; recentRedemptions: RedemptionRecord[] }>(
      '/api/marketing/admin/coupons'
    )
      .then((res) => {
        setCoupons(res.coupons);
        setRedemptions(res.recentRedemptions);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCoupons();
  }, []);

  const openModal = (c?: CouponRecord) => {
    if (c) {
      setEditing(c);
      setForm({
        code: c.code,
        description: c.description || '',
        type: c.type,
        value: c.value,
        maxDiscountCap: c.maxDiscountCap ? String(c.maxDiscountCap) : '',
        minOrderAmount: c.minOrderAmount,
        usageLimit: c.usageLimit ? String(c.usageLimit) : '',
        perCustomerLimit: c.perCustomerLimit ? String(c.perCustomerLimit) : '',
        startsAt: c.startsAt ? c.startsAt.slice(0, 16) : '',
        expiresAt: c.expiresAt ? c.expiresAt.slice(0, 16) : '',
        isActive: c.isActive,
      });
    } else {
      setEditing(null);
      setForm({
        code: '',
        description: '',
        type: 'percentage',
        value: 10,
        maxDiscountCap: '500',
        minOrderAmount: 500,
        usageLimit: '',
        perCustomerLimit: '1',
        startsAt: '',
        expiresAt: '',
        isActive: true,
      });
    }
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || undefined,
        type: form.type,
        value: Number(form.value),
        maxDiscountCap: form.maxDiscountCap ? Number(form.maxDiscountCap) : null,
        minOrderAmount: Number(form.minOrderAmount),
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        perCustomerLimit: form.perCustomerLimit ? Number(form.perCustomerLimit) : null,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        isActive: form.isActive,
      };
      const url = editing
        ? `/api/marketing/admin/coupons/${editing._id}`
        : '/api/marketing/admin/coupons';
      await apiRequest(url, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      setModalOpen(false);
      dispatch(pushToast({ variant: 'success', message: editing ? 'Coupon updated.' : 'Coupon created.' }));
      loadCoupons();
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Unable to save coupon.',
        })
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Coupons & Campaign Discounts</h2>
          <p className="text-xs text-slate-500">
            Configure fixed or percentage coupons with order minimums, caps, and atomic usage limits.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openModal()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-semibold"
        >
          <Plus className="w-4 h-4" /> Create Coupon
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Code</th>
              <th className="text-left px-4 py-3 font-semibold">Discount</th>
              <th className="text-left px-4 py-3 font-semibold">Min Order</th>
              <th className="text-center px-4 py-3 font-semibold">Used</th>
              <th className="text-center px-4 py-3 font-semibold">Status</th>
              <th className="text-right px-4 py-3 font-semibold">Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                  Loading coupons...
                </td>
              </tr>
            ) : (
              coupons.map((c) => (
                <tr key={c._id}>
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold text-slate-900">{c.code}</span>
                    {c.description && <p className="text-[11px] text-slate-500">{c.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-emerald-700">
                    {c.type === 'percentage' ? `${c.value}%` : formatBdt(c.value)}
                    {c.maxDiscountCap ? ` (max ${formatBdt(c.maxDiscountCap)})` : ''}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{formatBdt(c.minOrderAmount)}</td>
                  <td className="px-4 py-3 text-center font-mono text-xs">
                    {c.usedCount} / {c.usageLimit ?? '∞'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        c.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {c.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openModal(c)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
                      aria-label={`Edit coupon ${c.code}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
          Recent Coupon Redemptions
        </h3>
        {redemptions.length === 0 ? (
          <p className="text-xs text-slate-500">No coupon redemptions yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 text-xs">
            {redemptions.map((r) => (
              <div key={r._id} className="py-2 flex items-center justify-between">
                <span>
                  <strong className="font-mono">{r.code}</strong> redeemed by{' '}
                  {r.userId?.email || 'Customer'}
                </span>
                <span className="font-mono font-semibold text-emerald-700">
                  -{formatBdt(r.discountAmount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Coupon ${editing.code}` : 'Create Coupon'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Code</label>
              <input
                type="text"
                required
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="EID20"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, type: e.target.value as 'fixed' | 'percentage' }))
                }
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed BDT (৳)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Value</label>
              <input
                type="number"
                required
                min={1}
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Max Cap (৳)
              </label>
              <input
                type="number"
                value={form.maxDiscountCap}
                onChange={(e) => setForm((f) => ({ ...f, maxDiscountCap: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Min Order (৳)
              </label>
              <input
                type="number"
                min={0}
                value={form.minOrderAmount}
                onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: Number(e.target.value) }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Global Usage Limit
              </label>
              <input
                type="number"
                min={1}
                value={form.usageLimit}
                onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
                placeholder="Unlimited"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Per Customer Limit
              </label>
              <input
                type="number"
                min={1}
                value={form.perCustomerLimit}
                onChange={(e) => setForm((f) => ({ ...f, perCustomerLimit: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            <span>Coupon is active</span>
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-[#16A34A] text-white text-sm font-semibold disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Coupon'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
