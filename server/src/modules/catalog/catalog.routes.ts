import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { expandCrossLingualTokens } from '../../../../shared/crossLingualSearch.ts';
import { resolveEffectiveUnitPrice } from '../../../../shared/pricing.ts';
import { hasPermission } from '../../../../shared/rbac.ts';
import { escapeRegex, parseCsvLine, sanitizeCsvCell } from '../../../../shared/security.ts';
import { calculateAvailableProductStock } from '../../../../shared/wishlistHelpers.ts';
import { requireDatabase } from '../../database/connection.ts';
import {
  optionalAuth,
  requireAuth,
  requirePermission,
  type AuthenticatedRequest,
} from '../../middleware/auth.middleware.ts';
import { asyncHandler } from '../../middleware/error.middleware.ts';
import { recordAuditLog } from '../../services/audit.service.ts';
import { destroyCloudinaryAssetIfUnused } from '../../services/cloudinary.service.ts';
import {
  BrandModel,
  CategoryModel,
  CollectionModel,
  ProductModel,
  SearchAnalyticsModel,
} from './catalog.model.ts';
import { InventoryMovementModel } from '../inventory/inventory.model.ts';
import { OrderModel } from '../orders/order.model.ts';

const router = Router();
router.use(requireDatabase);

const assetSchema = z.object({
  publicId: z.string().min(1),
  url: z.string().url(),
  width: z.number().optional(),
  height: z.number().optional(),
  format: z.string().optional(),
  alt: z.string().optional(),
});

const variantInputSchema = z.object({
  _id: z.string().optional(),
  sku: z.string().trim().min(2).max(60),
  title: z.string().trim().min(1).max(100),
  options: z.record(z.string(), z.string()).default({}),
  price: z.number().min(0).nullable().optional(),
  stockOnHand: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  image: assetSchema.optional(),
  isActive: z.boolean().default(true),
});

const productSchema = z.object({
  name: z.string().trim().min(2).max(160),
  nameBn: z.string().trim().max(160).optional(),
  slug: z.string().trim().min(2).max(180).toLowerCase(),
  sku: z.string().trim().min(2).max(60).toUpperCase(),
  barcode: z.string().trim().max(60).optional(),
  brandId: z.string().nullable().optional(),
  categoryId: z.string().min(1),
  subcategoryId: z.string().nullable().optional(),
  categoryDomain: z
    .enum(['electronics', 'beauty', 'books', 'home_lifestyle', 'fashion', 'general'])
    .default('general'),
  shortDescription: z.string().trim().max(320).optional(),
  description: z.string().trim().min(10).max(8000),
  features: z.array(z.string().trim()).default([]),
  attributes: z.record(z.string(), z.string()).default({}),
  bilingualKeywords: z.array(z.string().trim()).default([]),
  basePrice: z.number().min(0),
  salePrice: z.number().min(0).nullable().optional(),
  flashSalePrice: z.number().min(0).nullable().optional(),
  flashSaleStart: z.string().datetime().nullable().optional(),
  flashSaleEnd: z.string().datetime().nullable().optional(),
  stockOnHand: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  variants: z.array(variantInputSchema).default([]),
  images: z.array(assetSchema).default([]),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  isFeatured: z.boolean().default(false),
  warrantyInfo: z.string().trim().max(300).optional(),
  returnPolicyInfo: z.string().trim().max(300).optional(),
  codEligible: z.boolean().default(true),
  seoTitle: z.string().trim().max(140).optional(),
  seoDescription: z.string().trim().max(260).optional(),
});

