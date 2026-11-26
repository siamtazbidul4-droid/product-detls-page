import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Gem,
  Headphones,
  Mail,
  Quote,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
  Trophy,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  selectLatestApprovedReviews,
  sortActivePromoPlacements,
  sortHomepageSections,
} from '../../shared/homepageHelpers.ts';
import { sanitizeHref } from '../../shared/security.ts';
import { useAppDispatch } from '../app/hooks.ts';
import { pushToast } from '../features/toast/toastSlice.ts';
import { apiRequest, ApiError } from '../lib/api.ts';
import type {
  Category,
  HomepageConfig,
  Product,
  PromotionalPlacement,
  ReviewItem,
} from '../types/domain.ts';
import { ProductCard } from '../components/ui/ProductCard.tsx';
import { SafeImage } from '../components/ui/SafeImage.tsx';
import { SeoHead } from '../components/ui/SeoHead.tsx';

interface HomePageProps {
  categories: Category[];
  homepage: HomepageConfig | null;
  activePromotions: PromotionalPlacement[];
  dbUnavailable: boolean;
}

type HomepageSection = NonNullable<HomepageConfig['sections']>[number];

const DEFAULT_SECTIONS: HomepageSection[] = [
  { id: 'hero', label: 'Hero Campaign', enabled: true, order: 1, collectionType: 'hero' },
  {
    id: 'categories',
    label: 'Shop by Category',
    enabled: true,
    order: 2,
    title: 'Shop by Category',
    subtitle: 'Explore our wide range of categories',
    collectionType: 'categories',
    ctaText: 'View All Categories',
    ctaLink: '/shop',
  },
  { id: 'dual_banners', label: 'Dual Category Banners', enabled: true, order: 3, collectionType: 'dual_banners' },
  {
    id: 'featured_products',
    label: 'Featured Products',
    enabled: true,
    order: 4,
    title: 'Featured Products',
    subtitle: 'Handpicked favorites just for you',
    collectionType: 'featured_products',
    productLimit: 5,
    ctaText: 'View All',
    ctaLink: '/shop',
  },
  { id: 'promo_placement', label: 'Promotional Ad Placement', enabled: true, order: 5, collectionType: 'promo_placement' },
  {
    id: 'best_sellers',
    label: 'Best Sellers',
    enabled: true,
    order: 6,
    title: 'Best Sellers',
    subtitle: 'Most popular products based on verified orders',
    collectionType: 'best_sellers',
    productLimit: 5,
    ctaText: 'View All',
    ctaLink: '/shop?sort=best_selling',
  },
  {
    id: 'new_arrivals',
    label: 'New Arrivals',
    enabled: true,
    order: 7,
    title: 'New Arrivals',
    subtitle: 'Freshly added products across our store',
    collectionType: 'new_arrivals',
    productLimit: 5,
    ctaText: 'View All',
    ctaLink: '/shop?sort=newest',
  },
  {
    id: 'top_rated',
    label: 'Top Rated Products',
    enabled: true,
    order: 8,
    title: 'Top Rated Products',
    subtitle: 'Highest rated by verified shoppers',
    collectionType: 'top_rated',
    productLimit: 5,
    ctaText: 'View All',
    ctaLink: '/shop?sort=top_rated',
  },
  {
    id: 'on_sale',
    label: 'Special Offers & Flash Deals',
    enabled: true,
    order: 9,
    title: 'Special Offers & Deals',
    subtitle: 'Limited-time price drops across Bangladesh',
    collectionType: 'on_sale',
    productLimit: 5,
    ctaText: 'View Deals',
    ctaLink: '/deals',
  },
  { id: 'newsletter', label: 'Newsletter Subscription', enabled: true, order: 10, collectionType: 'newsletter' },
  {
    id: 'happy_clients',
    label: 'Authentic Customer Reviews',
    enabled: true,
    order: 11,
    title: 'Our Happy Clients',
    subtitle: 'Real feedback from verified NOVARA customers',
    collectionType: 'happy_clients',
  },
];

