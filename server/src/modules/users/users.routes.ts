import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { z } from 'zod';
import {
  isValidBangladeshPhone,
  normalizeBangladeshPhone,
  validateBangladeshHierarchy,
} from '../../../../shared/bangladeshLocations.ts';
import { STAFF_ROLES, type StaffRole } from '../../../../shared/rbac.ts';
import { escapeHtml, escapeRegex, isSafeDestinationUrl } from '../../../../shared/security.ts';
import { mergeWishlistIds, validateImageUploadMeta } from '../../../../shared/wishlistHelpers.ts';
import { env } from '../../config/env.ts';
import { requireDatabase } from '../../database/connection.ts';
import {
  requireAuth,
  requirePermission,
  setAuthCookie,
  signAuthToken,
  type AuthenticatedRequest,
} from '../../middleware/auth.middleware.ts';
import { asyncHandler } from '../../middleware/error.middleware.ts';
import { recordAuditLog } from '../../services/audit.service.ts';
import {
  destroyCloudinaryAssetIfUnused,
  uploadBufferToCloudinary,
} from '../../services/cloudinary.service.ts';
import { sendTransactionalEmail } from '../../services/email.service.ts';
import { getUserAccountStats, sanitizeUser } from '../auth/auth.routes.ts';
import { ProductModel } from '../catalog/catalog.model.ts';
import { formatProductForStorefront } from '../catalog/catalog.routes.ts';
import { OrderModel } from '../orders/order.model.ts';
import { UserModel } from './user.model.ts';

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
});

async function fetchFormattedWishlistItems(wishlistIds: unknown[]) {
  const stringIds = wishlistIds
    .map((id) => String(id))
    .filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (stringIds.length === 0) return [];

  const rawProducts = await ProductModel.find({
    _id: { $in: stringIds },
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

  return stringIds
    .map((id) => byId.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

const router = Router();
router.use(requireDatabase, requireAuth);

const addressInputSchema = z.object({
  label: z.string().trim().min(1).max(40),
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
  isDefault: z.boolean().optional(),
});

router.get(
  '/profile',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await UserModel.findById(req.user!._id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const stats = await getUserAccountStats(user._id);
    res.json({ user: sanitizeUser(user, stats), stats });
  })
);

router.get(
  '/dashboard',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await UserModel.findById(req.user!._id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const [stats, recentOrders] = await Promise.all([
      getUserAccountStats(user._id),
      OrderModel.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .limit(4)
        .select('orderNumber orderStatus paymentStatus totalAmount items createdAt')
        .lean(),
    ]);

    res.json({
      summary: {
        ordersCount: stats.ordersCount,
        deliveredOrdersCount: stats.deliveredOrdersCount,
        totalSpent: stats.totalDeliveredSpend,
        wishlistCount: user.wishlist.length,
        addressesCount: user.savedAddresses.length,
        reviewsCount: stats.reviewsCount,
        membershipTier: sanitizeUser(user, stats).membershipTier,
      },
      recentOrders,
    });
  })
);

router.patch(
  '/profile',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      name: z.string().trim().min(2).max(100).optional(),
      phone: z.string().trim().max(25).optional(),
      gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).nullable().optional(),
      email: z.string().trim().email().max(150).optional(),
      avatarUrl: z
        .string()
        .trim()
        .refine((v) => v === '' || isSafeDestinationUrl(v, { allowRelative: true, allowEmpty: true }), 'Invalid avatar URL')
        .nullable()
        .optional(),
      avatarPublicId: z.string().trim().max(200).nullable().optional(),
      notificationPreferences: z
        .object({
          orderUpdates: z.boolean(),
          promotions: z.boolean(),
          backInStock: z.boolean(),
        })
        .optional(),
    });
    const parsed = schema.parse(req.body);
    const user = await UserModel.findById(req.user!._id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (parsed.name !== undefined) user.name = parsed.name;
    if (parsed.phone !== undefined) user.phone = parsed.phone;
    if (parsed.gender !== undefined) user.gender = parsed.gender || undefined;
    if (parsed.notificationPreferences) {
      user.notificationPreferences = parsed.notificationPreferences;
    }

    let emailReverificationRequired = false;
    if (parsed.email !== undefined) {
      const normalizedEmail = parsed.email.toLowerCase();
      if (normalizedEmail !== user.email) {
        if (user.authProvider !== 'local') {
          res.status(400).json({
            error: `Email cannot be changed for ${user.authProvider} OAuth accounts.`,
          });
          return;
        }
        const duplicate = await UserModel.exists({
          email: normalizedEmail,
          _id: { $ne: user._id },
        });
        if (duplicate) {
          res.status(409).json({ error: 'Another account already uses this email address.' });
          return;
        }

        const verifyToken = crypto.randomBytes(24).toString('hex');
        user.email = normalizedEmail;
        user.emailVerified = false;
        user.verificationTokenHash = crypto.createHash('sha256').update(verifyToken).digest('hex');
        emailReverificationRequired = true;

        void sendTransactionalEmail({
          userId: String(user._id),
          email: user.email,
          type: 'verification',
          subject: 'Verify your updated NOVARA COMMERCE email',
          html: `<p>Hi ${escapeHtml(user.name)},</p><p>Please verify your updated email address: <a href="${env.appUrl}/verify-email?token=${verifyToken}">Verify Email</a></p>`,
        });
      }
    }

    const oldAvatarPublicId = user.avatarPublicId;
    if (parsed.avatarUrl !== undefined) {
      user.avatarUrl = parsed.avatarUrl || '';
      if (!parsed.avatarUrl) {
        user.avatarPublicId = undefined;
      } else if (parsed.avatarPublicId !== undefined) {
        user.avatarPublicId = parsed.avatarPublicId || undefined;
      }
    }

    await user.save();

    if (oldAvatarPublicId && oldAvatarPublicId !== user.avatarPublicId) {
      void destroyCloudinaryAssetIfUnused(oldAvatarPublicId);
    }

    const stats = await getUserAccountStats(user._id);
    res.json({
      user: sanitizeUser(user, stats),
      emailReverificationRequired,
    });
  })
);

