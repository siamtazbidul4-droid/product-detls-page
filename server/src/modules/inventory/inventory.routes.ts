import { Router } from 'express';
import type mongoose from 'mongoose';
import { z } from 'zod';
import { requireDatabase } from '../../database/connection.ts';
import {
  requireAuth,
  requirePermission,
  type AuthenticatedRequest,
} from '../../middleware/auth.middleware.ts';
import { asyncHandler } from '../../middleware/error.middleware.ts';
import { recordAuditLog } from '../../services/audit.service.ts';
import { escapeHtml } from '../../../../shared/security.ts';
import { sendTransactionalEmail } from '../../services/email.service.ts';
import { ProductModel } from '../catalog/catalog.model.ts';
import { InventoryMovementModel } from './inventory.model.ts';

export async function reserveInventoryAtomically(params: {
  items: Array<{ productId: string; variantId?: string | null; quantity: number }>;
  orderId?: mongoose.Types.ObjectId;
  actorId?: mongoose.Types.ObjectId;
  session?: mongoose.ClientSession | null;
}): Promise<Array<{ productId: string; variantId?: string | null; sku: string; quantity: number }>> {
  const reserved: Array<{ productId: string; variantId?: string | null; sku: string; quantity: number }> = [];

  try {
    for (const item of params.items) {
      if (item.variantId) {
        const candidate = await ProductModel.findOne(
          { _id: item.productId, status: 'published' },
          null,
          { session: params.session || undefined }
        );
        const variant = candidate?.variants.find(
          (v: { _id?: unknown; isActive?: boolean }) =>
            String(v._id) === item.variantId && v.isActive
        );
        if (!candidate || !variant || variant.stockOnHand - variant.reservedStock < item.quantity) {
          throw Object.assign(
            new Error(
              `Insufficient available stock for ${candidate?.name || 'product'} (${variant?.title || 'variant'}).`
            ),
            { statusCode: 409, code: 'OUT_OF_STOCK' }
          );
        }

        const targetProduct = await ProductModel.findOneAndUpdate(
          {
            _id: item.productId,
            status: 'published',
            variants: {
              $elemMatch: {
                _id: item.variantId,
                isActive: true,
                stockOnHand: { $gte: variant.reservedStock + item.quantity },
                reservedStock: variant.reservedStock,
              },
            },
          },
          { $inc: { 'variants.$.reservedStock': item.quantity } },
          { new: true, session: params.session || undefined }
        );
        if (!targetProduct) {
          throw Object.assign(
            new Error(`Stock changed concurrently for ${candidate.name}. Please retry checkout.`),
            { statusCode: 409, code: 'CONCURRENT_STOCK_CONFLICT' }
          );
        }

        const variantObj = targetProduct.variants.find(
          (v: { _id?: unknown }) => String(v._id) === item.variantId
        )!;
        reserved.push({
          productId: item.productId,
          variantId: item.variantId,
          sku: variantObj.sku,
          quantity: item.quantity,
        });

        await InventoryMovementModel.create(
          [
            {
              productId: targetProduct._id,
              variantId: variantObj._id,
              sku: variantObj.sku,
              type: 'reserve',
              quantityDelta: 0,
              reservedDelta: item.quantity,
              reason: 'Order stock reservation',
              orderId: params.orderId || null,
              actorId: params.actorId || null,
            },
          ],
          { session: params.session || undefined }
        );
      } else {
        const updated = await ProductModel.findOneAndUpdate(
          {
            _id: item.productId,
            status: 'published',
            $expr: { $gte: [{ $subtract: ['$stockOnHand', '$reservedStock'] }, item.quantity] },
          },
          { $inc: { reservedStock: item.quantity } },
          { new: true, session: params.session || undefined }
        );

        if (!updated) {
          throw Object.assign(new Error('Insufficient stock for one or more items in your cart.'), {
            statusCode: 409,
            code: 'OUT_OF_STOCK',
          });
        }

        reserved.push({
          productId: item.productId,
          variantId: null,
          sku: updated.sku,
          quantity: item.quantity,
        });

        await InventoryMovementModel.create(
          [
            {
              productId: updated._id,
              variantId: null,
              sku: updated.sku,
              type: 'reserve',
              quantityDelta: 0,
              reservedDelta: item.quantity,
              reason: 'Order stock reservation',
              orderId: params.orderId || null,
              actorId: params.actorId || null,
            },
          ],
          { session: params.session || undefined }
        );
      }
    }
    return reserved;
  } catch (err) {
    // Compensate any partial reservations if not running inside a MongoDB multi-doc transaction
    if (!params.session && reserved.length > 0) {
      await releaseReservedInventory({
        items: reserved,
        reason: 'Rollback after concurrent stock check failure',
      });
    }
    throw err;
  }
}

