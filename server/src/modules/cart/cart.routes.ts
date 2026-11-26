import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { calculateCouponDiscount, resolveEffectiveUnitPrice } from '../../../../shared/pricing.ts';
import { requireDatabase } from '../../database/connection.ts';
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import { asyncHandler } from '../../middleware/error.middleware.ts';
import { ProductModel } from '../catalog/catalog.model.ts';
import { CouponModel, CouponRedemptionModel } from '../marketing/marketing.model.ts';
import { CartModel } from './cart.model.ts';

export async function buildHydratedCart(userId: string) {
  let cart = await CartModel.findOne({ userId });
  if (!cart) {
    cart = await CartModel.create({ userId, items: [], appliedCouponCode: null });
  }

  const productIds = cart.items.map((i: { productId: unknown }) => i.productId);
  const products = await ProductModel.find({ _id: { $in: productIds } }).lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const validItems: typeof cart.items = [];
  const hydratedItems: Array<{
    productId: string;
    variantId: string | null;
    slug: string;
    sku: string;
    name: string;
    variantTitle: string | null;
    selectedOptions: Record<string, string>;
    imageUrl: string;
    quantity: number;
    unitPrice: number;
    originalPrice: number | null;
    availableStock: number;
    categoryId: string;
    codEligible: boolean;
    staleWarning?: string;
  }> = [];

  for (const item of cart.items) {
    const product = productMap.get(String(item.productId));
    if (!product || product.status !== 'published') {
      continue;
    }

    let variant = null;
    if (item.variantId) {
      variant = product.variants.find(
        (v: { _id?: unknown; isActive?: boolean }) =>
          String(v._id) === String(item.variantId) && v.isActive !== false
      );
      if (!variant) continue;
    } else if (product.variants.length > 0) {
      continue;
    }

    const availableStock = variant
      ? Math.max(0, variant.stockOnHand - variant.reservedStock)
      : Math.max(0, product.stockOnHand - product.reservedStock);

    const pricing = resolveEffectiveUnitPrice({
      basePrice: product.basePrice,
      salePrice: product.salePrice,
      flashSalePrice: product.flashSalePrice,
      flashSaleStart: product.flashSaleStart,
      flashSaleEnd: product.flashSaleEnd,
      variantPrice: variant?.price ?? null,
    });

    const clampedQty = availableStock > 0 ? Math.min(item.quantity, availableStock) : item.quantity;
    validItems.push({
      productId: item.productId,
      variantId: item.variantId || null,
      quantity: clampedQty,
    });

    const selectedOpts: Record<string, string> = {};
    if (variant?.options) {
      for (const [k, v] of Object.entries(variant.options as unknown as Record<string, string>)) {
        selectedOpts[k] = v;
      }
    }

    hydratedItems.push({
      productId: String(product._id),
      variantId: variant ? String(variant._id) : null,
      slug: product.slug,
      sku: variant ? variant.sku : product.sku,
      name: product.name,
      variantTitle: variant ? variant.title : null,
      selectedOptions: selectedOpts,
      imageUrl: variant?.image?.url || product.images[0]?.url || '',
      quantity: clampedQty,
      unitPrice: pricing.unitPrice,
      originalPrice: pricing.originalPrice,
      availableStock,
      categoryId: String(product.categoryId),
      codEligible: product.codEligible,
      staleWarning:
        availableStock === 0
          ? 'Currently out of stock'
          : clampedQty < item.quantity
          ? `Adjusted to available stock (${availableStock})`
          : undefined,
    });
  }

  if (validItems.length !== cart.items.length) {
    cart.items = validItems;
    await cart.save();
  }

  const subtotal = hydratedItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  let discountAmount = 0;
  let couponMessage: string | undefined;
  let appliedCouponCode = cart.appliedCouponCode || null;

  if (appliedCouponCode) {
    const coupon = await CouponModel.findOne({ code: appliedCouponCode });
    if (!coupon) {
      appliedCouponCode = null;
      cart.appliedCouponCode = null;
      await cart.save();
    } else {
      const customerUsedCount = await CouponRedemptionModel.countDocuments({
        couponId: coupon._id,
        userId,
      });
      const check = calculateCouponDiscount(
        {
          code: coupon.code,
          type: coupon.type,
          value: coupon.value,
          maxDiscountCap: coupon.maxDiscountCap,
          minOrderAmount: coupon.minOrderAmount,
          isActive: coupon.isActive,
          startsAt: coupon.startsAt,
          expiresAt: coupon.expiresAt,
          usageLimit: coupon.usageLimit,
          usedCount: coupon.usedCount,
          perCustomerLimit: coupon.perCustomerLimit,
          customerUsedCount,
          eligibleCategoryIds: coupon.eligibleCategoryIds.map(String),
          eligibleProductIds: coupon.eligibleProductIds.map(String),
        },
        hydratedItems.map((i) => ({
          productId: i.productId,
          categoryId: i.categoryId,
          unitPrice: i.unitPrice,
          quantity: i.quantity,
        }))
      );

      if (check.valid) {
        discountAmount = check.discountAmount;
      } else {
        couponMessage = check.reason;
      }
    }
  }

  return {
    items: hydratedItems,
    uniqueLineCount: hydratedItems.length,
    subtotal,
    discountAmount,
    appliedCouponCode,
    couponMessage,
  };
}

