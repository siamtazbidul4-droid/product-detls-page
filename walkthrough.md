# Security Summary

This audit reviewed the full NOVARA COMMERCE codebase (frontend storefront, admin dashboard, Express API modules, authentication/OAuth flows, inventory reservation, payment webhooks, CMS settings, and CSV import/export) to verify end-to-end production readiness and close security and transactional integrity defects without changing the visual design or removing features.

## Key Security & Integrity Fixes Implemented

1. **OAuth Login Request Binding, Active-Account Enforcement & Target Origin Restriction** (`server/src/modules/auth/auth.routes.ts`, `src/components/auth/AuthModal.tsx`)
   - Bound the generated `state` value in `/api/auth/oauth/:provider/url` to a signed `HttpOnly`, `Secure`, `SameSite=None` cookie (`novara_oauth_state`) and verified it using constant-time comparison in `/api/auth/oauth/:provider/callback`.
   - Enforced `user.isActive` and Google `verified_email !== false` during OAuth login so disabled accounts cannot re-authenticate via social login.
   - Restricted `window.opener.postMessage` on the server to `new URL(env.appUrl).origin` and restricted the client listener strictly to `event.origin === window.location.origin`.

2. **Authenticated SSLCommerz IPN Verification & Double-Release Prevention** (`server/src/services/payment.service.ts`, `server/src/modules/payments/payments.routes.ts`, `server/src/modules/orders/orders.routes.ts`)
   - Added `verifySslCommerzIpnSignature` (MD5 canonical signature check over `verify_key` + `store_passwd` hash) and required valid gateway signature (matching `store_id` and `verify_sign`) or `x-webhook-secret` before processing `FAILED` / `CANCELLED` IPNs, preventing anonymous callers from cancelling pending orders or releasing stock.
   - Added `shouldReleaseInventoryOnCancel(order.orderStatus)` to prevent cancelling a `payment_failed` order from releasing reserved stock a second time.
   - Updated `/api/payments/admin/refunds` so partial refunds transition the order to `refund_pending` until cumulative refunds reach `order.totalAmount`, allowing subsequent partial refunds to succeed.

3. **Atomic Variant Stock Locking & Negative Stock Guards** (`server/src/modules/inventory/inventory.routes.ts`)
   - Replaced the non-standard `$expr` inside `$elemMatch` and unsafe fallback query with a single `$elemMatch` predicate matching `_id`, `isActive: true`, `stockOnHand`, and `reservedStock` on the same variant array element.
   - Added lower-bound `$gte: item.quantity` checks to `releaseReservedInventory` and `fulfillReservedInventory` so stock and reserved counters cannot go negative.

4. **Draft/Inactive Catalog Access Control** (`server/src/modules/catalog/catalog.routes.ts`)
   - Protected `?includeAll=true`, `?all=true` on categories/brands, and draft product access by slug behind `optionalAuth` + `hasPermission(req.user?.role, 'catalog:read')`, and filtered collection population strictly to `status: 'published'`.

5. **Input Validation, Output Escaping & Origin Hardening** (`shared/security.ts`, `server.ts`, `server/src/middleware/auth.middleware.ts`, `server/src/modules/cms/cms.routes.ts`, `server/src/modules/users/users.routes.ts`, `server/src/modules/support/support.routes.ts`)
   - Escaped dynamic user/product values interpolated into HTML emails (`escapeHtml`), `/sitemap.xml` (`escapeXml`), and Mongo `$regex` search queries (`escapeRegex`).
   - Enforced safe HTTP/HTTPS/relative URL checks (`isSafeDestinationUrl` / `sanitizeHref`) on CMS hero links, dual banner links, and social links both in API validation and frontend components.
   - Neutralized spreadsheet formula prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) in CSV exports and added quoted-comma parsing plus initial `InventoryMovementModel` ledger entries on bulk CSV import.
   - Tightened CORS origin matching against regex patterns for localhost and AI Studio preview hosts, wrapped CSRF `Origin` parsing safely to return `403 CSRF_BLOCKED`, rate-limited `/api/orders/track` with digit-normalized phone matching, prevented deactivating/demoting the last active Super Admin, and deduplicated review abuse reports per user.

