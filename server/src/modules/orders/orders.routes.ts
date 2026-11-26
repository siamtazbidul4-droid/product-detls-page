import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  escapeHtml,
  escapeRegex,
  normalizePhoneDigits,
  shouldReleaseInventoryOnCancel,
} from '../../../../shared/security.ts';
import {
  isValidBangladeshPhone,
  normalizeBangladeshPhone,
  validateBangladeshHierarchy,
} from '../../../../shared/bangladeshLocations.ts';
import {
  canCustomerCancelOrder,
  canCustomerRequestReturn,
  canTransitionOrderStatus,
  deriveFulfillmentState,
  type OrderLifecycleStatus,
} from '../../../../shared/orderStateMachine.ts';
import {
  calculateCouponDiscount,
  calculateShippingCharge,
  calculateTaxAmount,
  DEFAULT_SHIPPING_CONFIG,
  resolveEffectiveUnitPrice,
} from '../../../../shared/pricing.ts';
import { requireDatabase } from '../../database/connection.ts';
import {
  requireAuth,
  requirePermission,
  type AuthenticatedRequest,
} from '../../middleware/auth.middleware.ts';
import { asyncHandler } from '../../middleware/error.middleware.ts';
import { recordAuditLog } from '../../services/audit.service.ts';
import { sendTransactionalEmail } from '../../services/email.service.ts';
import { initiateOrderPayment } from '../../services/payment.service.ts';
import { ProductModel } from '../catalog/catalog.model.ts';
import { CartModel } from '../cart/cart.model.ts';
import { StoreSettingsModel } from '../cms/cms.model.ts';
import {
  fulfillReservedInventory,
  releaseReservedInventory,
  reserveInventoryAtomically,
} from '../inventory/inventory.routes.ts';
import { InventoryMovementModel } from '../inventory/inventory.model.ts';
import { CouponModel, CouponRedemptionModel } from '../marketing/marketing.model.ts';
import {
  AdminNotificationModel,
  OrderModel,
  PaymentTransactionModel,
  ReturnRequestModel,
} from './order.model.ts';

const router = Router();
router.use(requireDatabase);

const checkoutSchema = z.object({
  idempotencyKey: z.string().min(6).max(80).optional(),
  contactInfo: z
    .object({
      email: z.string().trim().email().max(150),
      phone: z
        .string()
        .trim()
        .min(8)
        .max(25)
        .refine(isValidBangladeshPhone, 'Please enter a valid Bangladesh mobile number (01XXXXXXXXX).'),
    })
    .optional(),
  personalInfo: z
    .object({
      fullName: z.string().trim().min(2).max(100),
      gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).nullable().optional(),
    })
    .optional(),
  shippingAddress: z.object({
    recipientName: z.string().trim().min(2).max(100),
    phone: z
      .string()
      .trim()
      .min(8)
      .max(25)
      .refine(isValidBangladeshPhone, 'Please enter a valid Bangladesh mobile number (01XXXXXXXXX).'),
    divisionCode: z.string().min(1),
    districtCode: z.string().min(1),
    upazilaCode: z.string().min(1),
    areaCode: z.string().min(1),
    houseAddress: z.string().trim().min(3).max(200),
    roadStreet: z.string().trim().max(120).optional(),
    landmark: z.string().trim().max(120).optional(),
    deliveryInstructions: z.string().trim().max(240).optional(),
  }),
  deliveryMethod: z.enum(['standard', 'express']).default('standard'),
  paymentMethod: z.enum(['cod', 'sslcommerz']),
  paymentChannel: z.enum(['cod', 'card', 'bkash', 'nagad']).optional(),
  termsAccepted: z.literal(true, {
    message: 'You must agree to the Terms & Conditions and Privacy Policy to place your order.',
  }),
  couponCode: z.string().trim().toUpperCase().optional().nullable(),
  customerNote: z.string().trim().max(400).optional(),
});

const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many tracking requests. Please try again shortly.' },
});

