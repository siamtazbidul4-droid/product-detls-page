export interface PublicReviewSource {
  _id: unknown;
  userName?: string;
  userAvatar?: string;
  userId?: unknown;
  rating: number;
  title?: string;
  comment: string;
  verifiedPurchase?: boolean;
  status?: string;
  productId?: unknown;
  createdAt?: Date | string;
}

export interface SafePublicReview {
  _id: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  title?: string;
  comment: string;
  verifiedPurchase: boolean;
  productId: { _id: string; name: string; slug: string } | null;
  createdAt: string;
}

export function selectLatestApprovedReviews(
  reviews: PublicReviewSource[],
  limit = 4
): SafePublicReview[] {
  const safeLimit = Math.max(1, Math.min(12, Math.floor(limit)));
  return reviews
    .filter((r) => r.status === 'approved')
    .sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    })
    .slice(0, safeLimit)
    .map((r) => {
      const populatedUser =
        r.userId && typeof r.userId === 'object'
          ? (r.userId as { name?: string; avatarUrl?: string })
          : null;
      const populatedProduct =
        r.productId && typeof r.productId === 'object'
          ? (r.productId as { _id?: unknown; name?: string; slug?: string })
          : null;

      return {
        _id: String(r._id),
        userName: String(r.userName || populatedUser?.name || 'Verified Customer'),
        userAvatar: r.userAvatar || populatedUser?.avatarUrl || undefined,
        rating: Math.min(5, Math.max(1, Number(r.rating || 5))),
        title: r.title ? String(r.title) : undefined,
        comment: String(r.comment || ''),
        verifiedPurchase: Boolean(r.verifiedPurchase),
        productId:
          populatedProduct && populatedProduct.name && populatedProduct.slug
            ? {
                _id: String(populatedProduct._id || ''),
                name: String(populatedProduct.name),
                slug: String(populatedProduct.slug),
              }
            : null,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date(0).toISOString(),
      };
    });
}

export interface HomepageSectionLike {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
  title?: string;
  subtitle?: string;
  collectionType?: string;
  productLimit?: number;
  categorySlug?: string;
  ctaText?: string;
  ctaLink?: string;
}

export function sortHomepageSections<T extends HomepageSectionLike>(
  configured: T[] | undefined | null,
  defaults: T[]
): T[] {
  const source = configured && configured.length > 0 ? configured : defaults;
  return [...source].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function isActiveOnSaleProduct(
  product: {
    basePrice: number;
    salePrice?: number | null;
    flashSalePrice?: number | null;
    flashSaleStart?: Date | string | null;
    flashSaleEnd?: Date | string | null;
  },
  now: Date = new Date()
): boolean {
  const base = Number(product.basePrice || 0);
  if (base <= 0) return false;

  const hasValidSale =
    product.salePrice !== null &&
    product.salePrice !== undefined &&
    product.salePrice > 0 &&
    product.salePrice < base;

  const flashStart = product.flashSaleStart ? new Date(product.flashSaleStart) : null;
  const flashEnd = product.flashSaleEnd ? new Date(product.flashSaleEnd) : null;
  const hasValidFlash =
    product.flashSalePrice !== null &&
    product.flashSalePrice !== undefined &&
    product.flashSalePrice > 0 &&
    product.flashSalePrice < base &&
    (!flashStart || now >= flashStart) &&
    (!flashEnd || now <= flashEnd);

  return hasValidSale || hasValidFlash;
}

export function sortActivePromoPlacements<
  T extends {
    placementSlot: string;
    isEnabled: boolean;
    status: string;
    displayOrder?: number;
    startsAt?: Date | string | null;
    endsAt?: Date | string | null;
  },
>(promos: T[], slot: string, now: Date = new Date()): T[] {
  return promos
    .filter((p) => {
      if (p.placementSlot !== slot) return false;
      if (!p.isEnabled || p.status !== 'published') return false;
      if (p.startsAt && now < new Date(p.startsAt)) return false;
      if (p.endsAt && now > new Date(p.endsAt)) return false;
      return true;
    })
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
}