router.post(
  '/profile/avatar',
  avatarUpload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided.' });
      return;
    }

    const metaCheck = validateImageUploadMeta({
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      maxBytes: 4 * 1024 * 1024,
    });
    if (!metaCheck.valid) {
      res.status(400).json({ error: metaCheck.error });
      return;
    }

    const user = await UserModel.findById(req.user!._id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const asset = await uploadBufferToCloudinary(req.file.buffer, 'avatars', `${user.name} avatar`);
    const oldAvatarPublicId = user.avatarPublicId;
    user.avatarUrl = asset.url;
    user.avatarPublicId = asset.publicId;
    await user.save();

    if (oldAvatarPublicId && oldAvatarPublicId !== asset.publicId) {
      void destroyCloudinaryAssetIfUnused(oldAvatarPublicId);
    }

    const stats = await getUserAccountStats(user._id);
    res.status(201).json({
      asset,
      user: sanitizeUser(user, stats),
    });
  })
);

router.post(
  '/change-password',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(100),
    });
    const parsed = schema.parse(req.body);
    const user = await UserModel.findById(req.user!._id).select('+passwordHash');
    if (!user || !user.passwordHash) {
      res.status(400).json({ error: 'Password change unavailable for OAuth-only account.' });
      return;
    }
    const valid = await bcrypt.compare(parsed.currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }
    user.passwordHash = await bcrypt.hash(parsed.newPassword, 12);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();
    const freshToken = signAuthToken(String(user._id), user.role, user.tokenVersion);
    setAuthCookie(res, freshToken);
    res.json({ ok: true, token: freshToken, message: 'Password updated successfully.' });
  })
);

