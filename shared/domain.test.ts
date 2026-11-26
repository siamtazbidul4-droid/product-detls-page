import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  resolveEffectiveUnitPrice,
  calculateCouponDiscount,
  calculateShippingCharge,
  calculateTaxAmount,
} from './pricing';
import {
  canTransitionOrderStatus,
  canCustomerCancelOrder,
  canCustomerRequestReturn,
} from './orderStateMachine';
import { expandCrossLingualTokens } from './crossLingualSearch';
import {
  DEFAULT_BD_LOCATION,
  getDistrictsByDivision,
  getDivisions,
  getUnionsByUpazila,
  getUpazilasByDistrict,
  isValidBangladeshPhone,
  normalizeBangladeshPhone,
  resolveZoneFromLocation,
  validateBangladeshHierarchy,
} from './bangladeshLocations';
import { hasPermission } from './rbac';
import {
  escapeHtml,
  escapeRegex,
  escapeXml,
  isSafeDestinationUrl,
  normalizePhoneDigits,
  parseCsvLine,
  sanitizeCsvCell,
  sanitizeHref,
  shouldReleaseInventoryOnCancel,
} from './security';
import { verifySslCommerzIpnSignature } from '../server/src/services/payment.service.ts';
import {
  calculateAvailableProductStock,
  filterEligibleCustomerCoupons,
  hasValidScheduleWindow,
  mergeWishlistIds,
  computeMembershipTier,
  filterActiveWishlistSlides,
  requiresVariantSelection,
  validateImageUploadMeta,
} from './wishlistHelpers';

test('pricing ignores expired flash sales and falls back to sale/base price', () => {
  const expired = resolveEffectiveUnitPrice(
    {
      basePrice: 10000,
      salePrice: 8500,
      flashSalePrice: 6000,
      flashSaleStart: new Date('2025-01-01T00:00:00Z'),
      flashSaleEnd: new Date('2025-01-02T00:00:00Z'),
    },
    new Date('2026-01-01T00:00:00Z')
  );
  assert.equal(expired.unitPrice, 8500);
  assert.equal(expired.isFlashSaleActive, false);

  const active = resolveEffectiveUnitPrice(
    {
      basePrice: 10000,
      salePrice: 8500,
      flashSalePrice: 6000,
      flashSaleStart: new Date('2026-01-01T00:00:00Z'),
      flashSaleEnd: new Date('2026-01-05T00:00:00Z'),
    },
    new Date('2026-01-03T00:00:00Z')
  );
  assert.equal(active.unitPrice, 6000);
  assert.equal(active.isFlashSaleActive, true);
  assert.equal(active.discountPercent, 40);
});

test('coupon calculation respects max cap, min order, and never produces negative totals', () => {
  const result = calculateCouponDiscount(
    {
      code: 'NOVARA20',
      type: 'percentage',
      value: 20,
      maxDiscountCap: 500,
      minOrderAmount: 1000,
      isActive: true,
      usedCount: 1,
      usageLimit: 100,
    },
    [{ productId: 'p1', categoryId: 'c1', unitPrice: 4000, quantity: 1 }]
  );
  assert.equal(result.valid, true);
  assert.equal(result.discountAmount, 500);

  const belowMin = calculateCouponDiscount(
    {
      code: 'NOVARA20',
      type: 'fixed',
      value: 2000,
      minOrderAmount: 1500,
      isActive: true,
      usedCount: 0,
    },
    [{ productId: 'p1', categoryId: 'c1', unitPrice: 900, quantity: 1 }]
  );
  assert.equal(belowMin.valid, false);
  assert.equal(belowMin.discountAmount, 0);
});

test('shipping rules grant free standard shipping over ৳999 and apply zone rates otherwise', () => {
  assert.equal(calculateShippingCharge(1200, 'dhaka_metro', 'standard'), 0);
  assert.equal(calculateShippingCharge(800, 'dhaka_metro', 'standard'), 60);
  assert.equal(calculateShippingCharge(800, 'outside_dhaka', 'standard'), 130);
  assert.equal(calculateShippingCharge(1500, 'dhaka_metro', 'express'), 140);
});