const router = Router();
router.use(requireDatabase, requireAuth);

router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const cart = await buildHydratedCart(String(req.user!._id));
    res.json(cart);
  })
);

router.post(
  '/items',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      productId: z.string().min(1),
      variantId: z.string().nullable().optional(),
      quantity: z.number().int().min(1).max(50).default(1),
    });
    const parsed = schema.parse(req.body);

    if (!mongoose.Types.ObjectId.isValid(parsed.productId)) {
      res.status(400).json({ error: 'Invalid product ID.' });
      return;
    }
    if (parsed.variantId && !mongoose.Types.ObjectId.isValid(parsed.variantId)) {
      res.status(400).json({ error: 'Invalid variant ID.' });
      return;
    }

    const product = await ProductModel.findOne({ _id: parsed.productId, status: 'published' });
    if (!product) {
      res.status(404).json({ error: 'Product not found or unavailable.' });
      return;
    }

    let available = Math.max(0, product.stockOnHand - product.reservedStock);
    const activeVariants = product.variants.filter(
      (v: { isActive?: boolean }) => v.isActive !== false
    );
    if (activeVariants.length > 0) {
      if (!parsed.variantId) {
        res.status(400).json({ error: 'Please select a product variant.' });
        return;
      }
      const variant = activeVariants.find(
        (v: { _id?: unknown }) => String(v._id) === parsed.variantId
      );
      if (!variant) {
        res.status(404).json({ error: 'Selected variant is unavailable.' });
        return;
      }
      available = Math.max(0, variant.stockOnHand - variant.reservedStock);
    } else if (product.variants.length > 0) {
      available = 0;
    }

    if (available < 1) {
      res.status(409).json({ error: 'This item is currently out of stock.' });
      return;
    }

    let cart = await CartModel.findOne({ userId: req.user!._id });
    if (!cart) {
      cart = await CartModel.create({ userId: req.user!._id, items: [] });
    }

    const existing = cart.items.find(
      (i: { productId: unknown; variantId?: unknown }) =>
        String(i.productId) === parsed.productId &&
        String(i.variantId || '') === String(parsed.variantId || '')
    );

    if (existing) {
      existing.quantity = Math.min(available, existing.quantity + parsed.quantity);
    } else {
      cart.items.push({
        productId: product._id,
        variantId: parsed.variantId ? (parsed.variantId as never) : null,
        quantity: Math.min(available, parsed.quantity),
      });
    }

    await cart.save();
    const hydrated = await buildHydratedCart(String(req.user!._id));
    res.json(hydrated);
  })
);

router.patch(
  '/items',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      productId: z.string().min(1),
      variantId: z.string().nullable().optional(),
      quantity: z.number().int().min(0).max(50),
    });
    const parsed = schema.parse(req.body);

    const cart = await CartModel.findOne({ userId: req.user!._id });
    if (!cart) {
      res.status(404).json({ error: 'Cart not found' });
      return;
    }

    if (parsed.quantity === 0) {
      cart.items = cart.items.filter(
        (i: { productId: unknown; variantId?: unknown }) =>
          !(
            String(i.productId) === parsed.productId &&
            String(i.variantId || '') === String(parsed.variantId || '')
          )
      );
    } else {
      const target = cart.items.find(
        (i: { productId: unknown; variantId?: unknown }) =>
          String(i.productId) === parsed.productId &&
          String(i.variantId || '') === String(parsed.variantId || '')
      );
      if (target) {
        const product = await ProductModel.findOne({ _id: parsed.productId, status: 'published' });
        if (!product) {
          res.status(404).json({ error: 'Product is no longer available.' });
          return;
        }
        const variant = parsed.variantId
          ? product.variants.find(
              (v: { _id?: unknown; isActive?: boolean }) =>
                String(v._id) === parsed.variantId && v.isActive !== false
            )
          : null;
        if (parsed.variantId && !variant) {
          res.status(404).json({ error: 'Selected variant is unavailable.' });
          return;
        }
        const available = variant
          ? Math.max(0, variant.stockOnHand - variant.reservedStock)
          : product.variants.length > 0
          ? 0
          : Math.max(0, product.stockOnHand - product.reservedStock);

        if (available < parsed.quantity) {
          res.status(409).json({
            error: `Only ${available} unit(s) available in stock.`,
          });
          return;
        }
        target.quantity = parsed.quantity;
      }
    }

    await cart.save();
    const hydrated = await buildHydratedCart(String(req.user!._id));
    res.json(hydrated);
  })
);

