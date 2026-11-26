import type { StaffRole } from '../../shared/rbac.ts';
import type { OrderLifecycleStatus, PaymentState, FulfillmentState } from '../../shared/orderStateMachine.ts';

export interface MediaAsset {
  publicId: string;
  url: string;
  width?: number;
  height?: number;
  format?: string;
  alt?: string;
}

export interface SavedAddress {
  _id: string;
  label: string;
  recipientName: string;
  phone: string;
  divisionCode: string;
  divisionName: string;
  districtCode: string;
  districtName: string;
  upazilaCode: string;
  upazilaName: string;
  areaCode: string;
  areaName: string;
  zone: 'dhaka_metro' | 'dhaka_suburb' | 'outside_dhaka';
  houseAddress: string;
  roadStreet?: string;
  landmark?: string;
  deliveryInstructions?: string;
  isDefault: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  role: StaffRole;
  emailVerified: boolean;
  authProvider: 'local' | 'google' | 'facebook';
  avatarUrl: string;
  avatarPublicId?: string;
  savedAddresses: SavedAddress[];
  wishlist: string[];
  notificationPreferences: {
    orderUpdates: boolean;
    promotions: boolean;
    backInStock: boolean;
  };
  membershipTier?: string;
  ordersCount?: number;
  reviewsCount?: number;
  createdAt?: string;
}

export interface Category {
  _id: string;
  name: string;
  nameBn?: string;
  slug: string;
  description?: string;
  parentId?: string | null;
  image?: MediaAsset;
  displayOrder: number;
  isActive: boolean;
}

export interface Brand {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  logo?: MediaAsset;
  isActive: boolean;
}

export interface ProductVariant {
  _id: string;
  sku: string;
  title: string;
  options: Record<string, string>;
  price?: number | null;
  stockOnHand: number;
  reservedStock: number;
  lowStockThreshold: number;
  image?: MediaAsset;
  isActive: boolean;
}

export interface Product {
  _id: string;
  name: string;
  nameBn?: string;
  slug: string;
  sku: string;
  brandId?: Brand | null;
  categoryId: Category;
  subcategoryId?: Category | null;
  categoryDomain: 'electronics' | 'beauty' | 'books' | 'home_lifestyle' | 'fashion' | 'general';
  shortDescription?: string;
  description: string;
  features: string[];
  attributes: Record<string, string>;
  bilingualKeywords: string[];
  basePrice: number;
  salePrice?: number | null;
  flashSalePrice?: number | null;
  flashSaleStart?: string | null;
  flashSaleEnd?: string | null;
  effectivePrice: number;
  originalPrice: number | null;
  discountPercent: number;
  isFlashSaleActive: boolean;
  stockOnHand: number;
  reservedStock: number;
  availableStock: number;
  lowStockThreshold: number;
  variants: ProductVariant[];
  images: MediaAsset[];
  status: 'draft' | 'published' | 'archived';
  isFeatured: boolean;
  warrantyInfo?: string;
  returnPolicyInfo?: string;
  codEligible: boolean;
  ratingAverage: number;
  ratingCount: number;
  salesCount: number;
  seoTitle?: string;
  seoDescription?: string;
}

export interface CartItem {
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
  categoryId?: string;
  codEligible?: boolean;
  staleWarning?: string;
}

export interface HomepageConfig {
  announcementItems: Array<{ icon: string; text: string }>;
  announcementPhone: string;
  heroSlides: Array<{
    badge: string;
    headlinePrefix: string;
    headlineHighlight: string;
    headlineSuffix: string;
    subtitle: string;
    ctaText: string;
    ctaLink: string;
    imageUrl: string;
    imagePublicId?: string;
    mobileImageUrl?: string;
    mobileImagePublicId?: string;
    displayOrder?: number;
    isActive: boolean;
  }>;
  trustPoints: Array<{ title: string; subtitle: string; icon: string }>;
  dualBanners: Array<{
    eyebrow: string;
    title: string;
    ctaText: string;
    ctaLink: string;
    imageUrl: string;
    theme: 'ice' | 'blush';
  }>;
  sections: Array<{
    id: string;
    label: string;
    enabled: boolean;
    order: number;
    title?: string;
    subtitle?: string;
    collectionType?:
      | 'hero'
      | 'categories'
      | 'dual_banners'
      | 'featured_products'
      | 'best_sellers'
      | 'new_arrivals'
      | 'top_rated'
      | 'on_sale'
      | 'promo_placement'
      | 'category_collection'
      | 'happy_clients'
      | 'newsletter';
    productLimit?: number;
    categorySlug?: string;
    ctaText?: string;
    ctaLink?: string;
  }>;
  status: 'draft' | 'published';
}