test('order state machine blocks invalid jumps and enforces 7-day return window', () => {
  assert.equal(canTransitionOrderStatus('pending', 'confirmed'), true);
  assert.equal(canTransitionOrderStatus('pending', 'delivered'), false);
  assert.equal(canTransitionOrderStatus('delivered', 'cancelled'), false);
  assert.equal(canCustomerCancelOrder('confirmed'), true);
  assert.equal(canCustomerCancelOrder('shipped'), false);

  const now = new Date('2026-11-25T12:00:00Z');
  assert.equal(canCustomerRequestReturn('delivered', new Date('2026-11-22T12:00:00Z'), now), true);
  assert.equal(canCustomerRequestReturn('delivered', new Date('2026-11-10T12:00:00Z'), now), false);
});

test('cross-lingual search expands Bangla terms like মোটিভেশনাল বই to motivational books', () => {
  const tokens = expandCrossLingualTokens('মোটিভেশনাল বই');
  assert.equal(tokens.includes('motivational'), true);
  assert.equal(tokens.includes('books'), true);
});

test('Bangladesh location dataset exposes 8 divisions, 64 districts, cascading unions, and rejects mismatches', () => {
  const divisions = getDivisions();
  assert.equal(divisions.length, 8);
  const allDistricts = divisions.flatMap((d) => getDistrictsByDivision(d.code));
  assert.equal(allDistricts.length, 64);

  assert.equal(validateBangladeshHierarchy(DEFAULT_BD_LOCATION).valid, true);
  assert.equal(
    validateBangladeshHierarchy({
      ...DEFAULT_BD_LOCATION,
      divisionCode: '20', // Chattogram division paired with Dhaka district
    }).valid,
    false
  );
  assert.equal(getUpazilasByDistrict(DEFAULT_BD_LOCATION.districtCode).length > 0, true);
  assert.equal(getUnionsByUpazila(DEFAULT_BD_LOCATION.upazilaCode).length > 0, true);
  // Shayestagonj Pourashava graceful fallback
  assert.equal(getUnionsByUpazila('504').length > 0, true);

  assert.equal(resolveZoneFromLocation('26', '492'), 'dhaka_metro');
  assert.equal(resolveZoneFromLocation('33'), 'dhaka_suburb');
  assert.equal(resolveZoneFromLocation('15'), 'outside_dhaka');

  assert.equal(isValidBangladeshPhone('01712345678'), true);
  assert.equal(isValidBangladeshPhone('+880 1812-345678'), true);
  assert.equal(isValidBangladeshPhone('01212345678'), false);
  assert.equal(normalizeBangladeshPhone('1712345678'), '01712345678');

  assert.equal(calculateTaxAmount(1000, 10), 100);
  assert.equal(calculateTaxAmount(1000, 0), 0);
});

test('RBAC restricts inventory manager from staff management and refunds', () => {
  assert.equal(hasPermission('inventory_manager', 'inventory:write'), true);
  assert.equal(hasPermission('inventory_manager', 'staff:manage'), false);
  assert.equal(hasPermission('inventory_manager', 'payments:refund'), false);
  assert.equal(hasPermission('super_admin', 'staff:manage'), true);
});

test('security helpers escape HTML, XML, regex, and block unsafe URL protocols', () => {
  assert.equal(escapeHtml('<script>"alert"</script>'), '&lt;script&gt;&quot;alert&quot;&lt;/script&gt;');
  assert.equal(escapeXml('a&b<c>'), 'a&amp;b&lt;c&gt;');
  assert.equal(escapeRegex('a.*(b)?[c]'), 'a\\.\\*\\(b\\)\\?\\[c\\]');

  assert.equal(isSafeDestinationUrl('/shop?q=1'), true);
  assert.equal(isSafeDestinationUrl('https://novaracommerce.com/shop'), true);
  assert.equal(isSafeDestinationUrl('javascript:alert(1)'), false);
  assert.equal(isSafeDestinationUrl('//evil.example/redirect'), false);
  assert.equal(sanitizeHref('javascript:alert(1)'), undefined);
  assert.equal(sanitizeHref('https://wa.me/8801700000000'), 'https://wa.me/8801700000000');
});