function PromoBannerCard({ promo }: { promo: PromotionalPlacement }) {
  const safeUrl = sanitizeHref(promo.destinationUrl) || '/shop';
  const styleClass =
    promo.layoutStyle === 'soft_sage_banner'
      ? 'bg-gradient-to-r from-[#ECFDF5] via-[#F0FDF4] to-[#DCFCE7] text-slate-900 border border-emerald-200'
      : promo.layoutStyle === 'clean_card'
      ? 'bg-white text-slate-900 border border-slate-200 shadow-sm'
      : 'bg-gradient-to-r from-[#062313] via-[#0B3B20] to-[#124E2B] text-white shadow-lg';

  const subtitleClass =
    promo.layoutStyle === 'dark_emerald_banner' ? 'text-emerald-100/90' : 'text-slate-600';
  const ctaClass =
    promo.layoutStyle === 'dark_emerald_banner'
      ? 'bg-[#A3E635] text-slate-950 hover:bg-lime-300'
      : 'bg-[#16A34A] text-white hover:bg-emerald-700';

  return (
    <a href={safeUrl} className={`block rounded-2xl overflow-hidden transition-transform hover:-translate-y-0.5 ${styleClass}`}>
      <div className="grid grid-cols-1 md:grid-cols-12 items-center gap-6 px-6 sm:px-10 py-6">
        <div className="md:col-span-5 space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold leading-tight">{promo.title}</h2>
          {promo.subtitle && <p className={`text-sm ${subtitleClass}`}>{promo.subtitle}</p>}
        </div>
        <div className="md:col-span-2 flex md:justify-center">
          <span className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-colors ${ctaClass}`}>
            <span>{promo.ctaText || 'Shop Now'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
        <div className="md:col-span-5 h-32 sm:h-36 rounded-xl overflow-hidden">
          <SafeImage src={promo.imageUrl} alt={promo.altText} className="w-full h-full object-cover" />
        </div>
      </div>
    </a>
  );
}

export function HomePage({
  categories,
  homepage,
  activePromotions,
  dbUnavailable,
}: HomePageProps) {
  const dispatch = useAppDispatch();

  const [heroIndex, setHeroIndex] = useState(0);
  const [featuredTab, setFeaturedTab] = useState<
    'all' | 'best_seller' | 'new_arrivals' | 'top_rated' | 'on_sale'
  >('all');
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [bestSellers, setBestSellers] = useState<Product[]>([]);
  const [newArrivals, setNewArrivals] = useState<Product[]>([]);
  const [topRatedProducts, setTopRatedProducts] = useState<Product[]>([]);
  const [onSaleProducts, setOnSaleProducts] = useState<Product[]>([]);
  const [categoryCollections, setCategoryCollections] = useState<Record<string, Product[]>>({});
  const [featuredReviews, setFeaturedReviews] = useState<ReviewItem[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(false);

  // Newsletter state
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterConsent, setNewsletterConsent] = useState(true);
  const [subscribing, setSubscribing] = useState(false);

  const orderedSections = useMemo(
    () => sortHomepageSections(homepage?.sections, DEFAULT_SECTIONS),
    [homepage?.sections]
  );

  const sectionEnabled = (id: string) => {
    const found = orderedSections.find((s) => s.id === id);
    return found ? found.enabled : true;
  };

  const heroSlides = useMemo(() => {
    const slides = homepage?.heroSlides
      ?.filter((s) => s.isActive)
      .slice()
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    if (slides && slides.length > 0) return slides;
    return [
      {
        badge: 'Big Savings, Big Happiness',
        headlinePrefix: 'Smart Shopping',
        headlineHighlight: 'Bigger',
        headlineSuffix: 'Savings!',
        subtitle: 'Up to 60% Off on Top Brands Across Bangladesh',
        ctaText: 'Shop Now',
        ctaLink: '/shop',
        imageUrl: '/src/assets/images/hero_shopper_bags_1795621229978.jpg',
        isActive: true,
      },
    ];
  }, [homepage]);

  const activeSlide = heroSlides[heroIndex % heroSlides.length] || heroSlides[0];

  const trustPoints = homepage?.trustPoints?.length
    ? homepage.trustPoints
    : [
        { title: 'Premium Quality', subtitle: 'Best Products', icon: 'gem' },
        { title: 'Secure Payment', subtitle: '100% Secure', icon: 'shield' },
        { title: 'Easy Return', subtitle: '7 Days Return', icon: 'rotate' },
        { title: '24/7 Support', subtitle: 'Always Here', icon: 'headphones' },
      ];

  const dualBanners = homepage?.dualBanners?.length
    ? homepage.dualBanners
    : [
        {
          eyebrow: 'Up to',
          title: '70% OFF on Electronics',
          ctaText: 'Shop Now',
          ctaLink: '/category/smartphones',
          imageUrl: '/src/assets/images/promo_electronics_bundle_1795621230553.jpg',
          theme: 'ice' as const,
        },
        {
          eyebrow: 'Flat',
          title: '50% OFF on Fashion Collection',
          ctaText: 'Shop Now',
          ctaLink: '/category/fashion',
          imageUrl: '/src/assets/images/promo_fashion_bundle_1795621230765.jpg',
          theme: 'blush' as const,
        },
      ];

  const featuredSectionConfig = orderedSections.find((s) => s.id === 'featured_products');
  const featuredLimit = featuredSectionConfig?.productLimit || 5;

  // Fetch featured section products whenever active tab or limit changes
  useEffect(() => {
    if (dbUnavailable || !sectionEnabled('featured_products')) return;
    let active = true;
    setLoadingFeatured(true);
    const params = new URLSearchParams({
      limit: String(Math.max(5, featuredLimit)),
      tab: featuredTab,
    });
    apiRequest<{ products: Product[] }>(`/api/catalog/products?${params.toString()}`)
      .then((res) => {
        if (active) setFeaturedProducts(res.products || []);
      })
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 503) && active) {
          setFeaturedProducts([]);
        }
      })
      .finally(() => {
        if (active) setLoadingFeatured(false);
      });
    return () => {
      active = false;
    };
  }, [featuredTab, featuredLimit, dbUnavailable, orderedSections]);

  // Fetch dynamic homepage collections & latest 4 approved customer reviews
  useEffect(() => {
    if (dbUnavailable) return;

    const bestLimit = orderedSections.find((s) => s.id === 'best_sellers')?.productLimit || 5;
    const newLimit = orderedSections.find((s) => s.id === 'new_arrivals')?.productLimit || 5;
    const topLimit = orderedSections.find((s) => s.id === 'top_rated')?.productLimit || 5;
    const saleLimit = orderedSections.find((s) => s.id === 'on_sale')?.productLimit || 5;

    if (sectionEnabled('best_sellers')) {
      apiRequest<{ products: Product[] }>(
        `/api/catalog/products?sort=best_selling&tab=best_seller&limit=${bestLimit}`
      )
        .then((r) => setBestSellers(r.products || []))
        .catch(() => {});
    }

    if (sectionEnabled('new_arrivals')) {
      apiRequest<{ products: Product[] }>(
        `/api/catalog/products?sort=newest&tab=new_arrivals&limit=${newLimit}`
      )
        .then((r) => setNewArrivals(r.products || []))
        .catch(() => {});
    }

    if (sectionEnabled('top_rated')) {
      apiRequest<{ products: Product[] }>(
        `/api/catalog/products?sort=top_rated&tab=top_rated&topRated=true&limit=${topLimit}`
      )
        .then((r) => setTopRatedProducts(r.products || []))
        .catch(() => {});
    }

    if (sectionEnabled('on_sale')) {
      apiRequest<{ products: Product[] }>(`/api/catalog/products?onSale=true&limit=${saleLimit}`)
        .then((r) => setOnSaleProducts(r.products || []))
        .catch(() => {});
    }

    const customCatSections = orderedSections.filter(
      (s) => s.enabled && s.collectionType === 'category_collection' && s.categorySlug
    );
    customCatSections.forEach((sec) => {
      const lim = sec.productLimit || 5;
      apiRequest<{ products: Product[] }>(
        `/api/catalog/products?category=${encodeURIComponent(sec.categorySlug!)}&limit=${lim}`
      )
        .then((r) =>
          setCategoryCollections((prev) => ({ ...prev, [sec.id]: r.products || [] }))
        )
        .catch(() => {});
    });

    if (sectionEnabled('happy_clients')) {
      apiRequest<{ reviews: ReviewItem[] }>('/api/reviews/featured')
        .then((r) => {
          const safeFour = selectLatestApprovedReviews(
            (r.reviews || []).map((rev) => ({ ...rev, status: 'approved' })),
            4
          );
          setFeaturedReviews(safeFour);
        })
        .catch(() => {});
    }
  }, [dbUnavailable, orderedSections]);

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail.trim()) return;
    setSubscribing(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/support/newsletter/subscribe', {
        method: 'POST',
        body: JSON.stringify({ email: newsletterEmail, consent: newsletterConsent }),
      });
      dispatch(pushToast({ variant: 'success', message: res.message }));
      setNewsletterEmail('');
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Unable to subscribe right now.',
        })
      );
    } finally {
      setSubscribing(false);
    }
  };

  const midPromos = sortActivePromoPlacements(activePromotions, 'homepage_mid_banner');
  const secondaryPromos = sortActivePromoPlacements(activePromotions, 'homepage_secondary_banner');
  const triplePromos = sortActivePromoPlacements(activePromotions, 'homepage_triple_banners');
  const bottomPromos = sortActivePromoPlacements(activePromotions, 'homepage_bottom_banner');

  const displayCategories = categories.filter((c) => !c.parentId).slice(0, 8);
  const happyClientsSection = orderedSections.find((s) => s.id === 'happy_clients');

  const renderSection = (sec: HomepageSection) => {
    if (!sec.enabled) return null;

    if (sec.id === 'categories' || sec.collectionType === 'categories') {
      if (displayCategories.length === 0) return null;
      return (
        <section key={sec.id} aria-labelledby="shop-by-category-heading">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h2 id="shop-by-category-heading" className="text-lg font-bold text-slate-900">
                  {sec.title || 'Shop by Category'}
                </h2>
                <p className="text-xs text-slate-500">
                  {sec.subtitle || 'Explore our wide range of categories'}
                </p>
              </div>
            </div>
            <Link
              to={sanitizeHref(sec.ctaLink || '/shop') || '/shop'}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
            >
              <span>{sec.ctaText || 'View All Categories'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {displayCategories.map((cat) => (
              <Link
                key={cat._id}
                to={`/category/${cat.slug}`}
                className="group bg-white border border-slate-200 hover:border-emerald-400 rounded-xl p-3 flex flex-col items-center text-center transition-all hover:-translate-y-0.5 hover:shadow-sm"
              >
                <div className="w-full aspect-square rounded-lg bg-slate-50 overflow-hidden mb-2.5">
                  <SafeImage
                    src={cat.image?.url}
                    alt={cat.name}
                    fallbackLabel={cat.name}
                    className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform"
                  />
                </div>
                <span className="text-xs font-semibold text-slate-800 group-hover:text-emerald-700 line-clamp-1">
                  {cat.name}
                </span>
              </Link>
            ))}
          </div>
        </section>
      );
    }

    if (sec.id === 'dual_banners' || sec.collectionType === 'dual_banners') {
      return (
        <section key={sec.id} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {dualBanners.slice(0, 2).map((banner, idx) => (
            <div
              key={idx}
              className={`rounded-2xl overflow-hidden border p-6 flex items-center justify-between gap-4 ${
                banner.theme === 'ice'
                  ? 'bg-gradient-to-r from-[#E6EFF8] to-[#F4F8FC] border-slate-200'
                  : 'bg-gradient-to-r from-[#F6EAF2] to-[#FDF6FA] border-rose-100'
              }`}
            >
              <div className="space-y-3 max-w-[55%]">
                {banner.eyebrow && (
                  <p className="text-sm font-semibold text-slate-700">{banner.eyebrow}</p>
                )}
                <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight">
                  {banner.title}
                </h3>
                <Link
                  to={sanitizeHref(banner.ctaLink) || '/shop'}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-900 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                >
                  <span>{banner.ctaText}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <div className="w-32 sm:w-44 aspect-[4/3] rounded-xl overflow-hidden shrink-0">
                <SafeImage
                  src={banner.imageUrl}
                  alt={banner.title}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          ))}
        </section>
      );
    }

    if (sec.id === 'featured_products' || sec.collectionType === 'featured_products') {
      return (
        <section key={sec.id} aria-labelledby="featured-products-heading">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-lime-100 text-emerald-700 flex items-center justify-center">
                <Star className="w-5 h-5 fill-emerald-600 text-emerald-600" />
              </div>
              <div>
                <h2 id="featured-products-heading" className="text-lg font-bold text-slate-900">
                  {sec.title || 'Featured Products'}
                </h2>
                <p className="text-xs text-slate-500">
                  {sec.subtitle || 'Handpicked favorites just for you'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                [
                  ['all', 'All'],
                  ['best_seller', 'Best Seller'],
                  ['new_arrivals', 'New Arrivals'],
                  ['top_rated', 'Top Rated'],
                  ['on_sale', 'On Sale'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFeaturedTab(key)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                    featuredTab === key
                      ? 'bg-[#16A34A] text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
              <Link
                to={sanitizeHref(sec.ctaLink || '/shop') || '/shop'}
                className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
              >
                <span>{sec.ctaText || 'View All'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {loadingFeatured ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-72 rounded-xl bg-white border border-slate-200 animate-pulse" />
              ))}
            </div>
          ) : featuredProducts.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <p className="text-sm font-semibold text-slate-800">
                {dbUnavailable
                  ? 'Catalog products will appear here once MongoDB Atlas is connected.'
                  : 'No products matched this collection tab yet.'}
              </p>
              <Link
                to="/shop"
                className="inline-block mt-3 px-4 py-2 rounded-lg bg-[#16A34A] text-white text-xs font-semibold"
              >
                Browse Storefront Catalog
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {featuredProducts.slice(0, sec.productLimit || 5).map((product) => (
                <ProductCard key={product._id} product={product} />
              ))}
            </div>
          )}
        </section>
      );
    }

    if (sec.id === 'promo_placement' || sec.collectionType === 'promo_placement') {
      if (
        midPromos.length === 0 &&
        secondaryPromos.length === 0 &&
        triplePromos.length === 0 &&
        bottomPromos.length === 0
      ) {
        return null;
      }
      return (
        <div key={sec.id} className="space-y-6">
          {midPromos.slice(0, 1).map((promo) => (
            <section key={promo._id} aria-label="Promotional campaign">
              <PromoBannerCard promo={promo} />
            </section>
          ))}

          {triplePromos.length > 0 && (
            <section aria-label="Featured promotions" className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {triplePromos.slice(0, 3).map((promo) => (
                <Link
                  key={promo._id}
                  to={sanitizeHref(promo.destinationUrl) || '/shop'}
                  className="group bg-white border border-slate-200 hover:border-emerald-400 rounded-2xl overflow-hidden shadow-xs transition-all hover:-translate-y-0.5 flex flex-col"
                >
                  <div className="aspect-[16/9] bg-slate-100 overflow-hidden">
                    <SafeImage
                      src={promo.imageUrl}
                      alt={promo.altText}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{promo.title}</h3>
                      {promo.subtitle && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{promo.subtitle}</p>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                      <span>{promo.ctaText || 'Explore'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>
              ))}
            </section>
          )}

          {secondaryPromos.slice(0, 1).map((promo) => (
            <section key={promo._id} aria-label="Secondary promotional banner">
              <PromoBannerCard promo={promo} />
            </section>
          ))}
        </div>
      );
    }

    if (sec.id === 'best_sellers' || sec.collectionType === 'best_sellers') {
      if (bestSellers.length === 0) return null;
      return (
        <section key={sec.id} aria-labelledby="best-sellers-heading">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <h2 id="best-sellers-heading" className="text-lg font-bold text-slate-900">
                  {sec.title || 'Best Sellers'}
                </h2>
                <p className="text-xs text-slate-500">
                  {sec.subtitle || 'Most popular products based on verified orders'}
                </p>
              </div>
            </div>
            <Link
              to={sanitizeHref(sec.ctaLink || '/shop?sort=best_selling') || '/shop?sort=best_selling'}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
            >
              <span>{sec.ctaText || 'View All'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {bestSellers.slice(0, sec.productLimit || 5).map((item) => (
              <ProductCard key={item._id} product={item} />
            ))}
          </div>
        </section>
      );
    }

    if (sec.id === 'new_arrivals' || sec.collectionType === 'new_arrivals') {
      if (newArrivals.length === 0) return null;
      return (
        <section key={sec.id} aria-labelledby="new-arrivals-heading">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h2 id="new-arrivals-heading" className="text-lg font-bold text-slate-900">
                  {sec.title || 'New Arrivals'}
                </h2>
                <p className="text-xs text-slate-500">
                  {sec.subtitle || 'Freshly added products across our store'}
                </p>
              </div>
            </div>
            <Link
              to={sanitizeHref(sec.ctaLink || '/shop?sort=newest') || '/shop?sort=newest'}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
            >
              <span>{sec.ctaText || 'View All'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {newArrivals.slice(0, sec.productLimit || 5).map((item) => (
              <ProductCard key={item._id} product={item} />
            ))}
          </div>
        </section>
      );
    }

    if (sec.id === 'top_rated' || sec.collectionType === 'top_rated') {
      if (topRatedProducts.length === 0) return null;
      return (
        <section key={sec.id} aria-labelledby="top-rated-heading">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Star className="w-5 h-5 fill-amber-500 text-amber-500" />
              </div>
              <div>
                <h2 id="top-rated-heading" className="text-lg font-bold text-slate-900">
                  {sec.title || 'Top Rated Products'}
                </h2>
                <p className="text-xs text-slate-500">
                  {sec.subtitle || 'Highest rated by verified shoppers'}
                </p>
              </div>
            </div>
            <Link
              to={sanitizeHref(sec.ctaLink || '/shop?sort=top_rated') || '/shop?sort=top_rated'}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
            >
              <span>{sec.ctaText || 'View All'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {topRatedProducts.slice(0, sec.productLimit || 5).map((item) => (
              <ProductCard key={item._id} product={item} />
            ))}
          </div>
        </section>
      );
    }

    if (sec.id === 'on_sale' || sec.collectionType === 'on_sale') {
      if (onSaleProducts.length === 0) return null;
      return (
        <section key={sec.id} aria-labelledby="on-sale-heading">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <h2 id="on-sale-heading" className="text-lg font-bold text-slate-900">
                  {sec.title || 'Special Offers & Deals'}
                </h2>
                <p className="text-xs text-slate-500">
                  {sec.subtitle || 'Limited-time price drops across Bangladesh'}
                </p>
              </div>
            </div>
            <Link
              to={sanitizeHref(sec.ctaLink || '/deals') || '/deals'}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
            >
              <span>{sec.ctaText || 'View Deals'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {onSaleProducts.slice(0, sec.productLimit || 5).map((item) => (
              <ProductCard key={item._id} product={item} />
            ))}
          </div>
        </section>
      );
    }

    if (sec.collectionType === 'category_collection' && sec.categorySlug) {
      const catProducts = categoryCollections[sec.id] || [];
      if (catProducts.length === 0) return null;
      return (
        <section key={sec.id} aria-labelledby={`cat-col-${sec.id}`}>
          <div className="flex items-end justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <h2 id={`cat-col-${sec.id}`} className="text-lg font-bold text-slate-900">
                  {sec.title || sec.label}
                </h2>
                {sec.subtitle && <p className="text-xs text-slate-500">{sec.subtitle}</p>}
              </div>
            </div>
            <Link
              to={sanitizeHref(sec.ctaLink || `/category/${sec.categorySlug}`) || `/category/${sec.categorySlug}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
            >
              <span>{sec.ctaText || 'Explore Category'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {catProducts.slice(0, sec.productLimit || 5).map((item) => (
              <ProductCard key={item._id} product={item} />
            ))}
          </div>
        </section>
      );
    }

    if (sec.id === 'newsletter' || sec.collectionType === 'newsletter') {
      return (
        <section
          key={sec.id}
          className="rounded-2xl bg-gradient-to-r from-[#0A4F25] via-[#136F35] to-[#168A41] text-white p-6 sm:p-8 shadow-md"
        >
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-lime-400/20 text-lime-300 flex items-center justify-center shrink-0">
                <Mail className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold">Subscribe to Our Newsletter</h2>
                <p className="text-xs sm:text-sm text-emerald-100 mt-0.5">
                  Get the latest deals, new arrivals &amp; exclusive offers across Bangladesh.
                </p>
              </div>
            </div>

            <form onSubmit={handleNewsletterSubmit} className="w-full lg:w-auto flex-1 max-w-xl space-y-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  required
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder="Enter your email address"
                  aria-label="Newsletter email address"
                  className="flex-1 h-11 px-4 rounded-lg bg-white text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={subscribing}
                  className="h-11 px-6 rounded-lg bg-[#22C55E] hover:bg-lime-400 hover:text-slate-950 text-white text-sm font-bold transition-colors whitespace-nowrap disabled:opacity-60"
                >
                  {subscribing ? 'Subscribing...' : 'Subscribe'}
                </button>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-emerald-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newsletterConsent}
                  onChange={(e) => setNewsletterConsent(e.target.checked)}
                  className="rounded accent-lime-400"
                />
                <span>I consent to receive marketing updates from NOVARA COMMERCE (unsubscribe anytime).</span>
              </label>
            </form>

            <div className="hidden xl:flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 text-lime-300 shrink-0">
              <Sparkles className="w-7 h-7" />
            </div>
          </div>
        </section>
      );
    }

    return null;
  };

  return (
    <div className="bg-slate-50/70">
      <SeoHead
        title="NOVARA COMMERCE – Smart Shopping, Bigger Savings Across Bangladesh"
        description="Shop authentic electronics, fashion, books, beauty, and home essentials across Bangladesh with Cash on Delivery and 7-day easy returns."
      />

      {dbUnavailable && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-950">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>MongoDB Atlas connection required:</strong> Configure <code className="font-mono">MONGODB_URI</code> to load live catalog products, accounts, and orders.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 1. HERO CAMPAIGN BANNER */}
      {sectionEnabled('hero') && (
        <section className="relative overflow-hidden bg-gradient-to-br from-[#06381c] via-[#0d622e] to-[#178d40] text-white">
          <div className="max-w-7xl mx-auto px-4 py-8 lg:py-10 relative">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-5 z-10 space-y-4">
                {activeSlide.badge && (
                  <span className="inline-block px-3.5 py-1 rounded-full bg-[#16A34A] text-white text-xs font-semibold shadow-xs">
                    {activeSlide.badge}
                  </span>
                )}
                <h1 className="text-3xl sm:text-4xl lg:text-[2.85rem] font-extrabold leading-[1.12] tracking-tight text-balance">
                  {activeSlide.headlinePrefix}{' '}
                  {activeSlide.headlineHighlight && (
                    <span className="text-[#A3E635]">{activeSlide.headlineHighlight}</span>
                  )}{' '}
                  {activeSlide.headlineSuffix}
                </h1>
                <p className="text-sm sm:text-base text-emerald-50/90 font-medium">
                  {activeSlide.subtitle}
                </p>
                <div className="pt-1 flex items-center gap-3">
                  <Link
                    to={sanitizeHref(activeSlide.ctaLink || '/shop') || '/shop'}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#A3E635] hover:bg-lime-300 text-slate-950 text-sm font-bold transition-colors shadow-md"
                  >
                    <span>{activeSlide.ctaText || 'Shop Now'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-4 flex justify-center">
                <div className="relative w-full max-w-md aspect-[4/3] rounded-3xl overflow-hidden shadow-xl">
                  <picture>
                    {activeSlide.mobileImageUrl && (
                      <source media="(max-width: 767px)" srcSet={activeSlide.mobileImageUrl} />
                    )}
                    <SafeImage
                      src={activeSlide.imageUrl}
                      alt={activeSlide.headlinePrefix}
                      loading="eager"
                      className="w-full h-full object-cover"
                    />
                  </picture>
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a5428]/55 via-transparent to-[#0d622e]/45" />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#06381c]/50 via-transparent to-transparent" />
                </div>
              </div>

              <div className="lg:col-span-3 grid grid-cols-2 lg:grid-cols-1 gap-2.5">
                {trustPoints.slice(0, 4).map((tp, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 sm:gap-3 px-2.5 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-slate-950/35 backdrop-blur-sm border border-white/10"
                  >
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#A3E635]/15 text-[#A3E635] flex items-center justify-center shrink-0">
                      {tp.icon === 'gem' && <Gem className="w-4 h-4" />}
                      {tp.icon === 'shield' && <ShieldCheck className="w-4 h-4" />}
                      {tp.icon === 'rotate' && <RotateCcw className="w-4 h-4" />}
                      {tp.icon === 'headphones' && <Headphones className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] sm:text-xs font-bold text-white leading-tight">
                        {tp.title}
                      </p>
                      <p className="text-[10px] sm:text-[11px] text-emerald-100/80 leading-tight mt-0.5">
                        {tp.subtitle}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {heroSlides.length > 1 && (
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  aria-label="Previous hero slide"
                  onClick={() => setHeroIndex((prev) => (prev - 1 + heroSlides.length) % heroSlides.length)}
                  className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2">
                  {heroSlides.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      aria-label={`View slide ${idx + 1}`}
                      onClick={() => setHeroIndex(idx)}
                      className={`h-1.5 rounded-full transition-all ${
                        idx === heroIndex % heroSlides.length
                          ? 'w-7 bg-white'
                          : 'w-2.5 bg-white/40 hover:bg-white/70'
                      }`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  aria-label="Next hero slide"
                  onClick={() => setHeroIndex((prev) => (prev + 1) % heroSlides.length)}
                  className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-10">
        {orderedSections
          .filter((sec) => sec.id !== 'hero' && sec.id !== 'happy_clients')
          .map((sec) => renderSection(sec))}

        {sectionEnabled('promo_placement') &&
          bottomPromos.slice(0, 1).map((promo) => (
            <section key={promo._id} aria-label="Bottom promotional banner">
              <PromoBannerCard promo={promo} />
            </section>
          ))}

        {/* LATEST 4 APPROVED CUSTOMER REVIEWS IMMEDIATELY ABOVE FOOTER */}
        {sectionEnabled('happy_clients') && featuredReviews.length > 0 && (
          <section aria-labelledby="happy-clients-heading" className="pt-2">
            <div className="flex items-end justify-between gap-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Quote className="w-5 h-5" />
                </div>
                <div>
                  <h2 id="happy-clients-heading" className="text-lg font-bold text-slate-900">
                    {happyClientsSection?.title || 'Our Happy Clients'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {happyClientsSection?.subtitle ||
                      'Latest 4 verified customer reviews from NOVARA shoppers'}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {featuredReviews.slice(0, 4).map((review) => {
                const reviewedProduct =
                  review.productId && typeof review.productId === 'object'
                    ? review.productId
                    : null;
                return (
                  <article
                    key={review._id}
                    className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4 shadow-2xs"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-0.5 text-amber-400" aria-label={`${review.rating} out of 5 stars`}>
                          {Array.from({ length: 5 }).map((_, starIdx) => (
                            <Star
                              key={starIdx}
                              className={`w-3.5 h-3.5 ${
                                starIdx < review.rating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          {new Date(review.createdAt).toLocaleDateString('en-BD', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>

                      {review.title && (
                        <h3 className="text-xs font-bold text-slate-900 line-clamp-1">
                          {review.title}
                        </h3>
                      )}

                      <p className="text-xs sm:text-sm text-slate-700 leading-relaxed line-clamp-4">
                        &ldquo;{review.comment}&rdquo;
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center overflow-hidden shrink-0">
                          {review.userAvatar ? (
                            <SafeImage
                              src={review.userAvatar}
                              alt={review.userName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span>{review.userName.slice(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 text-xs font-bold text-slate-900">
                            <span className="truncate">{review.userName}</span>
                            {review.verifiedPurchase && (
                              <CheckCircle2
                                className="w-3.5 h-3.5 text-emerald-600 shrink-0"
                                aria-label="Verified purchase"
                              />
                            )}
                          </div>
                          {review.verifiedPurchase && (
                            <p className="text-[10px] font-medium text-emerald-700">
                              Verified Buyer
                            </p>
                          )}
                        </div>
                      </div>

                      {reviewedProduct && (
                        <Link
                          to={`/product/${reviewedProduct.slug}`}
                          className="block text-[11px] font-semibold text-emerald-700 hover:underline truncate"
                        >
                          {reviewedProduct.name}
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
