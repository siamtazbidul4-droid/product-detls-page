import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAppDispatch } from '../../app/hooks.ts';
import { CloudinaryUploadField } from '../../components/ui/CloudinaryUploadField.tsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.tsx';
import { Modal } from '../../components/ui/Modal.tsx';
import { SafeImage } from '../../components/ui/SafeImage.tsx';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { apiRequest } from '../../lib/api.ts';
import type {
  Category,
  CheckoutBannerConfig,
  HomepageConfig,
  PromotionalPlacement,
} from '../../types/domain.ts';
import { AdminWishlistSlidesTab } from './AdminWishlistSlidesTab.tsx';

export function AdminCmsPage() {
  const dispatch = useAppDispatch();
  const [cmsTab, setCmsTab] = useState<'wishlist_slides' | 'checkout_banner' | 'promotions' | 'homepage'>('wishlist_slides');
  const [homepage, setHomepage] = useState<HomepageConfig | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [checkoutBanner, setCheckoutBanner] = useState<CheckoutBannerConfig>({
    enabled: true,
    badgeText: 'Secure Checkout',
    heading: 'Checkout',
    subtitle: 'Complete your order quickly and securely',
    desktopImageUrl: '',
    desktopImagePublicId: '',
    mobileImageUrl: '',
    mobileImagePublicId: '',
    altText: 'Secure Checkout Banner',
  });
  const [savingCheckoutBanner, setSavingCheckoutBanner] = useState(false);
  const [promotions, setPromotions] = useState<PromotionalPlacement[]>([]);
  const [savingCms, setSavingCms] = useState(false);

  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromotionalPlacement | null>(null);
  const [promoForm, setPromoForm] = useState({
    title: '',
    subtitle: '',
    ctaText: 'Shop Now',
    destinationUrl: '/shop',
    altText: '',
    imageUrl: '/src/assets/images/promo_tech_laptops_1795621230990.jpg',
    imagePublicId: '',
    placementSlot: 'homepage_mid_banner' as PromotionalPlacement['placementSlot'],
    layoutStyle: 'dark_emerald_banner' as PromotionalPlacement['layoutStyle'],
    displayOrder: 0,
    isEnabled: true,
    status: 'published' as 'draft' | 'published',
    startsAt: '',
    endsAt: '',
  });
  const [savingPromo, setSavingPromo] = useState(false);
  const [deletePromoId, setDeletePromoId] = useState<string | null>(null);

  const loadData = () => {
    Promise.all([
      apiRequest<{ homepage: HomepageConfig }>('/api/cms/admin/homepage'),
      apiRequest<{ promotions: PromotionalPlacement[] }>('/api/cms/admin/promotions'),
      apiRequest<{ banner: CheckoutBannerConfig }>('/api/cms/admin/checkout-banner'),
      apiRequest<{ categories: Category[] }>('/api/catalog/categories?all=true'),
    ])
      .then(([cmsRes, promoRes, checkoutRes, catRes]) => {
        if (cmsRes.homepage) {
          setHomepage({
            ...cmsRes.homepage,
            sections: [...(cmsRes.homepage.sections || [])].sort(
              (a, b) => (a.order ?? 0) - (b.order ?? 0)
            ),
            heroSlides: [...(cmsRes.homepage.heroSlides || [])].sort(
              (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
            ),
          });
        }
        setPromotions(promoRes.promotions || []);
        setCategories(catRes.categories || []);
        if (checkoutRes?.banner) {
          setCheckoutBanner(checkoutRes.banner);
        }
      })
      .catch((err) => {
        dispatch(
          pushToast({
            variant: 'error',
            message: err instanceof Error ? err.message : 'Unable to load CMS data.',
          })
        );
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveCheckoutBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCheckoutBanner(true);
    try {
      const res = await apiRequest<{ banner: CheckoutBannerConfig }>('/api/cms/admin/checkout-banner', {
        method: 'PUT',
        body: JSON.stringify(checkoutBanner),
      });
      setCheckoutBanner(res.banner);
      dispatch(pushToast({ variant: 'success', message: 'Checkout Hero Banner saved.' }));
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Failed to save checkout banner.',
        })
      );
    } finally {
      setSavingCheckoutBanner(false);
    }
  };

  const handleSaveHomepage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!homepage) return;
    setSavingCms(true);
    try {
      const normalizedPayload = {
        ...homepage,
        sections: homepage.sections.map((s, idx) => ({ ...s, order: idx + 1 })),
        heroSlides: homepage.heroSlides.map((s, idx) => ({ ...s, displayOrder: idx })),
      };
      const res = await apiRequest<{ homepage: HomepageConfig }>('/api/cms/admin/homepage', {
        method: 'PUT',
        body: JSON.stringify(normalizedPayload),
      });
      setHomepage(res.homepage);
      dispatch(pushToast({ variant: 'success', message: 'Homepage CMS configuration saved.' }));
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Failed to save homepage CMS.',
        })
      );
    } finally {
      setSavingCms(false);
    }
  };

  const moveSection = (index: number, dir: -1 | 1) => {
    setHomepage((prev) => {
      if (!prev) return prev;
      const target = index + dir;
      if (target < 0 || target >= prev.sections.length) return prev;
      const next = [...prev.sections];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return {
        ...prev,
        sections: next.map((s, idx) => ({ ...s, order: idx + 1 })),
      };
    });
  };

  const addCategoryCollectionSection = () => {
    const firstCat = categories[0];
    setHomepage((prev) => {
      if (!prev) return prev;
      const id = `cat_col_${Date.now()}`;
      return {
        ...prev,
        sections: [
          ...prev.sections,
          {
            id,
            label: firstCat ? `${firstCat.name} Collection` : 'Category Collection',
            enabled: true,
            order: prev.sections.length + 1,
            title: firstCat ? `${firstCat.name} Spotlight` : 'Category Spotlight',
            subtitle: 'Curated selection from this category',
            collectionType: 'category_collection',
            productLimit: 5,
            categorySlug: firstCat?.slug || '',
            ctaText: 'View Category',
            ctaLink: firstCat ? `/category/${firstCat.slug}` : '/shop',
          },
        ],
      };
    });
  };

  const moveHeroSlide = (index: number, dir: -1 | 1) => {
    setHomepage((prev) => {
      if (!prev) return prev;
      const target = index + dir;
      if (target < 0 || target >= prev.heroSlides.length) return prev;
      const next = [...prev.heroSlides];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return {
        ...prev,
        heroSlides: next.map((s, idx) => ({ ...s, displayOrder: idx })),
      };
    });
  };

  const addHeroSlide = () => {
    setHomepage((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        heroSlides: [
          ...prev.heroSlides,
          {
            badge: 'New Campaign',
            headlinePrefix: 'Discover Fresh',
            headlineHighlight: 'Deals',
            headlineSuffix: 'Today',
            subtitle: 'Authentic products delivered nationwide across Bangladesh',
            ctaText: 'Shop Now',
            ctaLink: '/shop',
            imageUrl: '/src/assets/images/hero_shopper_bags_1795621229978.jpg',
            mobileImageUrl: '',
            displayOrder: prev.heroSlides.length,
            isActive: true,
          },
        ],
      };
    });
  };

  const openPromoModal = (promo?: PromotionalPlacement) => {
    if (promo) {
      setEditingPromo(promo);
      setPromoForm({
        title: promo.title,
        subtitle: promo.subtitle || '',
        ctaText: promo.ctaText || 'Shop Now',
        destinationUrl: promo.destinationUrl,
        altText: promo.altText,
        imageUrl: promo.imageUrl,
        imagePublicId: promo.imagePublicId || '',
        placementSlot: promo.placementSlot,
        layoutStyle: promo.layoutStyle,
        displayOrder: promo.displayOrder ?? 0,
        isEnabled: promo.isEnabled,
        status: promo.status,
        startsAt: promo.startsAt ? promo.startsAt.slice(0, 16) : '',
        endsAt: promo.endsAt ? promo.endsAt.slice(0, 16) : '',
      });
    } else {
      setEditingPromo(null);
      setPromoForm({
        title: '',
        subtitle: '',
        ctaText: 'Shop Now',
        destinationUrl: '/shop',
        altText: 'Promotional campaign banner',
        imageUrl: '/src/assets/images/promo_tech_laptops_1795621230990.jpg',
        imagePublicId: '',
        placementSlot: 'homepage_mid_banner',
        layoutStyle: 'dark_emerald_banner',
        displayOrder: 0,
        isEnabled: true,
        status: 'published',
        startsAt: '',
        endsAt: '',
      });
    }
    setPromoModalOpen(true);
  };

  const handleSavePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPromo(true);
    try {
      const payload = {
        ...promoForm,
        displayOrder: Number(promoForm.displayOrder) || 0,
        imagePublicId: promoForm.imagePublicId || undefined,
        startsAt: promoForm.startsAt ? new Date(promoForm.startsAt).toISOString() : null,
        endsAt: promoForm.endsAt ? new Date(promoForm.endsAt).toISOString() : null,
      };
      const url = editingPromo
        ? `/api/cms/admin/promotions/${editingPromo._id}`
        : '/api/cms/admin/promotions';
      await apiRequest(url, {
        method: editingPromo ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      setPromoModalOpen(false);
      dispatch(
        pushToast({
          variant: 'success',
          message: editingPromo ? 'Promotional placement updated.' : 'Promotional placement created.',
        })
      );
      loadData();
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Unable to save promotional placement.',
        })
      );
    } finally {
      setSavingPromo(false);
    }
  };

  const handleDeletePromo = async () => {
    if (!deletePromoId) return;
    try {
      await apiRequest(`/api/cms/admin/promotions/${deletePromoId}`, { method: 'DELETE' });
      setDeletePromoId(null);
      dispatch(pushToast({ variant: 'info', message: 'Promotional placement removed.' }));
      loadData();
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Failed to delete placement.',
        })
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        {(
          [
            ['wishlist_slides', 'Wishlist Hero Slideshow'],
            ['checkout_banner', 'Checkout Hero Banner'],
            ['promotions', 'Promotional Banners'],
            ['homepage', 'Homepage Sections & Hero'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setCmsTab(id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              cmsTab === id
                ? 'bg-[#16A34A] text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {cmsTab === 'wishlist_slides' && <AdminWishlistSlidesTab />}

      {cmsTab === 'checkout_banner' && (
        <form
          onSubmit={handleSaveCheckoutBanner}
          className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Checkout Hero Banner</h2>
              <p className="text-xs text-slate-500">
                Customize the green checkout header banner or upload custom Cloudinary artwork. When disabled, the checkout page starts directly at the form.
              </p>
            </div>
            <button
              type="submit"
              disabled={savingCheckoutBanner}
              className="px-5 py-2 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-60"
            >
              {savingCheckoutBanner ? 'Saving...' : 'Save Checkout Banner'}
            </button>
          </div>

          <label className="inline-flex items-center gap-2.5 text-sm font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={checkoutBanner.enabled}
              onChange={(e) =>
                setCheckoutBanner((b) => ({ ...b, enabled: e.target.checked }))
              }
              className="rounded border-slate-300 text-emerald-600"
            />
            <span>Enable Checkout Hero Banner</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Badge Text</label>
              <input
                type="text"
                maxLength={50}
                value={checkoutBanner.badgeText}
                onChange={(e) =>
                  setCheckoutBanner((b) => ({ ...b, badgeText: e.target.value }))
                }
                placeholder="Secure Checkout"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Heading *</label>
              <input
                type="text"
                required
                maxLength={100}
                value={checkoutBanner.heading}
                onChange={(e) =>
                  setCheckoutBanner((b) => ({ ...b, heading: e.target.value }))
                }
                placeholder="Checkout"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subtitle</label>
              <input
                type="text"
                maxLength={220}
                value={checkoutBanner.subtitle}
                onChange={(e) =>
                  setCheckoutBanner((b) => ({ ...b, subtitle: e.target.value }))
                }
                placeholder="Complete your order quickly and securely"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Banner Image Alt Text
              </label>
              <input
                type="text"
                maxLength={180}
                value={checkoutBanner.altText || ''}
                onChange={(e) =>
                  setCheckoutBanner((b) => ({ ...b, altText: e.target.value }))
                }
                placeholder="Secure Checkout Banner"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div className="space-y-2">
              <CloudinaryUploadField
                folder="cms"
                label="Upload Desktop Banner Background (Optional)"
                onUploaded={(asset) =>
                  setCheckoutBanner((b) => ({
                    ...b,
                    desktopImageUrl: asset.url,
                    desktopImagePublicId: asset.publicId,
                  }))
                }
              />
              {checkoutBanner.desktopImageUrl && (
                <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <SafeImage
                    src={checkoutBanner.desktopImageUrl}
                    alt="Desktop preview"
                    className="h-12 w-24 object-cover rounded"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setCheckoutBanner((b) => ({
                        ...b,
                        desktopImageUrl: '',
                        desktopImagePublicId: '',
                      }))
                    }
                    className="px-2.5 py-1 rounded border border-slate-200 bg-white text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Clear Desktop Image
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <CloudinaryUploadField
                folder="cms"
                label="Upload Mobile Banner Background (Optional)"
                onUploaded={(asset) =>
                  setCheckoutBanner((b) => ({
                    ...b,
                    mobileImageUrl: asset.url,
                    mobileImagePublicId: asset.publicId,
                  }))
                }
              />
              {checkoutBanner.mobileImageUrl && (
                <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <SafeImage
                    src={checkoutBanner.mobileImageUrl}
                    alt="Mobile preview"
                    className="h-12 w-24 object-cover rounded"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setCheckoutBanner((b) => ({
                        ...b,
                        mobileImageUrl: '',
                        mobileImagePublicId: '',
                      }))
                    }
                    className="px-2.5 py-1 rounded border border-slate-200 bg-white text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Clear Mobile Image
                  </button>
                </div>
              )}
            </div>
          </div>

          <div
            className={`rounded-2xl overflow-hidden bg-gradient-to-r from-[#0A2E1A] via-[#157A2E] to-[#32A82E] p-6 text-white relative ${
              checkoutBanner.enabled ? 'opacity-100' : 'opacity-45'
            }`}
          >
            {checkoutBanner.desktopImageUrl && (
              <SafeImage
                src={checkoutBanner.desktopImageUrl}
                alt={checkoutBanner.altText || 'Checkout banner preview'}
                className="absolute inset-0 w-full h-full object-cover opacity-30"
              />
            )}
            <div className="relative z-10 space-y-1.5">
              <span className="inline-block px-3 py-1 rounded-full bg-[#22C55E] text-white text-[11px] font-bold">
                {checkoutBanner.badgeText || 'Secure Checkout'}
              </span>
              <h3 className="text-2xl font-black tracking-tight">
                {checkoutBanner.heading || 'Checkout'}
              </h3>
              <p className="text-xs text-emerald-50/90">
                {checkoutBanner.subtitle || 'Complete your order quickly and securely'}
              </p>
            </div>
          </div>
        </form>
      )}

      {/* Promotional Ad Placements */}
      {cmsTab === 'promotions' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                Promotional Ad Placements &amp; Banners
              </h2>
              <p className="text-xs text-slate-500">
                If disabled or unconfigured, the storefront omits the slot cleanly with zero broken placeholders.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openPromoModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-semibold"
            >
              <Plus className="w-4 h-4" /> Create Placement
            </button>
          </div>

          {promotions.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              No promotional ad placements configured yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {promotions.map((p) => (
                <div
                  key={p._id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <SafeImage
                      src={p.imageUrl}
                      alt={p.altText}
                      className="w-20 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                    />
                    <div>
                      <p className="text-sm font-bold text-slate-900">{p.title}</p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {p.placementSlot} · Order #{p.displayOrder ?? 0} · {p.destinationUrl}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        p.isEnabled && p.status === 'published'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {p.isEnabled ? p.status : 'Disabled'}
                    </span>
                    <button
                      type="button"
                      onClick={() => openPromoModal(p)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
                      aria-label={`Edit ${p.title}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletePromoId(p._id)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-red-50 text-red-600"
                      aria-label={`Delete ${p.title}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Homepage Section Visibility, Ordering & Multi-Slide Hero Editor */}
      {cmsTab === 'homepage' && homepage && (
        <form
          onSubmit={handleSaveHomepage}
          className="space-y-6"
        >
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Homepage Dynamic Sections</h2>
                <p className="text-xs text-slate-500">
                  Toggle, reorder, and configure storefront sections and category collections.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addCategoryCollectionSection}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Category Section
                </button>
                <button
                  type="submit"
                  disabled={savingCms}
                  className="px-5 py-2 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-60"
                >
                  {savingCms ? 'Saving...' : 'Save Homepage CMS'}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {homepage.sections.map((sec, idx) => (
                <div
                  key={sec.id}
                  className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={sec.enabled}
                        aria-label={`Enable ${sec.label}`}
                        onChange={(e) =>
                          setHomepage((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  sections: prev.sections.map((s, i) =>
                                    i === idx ? { ...s, enabled: e.target.checked } : s
                                  ),
                                }
                              : prev
                          )
                        }
                        className="rounded accent-emerald-600"
                      />
                      <div>
                        <p className="text-sm font-bold text-slate-900">{sec.label}</p>
                        <p className="text-[11px] font-mono text-slate-500">
                          Order #{idx + 1} · {sec.collectionType || sec.id}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveSection(idx, -1)}
                        aria-label={`Move ${sec.label} up`}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-35"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === homepage.sections.length - 1}
                        onClick={() => moveSection(idx, 1)}
                        aria-label={`Move ${sec.label} down`}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-35"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      {sec.id.startsWith('cat_col_') && (
                        <button
                          type="button"
                          onClick={() =>
                            setHomepage((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    sections: prev.sections.filter((_, i) => i !== idx),
                                  }
                                : prev
                            )
                          }
                          aria-label={`Remove ${sec.label}`}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {!['hero', 'dual_banners', 'promo_placement', 'newsletter'].includes(sec.id) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-200/70">
                      <input
                        type="text"
                        value={sec.title || ''}
                        onChange={(e) =>
                          setHomepage((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  sections: prev.sections.map((s, i) =>
                                    i === idx ? { ...s, title: e.target.value } : s
                                  ),
                                }
                              : prev
                          )
                        }
                        placeholder="Section Title"
                        className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
                      />
                      <input
                        type="text"
                        value={sec.subtitle || ''}
                        onChange={(e) =>
                          setHomepage((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  sections: prev.sections.map((s, i) =>
                                    i === idx ? { ...s, subtitle: e.target.value } : s
                                  ),
                                }
                              : prev
                          )
                        }
                        placeholder="Subtitle"
                        className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
                      />
                      {sec.collectionType === 'category_collection' && (
                        <select
                          value={sec.categorySlug || ''}
                          onChange={(e) =>
                            setHomepage((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    sections: prev.sections.map((s, i) =>
                                      i === idx ? { ...s, categorySlug: e.target.value } : s
                                    ),
                                  }
                                : prev
                            )
                          }
                          aria-label="Category collection slug"
                          className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
                        >
                          <option value="">Select Category</option>
                          {categories.map((cat) => (
                            <option key={cat._id} value={cat.slug}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {['featured_products', 'best_sellers', 'new_arrivals', 'top_rated', 'on_sale', 'category_collection'].includes(
                        sec.collectionType || sec.id
                      ) && (
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={sec.productLimit ?? 5}
                          onChange={(e) =>
                            setHomepage((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    sections: prev.sections.map((s, i) =>
                                      i === idx
                                        ? { ...s, productLimit: Math.max(1, Math.min(20, Number(e.target.value) || 5)) }
                                        : s
                                    ),
                                  }
                                : prev
                            )
                          }
                          placeholder="Limit (1-20)"
                          aria-label="Product count limit"
                          className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs tabular-nums"
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Homepage Hero Slideshow</h2>
                <p className="text-xs text-slate-500">
                  Manage slides, responsive desktop/mobile artwork, CTA links, and active status.
                </p>
              </div>
              <button
                type="button"
                onClick={addHeroSlide}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
              >
                <Plus className="w-3.5 h-3.5" /> Add Hero Slide
              </button>
            </div>

            <div className="space-y-4">
              {homepage.heroSlides.map((slide, idx) => (
                <div
                  key={idx}
                  className="border border-slate-200 rounded-xl p-4 space-y-4 bg-slate-50/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={slide.isActive}
                        aria-label={`Slide ${idx + 1} active`}
                        onChange={(e) =>
                          setHomepage((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  heroSlides: prev.heroSlides.map((s, i) =>
                                    i === idx ? { ...s, isActive: e.target.checked } : s
                                  ),
                                }
                              : prev
                          )
                        }
                        className="rounded accent-emerald-600"
                      />
                      <span className="text-xs font-bold uppercase text-slate-700">
                        Slide #{idx + 1} {slide.isActive ? '(Active)' : '(Hidden)'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveHeroSlide(idx, -1)}
                        aria-label={`Move slide ${idx + 1} up`}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-35"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === homepage.heroSlides.length - 1}
                        onClick={() => moveHeroSlide(idx, 1)}
                        aria-label={`Move slide ${idx + 1} down`}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-35"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      {homepage.heroSlides.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setHomepage((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    heroSlides: prev.heroSlides.filter((_, i) => i !== idx),
                                  }
                                : prev
                            )
                          }
                          aria-label={`Delete slide ${idx + 1}`}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <input
                      type="text"
                      value={slide.badge}
                      onChange={(e) =>
                        setHomepage((prev) =>
                          prev
                            ? {
                                ...prev,
                                heroSlides: prev.heroSlides.map((s, i) =>
                                  i === idx ? { ...s, badge: e.target.value } : s
                                ),
                              }
                            : prev
                        )
                      }
                      placeholder="Badge"
                      className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
                    />
                    <input
                      type="text"
                      required
                      value={slide.headlinePrefix}
                      onChange={(e) =>
                        setHomepage((prev) =>
                          prev
                            ? {
                                ...prev,
                                heroSlides: prev.heroSlides.map((s, i) =>
                                  i === idx ? { ...s, headlinePrefix: e.target.value } : s
                                ),
                              }
                            : prev
                        )
                      }
                      placeholder="Headline Prefix"
                      className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
                    />
                    <input
                      type="text"
                      value={slide.headlineHighlight}
                      onChange={(e) =>
                        setHomepage((prev) =>
                          prev
                            ? {
                                ...prev,
                                heroSlides: prev.heroSlides.map((s, i) =>
                                  i === idx ? { ...s, headlineHighlight: e.target.value } : s
                                ),
                              }
                            : prev
                        )
                      }
                      placeholder="Highlight Word"
                      className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
                    />
                    <input
                      type="text"
                      value={slide.headlineSuffix}
                      onChange={(e) =>
                        setHomepage((prev) =>
                          prev
                            ? {
                                ...prev,
                                heroSlides: prev.heroSlides.map((s, i) =>
                                  i === idx ? { ...s, headlineSuffix: e.target.value } : s
                                ),
                              }
                            : prev
                        )
                      }
                      placeholder="Headline Suffix"
                      className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      value={slide.subtitle}
                      onChange={(e) =>
                        setHomepage((prev) =>
                          prev
                            ? {
                                ...prev,
                                heroSlides: prev.heroSlides.map((s, i) =>
                                  i === idx ? { ...s, subtitle: e.target.value } : s
                                ),
                              }
                            : prev
                        )
                      }
                      placeholder="Subtitle"
                      className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
                    />
                    <input
                      type="text"
                      required
                      value={slide.ctaText}
                      onChange={(e) =>
                        setHomepage((prev) =>
                          prev
                            ? {
                                ...prev,
                                heroSlides: prev.heroSlides.map((s, i) =>
                                  i === idx ? { ...s, ctaText: e.target.value } : s
                                ),
                              }
                            : prev
                        )
                      }
                      placeholder="CTA Text"
                      className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
                    />
                    <input
                      type="text"
                      required
                      value={slide.ctaLink}
                      onChange={(e) =>
                        setHomepage((prev) =>
                          prev
                            ? {
                                ...prev,
                                heroSlides: prev.heroSlides.map((s, i) =>
                                  i === idx ? { ...s, ctaLink: e.target.value } : s
                                ),
                              }
                            : prev
                        )
                      }
                      placeholder="/shop"
                      className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <CloudinaryUploadField
                        folder="cms"
                        label="Desktop Slide Image"
                        onUploaded={(asset) =>
                          setHomepage((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  heroSlides: prev.heroSlides.map((s, i) =>
                                    i === idx
                                      ? { ...s, imageUrl: asset.url, imagePublicId: asset.publicId }
                                      : s
                                  ),
                                }
                              : prev
                          )
                        }
                      />
                      {slide.imageUrl && (
                        <SafeImage
                          src={slide.imageUrl}
                          alt={`Slide ${idx + 1} desktop`}
                          className="h-16 w-28 object-cover rounded-lg border border-slate-200"
                        />
                      )}
                    </div>
                    <div className="space-y-2">
                      <CloudinaryUploadField
                        folder="cms"
                        label="Mobile Slide Image (Optional)"
                        onUploaded={(asset) =>
                          setHomepage((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  heroSlides: prev.heroSlides.map((s, i) =>
                                    i === idx
                                      ? {
                                          ...s,
                                          mobileImageUrl: asset.url,
                                          mobileImagePublicId: asset.publicId,
                                        }
                                      : s
                                  ),
                                }
                              : prev
                          )
                        }
                      />
                      {slide.mobileImageUrl && (
                        <div className="flex items-center gap-2">
                          <SafeImage
                            src={slide.mobileImageUrl}
                            alt={`Slide ${idx + 1} mobile`}
                            className="h-16 w-28 object-cover rounded-lg border border-slate-200"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setHomepage((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      heroSlides: prev.heroSlides.map((s, i) =>
                                        i === idx
                                          ? { ...s, mobileImageUrl: '', mobileImagePublicId: '' }
                                          : s
                                      ),
                                    }
                                  : prev
                              )
                            }
                            className="px-2 py-1 rounded border border-slate-200 bg-white text-[11px] font-semibold text-red-600"
                          >
                            Clear Mobile
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>
      )}

      {/* Promotional Placement Modal */}
      <Modal
        open={promoModalOpen}
        onClose={() => setPromoModalOpen(false)}
        title={editingPromo ? 'Edit Promotional Placement' : 'Create Promotional Placement'}
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleSavePromo} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
              <input
                type="text"
                required
                value={promoForm.title}
                onChange={(e) => setPromoForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Upgrade Your Life with the Best Tech"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Destination URL
              </label>
              <input
                type="text"
                required
                value={promoForm.destinationUrl}
                onChange={(e) => setPromoForm((f) => ({ ...f, destinationUrl: e.target.value }))}
                placeholder="/category/electronics"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subtitle</label>
              <input
                type="text"
                value={promoForm.subtitle}
                onChange={(e) => setPromoForm((f) => ({ ...f, subtitle: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Button Text
              </label>
              <input
                type="text"
                value={promoForm.ctaText}
                onChange={(e) => setPromoForm((f) => ({ ...f, ctaText: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Placement Slot
              </label>
              <select
                value={promoForm.placementSlot}
                onChange={(e) =>
                  setPromoForm((f) => ({
                    ...f,
                    placementSlot: e.target.value as PromotionalPlacement['placementSlot'],
                  }))
                }
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="homepage_mid_banner">Homepage Mid Banner</option>
                <option value="homepage_secondary_banner">Homepage Secondary Banner</option>
                <option value="homepage_triple_banners">Homepage 3-Column Ad Grid</option>
                <option value="homepage_bottom_banner">Homepage Bottom Banner</option>
                <option value="homepage_sidebar">Homepage Sidebar</option>
                <option value="top_strip">Top Strip</option>
                <option value="wishlist_bottom_banner">Wishlist Bottom Banner (&quot;Don&apos;t Miss Out!&quot;)</option>
                <option value="wishlist_sidebar">Wishlist Sidebar Card</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Visual Layout Style
              </label>
              <select
                value={promoForm.layoutStyle}
                onChange={(e) =>
                  setPromoForm((f) => ({
                    ...f,
                    layoutStyle: e.target.value as PromotionalPlacement['layoutStyle'],
                  }))
                }
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="dark_emerald_banner">Dark Emerald Banner</option>
                <option value="soft_sage_banner">Soft Sage Banner</option>
                <option value="clean_card">Clean Card</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Display Order
              </label>
              <input
                type="number"
                min={0}
                value={promoForm.displayOrder}
                onChange={(e) =>
                  setPromoForm((f) => ({ ...f, displayOrder: Number(e.target.value) || 0 }))
                }
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alt Text (Accessibility)
              </label>
              <input
                type="text"
                required
                value={promoForm.altText}
                onChange={(e) => setPromoForm((f) => ({ ...f, altText: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={promoForm.status}
                onChange={(e) =>
                  setPromoForm((f) => ({ ...f, status: e.target.value as 'draft' | 'published' }))
                }
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <CloudinaryUploadField
              folder="promotions"
              label="Upload Banner Image"
              onUploaded={(asset) =>
                setPromoForm((f) => ({
                  ...f,
                  imageUrl: asset.url,
                  imagePublicId: asset.publicId,
                }))
              }
            />
            <div className="rounded-xl overflow-hidden bg-[#062E22] p-4 text-white flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] text-lime-300 uppercase font-bold flex items-center gap-1">
                  <Eye className="w-3 h-3" /> Live Placement Preview
                </p>
                <p className="text-base font-extrabold mt-0.5">
                  {promoForm.title || 'Banner Title'}
                </p>
                <p className="text-xs text-emerald-100">{promoForm.subtitle}</p>
              </div>
              <SafeImage
                src={promoForm.imageUrl}
                alt={promoForm.altText}
                className="w-28 h-14 object-cover rounded-lg border border-white/20"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={promoForm.isEnabled}
              onChange={(e) => setPromoForm((f) => ({ ...f, isEnabled: e.target.checked }))}
            />
            <span>Enable placement on storefront</span>
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPromoModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingPromo}
              className="px-5 py-2 rounded-lg bg-[#16A34A] text-white text-sm font-semibold disabled:opacity-60"
            >
              {savingPromo ? 'Saving...' : 'Save Placement'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletePromoId)}
        onClose={() => setDeletePromoId(null)}
        onConfirm={handleDeletePromo}
        title="Delete Promotional Placement"
        message="Remove this promotional placement? If no other placements remain active, the homepage slot will collapse cleanly."
        confirmLabel="Delete Placement"
        danger
      />
    </div>
  );
}