test('CSV helpers neutralize formula prefixes and parse quoted fields with commas', () => {
  assert.equal(sanitizeCsvCell('=cmd|"/c calc"!A0'), `"'=cmd|""/c calc""!A0"`);
  assert.equal(sanitizeCsvCell('+SUM(A1:A2)'), "'+SUM(A1:A2)");
  assert.equal(sanitizeCsvCell('USB-C Hub, 7-in-1'), '"USB-C Hub, 7-in-1"');

  const cols = parseCsvLine('NVR-01,"Phone, Pro Max",phone-pro-max,smartphones,apple,129999,,5,published');
  assert.equal(cols.length, 9);
  assert.equal(cols[1], 'Phone, Pro Max');
  assert.equal(cols[8], 'published');
});

test('phone normalization and cancel inventory release guard prevent double stock release', () => {
  assert.equal(normalizePhoneDigits('+880 1712-345678').endsWith('5678'), true);
  assert.equal(shouldReleaseInventoryOnCancel('pending'), true);
  assert.equal(shouldReleaseInventoryOnCancel('confirmed'), true);
  assert.equal(shouldReleaseInventoryOnCancel('payment_failed'), false);
  assert.equal(shouldReleaseInventoryOnCancel('cancelled'), false);
});

test('SSLCommerz IPN signature verification accepts genuine MD5 signatures and rejects tampered payloads', () => {
  const storePassword = 'test_store_password';
  const passHash = crypto.createHash('md5').update(storePassword).digest('hex');
  const payload = {
    amount: '1500.00',
    store_id: 'novara_test',
    tran_id: 'NVX-001',
    status: 'FAILED',
    verify_key: 'amount,status,store_id,tran_id',
  };
  const canonical = `amount=1500.00&status=FAILED&store_id=novara_test&store_passwd=${passHash}&tran_id=NVX-001`;
  const verifySign = crypto.createHash('md5').update(canonical).digest('hex');

  assert.equal(verifySslCommerzIpnSignature({ ...payload, verify_sign: verifySign }, storePassword), true);
  assert.equal(verifySslCommerzIpnSignature({ ...payload, amount: '1.00', verify_sign: verifySign }, storePassword), false);
  assert.equal(verifySslCommerzIpnSignature(payload, storePassword), false);
});

test('wishlist helpers merge guest IDs without duplicates and respect max cap', () => {
  const merged = mergeWishlistIds(['p1', 'p2', ' '], ['p2', 'p3', 'p4'], 3);
  assert.deepEqual(merged, ['p1', 'p2', 'p3']);
});

test('membership tier derives accurately from real order spend, count, and email verification', () => {
  assert.equal(
    computeMembershipTier({ deliveredOrdersCount: 0, totalDeliveredSpend: 0, emailVerified: false }),
    'Member'
  );
  assert.equal(
    computeMembershipTier({ deliveredOrdersCount: 1, totalDeliveredSpend: 1200, emailVerified: true }),
    'Verified Member'
  );
  assert.equal(
    computeMembershipTier({ deliveredOrdersCount: 3, totalDeliveredSpend: 6000, emailVerified: true }),
    'Premium Member'
  );
  assert.equal(
    computeMembershipTier({ deliveredOrdersCount: 2, totalDeliveredSpend: 55000, emailVerified: true }),
    'Gold Member'
  );
});

