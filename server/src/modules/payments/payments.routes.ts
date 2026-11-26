import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.ts';
import { requireDatabase } from '../../database/connection.ts';
import {
  requireAuth,
  requirePermission,
  type AuthenticatedRequest,
} from '../../middleware/auth.middleware.ts';
import { asyncHandler } from '../../middleware/error.middleware.ts';
import { recordAuditLog } from '../../services/audit.service.ts';
import { sendTransactionalEmail } from '../../services/email.service.ts';
import {
  getPaymentGatewayStatus,
  verifySslCommerzCallback,
  verifySslCommerzIpnSignature,
} from '../../services/payment.service.ts';
import { releaseReservedInventory } from '../inventory/inventory.routes.ts';
import {
  AdminNotificationModel,
  OrderModel,
  PaymentTransactionModel,
  RefundRecordModel,
} from '../orders/order.model.ts';

const router = Router();
router.use(requireDatabase);

router.get('/status', (_req, res) => {
  res.json(getPaymentGatewayStatus());
});

// Idempotent SSLCommerz server-verified IPN & callback handlers
async function handleGatewaySuccess(tranId: string, valId: string) {
  const tx = await PaymentTransactionModel.findOne({ transactionRef: tranId });
  if (!tx) return { found: false, alreadyProcessed: false };

  // Idempotency guard: if already verified, do not double-process
  if (tx.status === 'verified') {
    return { found: true, alreadyProcessed: true, orderNumber: tx.orderNumber };
  }

  const verification = await verifySslCommerzCallback({
    valId,
    tranId,
    expectedAmount: tx.amount,
  });

  if (!verification.verified) {
    tx.status = 'failed';
    tx.rawPayloadSummary = { reason: verification.reason };
    await tx.save();
    return { found: true, verified: false, orderNumber: tx.orderNumber };
  }

  tx.status = 'verified';
  tx.providerValId = verification.providerValId;
  tx.channel = verification.channel;
  tx.rawPayloadSummary = verification.rawSummary;
  tx.verifiedAt = new Date();
  await tx.save();

  const order = await OrderModel.findById(tx.orderId);
  if (order && order.paymentStatus !== 'paid') {
    order.paymentStatus = 'paid';
    if (order.orderStatus === 'pending' || order.orderStatus === 'payment_failed') {
      order.orderStatus = 'confirmed';
    }
    order.statusHistory.push({
      status: order.orderStatus,
      paymentStatus: 'paid',
      note: `Payment verified via ${verification.channel || 'SSLCommerz'} (${tranId})`,
      createdAt: new Date(),
    });
    await order.save();

    await AdminNotificationModel.create({
      type: 'payment_verified',
      title: `Payment Verified · ${order.orderNumber}`,
      message: `৳${order.totalAmount.toLocaleString()} verified via ${verification.channel || 'SSLCommerz'}.`,
      orderNumber: order.orderNumber,
      orderId: order._id,
    });

    void sendTransactionalEmail({
      userId: String(order.userId),
      email: order.customerEmail,
      type: 'payment_status',
      subject: `Payment confirmed for NOVARA Order ${order.orderNumber}`,
      html: `<p>Your payment of <strong>৳${order.totalAmount.toLocaleString()}</strong> for order <strong>${order.orderNumber}</strong> is verified.</p>`,
    });
  }

  return { found: true, verified: true, orderNumber: tx.orderNumber };
}

router.post(
  '/sslcommerz/ipn',
  asyncHandler(async (req, res) => {
    const tranId = String(req.body?.tran_id || '');
    const valId = String(req.body?.val_id || '');
    const status = String(req.body?.status || '');

    if (!tranId) {
      res.status(400).json({ error: 'Missing tran_id' });
      return;
    }

    if (status === 'VALID' || status === 'VALIDATED') {
      const result = await handleGatewaySuccess(tranId, valId);
      res.json({ ok: true, ...result });
      return;
    }

    const storeId = typeof req.body?.store_id === 'string' ? req.body.store_id.trim() : '';
    const webhookHeader =
      typeof req.headers['x-webhook-secret'] === 'string' ? req.headers['x-webhook-secret'] : '';
    const webhookSecretMatches =
      Boolean(env.payment.webhookSecret) && webhookHeader === env.payment.webhookSecret;
    const signatureValid =
      env.payment.isGatewayConfigured &&
      storeId === env.payment.storeId &&
      verifySslCommerzIpnSignature((req.body || {}) as Record<string, unknown>, env.payment.storePassword);

    if (!signatureValid && !webhookSecretMatches) {
      res.status(403).json({
        error: 'Invalid payment IPN signature',
        code: 'IPN_VERIFICATION_FAILED',
      });
      return;
    }

    const tx = await PaymentTransactionModel.findOne({ transactionRef: tranId });
    if (tx && tx.status !== 'verified' && tx.status !== 'failed' && tx.status !== 'cancelled') {
      tx.status = status === 'CANCELLED' ? 'cancelled' : 'failed';
      await tx.save();

      const order = await OrderModel.findById(tx.orderId);
      if (order && order.paymentStatus !== 'paid' && order.orderStatus === 'pending') {
        order.paymentStatus = 'failed';
        order.orderStatus = 'payment_failed';
        order.statusHistory.push({
          status: 'payment_failed',
          paymentStatus: 'failed',
          note: `Payment ${tx.status} via gateway IPN (${tranId})`,
          createdAt: new Date(),
        });
        await order.save();

        await releaseReservedInventory({
          items: order.items.map(
            (i: { productId: unknown; variantId?: unknown; sku: string; quantity: number }) => ({
              productId: String(i.productId),
              variantId: i.variantId ? String(i.variantId) : null,
              sku: i.sku,
              quantity: i.quantity,
            })
          ),
          reason: `Payment ${tx.status} for ${order.orderNumber}`,
          orderId: order._id,
        });
      }
    }

    res.json({ ok: true });
  })
);