6. **Session Token Revocation, Coupon/CMS Hardening & Active-Variant Parity** (`server/src/modules/users/user.model.ts`, `server/src/middleware/auth.middleware.ts`, `server/src/modules/auth/auth.routes.ts`, `server/src/modules/users/users.routes.ts`, `server/src/modules/cms/cms.routes.ts`, `server/src/modules/catalog/catalog.routes.ts`, `server/src/modules/cart/cart.routes.ts`, `server/src/modules/marketing/marketing.routes.ts`, `src/components/account/CustomerCouponsView.tsx`, `src/pages/AccountPage.tsx`)
   - Added persistent `tokenVersion` (`tv` JWT claim) checked on every authenticated request; signing out (with valid CSRF/Origin check), changing passwords, confirming password resets, or deactivating/changing staff roles immediately invalidates prior issued tokens. Changing password rotates and returns a fresh session token so the active session continues uninterrupted.
   - Added explicit `ObjectId` parameter validation and chronological `startsAt <= endsAt` schedule checks across Wishlist Hero Slides, Promotional Placements, and Coupons, plus a one-time `wishlistDefaultsSeeded` flag so deleted default slides/promos do not silently re-seed.
   - Filtered `/api/marketing/my-coupons` against both global `usageLimit` and per-customer `perCustomerLimit`, and fixed `CustomerCouponsView` to read `discountAmount` from coupon redemption records so redemption savings render accurately instead of `৳NaN`.
   - Aligned `catalog.routes.ts`, `cart.routes.ts`, `ProductCard.tsx`, and `ProductDetailPage.tsx` on active-variant stock calculation (`calculateAvailableProductStock` / `v.isActive !== false`), expanded `POST /api/catalog/products/by-ids` to match the 100-item wishlist cap, cleared user-scoped client state on sign-out, and added explicit error/retry states in Customer Dashboard, Orders, Reviews, and Coupons views.

---

## PoC Verification

Because `MONGODB_URI` and third-party gateway/OAuth credentials (`PAYMENT_STORE_*`, `GOOGLE_CLIENT_*`, `FACEBOOK_APP_*`, `RESEND_API_KEY`, `CLOUDINARY_*`) are not configured in this sandbox environment, database-backed and external-provider verification used unit tests, dependency vulnerability scanning, and static type/build checks alongside live HTTP and headless browser verification against port 3000:

1. **Automated Unit Tests (`npx --yes tsx --test shared/domain.test.ts`)** — 18 / 18 passing:
   - Verified `verifySslCommerzIpnSignature` accepts valid MD5-signed SSLCommerz IPN payloads and rejects tampered amounts or missing signatures.
   - Verified `isSafeDestinationUrl` and `sanitizeHref` block `javascript:` and protocol-relative `//` URLs while permitting valid relative and `https://` links.
   - Verified `sanitizeCsvCell` prefixes `=`/`+` formula strings and `parseCsvLine` parses quoted commas accurately.
   - Verified `shouldReleaseInventoryOnCancel` returns `false` for `payment_failed`, `cancelled`, and `refunded` statuses.
   - Verified `mergeWishlistIds`, `computeMembershipTier`, `filterActiveWishlistSlides`, `requiresVariantSelection`, `validateImageUploadMeta`, `calculateAvailableProductStock`, `hasValidScheduleWindow`, and `filterEligibleCustomerCoupons`.
   - Verified `escapeHtml`, `escapeXml`, `escapeRegex`, `normalizePhoneDigits`, pricing, coupon caps, Bangladesh location hierarchy, order state transitions, cross-lingual search expansion, and RBAC checks.

2. **Dependency Audit (`bun audit`)**:
   - Checked 324 locked packages with 0 reported vulnerabilities.

3. **Live HTTP & Browser Checks (`http://localhost:3000`)**:
   - Confirmed CORS preflight/request from `https://evil-localhost.com` receives no `Access-Control-Allow-Origin` header while `http://localhost:3000` is allowed.
   - Confirmed `/robots.txt`, `/sitemap.xml`, `/api/health`, `/api/auth/providers`, `/api/does-not-exist` (JSON `404`), `/api/users/wishlist` (fail-closed `503`), `/api/cms/public/wishlist-page`, `/api/auth/logout`, `/verify-email`, and `/reset-password` respond as expected.
   - Verified rendered Wishlist Dashboard, Customer Account pages, and Admin CMS routes at `1440x900` desktop and `390x844` mobile via headless Chromium with zero JavaScript runtime errors.

