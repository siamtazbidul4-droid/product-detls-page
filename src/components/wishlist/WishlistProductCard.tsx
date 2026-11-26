import { useState } from 'react';
import { Eye, Heart, ShoppingCart, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { requiresVariantSelection } from '../../../shared/wishlistHelpers.ts';
import { useAppDispatch, useAppSelector } from '../../app/hooks.ts';
import { addGuestCartItem, addToServerCart, setCartDrawerOpen } from '../../features/cart/cartSlice.ts';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { formatBdt } from '../../lib/api.ts';
import type { Product } from '../../types/domain.ts';
import { SafeImage } from '../ui/SafeImage.tsx';

interface WishlistProductCardProps {
  product: Product;
  onRemove: (productId: string) => void;
  onQuickView: (product: Product, promptVariant?: boolean) => void;
}

export function WishlistProductCard({
  product,
  onRemove,
  onQuickView,
}: WishlistProductCardProps) {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const [adding, setAdding] = useState(false);

  const outOfStock = product.availableStock <= 0;
  const lowStock = !outOfStock && product.availableStock <= (product.lowStockThreshold || 5);
  const hasVariants = requiresVariantSelection(product);

  const handleAddToCart = async () => {
    if (outOfStock) {
      dispatch(pushToast({ variant: 'warning', message: 'This item is currently out of stock.' }));
      return;
    }

    if (hasVariants) {
      onQuickView(product, true);
      return;
    }

    setAdding(true);
    try {
      if (user) {
        await dispatch(
          addToServerCart({
            productId: product._id,
            variantId: null,
            quantity: 1,
          })
        ).unwrap();
      } else {
        dispatch(
          addGuestCartItem({
            productId: product._id,
            variantId: null,
            slug: product.slug,
            sku: product.sku,
            name: product.name,
            variantTitle: null,
            selectedOptions: {},
            imageUrl: product.images?.[0]?.url || '',
            quantity: 1,
            unitPrice: product.effectivePrice,
            originalPrice: product.originalPrice,
            availableStock: product.availableStock,
            categoryId: product.categoryId?._id,
            codEligible: product.codEligible,
          })
        );
      }

      dispatch(pushToast({ variant: 'success', message: `${product.name} added to your cart.` }));
      dispatch(setCartDrawerOpen(true));
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Unable to add item to cart.',
        })
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <article className="group bg-white border border-[#DCE8DF] rounded-2xl p-3.5 flex flex-col justify-between shadow-[0_2px_12px_rgba(11,59,34,0.04)] hover:shadow-[0_10px_28px_rgba(11,59,34,0.09)] hover:-translate-y-0.5 transition-all duration-200">
      <div>
        {/* Image Frame */}
        <div className="relative aspect-[4/3] rounded-xl bg-[#F7FAF8] overflow-hidden mb-3">
          <Link to={`/product/${product.slug}`} className="block w-full h-full">
            <SafeImage
              src={product.images?.[0]?.url}
              alt={product.name}
              fallbackLabel={product.name}
              className="w-full h-full object-contain p-3 transition-transform duration-300 group-hover:scale-105"
            />
          </Link>

          {/* Real Discount Badge (Only rendered if real discount > 0) */}
          {product.discountPercent > 0 && (
            <span
              className={`absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white tabular-nums shadow-2xs ${
                product.isFlashSaleActive ? 'bg-red-600' : 'bg-[#15803D]'
              }`}
            >
              -{product.discountPercent}%
            </span>
          )}

          {/* Remove from Wishlist Heart Button */}
          <button
            type="button"
            onClick={() => onRemove(product._id)}
            aria-label={`Remove ${product.name} from wishlist`}
            title="Remove from wishlist"
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/95 border border-slate-100 hover:border-red-200 hover:bg-red-50 flex items-center justify-center text-red-500 shadow-xs transition-colors"
          >
            <Heart className="w-4 h-4 fill-red-500 text-red-500" />
          </button>
        </div>

        {/* Product Title */}
        <Link
          to={`/product/${product.slug}`}
          className="block text-sm font-bold text-slate-900 hover:text-[#15803D] line-clamp-2 min-h-[2.5rem] leading-snug"
        >
          {product.name}
        </Link>

        {/* Truthful Rating Row (No fabricated stars when 0 reviews) */}
        <div className="mt-1.5 min-h-[1.25rem] flex items-center gap-1.5 text-xs">
          {product.ratingCount > 0 ? (
            <>
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span className="font-bold text-slate-800 tabular-nums">
                {product.ratingAverage.toFixed(1)}
              </span>
              <span className="text-slate-400 tabular-nums">({product.ratingCount})</span>
            </>
          ) : (
            <span className="text-slate-400 text-[11px]">
              {product.brandId?.name || product.categoryId?.name || 'Verified Product'}
            </span>
          )}
        </div>

        {/* Price Row */}
        <div className="mt-2 flex items-baseline gap-2 flex-wrap">
          <span className="text-base font-extrabold text-[#15803D] tabular-nums">
            {formatBdt(product.effectivePrice)}
          </span>
          {product.originalPrice && product.originalPrice > product.effectivePrice && (
            <span className="text-xs text-slate-400 line-through tabular-nums">
              {formatBdt(product.originalPrice)}
            </span>
          )}
        </div>

        {/* Availability Status */}
        <p
          className={`mt-1 text-[11px] font-semibold ${
            outOfStock ? 'text-red-600' : lowStock ? 'text-amber-700' : 'text-emerald-700'
          }`}
        >
          {outOfStock
            ? 'Out of Stock'
            : lowStock
            ? `Low Stock (${product.availableStock} left)`
            : 'In Stock'}
        </p>
      </div>

      {/* Action Buttons Row */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={outOfStock || adding}
          className="flex-1 h-9 px-3 rounded-lg bg-[#15803D] hover:bg-[#14532D] disabled:bg-slate-200 disabled:text-slate-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
        >
          <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
          <span>
            {outOfStock
              ? 'Out of Stock'
              : adding
              ? 'Adding...'
              : hasVariants
              ? 'Select Option'
              : 'Add to Cart'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onQuickView(product, false)}
          aria-label={`Quick view ${product.name}`}
          title="Quick view"
          className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:border-[#15803D] hover:text-[#15803D] text-slate-600 flex items-center justify-center transition-colors shrink-0"
        >
          <Eye className="w-4 h-4" />
        </button>
      </div>
    </article>
  );
}