export function formatProductForStorefront(product: Record<string, unknown>) {
  const now = new Date();
  const basePrice = Number(product.basePrice || 0);
  const pricing = resolveEffectiveUnitPrice(
    {
      basePrice,
      salePrice: product.salePrice as number | null | undefined,
      flashSalePrice: product.flashSalePrice as number | null | undefined,
      flashSaleStart: product.flashSaleStart as Date | null | undefined,
      flashSaleEnd: product.flashSaleEnd as Date | null | undefined,
    },
    now
  );

  const variants = Array.isArray(product.variants)
    ? (product.variants as Array<{ isActive?: boolean; stockOnHand?: number; reservedStock?: number }>)
    : [];
  const totalAvailable = calculateAvailableProductStock({
    stockOnHand: Number(product.stockOnHand || 0),
    reservedStock: Number(product.reservedStock || 0),
    variants,
  });

  return {
    ...product,
    effectivePrice: pricing.unitPrice,
    originalPrice: pricing.originalPrice,
    discountPercent: pricing.discountPercent,
    isFlashSaleActive: pricing.isFlashSaleActive,
    availableStock: totalAvailable,
  };
}

// Public: Categories & Brands & Collections
router.get(
  '/categories',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const canViewAll =
      req.query.all === 'true' && hasPermission(req.user?.role, 'catalog:read');
    const filter = canViewAll ? {} : { isActive: true };
    const categories = await CategoryModel.find(filter).sort({ displayOrder: 1, name: 1 }).lean();
    res.json({ categories });
  })
);

router.get(
  '/brands',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const canViewAll =
      req.query.all === 'true' && hasPermission(req.user?.role, 'catalog:read');
    const filter = canViewAll ? {} : { isActive: true };
    const brands = await BrandModel.find(filter).sort({ name: 1 }).lean();
    res.json({ brands });
  })
);

router.get(
  '/collections',
  asyncHandler(async (_req, res) => {
    const collections = await CollectionModel.find({ isActive: true })
      .sort({ displayOrder: 1 })
      .populate({ path: 'productIds', match: { status: 'published' } })
      .lean();
    res.json({ collections });
  })
);

// Public: Bounded Cross-Lingual Autocomplete (max 8 results)
router.get(
  '/search/suggestions',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const requestedLimit = Number(req.query.limit || 8);
    const limit = Math.min(8, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 8));

    if (q.length < 1) {
      const popular = await SearchAnalyticsModel.find()
        .sort({ searchCount: -1 })
        .limit(5)
        .select('query searchCount')
        .lean();
      res.json({ suggestions: [], popularSearches: popular.map((p) => p.query) });
      return;
    }

    const tokens = expandCrossLingualTokens(q);
    const regexConditions = tokens.map((token) => {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      return {
        $or: [
          { name: regex },
          { nameBn: regex },
          { sku: regex },
          { description: regex },
          { bilingualKeywords: regex },
        ],
      };
    });

    const matches = await ProductModel.find({
      status: 'published',
      $or: regexConditions,
    })
      .select(
        'name slug sku basePrice salePrice flashSalePrice flashSaleStart flashSaleEnd images stockOnHand reservedStock variants'
      )
      .sort({ salesCount: -1, isFeatured: -1 })
      .limit(limit)
      .lean();

    const suggestions = matches.map((m) => {
      const formatted = formatProductForStorefront(m as unknown as Record<string, unknown>);
      return {
        id: String(m._id),
        name: m.name,
        slug: m.slug,
        imageUrl: m.images?.[0]?.url || '',
        effectivePrice: formatted.effectivePrice,
        originalPrice: formatted.originalPrice,
        discountPercent: formatted.discountPercent,
      };
    });

    res.json({ suggestions });
  })
);

