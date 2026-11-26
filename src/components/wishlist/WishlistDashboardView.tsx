import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Heart, RefreshCw, ShoppingBag, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { sanitizeHref } from '../../../shared/security.ts';
import { useAppDispatch, useAppSelector } from '../../app/hooks.ts';
import { updateUserState } from '../../features/auth/authSlice.ts';
import { pushToast } from '../../features/toast/toastSlice.ts';
import {
  clearGuestWishlist,
  removeGuestWishlistItem,
} from '../../features/wishlist/wishlistSlice.ts';
import { ApiError, apiRequest } from '../../lib/api.ts';
import type {
  Product,
  PromotionalPlacement,
  WishlistHeroSlide,
  WishlistSliderSettings,
} from '../../types/domain.ts';
import { CustomerDashboardSidebar } from '../account/CustomerDashboardSidebar.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { SafeImage } from '../ui/SafeImage.tsx';
import { SeoHead } from '../ui/SeoHead.tsx';
import { ProductQuickViewModal } from './ProductQuickViewModal.tsx';
import { WishlistHeroSlideshow } from './WishlistHeroSlideshow.tsx';
import { WishlistProductCard } from './WishlistProductCard.tsx';

const FALLBACK_WISHLIST_SLIDES: WishlistHeroSlide[] = [
  {
    _id: 'fallback-slide-1',
    title: 'My Wishlist',
    subtitle: 'Your favorite products, all in one place.',
    ctaText: 'Explore Deals',
    ctaDestination: '/shop?onSale=true',
    desktopImageUrl: '/src/assets/images/hero_shopper_bags_1795621229978.jpg',
    mobileImageUrl: '/src/assets/images/hero_shopper_bags_1795621229978.jpg',
    altText: 'My Wishlist banner',
    displayOrder: 0,
    isActive: true,
  },
  {
    _id: 'fallback-slide-2',
    title: 'Curated Savings Across Bangladesh',
    subtitle: 'Track flash discounts on electronics, fashion, and everyday essentials.',
    ctaText: 'Shop Flash Deals',
    ctaDestination: '/shop?tab=on_sale',
    desktopImageUrl: '/src/assets/images/promo_fashion_bundle_1795621230765.jpg',
    mobileImageUrl: '/src/assets/images/promo_fashion_bundle_1795621230765.jpg',
    altText: 'Seasonal wishlist savings',
    displayOrder: 1,
    isActive: true,
  },
];

const FALLBACK_BOTTOM_PROMO: PromotionalPlacement = {
  _id: 'fallback-bottom-promo',
  title: "Don't Miss Out!",
  subtitle: 'Explore more amazing products and exclusive deals.',
  ctaText: 'Continue Shopping',
  destinationUrl: '/shop',
  altText: 'Continue shopping on NOVARA COMMERCE',
  imageUrl: '/src/assets/images/promo_electronics_bundle_1795621230553.jpg',
  placementSlot: 'wishlist_bottom_banner',
  layoutStyle: 'soft_sage_banner',
  isEnabled: true,
  status: 'published',
};