// Saved Addresses with Bangladesh hierarchical validation
router.get(
  '/addresses',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await UserModel.findById(req.user!._id);
    res.json({ addresses: user?.savedAddresses || [] });
  })
);

router.post(
  '/addresses',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = addressInputSchema.parse(req.body);
    const hierarchy = validateBangladeshHierarchy(parsed);
    if (!hierarchy.valid || !hierarchy.zone) {
      res.status(400).json({ error: 'Invalid Bangladesh Division/District/Upazila/Area combination.' });
      return;
    }

    const user = await UserModel.findById(req.user!._id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const shouldBeDefault = parsed.isDefault || user.savedAddresses.length === 0;
    if (shouldBeDefault) {
      for (const addr of user.savedAddresses) {
        addr.isDefault = false;
      }
    }

    user.savedAddresses.push({
      label: parsed.label,
      recipientName: parsed.recipientName,
      phone: normalizeBangladeshPhone(parsed.phone),
      divisionCode: parsed.divisionCode,
      divisionName: hierarchy.divisionName!,
      districtCode: parsed.districtCode,
      districtName: hierarchy.districtName!,
      upazilaCode: parsed.upazilaCode,
      upazilaName: hierarchy.upazilaName!,
      areaCode: parsed.areaCode,
      areaName: hierarchy.areaName!,
      zone: hierarchy.zone,
      houseAddress: parsed.houseAddress,
      roadStreet: parsed.roadStreet,
      landmark: parsed.landmark,
      deliveryInstructions: parsed.deliveryInstructions,
      isDefault: shouldBeDefault,
    } as never);

    await user.save();
    res.status(201).json({ addresses: user.savedAddresses });
  })
);

router.patch(
  '/addresses/:addressId',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = addressInputSchema.partial().parse(req.body);
    const user = await UserModel.findById(req.user!._id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const addr = user.savedAddresses.find(
      (a: { _id?: unknown }) => String(a._id) === req.params.addressId
    );
    if (!addr) {
      res.status(404).json({ error: 'Saved address not found' });
      return;
    }

    const nextCodes = {
      divisionCode: parsed.divisionCode ?? addr.divisionCode,
      districtCode: parsed.districtCode ?? addr.districtCode,
      upazilaCode: parsed.upazilaCode ?? addr.upazilaCode,
      areaCode: parsed.areaCode ?? addr.areaCode,
    };
    const hierarchy = validateBangladeshHierarchy(nextCodes);
    if (!hierarchy.valid || !hierarchy.zone) {
      res.status(400).json({ error: 'Invalid Bangladesh administrative area hierarchy.' });
      return;
    }

    if (parsed.isDefault) {
      for (const item of user.savedAddresses) {
        item.isDefault = false;
      }
    }

    Object.assign(addr, {
      ...parsed,
      ...(parsed.phone ? { phone: normalizeBangladeshPhone(parsed.phone) } : {}),
      divisionName: hierarchy.divisionName,
      districtName: hierarchy.districtName,
      upazilaName: hierarchy.upazilaName,
      areaName: hierarchy.areaName,
      zone: hierarchy.zone,
    });

    await user.save();
    res.json({ addresses: user.savedAddresses });
  })
);

router.delete(
  '/addresses/:addressId',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await UserModel.findById(req.user!._id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const beforeLen = user.savedAddresses.length;
    user.savedAddresses = user.savedAddresses.filter(
      (a: { _id?: unknown }) => String(a._id) !== req.params.addressId
    ) as typeof user.savedAddresses;

    if (user.savedAddresses.length === beforeLen) {
      res.status(404).json({ error: 'Address not found' });
      return;
    }

    if (
      user.savedAddresses.length > 0 &&
      !user.savedAddresses.some((a: { isDefault?: boolean }) => a.isDefault)
    ) {
      user.savedAddresses[0].isDefault = true;
    }

    await user.save();
    res.json({ addresses: user.savedAddresses });
  })
);