// Public: Product Listing, Category, Brand & Search Results with Pagination & Filtering
router.get(
  '/products',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(48, Math.max(1, Number(req.query.limit || 20)));
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const categorySlug = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const brandSlug = typeof req.query.brand === 'string' ? req.query.brand.trim() : '';
    const tab = typeof req.query.tab === 'string' ? req.query.tab : 'all';
    const minPrice = req.query.minPrice !== undefined && req.query.minPrice !== '' ? Number(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice !== undefined && req.query.maxPrice !== '' ? Number(req.query.maxPrice) : null;
    const minRating = req.query.minRating !== undefined && req.query.minRating !== '' ? Number(req.query.minRating) : null;
    const inStockOnly = req.query.inStock === 'true';
    const onSaleOnly = req.query.onSale === 'true' || tab === 'on_sale';
    const featuredOnly = req.query.featured === 'true';
    const topRatedOnly = req.query.topRated === 'true' || tab === 'top_rated';
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'featured';
    const includeAllStatus =
      req.query.includeAll === 'true' && hasPermission(req.user?.role, 'catalog:read');

    const now = new Date();
    const filter: Record<string, unknown> = includeAllStatus ? {} : { status: 'published' };
    const andClauses: Record<string, unknown>[] = [];

    if (categorySlug) {
      const category = await CategoryModel.findOne({ slug: categorySlug }).lean();
      if (category) {
        const subCategories = await CategoryModel.find({ parentId: category._id }).select('_id').lean();
        const catIds = [category._id, ...subCategories.map((c) => c._id)];
        andClauses.push({ $or: [{ categoryId: { $in: catIds } }, { subcategoryId: { $in: catIds } }] });
      } else {
        res.json({ products: [], total: 0, page, totalPages: 0 });
        return;
      }
    }

    if (brandSlug) {
      const brand = await BrandModel.findOne({ slug: brandSlug }).lean();
      if (brand) {
        filter.brandId = brand._id;
      } else {
        res.json({ products: [], total: 0, page, totalPages: 0 });
        return;
      }
    }

    if (q) {
      const tokens = expandCrossLingualTokens(q);
      const tokenMatchers = tokens.map((token) => {
        const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'i');
        return {
          $or: [
            { name: regex },
            { nameBn: regex },
            { sku: regex },
            { description: regex },
            { bilingualKeywords: regex },
          ],
        };
      });
      andClauses.push({ $or: tokenMatchers });
    }

    const effectivePriceExpr = {
      $let: {
        vars: {
          flashActive: {
            $and: [
              { $ne: ['$flashSalePrice', null] },
              { $gt: ['$flashSalePrice', 0] },
              { $lt: ['$flashSalePrice', '$basePrice'] },
              { $or: [{ $eq: ['$flashSaleStart', null] }, { $lte: ['$flashSaleStart', now] }] },
              { $or: [{ $eq: ['$flashSaleEnd', null] }, { $gte: ['$flashSaleEnd', now] }] },
            ],
          },
          saleActive: {
            $and: [
              { $ne: ['$salePrice', null] },
              { $gt: ['$salePrice', 0] },
              { $lt: ['$salePrice', '$basePrice'] },
            ],
          },
        },
        in: {
          $cond: [
            '$$flashActive',
            '$flashSalePrice',
            { $cond: ['$$saleActive', '$salePrice', '$basePrice'] },
          ],
        },
      },
    };

    if (minPrice !== null && Number.isFinite(minPrice)) {
      andClauses.push({ $expr: { $gte: [effectivePriceExpr, minPrice] } });
    }
    if (maxPrice !== null && Number.isFinite(maxPrice)) {
      andClauses.push({ $expr: { $lte: [effectivePriceExpr, maxPrice] } });
    }
    if (minRating !== null && Number.isFinite(minRating)) {
      filter.ratingAverage = { $gte: minRating };
    }
    if (featuredOnly) {
      filter.isFeatured = true;
    }
    if (topRatedOnly) {
      filter.ratingCount = { $gt: 0 };
    }
    if (onSaleOnly) {
      andClauses.push({
        $or: [
          {
            $expr: {
              $and: [
                { $ne: ['$salePrice', null] },
                { $gt: ['$salePrice', 0] },
                { $lt: ['$salePrice', '$basePrice'] },
              ],
            },
          },
          {
            flashSalePrice: { $ne: null, $gt: 0 },
            $and: [
              { $expr: { $lt: ['$flashSalePrice', '$basePrice'] } },
              { $or: [{ flashSaleStart: null }, { flashSaleStart: { $lte: now } }] },
              { $or: [{ flashSaleEnd: null }, { flashSaleEnd: { $gte: now } }] },
            ],
          },
        ],
      });
    }
    if (inStockOnly) {
      andClauses.push({
        $expr: {
          $let: {
            vars: {
              activeVariants: {
                $filter: {
                  input: { $ifNull: ['$variants', []] },
                  as: 'v',
                  cond: { $ne: ['$$v.isActive', false] },
                },
              },
            },
            in: {
              $cond: [
                { $gt: [{ $size: '$$activeVariants' }, 0] },
                {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: '$$activeVariants',
                          as: 'av',
                          cond: {
                            $gt: [
                              {
                                $subtract: [
                                  { $ifNull: ['$$av.stockOnHand', 0] },
                                  { $ifNull: ['$$av.reservedStock', 0] },
                                ],
                              },
                              0,
                            ],
                          },
                        },
                      },
                    },
                    0,
                  ],
                },
                {
                  $gt: [
                    {
                      $subtract: [
                        { $ifNull: ['$stockOnHand', 0] },
                        { $ifNull: ['$reservedStock', 0] },
                      ],
                    },
                    0,
                  ],
                },
              ],
            },
          },
        },
      });
    }

    const isBestSellerQuery = tab === 'best_seller' || sort === 'best_selling';
    let orderSalesByProductId = new Map<string, number>();

    if (isBestSellerQuery) {
      const aggregatedSales = await OrderModel.aggregate<{
        _id: mongoose.Types.ObjectId;
        totalUnits: number;
      }>([
        {
          $match: {
            orderStatus: { $in: ['confirmed', 'processing', 'packed', 'shipped', 'delivered'] },
            paymentStatus: { $ne: 'failed' },
          },
        },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            totalUnits: { $sum: '$items.quantity' },
          },
        },
        { $match: { totalUnits: { $gt: 0 } } },
        { $sort: { totalUnits: -1 } },
      ]);

      orderSalesByProductId = new Map(
        aggregatedSales.map((row) => [String(row._id), Number(row.totalUnits || 0)])
      );

      if (tab === 'best_seller') {
        const orderProductIds = aggregatedSales.map((row) => row._id);
        andClauses.push({
          $or: [
            { salesCount: { $gt: 0 } },
            ...(orderProductIds.length > 0 ? [{ _id: { $in: orderProductIds } }] : []),
          ],
        });
      }
    }

    if (andClauses.length > 0) {
      filter.$and = andClauses;
    }

    let sortStage: Record<string, 1 | -1> = { isFeatured: -1, createdAt: -1 };
    if (sort === 'price_asc') sortStage = { basePrice: 1 };
    else if (sort === 'price_desc') sortStage = { basePrice: -1 };
    else if (isBestSellerQuery) sortStage = { salesCount: -1, createdAt: -1 };
    else if (sort === 'top_rated' || tab === 'top_rated') sortStage = { ratingAverage: -1, ratingCount: -1 };
    else if (sort === 'newest' || tab === 'new_arrivals') sortStage = { createdAt: -1 };

    let rawProducts: Record<string, unknown>[] = [];
    let total = 0;

    if (isBestSellerQuery && orderSalesByProductId.size > 0) {
      const matched = await ProductModel.find(filter)
        .populate('brandId', 'name slug')
        .populate('categoryId', 'name slug nameBn')
        .populate('subcategoryId', 'name slug')
        .lean();

      const sortedMatched = matched
        .map((p) => {
          const obj = p as unknown as Record<string, unknown>;
          const id = String(obj._id);
          const effectiveUnits = Math.max(
            Number(obj.salesCount || 0),
            orderSalesByProductId.get(id) || 0
          );
          return { obj, effectiveUnits };
        })
        .sort((a, b) => b.effectiveUnits - a.effectiveUnits);

      total = sortedMatched.length;
      rawProducts = sortedMatched
        .slice((page - 1) * limit, page * limit)
        .map(({ obj, effectiveUnits }) => ({ ...obj, salesCount: effectiveUnits }));
    } else {
      const [docs, count] = await Promise.all([
        ProductModel.find(filter)
          .populate('brandId', 'name slug')
          .populate('categoryId', 'name slug nameBn')
          .populate('subcategoryId', 'name slug')
          .sort(sortStage)
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        ProductModel.countDocuments(filter),
      ]);
      rawProducts = docs as unknown as Record<string, unknown>[];
      total = count;
    }

    const products = rawProducts.map((p) => formatProductForStorefront(p));

    if (q) {
      const normalizedQuery = q.toLowerCase();
      void SearchAnalyticsModel.findOneAndUpdate(
        { normalizedQuery },
        {
          $set: { query: q, resultCount: total, lastSearchedAt: new Date() },
          $inc: { searchCount: 1 },
        },
        { upsert: true }
      ).catch(() => {});
    }

    res.json({
      products,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  })
);