export interface PromotionalPlacement {
  _id: string;
  title: string;
  subtitle?: string;
  ctaText?: string;
  destinationUrl: string;
  altText: string;
  imageUrl: string;
  imagePublicId?: string;
  placementSlot:
    | 'homepage_mid_banner'
    | 'homepage_secondary_banner'
    | 'homepage_bottom_banner'
    | 'homepage_triple_banners'
    | 'homepage_sidebar'
    | 'top_strip'
    | 'wishlist_bottom_banner'
    | 'wishlist_sidebar';
  layoutStyle: 'dark_emerald_banner' | 'clean_card' | 'soft_sage_banner';
  displayOrder?: number;
  isEnabled: boolean;
  status: 'draft' | 'published';
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface WishlistSliderSettings {
  autoplay: boolean;
  transitionDurationMs: number;
}

export interface WishlistHeroSlide {
  _id: string;
  title: string;
  subtitle: string;
  ctaText?: string;
  ctaDestination?: string;
  desktopImageUrl: string;
  desktopImagePublicId?: string;
  mobileImageUrl?: string;
  mobileImagePublicId?: string;
  altText: string;
  displayOrder: number;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface CustomerDashboardSummary {
  summary: {
    ordersCount: number;
    deliveredOrdersCount: number;
    totalSpent: number;
    wishlistCount: number;
    addressesCount: number;
    reviewsCount: number;
    membershipTier: string;
  };
  recentOrders: Array<{
    _id: string;
    orderNumber: string;
    orderStatus: string;
    paymentStatus: string;
    totalAmount: number;
    items: Array<{ productName: string; quantity: number }>;
    createdAt: string;
  }>;
}

export interface CustomerCouponData {
  coupons: Array<{
    _id: string;
    code: string;
    description?: string;
    type: 'fixed' | 'percentage';
    value: number;
    maxDiscountCap?: number | null;
    minOrderAmount: number;
    expiresAt?: string | null;
    perCustomerLimit?: number | null;
    usageLimit?: number | null;
    usedCount: number;
  }>;
  redemptions: Array<{
    _id: string;
    code: string;
    discountAmount?: number;
    discountApplied?: number;
    createdAt: string;
    orderId?: { orderNumber?: string; totalAmount?: number } | null;
  }>;
}

export interface StoreSettings {
  storeName: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  businessAddress: string;
  socialLinks: {
    whatsapp?: string;
    messenger?: string;
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
  };
  shipping: {
    dhakaMetroCharge: number;
    dhakaSuburbCharge: number;
    outsideDhakaCharge: number;
    freeShippingThreshold: number;
    expressSurcharge: number;
  };
  taxRate: number;
  policies: {
    returnPolicy: string;
    shippingPolicy: string;
    privacyPolicy: string;
    termsAndConditions: string;
    aboutUs: string;
  };
  seoDefaults: {
    titleSuffix: string;
    defaultDescription: string;
  };
  adsense: {
    enabled: boolean;
    publisherId?: string;
    adSlotId?: string;
  };
}

export interface OrderRecord {
  _id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerGender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  items: Array<{
    productId: string;
    variantId?: string | null;
    sku: string;
    productName: string;
    variantTitle?: string;
    selectedOptions?: Record<string, string>;
    imageUrl?: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  shippingAddress: SavedAddress;
  deliveryMethod: 'standard' | 'express';
  paymentMethod: 'cod' | 'sslcommerz';
  paymentChannel?: 'cod' | 'card' | 'bkash' | 'nagad';
  transactionRef?: string;
  termsAccepted?: boolean;
  termsAcceptedAt?: string;
  policyVersion?: string;
  orderStatus: OrderLifecycleStatus;
  paymentStatus: PaymentState;
  fulfillmentStatus: FulfillmentState;
  subtotal: number;
  discountAmount: number;
  couponCode?: string | null;
  shippingCharge: number;
  taxAmount: number;
  totalAmount: number;
  trackingNumber?: string;
  courierName?: string;
  customerNote?: string;
  staffNotes?: Array<{ note: string; actorName: string; createdAt: string }>;
  statusHistory: Array<{
    status: OrderLifecycleStatus;
    paymentStatus?: PaymentState;
    fulfillmentStatus?: FulfillmentState;
    note?: string;
    createdAt: string;
  }>;
  createdAt: string;
}

export interface CheckoutBannerConfig {
  enabled: boolean;
  badgeText: string;
  heading: string;
  subtitle: string;
  desktopImageUrl?: string;
  desktopImagePublicId?: string;
  mobileImageUrl?: string;
  mobileImagePublicId?: string;
  altText?: string;
}

export interface AdminNotificationItem {
  _id: string;
  type: 'new_order' | 'payment_verified' | 'return_requested';
  title: string;
  message: string;
  orderNumber: string;
  orderId: string;
  isRead: boolean;
  createdAt: string;
}

export interface ReviewItem {
  _id: string;
  productId: string | { _id: string; name: string; slug: string; sku?: string } | null;
  userId?: string | { _id: string };
  userName: string;
  userAvatar?: string;
  rating: number;
  title?: string;
  comment: string;
  verifiedPurchase: boolean;
  status?: 'pending' | 'approved' | 'rejected';
  moderationReason?: string;
  helpfulVoterIds?: string[];
  reports?: Array<{ reason: string; createdAt: string }>;
  createdAt: string;
}
