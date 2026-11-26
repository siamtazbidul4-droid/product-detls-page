import { Heart, ShoppingCart, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../app/hooks.ts';
import { updateUserState } from '../../features/auth/authSlice.ts';
import { addGuestCartItem, addToServerCart, setCartDrawerOpen } from '../../features/cart/cartSlice.ts';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { toggleGuestWishlistItem } from '../../features/wishlist/wishlistSlice.ts';
import { apiRequest, formatBdt } from '../../lib/api.ts';
import type { Product } from '../../types/domain.ts';
import { SafeImage } from './SafeImage.tsx';

export function ProductCard({ product }: { product: Product }) {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const guestWishlistIds = useAppSelector((s) => s.wishlist.guestIds);
  const isWishlisted = user
    ? Boolean(user.wishlist?.includes(product._id))
    : guestWishlistIds.includes(product._id);

  const activeVariants = (product.variants || []).filter((v) => v.isActive !== false);
  const primaryVariant =
    activeVariants.find((v) => v.stockOnHand - v.reservedStock > 0) || activeVariants[0];
  const outOfStock = product.availableStock <= 0;

  const handleAddToCart = async () => {
    if (outOfStock) {
      dispatch(pushToast({ variant: 'warning', message: 'This item is currently out of stock.' }));
      return;
    }

    if (user) {
      try {
        await dispatch(
          addToServerCart({
            productId: product._id,
            variantId: primaryVariant?._id || null,
            quantity: 1,
          })
        ).unwrap();
        dispatch(
          pushToast({
            variant: 'success',
            message: `${product.name} added to your cart.`,
          })
        );
        dispatch(setCartDrawerOpen(true));
      } catch (err) {
        dispatch(
          pushToast({
            variant: 'error',
            message: err instanceof Error ? err.message : 'Unable to add item to cart.',
          })
        );
      }
    } else {
      dispatch(
        addGuestCartItem({
          productId: product._id,
          variantId: primaryVariant?._id || null,
          slug: product.slug,
          sku: primaryVariant?.sku || product.sku,
          name: product.name,
          variantTitle: primaryVariant?.title || null,
          selectedOptions: primaryVariant?.options || {},
          imageUrl: primaryVariant?.image?.url || product.images[0]?.url || '',
          quantity: 1,
          unitPrice: primaryVariant?.price ?? product.effectivePrice,
          originalPrice: product.originalPrice,
          availableStock: product.availableStock,
          categoryId: product.categoryId?._id,
          codEligible: product.codEligible,
        })
      );
      dispatch(pushToast({ variant: 'success', message: `${product.name} added to your cart.` }));
      dispatch(setCartDrawerOpen(true));
    }
  };

  const handleToggleWishlist = async () => {
    if (!user) {
      const wasSaved = guestWishlistIds.includes(product._id);
      dispatch(toggleGuestWishlistItem(product._id));
      dispatch(
        pushToast({
          variant: 'success',
          message: wasSaved ? 'Removed from your wishlist.' : 'Saved to your wishlist.',
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
      dispatch(
        pushToast({
          variant: 'success',
          message: res.added ? 'Saved to your wishlist.' : 'Removed from your wishlist.',
        })
      );
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Failed to update wishlist.',
        })
      );
    }
  };

  return (
    <article className="group bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div>
        <div className="relative aspect-square rounded-lg bg-slate-50 overflow-hidden mb-3">
          <Link to={`/product/${product.slug}`} className="block w-full h-full">
            <SafeImage
              src={product.images?.[0]?.url}
              alt={product.name}
              fallbackLabel={product.name}
              className="w-full h-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
            />
          </Link>

          <button
            type="button"
            onClick={handleToggleWishlist}
            aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-red-500 hover:border-red-200 transition-colors shadow-xs"
          >
            <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-red-500 text-red-500' : ''}`} />
          </button>

          {product.isFlashSaleActive && (
            <span className="absolute top-2 left-2 bg-amber-500 text-slate-950 text-[11px] font-bold px-2 py-0.5 rounded">
              Flash Sale
            </span>
          )}
        </div>

        <Link
          to={`/product/${product.slug}`}
          className="block text-sm font-semibold text-slate-900 hover:text-emerald-700 line-clamp-2 min-h-[2.5rem] leading-snug"
        >
          {product.name}
        </Link>

        {/* Truthful Ratings: Only display star score when real approved reviews exist */}
        <div className="mt-1.5 min-h-[1.25rem] flex items-center gap-1.5 text-xs">
          {product.ratingCount > 0 ? (
            <>
              <div className="flex items-center text-amber-400" aria-label={`Rated ${product.ratingAverage} out of 5`}>
                <Star className="w-3.5 h-3.5 fill-amber-400" />
              </div>
              <span className="font-semibold text-slate-700 tabular-nums">
                {product.ratingAverage.toFixed(1)}
              </span>
              <span className="text-slate-400 tabular-nums">({product.ratingCount})</span>
            </>
          ) : (
            <span className="text-slate-400">
              {product.brandId?.name || 'Verified Authentic'}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-baseline gap-2 flex-wrap">
          <span className="text-base font-bold text-emerald-600 tabular-nums">
            {formatBdt(product.effectivePrice)}
          </span>
          {product.originalPrice && product.originalPrice > product.effectivePrice && (
            <span className="text-xs text-slate-400 line-through tabular-nums">
              {formatBdt(product.originalPrice)}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleAddToCart}
        disabled={outOfStock}
        className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-[#16A34A] hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
      >
        <ShoppingCart className="w-3.5 h-3.5" />
        <span>{outOfStock ? 'Out of Stock' : 'Add to Cart'}</span>
      </button>
    </article>
  );
}