router.post(
  '/sslcommerz/success',
  asyncHandler(async (req, res) => {
    const tranId = String(req.body?.tran_id || '');
    const valId = String(req.body?.val_id || '');
    const result = await handleGatewaySuccess(tranId, valId);
    const dest = result.verified
      ? `${env.appUrl}/order-success/${result.orderNumber || ''}?payment=verified`
      : `${env.appUrl}/order-success/${result.orderNumber || ''}?payment=unverified`;
    res.redirect(302, dest);
  })
);

router.post(
  '/sslcommerz/fail',
  asyncHandler(async (req, res) => {
    const tranId = String(req.body?.tran_id || '');
    const tx = await PaymentTransactionModel.findOne({ transactionRef: tranId });
    res.redirect(302, `${env.appUrl}/order-success/${tx?.orderNumber || ''}?payment=failed`);
  })
);

router.post(
  '/sslcommerz/cancel',
  asyncHandler(async (req, res) => {
    const tranId = String(req.body?.tran_id || '');
    const tx = await PaymentTransactionModel.findOne({ transactionRef: tranId });
    res.redirect(302, `${env.appUrl}/order-success/${tx?.orderNumber || ''}?payment=cancelled`);
  })
);

// ADMIN: Transactions, Reconciliation & Refunds
router.get(
  '/admin/transactions',
  requireAuth,
  requirePermission('payments:read'),
  asyncHandler(async (_req, res) => {
    const [transactions, refunds] = await Promise.all([
      PaymentTransactionModel.find().sort({ createdAt: -1 }).limit(100),
      RefundRecordModel.find().sort({ createdAt: -1 }).limit(100).populate('processedBy', 'name email'),
    ]);
    res.json({ transactions, refunds, gatewayStatus: getPaymentGatewayStatus() });
  })
);

router.post(
  '/admin/refunds',
  requireAuth,
  requirePermission('payments:refund'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      orderId: z.string().min(1),
      amount: z.number().min(1),
      method: z.string().trim().min(2).max(60),
      reason: z.string().trim().min(3).max(300),
    });
    const parsed = schema.parse(req.body);

    const order = await OrderModel.findById(parsed.orderId);
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (order.paymentStatus !== 'paid' && order.paymentStatus !== 'refund_pending') {
      res.status(400).json({ error: 'Only paid orders can be refunded.' });
      return;
    }

    if (parsed.amount > order.totalAmount) {
      res.status(400).json({ error: 'Refund amount cannot exceed order total.' });
      return;
    }

    const existingRefunds = await RefundRecordModel.find({
      orderId: order._id,
      status: 'processed',
    });
    const alreadyRefunded = existingRefunds.reduce((sum, r) => sum + r.amount, 0);
    if (alreadyRefunded + parsed.amount > order.totalAmount) {
      res.status(409).json({
        error: `Cumulative refund (৳${alreadyRefunded + parsed.amount}) exceeds order total (৳${order.totalAmount}).`,
      });
      return;
    }

    const tx = await PaymentTransactionModel.findOne({ orderId: order._id });
    const refund = await RefundRecordModel.create({
      orderId: order._id,
      orderNumber: order.orderNumber,
      transactionId: tx?._id,
      amount: parsed.amount,
      method: parsed.method,
      reference: `RF-${order.orderNumber}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
      status: 'processed',
      reason: parsed.reason,
      processedBy: req.user!._id,
    });

    const isFullRefund = alreadyRefunded + parsed.amount >= order.totalAmount;
    order.paymentStatus = isFullRefund ? 'refunded' : 'refund_pending';
    order.orderStatus = isFullRefund ? 'refunded' : 'refund_pending';
    order.statusHistory.push({
      status: order.orderStatus,
      paymentStatus: order.paymentStatus,
      note: `${isFullRefund ? 'Full' : 'Partial'} refund processed (৳${parsed.amount}): ${parsed.reason}`,
      actorId: req.user!._id,
      actorRole: req.user!.role,
      createdAt: new Date(),
    });
    await order.save();

    await recordAuditLog({
      actorId: req.user!._id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'PROCESS_REFUND',
      resourceType: 'Order',
      resourceId: String(order._id),
      details: { orderNumber: order.orderNumber, amount: parsed.amount, reason: parsed.reason },
      ipAddress: req.ip,
    });

    void sendTransactionalEmail({
      userId: String(order.userId),
      email: order.customerEmail,
      type: 'refund_update',
      subject: `Refund Processed for Order ${order.orderNumber}`,
      html: `<p>A refund of <strong>৳${parsed.amount.toLocaleString()}</strong> has been processed for order <strong>${order.orderNumber}</strong>.</p>`,
    });

    res.status(201).json({ refund, order });
  })
);

export default router;
