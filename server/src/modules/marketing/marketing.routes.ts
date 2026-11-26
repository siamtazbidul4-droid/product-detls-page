import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  filterEligibleCustomerCoupons,
  hasValidScheduleWindow,
} from '../../../../shared/wishlistHelpers.ts';
import { requireDatabase } from '../../database/connection.ts';
import {
  requireAuth,
  requirePermission,
  type AuthenticatedRequest,
} from '../../middleware/auth.middleware.ts';
import { asyncHandler } from '../../middleware/error.middleware.ts';
import { recordAuditLog } from '../../services/audit.service.ts';
import { CouponModel, CouponRedemptionModel } from './marketing.model.ts';

const router = Router();
router.use(requireDatabase, requireAuth);

const couponSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(40),
  description: z.string().trim().max(240).optional(),
  type: z.enum(['fixed', 'percentage']),
  value: z.number().min(1),
  maxDiscountCap: z.number().min(0).nullable().optional(),
  minOrderAmount: z.number().min(0).default(0),
  usageLimit: z.number().int().min(1).nullable().optional(),
  perCustomerLimit: z.number().int().min(1).nullable().optional(),
  eligibleCategoryIds: z.array(z.string()).default([]),
  eligibleProductIds: z.array(z.string()).default([]),
  startsAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().default(true),
});

router.get(
  '/my-coupons',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const now = new Date();
    const [coupons, allUserRedemptions, redemptions] = await Promise.all([
      CouponModel.find({
        isActive: true,
        $and: [
          { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
          { $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }] },
        ],
      })
        .select('code description type value maxDiscountCap minOrderAmount expiresAt perCustomerLimit usageLimit usedCount')
        .sort({ expiresAt: 1, createdAt: -1 })
        .lean(),
      CouponRedemptionModel.find({ userId: req.user!._id }).select('couponId').lean(),
      CouponRedemptionModel.find({ userId: req.user!._id })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate('orderId', 'orderNumber totalAmount createdAt')
        .lean(),
    ]);

    const redemptionCounts: Record<string, number> = {};
    for (const r of allUserRedemptions) {
      const key = String(r.couponId);
      redemptionCounts[key] = (redemptionCounts[key] || 0) + 1;
    }

    const eligibleCoupons = filterEligibleCustomerCoupons(coupons, redemptionCounts);

    res.json({ coupons: eligibleCoupons, redemptions });
  })
);

router.get(
  '/admin/coupons',
  requirePermission('coupons:write'),
  asyncHandler(async (_req, res) => {
    const coupons = await CouponModel.find().sort({ createdAt: -1 });
    const recentRedemptions = await CouponRedemptionModel.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('userId', 'name email');
    res.json({ coupons, recentRedemptions });
  })
);

router.post(
  '/admin/coupons',
  requirePermission('coupons:write'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = couponSchema.parse(req.body);
    if (parsed.type === 'percentage' && parsed.value > 95) {
      res.status(400).json({ error: 'Percentage coupon cannot exceed 95%.' });
      return;
    }
    if (!hasValidScheduleWindow(parsed.startsAt, parsed.expiresAt)) {
      res.status(400).json({ error: 'Coupon expiry date must be after start date.' });
      return;
    }

    const coupon = await CouponModel.create({
      ...parsed,
      startsAt: parsed.startsAt ? new Date(parsed.startsAt) : null,
      expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
    });

    await recordAuditLog({
      actorId: req.user!._id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'CREATE_COUPON',
      resourceType: 'Coupon',
      resourceId: String(coupon._id),
      details: { code: coupon.code, type: coupon.type, value: coupon.value },
      ipAddress: req.ip,
    });

    res.status(201).json({ coupon });
  })
);

router.patch(
  '/admin/coupons/:id',
  requirePermission('coupons:write'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400).json({ error: 'Invalid coupon ID.' });
      return;
    }
    const parsed = couponSchema.partial().parse(req.body);
    const existing = await CouponModel.findById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Coupon not found' });
      return;
    }

    const nextStartsAt =
      parsed.startsAt !== undefined ? (parsed.startsAt ? new Date(parsed.startsAt) : null) : existing.startsAt;
    const nextExpiresAt =
      parsed.expiresAt !== undefined
        ? parsed.expiresAt
          ? new Date(parsed.expiresAt)
          : null
        : existing.expiresAt;
    if (!hasValidScheduleWindow(nextStartsAt, nextExpiresAt)) {
      res.status(400).json({ error: 'Coupon expiry date must be after start date.' });
      return;
    }

    Object.assign(existing, {
      ...parsed,
      startsAt: nextStartsAt,
      expiresAt: nextExpiresAt,
    });
    await existing.save();

    await recordAuditLog({
      actorId: req.user!._id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'UPDATE_COUPON',
      resourceType: 'Coupon',
      resourceId: String(existing._id),
      details: parsed,
      ipAddress: req.ip,
    });

    res.json({ coupon: existing });
  })
);

export default router;
