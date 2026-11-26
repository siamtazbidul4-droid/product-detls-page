import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  MapPin,
  Printer,
  RotateCcw,
  Truck,
  XCircle,
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { canCustomerCancelOrder, canCustomerRequestReturn } from '../../shared/orderStateMachine.ts';
import { useAppDispatch, useAppSelector } from '../app/hooks.ts';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { SafeImage } from '../components/ui/SafeImage.tsx';
import { SeoHead } from '../components/ui/SeoHead.tsx';
import { openAuthModal } from '../features/auth/authSlice.ts';
import { pushToast } from '../features/toast/toastSlice.ts';
import { apiRequest, formatBdt } from '../lib/api.ts';
import type { OrderRecord } from '../types/domain.ts';

interface ReturnRequestRecord {
  _id: string;
  reason: string;
  description: string;
  status: string;
  inspectionResult?: string;
  adminNote?: string;
  createdAt: string;
}

export function OrderDetailPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const { user, initialized } = useAppSelector((s) => s.auth);

  const [order, setOrder] = useState<(OrderRecord & { deliveredAt?: string }) | null>(null);
  const [returns, setReturns] = useState<ReturnRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('Damaged or defective item');
  const [returnDescription, setReturnDescription] = useState('');
  const [submittingReturn, setSubmittingReturn] = useState(false);

  useEffect(() => {
    const paymentState = searchParams.get('payment');
    if (paymentState === 'verified') {
      dispatch(pushToast({ variant: 'success', message: 'Online payment verified successfully.' }));
    } else if (paymentState === 'failed' || paymentState === 'unverified') {
      dispatch(pushToast({ variant: 'error', message: 'Payment was not completed or could not be verified.' }));
    } else if (paymentState === 'cancelled') {
      dispatch(pushToast({ variant: 'warning', message: 'Payment session was cancelled.' }));
    }
  }, [searchParams, dispatch]);

  const loadOrder = () => {
    if (!orderNumber || !user) return;
    setLoading(true);
    setError(null);
    apiRequest<{
      order: OrderRecord & { deliveredAt?: string };
      returns: ReturnRequestRecord[];
    }>(`/api/orders/my/${orderNumber}`)
      .then((res) => {
        setOrder(res.order);
        setReturns(res.returns);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load order.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user && orderNumber) {
      loadOrder();
    } else if (!user) {
      setOrder(null);
      setReturns([]);
      setError(null);
      setLoading(false);
    }
  }, [user, orderNumber]);

  if (initialized && !user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <SeoHead title={`Order ${orderNumber || ''}`} />
        <div className="bg-white border border-slate-200 rounded-2xl p-8">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Sign in to View Order</h1>
          <p className="text-sm text-slate-600 mb-5">
            Order details are strictly restricted to the authenticated owner.
          </p>
          <button
            type="button"
            onClick={() =>
              dispatch(openAuthModal({ mode: 'login', returnTo: `/account/orders/${orderNumber}` }))
            }
            className="px-5 py-2.5 rounded-xl bg-[#16A34A] text-white text-sm font-semibold"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const handleCancelOrder = async () => {
    if (!order) return;
    setCancelling(true);
    try {
      const res = await apiRequest<{ order: OrderRecord }>(
        `/api/orders/my/${order.orderNumber}/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'Cancelled by customer from order details' }),
        }
      );
      setOrder(res.order);
      setCancelOpen(false);
      dispatch(pushToast({ variant: 'success', message: 'Order cancelled and stock released.' }));
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Failed to cancel order.',
        })
      );
    } finally {
      setCancelling(false);
    }
  };

  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    setSubmittingReturn(true);
    try {
      const res = await apiRequest<{
        returnRequest: ReturnRequestRecord;
        order: OrderRecord;
      }>(`/api/orders/my/${order.orderNumber}/returns`, {
        method: 'POST',
        body: JSON.stringify({
          reason: returnReason,
          description: returnDescription,
        }),
      });
      setOrder(res.order);
      setReturns((prev) => [res.returnRequest, ...prev]);
      setReturnOpen(false);
      setReturnDescription('');
      dispatch(pushToast({ variant: 'success', message: 'Return request submitted.' }));
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Unable to submit return request.',
        })
      );
    } finally {
      setSubmittingReturn(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-14 text-center">
        <SeoHead title="Order Not Found" />
        <div className="bg-white border border-slate-200 rounded-2xl p-8">
          <p className="text-base font-bold text-slate-900 mb-2">{error || 'Order not found'}</p>
          <Link
            to="/account/orders"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline"
          >
            <ArrowLeft className="w-4 h-4" /> Back to My Orders
          </Link>
        </div>
      </div>
    );
  }

  const returnEligible =
    returns.length === 0 && canCustomerRequestReturn(order.orderStatus, order.deliveredAt);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <SeoHead title={`Order ${order.orderNumber}`} />

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to="/account/orders"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-emerald-700"
        >
          <ArrowLeft className="w-4 h-4" /> Back to My Orders
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
          >
            <Printer className="w-4 h-4" /> Print Invoice
          </button>

          {canCustomerCancelOrder(order.orderStatus) && (
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-xs font-semibold text-red-700"
            >
              <XCircle className="w-4 h-4" /> Cancel Order
            </button>
          )}

          {returnEligible && (
            <button
              type="button"
              onClick={() => setReturnOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#16A34A] hover:bg-emerald-700 text-xs font-semibold text-white"
            >
              <RotateCcw className="w-4 h-4" /> Request 7-Day Return
            </button>
          )}
        </div>
      </div>

      {/* Order Header & Invoice Summary */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
              NOVARA COMMERCE ORDER INVOICE
            </p>
            <h1 className="text-2xl font-extrabold font-mono text-slate-900 mt-1">
              {order.orderNumber}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Placed on {new Date(order.createdAt).toLocaleString()}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold uppercase">
              Status: {order.orderStatus.replace(/_/g, ' ')}
            </span>
            <span className="px-3 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-bold uppercase">
              Payment: {order.paymentStatus} ({order.paymentMethod})
            </span>
            <span className="px-3 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-bold uppercase">
              Fulfillment: {order.fulfillmentStatus}
            </span>
          </div>
        </div>

        {/* Shipping & Tracking */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-slate-50 rounded-xl p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase">
              <MapPin className="w-4 h-4 text-emerald-600" /> Delivery Address
            </div>
            <p className="text-sm font-bold text-slate-900">
              {order.shippingAddress.recipientName} · {order.shippingAddress.phone}
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              {order.shippingAddress.houseAddress}
              {order.shippingAddress.roadStreet ? `, ${order.shippingAddress.roadStreet}` : ''}
              <br />
              {order.shippingAddress.areaName}, {order.shippingAddress.upazilaName},{' '}
              {order.shippingAddress.districtName}, {order.shippingAddress.divisionName}
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase">
              <Truck className="w-4 h-4 text-emerald-600" /> Delivery & Courier
            </div>
            <p className="text-sm font-semibold text-slate-800 capitalize">
              Method: {order.deliveryMethod} Delivery
            </p>
            <p className="text-xs text-slate-600">
              Courier: {order.courierName || 'Pending dispatch assignment'}
            </p>
            <p className="text-xs font-mono text-slate-600">
              Tracking ID: {order.trackingNumber || 'Will appear once shipped'}
            </p>
          </div>
        </div>

        {/* Line Items */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Item</th>
                <th className="text-center px-4 py-3 font-semibold">Qty</th>
                <th className="text-right px-4 py-3 font-semibold">Unit Price</th>
                <th className="text-right px-4 py-3 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.items.map((item, idx) => (
                <tr key={`${item.sku}-${idx}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <SafeImage
                        src={item.imageUrl}
                        alt={item.productName}
                        className="w-11 h-11 rounded-lg object-cover border border-slate-100 shrink-0"
                      />
                      <div>
                        <p className="font-semibold text-slate-900">{item.productName}</p>
                        <p className="text-xs text-slate-500 font-mono">
                          SKU: {item.sku}
                          {item.variantTitle ? ` · ${item.variantTitle}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-mono">{item.quantity}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatBdt(item.unitPrice)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                    {formatBdt(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-mono">{formatBdt(order.subtotal)}</span>
            </div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount {order.couponCode ? `(${order.couponCode})` : ''}</span>
                <span className="font-mono">-{formatBdt(order.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>Shipping</span>
              <span className="font-mono">
                {order.shippingCharge === 0 ? 'Free' : formatBdt(order.shippingCharge)}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200 text-base font-extrabold text-slate-900">
              <span>Total</span>
              <span className="font-mono">{formatBdt(order.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Return Requests & Timeline */}
      {returns.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3">
          <h2 className="text-base font-bold text-slate-900">Return Requests</h2>
          {returns.map((ret) => (
            <div key={ret._id} className="border border-slate-200 rounded-xl p-4 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900">{ret.reason}</p>
                <span className="px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-800 text-xs font-bold uppercase">
                  {ret.status}
                </span>
              </div>
              <p className="text-xs text-slate-600">{ret.description}</p>
              {ret.adminNote && (
                <p className="text-xs text-slate-500 pt-1">Staff Note: {ret.adminNote}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-900">Order Timeline</h2>
        <div className="space-y-3">
          {order.statusHistory.map((step, idx) => (
            <div key={idx} className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-900 capitalize">
                  {step.status.replace(/_/g, ' ')}
                </p>
                {step.note && <p className="text-xs text-slate-600">{step.note}</p>}
                <p className="text-[11px] text-slate-400">
                  {new Date(step.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancelOrder}
        title="Cancel Order"
        message={`Are you sure you want to cancel ${order.orderNumber}? Reserved stock will be released.`}
        confirmLabel="Confirm Cancellation"
        danger
        loading={cancelling}
      />

      <Modal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title="Request 7-Day Easy Return"
        description={`Order ${order.orderNumber}`}
      >
        <form onSubmit={handleSubmitReturn} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Return Reason
            </label>
            <select
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
            >
              <option value="Damaged or defective item">Damaged or defective item</option>
              <option value="Wrong item or variant received">Wrong item or variant received</option>
              <option value="Size or fit mismatch">Size or fit mismatch</option>
              <option value="Missing accessories or parts">Missing accessories or parts</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Details (min 10 characters)
            </label>
            <textarea
              required
              minLength={10}
              rows={4}
              value={returnDescription}
              onChange={(e) => setReturnDescription(e.target.value)}
              placeholder="Describe the issue and packaging condition..."
              className="w-full p-3 rounded-lg border border-slate-200 text-sm focus:border-emerald-600 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setReturnOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={submittingReturn}
              className="px-5 py-2 rounded-lg bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-60"
            >
              {submittingReturn ? 'Submitting...' : 'Submit Return Request'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