// Wishlist
router.get(
  '/wishlist',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await UserModel.findById(req.user!._id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const items = await fetchFormattedWishlistItems(user.wishlist);
    const activeIds = items.map((item) => String((item as unknown as { _id?: unknown })._id));
    if (activeIds.length !== user.wishlist.length) {
      user.wishlist = activeIds.map((id) => new mongoose.Types.ObjectId(id));
      await user.save();
    }

    res.json({
      items,
      wishlist: activeIds,
    });
  })
);

router.post(
  '/wishlist',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const productId = z.string().trim().min(1).parse(req.body?.productId);
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      res.status(400).json({ error: 'Invalid product ID.' });
      return;
    }

    const productExists = await ProductModel.exists({ _id: productId, status: 'published' });
    if (!productExists) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const user = await UserModel.findById(req.user!._id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const existingIds = user.wishlist.map((id: unknown) => String(id));
    const alreadyExists = existingIds.includes(productId);
    const merged = mergeWishlistIds(existingIds, [productId]);
    user.wishlist = merged.map((id) => new mongoose.Types.ObjectId(id));
    await user.save();

    const items = await fetchFormattedWishlistItems(user.wishlist);
    res.status(alreadyExists ? 200 : 201).json({
      added: !alreadyExists,
      wishlist: merged,
      items,
    });
  })
);

router.post(
  '/wishlist/toggle',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const productId = z.string().trim().min(1).parse(req.body?.productId);
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      res.status(400).json({ error: 'Invalid product ID.' });
      return;
    }

    const productExists = await ProductModel.exists({ _id: productId, status: 'published' });
    if (!productExists) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const user = await UserModel.findById(req.user!._id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const idx = user.wishlist.findIndex((id: unknown) => String(id) === productId);
    let added = false;
    if (idx >= 0) {
      user.wishlist.splice(idx, 1);
    } else {
      user.wishlist.push(new mongoose.Types.ObjectId(productId));
      added = true;
    }
    await user.save();

    res.json({
      added,
      wishlist: user.wishlist.map((id: unknown) => String(id)),
    });
  })
);

router.post(
  '/wishlist/merge',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      productIds: z.array(z.string().trim().min(1)).max(100),
    });
    const parsed = schema.parse(req.body);
    const candidateIds = parsed.productIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

    const user = await UserModel.findById(req.user!._id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const published = candidateIds.length
      ? await ProductModel.find({ _id: { $in: candidateIds }, status: 'published' })
          .select('_id')
          .lean()
      : [];
    const validPublishedIds = published.map((p) => String(p._id));

    const merged = mergeWishlistIds(
      user.wishlist.map((id: unknown) => String(id)),
      validPublishedIds
    );
    user.wishlist = merged.map((id) => new mongoose.Types.ObjectId(id));
    await user.save();

    const items = await fetchFormattedWishlistItems(user.wishlist);
    res.json({
      wishlist: merged,
      items,
    });
  })
);

router.delete(
  '/wishlist/:productId',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const productId = req.params.productId;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      res.status(400).json({ error: 'Invalid product ID.' });
      return;
    }

    const user = await UserModel.findById(req.user!._id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const before = user.wishlist.length;
    user.wishlist = user.wishlist.filter(
      (id: unknown) => String(id) !== productId
    ) as typeof user.wishlist;

    if (user.wishlist.length !== before) {
      await user.save();
    }

    res.json({
      removed: true,
      wishlist: user.wishlist.map((id: unknown) => String(id)),
    });
  })
);

router.delete(
  '/wishlist',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await UserModel.findById(req.user!._id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    user.wishlist = [];
    await user.save();

    res.json({
      cleared: true,
      wishlist: [],
    });
  })
);

