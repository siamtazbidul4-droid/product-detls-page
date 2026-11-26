import { Router } from 'express';
import { z } from 'zod';
import { selectLatestApprovedReviews } from '../../../../shared/homepageHelpers.ts';
import { requireDatabase } from '../../database/connection.ts';
import {
  requireAuth,
  requirePermission,
  type AuthenticatedRequest,
} from '../../middleware/auth.middleware.ts';
import { asyncHandler } from '../../middleware/error.middleware.ts';
import { recordAuditLog } from '../../services/audit.service.ts';
import { ProductModel } from '../catalog/catalog.model.ts';
import { OrderModel } from '../orders/order.model.ts';
import { ReviewModel } from '../marketing/marketing.model.ts';

const router = Router();
router.use(requireDatabase);

async function recalculateProductRating(productId: string) {
  const approved = await ReviewModel.find({ productId, status: 'approved' }).select('rating').lean();
  const count = approved.length;
  const average = count > 0 ? Number((approved.reduce((s, r) => s + r.rating, 0) / count).toFixed(2)) : 0;
  await ProductModel.findByIdAndUpdate(productId, {
    ratingCount: count,
    ratingAverage: average,
  });
}

// Public: Product reviews with real 5-star to 1-star distribution
router.get(
  '/product/:productId',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(20, Math.max(1, Number(req.query.limit || 10)));
    const sort: Record<string, 1 | -1> =
      req.query.sort === 'highest'
        ? { rating: -1 }
        : req.query.sort === 'lowest'
        ? { rating: 1 }
        : { createdAt: -1 };

    const [reviews, total, allRatings] = await Promise.all([
      ReviewModel.find({ productId: req.params.productId, status: 'approved' })
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ReviewModel.countDocuments({ productId: req.params.productId, status: 'approved' }),
      ReviewModel.find({ productId: req.params.productId, status: 'approved' })
        .select('rating')
        .lean(),
    ]);

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const r of allRatings) {
      const star = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
      distribution[star] += 1;
    }

    const averageRating =
      total > 0 ? Number((allRatings.reduce((sum, r) => sum + r.rating, 0) / total).toFixed(2)) : 0;

    res.json({
      reviews,
      total,
      averageRating,
      distribution,
      page,
      totalPages: Math.ceil(total / limit),
    });
  })
);

// Public: Latest 4 approved/published reviews for homepage "Our Happy Clients"
router.get(
  '/featured',
  asyncHandler(async (_req, res) => {
    const rawReviews = await ReviewModel.find({
      status: 'approved',
    })
      .sort({ createdAt: -1 })
      .limit(4)
      .populate('productId', 'name slug')
      .populate('userId', 'name avatarUrl')
      .lean();
    const reviews = selectLatestApprovedReviews(rawReviews, 4);
    res.json({ reviews });
  })
);

// Customer: Submit review (verified against real delivered orders)
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      productId: z.string().min(1),
      rating: z.number().int().min(1).max(5),
      title: z.string().trim().max(120).optional(),
      comment: z.string().trim().min(10).max(1500),
    });
    const parsed = schema.parse(req.body);

    const product = await ProductModel.findById(parsed.productId);
    if (!product || product.status !== 'published') {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const existing = await ReviewModel.findOne({
      productId: parsed.productId,
      userId: req.user!._id,
    });
    if (existing) {
      res.status(409).json({ error: 'You have already submitted a review for this product.' });
      return;
    }

    // Verify purchase strictly from delivered order records
    const deliveredOrder = await OrderModel.findOne({
      userId: req.user!._id,
      orderStatus: 'delivered',
      'items.productId': product._id,
    });

    if (!deliveredOrder) {
      res.status(403).json({
        error: 'Verified purchase required',
        message: 'Only customers who have received a delivered order for this product can submit a review.',
      });
      return;
    }

    const review = await ReviewModel.create({
      productId: product._id,
      userId: req.user!._id,
      userName: req.user!.name,
      rating: parsed.rating,
      title: parsed.title,
      comment: parsed.comment,
      verifiedPurchase: true,
      orderId: deliveredOrder._id,
      status: 'pending',
    });

    res.status(201).json({
      review,
      message: 'Thank you! Your verified review has been submitted for moderation.',
    });
  })
);

router.post(
  '/:id/helpful',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const review = await ReviewModel.findOneAndUpdate(
      { _id: req.params.id, status: 'approved' },
      { $addToSet: { helpfulVoterIds: req.user!._id } },
      { new: true }
    );
    if (!review) {
      res.status(404).json({ error: 'Review not found' });
      return;
    }
    res.json({ helpfulCount: review.helpfulVoterIds.length });
  })
);

router.post(
  '/:id/report',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const reason = z.string().trim().min(3).max(240).parse(req.body?.reason);
    const review = await ReviewModel.findById(req.params.id);
    if (!review) {
      res.status(404).json({ error: 'Review not found' });
      return;
    }
    const alreadyReported = review.reports.some(
      (rep: { userId?: unknown }) => String(rep.userId) === String(req.user!._id)
    );
    if (!alreadyReported) {
      review.reports.push({
        userId: req.user!._id,
        reason,
        createdAt: new Date(),
      });
      await review.save();
    }
    res.json({ ok: true, message: 'Review reported to moderation team.' });
  })
);

router.get(
  '/my',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const reviews = await ReviewModel.find({ userId: req.user!._id })
      .populate('productId', 'name slug images')
      .sort({ createdAt: -1 });
    res.json({ reviews });
  })
);

// ADMIN: Review Moderation Queue
router.get(
  '/admin/list',
  requireAuth,
  requirePermission('reviews:moderate'),
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const filter: Record<string, unknown> = {};
    if (status === 'reported') {
      filter['reports.0'] = { $exists: true };
    } else if (status) {
      filter.status = status;
    }

    const reviews = await ReviewModel.find(filter)
      .populate('productId', 'name slug sku')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ reviews });
  })
);

router.patch(
  '/admin/:id/moderate',
  requireAuth,
  requirePermission('reviews:moderate'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      status: z.enum(['approved', 'rejected', 'pending']),
      moderationReason: z.string().trim().max(300).optional(),
    });
    const parsed = schema.parse(req.body);

    const review = await ReviewModel.findById(req.params.id);
    if (!review) {
      res.status(404).json({ error: 'Review not found' });
      return;
    }

    review.status = parsed.status;
    review.moderationReason = parsed.moderationReason;
    review.moderatedBy = req.user!._id;
    review.moderatedAt = new Date();
    await review.save();

    await recalculateProductRating(String(review.productId));

    await recordAuditLog({
      actorId: req.user!._id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'MODERATE_REVIEW',
      resourceType: 'Review',
      resourceId: String(review._id),
      details: parsed,
      ipAddress: req.ip,
    });

    res.json({ review });
  })
);

export default router;
