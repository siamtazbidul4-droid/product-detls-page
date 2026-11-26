import { useEffect, useState } from 'react';
import { Eye, Printer, RotateCcw, Search } from 'lucide-react';
import { ORDER_LIFECYCLE_STATUSES, type OrderLifecycleStatus } from '../../../shared/orderStateMachine.ts';
import { useAppDispatch } from '../../app/hooks.ts';
import { Modal } from '../../components/ui/Modal.tsx';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { apiRequest, formatBdt } from '../../lib/api.ts';
import type { OrderRecord } from '../../types/domain.ts';

interface AdminReturnItem {
  _id: string;
  orderNumber: string;
  reason: string;
  description: string;
  status: 'requested' | 'approved' | 'rejected' | 'received' | 'restocked';
  inspectionResult?: 'pending' | 'resalable' | 'damaged';
  adminNote?: string;
  userId?: { name: string; email: string };
  createdAt: string;
}

export function AdminOrdersPage() {
  const dispatch = useAppDispatch();
  const [tab, setTab] = useState<'orders' | 'returns'>('orders');

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'highest_total' | 'lowest_total'>('newest');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [search, setSearch] = useState('');
  const [loadingOrders, setLoadingOrders] = useState(true);

  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [nextStatus, setNextStatus] = useState<OrderLifecycleStatus>('confirmed');
  const [transitionNote, setTransitionNote] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [courierName, setCourierName] = useState('');
  const [staffNote, setStaffNote] = useState('');
  const [savingOrder, setSavingOrder] = useState(false);

  const [returns, setReturns] = useState<AdminReturnItem[]>([]);
  const [selectedReturn, setSelectedReturn] = useState<AdminReturnItem | null>(null);
  const [retStatus, setRetStatus] = useState<AdminReturnItem['status']>('approved');
  const [inspectionResult, setInspectionResult] = useState<'pending' | 'resalable' | 'damaged'>('pending');
  const [retAdminNote, setRetAdminNote] = useState('');
  const [savingReturn, setSavingReturn] = useState(false);

  const loadOrders = (targetPage = page) => {
    setLoadingOrders(true);
    const params = new URLSearchParams({
      limit: '20',
      page: String(targetPage),
      sortBy,
    });
    if (statusFilter) params.set('status', statusFilter);
    if (paymentMethodFilter) params.set('paymentMethod', paymentMethodFilter);
    if (paymentStatusFilter) params.set('paymentStatus', paymentStatusFilter);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (search.trim()) params.set('q', search.trim());

    apiRequest<{ orders: OrderRecord[]; total: number; page: number; totalPages: number }>(
      `/api/orders/admin/list?${params.toString()}`
    )
      .then((res) => {
        setOrders(res.orders || []);
        setTotalOrders(res.total || 0);
        setTotalPages(Math.max(1, res.totalPages || 1));
      })
      .catch((err) => {
        dispatch(
          pushToast({
            variant: 'error',
            message: err instanceof Error ? err.message : 'Failed to load orders.',
          })
        );
      })
      .finally(() => setLoadingOrders(false));
  };

  const loadReturns = () => {
    apiRequest<{ returns: AdminReturnItem[] }>('/api/orders/admin/returns')
      .then((res) => setReturns(res.returns))
      .catch(() => {});
  };

  useEffect(() => {
    loadOrders(page);
  }, [statusFilter, paymentMethodFilter, paymentStatusFilter, dateFrom, dateTo, sortBy, page]);

  useEffect(() => {
    loadReturns();
  }, []);

  const openOrderModal = (order: OrderRecord) => {
    setSelectedOrder(order);
    setNextStatus(order.orderStatus);
    setTransitionNote('');
    setTrackingNumber(order.trackingNumber || '');
    setCourierName(order.courierName || '');
    setStaffNote('');
  };

  const handleTransitionOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setSavingOrder(true);
    try {
      const res = await apiRequest<{ order: OrderRecord }>(
        `/api/orders/admin/${selectedOrder._id}/transition`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            nextStatus,
            note: transitionNote || undefined,
            trackingNumber: trackingNumber || undefined,
            courierName: courierName || undefined,
          }),
        }
      );
      setSelectedOrder(res.order);
      setOrders((prev) => prev.map((o) => (o._id === res.order._id ? res.order : o)));
      dispatch(pushToast({ variant: 'success', message: `Order ${res.order.orderNumber} updated.` }));
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Status transition failed.',
        })
      );
    } finally {
      setSavingOrder(false);
    }
  };

  const handleAddStaffNote = async () => {
    if (!selectedOrder || staffNote.trim().length < 2) return;
    try {
      const res = await apiRequest<{ order: OrderRecord }>(
        `/api/orders/admin/${selectedOrder._id}/notes`,
        {
          method: 'POST',
          body: JSON.stringify({ note: staffNote }),
        }
      );
      setSelectedOrder(res.order);
      setStaffNote('');
      dispatch(pushToast({ variant: 'success', message: 'Internal staff note added.' }));
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Failed to add note.',
        })
      );
    }
  };

  const handleModerateReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReturn) return;
    setSavingReturn(true);
    try {
      await apiRequest(`/api/orders/admin/returns/${selectedReturn._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: retStatus,
          inspectionResult,
          adminNote: retAdminNote,
        }),
      });
      setSelectedReturn(null);
      dispatch(pushToast({ variant: 'success', message: 'Return request updated.' }));
      loadReturns();
      loadOrders();
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Return update failed.',
        })
      );
    } finally {
      setSavingReturn(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('orders')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold ${
              tab === 'orders'
                ? 'bg-[#16A34A] text-white'
                : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            Orders ({totalOrders || orders.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('returns')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold ${
              tab === 'returns'
                ? 'bg-[#16A34A] text-white'
                : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Returns Queue ({returns.length})
          </button>
        </div>

        {tab === 'orders' && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by order status"
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value);
              }}
              className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
            >
              <option value="">All Order Statuses</option>
              {ORDER_LIFECYCLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by payment method"
              value={paymentMethodFilter}
              onChange={(e) => {
                setPage(1);
                setPaymentMethodFilter(e.target.value);
              }}
              className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
            >
              <option value="">All Payment Methods</option>
              <option value="cod">Cash on Delivery</option>
              <option value="card">Credit / Debit Card</option>
              <option value="bkash">bKash</option>
              <option value="nagad">Nagad</option>
            </select>

            <select
              aria-label="Filter by payment status"
              value={paymentStatusFilter}
              onChange={(e) => {
                setPage(1);
                setPaymentStatusFilter(e.target.value);
              }}
              className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
            >
              <option value="">All Payment States</option>
              <option value="unpaid">Unpaid</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>

            <input
              type="date"
              aria-label="Order date from"
              value={dateFrom}
              onChange={(e) => {
                setPage(1);
                setDateFrom(e.target.value);
              }}
              className="h-9 px-2.5 rounded-xl border border-slate-200 bg-white text-xs"
            />

            <input
              type="date"
              aria-label="Order date to"
              value={dateTo}
              onChange={(e) => {
                setPage(1);
                setDateTo(e.target.value);
              }}
              className="h-9 px-2.5 rounded-xl border border-slate-200 bg-white text-xs"
            />

            <select
              aria-label="Sort orders"
              value={sortBy}
              onChange={(e) => {
                setPage(1);
                setSortBy(e.target.value as 'newest' | 'oldest' | 'highest_total' | 'lowest_total');
              }}
              className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="highest_total">Highest Total</option>
              <option value="lowest_total">Lowest Total</option>
            </select>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                loadOrders(1);
              }}
              className="flex items-center gap-1.5"
            >
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Order # / phone / email / ref..."
                  className="h-9 pl-8 pr-3 rounded-xl border border-slate-200 bg-white text-xs"
                />
              </div>
              <button
                type="submit"
                className="h-9 px-3 rounded-xl bg-slate-900 text-white text-xs font-semibold"
              >
                Find
              </button>
            </form>
          </div>
        )}
      </div>

      {tab === 'orders' ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Order #</th>
                  <th className="text-left px-4 py-3 font-semibold">Customer</th>
                  <th className="text-left px-4 py-3 font-semibold">Destination</th>
                  <th className="text-center px-4 py-3 font-semibold">Order Status</th>
                  <th className="text-center px-4 py-3 font-semibold">Payment</th>
                  <th className="text-right px-4 py-3 font-semibold">Total</th>
                  <th className="text-right px-4 py-3 font-semibold">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingOrders ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-500">
                      Loading orders...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-500">
                      No orders match your filter.
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order._id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono font-bold text-xs text-slate-900">
                        {order.orderNumber}
                        <p className="text-[10px] font-sans font-normal text-slate-400">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 text-xs">{order.customerName}</p>
                        <p className="text-[11px] text-slate-500">{order.customerPhone}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {order.shippingAddress.districtName}, {order.shippingAddress.divisionName}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] font-bold uppercase">
                          {order.orderStatus.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs uppercase text-slate-700">
                        {order.paymentChannel || order.paymentMethod} · {order.paymentStatus}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                        {formatBdt(order.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openOrderModal(order)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
                        >
                          <Eye className="w-3.5 h-3.5" /> Manage
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Showing page {page} of {totalPages} ({totalOrders} orders)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Order #</th>
                  <th className="text-left px-4 py-3 font-semibold">Customer</th>
                  <th className="text-left px-4 py-3 font-semibold">Reason</th>
                  <th className="text-center px-4 py-3 font-semibold">Status</th>
                  <th className="text-center px-4 py-3 font-semibold">Inspection</th>
                  <th className="text-right px-4 py-3 font-semibold">Moderate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {returns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                      No return requests submitted yet.
                    </td>
                  </tr>
                ) : (
                  returns.map((r) => (
                    <tr key={r._id}>
                      <td className="px-4 py-3 font-mono font-bold text-xs">{r.orderNumber}</td>
                      <td className="px-4 py-3 text-xs">{r.userId?.name || 'Customer'}</td>
                      <td className="px-4 py-3 text-xs text-slate-700">{r.reason}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-bold uppercase">
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs uppercase">
                        {r.inspectionResult || 'pending'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReturn(r);
                            setRetStatus(r.status);
                            setInspectionResult(r.inspectionResult || 'pending');
                            setRetAdminNote(r.adminNote || '');
                          }}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold hover:bg-slate-50"
                        >
                          Inspect / Update
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order Fulfillment & Transition Modal */}
      <Modal
        open={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        title={`Order ${selectedOrder?.orderNumber || ''}`}
        description={
          selectedOrder
            ? `${selectedOrder.customerName} · ${selectedOrder.customerPhone}`
            : undefined
        }
        maxWidthClass="max-w-2xl"
      >
        {selectedOrder && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 bg-slate-50 rounded-xl p-3.5 text-xs">
              <div className="space-y-1">
                <p className="text-slate-700">
                  <strong>Address:</strong> {selectedOrder.shippingAddress.houseAddress}
                  {selectedOrder.shippingAddress.roadStreet
                    ? `, ${selectedOrder.shippingAddress.roadStreet}`
                    : ''}
                  {selectedOrder.shippingAddress.landmark
                    ? ` (${selectedOrder.shippingAddress.landmark})`
                    : ''}
                  , {selectedOrder.shippingAddress.areaName},{' '}
                  {selectedOrder.shippingAddress.upazilaName},{' '}
                  {selectedOrder.shippingAddress.districtName},{' '}
                  {selectedOrder.shippingAddress.divisionName}
                </p>
                <p className="text-slate-500">
                  Email: <span className="text-slate-800">{selectedOrder.customerEmail}</span>
                  {selectedOrder.customerGender ? (
                    <>
                      {' '}
                      · Gender:{' '}
                      <span className="capitalize text-slate-800">
                        {selectedOrder.customerGender.replace(/_/g, ' ')}
                      </span>
                    </>
                  ) : null}
                  {' '}· Channel:{' '}
                  <span className="uppercase font-semibold text-slate-800">
                    {selectedOrder.paymentChannel || selectedOrder.paymentMethod}
                  </span>
                  {selectedOrder.transactionRef ? (
                    <>
                      {' '}
                      · Ref:{' '}
                      <span className="font-mono text-slate-800">{selectedOrder.transactionRef}</span>
                    </>
                  ) : null}
                </p>
                {selectedOrder.termsAcceptedAt && (
                  <p className="text-[11px] text-emerald-700">
                    Terms &amp; Conditions accepted on{' '}
                    {new Date(selectedOrder.termsAcceptedAt).toLocaleString()}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white border border-slate-200 font-semibold shrink-0"
              >
                <Printer className="w-3.5 h-3.5" /> Packing Slip
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs">
              {selectedOrder.items.map((item, idx) => (
                <div key={idx} className="px-3 py-2 flex items-center justify-between">
                  <span>
                    <strong>{item.quantity}×</strong> {item.productName}{' '}
                    <span className="font-mono text-slate-400">({item.sku})</span>
                  </span>
                  <span className="font-mono font-bold">{formatBdt(item.lineTotal)}</span>
                </div>
              ))}
              <div className="px-3 py-2 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                <span>
                  Subtotal: <strong className="font-mono text-slate-900">{formatBdt(selectedOrder.subtotal)}</strong>
                  {selectedOrder.discountAmount > 0 && (
                    <> · Discount: <strong className="font-mono text-emerald-700">-{formatBdt(selectedOrder.discountAmount)}</strong></>
                  )}
                  {' '}· Shipping: <strong className="font-mono text-slate-900">{formatBdt(selectedOrder.shippingCharge)}</strong>
                  {selectedOrder.taxAmount > 0 && (
                    <> · Tax: <strong className="font-mono text-slate-900">{formatBdt(selectedOrder.taxAmount)}</strong></>
                  )}
                </span>
                <span className="text-xs font-extrabold text-slate-900">
                  Total: <span className="font-mono text-emerald-700">{formatBdt(selectedOrder.totalAmount)}</span>
                </span>
              </div>
            </div>

            <form onSubmit={handleTransitionOrder} className="space-y-3 border-t border-slate-100 pt-4">
              <p className="text-xs font-bold uppercase text-slate-700">
                Order Lifecycle Transition
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value as OrderLifecycleStatus)}
                  className="h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
                >
                  {ORDER_LIFECYCLE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  placeholder="Courier (Steadfast / Pathao)"
                  className="h-10 px-3 rounded-lg border border-slate-200 text-sm"
                />
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="Tracking ID"
                  className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
                />
              </div>
              <input
                type="text"
                value={transitionNote}
                onChange={(e) => setTransitionNote(e.target.value)}
                placeholder="Transition note for timeline & customer email"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
              <button
                type="submit"
                disabled={savingOrder}
                className="px-5 py-2 rounded-lg bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-60"
              >
                {savingOrder ? 'Updating...' : 'Apply Status Transition'}
              </button>
            </form>

            {/* Internal Staff Notes */}
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <p className="text-xs font-bold uppercase text-slate-700">Internal Staff Notes</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={staffNote}
                  onChange={(e) => setStaffNote(e.target.value)}
                  placeholder="Add internal fulfillment note..."
                  className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddStaffNote}
                  className="px-3.5 h-9 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                >
                  Add Note
                </button>
              </div>
              {selectedOrder.staffNotes?.map((n, i) => (
                <p key={i} className="text-xs bg-slate-50 px-3 py-1.5 rounded text-slate-700">
                  <strong>{n.actorName}:</strong> {n.note}
                </p>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Return Moderation & Inspection Modal */}
      <Modal
        open={Boolean(selectedReturn)}
        onClose={() => setSelectedReturn(null)}
        title={`Return Inspection — ${selectedReturn?.orderNumber || ''}`}
      >
        {selectedReturn && (
          <form onSubmit={handleModerateReturn} className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-3 text-xs space-y-1">
              <p className="font-bold text-slate-900">{selectedReturn.reason}</p>
              <p className="text-slate-600">{selectedReturn.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={retStatus}
                  onChange={(e) => setRetStatus(e.target.value as AdminReturnItem['status'])}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
                >
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="received">Physically Received</option>
                  <option value="restocked">Restocked (Requires Resalable Inspection)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Physical Inspection Result
                </label>
                <select
                  value={inspectionResult}
                  onChange={(e) =>
                    setInspectionResult(e.target.value as 'pending' | 'resalable' | 'damaged')
                  }
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
                >
                  <option value="pending">Pending Inspection</option>
                  <option value="resalable">Resalable (Safe to Restock)</option>
                  <option value="damaged">Damaged (Do Not Restock)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Note</label>
              <textarea
                rows={3}
                value={retAdminNote}
                onChange={(e) => setRetAdminNote(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedReturn(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingReturn}
                className="px-5 py-2 rounded-lg bg-[#16A34A] text-white text-sm font-semibold disabled:opacity-60"
              >
                {savingReturn ? 'Saving...' : 'Update Return'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