// Public: Batch fetch published products by IDs (used to hydrate guest wishlist)
router.post(
  '/products/by-ids',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      ids: z.array(z.string().trim().min(1)).max(100),
    });
    const parsed = schema.parse(req.body);
    const validIds = Array.from(
      new Set(parsed.ids.filter((id) => mongoose.Types.ObjectId.isValid(id)))
    );
    if (validIds.length === 0) {
      res.json({ products: [] });
      return;
    }

    const rawProducts = await ProductModel.find({
      _id: { $in: validIds },
      status: 'published',
    })
      .populate('brandId', 'name slug')
      .populate('categoryId', 'name slug nameBn')
      .lean();

    const byId = new Map(
      rawProducts.map((p) => [
        String(p._id),
        formatProductForStorefront(p as unknown as Record<string, unknown>),
      ])
    );

    const ordered = validIds
      .map((id) => byId.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    res.json({ products: ordered });
  })
);

// Public: Product Detail by Slug
router.get(
  '/products/:slug',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const product = await ProductModel.findOne({ slug: req.params.slug })
      .populate('brandId', 'name slug logo')
      .populate('categoryId', 'name slug nameBn')
      .populate('subcategoryId', 'name slug')
      .lean();

    const canViewUnpublished = hasPermission(req.user?.role, 'catalog:read');
    if (
      !product ||
      product.status === 'archived' ||
      (product.status !== 'published' && !canViewUnpublished)
    ) {
      res.status(404).json({ error: 'Product not found', code: 'PRODUCT_NOT_FOUND' });
      return;
    }

    const related = await ProductModel.find({
      _id: { $ne: product._id },
      categoryId: product.categoryId,
      status: 'published',
    })
      .populate('brandId', 'name slug')
      .limit(5)
      .lean();

    res.json({
      product: formatProductForStorefront(product as unknown as Record<string, unknown>),
      relatedProducts: related.map((r) =>
        formatProductForStorefront(r as unknown as Record<string, unknown>)
      ),
    });
  })
);