test('wishlist hero slideshow filtering excludes disabled/out-of-window slides and sorts by displayOrder', () => {
  const now = new Date('2026-11-25T12:00:00Z');
  const active = filterActiveWishlistSlides(
    [
      { id: 'b', isActive: true, displayOrder: 2, startsAt: '2026-11-20T00:00:00Z', endsAt: '2026-11-30T00:00:00Z' },
      { id: 'disabled', isActive: false, displayOrder: 0 },
      { id: 'future', isActive: true, displayOrder: 1, startsAt: '2026-12-01T00:00:00Z' },
      { id: 'expired', isActive: true, displayOrder: 1, endsAt: '2026-11-24T00:00:00Z' },
      { id: 'a', isActive: true, displayOrder: 1 },
    ],
    now
  );
  assert.deepEqual(
    active.map((s) => s.id),
    ['a', 'b']
  );
});

test('variant selection requirement and image upload metadata validation enforce strict guards', () => {
  assert.equal(requiresVariantSelection({ variants: [] }), false);
  assert.equal(requiresVariantSelection({ variants: [{ isActive: false }] }), false);
  assert.equal(requiresVariantSelection({ variants: [{ isActive: true }] }), true);

  assert.equal(validateImageUploadMeta({ mimeType: 'image/webp', sizeBytes: 1024 * 500 }).valid, true);
  assert.equal(validateImageUploadMeta({ mimeType: 'image/svg+xml', sizeBytes: 1024 }).valid, false);
  assert.equal(validateImageUploadMeta({ mimeType: 'image/png', sizeBytes: 0 }).valid, false);
  assert.equal(
    validateImageUploadMeta({ mimeType: 'image/jpeg', sizeBytes: 5 * 1024 * 1024, maxBytes: 4 * 1024 * 1024 }).valid,
    false
  );
});

test('calculateAvailableProductStock counts only active variants and handles base products', () => {
  assert.equal(
    calculateAvailableProductStock({
      stockOnHand: 20,
      reservedStock: 5,
      variants: [],
    }),
    15
  );
  assert.equal(
    calculateAvailableProductStock({
      stockOnHand: 100,
      reservedStock: 0,
      variants: [
        { isActive: true, stockOnHand: 8, reservedStock: 2 },
        { isActive: false, stockOnHand: 50, reservedStock: 0 },
      ],
    }),
    6
  );
  assert.equal(
    calculateAvailableProductStock({
      stockOnHand: 100,
      reservedStock: 0,
      variants: [{ isActive: false, stockOnHand: 50, reservedStock: 0 }],
    }),
    0
  );
});

test('hasValidScheduleWindow enforces chronological start/end dates and rejects invalid dates', () => {
  assert.equal(hasValidScheduleWindow(null, null), true);
  assert.equal(hasValidScheduleWindow('2026-11-01T00:00:00Z', null), true);
  assert.equal(
    hasValidScheduleWindow('2026-11-01T00:00:00Z', '2026-11-10T00:00:00Z'),
    true
  );
  assert.equal(
    hasValidScheduleWindow('2026-11-10T00:00:00Z', '2026-11-01T00:00:00Z'),
    false
  );
  assert.equal(hasValidScheduleWindow('not-a-date', '2026-11-01T00:00:00Z'), false);
});

test('filterEligibleCustomerCoupons excludes globally exhausted and per-customer capped coupons', () => {
  const coupons = [
    { _id: 'c-active', usageLimit: 10, usedCount: 3, perCustomerLimit: 2 },
    { _id: 'c-global-max', usageLimit: 5, usedCount: 5, perCustomerLimit: 2 },
    { _id: 'c-user-max', usageLimit: 20, usedCount: 1, perCustomerLimit: 1 },
    { _id: 'c-unlimited', usageLimit: null, usedCount: 50, perCustomerLimit: null },
  ];
  const filtered = filterEligibleCustomerCoupons(coupons, {
    'c-active': 1,
    'c-user-max': 1,
  });
  assert.deepEqual(
    filtered.map((c) => c._id),
    ['c-active', 'c-unlimited']
  );
});

import {
  isActiveOnSaleProduct,
  selectLatestApprovedReviews,
  sortActivePromoPlacements,
  sortHomepageSections,
} from './homepageHelpers';

