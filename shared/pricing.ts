export interface PricingProductInput {
  basePrice: number;
  salePrice?: number | null;
  flashSalePrice?: number | null;
  flashSaleStart?: Date | string | null;
  flashSaleEnd?: Date | string | null;
  variantPrice?: number | null;
}

export function resolveEffectiveUnitPrice(
  input: PricingProductInput,
  now: Date = new Date()
): {
  unitPrice: number;
  originalPrice: number | null;
  discountPercent: number;
  isFlashSaleActive: boolean;
} {
  const base = Math.max(0, Number(input.variantPrice ?? input.basePrice) || 0);
  const flashStart = input.flashSaleStart ? new Date(input.flashSaleStart) : null;
  const flashEnd = input.flashSaleEnd ? new Date(input.flashSaleEnd) : null;

  const isFlashSaleActive = Boolean(
    input.flashSalePrice !== null &&
      input.flashSalePrice !== undefined &&
      input.flashSalePrice > 0 &&
      input.flashSalePrice < base &&
      (!flashStart || now >= flashStart) &&
      (!flashEnd || now <= flashEnd)
  );

  if (isFlashSaleActive && input.flashSalePrice) {
    const unitPrice = Math.round(input.flashSalePrice);
    const discountPercent = base > 0 ? Math.round(((base - unitPrice) / base) * 100) : 0;
    return {
      unitPrice,
      originalPrice: base,
      discountPercent,
      isFlashSaleActive: true,
    };
  }

  if (input.salePrice !== null && input.salePrice !== undefined && input.salePrice > 0 && input.salePrice < base) {
    const unitPrice = Math.round(input.salePrice);
    const discountPercent = base > 0 ? Math.round(((base - unitPrice) / base) * 100) : 0;
    return {
      unitPrice,
      originalPrice: base,
      discountPercent,
      isFlashSaleActive: false,
    };
  }

  return {
    unitPrice: Math.round(base),
    originalPrice: null,
    discountPercent: 0,
    isFlashSaleActive: false,
  };
}

export interface CouponInput {
  code: string;
  type: 'fixed' | 'percentage';
  value: number;
  maxDiscountCap?: number | null;
  minOrderAmount: number;
  isActive: boolean;
  startsAt?: Date | string | null;
  expiresAt?: Date | string | null;
  usageLimit?: number | null;
  usedCount: number;
  perCustomerLimit?: number | null;
  customerUsedCount?: number;
  eligibleCategoryIds?: string[];
  eligibleProductIds?: string[];
}

export interface CartPricingLine {
  productId: string;
  categoryId: string;
  unitPrice: number;
  quantity: number;
}

export function calculateCouponDiscount(
  coupon: CouponInput,
  lines: CartPricingLine[],
  now: Date = new Date()
): { valid: boolean; discountAmount: number; reason?: string } {
  if (!coupon.isActive) {
    return { valid: false, discountAmount: 0, reason: 'Coupon is inactive.' };
  }
  if (coupon.startsAt && now < new Date(coupon.startsAt)) {
    return { valid: false, discountAmount: 0, reason: 'Coupon is not active yet.' };
  }
  if (coupon.expiresAt && now > new Date(coupon.expiresAt)) {
    return { valid: false, discountAmount: 0, reason: 'Coupon has expired.' };
  }
  if (coupon.usageLimit !== null && coupon.usageLimit !== undefined && coupon.usedCount >= coupon.usageLimit) {
    return { valid: false, discountAmount: 0, reason: 'Coupon usage limit reached.' };
  }
  if (
    coupon.perCustomerLimit !== null &&
    coupon.perCustomerLimit !== undefined &&
    (coupon.customerUsedCount ?? 0) >= coupon.perCustomerLimit
  ) {
    return { valid: false, discountAmount: 0, reason: 'You have already reached the usage limit for this coupon.' };
  }

  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  if (subtotal < coupon.minOrderAmount) {
    return {
      valid: false,
      discountAmount: 0,
      reason: `Minimum order amount of ৳${coupon.minOrderAmount.toLocaleString()} required.`,
    };
  }

  const hasProductScope = Boolean(coupon.eligibleProductIds && coupon.eligibleProductIds.length > 0);
  const hasCategoryScope = Boolean(coupon.eligibleCategoryIds && coupon.eligibleCategoryIds.length > 0);

  const eligibleSubtotal = lines
    .filter((line) => {
      if (!hasProductScope && !hasCategoryScope) return true;
      const matchProduct = hasProductScope && coupon.eligibleProductIds!.includes(line.productId);
      const matchCategory = hasCategoryScope && coupon.eligibleCategoryIds!.includes(line.categoryId);
      return matchProduct || matchCategory;
    })
    .reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  if (eligibleSubtotal <= 0) {
    return { valid: false, discountAmount: 0, reason: 'No items in your cart are eligible for this coupon.' };
  }

  let discount =
    coupon.type === 'fixed'
      ? coupon.value
      : Math.round((eligibleSubtotal * coupon.value) / 100);

  if (coupon.maxDiscountCap !== null && coupon.maxDiscountCap !== undefined && coupon.maxDiscountCap > 0) {
    discount = Math.min(discount, coupon.maxDiscountCap);
  }

  discount = Math.max(0, Math.min(discount, subtotal));

  return {
    valid: true,
    discountAmount: Math.round(discount),
  };
}

export interface ShippingConfig {
  dhakaMetroCharge: number;
  dhakaSuburbCharge: number;
  outsideDhakaCharge: number;
  freeShippingThreshold: number;
  expressSurcharge: number;
}

export const DEFAULT_SHIPPING_CONFIG: ShippingConfig = {
  dhakaMetroCharge: 60,
  dhakaSuburbCharge: 90,
  outsideDhakaCharge: 130,
  freeShippingThreshold: 999,
  expressSurcharge: 80,
};

export function calculateShippingCharge(
  subtotalAfterDiscount: number,
  zone: 'dhaka_metro' | 'dhaka_suburb' | 'outside_dhaka',
  method: 'standard' | 'express',
  config: ShippingConfig = DEFAULT_SHIPPING_CONFIG
): number {
  const baseRate =
    zone === 'dhaka_metro'
      ? config.dhakaMetroCharge
      : zone === 'dhaka_suburb'
      ? config.dhakaSuburbCharge
      : config.outsideDhakaCharge;

  if (method === 'standard' && subtotalAfterDiscount >= config.freeShippingThreshold) {
    return 0;
  }

  return method === 'express' ? baseRate + config.expressSurcharge : baseRate;
}

export function calculateTaxAmount(
  taxableAmount: number,
  taxRatePercent: number = 0
): number {
  const safeBase = Math.max(0, Number(taxableAmount) || 0);
  const safeRate = Math.max(0, Math.min(30, Number(taxRatePercent) || 0));
  if (safeRate === 0 || safeBase === 0) return 0;
  return Math.round((safeBase * safeRate) / 100);
}