// Public: Back-in-stock notification opt-in
router.post(
  '/products/:id/back-in-stock',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const email = z.string().trim().email().parse(req.body?.email || req.user?.email);
    const product = await ProductModel.findById(req.params.id);
    if (!product || product.status !== 'published') {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const normalized = email.toLowerCase();
    if (!product.backInStockSubscribers.includes(normalized)) {
      product.backInStockSubscribers.push(normalized);
      await product.save();
    }

    res.json({ ok: true, message: 'You will be notified by email when this product is restocked.' });
  })
);

// ADMIN: Categories CRUD
router.post(
  '/admin/categories',
  requireAuth,
  requirePermission('catalog:write'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      name: z.string().trim().min(2).max(80),
      nameBn: z.string().trim().max(80).optional(),
      slug: z.string().trim().min(2).max(90).toLowerCase(),
      description: z.string().trim().max(500).optional(),
      parentId: z.string().nullable().optional(),
      image: assetSchema.optional(),
      displayOrder: z.number().int().default(0),
      isActive: z.boolean().default(true),
      seoTitle: z.string().max(120).optional(),
      seoDescription: z.string().max(240).optional(),
    });
    const parsed = schema.parse(req.body);
    const category = await CategoryModel.create(parsed);

    await recordAuditLog({
      actorId: req.user!._id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'CREATE_CATEGORY',
      resourceType: 'Category',
      resourceId: String(category._id),
      details: { name: category.name, slug: category.slug },
      ipAddress: req.ip,
    });

    res.status(201).json({ category });
  })
);