router.post(
  '/merge',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      items: z
        .array(
          z.object({
            productId: z.string().min(1),
            variantId: z.string().nullable().optional(),
            quantity: z.number().int().min(1).max(50),
          })
        )
        .max(50),
    });
    const parsed = schema.parse(req.body);

    let cart = await CartModel.findOne({ userId: req.user!._id });
    if (!cart) {
      cart = await CartModel.create({ userId: req.user!._id, items: [] });
    }

    for (const guestItem of parsed.items) {
      if (!mongoose.Types.ObjectId.isValid(guestItem.productId)) continue;
      const product = await ProductModel.findOne({ _id: guestItem.productId, status: 'published' });
      if (!product) continue;

      const activeVariants = product.variants.filter(
        (v: { isActive?: boolean }) => v.isActive !== false
      );
      const variant = guestItem.variantId
        ? activeVariants.find((v: { _id?: unknown }) => String(v._id) === guestItem.variantId)
        : null;
      if (activeVariants.length > 0 && !variant) continue;
      if (product.variants.length > 0 && activeVariants.length === 0) continue;

      const available = variant
        ? Math.max(0, variant.stockOnHand - variant.reservedStock)
        : Math.max(0, product.stockOnHand - product.reservedStock);
      if (available < 1) continue;

      const existing = cart.items.find(
        (i: { productId: unknown; variantId?: unknown }) =>
          String(i.productId) === guestItem.productId &&
          String(i.variantId || '') === String(guestItem.variantId || '')
      );

      if (existing) {
        existing.quantity = Math.min(available, existing.quantity + guestItem.quantity);
      } else {
        cart.items.push({
          productId: product._id,
          variantId: guestItem.variantId ? (guestItem.variantId as never) : null,
          quantity: Math.min(available, guestItem.quantity),
        });
      }
    }

    await cart.save();
    const hydrated = await buildHydratedCart(String(req.user!._id));
    res.json(hydrated);
  })
);

router.post(
  '/coupon',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const code = z.string().trim().toUpperCase().min(2).max(40).parse(req.body?.code);
    const coupon = await CouponModel.findOne({ code });
    if (!coupon) {
      res.status(404).json({ error: 'Invalid coupon code.' });
      return;
    }

    const cartBefore = await buildHydratedCart(String(req.user!._id));
    const customerUsedCount = await CouponRedemptionModel.countDocuments({
      couponId: coupon._id,
      userId: req.user!._id,
    });

    const validation = calculateCouponDiscount(
      {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        maxDiscountCap: coupon.maxDiscountCap,
        minOrderAmount: coupon.minOrderAmount,
        isActive: coupon.isActive,
        startsAt: coupon.startsAt,
        expiresAt: coupon.expiresAt,
        usageLimit: coupon.usageLimit,
        usedCount: coupon.usedCount,
        perCustomerLimit: coupon.perCustomerLimit,
        customerUsedCount,
        eligibleCategoryIds: coupon.eligibleCategoryIds.map(String),
        eligibleProductIds: coupon.eligibleProductIds.map(String),
      },
      cartBefore.items.map((i) => ({
        productId: i.productId,
        categoryId: i.categoryId,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
      }))
    );

    if (!validation.valid) {
      res.status(400).json({ error: validation.reason || 'Coupon cannot be applied.' });
      return;
    }

    await CartModel.findOneAndUpdate(
      { userId: req.user!._id },
      { appliedCouponCode: coupon.code },
      { upsert: true }
    );

    const hydrated = await buildHydratedCart(String(req.user!._id));
    res.json(hydrated);
  })
);

router.delete(
  '/coupon',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await CartModel.findOneAndUpdate({ userId: req.user!._id }, { appliedCouponCode: null });
    const hydrated = await buildHydratedCart(String(req.user!._id));
    res.json(hydrated);
  })
);

export default router;
