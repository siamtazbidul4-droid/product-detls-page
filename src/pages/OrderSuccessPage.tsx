import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  MapPin,
  Package,
  ShoppingBag,
  Truck,
  XCircle,
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../app/hooks.ts';
import { SafeImage } from '../components/ui/SafeImage.tsx';
import { SeoHead } from '../components/ui/SeoHead.tsx';
import { openAuthModal } from '../features/auth/authSlice.ts';
import { apiRequest, formatBdt } from '../lib/api.ts';
import type { OrderRecord } from '../types/domain.ts';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  vr: number;
  alpha: number;
}

function CelebrationConfetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const colors = ['#16A34A', '#22C55E', '#86EFAC', '#FACC15', '#FFFFFF', '#0D9488'];
    const particles: Particle[] = Array.from({ length: 75 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 140,
      vx: (Math.random() - 0.5) * 4.5,
      vy: 2.5 + Math.random() * 4.2,
      size: 6 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.16,
      alpha: 1,
    }));

    const startTime = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06;
        p.rotation += p.vr;
        if (elapsed > 2200) {
          p.alpha = Math.max(0, p.alpha - 0.025);
        }
        if (p.alpha > 0 && p.y < canvas.height + 40) {
          alive = true;
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.65);
          ctx.restore();
        }
      }

      if (alive && elapsed < 3600) {
        frameId = window.requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
    };
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-50"
    />
  );
}

