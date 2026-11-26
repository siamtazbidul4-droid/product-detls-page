import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireDatabase } from '../../database/connection.ts';
import { sanitizeCsvCell } from '../../../../shared/security.ts';
import { seedDatabaseIfNeeded } from '../../database/seed.ts';
import {
  optionalAuth,
  requireAuth,
  requirePermission,
  type AuthenticatedRequest,
} from '../../middleware/auth.middleware.ts';
import { asyncHandler } from '../../middleware/error.middleware.ts';
import { recordAuditLog } from '../../services/audit.service.ts';
import { ProductModel } from '../catalog/catalog.model.ts';
import { CouponModel } from '../marketing/marketing.model.ts';
import { OrderModel, PaymentTransactionModel, ReturnRequestModel } from '../orders/order.model.ts';
import {
  AuditLogModel,
  NewsletterSubscriptionModel,
  SupportEnquiryModel,
} from './support.model.ts';

const router = Router();
router.use(requireDatabase);

const publicFormLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Public: Newsletter Subscribe & Unsubscribe
router.post(
  '/newsletter/subscribe',
  publicFormLimiter,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      email: z.string().trim().email().max(150),
      consent: z.boolean().refine((v) => v === true, 'Marketing consent is required.'),
    });
    const parsed = schema.parse(req.body);
    const email = parsed.email.toLowerCase();

    const existing = await NewsletterSubscriptionModel.findOne({ email });
    if (existing && existing.status === 'subscribed') {
      res.status(409).json({
        error: 'Already subscribed',
        message: 'This email address is already subscribed to our newsletter.',
      });
      return;
    }

    if (existing) {
      existing.status = 'subscribed';
      existing.consentRecordedAt = new Date();
      existing.unsubscribedAt = null;
      await existing.save();
    } else {
      await NewsletterSubscriptionModel.create({
        email,
        status: 'subscribed',
        consentRecordedAt: new Date(),
        unsubscribeToken: crypto.randomBytes(20).toString('hex'),
        source: 'homepage_newsletter',
      });
    }

    res.status(201).json({ ok: true, message: 'Subscribed to NOVARA COMMERCE updates.' });
  })
);

router.post(
  '/newsletter/unsubscribe',
  asyncHandler(async (req, res) => {
    const email = z.string().trim().email().parse(req.body?.email).toLowerCase();
    const sub = await NewsletterSubscriptionModel.findOne({ email });
    if (!sub) {
      res.status(404).json({ error: 'Subscription not found.' });
      return;
    }
    sub.status = 'unsubscribed';
    sub.unsubscribedAt = new Date();
    await sub.save();
    res.json({ ok: true, message: 'You have been unsubscribed.' });
  })
);