router.patch(
  '/admin/categories/:id',
  requireAuth,
  requirePermission('catalog:write'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      name: z.string().trim().min(2).max(80).optional(),
      nameBn: z.string().trim().max(80).optional(),
      slug: z.string().trim().min(2).max(90).toLowerCase().optional(),
      description: z.string().trim().max(500).optional(),
      parentId: z.string().nullable().optional(),
      image: assetSchema.nullable().optional(),
      displayOrder: z.number().int().optional(),
      isActive: z.boolean().optional(),
    });
    const parsed = schema.parse(req.body);
    const existing = await CategoryModel.findById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }

    const oldPublicId = existing.image?.publicId;
    Object.assign(existing, parsed);
    await existing.save();

    if (oldPublicId && parsed.image?.publicId !== oldPublicId) {
      void destroyCloudinaryAssetIfUnused(oldPublicId);
    }

    res.json({ category: existing });
  })
);

// ADMIN: Brands CRUD
router.post(
  '/admin/brands',
  requireAuth,
  requirePermission('catalog:write'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      name: z.string().trim().min(1).max(80),
      slug: z.string().trim().min(1).max(90).toLowerCase(),
      description: z.string().trim().max(400).optional(),
      logo: assetSchema.optional(),
      isActive: z.boolean().default(true),
    });
    const parsed = schema.parse(req.body);
    const brand = await BrandModel.create(parsed);

    await recordAuditLog({
      actorId: req.user!._id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'CREATE_BRAND',
      resourceType: 'Brand',
      resourceId: String(brand._id),
      details: { name: brand.name },
      ipAddress: req.ip,
    });

    res.status(201).json({ brand });
  })
);

router.patch(
  '/admin/brands/:id',
  requireAuth,
  requirePermission('catalog:write'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      name: z.string().trim().min(1).max(80).optional(),
      slug: z.string().trim().min(1).max(90).toLowerCase().optional(),
      description: z.string().trim().max(400).optional(),
      logo: assetSchema.nullable().optional(),
      isActive: z.boolean().optional(),
    });
    const parsed = schema.parse(req.body);
    const existing = await BrandModel.findById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Brand not found' });
      return;
    }

    const oldPublicId = existing.logo?.publicId;
    Object.assign(existing, parsed);
    await existing.save();

    if (oldPublicId && parsed.logo?.publicId !== oldPublicId) {
      void destroyCloudinaryAssetIfUnused(oldPublicId);
    }

    await recordAuditLog({
      actorId: req.user!._id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'UPDATE_BRAND',
      resourceType: 'Brand',
      resourceId: String(existing._id),
      details: { name: existing.name },
      ipAddress: req.ip,
    });

    res.json({ brand: existing });
  })
);

