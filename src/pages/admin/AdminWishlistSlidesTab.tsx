import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useAppDispatch } from '../../app/hooks.ts';
import { CloudinaryUploadField } from '../../components/ui/CloudinaryUploadField.tsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.tsx';
import { Modal } from '../../components/ui/Modal.tsx';
import { SafeImage } from '../../components/ui/SafeImage.tsx';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { apiRequest } from '../../lib/api.ts';
import type { WishlistHeroSlide, WishlistSliderSettings } from '../../types/domain.ts';

interface SlideFormState {
  title: string;
  subtitle: string;
  ctaText: string;
  ctaDestination: string;
  desktopImageUrl: string;
  desktopImagePublicId: string;
  mobileImageUrl: string;
  mobileImagePublicId: string;
  altText: string;
  displayOrder: number;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
}

const emptySlideForm = (order = 0): SlideFormState => ({
  title: '',
  subtitle: '',
  ctaText: 'Explore Deals',
  ctaDestination: '/shop?onSale=true',
  desktopImageUrl: '/src/assets/images/hero_shopper_bags_1795621229978.jpg',
  desktopImagePublicId: '',
  mobileImageUrl: '',
  mobileImagePublicId: '',
  altText: 'Wishlist hero campaign slide',
  displayOrder: order,
  isActive: true,
  startsAt: '',
  endsAt: '',
});