// Public: Support Enquiry Submission (with honeypot spam check)
router.post(
  '/enquiries',
  publicFormLimiter,
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (req.body?.website) {
      res.status(400).json({ error: 'Spam detected.' });
      return;
    }

    const schema = z.object({
      name: z.string().trim().min(2).max(100),
      email: z.string().trim().email().max(150),
      phone: z.string().trim().max(25).optional(),
      subject: z.string().trim().min(3).max(160),
      orderNumber: z.string().trim().max(40).optional(),
      message: z.string().trim().min(10).max(3000),
    });
    const parsed = schema.parse(req.body);

    const ticketNumber = `SUP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const enquiry = await SupportEnquiryModel.create({
      ticketNumber,
      userId: req.user?._id || null,
      ...parsed,
    });

    res.status(201).json({
      ticketNumber: enquiry.ticketNumber,
      message: `Support ticket ${enquiry.ticketNumber} created. Our team will respond shortly.`,
    });
  })
);

// ADMIN: Support Enquiries Management
router.get(
  '/admin/enquiries',
  requireAuth,
  requirePermission('support:manage'),
  asyncHandler(async (_req, res) => {
    const enquiries = await SupportEnquiryModel.find()
      .populate('assignedStaffId', 'name email')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ enquiries });
  })
);

router.patch(
  '/admin/enquiries/:id',
  requireAuth,
  requirePermission('support:manage'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
      internalNote: z.string().trim().min(2).max(500).optional(),
      assignToSelf: z.boolean().optional(),
    });
    const parsed = schema.parse(req.body);

    const enquiry = await SupportEnquiryModel.findById(req.params.id);
    if (!enquiry) {
      res.status(404).json({ error: 'Support enquiry not found' });
      return;
    }

    if (parsed.status) enquiry.status = parsed.status;
    if (parsed.assignToSelf) enquiry.assignedStaffId = req.user!._id;
    if (parsed.internalNote) {
      enquiry.internalNotes.push({
        note: parsed.internalNote,
        actorName: req.user!.name,
        actorId: req.user!._id,
        createdAt: new Date(),
      });
    }
    await enquiry.save();
    res.json({ enquiry });
  })
);

// ADMIN: Overview Dashboard KPIs & Reports
router.get(
  '/admin/dashboard',
  requireAuth,
  requirePermission('dashboard:view'),
  asyncHandler(async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days || 30)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [orders, products, pendingReviewsCount, openReturnsCount, recentAuditLogs] = await Promise.all([
      OrderModel.find({ createdAt: { $gte: since } }).lean(),
      ProductModel.find({ status: { $ne: 'archived' } })
        .select('name sku stockOnHand reservedStock lowStockThreshold variants basePrice salesCount')
        .lean(),
      // Avoid importing ReviewModel circularly by counting directly via model registry
      (await import('../marketing/marketing.model.ts')).ReviewModel.countDocuments({ status: 'pending' }),
      ReturnRequestModel.countDocuments({ status: { $in: ['requested', 'approved', 'received'] } }),
      AuditLogModel.find().sort({ createdAt: -1 }).limit(12).lean(),
    ]);

    const nonCancelledOrders = orders.filter(
      (o) => !['cancelled', 'payment_failed', 'refunded'].includes(o.orderStatus)
    );
    const grossSales = orders.reduce((s, o) => s + o.totalAmount, 0);
    const netSales = nonCancelledOrders.reduce((s, o) => s + o.totalAmount, 0);
    const orderCount = orders.length;
    const avgOrderValue = nonCancelledOrders.length > 0 ? Math.round(netSales / nonCancelledOrders.length) : 0;
    const pendingOrders = orders.filter((o) => o.orderStatus === 'pending').length;
    const cancelledOrRefundedCount = orders.filter((o) =>
      ['cancelled', 'refunded'].includes(o.orderStatus)
    ).length;

    let lowStockCount = 0;
    let outOfStockCount = 0;
    let inventoryValuation = 0;

    for (const p of products) {
      if (p.variants && p.variants.length > 0) {
        for (const v of p.variants) {
          const avail = Math.max(0, v.stockOnHand - v.reservedStock);
          if (avail === 0) outOfStockCount += 1;
          else if (avail <= v.lowStockThreshold) lowStockCount += 1;
          inventoryValuation += v.stockOnHand * (v.price ?? p.basePrice);
        }
      } else {
        const avail = Math.max(0, p.stockOnHand - p.reservedStock);
        if (avail === 0) outOfStockCount += 1;
        else if (avail <= p.lowStockThreshold) lowStockCount += 1;
        inventoryValuation += p.stockOnHand * p.basePrice;
      }
    }

    res.json({
      days,
      metrics: {
        grossSales,
        netSales,
        orderCount,
        avgOrderValue,
        pendingOrders,
        cancelledOrRefundedCount,
        lowStockCount,
        outOfStockCount,
        inventoryValuation,
        pendingReviewsCount,
        openReturnsCount,
      },
      recentAuditLogs,
    });
  })
);

router.get(
  '/admin/reports',
  requireAuth,
  requirePermission('reports:read'),
  asyncHandler(async (_req, res) => {
    const [ordersByStatus, paymentSummary, couponStats, topProducts] = await Promise.all([
      OrderModel.aggregate([
        { $group: { _id: '$orderStatus', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
      ]),
      PaymentTransactionModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } },
      ]),
      CouponModel.find().select('code type value usedCount usageLimit isActive').lean(),
      ProductModel.find({ status: 'published' })
        .sort({ salesCount: -1 })
        .limit(10)
        .select('name sku basePrice salesCount ratingAverage')
        .lean(),
    ]);

    res.json({ ordersByStatus, paymentSummary, couponStats, topProducts });
  })
);

router.get(
  '/admin/reports/orders.csv',
  requireAuth,
  requirePermission('reports:read'),
  asyncHandler(async (_req, res) => {
    const orders = await OrderModel.find().sort({ createdAt: -1 }).limit(1000).lean();
    const lines = [
      'orderNumber,date,customerName,phone,district,paymentMethod,paymentStatus,orderStatus,subtotal,discount,shipping,total',
    ];
    for (const o of orders) {
      lines.push(
        [
          sanitizeCsvCell(o.orderNumber),
          new Date(o.createdAt).toISOString(),
          sanitizeCsvCell(o.customerName),
          sanitizeCsvCell(o.customerPhone),
          sanitizeCsvCell(o.shippingAddress.districtName),
          o.paymentMethod,
          o.paymentStatus,
          o.orderStatus,
          o.subtotal,
          o.discountAmount,
          o.shippingCharge,
          o.totalAmount,
        ].join(',')
      );
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="novara-orders-report.csv"');
    res.send(lines.join('\n'));
  })
);

router.get(
  '/admin/audit-logs',
  requireAuth,
  requirePermission('audit:read'),
  asyncHandler(async (_req, res) => {
    const logs = await AuditLogModel.find().sort({ createdAt: -1 }).limit(150).lean();
    res.json({ logs });
  })
);

// Super Admin: Idempotent Sample Bangladesh Catalog Seeder (writes real records to MongoDB Atlas)
router.post(
  '/admin/seed-catalog',
  requireAuth,
  requirePermission('settings:write'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await seedDatabaseIfNeeded({ forceCatalog: true });
    await recordAuditLog({
      actorId: req.user!._id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'SEED_CATALOG',
      resourceType: 'System',
      details: result,
      ipAddress: req.ip,
    });
    res.json({ ok: true, ...result });
  })
);

export default router;