// ADMIN: Products CRUD
router.get(
  '/admin/products',
  requireAuth,
  requirePermission('catalog:read'),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 25)));
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const filter: Record<string, unknown> = {};
    if (q) {
      const escapedQ = escapeRegex(q);
      filter.$or = [
        { name: { $regex: escapedQ, $options: 'i' } },
        { sku: { $regex: escapedQ, $options: 'i' } },
      ];
    }

    const [products, total] = await Promise.all([
      ProductModel.find(filter)
        .populate('brandId', 'name slug')
        .populate('categoryId', 'name slug')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      ProductModel.countDocuments(filter),
    ]);

    res.json({ products, total, page, totalPages: Math.ceil(total / limit) });
  })
);

router.post(
  '/admin/products',
  requireAuth,
  requirePermission('catalog:write'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = productSchema.parse(req.body);

    const product = await ProductModel.create({
      ...parsed,
      brandId: parsed.brandId || null,
      subcategoryId: parsed.subcategoryId || null,
      flashSaleStart: parsed.flashSaleStart ? new Date(parsed.flashSaleStart) : null,
      flashSaleEnd: parsed.flashSaleEnd ? new Date(parsed.flashSaleEnd) : null,
    });

    await InventoryMovementModel.create({
      productId: product._id,
      sku: product.sku,
      type: 'initial',
      quantityDelta: product.stockOnHand,
      reservedDelta: 0,
      reason: 'Initial product creation',
      actorId: req.user!._id,
    });

    await recordAuditLog({
      actorId: req.user!._id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'CREATE_PRODUCT',
      resourceType: 'Product',
      resourceId: String(product._id),
      details: { sku: product.sku, name: product.name, basePrice: product.basePrice },
      ipAddress: req.ip,
    });

    res.status(201).json({ product });
  })
);

router.patch(
  '/admin/products/:id',
  requireAuth,
  requirePermission('catalog:write'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = productSchema.partial().parse(req.body);
    const existing = await ProductModel.findById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const oldPublicIds = existing.images.map((img: { publicId: string }) => img.publicId);
    const previousPrice = existing.basePrice;

    Object.assign(existing, {
      ...parsed,
      brandId: parsed.brandId === '' ? null : (parsed.brandId ?? existing.brandId),
      subcategoryId: parsed.subcategoryId === '' ? null : (parsed.subcategoryId ?? existing.subcategoryId),
      flashSaleStart:
        parsed.flashSaleStart !== undefined
          ? parsed.flashSaleStart
            ? new Date(parsed.flashSaleStart)
            : null
          : existing.flashSaleStart,
      flashSaleEnd:
        parsed.flashSaleEnd !== undefined
          ? parsed.flashSaleEnd
            ? new Date(parsed.flashSaleEnd)
            : null
          : existing.flashSaleEnd,
    });

    await existing.save();

    if (parsed.images) {
      const nextIds = new Set(parsed.images.map((i) => i.publicId));
      for (const oldId of oldPublicIds) {
        if (!nextIds.has(oldId)) {
          void destroyCloudinaryAssetIfUnused(oldId);
        }
      }
    }

    await recordAuditLog({
      actorId: req.user!._id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: previousPrice !== existing.basePrice ? 'UPDATE_PRODUCT_PRICE' : 'UPDATE_PRODUCT',
      resourceType: 'Product',
      resourceId: String(existing._id),
      details: { sku: existing.sku, previousPrice, newPrice: existing.basePrice },
      ipAddress: req.ip,
    });

    res.json({ product: existing });
  })
);