// Public-safe order tracking by Order Number + Phone last 4 digits
router.get(
  '/track',
  trackLimiter,
  asyncHandler(async (req, res) => {
    const orderNumber = typeof req.query.orderNumber === 'string' ? req.query.orderNumber.trim() : '';
    const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : '';
    const phoneDigits = normalizePhoneDigits(phone);
    if (!orderNumber || phoneDigits.length < 4) {
      res.status(400).json({ error: 'Order number and phone number are required.' });
      return;
    }

    const order = await OrderModel.findOne({ orderNumber }).lean();
    const orderDigits = order ? normalizePhoneDigits(order.customerPhone) : '';
    if (!order || !orderDigits.endsWith(phoneDigits.slice(-4))) {
      res.status(404).json({ error: 'No matching order found.' });
      return;
    }

    res.json({
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      trackingNumber: order.trackingNumber || null,
      courierName: order.courierName || null,
      createdAt: order.createdAt,
      statusHistory: order.statusHistory,
    });
  })
);

router.use(requireAuth);

// Customer: Checkout preview / server-side pricing quote
router.post(
  '/quote',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      districtCode: z.string().optional(),
      divisionCode: z.string().optional(),
      upazilaCode: z.string().optional(),
      areaCode: z.string().optional(),
      deliveryMethod: z.enum(['standard', 'express']).default('standard'),
      couponCode: z.string().trim().toUpperCase().optional().nullable(),
    });
    const parsed = schema.parse(req.body);
    const cart = await CartModel.findOne({ userId: req.user!._id });
    if (!cart || cart.items.length === 0) {
      res.status(400).json({ error: 'Your cart is empty.' });
      return;
    }

    const products = await ProductModel.find({
      _id: { $in: cart.items.map((i: { productId: unknown }) => i.productId) },
      status: 'published',
    }).lean();
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    const lines = [];
    for (const item of cart.items) {
      const p = productMap.get(String(item.productId));
      if (!p) continue;
      const v = item.variantId
        ? p.variants.find((vr: { _id?: unknown }) => String(vr._id) === String(item.variantId))
        : null;
      const pricing = resolveEffectiveUnitPrice({
        basePrice: p.basePrice,
        salePrice: p.salePrice,
        flashSalePrice: p.flashSalePrice,
        flashSaleStart: p.flashSaleStart,
        flashSaleEnd: p.flashSaleEnd,
        variantPrice: v?.price ?? null,
      });
      lines.push({
        productId: String(p._id),
        categoryId: String(p.categoryId),
        unitPrice: pricing.unitPrice,
        quantity: item.quantity,
      });
    }

    const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    let discountAmount = 0;
    const code = (parsed.couponCode || cart.appliedCouponCode) || null;
    if (code) {
      const coupon = await CouponModel.findOne({ code });
      if (coupon) {
        const customerUsedCount = await CouponRedemptionModel.countDocuments({
          couponId: coupon._id,
          userId: req.user!._id,
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
          lines
        );
        if (check.valid) discountAmount = check.discountAmount;
      }
    }

    let zone: 'dhaka_metro' | 'dhaka_suburb' | 'outside_dhaka' = 'dhaka_metro';
    if (parsed.divisionCode && parsed.districtCode && parsed.upazilaCode && parsed.areaCode) {
      const hierarchy = validateBangladeshHierarchy({
        divisionCode: parsed.divisionCode,
        districtCode: parsed.districtCode,
        upazilaCode: parsed.upazilaCode,
        areaCode: parsed.areaCode,
      });
      if (hierarchy.valid && hierarchy.zone) zone = hierarchy.zone;
    }

    const settings = await StoreSettingsModel.findOne({ key: 'primary' }).lean();
    const taxableBase = Math.max(0, subtotal - discountAmount);
    const shippingCharge = calculateShippingCharge(
      taxableBase,
      zone,
      parsed.deliveryMethod,
      settings?.shipping || DEFAULT_SHIPPING_CONFIG
    );
    const taxRate = settings?.taxRate ?? 0;
    const taxAmount = calculateTaxAmount(taxableBase, taxRate);

    res.json({
      subtotal,
      discountAmount,
      shippingCharge,
      taxRate,
      taxAmount,
      totalAmount: Math.max(0, taxableBase + shippingCharge + taxAmount),
    });
  })
);

