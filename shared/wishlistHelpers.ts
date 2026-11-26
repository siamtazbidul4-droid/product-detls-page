export interface WishlistSlideScheduleInput {
  isActive: boolean;
  displayOrder: number;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
}

export function mergeWishlistIds(
  existingIds: string[],
  incomingIds: string[],
  maxItems = 100
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const raw of [...existingIds, ...incomingIds]) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
    if (merged.length >= maxItems) break;
  }

  return merged;
}

export function computeMembershipTier(stats: {
  deliveredOrdersCount: number;
  totalDeliveredSpend: number;
  emailVerified: boolean;
}): 'Gold Member' | 'Premium Member' | 'Verified Member' | 'Member' {
  if (stats.totalDeliveredSpend >= 50000 || stats.deliveredOrdersCount >= 8) {
    return 'Gold Member';
  }
  if (stats.totalDeliveredSpend >= 15000 || stats.deliveredOrdersCount >= 3) {
    return 'Premium Member';
  }
  if (stats.emailVerified) {
    return 'Verified Member';
  }
  return 'Member';
}

export function filterActiveWishlistSlides<T extends WishlistSlideScheduleInput>(
  slides: T[],
  now: Date = new Date()
): T[] {
  return slides
    .filter((slide) => {
      if (!slide.isActive) return false;
      if (slide.startsAt) {
        const start = new Date(slide.startsAt);
        if (!Number.isNaN(start.getTime()) && now < start) return false;
      }
      if (slide.endsAt) {
        const end = new Date(slide.endsAt);
        if (!Number.isNaN(end.getTime()) && now > end) return false;
      }
      return true;
    })
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export function requiresVariantSelection(product: {
  variants?: Array<{ isActive?: boolean }>;
}): boolean {
  if (!Array.isArray(product.variants)) return false;
  return product.variants.some((v) => v.isActive !== false);
}

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function validateImageUploadMeta(input: {
  mimeType: string;
  sizeBytes: number;
  maxBytes?: number;
}): { valid: boolean; error?: string } {
  const maxBytes = input.maxBytes ?? 6 * 1024 * 1024;
  if (!ALLOWED_IMAGE_MIME_TYPES.has(input.mimeType.toLowerCase())) {
    return {
      valid: false,
      error: 'Unsupported image type. Please upload a JPEG, PNG, WebP, or GIF image.',
    };
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { valid: false, error: 'Image file is empty.' };
  }
  if (input.sizeBytes > maxBytes) {
    const maxMb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
    return {
      valid: false,
      error: `Image file exceeds maximum allowed size of ${maxMb} MB.`,
    };
  }
  return { valid: true };
}

export function calculateAvailableProductStock(product: {
  stockOnHand?: number;
  reservedStock?: number;
  variants?: Array<{ isActive?: boolean; stockOnHand?: number; reservedStock?: number }>;
}): number {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length > 0) {
    const activeVariants = variants.filter((v) => v.isActive !== false);
    return activeVariants.reduce(
      (sum, v) => sum + Math.max(0, Number(v.stockOnHand || 0) - Number(v.reservedStock || 0)),
      0
    );
  }
  return Math.max(0, Number(product.stockOnHand || 0) - Number(product.reservedStock || 0));
}

export function hasValidScheduleWindow(
  startsAt?: Date | string | null,
  endsAt?: Date | string | null
): boolean {
  if (!startsAt || !endsAt) return true;
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return start.getTime() <= end.getTime();
}

export function filterEligibleCustomerCoupons<
  T extends {
    _id?: unknown;
    usageLimit?: number | null;
    usedCount?: number;
    perCustomerLimit?: number | null;
  },
>(coupons: T[], userRedemptionCounts: Record<string, number>): T[] {
  return coupons.filter((coupon) => {
    if (
      coupon.usageLimit !== null &&
      coupon.usageLimit !== undefined &&
      (coupon.usedCount ?? 0) >= coupon.usageLimit
    ) {
      return false;
    }
    if (coupon.perCustomerLimit !== null && coupon.perCustomerLimit !== undefined) {
      const usedByUser = userRedemptionCounts[String(coupon._id)] ?? 0;
      if (usedByUser >= coupon.perCustomerLimit) {
        return false;
      }
    }
    return true;
  });
}
