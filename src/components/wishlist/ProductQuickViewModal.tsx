import { useEffect, useState } from 'react';
import { ExternalLink, Heart, Minus, Plus, ShoppingCart, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../app/hooks.ts';
import { addGuestCartItem, addToServerCart, setCartDrawerOpen } from '../../features/cart/cartSlice.ts';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { formatBdt } from '../../lib/api.ts';
import type { Product } from '../../types/domain.ts';
import { Modal } from '../ui/Modal.tsx';
import { SafeImage } from '../ui/SafeImage.tsx';

interface ProductQuickViewModalProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onRemoveFromWishlist?: (productId: string) => void;
}

export function ProductQuickViewModal({
  product,
  open,
  onClose,
  onRemoveFromWishlist,
}: ProductQuickViewModalProps) {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!product || !open) return;
    const activeVariants = (product.variants || []).filter((v) => v.isActive !== false);
    const inStockVariant = activeVariants.find((v) => v.stockOnHand - v.reservedStock > 0);
    setSelectedVariantId(inStockVariant?._id || activeVariants[0]?._id || null);
    setQuantity(1);
  }, [product, open]);

  if (!product) return null;

  const activeVariants = (product.variants || []).filter((v) => v.isActive !== false);
  const selectedVariant =
    activeVariants.find((v) => v._id === selectedVariantId) || null;
  const availableStock = selectedVariant
    ? Math.max(0, selectedVariant.stockOnHand - selectedVariant.reservedStock)
    : product.availableStock;
  const displayPrice = selectedVariant?.price ?? product.effectivePrice;
  const imageUrl = selectedVariant?.image?.url || product.images?.[0]?.url || '';
  const outOfStock = availableStock <= 0;

  const handleAddToCart = async () => {
    if (outOfStock) {
      dispatch(pushToast({ variant: 'warning', message: 'Selected option is currently out of stock.' }));
      return;
    }
    if (activeVariants.length > 0 && !selectedVariant) {
      dispatch(pushToast({ variant: 'info', message: 'Please choose an option first.' }));
      return;
    }

    setAdding(true);
    try {
      if (user) {
        await dispatch(
          addToServerCart({
            productId: product._id,
            variantId: selectedVariant?._id || null,
            quantity,
          })
        ).unwrap();
      } else {
        dispatch(
          addGuestCartItem({
            productId: product._id,
            variantId: selectedVariant?._id || null,
            slug: product.slug,
            sku: selectedVariant?.sku || product.sku,
            name: product.name,
            variantTitle: selectedVariant?.title || null,
            selectedOptions: selectedVariant?.options || {},
            imageUrl,
            quantity,
            unitPrice: displayPrice,
            originalPrice: product.originalPrice,
            availableStock,
            categoryId: product.categoryId?._id,
            codEligible: product.codEligible,
          })
        );
      }

      dispatch(pushToast({ variant: 'success', message: `${product.name} added to your cart.` }));
      onClose();
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
    <Modal
      open={open}
      onClose={onClose}
      title="Product Quick View"
      maxWidthClass="max-w-2xl"
    >
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-start">
        <div className="sm:col-span-5 aspect-square rounded-xl bg-slate-50 border border-slate-200 overflow-hidden relative">
          <SafeImage
            src={imageUrl}
            alt={product.name}
            fallbackLabel={product.name}
            className="w-full h-full object-contain p-4"
          />
          {product.discountPercent > 0 && (
            <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-[#15803D] text-white text-xs font-bold tabular-nums">
              -{product.discountPercent}%
            </span>
          )}
        </div>

        <div className="sm:col-span-7 space-y-4">
          <div>
            {product.brandId?.name && (
              <p className="text-xs font-semibold text-[#15803D] uppercase tracking-wide">
                {product.brandId.name}
              </p>
            )}
            <h3 className="text-lg font-extrabold text-slate-900 mt-0.5 leading-snug">
              {product.name}
            </h3>

            {product.ratingCount > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="font-bold text-slate-800 tabular-nums">
                  {product.ratingAverage.toFixed(1)}
                </span>
                <span className="text-slate-500 tabular-nums">
                  ({product.ratingCount} verified review{product.ratingCount === 1 ? '' : 's'})
                </span>
              </div>
            )}
          </div>

          <div className="flex items-baseline gap-2.5">
            <span className="text-2xl font-extrabold text-[#15803D] tabular-nums">
              {formatBdt(displayPrice)}
            </span>
            {product.originalPrice && product.originalPrice > displayPrice && (
              <span className="text-sm text-slate-400 line-through tabular-nums">
                {formatBdt(product.originalPrice)}
              </span>
            )}
          </div>

          {product.shortDescription && (
            <p className="text-xs text-slate-600 leading-relaxed">{product.shortDescription}</p>
          )}

          <p
            className={`text-xs font-semibold ${
              outOfStock ? 'text-red-600' : 'text-emerald-700'
            }`}
          >
            {outOfStock ? 'Currently Out of Stock' : `In Stock (${availableStock} available)`}
          </p>

          {activeVariants.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700">Select Option</p>
              <div className="flex flex-wrap gap-2">
                {activeVariants.map((variant) => {
                  const vStock = Math.max(0, variant.stockOnHand - variant.reservedStock);
                  const active = variant._id === selectedVariantId;
                  return (
                    <button
                      key={variant._id}
                      type="button"
                      disabled={vStock <= 0}
                      onClick={() => {
                        setSelectedVariantId(variant._id);
                        setQuantity(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                        active
                          ? 'border-[#15803D] bg-[#EAF7EE] text-[#14532D]'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      } disabled:opacity-45 disabled:line-through`}
                    >
                      {variant.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!outOfStock && (
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700">Quantity</span>
              <div className="inline-flex items-center border border-slate-200 rounded-lg bg-slate-50">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="p-2 text-slate-700 hover:bg-slate-200/60"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="px-3 text-xs font-bold tabular-nums">{quantity}</span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => setQuantity((q) => Math.min(availableStock, q + 1))}
                  className="p-2 text-slate-700 hover:bg-slate-200/60"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="button"
              disabled={outOfStock || adding}
              onClick={handleAddToCart}
              className="flex-1 min-w-[160px] py-2.5 px-4 rounded-xl bg-[#15803D] hover:bg-[#14532D] disabled:bg-slate-200 disabled:text-slate-500 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>{outOfStock ? 'Out of Stock' : adding ? 'Adding...' : 'Add to Cart'}</span>
            </button>

            {onRemoveFromWishlist && (
              <button
                type="button"
                onClick={() => {
                  onRemoveFromWishlist(product._id);
                  onClose();
                }}
                className="py-2.5 px-3.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold flex items-center gap-1.5"
              >
                <Heart className="w-3.5 h-3.5 fill-red-500" />
                <span>Remove</span>
              </button>
            )}

            <Link
              to={`/product/${product.slug}`}
              onClick={onClose}
              className="py-2.5 px-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <span>Full Details</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </Modal>
  );
}