// ADMIN: Bulk CSV Export & Import
router.get(
  '/admin/products/export/csv',
  requireAuth,
  requirePermission('catalog:read'),
  asyncHandler(async (_req, res) => {
    const products = await ProductModel.find({ status: { $ne: 'archived' } })
      .populate('categoryId', 'slug')
      .populate('brandId', 'slug')
      .lean();

    const headers = ['sku', 'name', 'slug', 'categorySlug', 'brandSlug', 'basePrice', 'salePrice', 'stockOnHand', 'status'];
    const lines = [headers.join(',')];

    for (const p of products) {
      const catSlug = (p.categoryId as { slug?: string } | null)?.slug || '';
      const brSlug = (p.brandId as { slug?: string } | null)?.slug || '';
      const row = [
        sanitizeCsvCell(p.sku),
        sanitizeCsvCell(p.name),
        sanitizeCsvCell(p.slug),
        sanitizeCsvCell(catSlug),
        sanitizeCsvCell(brSlug),
        p.basePrice,
        p.salePrice ?? '',
        p.stockOnHand,
        p.status,
      ];
      lines.push(row.join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="novara-catalog-export.csv"');
    res.send(lines.join('\n'));
  })
);

router.post(
  '/admin/products/import/csv',
  requireAuth,
  requirePermission('catalog:write'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const csvText = z.string().min(5).max(500_000).parse(req.body?.csvText);
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      res.status(400).json({ error: 'CSV must contain a header row and at least one product row.' });
      return;
    }

    if (lines.length > 501) {
      res.status(400).json({ error: 'Bulk CSV import is bounded to 500 rows per batch.' });
      return;
    }

    const categories = await CategoryModel.find().lean();
    const brands = await BrandModel.find().lean();
    const catMap = new Map(categories.map((c) => [c.slug, c._id]));
    const brandMap = new Map(brands.map((b) => [b.slug, b._id]));

    const errors: Array<{ row: number; sku: string; error: string }> = [];
    let importedCount = 0;

    for (let i = 1; i < lines.length; i += 1) {
      const cols = parseCsvLine(lines[i]);
      const [sku, name, slug, categorySlug, brandSlug, basePriceStr, salePriceStr, stockStr, statusStr] = cols;
      if (!sku || !name || !slug || !categorySlug) {
        errors.push({ row: i + 1, sku: sku || '', error: 'Missing required sku, name, slug, or categorySlug.' });
        continue;
      }
      const categoryId = catMap.get(categorySlug.toLowerCase());
      if (!categoryId) {
        errors.push({ row: i + 1, sku, error: `Unknown categorySlug: ${categorySlug}` });
        continue;
      }

      const basePrice = Number(basePriceStr);
      const salePrice = salePriceStr ? Number(salePriceStr) : null;
      const stockOnHand = Number(stockStr || 0);
      if (!Number.isFinite(basePrice) || basePrice < 0) {
        errors.push({ row: i + 1, sku, error: 'Invalid basePrice.' });
        continue;
      }

      try {
        const created = await ProductModel.create({
          sku: sku.toUpperCase(),
          name,
          slug: slug.toLowerCase(),
          categoryId,
          brandId: brandSlug ? brandMap.get(brandSlug.toLowerCase()) || null : null,
          description: `${name} — Imported via NOVARA bulk catalog import.`,
          basePrice,
          salePrice: salePrice && salePrice > 0 ? salePrice : null,
          stockOnHand: Number.isFinite(stockOnHand) && stockOnHand >= 0 ? Math.floor(stockOnHand) : 0,
          status: statusStr === 'published' ? 'published' : 'draft',
        });
        await InventoryMovementModel.create({
          productId: created._id,
          sku: created.sku,
          type: 'initial',
          quantityDelta: created.stockOnHand,
          reservedDelta: 0,
          reason: 'Bulk CSV catalog import',
          actorId: req.user!._id,
        });
        importedCount += 1;
      } catch (err) {
        errors.push({
          row: i + 1,
          sku,
          error: err instanceof Error ? err.message : 'Duplicate SKU or slug.',
        });
      }
    }

    await recordAuditLog({
      actorId: req.user!._id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'BULK_CSV_IMPORT',
      resourceType: 'Product',
      details: { importedCount, errorCount: errors.length },
      ipAddress: req.ip,
    });

    res.json({ importedCount, errorCount: errors.length, errors });
  })
);

export default router;