test('selectLatestApprovedReviews returns only the latest 4 approved reviews without private fields', () => {
  const raw = [
    { _id: 'r1', status: 'pending', rating: 5, comment: 'Pending', createdAt: '2026-11-26T10:00:00Z' },
    { _id: 'r2', status: 'rejected', rating: 2, comment: 'Rejected', createdAt: '2026-11-26T09:00:00Z' },
    {
      _id: 'r3',
      status: 'approved',
      rating: 5,
      comment: 'Oldest approved',
      userName: 'Alice',
      userId: { email: 'secret@example.com', avatarUrl: 'https://cdn.example/a.jpg' },
      productId: { _id: 'p1', name: 'Phone', slug: 'phone' },
      createdAt: '2026-11-20T10:00:00Z',
    },
    { _id: 'r4', status: 'approved', rating: 4, comment: 'Apr 2', userName: 'Bob', createdAt: '2026-11-21T10:00:00Z' },
    { _id: 'r5', status: 'approved', rating: 5, comment: 'Apr 3', userName: 'Carol', createdAt: '2026-11-22T10:00:00Z' },
    { _id: 'r6', status: 'approved', rating: 5, comment: 'Apr 4', userName: 'Dan', createdAt: '2026-11-23T10:00:00Z' },
    { _id: 'r7', status: 'approved', rating: 5, comment: 'Newest approved', userName: 'Eve', createdAt: '2026-11-25T10:00:00Z' },
  ];

  const latest = selectLatestApprovedReviews(raw, 4);
  assert.equal(latest.length, 4);
  assert.deepEqual(
    latest.map((r) => r._id),
    ['r7', 'r6', 'r5', 'r4']
  );
  assert.equal((latest[0] as unknown as Record<string, unknown>).email, undefined);

  const withOld = selectLatestApprovedReviews([raw[2]], 4);
  assert.equal(withOld[0].userAvatar, 'https://cdn.example/a.jpg');
  assert.equal((withOld[0] as unknown as Record<string, unknown>).userId, undefined);
});

test('isActiveOnSaleProduct validates salePrice and flash sale window', () => {
  const now = new Date('2026-11-25T12:00:00Z');
  assert.equal(isActiveOnSaleProduct({ basePrice: 1000, salePrice: 850 }, now), true);
  assert.equal(isActiveOnSaleProduct({ basePrice: 1000, salePrice: 1000 }, now), false);
  assert.equal(
    isActiveOnSaleProduct(
      {
        basePrice: 1000,
        flashSalePrice: 700,
        flashSaleStart: '2026-11-20T00:00:00Z',
        flashSaleEnd: '2026-11-24T00:00:00Z',
      },
      now
    ),
    false
  );
  assert.equal(
    isActiveOnSaleProduct(
      {
        basePrice: 1000,
        flashSalePrice: 700,
        flashSaleStart: '2026-11-20T00:00:00Z',
        flashSaleEnd: '2026-11-30T00:00:00Z',
      },
      now
    ),
    true
  );
});

test('sortHomepageSections and sortActivePromoPlacements order items deterministically', () => {
  const sorted = sortHomepageSections(
    [
      { id: 'b', label: 'B', enabled: true, order: 5 },
      { id: 'a', label: 'A', enabled: true, order: 1 },
    ],
    []
  );
  assert.deepEqual(
    sorted.map((s) => s.id),
    ['a', 'b']
  );

  const promos = sortActivePromoPlacements(
    [
      { placementSlot: 'homepage_triple_banners', isEnabled: true, status: 'published', displayOrder: 2 },
      { placementSlot: 'homepage_triple_banners', isEnabled: false, status: 'published', displayOrder: 0 },
      { placementSlot: 'homepage_triple_banners', isEnabled: true, status: 'published', displayOrder: 1 },
      { placementSlot: 'homepage_mid_banner', isEnabled: true, status: 'published', displayOrder: 0 },
    ],
    'homepage_triple_banners'
  );
  assert.deepEqual(
    promos.map((p) => p.displayOrder),
    [1, 2]
  );
});


