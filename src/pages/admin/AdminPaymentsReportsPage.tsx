import { useEffect, useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import { useAppDispatch } from '../../app/hooks.ts';
import { Modal } from '../../components/ui/Modal.tsx';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { apiRequest, formatBdt, getAuthToken } from '../../lib/api.ts';

interface TxRecord {
  _id: string;
  orderId: string;
  orderNumber: string;
  provider: string;
  transactionRef: string;
  amount: number;
  status: string;
  channel?: string;
  createdAt: string;
}

interface RefundRecord {
  _id: string;
  orderNumber: string;
  amount: number;
  method: string;
  reference: string;
  reason: string;
  createdAt: string;
}

interface ReportsData {
  ordersByStatus: Array<{ _id: string; count: number; total: number }>;
  paymentSummary: Array<{ _id: string; count: number; total: number }>;
}

export function AdminPaymentsReportsPage() {
  const dispatch = useAppDispatch();
  const [transactions, setTransactions] = useState<TxRecord[]>([]);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [gatewayStatus, setGatewayStatus] = useState<{
    sslcommerzConfigured: boolean;
    codEnabled: boolean;
  } | null>(null);
  const [reports, setReports] = useState<ReportsData | null>(null);

  const [refundTarget, setRefundTarget] = useState<TxRecord | null>(null);
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundMethod, setRefundMethod] = useState('SSLCommerz / Bank Refund');
  const [refundReason, setRefundReason] = useState('');
  const [issuing, setIssuing] = useState(false);

  const loadData = () => {
    Promise.all([
      apiRequest<{
        transactions: TxRecord[];
        refunds: RefundRecord[];
        gatewayStatus: { sslcommerzConfigured: boolean; codEnabled: boolean };
      }>('/api/payments/admin/transactions'),
      apiRequest<ReportsData>('/api/support/admin/reports'),
    ])
      .then(([txRes, repRes]) => {
        setTransactions(txRes.transactions);
        setRefunds(txRes.refunds);
        setGatewayStatus(txRes.gatewayStatus);
        setReports(repRes);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleIssueRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundTarget) return;
    setIssuing(true);
    try {
      await apiRequest('/api/payments/admin/refunds', {
        method: 'POST',
        body: JSON.stringify({
          orderId: refundTarget.orderId,
          amount: Number(refundAmount),
          method: refundMethod,
          reason: refundReason,
        }),
      });
      setRefundTarget(null);
      dispatch(pushToast({ variant: 'success', message: 'Refund processed and logged.' }));
      loadData();
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Refund failed.',
        })
      );
    } finally {
      setIssuing(false);
    }
  };

  const handleDownloadOrdersCsv = async () => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/support/admin/reports/orders.csv', {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Report export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'novara-orders-report.csv';
      a.click();
      URL.revokeObjectURL(url);
      dispatch(pushToast({ variant: 'success', message: 'Orders CSV report downloaded.' }));
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Export failed.',
        })
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 font-semibold">
            Cash on Delivery: {gatewayStatus?.codEnabled ? 'Active' : 'Disabled'}
          </span>
          <span
            className={`px-3 py-1.5 rounded-lg font-semibold ${
              gatewayStatus?.sslcommerzConfigured
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-amber-50 text-amber-800'
            }`}
          >
            SSLCommerz:{' '}
            {gatewayStatus?.sslcommerzConfigured
              ? 'Credentials Configured'
              : 'Env Credentials Not Set'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleDownloadOrdersCsv}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
        >
          <Download className="w-4 h-4" /> Export Orders CSV Report
        </button>
      </div>

      {/* Order & Payment Summaries */}
      {reports && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
              Sales Breakdown by Order Status
            </h3>
            <div className="divide-y divide-slate-100 text-xs">
              {reports.ordersByStatus.map((row) => (
                <div key={row._id} className="py-2 flex items-center justify-between">
                  <span className="uppercase font-semibold text-slate-700">
                    {row._id.replace(/_/g, ' ')} ({row.count})
                  </span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatBdt(row.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
              Payment Reconciliation Summary
            </h3>
            <div className="divide-y divide-slate-100 text-xs">
              {reports.paymentSummary.map((row) => (
                <div key={row._id} className="py-2 flex items-center justify-between">
                  <span className="uppercase font-semibold text-slate-700">
                    {row._id} ({row.count})
                  </span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatBdt(row.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Transactions Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="text-sm font-extrabold text-slate-900">Payment Transactions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Order #</th>
                <th className="text-left px-4 py-2.5 font-semibold">Reference</th>
                <th className="text-left px-4 py-2.5 font-semibold">Provider / Channel</th>
                <th className="text-center px-4 py-2.5 font-semibold">Status</th>
                <th className="text-right px-4 py-2.5 font-semibold">Amount</th>
                <th className="text-right px-4 py-2.5 font-semibold">Refund</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((tx) => (
                <tr key={tx._id}>
                  <td className="px-4 py-2.5 font-mono font-bold">{tx.orderNumber}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-600">{tx.transactionRef}</td>
                  <td className="px-4 py-2.5 uppercase">
                    {tx.provider} {tx.channel ? `· ${tx.channel}` : ''}
                  </td>
                  <td className="px-4 py-2.5 text-center uppercase font-bold">{tx.status}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold">
                    {formatBdt(tx.amount)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {tx.status === 'verified' && (
                      <button
                        type="button"
                        onClick={() => {
                          setRefundTarget(tx);
                          setRefundAmount(tx.amount);
                          setRefundReason('');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 font-semibold"
                      >
                        <RotateCcw className="w-3 h-3" /> Refund
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Refund History */}
      {refunds.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
            Processed Refunds
          </h3>
          {refunds.map((rf) => (
            <div key={rf._id} className="text-xs flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
              <span>
                <strong className="font-mono">{rf.reference}</strong> ({rf.orderNumber}) · {rf.reason}
              </span>
              <span className="font-mono font-bold text-red-700">-{formatBdt(rf.amount)}</span>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(refundTarget)}
        onClose={() => setRefundTarget(null)}
        title={`Process Refund — ${refundTarget?.orderNumber || ''}`}
      >
        {refundTarget && (
          <form onSubmit={handleIssueRefund} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Refund Amount (BDT, max {formatBdt(refundTarget.amount)})
              </label>
              <input
                type="number"
                required
                min={1}
                max={refundTarget.amount}
                value={refundAmount}
                onChange={(e) => setRefundAmount(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Refund Method
              </label>
              <input
                type="text"
                required
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reason</label>
              <input
                type="text"
                required
                minLength={3}
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={issuing}
                className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60"
              >
                {issuing ? 'Processing...' : 'Confirm Refund'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