export async function releaseReservedInventory(params: {
  items: Array<{ productId: string; variantId?: string | null; sku?: string; quantity: number }>;
  reason: string;
  orderId?: mongoose.Types.ObjectId;
  actorId?: mongoose.Types.ObjectId;
}): Promise<void> {
  for (const item of params.items) {
    if (item.variantId) {
      const prod = await ProductModel.findOneAndUpdate(
        {
          _id: item.productId,
          variants: { $elemMatch: { _id: item.variantId, reservedStock: { $gte: item.quantity } } },
        },
        { $inc: { 'variants.$.reservedStock': -item.quantity } },
        { new: true }
      );
      if (prod) {
        await InventoryMovementModel.create({
          productId: prod._id,
          variantId: item.variantId,
          sku: item.sku || prod.sku,
          type: 'release',
          quantityDelta: 0,
          reservedDelta: -item.quantity,
          reason: params.reason,
          orderId: params.orderId || null,
          actorId: params.actorId || null,
        });
      }
    } else {
      const prod = await ProductModel.findOneAndUpdate(
        { _id: item.productId, reservedStock: { $gte: item.quantity } },
        { $inc: { reservedStock: -item.quantity } },
        { new: true }
      );
      if (prod) {
        await InventoryMovementModel.create({
          productId: prod._id,
          variantId: null,
          sku: item.sku || prod.sku,
          type: 'release',
          quantityDelta: 0,
          reservedDelta: -item.quantity,
          reason: params.reason,
          orderId: params.orderId || null,
          actorId: params.actorId || null,
        });
      }
    }
  }
}

export async function fulfillReservedInventory(params: {
  items: Array<{ productId: string; variantId?: string | null; sku?: string; quantity: number }>;
  orderId: mongoose.Types.ObjectId;
  actorId?: mongoose.Types.ObjectId;
}): Promise<void> {
  for (const item of params.items) {
    if (item.variantId) {
      const prod = await ProductModel.findOneAndUpdate(
        {
          _id: item.productId,
          variants: {
            $elemMatch: {
              _id: item.variantId,
              stockOnHand: { $gte: item.quantity },
              reservedStock: { $gte: item.quantity },
            },
          },
        },
        {
          $inc: {
            'variants.$.stockOnHand': -item.quantity,
            'variants.$.reservedStock': -item.quantity,
            salesCount: item.quantity,
          },
        },
        { new: true }
      );
      if (prod) {
        await InventoryMovementModel.create({
          productId: prod._id,
          variantId: item.variantId,
          sku: item.sku || prod.sku,
          type: 'fulfill',
          quantityDelta: -item.quantity,
          reservedDelta: -item.quantity,
          reason: 'Order shipped/fulfilled',
          orderId: params.orderId,
          actorId: params.actorId || null,
        });
      }
    } else {
      const prod = await ProductModel.findOneAndUpdate(
        {
          _id: item.productId,
          stockOnHand: { $gte: item.quantity },
          reservedStock: { $gte: item.quantity },
        },
        {
          $inc: {
            stockOnHand: -item.quantity,
            reservedStock: -item.quantity,
            salesCount: item.quantity,
          },
        },
        { new: true }
      );
      if (prod) {
        await InventoryMovementModel.create({
          productId: prod._id,
          variantId: null,
          sku: item.sku || prod.sku,
          type: 'fulfill',
          quantityDelta: -item.quantity,
          reservedDelta: -item.quantity,
          reason: 'Order shipped/fulfilled',
          orderId: params.orderId,
          actorId: params.actorId || null,
        });
      }
    }
  }
}

const router = Router();
router.use(requireDatabase, requireAuth);