export function AdminWishlistSlidesTab() {
  const dispatch = useAppDispatch();
  const [slides, setSlides] = useState<WishlistHeroSlide[]>([]);
  const [settings, setSettings] = useState<WishlistSliderSettings>({
    autoplay: true,
    transitionDurationMs: 5000,
  });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<WishlistHeroSlide | null>(null);
  const [form, setForm] = useState<SlideFormState>(emptySlideForm());
  const [savingSlide, setSavingSlide] = useState(false);
  const [deleteSlideId, setDeleteSlideId] = useState<string | null>(null);

  const loadSlides = () => {
    setLoading(true);
    apiRequest<{ slides: WishlistHeroSlide[]; sliderSettings: WishlistSliderSettings }>(
      '/api/cms/admin/wishlist-slides'
    )
      .then((res) => {
        setSlides(res.slides || []);
        if (res.sliderSettings) setSettings(res.sliderSettings);
      })
      .catch((err) => {
        dispatch(
          pushToast({
            variant: 'error',
            message: err instanceof Error ? err.message : 'Unable to load wishlist hero slides.',
          })
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSlides();
  }, []);

  const openModal = (slide?: WishlistHeroSlide) => {
    if (slide) {
      setEditingSlide(slide);
      setForm({
        title: slide.title,
        subtitle: slide.subtitle || '',
        ctaText: slide.ctaText || '',
        ctaDestination: slide.ctaDestination || '',
        desktopImageUrl: slide.desktopImageUrl,
        desktopImagePublicId: slide.desktopImagePublicId || '',
        mobileImageUrl: slide.mobileImageUrl || '',
        mobileImagePublicId: slide.mobileImagePublicId || '',
        altText: slide.altText || 'Wishlist hero slide',
        displayOrder: slide.displayOrder,
        isActive: slide.isActive,
        startsAt: slide.startsAt ? slide.startsAt.slice(0, 16) : '',
        endsAt: slide.endsAt ? slide.endsAt.slice(0, 16) : '',
      });
    } else {
      setEditingSlide(null);
      setForm(emptySlideForm(slides.length));
    }
    setModalOpen(true);
  };

  const handleSaveSlide = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSlide(true);
    try {
      const payload = {
        ...form,
        desktopImagePublicId: form.desktopImagePublicId || undefined,
        mobileImagePublicId: form.mobileImagePublicId || undefined,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      };
      const url = editingSlide
        ? `/api/cms/admin/wishlist-slides/${editingSlide._id}`
        : '/api/cms/admin/wishlist-slides';

      await apiRequest(url, {
        method: editingSlide ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });

      setModalOpen(false);
      dispatch(
        pushToast({
          variant: 'success',
          message: editingSlide ? 'Wishlist slide updated.' : 'Wishlist slide created.',
        })
      );
      loadSlides();
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Unable to save wishlist slide.',
        })
      );
    } finally {
      setSavingSlide(false);
    }
  };

  const handleToggleActive = async (slide: WishlistHeroSlide) => {
    try {
      await apiRequest(`/api/cms/admin/wishlist-slides/${slide._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !slide.isActive }),
      });
      setSlides((prev) =>
        prev.map((s) => (s._id === slide._id ? { ...s, isActive: !s.isActive } : s))
      );
      dispatch(
        pushToast({
          variant: 'success',
          message: slide.isActive ? 'Slide disabled.' : 'Slide enabled.',
        })
      );
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Unable to update slide status.',
        })
      );
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= slides.length) return;
    const reordered = [...slides];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    setSlides(reordered);

    try {
      const res = await apiRequest<{ slides: WishlistHeroSlide[] }>(
        '/api/cms/admin/wishlist-slides/reorder',
        {
          method: 'PUT',
          body: JSON.stringify({ orderedIds: reordered.map((s) => s._id) }),
        }
      );
      setSlides(res.slides);
      dispatch(pushToast({ variant: 'success', message: 'Slide order updated.' }));
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Unable to reorder slides.',
        })
      );
      loadSlides();
    }
  };

  const handleDeleteSlide = async () => {
    if (!deleteSlideId) return;
    try {
      await apiRequest(`/api/cms/admin/wishlist-slides/${deleteSlideId}`, {
        method: 'DELETE',
      });
      setDeleteSlideId(null);
      dispatch(pushToast({ variant: 'info', message: 'Wishlist slide deleted.' }));
      loadSlides();
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Unable to delete slide.',
        })
      );
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await apiRequest<{ sliderSettings: WishlistSliderSettings }>(
        '/api/cms/admin/wishlist-slides/settings',
        {
          method: 'PUT',
          body: JSON.stringify(settings),
        }
      );
      setSettings(res.sliderSettings);
      dispatch(pushToast({ variant: 'success', message: 'Slideshow timing settings saved.' }));
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Unable to save slideshow settings.',
        })
      );
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Slideshow Settings Bar */}
      <form
        onSubmit={handleSaveSettings}
        className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              Wishlist Hero Slideshow Behavior
            </h2>
            <p className="text-xs text-slate-500">
              Control automatic rotation and transition duration for the Customer Wishlist top banner.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={settings.autoplay}
              onChange={(e) => setSettings((s) => ({ ...s, autoplay: e.target.checked }))}
              className="rounded border-slate-300 text-emerald-600"
            />
            <span>Autoplay Slides</span>
          </label>

          <div className="flex items-center gap-2">
            <label htmlFor="wishlist-slide-duration" className="text-xs font-semibold text-slate-700">
              Duration (ms)
            </label>
            <input
              id="wishlist-slide-duration"
              type="number"
              min={1500}
              max={20000}
              step={500}
              value={settings.transitionDurationMs}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  transitionDurationMs: Number(e.target.value) || 5000,
                }))
              }
              className="w-24 h-9 px-2.5 rounded-lg border border-slate-200 text-xs font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={savingSettings}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-60"
          >
            {savingSettings ? 'Saving...' : 'Save Timing'}
          </button>
        </div>
      </form>

      {/* Slides List */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Wishlist Hero Slides</h2>
            <p className="text-xs text-slate-500">
              Create, reorder, preview, schedule, and publish hero slides displayed on `/account/wishlist`.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openModal()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>Add Hero Slide</span>
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((n) => (
              <div key={n} className="h-20 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : slides.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl space-y-2">
            <p className="text-sm font-semibold text-slate-700">No wishlist slides configured</p>
            <p className="text-xs text-slate-500">Add a hero slide to showcase at the top of the Wishlist page.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {slides.map((slide, idx) => (
              <div
                key={slide._id}
                className="py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-28 h-16 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                    <SafeImage
                      src={slide.desktopImageUrl}
                      alt={slide.altText}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono text-slate-400">#{idx + 1}</span>
                      <p className="text-sm font-bold text-slate-900 truncate">{slide.title}</p>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          slide.isActive
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {slide.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{slide.subtitle}</p>
                    {slide.ctaText && (
                      <p className="text-[11px] font-mono text-emerald-700 mt-0.5">
                        CTA: {slide.ctaText} → {slide.ctaDestination || 'No link'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => void handleMove(idx, -1)}
                    aria-label={`Move ${slide.title} up`}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-35"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === slides.length - 1}
                    onClick={() => void handleMove(idx, 1)}
                    aria-label={`Move ${slide.title} down`}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-35"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(slide)}
                    aria-label={slide.isActive ? `Disable ${slide.title}` : `Enable ${slide.title}`}
                    title={slide.isActive ? 'Disable slide' : 'Enable slide'}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
                  >
                    {slide.isActive ? (
                      <Eye className="w-3.5 h-3.5 text-emerald-700" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => openModal(slide)}
                    aria-label={`Edit ${slide.title}`}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteSlideId(slide._id)}
                    aria-label={`Delete ${slide.title}`}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-red-50 text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Slide Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingSlide ? 'Edit Wishlist Hero Slide' : 'Create Wishlist Hero Slide'}
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={handleSaveSlide} className="space-y-4">
          {/* Live Hero Preview */}
          <div className="relative rounded-xl overflow-hidden border border-[#CFE4D5] bg-gradient-to-r from-[#DCEEE1] via-[#EBF6EE] to-[#F5FBF7] p-5 min-h-[140px] flex items-center">
            <div className="absolute inset-0 pointer-events-none">
              <SafeImage
                src={form.desktopImageUrl}
                alt={form.altText || form.title || 'Slide preview'}
                className="w-full h-full object-cover object-right opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#EBF6EE] via-[#EBF6EE]/92 to-[#EBF6EE]/20" />
            </div>
            <div className="relative z-10 max-w-md space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#15803D]">
                Live Slide Preview
              </p>
              <p className="text-xl font-extrabold text-[#0F2A1A]">
                {form.title || 'Slide Headline'}
              </p>
              <p className="text-xs text-slate-700">
                {form.subtitle || 'Slide subtitle appears here.'}
              </p>
              {form.ctaText && (
                <span className="inline-block mt-1 px-3 py-1 rounded-lg bg-[#15803D] text-white text-[11px] font-semibold">
                  {form.ctaText}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Headline
              </label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="My Wishlist"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Subtitle
              </label>
              <input
                type="text"
                value={form.subtitle}
                onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                placeholder="Your favorite products, all in one place."
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                CTA Button Text (Optional)
              </label>
              <input
                type="text"
                value={form.ctaText}
                onChange={(e) => setForm((f) => ({ ...f, ctaText: e.target.value }))}
                placeholder="Explore Deals"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                CTA Destination URL
              </label>
              <input
                type="text"
                value={form.ctaDestination}
                onChange={(e) => setForm((f) => ({ ...f, ctaDestination: e.target.value }))}
                placeholder="/shop?onSale=true"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Display Order
              </label>
              <input
                type="number"
                min={0}
                value={form.displayOrder}
                onChange={(e) =>
                  setForm((f) => ({ ...f, displayOrder: Number(e.target.value) || 0 }))
                }
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">Desktop Banner Image</label>
                <CloudinaryUploadField
                  folder="wishlist"
                  label="Upload Desktop"
                  onUploaded={(asset) =>
                    setForm((f) => ({
                      ...f,
                      desktopImageUrl: asset.url,
                      desktopImagePublicId: asset.publicId,
                    }))
                  }
                />
              </div>
              <input
                type="text"
                required
                value={form.desktopImageUrl}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    desktopImageUrl: e.target.value,
                    desktopImagePublicId: '',
                  }))
                }
                placeholder="https://... or /src/assets/..."
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs font-mono"
              />
            </div>

            <div className="p-3 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">
                  Mobile Image (Optional)
                </label>
                <CloudinaryUploadField
                  folder="wishlist"
                  label="Upload Mobile"
                  onUploaded={(asset) =>
                    setForm((f) => ({
                      ...f,
                      mobileImageUrl: asset.url,
                      mobileImagePublicId: asset.publicId,
                    }))
                  }
                />
              </div>
              <input
                type="text"
                value={form.mobileImageUrl}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    mobileImageUrl: e.target.value,
                    mobileImagePublicId: '',
                  }))
                }
                placeholder="Leave blank to reuse desktop image"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alt Text (Accessibility)
              </label>
              <input
                type="text"
                required
                value={form.altText}
                onChange={(e) => setForm((f) => ({ ...f, altText: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Schedule Start (Optional)
              </label>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Schedule End (Optional)
              </label>
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            <span>Slide is active and visible on Customer Wishlist page</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingSlide}
              className="px-5 py-2 rounded-lg bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-60"
            >
              {savingSlide ? 'Saving...' : 'Save Slide'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteSlideId)}
        onClose={() => setDeleteSlideId(null)}
        onConfirm={handleDeleteSlide}
        title="Delete Wishlist Slide"
        message="Permanently delete this hero slide from the Wishlist slideshow?"
        confirmLabel="Delete Slide"
        danger
      />
    </div>
  );
}