export function WishlistDashboardView() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const guestWishlistIds = useAppSelector((s) => s.wishlist.guestIds);

  const [slides, setSlides] = useState<WishlistHeroSlide[]>([]);
  const [sliderSettings, setSliderSettings] = useState<WishlistSliderSettings>({
    autoplay: true,
    transitionDurationMs: 5000,
  });
  const [slidesLoading, setSlidesLoading] = useState(true);
  const [bottomPromo, setBottomPromo] = useState<PromotionalPlacement | null>(null);
  const [sidebarPromo, setSidebarPromo] = useState<PromotionalPlacement | null>(null);

  const [items, setItems] = useState<Product[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);

  const loadWishlistCms = useCallback(async () => {
    setSlidesLoading(true);
    try {
      const res = await apiRequest<{
        slides: WishlistHeroSlide[];
        sliderSettings: WishlistSliderSettings;
        bottomPromo: PromotionalPlacement | null;
        sidebarPromo: PromotionalPlacement | null;
      }>('/api/cms/public/wishlist-page');
      setSlides(res.slides || []);
      if (res.sliderSettings) setSliderSettings(res.sliderSettings);
      setBottomPromo(res.bottomPromo || null);
      setSidebarPromo(res.sidebarPromo || null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setSlides(FALLBACK_WISHLIST_SLIDES);
        setBottomPromo(FALLBACK_BOTTOM_PROMO);
      }
    } finally {
      setSlidesLoading(false);
    }
  }, []);

  const loadWishlistItems = useCallback(async () => {
    setLoadingItems(true);
    setLoadError(null);
    try {
      if (user) {
        const res = await apiRequest<{ items: Product[]; wishlist: string[] }>(
          '/api/users/wishlist'
        );
        setItems(res.items || []);
        if (
          Array.isArray(res.wishlist) &&
          JSON.stringify(res.wishlist) !== JSON.stringify(user.wishlist || [])
        ) {
          dispatch(updateUserState({ ...user, wishlist: res.wishlist }));
        }
      } else {
        if (guestWishlistIds.length === 0) {
          setItems([]);
        } else {
          const res = await apiRequest<{ products: Product[] }>('/api/catalog/products/by-ids', {
            method: 'POST',
            body: JSON.stringify({ ids: guestWishlistIds }),
          });
          setItems(res.products || []);
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setLoadError('Live product catalog is currently unavailable while database configuration is pending.');
      } else {
        setLoadError(err instanceof Error ? err.message : 'Unable to load your wishlist.');
      }
    } finally {
      setLoadingItems(false);
    }
  }, [user, guestWishlistIds, dispatch]);

  useEffect(() => {
    void loadWishlistCms();
  }, [loadWishlistCms]);

  useEffect(() => {
    void loadWishlistItems();
  }, [loadWishlistItems]);

  const handleRemoveItem = async (productId: string) => {
    const previousItems = items;
    setItems((prev) => prev.filter((item) => item._id !== productId));

    if (!user) {
      dispatch(removeGuestWishlistItem(productId));
      dispatch(pushToast({ variant: 'info', message: 'Removed from your wishlist.' }));
      return;
    }

    const previousWishlist = user.wishlist || [];
    dispatch(
      updateUserState({
        ...user,
        wishlist: previousWishlist.filter((id) => id !== productId),
      })
    );

    try {
      const res = await apiRequest<{ wishlist: string[] }>(
        `/api/users/wishlist/${encodeURIComponent(productId)}`,
        { method: 'DELETE' }
      );
      dispatch(updateUserState({ ...user, wishlist: res.wishlist }));
      dispatch(pushToast({ variant: 'info', message: 'Removed from your wishlist.' }));
    } catch (err) {
      // Rollback optimistic removal on failure
      setItems(previousItems);
      dispatch(updateUserState({ ...user, wishlist: previousWishlist }));
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Unable to remove wishlist item.',
        })
      );
    }
  };

  const handleClearWishlist = async () => {
    setClearing(true);
    const previousItems = items;
    if (!user) {
      setItems([]);
      dispatch(clearGuestWishlist());
      setClearConfirmOpen(false);
      setClearing(false);
      dispatch(pushToast({ variant: 'info', message: 'Wishlist cleared.' }));
      return;
    }

    const previousWishlist = user.wishlist || [];
    try {
      await apiRequest('/api/users/wishlist', { method: 'DELETE' });
      setItems([]);
      dispatch(updateUserState({ ...user, wishlist: [] }));
      setClearConfirmOpen(false);
      dispatch(pushToast({ variant: 'info', message: 'Your wishlist has been cleared.' }));
    } catch (err) {
      setItems(previousItems);
      dispatch(updateUserState({ ...user, wishlist: previousWishlist }));
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Failed to clear wishlist.',
        })
      );
    } finally {
      setClearing(false);
    }
  };

  const handleQuickView = (product: Product, promptVariant?: boolean) => {
    setQuickViewProduct(product);
    if (promptVariant) {
      dispatch(
        pushToast({
          variant: 'info',
          message: 'Please select an option before adding to cart.',
        })
      );
    }
  };

  const wishlistCount = items.length;
  const bottomPromoHref = sanitizeHref(bottomPromo?.destinationUrl);

  return (
    <div className="bg-[#F3F8F4] min-h-screen pb-12">
      <SeoHead
        title="My Wishlist – NOVARA COMMERCE"
        description="View and manage your saved favorite products on NOVARA COMMERCE."
      />

      {/* Full-Width Dynamic Wishlist Hero Slideshow */}
      <WishlistHeroSlideshow
        slides={slides}
        settings={sliderSettings}
        loading={slidesLoading}
      />

      {/* Main Dashboard Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-7">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Left Customer Dashboard Sidebar */}
          <CustomerDashboardSidebar
            activeTab="wishlist"
            wishlistCount={wishlistCount}
            sidebarPromo={sidebarPromo}
          />

          {/* Main Wishlist Content Area */}
          <div className="flex-1 min-w-0 w-full space-y-6">
            {/* Wishlist Header Row */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-white border border-[#DCE8DF] flex items-center justify-center text-[#0F2A1A] shadow-2xs shrink-0 mt-0.5">
                  <Heart className="w-5 h-5 fill-[#0F2A1A] text-[#0F2A1A]" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-[#0F2A1A] leading-tight">
                    My Wishlist
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                    {loadingItems
                      ? 'Loading saved items...'
                      : wishlistCount === 1
                      ? 'You have 1 item in your wishlist'
                      : `You have ${wishlistCount} items in your wishlist`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setClearConfirmOpen(true)}
                disabled={loadingItems || wishlistCount === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 hover:border-red-200 hover:bg-red-50 hover:text-red-700 text-slate-700 text-xs font-semibold shadow-2xs transition-colors disabled:opacity-45 disabled:pointer-events-none"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Wishlist</span>
              </button>
            </div>

            {/* Error State */}
            {loadError ? (
              <div className="bg-white border border-amber-200 rounded-2xl p-8 text-center space-y-3 shadow-xs">
                <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
                <p className="text-sm font-bold text-slate-900">Unable to load wishlist items</p>
                <p className="text-xs text-slate-600 max-w-md mx-auto">{loadError}</p>
                <div className="pt-2 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => void loadWishlistItems()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                  </button>
                  <Link
                    to="/shop"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#15803D] hover:bg-[#14532D] text-white text-xs font-semibold"
                  >
                    <span>Continue Shopping</span>
                  </Link>
                </div>
              </div>
            ) : loadingItems ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-[310px] rounded-2xl bg-white border border-[#DCE8DF] p-3.5 animate-pulse space-y-3"
                  >
                    <div className="aspect-[4/3] rounded-xl bg-slate-100" />
                    <div className="h-4 bg-slate-100 rounded w-3/4" />
                    <div className="h-4 bg-slate-100 rounded w-1/3" />
                    <div className="h-9 bg-slate-100 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : wishlistCount === 0 ? (
              /* Clean Empty State */
              <div className="bg-white border border-[#DCE8DF] rounded-2xl p-10 sm:p-14 text-center space-y-3 shadow-xs">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-[#EAF7EE] text-[#15803D] flex items-center justify-center">
                  <Heart className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-extrabold text-slate-900">Your wishlist is empty</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Save items you love while browsing NOVARA COMMERCE to track deals, restocks, and
                  move them to your cart anytime.
                </p>
                <div className="pt-2">
                  <Link
                    to="/shop"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#14532D] text-white text-sm font-semibold shadow-sm transition-colors"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>Continue Shopping</span>
                  </Link>
                </div>
              </div>
            ) : (
              /* 4-Column Responsive Wishlist Product Grid */
              <div
                data-testid="wishlist-product-grid"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              >
                {items.map((product) => (
                  <WishlistProductCard
                    key={product._id}
                    product={product}
                    onRemove={handleRemoveItem}
                    onQuickView={handleQuickView}
                  />
                ))}
              </div>
            )}

            {/* Dynamic Bottom Promotional Banner ("Don't Miss Out!") */}
            {bottomPromo && bottomPromoHref && (
              <section
                aria-label="Wishlist promotion"
                className="rounded-2xl bg-gradient-to-r from-[#DCEEE1] via-[#EBF6EE] to-[#E3F2E7] border border-[#CFE4D5] px-5 py-4 sm:px-7 sm:py-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-16 h-14 sm:w-20 sm:h-16 rounded-xl bg-white/80 border border-white overflow-hidden shrink-0 shadow-2xs">
                    <SafeImage
                      src={bottomPromo.imageUrl}
                      alt={bottomPromo.altText || bottomPromo.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-extrabold text-[#0F2A1A]">
                      {bottomPromo.title}
                    </h3>
                    {bottomPromo.subtitle && (
                      <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                        {bottomPromo.subtitle}
                      </p>
                    )}
                  </div>
                </div>

                {bottomPromoHref.startsWith('/') ? (
                  <Link
                    to={bottomPromoHref}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white hover:bg-[#15803D] text-[#0F2A1A] hover:text-white border border-[#C6DEC9] text-xs sm:text-sm font-semibold shadow-xs transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>{bottomPromo.ctaText || 'Continue Shopping'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                ) : (
                  <a
                    href={bottomPromoHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white hover:bg-[#15803D] text-[#0F2A1A] hover:text-white border border-[#C6DEC9] text-xs sm:text-sm font-semibold shadow-xs transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>{bottomPromo.ctaText || 'Continue Shopping'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>
                )}
              </section>
            )}
          </div>
        </div>
      </div>

      {/* Quick View / Variant Picker Modal */}
      <ProductQuickViewModal
        product={quickViewProduct}
        open={Boolean(quickViewProduct)}
        onClose={() => setQuickViewProduct(null)}
        onRemoveFromWishlist={handleRemoveItem}
      />

      {/* Clear Wishlist Confirmation Dialog */}
      <ConfirmDialog
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={handleClearWishlist}
        title="Clear Wishlist"
        message={`Remove all ${wishlistCount} saved item${wishlistCount === 1 ? '' : 's'} from your wishlist?`}
        confirmLabel="Clear All"
        danger
        loading={clearing}
      />
    </div>
  );
}