router.get(
  '/',
  requirePermission('inventory:read'),
  asyncHandler(async (_req, res) => {
    const products = await ProductModel.find({ status: { $ne: 'archived' } })
      .select('name sku stockOnHand reservedStock lowStockThreshold variants images status basePrice')
      .sort({ updatedAt: -1 });

    const rows = products.flatMap((p) => {
      if (p.variants && p.variants.length > 0) {
        return p.variants.map(
          (v: {
            _id?: unknown;
            title: string;
            sku: string;
            stockOnHand: number;
            reservedStock: number;
            lowStockThreshold: number;
            price?: number | null;
            image?: { url?: string };
          }) => {
          const available = Math.max(0, v.stockOnHand - v.reservedStock);
          return {
            productId: String(p._id),
            variantId: String(v._id),
            name: `${p.name} — ${v.title}`,
            sku: v.sku,
            stockOnHand: v.stockOnHand,
            reservedStock: v.reservedStock,
            availableStock: available,
            lowStockThreshold: v.lowStockThreshold,
            isLowStock: available > 0 && available <= v.lowStockThreshold,
            isOutOfStock: available === 0,
            unitCostEstimate: v.price ?? p.basePrice,
            imageUrl: v.image?.url || p.images[0]?.url || '',
          };
        });
      }
      const available = Math.max(0, p.stockOnHand - p.reservedStock);
      return [
        {
          productId: String(p._id),
          variantId: null,
          name: p.name,
          sku: p.sku,
          stockOnHand: p.stockOnHand,
          reservedStock: p.reservedStock,
          availableStock: available,
          lowStockThreshold: p.lowStockThreshold,
          isLowStock: available > 0 && available <= p.lowStockThreshold,
          isOutOfStock: available === 0,
          unitCostEstimate: p.basePrice,
          imageUrl: p.images[0]?.url || '',
        },
      ];
    });

    const movements = await InventoryMovementModel.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('actorId', 'name email');

    res.json({ rows, movements });
  })
);

router.post(
  '/adjust',
  requirePermission('inventory:write'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      productId: z.string().min(1),
      variantId: z.string().nullable().optional(),
      quantityDelta: z.number().int().refine((n) => n !== 0, 'Delta cannot be zero'),
      type: z.enum(['restock', 'adjustment']),
      reason: z.string().trim().min(3).max(240),
    });

    const parsed = schema.parse(req.body);
    const product = await ProductModel.findById(parsed.productId);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    let sku = product.sku;
    let wasOutOfStock = false;
    let nowInStock = false;

    if (parsed.variantId) {
      const variant = product.variants.find(
        (v: { _id?: unknown }) => String(v._id) === parsed.variantId
      );
      if (!variant) {
        res.status(404).json({ error: 'Variant not found' });
        return;
      }
      wasOutOfStock = variant.stockOnHand - variant.reservedStock <= 0;
      const nextStock = variant.stockOnHand + parsed.quantityDelta;
      if (nextStock < variant.reservedStock) {
        res.status(400).json({
          error: `Cannot reduce stock below currently reserved units (${variant.reservedStock}).`,
        });
        return;
      }
      variant.stockOnHand = nextStock;
      sku = variant.sku;
      nowInStock = variant.stockOnHand - variant.reservedStock > 0;
    } else {
      wasOutOfStock = product.stockOnHand - product.reservedStock <= 0;
      const nextStock = product.stockOnHand + parsed.quantityDelta;
      if (nextStock < product.reservedStock) {
        res.status(400).json({
          error: `Cannot reduce stock below currently reserved units (${product.reservedStock}).`,
        });
        return;
      }
      product.stockOnHand = nextStock;
      nowInStock = product.stockOnHand - product.reservedStock > 0;
    }

    await product.save();

    await InventoryMovementModel.create({
      productId: product._id,
      variantId: parsed.variantId || null,
      sku,
      type: parsed.type,
      quantityDelta: parsed.quantityDelta,
      reservedDelta: 0,
      reason: parsed.reason,
      actorId: req.user!._id,
    });

    await recordAuditLog({
      actorId: req.user!._id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'INVENTORY_ADJUSTMENT',
      resourceType: 'Product',
      resourceId: String(product._id),
      details: { sku, delta: parsed.quantityDelta, reason: parsed.reason },
      ipAddress: req.ip,
    });

    // Trigger back-in-stock notifications when restocked from 0
    if (wasOutOfStock && nowInStock && product.backInStockSubscribers.length > 0) {
      const subscribers = [...product.backInStockSubscribers];
      product.backInStockSubscribers = [];
      await product.save();
      for (const email of subscribers) {
        void sendTransactionalEmail({
          email,
          type: 'back_in_stock',
          subject: `${product.name} is back in stock at NOVARA COMMERCE`,
          html: `<p>Good news! <strong>${escapeHtml(product.name)}</strong> is available again.</p><p>View it now at NOVARA COMMERCE.</p>`,
        });
      }
    }

    res.json({ ok: true });
  })
);

export default router;
