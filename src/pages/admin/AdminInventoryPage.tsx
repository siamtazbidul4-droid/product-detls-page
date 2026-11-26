import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useAppDispatch } from '../../app/hooks.ts';
import { Modal } from '../../components/ui/Modal.tsx';
import { SafeImage } from '../../components/ui/SafeImage.tsx';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { apiRequest } from '../../lib/api.ts';

interface InventoryRow {
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  stockOnHand: number;
  reservedStock: number;
  availableStock: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  imageUrl: string;
}

interface MovementRecord {
  _id: string;
  sku: string;
  type: string;
  quantityDelta: number;
  reservedDelta: number;
  reason: string;
  createdAt: string;
  actorId?: { name: string; email: string } | null;
}

export function AdminInventoryPage() {
  const dispatch = useAppDispatch();
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [movements, setMovements] = useState<MovementRecord[]>([]);
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [loading, setLoading] = useState(true);

  const [adjustTarget, setAdjustTarget] = useState<InventoryRow | null>(null);
  const [quantityDelta, setQuantityDelta] = useState(10);
  const [adjustType, setAdjustType] = useState<'restock' | 'adjustment'>('restock');
  const [reason, setReason] = useState('Warehouse restock');
  const [saving, setSaving] = useState(false);

  const loadInventory = () => {
    setLoading(true);
    apiRequest<{ rows: InventoryRow[]; movements: MovementRecord[] }>('/api/inventory')
      .then((res) => {
        setRows(res.rows);
        setMovements(res.movements);
      })
      .catch((err) => {
        dispatch(
          pushToast({
            variant: 'error',
            message: err instanceof Error ? err.message : 'Unable to load inventory.',
          })
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadInventory();
  }, []);

  const filteredRows = rows.filter((r) => {
    if (filter === 'low') return r.isLowStock;
    if (filter === 'out') return r.isOutOfStock;
    return true;
  });

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    setSaving(true);
    try {
      await apiRequest('/api/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify({
          productId: adjustTarget.productId,
          variantId: adjustTarget.variantId,
          quantityDelta: Number(quantityDelta),
          type: adjustType,
          reason,
        }),
      });
      setAdjustTarget(null);
      dispatch(pushToast({ variant: 'success', message: `Stock adjusted for ${adjustTarget.sku}.` }));
      loadInventory();
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Stock adjustment failed.',
        })
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {(['all', 'low', 'out'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                filter === tab
                  ? 'bg-[#16A34A] text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab === 'all' ? `All SKUs (${rows.length})` : tab === 'low' ? 'Low Stock' : 'Out of Stock'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Item / Variant</th>
                <th className="text-left px-4 py-3 font-semibold">SKU</th>
                <th className="text-center px-4 py-3 font-semibold">On Hand</th>
                <th className="text-center px-4 py-3 font-semibold">Reserved</th>
                <th className="text-center px-4 py-3 font-semibold">Available</th>
                <th className="text-right px-4 py-3 font-semibold">Adjust</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                    Loading inventory...
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={`${row.productId}-${row.variantId || 'base'}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <SafeImage
                          src={row.imageUrl}
                          alt={row.name}
                          className="w-9 h-9 rounded-lg object-cover border border-slate-100"
                        />
                        <span className="font-semibold text-slate-900">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{row.sku}</td>
                    <td className="px-4 py-3 text-center font-mono">{row.stockOnHand}</td>
                    <td className="px-4 py-3 text-center font-mono text-amber-700">
                      {row.reservedStock}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-xs font-bold ${
                          row.isOutOfStock
                            ? 'bg-red-50 text-red-700'
                            : row.isLowStock
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {row.availableStock}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setAdjustTarget(row);
                          setQuantityDelta(10);
                          setAdjustType('restock');
                          setReason('Warehouse restock');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" /> Adjust
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Movement Log */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
        <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
          Recent Stock Movement Ledger
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">SKU</th>
                <th className="text-left px-3 py-2 font-semibold">Type</th>
                <th className="text-center px-3 py-2 font-semibold">Stock Δ</th>
                <th className="text-center px-3 py-2 font-semibold">Reserved Δ</th>
                <th className="text-left px-3 py-2 font-semibold">Reason</th>
                <th className="text-right px-3 py-2 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movements.slice(0, 25).map((m) => (
                <tr key={m._id}>
                  <td className="px-3 py-2 font-mono font-semibold text-slate-800">{m.sku}</td>
                  <td className="px-3 py-2 uppercase">{m.type}</td>
                  <td className="px-3 py-2 text-center font-mono">
                    {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                  </td>
                  <td className="px-3 py-2 text-center font-mono">
                    {m.reservedDelta > 0 ? `+${m.reservedDelta}` : m.reservedDelta}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{m.reason}</td>
                  <td className="px-3 py-2 text-right text-slate-400">
                    {new Date(m.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={Boolean(adjustTarget)}
        onClose={() => setAdjustTarget(null)}
        title={`Adjust Stock — ${adjustTarget?.sku || ''}`}
        description={adjustTarget?.name}
      >
        <form onSubmit={handleAdjust} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Movement Type
              </label>
              <select
                value={adjustType}
                onChange={(e) => setAdjustType(e.target.value as 'restock' | 'adjustment')}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="restock">Restock (+)</option>
                <option value="adjustment">Manual Adjustment (+/-)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Quantity Delta
              </label>
              <input
                type="number"
                required
                value={quantityDelta}
                onChange={(e) => setQuantityDelta(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason / Audit Note
            </label>
            <input
              type="text"
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdjustTarget(null)}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-60"
            >
              {saving ? 'Updating...' : 'Apply Stock Adjustment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