// Customer: Place Order (Authenticated Only)
router.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = checkoutSchema.parse(req.body);

    if (parsed.idempotencyKey) {
      const duplicateOrder = await OrderModel.findOne({
        idempotencyKey: parsed.idempotencyKey,
        userId: req.user!._id,
      });
      if (duplicateOrder) {
        res.status(200).json({ order: duplicateOrder, deduplicated: true });
        return;
      }
    }

    const hierarchy = validateBangladeshHierarchy(parsed.shippingAddress);
    if (!hierarchy.valid || !hierarchy.zone) {
      res.status(400).json({
        error: 'Invalid delivery address',
        message: 'Please select a valid Bangladesh Division, District, Upazila, and Area.',
      });
      return;
    }

    const cart = await CartModel.findOne({ userId: req.user!._id });
    if (!cart || cart.items.length === 0) {
      res.status(400).json({ error: 'Your cart is empty.' });
      return;
    }

    const products = await ProductModel.find({
      _id: { $in: cart.items.map((i: { productId: unknown }) => i.productId) },
      status: 'published',
    });
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    const orderItems = [];
    const pricingLines = [];

    for (const item of cart.items) {
      const product = productMap.get(String(item.productId));
      if (!product) {
        res.status(400).json({ error: 'One or more products in your cart are no longer available.' });
        return;
      }
      if (parsed.paymentMethod === 'cod' && !product.codEligible) {
        res.status(400).json({
          error: `${product.name} is not eligible for Cash on Delivery.`,
        });
        return;
      }

      let variant = null;
      if (product.variants.length > 0) {
        variant = product.variants.find(
          (v: { _id?: unknown; isActive?: boolean }) =>
            String(v._id) === String(item.variantId) && v.isActive
        );
        if (!variant) {
          res.status(400).json({ error: `Selected variant for ${product.name} is unavailable.` });
          return;
        }
      }

      const pricing = resolveEffectiveUnitPrice({
        basePrice: product.basePrice,
        salePrice: product.salePrice,
        flashSalePrice: product.flashSalePrice,
        flashSaleStart: product.flashSaleStart,
        flashSaleEnd: product.flashSaleEnd,
        variantPrice: variant?.price ?? null,
      });

      const selectedOpts: Record<string, string> = {};
      if (variant?.options) {
        for (const [k, v] of Object.entries(variant.options as unknown as Record<string, string>)) {
          selectedOpts[k] = v;
        }
      }

      orderItems.push({
        productId: product._id,
        variantId: variant?._id || null,
        sku: variant ? variant.sku : product.sku,
        productName: product.name,
        variantTitle: variant?.title,
        selectedOptions: selectedOpts,
        imageUrl: variant?.image?.url || product.images[0]?.url || '',
        quantity: item.quantity,
        unitPrice: pricing.unitPrice,
        originalUnitPrice: pricing.originalPrice,
        lineTotal: pricing.unitPrice * item.quantity,
      });

      pricingLines.push({
        productId: String(product._id),
        categoryId: String(product.categoryId),
        unitPrice: pricing.unitPrice,
        quantity: item.quantity,
      });
    }

    const subtotal = orderItems.reduce((sum, i) => sum + i.lineTotal, 0);
    let discountAmount = 0;
    let appliedCoupon: InstanceType<typeof CouponModel> | null = null;
    const requestedCouponCode = (parsed.couponCode || cart.appliedCouponCode) || null;

    if (requestedCouponCode) {
      const coupon = await CouponModel.findOne({ code: requestedCouponCode });
      if (!coupon) {
        res.status(400).json({ error: 'Invalid coupon code.' });
        return;
      }
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
        pricingLines
      );
      if (!validation.valid) {
        res.status(400).json({ error: validation.reason || 'Coupon is not applicable.' });
        return;
      }

      // Atomic coupon usage increment guarding global usageLimit
      const couponUpdateFilter: Record<string, unknown> = { _id: coupon._id, isActive: true };
      if (coupon.usageLimit !== null && coupon.usageLimit !== undefined) {
        couponUpdateFilter.usedCount = { $lt: coupon.usageLimit };
      }
      const incrementedCoupon = await CouponModel.findOneAndUpdate(
        couponUpdateFilter,
        { $inc: { usedCount: 1 } },
        { new: true }
      );
      if (!incrementedCoupon) {
        res.status(409).json({ error: 'Coupon usage limit was just reached.' });
        return;
      }
      appliedCoupon = incrementedCoupon;
      discountAmount = validation.discountAmount;
    }

    const settings = await StoreSettingsModel.findOne({ key: 'primary' }).lean();
    const taxableBase = Math.max(0, subtotal - discountAmount);
    const shippingCharge = calculateShippingCharge(
      taxableBase,
      hierarchy.zone,
      parsed.deliveryMethod,
      settings?.shipping || DEFAULT_SHIPPING_CONFIG
    );
    const taxAmount = calculateTaxAmount(taxableBase, settings?.taxRate ?? 0);
    const totalAmount = Math.max(0, taxableBase + shippingCharge + taxAmount);

    // Reserve stock atomically before creating order
    const reserved = await reserveInventoryAtomically({
      items: orderItems.map((i) => ({
        productId: String(i.productId),
        variantId: i.variantId ? String(i.variantId) : null,
        quantity: i.quantity,
      })),
      actorId: req.user!._id,
    });

    const orderNumber = `NVR-${new Date().getFullYear().toString().slice(-2)}${String(
      new Date().getMonth() + 1
    ).padStart(2, '0')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const resolvedCustomerName = parsed.personalInfo?.fullName || parsed.shippingAddress.recipientName || req.user!.name;
    const resolvedCustomerEmail = parsed.contactInfo?.email || req.user!.email;
    const resolvedCustomerPhone = normalizeBangladeshPhone(
      parsed.contactInfo?.phone || parsed.shippingAddress.phone
    );
    const resolvedChannel =
      parsed.paymentMethod === 'cod'
        ? 'cod'
        : parsed.paymentChannel && parsed.paymentChannel !== 'cod'
        ? parsed.paymentChannel
        : 'card';

    let createdOrder;
    try {
      createdOrder = await OrderModel.create({
        orderNumber,
        idempotencyKey: parsed.idempotencyKey || undefined,
        userId: req.user!._id,
        customerName: resolvedCustomerName,
        customerEmail: resolvedCustomerEmail,
        customerPhone: resolvedCustomerPhone,
        customerGender: parsed.personalInfo?.gender || undefined,
        items: orderItems,
        shippingAddress: {
          ...parsed.shippingAddress,
          phone: normalizeBangladeshPhone(parsed.shippingAddress.phone),
          divisionName: hierarchy.divisionName!,
          districtName: hierarchy.districtName!,
          upazilaName: hierarchy.upazilaName!,
          areaName: hierarchy.areaName!,
          zone: hierarchy.zone,
        },
        deliveryMethod: parsed.deliveryMethod,
        paymentMethod: parsed.paymentMethod,
        paymentChannel: resolvedChannel,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        policyVersion: '2026-01',
        orderStatus: 'pending',
        paymentStatus: parsed.paymentMethod === 'cod' ? 'unpaid' : 'pending',
        fulfillmentStatus: 'unfulfilled',
        subtotal,
        discountAmount,
        couponCode: appliedCoupon?.code || null,
        shippingCharge,
        taxAmount,
        totalAmount,
        customerNote: parsed.customerNote,
        statusHistory: [
          {
            status: 'pending',
            paymentStatus: parsed.paymentMethod === 'cod' ? 'unpaid' : 'pending',
            fulfillmentStatus: 'unfulfilled',
            note: 'Order placed by customer; stock reserved.',
            actorId: req.user!._id,
            actorRole: req.user!.role,
          },
        ],
      });

      const paymentInit = await initiateOrderPayment(createdOrder);
      createdOrder.transactionRef = paymentInit.transactionRef;
      await createdOrder.save();

      await PaymentTransactionModel.create({
        orderId: createdOrder._id,
        orderNumber: createdOrder.orderNumber,
        userId: req.user!._id,
        provider: parsed.paymentMethod,
        transactionRef: paymentInit.transactionRef,
        amount: totalAmount,
        currency: 'BDT',
        status: 'initiated',
        channel:
          parsed.paymentMethod === 'cod'
            ? 'Cash on Delivery'
            : `SSLCommerz (${resolvedChannel.toUpperCase()})`,
      });

      if (appliedCoupon) {
        await CouponRedemptionModel.create({
          couponId: appliedCoupon._id,
          code: appliedCoupon.code,
          userId: req.user!._id,
          orderId: createdOrder._id,
          discountAmount,
        });
      }

      cart.items = [];
      cart.appliedCouponCode = null;
      await cart.save();

      await AdminNotificationModel.create({
        type: 'new_order',
        title: `New Order ${createdOrder.orderNumber}`,
        message: `${resolvedCustomerName} placed a ${resolvedChannel.toUpperCase()} order totaling ৳${totalAmount.toLocaleString()}.`,
        orderNumber: createdOrder.orderNumber,
        orderId: createdOrder._id,
      });

      void sendTransactionalEmail({
        userId: String(req.user!._id),
        email: resolvedCustomerEmail,
        type: 'order_confirmation',
        subject: `NOVARA COMMERCE Order Confirmation — ${createdOrder.orderNumber}`,
        html: `<p>Thank you, ${escapeHtml(resolvedCustomerName)}.</p><p>Your order <strong>${createdOrder.orderNumber}</strong> totaling <strong>৳${totalAmount.toLocaleString()}</strong> has been received.</p>`,
      });

      res.status(201).json({
        order: createdOrder,
        payment: paymentInit,
      });
    } catch (err) {
      // Compensate stock & coupon if order creation or payment initiation failed
      await releaseReservedInventory({
        items: reserved,
        reason: 'Order creation or payment initialization failed',
        actorId: req.user!._id,
      });
      if (appliedCoupon) {
        await CouponModel.findByIdAndUpdate(appliedCoupon._id, { $inc: { usedCount: -1 } });
      }
      if (createdOrder) {
        await OrderModel.findByIdAndDelete(createdOrder._id);
      }
      throw err;
    }
  })
);

// Customer: Order History (strictly owned by authenticated customer)
router.get(
  '/my',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(30, Math.max(1, Number(req.query.limit || 10)));

    const [orders, total] = await Promise.all([
      OrderModel.find({ userId: req.user!._id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      OrderModel.countDocuments({ userId: req.user!._id }),
    ]);

    res.json({ orders, total, page, totalPages: Math.ceil(total / limit) });
  })
);

router.get(
  '/my/:orderNumber',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const order = await OrderModel.findOne({
      orderNumber: req.params.orderNumber,
      userId: req.user!._id,
    });
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    const returns = await ReturnRequestModel.find({ orderId: order._id }).sort({ createdAt: -1 });
    const transactions = await PaymentTransactionModel.find({ orderId: order._id }).sort({ createdAt: -1 });
    res.json({ order, returns, transactions });
  })
);

router.post(
  '/my/:orderNumber/cancel',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const reason = z.string().trim().min(3).max(240).parse(req.body?.reason || 'Cancelled by customer');
    const order = await OrderModel.findOne({
      orderNumber: req.params.orderNumber,
      userId: req.user!._id,
    });
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (!canCustomerCancelOrder(order.orderStatus)) {
      res.status(400).json({
        error: `Orders in '${order.orderStatus}' status can no longer be cancelled directly.`,
      });
      return;
    }

    if (shouldReleaseInventoryOnCancel(order.orderStatus)) {
      await releaseReservedInventory({
        items: order.items.map(
          (i: { productId: unknown; variantId?: unknown; sku: string; quantity: number }) => ({
            productId: String(i.productId),
            variantId: i.variantId ? String(i.variantId) : null,
            sku: i.sku,
            quantity: i.quantity,
          })
        ),
        reason: `Customer cancelled order ${order.orderNumber}`,
        orderId: order._id,
        actorId: req.user!._id,
      });
    }

    order.orderStatus = 'cancelled';
    order.fulfillmentStatus = 'cancelled';
    order.cancelledAt = new Date();
    order.cancellationReason = reason;
    order.statusHistory.push({
      status: 'cancelled',
      fulfillmentStatus: 'cancelled',
      note: reason,
      actorId: req.user!._id,
      actorRole: req.user!.role,
      createdAt: new Date(),
    });
    await order.save();

    res.json({ order });
  })
);

router.post(
  '/my/:orderNumber/returns',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      reason: z.string().trim().min(3).max(120),
      description: z.string().trim().min(10).max(1000),
    });
    const parsed = schema.parse(req.body);

    const order = await OrderModel.findOne({
      orderNumber: req.params.orderNumber,
      userId: req.user!._id,
    });
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (!canCustomerRequestReturn(order.orderStatus, order.deliveredAt)) {
      res.status(400).json({
        error: 'This order is not eligible for return (7-day return window after delivery applies).',
      });
      return;
    }

    const existing = await ReturnRequestModel.findOne({
      orderId: order._id,
      status: { $in: ['requested', 'approved', 'received'] },
    });
    if (existing) {
      res.status(409).json({ error: 'A return request is already active for this order.' });
      return;
    }

    const returnRequest = await ReturnRequestModel.create({
      orderId: order._id,
      orderNumber: order.orderNumber,
      userId: req.user!._id,
      reason: parsed.reason,
      description: parsed.description,
      items: order.items.map((i: { sku: string; productName: string; quantity: number }) => ({
        sku: i.sku,
        productName: i.productName,
        quantity: i.quantity,
      })),
      status: 'requested',
    });

    order.orderStatus = 'return_requested';
    order.statusHistory.push({
      status: 'return_requested',
      note: `Return requested: ${parsed.reason}`,
      actorId: req.user!._id,
      actorRole: req.user!.role,
      createdAt: new Date(),
    });
    await order.save();

    await AdminNotificationModel.create({
      type: 'return_requested',
      title: `Return Requested · ${order.orderNumber}`,
      message: `${order.customerName} requested a return (${parsed.reason}).`,
      orderNumber: order.orderNumber,
      orderId: order._id,
    });

    res.status(201).json({ returnRequest, order });
  })
);

// ADMIN: Orders & Returns
router.get(
  '/admin/notifications',
  requirePermission('orders:read'),
  asyncHandler(async (_req, res) => {
    const [notifications, unreadCount] = await Promise.all([
      AdminNotificationModel.find().sort({ createdAt: -1 }).limit(20).lean(),
      AdminNotificationModel.countDocuments({ isRead: false }),
    ]);
    res.json({ notifications, unreadCount });
  })
);

router.patch(
  '/admin/notifications/:id/read',
  requirePermission('orders:read'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const updated = await AdminNotificationModel.findByIdAndUpdate(
      req.params.id,
      { isRead: true, readAt: new Date(), readBy: req.user!._id },
      { new: true }
    );
    if (!updated) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    res.json({ notification: updated });
  })
);

router.post(
  '/admin/notifications/read-all',
  requirePermission('orders:read'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await AdminNotificationModel.updateMany(
      { isRead: false },
      { isRead: true, readAt: new Date(), readBy: req.user!._id }
    );
    res.json({ ok: true });
  })
);

router.get(
  '/admin/list',
  requirePermission('orders:read'),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const paymentMethod = typeof req.query.paymentMethod === 'string' ? req.query.paymentMethod : '';
    const paymentStatus = typeof req.query.paymentStatus === 'string' ? req.query.paymentStatus : '';
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : '';
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : '';
    const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'newest';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const filter: Record<string, unknown> = {};
    if (status) filter.orderStatus = status;
    if (paymentMethod) {
      if (paymentMethod === 'card' || paymentMethod === 'bkash' || paymentMethod === 'nagad') {
        filter.paymentChannel = paymentMethod;
      } else {
        filter.paymentMethod = paymentMethod;
      }
    }
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (dateFrom || dateTo) {
      const createdAtFilter: Record<string, Date> = {};
      if (dateFrom) {
        const parsedFrom = new Date(dateFrom);
        if (!Number.isNaN(parsedFrom.getTime())) createdAtFilter.$gte = parsedFrom;
      }
      if (dateTo) {
        const parsedTo = new Date(dateTo);
        if (!Number.isNaN(parsedTo.getTime())) {
          parsedTo.setHours(23, 59, 59, 999);
          createdAtFilter.$lte = parsedTo;
        }
      }
      if (Object.keys(createdAtFilter).length > 0) {
        filter.createdAt = createdAtFilter;
      }
    }
    if (q) {
      const escapedQ = escapeRegex(q);
      filter.$or = [
        { orderNumber: { $regex: escapedQ, $options: 'i' } },
        { customerName: { $regex: escapedQ, $options: 'i' } },
        { customerEmail: { $regex: escapedQ, $options: 'i' } },
        { customerPhone: { $regex: escapedQ, $options: 'i' } },
        { transactionRef: { $regex: escapedQ, $options: 'i' } },
      ];
    }

    const sortMap: Record<string, Record<string, 1 | -1>> = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      highest_total: { totalAmount: -1, createdAt: -1 },
      lowest_total: { totalAmount: 1, createdAt: -1 },
    };
    const sortSpec = sortMap[sortBy] || { createdAt: -1 };

    const [orders, total] = await Promise.all([
      OrderModel.find(filter).sort(sortSpec).skip((page - 1) * limit).limit(limit),
      OrderModel.countDocuments(filter),
    ]);

    res.json({ orders, total, page, totalPages: Math.ceil(total / limit) });
  })
);

router.patch(
  '/admin/:id/transition',
  requirePermission('orders:transition'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      nextStatus: z.enum([
        'pending',
        'confirmed',
        'processing',
        'packed',
        'shipped',
        'delivered',
        'cancelled',
        'payment_failed',
        'return_requested',
        'returned',
        'refund_pending',
        'refunded',
      ]),
      note: z.string().trim().max(300).optional(),
      trackingNumber: z.string().trim().max(100).optional(),
      courierName: z.string().trim().max(100).optional(),
    });
    const parsed = schema.parse(req.body);

    const order = await OrderModel.findById(req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const nextStatus = parsed.nextStatus as OrderLifecycleStatus;
    if (!canTransitionOrderStatus(order.orderStatus, nextStatus)) {
      res.status(400).json({
        error: `Invalid transition from '${order.orderStatus}' to '${nextStatus}'.`,
      });
      return;
    }

    if (nextStatus === 'cancelled') {
      if (shouldReleaseInventoryOnCancel(order.orderStatus)) {
        await releaseReservedInventory({
          items: order.items.map(
            (i: { productId: unknown; variantId?: unknown; sku: string; quantity: number }) => ({
              productId: String(i.productId),
              variantId: i.variantId ? String(i.variantId) : null,
              sku: i.sku,
              quantity: i.quantity,
            })
          ),
          reason: parsed.note || `Admin cancelled order ${order.orderNumber}`,
          orderId: order._id,
          actorId: req.user!._id,
        });
      }
      order.cancelledAt = new Date();
      order.cancellationReason = parsed.note || 'Cancelled by staff';
    }

    if (nextStatus === 'shipped' && order.fulfillmentStatus !== 'shipped') {
      await fulfillReservedInventory({
        items: order.items.map(
          (i: { productId: unknown; variantId?: unknown; sku: string; quantity: number }) => ({
            productId: String(i.productId),
            variantId: i.variantId ? String(i.variantId) : null,
            sku: i.sku,
            quantity: i.quantity,
          })
        ),
        orderId: order._id,
        actorId: req.user!._id,
      });
    }

    if (nextStatus === 'delivered') {
      order.deliveredAt = new Date();
      if (order.paymentMethod === 'cod') {
        order.paymentStatus = 'paid';
      }
    }

    if (parsed.trackingNumber) order.trackingNumber = parsed.trackingNumber;
    if (parsed.courierName) order.courierName = parsed.courierName;

    order.orderStatus = nextStatus;
    order.fulfillmentStatus = deriveFulfillmentState(nextStatus);
    order.statusHistory.push({
      status: nextStatus,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      note: parsed.note || `Updated to ${nextStatus}`,
      actorId: req.user!._id,
      actorRole: req.user!.role,
      createdAt: new Date(),
    });
    await order.save();

    await recordAuditLog({
      actorId: req.user!._id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'ORDER_STATUS_TRANSITION',
      resourceType: 'Order',
      resourceId: String(order._id),
      details: { orderNumber: order.orderNumber, nextStatus, note: parsed.note },
      ipAddress: req.ip,
    });

    void sendTransactionalEmail({
      userId: String(order.userId),
      email: order.customerEmail,
      type: 'shipment_update',
      subject: `NOVARA Order ${order.orderNumber} is now ${nextStatus}`,
      html: `<p>Your order <strong>${order.orderNumber}</strong> status updated to <strong>${nextStatus}</strong>.</p>`,
    });

    res.json({ order });
  })
);

router.post(
  '/admin/:id/notes',
  requirePermission('orders:read'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const note = z.string().trim().min(2).max(500).parse(req.body?.note);
    const order = await OrderModel.findById(req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    order.staffNotes.push({
      note,
      actorName: req.user!.name,
      actorId: req.user!._id,
      createdAt: new Date(),
    });
    await order.save();
    res.json({ order });
  })
);

router.get(
  '/admin/returns',
  requirePermission('returns:manage'),
  asyncHandler(async (_req, res) => {
    const returns = await ReturnRequestModel.find()
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });
    res.json({ returns });
  })
);

router.patch(
  '/admin/returns/:returnId',
  requirePermission('returns:manage'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      status: z.enum(['approved', 'rejected', 'received', 'restocked']),
      inspectionResult: z.enum(['resalable', 'damaged', 'pending']).optional(),
      adminNote: z.string().trim().max(500).optional(),
    });
    const parsed = schema.parse(req.body);

    const ret = await ReturnRequestModel.findById(req.params.returnId);
    if (!ret) {
      res.status(404).json({ error: 'Return request not found' });
      return;
    }

    // Never restock unless physical item is received and verified resalable
    if (parsed.status === 'restocked') {
      if (parsed.inspectionResult !== 'resalable') {
        res.status(400).json({
          error: 'Items can only be restocked after inspection confirms they are resalable.',
        });
        return;
      }
      if (!ret.restocked) {
        const order = await OrderModel.findById(ret.orderId);
        if (order) {
          for (const item of order.items) {
            if (item.variantId) {
              await ProductModel.findOneAndUpdate(
                { _id: item.productId, 'variants._id': item.variantId },
                { $inc: { 'variants.$.stockOnHand': item.quantity } }
              );
            } else {
              await ProductModel.findByIdAndUpdate(item.productId, {
                $inc: { stockOnHand: item.quantity },
              });
            }
            const decremented = await ProductModel.findOneAndUpdate(
              { _id: item.productId, salesCount: { $gte: item.quantity } },
              { $inc: { salesCount: -item.quantity } }
            );
            if (!decremented) {
              await ProductModel.findOneAndUpdate(
                { _id: item.productId, salesCount: { $gt: 0 } },
                { $set: { salesCount: 0 } }
              );
            }
            await InventoryMovementModel.create({
              productId: item.productId,
              variantId: item.variantId || null,
              sku: item.sku,
              type: 'return_restock',
              quantityDelta: item.quantity,
              reservedDelta: 0,
              reason: `Resalable return restocked for ${order.orderNumber}`,
              orderId: order._id,
              actorId: req.user!._id,
            });
          }
          order.orderStatus = 'returned';
          order.fulfillmentStatus = 'returned';
          await order.save();
        }
        ret.restocked = true;
      }
    }

    ret.status = parsed.status;
    if (parsed.inspectionResult) ret.inspectionResult = parsed.inspectionResult;
    if (parsed.adminNote) ret.adminNote = parsed.adminNote;
    ret.reviewedBy = req.user!._id;
    await ret.save();

    await recordAuditLog({
      actorId: req.user!._id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'RETURN_MODERATION',
      resourceType: 'ReturnRequest',
      resourceId: String(ret._id),
      details: parsed,
      ipAddress: req.ip,
    });

    res.json({ returnRequest: ret });
  })
);

export default router;
