import { useEffect, useState } from 'react';
import { ChevronRight, Filter, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../lib/api.ts';
import type { Brand, Category, Product } from '../types/domain.ts';
import { ProductCard } from '../components/ui/ProductCard.tsx';
import { SeoHead } from '../components/ui/SeoHead.tsx';

interface CatalogPageProps {
  categories: Category[];
  defaultOnSale?: boolean;
}

interface FilterDraft {
  brand: string;
  minPrice: string;
  maxPrice: string;
  minRating: string;
  inStock: boolean;
  onSale: boolean;
}

export function CatalogPage({ categories, defaultOnSale = false }: CatalogPageProps) {
  const { slug, brandSlug: brandRouteParam } = useParams<{ slug?: string; brandSlug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const q = searchParams.get('q') || '';
  const brand = brandRouteParam || searchParams.get('brand') || '';
  const sort = searchParams.get('sort') || 'featured';
  const minPrice = searchParams.get('minPrice') || '';
  const maxPrice = searchParams.get('maxPrice') || '';
  const minRating = searchParams.get('minRating') || '';
  const onSale = Boolean(defaultOnSale) || searchParams.get('onSale') === 'true';
  const inStock = searchParams.get('inStock') === 'true';
  const page = Math.max(1, Number(searchParams.get('page') || 1));

  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [draft, setDraft] = useState<FilterDraft>({
    brand,
    minPrice,
    maxPrice,
    minRating,
    inStock,
    onSale,
  });

  useEffect(() => {
    setDraft({ brand, minPrice, maxPrice, minRating, inStock, onSale });
  }, [brand, minPrice, maxPrice, minRating, inStock, onSale]);

  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileFiltersOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileFiltersOpen]);

  const activeCategory = categories.find((c) => c.slug === slug);
  const activeBrand = brands.find((b) => b.slug === brand);

  useEffect(() => {
    apiRequest<{ brands: Brand[] }>('/api/catalog/brands')
      .then((res) => setBrands(res.brands || []))
      .catch(() => {});
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20', sort });
      if (slug) params.set('category', slug);
      if (q) params.set('q', q);
      if (brand) params.set('brand', brand);
      if (minPrice) params.set('minPrice', minPrice);
      if (maxPrice) params.set('maxPrice', maxPrice);
      if (minRating) params.set('minRating', minRating);
      if (onSale) params.set('onSale', 'true');
      if (inStock) params.set('inStock', 'true');

      const res = await apiRequest<{ products: Product[]; total: number; totalPages: number }>(
        `/api/catalog/products?${params.toString()}`
      );
      setProducts(res.products || []);
      setTotal(res.total || 0);
      setTotalPages(Math.max(1, res.totalPages || 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, [slug, brandRouteParam, q, brand, sort, minPrice, maxPrice, minRating, onSale, inStock, page]);

  const updateParam = (key: string, value: string | null) => {
    if (key === 'brand' && brandRouteParam) {
      const next = new URLSearchParams(searchParams);
      if (value) next.set('brand', value);
      next.set('page', '1');
      navigate(`/shop?${next.toString()}`);
      return;
    }
    const next = new URLSearchParams(searchParams);
    if (!value) next.delete(key);
    else next.set(key, value);
    next.set('page', '1');
    setSearchParams(next);
  };

  const applyDrawerFilters = () => {
    const next = new URLSearchParams(searchParams);
    if (draft.brand && !brandRouteParam) next.set('brand', draft.brand);
    else if (!draft.brand) next.delete('brand');

    if (draft.minPrice) next.set('minPrice', draft.minPrice);
    else next.delete('minPrice');

    if (draft.maxPrice) next.set('maxPrice', draft.maxPrice);
    else next.delete('maxPrice');

    if (draft.minRating) next.set('minRating', draft.minRating);
    else next.delete('minRating');

    if (draft.inStock) next.set('inStock', 'true');
    else next.delete('inStock');

    if (draft.onSale && !defaultOnSale) next.set('onSale', 'true');
    else if (!draft.onSale) next.delete('onSale');

    next.set('page', '1');

    if (brandRouteParam && draft.brand !== brandRouteParam) {
      navigate(`/shop?${next.toString()}`);
    } else {
      setSearchParams(next);
    }
    setMobileFiltersOpen(false);
  };

  const clearFilters = () => {
    const next = new URLSearchParams();
    if (q) next.set('q', q);
    if (brandRouteParam || defaultOnSale) {
      navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/shop');
    } else {
      setSearchParams(next);
    }
    setMobileFiltersOpen(false);
  };

  const activeChips: Array<{ key: string; label: string; onClear: () => void }> = [];
  if (brand) {
    activeChips.push({
      key: 'brand',
      label: `Brand: ${activeBrand?.name || brand}`,
      onClear: () => updateParam('brand', null),
    });
  }
  if (minPrice || maxPrice) {
    activeChips.push({
      key: 'price',
      label: `Price: ৳${minPrice || '0'} – ${maxPrice ? `৳${maxPrice}` : 'Any'}`,
      onClear: () => {
        const next = new URLSearchParams(searchParams);
        next.delete('minPrice');
        next.delete('maxPrice');
        next.set('page', '1');
        setSearchParams(next);
      },
    });
  }
  if (minRating) {
    activeChips.push({
      key: 'minRating',
      label: `${minRating}★ & above`,
      onClear: () => updateParam('minRating', null),
    });
  }
  if (inStock) {
    activeChips.push({
      key: 'inStock',
      label: 'In Stock Only',
      onClear: () => updateParam('inStock', null),
    });
  }
  if (onSale && !defaultOnSale) {
    activeChips.push({
      key: 'onSale',
      label: 'On Sale',
      onClear: () => updateParam('onSale', null),
    });
  }

  const pageTitle = q
    ? `Search results for "${q}"`
    : activeCategory
    ? activeCategory.name
    : activeBrand
    ? `${activeBrand.name} Products`
    : onSale
    ? 'Deals & Flash Sales'
    : 'All Products';

  const renderFilterControls = (mode: 'sidebar' | 'drawer') => {
    const valBrand = mode === 'drawer' ? draft.brand : brand;
    const valMinPrice = mode === 'drawer' ? draft.minPrice : minPrice;
    const valMaxPrice = mode === 'drawer' ? draft.maxPrice : maxPrice;
    const valMinRating = mode === 'drawer' ? draft.minRating : minRating;
    const valInStock = mode === 'drawer' ? draft.inStock : inStock;
    const valOnSale = mode === 'drawer' ? draft.onSale : onSale;

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Filter className="w-4 h-4 text-emerald-600" />
            <span>Filters</span>
          </h2>
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-emerald-700 hover:underline font-medium inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Clear all</span>
          </button>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-700 mb-2">Categories</p>
          <div className="space-y-1.5">
            <Link
              to="/shop"
              onClick={() => setMobileFiltersOpen(false)}
              className={`block text-xs py-1 ${!slug ? 'font-bold text-emerald-700' : 'text-slate-600 hover:text-slate-900'}`}
            >
              All Categories
            </Link>
            {categories.filter((c) => !c.parentId).map((c) => (
              <Link
                key={c._id}
                to={`/category/${c.slug}`}
                onClick={() => setMobileFiltersOpen(false)}
                className={`block text-xs py-1 ${slug === c.slug ? 'font-bold text-emerald-700' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {c.name}
              </Link>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-700 mb-2">Price Range (BDT)</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              value={valMinPrice}
              onChange={(e) => {
                if (mode === 'drawer') setDraft((d) => ({ ...d, minPrice: e.target.value }));
                else updateParam('minPrice', e.target.value || null);
              }}
              placeholder="Min ৳"
              aria-label="Minimum price"
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs tabular-nums"
            />
            <input
              type="number"
              min={0}
              value={valMaxPrice}
              onChange={(e) => {
                if (mode === 'drawer') setDraft((d) => ({ ...d, maxPrice: e.target.value }));
                else updateParam('maxPrice', e.target.value || null);
              }}
              placeholder="Max ৳"
              aria-label="Maximum price"
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs tabular-nums"
            />
          </div>
        </div>

        {brands.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <label
              htmlFor={`plp-brand-select-${mode}`}
              className="block text-xs font-semibold text-slate-700 mb-2"
            >
              Brand
            </label>
            <select
              id={`plp-brand-select-${mode}`}
              value={valBrand}
              onChange={(e) => {
                if (mode === 'drawer') setDraft((d) => ({ ...d, brand: e.target.value }));
                else updateParam('brand', e.target.value || null);
              }}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs bg-white"
            >
              <option value="">All Brands</option>
              {brands.map((b) => (
                <option key={b._id} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="border-t border-slate-100 pt-4">
          <label
            htmlFor={`plp-rating-select-${mode}`}
            className="block text-xs font-semibold text-slate-700 mb-2"
          >
            Minimum Rating
          </label>
          <select
            id={`plp-rating-select-${mode}`}
            value={valMinRating}
            onChange={(e) => {
              if (mode === 'drawer') setDraft((d) => ({ ...d, minRating: e.target.value }));
              else updateParam('minRating', e.target.value || null);
            }}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs bg-white"
          >
            <option value="">All Ratings</option>
            <option value="4">4★ &amp; above</option>
            <option value="3">3★ &amp; above</option>
            <option value="2">2★ &amp; above</option>
          </select>
        </div>

        <div className="border-t border-slate-100 pt-4 space-y-2.5">
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={valInStock}
              onChange={(e) => {
                if (mode === 'drawer') setDraft((d) => ({ ...d, inStock: e.target.checked }));
                else updateParam('inStock', e.target.checked ? 'true' : null);
              }}
              className="rounded accent-emerald-600"
            />
            <span>In Stock Only</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={valOnSale}
              disabled={defaultOnSale}
              onChange={(e) => {
                if (mode === 'drawer') setDraft((d) => ({ ...d, onSale: e.target.checked }));
                else updateParam('onSale', e.target.checked ? 'true' : null);
              }}
              className="rounded accent-emerald-600"
            />
            <span>On Sale / Discounted</span>
          </label>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <SeoHead
        title={`${pageTitle} – NOVARA COMMERCE`}
        description={activeCategory?.description || `Browse ${pageTitle} at NOVARA COMMERCE Bangladesh.`}
      />

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500 mb-4">
        <Link to="/" className="hover:text-emerald-700">Home</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link to="/shop" className="hover:text-emerald-700">Shop</Link>
        {activeCategory && (
          <>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-slate-900 font-medium">{activeCategory.name}</span>
          </>
        )}
        {activeBrand && (
          <>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-slate-900 font-medium">{activeBrand.name}</span>
          </>
        )}
      </nav>

      {/* Heading + Sort Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{pageTitle}</h1>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {loading ? 'Loading catalog...' : `${total} product${total === 1 ? '' : 's'} found`}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="lg:hidden inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-emerald-500"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filters{activeChips.length > 0 ? ` (${activeChips.length})` : ''}</span>
          </button>

          <select
            aria-label="Sort products"
            value={sort}
            onChange={(e) => updateParam('sort', e.target.value)}
            className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700"
          >
            <option value="featured">Sort: Featured</option>
            <option value="newest">Sort: Newest Arrivals</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="best_selling">Best Selling</option>
            <option value="top_rated">Top Rated</option>
          </select>
        </div>
      </div>

      {/* Active Filter Chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onClear}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold hover:bg-emerald-100"
            >
              <span>{chip.label}</span>
              <X className="w-3 h-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline ml-1"
          >
            Clear All
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <aside className="hidden lg:block lg:col-span-3 bg-white border border-slate-200 rounded-xl p-5 sticky top-28">
          {renderFilterControls('sidebar')}
        </aside>

        <div className="lg:col-span-9">
          {error ? (
            <div className="bg-white border border-red-200 rounded-xl p-8 text-center">
              <p className="text-sm font-semibold text-red-700 mb-2">{error}</p>
              <button
                type="button"
                onClick={() => void loadProducts()}
                className="px-4 py-2 rounded-lg bg-[#16A34A] text-white text-xs font-semibold"
              >
                Retry
              </button>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-72 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
              <p className="text-base font-bold text-slate-900">No matching products found</p>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                Try clearing filters or searching in English or Bangla (e.g. &quot;Smartphone&quot; or &quot;বই&quot;).
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-2 rounded-lg bg-[#16A34A] text-white text-xs font-semibold"
              >
                Clear All Filters
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                {products.map((product) => (
                  <ProductCard key={product._id} product={product} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2 flex-wrap">
                  {Array.from({ length: totalPages }).map((_, idx) => {
                    const p = idx + 1;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          const next = new URLSearchParams(searchParams);
                          next.set('page', String(p));
                          setSearchParams(next);
                        }}
                        className={`w-9 h-9 rounded-lg text-xs font-bold tabular-nums ${
                          p === page
                            ? 'bg-[#16A34A] text-white'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tablet & Mobile Filter Drawer */}
      {mobileFiltersOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Filter catalog products"
          className="fixed inset-0 z-[110] bg-slate-950/50 flex justify-start"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setMobileFiltersOpen(false);
          }}
        >
          <div className="w-80 max-w-full bg-white h-full flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <span className="font-bold text-slate-900">Filter Catalog</span>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                aria-label="Close filters"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">{renderFilterControls('drawer')}</div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={clearFilters}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={applyDrawerFilters}
                className="flex-1 py-2.5 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-bold"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