// Admin: Customer list
router.get(
  '/admin/customers',
  requirePermission('customers:read'),
  asyncHandler(async (req, res) => {
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));

    const filter: Record<string, unknown> = { role: 'customer' };
    if (search) {
      const escapedSearch = escapeRegex(search);
      filter.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } },
        { phone: { $regex: escapedSearch, $options: 'i' } },
      ];
    }

    const [customers, total] = await Promise.all([
      UserModel.find(filter)
        .select('name email phone isActive emailVerified authProvider createdAt lastLoginAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      UserModel.countDocuments(filter),
    ]);

    res.json({ customers, total, page, totalPages: Math.ceil(total / limit) });
  })
);

// Admin: Staff RBAC management
router.get(
  '/admin/staff',
  requirePermission('staff:manage'),
  asyncHandler(async (_req, res) => {
    const staff = await UserModel.find({ role: { $ne: 'customer' } })
      .select('name email phone role isActive createdAt lastLoginAt')
      .sort({ createdAt: -1 });
    res.json({ staff });
  })
);

router.post(
  '/admin/staff',
  requirePermission('staff:manage'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      name: z.string().trim().min(2).max(100),
      email: z.string().trim().email(),
      phone: z.string().trim().max(25).optional(),
      password: z.string().min(8).max(100),
      role: z.enum(STAFF_ROLES as [StaffRole, ...StaffRole[]]),
    });
    const parsed = schema.parse(req.body);
    const passwordHash = await bcrypt.hash(parsed.password, 12);

    const staffUser = await UserModel.create({
      name: parsed.name,
      email: parsed.email.toLowerCase(),
      phone: parsed.phone,
      passwordHash,
      role: parsed.role,
      emailVerified: true,
      isActive: true,
    });

    await recordAuditLog({
      actorId: req.user!._id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'CREATE_STAFF',
      resourceType: 'User',
      resourceId: String(staffUser._id),
      details: { role: staffUser.role, email: staffUser.email },
      ipAddress: req.ip,
    });

    res.status(201).json({
      staff: {
        id: String(staffUser._id),
        name: staffUser.name,
        email: staffUser.email,
        role: staffUser.role,
        isActive: staffUser.isActive,
      },
    });
  })
);

router.patch(
  '/admin/staff/:staffId',
  requirePermission('staff:manage'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      role: z.enum(STAFF_ROLES as [StaffRole, ...StaffRole[]]).optional(),
      isActive: z.boolean().optional(),
    });
    const parsed = schema.parse(req.body);

    const target = await UserModel.findById(req.params.staffId);
    if (!target) {
      res.status(404).json({ error: 'Staff member not found' });
      return;
    }

    if (String(target._id) === String(req.user!._id) && parsed.isActive === false) {
      res.status(400).json({ error: 'You cannot deactivate your own Super Admin account.' });
      return;
    }

    const losingSuperAdmin =
      target.role === 'super_admin' &&
      target.isActive &&
      ((parsed.role && parsed.role !== 'super_admin') || parsed.isActive === false);
    if (losingSuperAdmin) {
      const otherActiveSuperAdmin = await UserModel.exists({
        _id: { $ne: target._id },
        role: 'super_admin',
        isActive: true,
      });
      if (!otherActiveSuperAdmin) {
        res.status(409).json({
          error: 'At least one active Super Admin account must remain.',
        });
        return;
      }
    }

    const revokingAccess =
      parsed.isActive === false || (parsed.role && parsed.role !== target.role);
    if (parsed.role) target.role = parsed.role;
    if (parsed.isActive !== undefined) target.isActive = parsed.isActive;
    if (revokingAccess) {
      target.tokenVersion = (target.tokenVersion ?? 0) + 1;
    }
    await target.save();

    await recordAuditLog({
      actorId: req.user!._id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'UPDATE_STAFF_PERMISSIONS',
      resourceType: 'User',
      resourceId: String(target._id),
      details: parsed,
      ipAddress: req.ip,
    });

    res.json({
      staff: {
        id: String(target._id),
        name: target.name,
        email: target.email,
        role: target.role,
        isActive: target.isActive,
      },
    });
  })
);

export default router;
