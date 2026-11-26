import { useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Flag,
  Heart,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Star,
  ThumbsUp,
  Truck,
  Zap,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  DEFAULT_BD_LOCATION,
  getDistrictsByDivision,
  getDivisions,
  resolveZoneFromLocation,
} from '../../shared/bangladeshLocations.ts';
import { calculateShippingCharge } from '../../shared/pricing.ts';
import { useAppDispatch, useAppSelector } from '../app/hooks.ts';
import { openAuthModal, updateUserState } from '../features/auth/authSlice.ts';
import { addGuestCartItem, addToServerCart, setCartDrawerOpen } from '../features/cart/cartSlice.ts';
import { pushToast } from '../features/toast/toastSlice.ts';
import { toggleGuestWishlistItem } from '../features/wishlist/wishlistSlice.ts';
import { apiRequest, formatBdt } from '../lib/api.ts';
import type { Product, ReviewItem } from '../types/domain.ts';
import { ProductCard } from '../components/ui/ProductCard.tsx';
import { SafeImage } from '../components/ui/SafeImage.tsx';
import { SeoHead } from '../components/ui/SeoHead.tsx';

export function ProductDetailPage() {
  const { slug } = useParams();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const guestWishlistIds = useAppSelector((s) => s.wishlist.guestIds);

  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<'description' | 'specs' | 'shipping' | 'warranty'>('description');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Delivery estimator
  const [estDivisionCode, setEstDivisionCode] = useState(DEFAULT_BD_LOCATION.divisionCode);
  const [estDistrictCode, setEstDistrictCode] = useState(DEFAULT_BD_LOCATION.districtCode);

  // Reviews state
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [averageRating, setAverageRating] = useState(0);
  const [distribution, setDistribution] = useState<Record<number, number>>({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });
  const [reviewSort, setReviewSort] = useState<'newest' | 'highest' | 'lowest'>('newest');
  const [newRating, setNewRating] = useState(5);
  const [newTitle, setNewTitle] = useState('');
  const [newComment, setNewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Back in stock
  const [notifyEmail, setNotifyEmail] = useState(user?.email || '');

  useEffect(() => {
    if (user?.email) {
      setNotifyEmail((prev) => prev || user.email);
    }
  }, [user?.email]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    apiRequest<{ product: Product; relatedProducts: Product[] }>(`/api/catalog/products/${slug}`)
      .then((res) => {
        setProduct(res.product);
        setRelatedProducts(res.relatedProducts || []);
        setSelectedImageIdx(0);
        setQuantity(1);
        const activeVariants = (res.product.variants || []).filter((v) => v.isActive !== false);
        const firstActiveVariant =
          activeVariants.find((v) => v.stockOnHand - v.reservedStock > 0) || activeVariants[0];
        setSelectedVariantId(firstActiveVariant ? firstActiveVariant._id : null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load product.');
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const loadReviews = async (productId: string) => {
    try {
      const res = await apiRequest<{
        reviews: ReviewItem[];
        total: number;
        averageRating: number;
        distribution: Record<number, number>;
      }>(`/api/reviews/product/${productId}?sort=${reviewSort}`);
      setReviews(res.reviews || []);
      setReviewTotal(res.total || 0);
      setAverageRating(res.averageRating || 0);
      setDistribution(res.distribution || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });
    } catch {
      // Ignore transient review load error
    }
  };

  useEffect(() => {
    if (product?._id) {
      void loadReviews(product._id);
    }
  }, [product?._id, reviewSort]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="aspect-square rounded-2xl bg-slate-100 animate-pulse" />
          <div className="space-y-4">
            <div className="h-8 bg-slate-100 rounded w-3/4 animate-pulse" />
            <div className="h-6 bg-slate-100 rounded w-1/3 animate-pulse" />
            <div className="h-32 bg-slate-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Product Not Found</h1>
        <p className="text-sm text-slate-500 mt-2 mb-6">{error || 'This product may have been archived or removed.'}</p>
        <Link to="/shop" className="px-5 py-2.5 rounded-lg bg-[#16A34A] text-white text-sm font-semibold">
          Back to Catalog
        </Link>
      </div>
    );
  }

  const activeVariants = (product.variants || []).filter((v) => v.isActive !== false);
  const activeVariant = activeVariants.find((v) => v._id === selectedVariantId) || null;
  const availableStock = activeVariant
    ? Math.max(0, activeVariant.stockOnHand - activeVariant.reservedStock)
    : product.availableStock;
  const currentPrice = activeVariant?.price ?? product.effectivePrice;
  const galleryImages =
    activeVariant?.image?.url
      ? [activeVariant.image, ...product.images]
      : product.images.length > 0
      ? product.images
      : [];
  const mainImage = galleryImages[selectedImageIdx] || galleryImages[0];
  const isWishlisted = user
    ? Boolean(user.wishlist?.includes(product._id))
    : guestWishlistIds.includes(product._id);

  const divisions = getDivisions();
  const districts = getDistrictsByDivision(estDivisionCode);
  const selectedDistrict = districts.find((d) => d.code === estDistrictCode) || districts[0];
  const estimatedZone = resolveZoneFromLocation(
    selectedDistrict?.code || DEFAULT_BD_LOCATION.districtCode
  );
  const estimatedShipping = calculateShippingCharge(currentPrice * quantity, estimatedZone, 'standard');

  const handleAddOrBuy = async (buyNow: boolean) => {
    if (availableStock <= 0) {
      dispatch(pushToast({ variant: 'warning', message: 'Selected option is currently out of stock.' }));
      return;
    }

    if (user) {
      try {
        await dispatch(
          addToServerCart({
            productId: product._id,
            variantId: activeVariant?._id || null,
            quantity,
          })
        ).unwrap();
        if (buyNow) {
          navigate('/checkout');
        } else {
          dispatch(pushToast({ variant: 'success', message: 'Added to your cart.' }));
          dispatch(setCartDrawerOpen(true));
        }
      } catch (err) {
        dispatch(
          pushToast({
            variant: 'error',
            message: err instanceof Error ? err.message : 'Unable to add item.',
          })
        );
      }
    } else {
      dispatch(
        addGuestCartItem({
          productId: product._id,
          variantId: activeVariant?._id || null,
          slug: product.slug,
          sku: activeVariant?.sku || product.sku,
          name: product.name,
          variantTitle: activeVariant?.title || null,
          selectedOptions: activeVariant?.options || {},
          imageUrl: mainImage?.url || '',
          quantity,
          unitPrice: currentPrice,
          originalPrice: product.originalPrice,
          availableStock,
          categoryId: product.categoryId?._id,
          codEligible: product.codEligible,
        })
      );
      if (buyNow) {
        dispatch(openAuthModal({ mode: 'login', returnTo: '/checkout' }));
        dispatch(
          pushToast({
            variant: 'info',
            message: 'Please sign in or register to complete your purchase.',
          })
        );
      } else {
        dispatch(pushToast({ variant: 'success', message: 'Added to your cart.' }));
        dispatch(setCartDrawerOpen(true));
      }
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      dispatch(openAuthModal({ mode: 'login' }));
      return;
    }
    setSubmittingReview(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          productId: product._id,
          rating: newRating,
          title: newTitle || undefined,
          comment: newComment,
        }),
      });
      dispatch(pushToast({ variant: 'success', message: res.message }));
      setNewTitle('');
      setNewComment('');
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Unable to submit review.',
        })
      );
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleBackInStock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ message: string }>(`/api/catalog/products/${product._id}/back-in-stock`, {
        method: 'POST',
        body: JSON.stringify({ email: notifyEmail }),
      });
      dispatch(pushToast({ variant: 'success', message: res.message }));
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Failed to opt in.',
        })
      );
    }
  };

  const handleToggleWishlist = async () => {
    if (!user) {
      const wasSaved = guestWishlistIds.includes(product._id);
      dispatch(toggleGuestWishlistItem(product._id));
      dispatch(
        pushToast({
          variant: 'success',
          message: wasSaved ? 'Removed from wishlist.' : 'Saved to wishlist.',
        })
      );
      return;
    }
    try {
      const res = await apiRequest<{ added: boolean; wishlist: string[] }>('/api/users/wishlist/toggle', {
        method: 'POST',
        body: JSON.stringify({ productId: product._id }),
      });
      dispatch(updateUserState({ ...user, wishlist: res.wishlist }));
      dispatch(pushToast({ variant: 'success', message: res.added ? 'Saved to wishlist.' : 'Removed from wishlist.' }));
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Unable to update wishlist.',
        })
      );
    }
  };

  const structuredData: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: activeVariant?.sku || product.sku,
    description: product.shortDescription || product.description,
    image: galleryImages.map((g) => g.url),
    offers: {
      '@type': 'Offer',
      priceCurrency: 'BDT',
      price: currentPrice,
      availability: availableStock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };
  if (reviewTotal > 0) {
    structuredData.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: averageRating,
      reviewCount: reviewTotal,
    };
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-12">
      <SeoHead
        title={product.seoTitle || `${product.name} – NOVARA COMMERCE`}
        description={product.seoDescription || product.shortDescription || product.description.slice(0, 155)}
        structuredData={structuredData}
      />

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
        <Link to="/" className="hover:text-emerald-700">Home</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        {product.categoryId && (
          <>
            <Link to={`/category/${product.categoryId.slug}`} className="hover:text-emerald-700">
              {product.categoryId.name}
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
          </>
        )}
        <span className="text-slate-900 font-medium truncate max-w-xs">{product.name}</span>
      </nav>

      {/* Main Gallery + Purchase Module */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Media Gallery */}
        <div className="lg:col-span-6 space-y-3 lg:sticky lg:top-28">
          <div className="group aspect-square rounded-2xl border border-slate-200 bg-white overflow-hidden relative">
            <SafeImage
              src={mainImage?.url}
              alt={mainImage?.alt || product.name}
              loading="eager"
              className="w-full h-full object-contain p-6 transition-transform duration-300 group-hover:scale-110"
            />
          </div>
          {galleryImages.length > 1 && (
            <div className="flex items-center gap-3 overflow-x-auto pb-1">
              {galleryImages.map((img, idx) => (
                <button
                  key={`${img.publicId}-${idx}`}
                  type="button"
                  onClick={() => setSelectedImageIdx(idx)}
                  aria-label={`View image ${idx + 1}`}
                  className={`w-20 h-20 rounded-xl border bg-white overflow-hidden shrink-0 ${
                    selectedImageIdx === idx ? 'border-emerald-600 ring-2 ring-emerald-600/20' : 'border-slate-200'
                  }`}
                >
                  <SafeImage src={img.url} alt={img.alt || product.name} className="w-full h-full object-contain p-1.5" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Purchase Panel */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-4 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                {product.brandId && <span className="font-semibold text-emerald-700">{product.brandId.name}</span>}
                <span>·</span>
                <span className="font-mono">SKU: {activeVariant?.sku || product.sku}</span>
              </div>
              <span
                className={`font-semibold ${
                  availableStock > 0 ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                {availableStock > 0 ? `In Stock (${availableStock} available)` : 'Out of Stock'}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
              {product.name}
            </h1>

            {/* Authentic Rating Summary */}
            <div className="flex items-center gap-3 text-xs">
              {reviewTotal > 0 ? (
                <a href="#reviews" className="flex items-center gap-1.5 hover:underline">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span className="font-bold text-slate-900 tabular-nums">{averageRating.toFixed(1)}</span>
                  <span className="text-slate-500 tabular-nums">({reviewTotal} verified reviews)</span>
                </a>
              ) : (
                <span className="text-slate-500">No customer reviews yet</span>
              )}
            </div>

            {/* Pricing */}
            <div className="flex items-baseline gap-3 pb-4 border-b border-slate-100">
              <span className="text-3xl font-extrabold text-emerald-600 tabular-nums">
                {formatBdt(currentPrice)}
              </span>
              {product.originalPrice && product.originalPrice > currentPrice && (
                <>
                  <span className="text-lg text-slate-400 line-through tabular-nums">
                    {formatBdt(product.originalPrice)}
                  </span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    Save {product.discountPercent}%
                  </span>
                </>
              )}
            </div>

            {/* Variants */}
            {activeVariants.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-700">Select Option</p>
                <div className="flex flex-wrap gap-2">
                  {activeVariants.map((variant) => {
                    const vAvail = variant.stockOnHand - variant.reservedStock;
                    const active = variant._id === selectedVariantId;
                    return (
                      <button
                        key={variant._id}
                        type="button"
                        onClick={() => {
                          setSelectedVariantId(variant._id);
                          setSelectedImageIdx(0);
                          setQuantity(1);
                        }}
                        className={`px-3.5 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                          active
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        } ${vAvail <= 0 ? 'opacity-50' : ''}`}
                      >
                        {variant.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity & Action Buttons */}
            {availableStock > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold text-slate-700">Quantity</span>
                  <div className="inline-flex items-center border border-slate-200 rounded-lg bg-slate-50">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="p-2.5 text-slate-700 hover:bg-slate-200/60"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="px-4 text-sm font-bold tabular-nums">{quantity}</span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => setQuantity((q) => Math.min(availableStock, q + 1))}
                      className="p-2.5 text-slate-700 hover:bg-slate-200/60"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => void handleAddOrBuy(false)}
                    className="py-3 px-5 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    <span>Add to Cart</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAddOrBuy(true)}
                    className="py-3 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Zap className="w-4 h-4 text-lime-400" />
                    <span>Buy Now</span>
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleBackInStock} className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2.5">
                <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <Bell className="w-4 h-4" />
                  <span>Notify me when back in stock</span>
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    value={notifyEmail}
                    onChange={(e) => setNotifyEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="flex-1 px-3 py-2 rounded-lg border border-amber-300 bg-white text-xs"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                  >
                    Notify Me
                  </button>
                </div>
              </form>
            )}

            <button
              type="button"
              onClick={handleToggleWishlist}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-red-600"
            >
              <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-red-500 text-red-500' : ''}`} />
              <span>{isWishlisted ? 'Saved in Wishlist' : 'Add to Wishlist'}</span>
            </button>
          </div>

          {/* Delivery Estimator & Trust Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Truck className="w-4 h-4 text-emerald-600" />
              <span>Bangladesh Delivery & Policies</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                aria-label="Delivery Division"
                value={estDivisionCode}
                onChange={(e) => {
                  const nextDivCode = e.target.value;
                  const nextDistricts = getDistrictsByDivision(nextDivCode);
                  setEstDivisionCode(nextDivCode);
                  if (nextDistricts[0]) setEstDistrictCode(nextDistricts[0].code);
                }}
                className="px-3 py-2 rounded-lg border border-slate-200 text-xs bg-slate-50"
              >
                {divisions.map((d) => (
                  <option key={d.code} value={d.code}>{d.name} Division</option>
                ))}
              </select>
              <select
                aria-label="Delivery District"
                value={selectedDistrict?.code || ''}
                onChange={(e) => setEstDistrictCode(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-xs bg-slate-50"
              >
                {districts.map((dist) => (
                  <option key={dist.code} value={dist.code}>{dist.name} District</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600 pt-1">
              <div className="p-3 rounded-lg bg-slate-50">
                <p className="font-semibold text-slate-900">
                  {estimatedShipping === 0 ? 'Free Shipping' : `Standard: ${formatBdt(estimatedShipping)}`}
                </p>
                <p className="text-[11px] mt-0.5">
                  Est. {estimatedZone === 'dhaka_metro' ? '1–2 business days' : '2–5 business days'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-900">
                    {product.codEligible ? 'Cash on Delivery' : 'Prepaid Only'}
                  </p>
                  <p className="text-[11px] mt-0.5">{product.warrantyInfo || 'Authentic Product'}</p>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 flex items-start gap-2">
                <RotateCcw className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-900">7 Days Return</p>
                  <p className="text-[11px] mt-0.5">
                    <Link to="/policies/return" className="text-emerald-700 hover:underline">
                      View policy
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Structured Product Information Tabs */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {(
            [
              ['description', 'Description & Features'],
              ['specs', 'Specifications'],
              ['warranty', 'Warranty & Care'],
              ['shipping', 'Shipping & Returns'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`px-6 py-3.5 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-6 text-sm text-slate-700 leading-relaxed">
          {activeTab === 'description' && (
            <div className="space-y-4">
              <p className="whitespace-pre-line">{product.description}</p>
              {product.features && product.features.length > 0 && (
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Key Highlights</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    {product.features.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {activeTab === 'specs' && (
            <div className="divide-y divide-slate-100 max-w-2xl">
              {Object.entries(product.attributes || {}).length === 0 ? (
                <p className="text-slate-500">Standard manufacturer specifications apply.</p>
              ) : (
                Object.entries(product.attributes).map(([k, v]) => (
                  <div key={k} className="py-2.5 grid grid-cols-3 gap-4">
                    <span className="font-semibold text-slate-900">{k}</span>
                    <span className="col-span-2 text-slate-600">{v}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'warranty' && (
            <p>{product.warrantyInfo || 'Covered under official NOVARA COMMERCE authenticity guarantee.'}</p>
          )}

          {activeTab === 'shipping' && (
            <p>
              {product.returnPolicyInfo ||
                'Free standard delivery on orders over ৳999 across Bangladesh. Eligible unused items may be returned within 7 days of delivery.'}
            </p>
          )}
        </div>
      </section>

      {/* Reviews & Rating Distribution */}
      <section id="reviews" className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Customer Reviews</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Verified-purchase badge is granted only from delivered order records.
            </p>
          </div>
          <select
            aria-label="Sort reviews"
            value={reviewSort}
            onChange={(e) => setReviewSort(e.target.value as 'newest' | 'highest' | 'lowest')}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold"
          >
            <option value="newest">Most Recent</option>
            <option value="highest">Highest Rated</option>
            <option value="lowest">Lowest Rated</option>
          </select>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Histogram + Write Review */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex items-center gap-4">
                <div className="text-4xl font-extrabold text-slate-900 tabular-nums">
                  {reviewTotal > 0 ? averageRating.toFixed(1) : '—'}
                </div>
                <div>
                  <div className="flex items-center gap-0.5 text-amber-400">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${
                          i < Math.round(averageRating) ? 'fill-amber-400' : 'text-slate-300'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 tabular-nums">
                    Based on {reviewTotal} approved review{reviewTotal === 1 ? '' : 's'}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = distribution[star] || 0;
                  const pct = reviewTotal > 0 ? Math.round((count / reviewTotal) * 100) : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-xs">
                      <span className="w-8 text-slate-600 tabular-nums">{star} ★</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-right text-slate-500 tabular-nums">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleReviewSubmit} className="p-5 rounded-xl border border-slate-200 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">Write a Review</h3>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    aria-label={`Rate ${star} stars`}
                    onClick={() => setNewRating(star)}
                    className="p-1"
                  >
                    <Star
                      className={`w-5 h-5 ${
                        star <= newRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Review headline (optional)"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
              />
              <textarea
                required
                minLength={10}
                rows={3}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Share your authentic experience with this product..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
              />
              <button
                type="submit"
                disabled={submittingReview}
                className="w-full py-2.5 rounded-lg bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-60"
              >
                {submittingReview ? 'Submitting...' : 'Submit Verified Review'}
              </button>
            </form>
          </div>

          {/* Review List */}
          <div className="lg:col-span-7 space-y-4">
            {reviews.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-slate-200 text-center text-sm text-slate-500">
                No approved reviews yet. Customers who receive this item can submit the first verified review.
              </div>
            ) : (
              reviews.map((r) => (
                <div key={r._id} className="p-4 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{r.userName}</span>
                      {r.verifiedPurchase && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Verified Purchase
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-amber-500">{r.rating}.0 ★</div>
                  {r.title && <p className="text-sm font-semibold text-slate-800">{r.title}</p>}
                  <p className="text-sm text-slate-600">{r.comment}</p>
                  <div className="flex items-center gap-4 pt-1 text-xs text-slate-500">
                    <button
                      type="button"
                      onClick={() =>
                        apiRequest(`/api/reviews/${r._id}/helpful`, { method: 'POST' })
                          .then(() => void loadReviews(product._id))
                          .catch(() => dispatch(openAuthModal({ mode: 'login' })))
                      }
                      className="inline-flex items-center gap-1 hover:text-emerald-700"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>Helpful ({r.helpfulVoterIds?.length || 0})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        apiRequest(`/api/reviews/${r._id}/report`, {
                          method: 'POST',
                          body: JSON.stringify({ reason: 'Inappropriate or misleading content' }),
                        })
                          .then(() =>
                            dispatch(pushToast({ variant: 'info', message: 'Review reported to moderators.' }))
                          )
                          .catch(() => dispatch(openAuthModal({ mode: 'login' })))
                      }
                      className="inline-flex items-center gap-1 hover:text-red-600"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      <span>Report</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Related Products</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {relatedProducts.map((item) => (
              <ProductCard key={item._id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