export function OrderSuccessPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const { user, initialized } = useAppSelector((s) => s.auth);

  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const paymentParam = searchParams.get('payment');

  useEffect(() => {
    if (!initialized) return;
    if (!user || !orderNumber) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    apiRequest<{ order: OrderRecord }>(`/api/orders/my/${encodeURIComponent(orderNumber)}`)
      .then((res) => setOrder(res.order))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to verify order confirmation.');
      })
      .finally(() => setLoading(false));
  }, [initialized, user, orderNumber]);

  if (initialized && !user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <SeoHead title="Order Confirmation" noindex />
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-4">
          <Package className="w-11 h-11 text-[#16A34A] mx-auto" />
          <h1 className="text-xl font-extrabold text-slate-900">Sign In to View Order Confirmation</h1>
          <p className="text-sm text-slate-600">
            Order confirmation details are protected and visible only to the account owner.
          </p>
          <button
            type="button"
            onClick={() =>
              dispatch(
                openAuthModal({
                  mode: 'login',
                  returnTo: `/order-success/${orderNumber || ''}`,
                })
              )
            }
            className="px-6 py-2.5 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-bold"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-4">
        <div className="h-44 rounded-2xl bg-slate-100 animate-pulse" />
        <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <SeoHead title="Order Verification Failed" noindex />
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-4">
          <AlertTriangle className="w-11 h-11 text-amber-500 mx-auto" />
          <h1 className="text-xl font-extrabold text-slate-900">Order Not Found</h1>
          <p className="text-sm text-slate-600">
            {error || 'We could not verify this order number under your account.'}
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link
              to="/account/orders"
              className="px-5 py-2.5 rounded-xl bg-[#16A34A] text-white text-sm font-bold"
            >
              View My Orders
            </Link>
            <Link
              to="/shop"
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isFailedOrCancelled =
    paymentParam === 'failed' ||
    paymentParam === 'cancelled' ||
    order.orderStatus === 'payment_failed' ||
    order.orderStatus === 'cancelled' ||
    order.paymentStatus === 'failed';

  const isPendingOnline =
    !isFailedOrCancelled &&
    order.paymentMethod === 'sslcommerz' &&
    order.paymentStatus !== 'paid';

  const isConfirmedSuccess = !isFailedOrCancelled && !isPendingOnline;

  return (
    <div className="bg-[#F8FAFC] min-h-screen py-10 px-4">
      <SeoHead title={`Order ${order.orderNumber} – Confirmation`} noindex />
      <CelebrationConfetti active={isConfirmedSuccess} />

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Status Hero Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 text-center shadow-sm space-y-4">
          {isFailedOrCancelled ? (
            <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <XCircle className="w-9 h-9" />
            </div>
          ) : isPendingOnline ? (
            <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <Clock className="w-9 h-9" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-[#16A34A] flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-extrabold uppercase tracking-wider text-[#16A34A]">
              {isFailedOrCancelled
                ? 'Payment Incomplete'
                : isPendingOnline
                ? 'Awaiting Payment Verification'
                : 'Thank You For Your Order!'}
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              {isFailedOrCancelled
                ? `Payment Was Not Completed for ${order.orderNumber}`
                : isPendingOnline
                ? `Order ${order.orderNumber} Pending Payment`
                : `Order ${order.orderNumber} Confirmed`}
            </h1>
            <p className="text-sm text-slate-600 max-w-xl mx-auto">
              {isFailedOrCancelled
                ? 'Your online payment could not be verified or was cancelled. No charge was captured.'
                : isPendingOnline
                ? 'Your order was recorded and stock is held while awaiting gateway verification.'
                : order.paymentMethod === 'cod'
                ? 'Your Cash on Delivery order has been placed and reserved. Please keep the total ready upon delivery.'
                : 'Your payment has been verified and our fulfillment team is preparing your package.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs">
            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-800 font-mono font-bold">
              Order #{order.orderNumber}
            </span>
            <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 font-bold uppercase">
              Status: {order.orderStatus.replace(/_/g, ' ')}
            </span>
            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-800 font-bold uppercase">
              Payment: {order.paymentStatus} ({order.paymentChannel || order.paymentMethod})
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <Link
              to="/account/orders"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-bold transition-colors"
            >
              <Package className="w-4 h-4" />
              <span>View My Orders</span>
            </Link>
            <Link
              to={`/account/orders/${order.orderNumber}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold transition-colors"
            >
              <Truck className="w-4 h-4" />
              <span>Track Order</span>
            </Link>
            <Link
              to="/shop"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-semibold transition-colors"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Continue Shopping</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Receipt & Shipping Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-2">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#16A34A]" />
              <span>Delivery Details</span>
            </h2>
            <p className="text-sm font-bold text-slate-800 pt-1">{order.shippingAddress.recipientName}</p>
            <p className="text-xs text-slate-600">{order.shippingAddress.phone} · {order.customerEmail}</p>
            <p className="text-xs text-slate-600 leading-relaxed pt-1">
              {order.shippingAddress.houseAddress}
              {order.shippingAddress.roadStreet ? `, ${order.shippingAddress.roadStreet}` : ''}
              <br />
              {order.shippingAddress.areaName}, {order.shippingAddress.upazilaName},{' '}
              {order.shippingAddress.districtName}, {order.shippingAddress.divisionName}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-2.5 text-sm">
            <h2 className="text-sm font-extrabold text-slate-900">Payment Summary</h2>
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-mono">{formatBdt(order.subtotal)}</span>
            </div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount</span>
                <span className="font-mono">-{formatBdt(order.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>Shipping</span>
              <span className="font-mono">
                {order.shippingCharge === 0 ? 'Free' : formatBdt(order.shippingCharge)}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Tax</span>
              <span className="font-mono">{formatBdt(order.taxAmount)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-100 text-base font-extrabold text-slate-900">
              <span>Total</span>
              <span className="text-[#16A34A] font-mono">{formatBdt(order.totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* Ordered Items */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-extrabold text-slate-900">Items in Your Order</h2>
          <div className="divide-y divide-slate-100">
            {order.items.map((item, idx) => (
              <div key={`${item.sku}-${idx}`} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <SafeImage
                    src={item.imageUrl}
                    alt={item.productName}
                    className="w-12 h-12 rounded-xl object-cover border border-slate-100 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{item.productName}</p>
                    <p className="text-xs text-slate-500">
                      Qty: {item.quantity} {item.variantTitle ? `· ${item.variantTitle}` : ''} ·{' '}
                      {formatBdt(item.unitPrice)} each
                    </p>
                  </div>
                </div>
                <span className="font-mono text-sm font-bold text-slate-900 shrink-0">
                  {formatBdt(item.lineTotal)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
