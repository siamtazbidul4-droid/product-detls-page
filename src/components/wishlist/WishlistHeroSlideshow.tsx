import { useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { sanitizeHref } from '../../../shared/security.ts';
import type { WishlistHeroSlide, WishlistSliderSettings } from '../../types/domain.ts';
import { SafeImage } from '../ui/SafeImage.tsx';

interface WishlistHeroSlideshowProps {
  slides: WishlistHeroSlide[];
  settings: WishlistSliderSettings;
  loading?: boolean;
}

export function WishlistHeroSlideshow({
  slides,
  settings,
  loading = false,
}: WishlistHeroSlideshowProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const safeLength = slides.length;
  const boundedIndex = safeLength > 0 ? activeIndex % safeLength : 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [safeLength]);

  useEffect(() => {
    if (!settings.autoplay || safeLength <= 1 || isPaused) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const intervalMs = Math.min(20000, Math.max(1500, settings.transitionDurationMs || 5000));
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % safeLength);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [settings.autoplay, settings.transitionDurationMs, safeLength, isPaused]);

  if (loading) {
    return (
      <div className="w-full h-[210px] sm:h-[245px] lg:h-[268px] bg-[#E3F1E7] animate-pulse" />
    );
  }

  if (safeLength === 0) {
    return null;
  }

  const activeSlide = slides[boundedIndex];
  const ctaHref = sanitizeHref(activeSlide.ctaDestination);

  const handlePrev = () => {
    setActiveIndex((prev) => (prev - 1 + safeLength) % safeLength);
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev + 1) % safeLength);
  };

  return (
    <section
      aria-label="Wishlist Hero Slideshow"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
      className="relative w-full overflow-hidden bg-gradient-to-r from-[#DCEEE1] via-[#EBF6EE] to-[#F5FBF7] border-b border-[#D5E6DA]"
    >
      {/* Full-Width Edge-to-Edge Responsive Artwork */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
        <picture className="block w-full h-full">
          {activeSlide.mobileImageUrl && (
            <source media="(max-width: 767px)" srcSet={activeSlide.mobileImageUrl} />
          )}
          <SafeImage
            src={activeSlide.desktopImageUrl}
            alt={activeSlide.altText || activeSlide.title}
            fallbackLabel={activeSlide.title}
            loading="eager"
            className="w-full h-full object-cover object-right opacity-90 transition-opacity duration-500"
          />
        </picture>
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-[#EBF6EE]/96 via-[#EBF6EE]/88 to-[#EBF6EE]/20"
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto min-h-[210px] sm:min-h-[246px] lg:min-h-[272px] flex items-center px-4 sm:px-6 lg:px-8 pt-8 pb-10 sm:py-11">
        {/* Left Copy Column */}
        <div className="relative z-10 max-w-xl space-y-3 sm:pl-6">
          <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-[#15803D] bg-white/90 border border-[#C7E0CE] px-3 py-1 rounded-md shadow-2xs">
            NOVARA COMMERCE
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold tracking-tight text-[#0F2A1A] leading-[1.12]">
            {activeSlide.title}
          </h1>
          {activeSlide.subtitle && (
            <p className="text-sm sm:text-base text-slate-700 font-medium max-w-md leading-relaxed">
              {activeSlide.subtitle}
            </p>
          )}

          {activeSlide.ctaText && ctaHref && (
            <div className="pt-1">
              {ctaHref.startsWith('/') ? (
                <Link
                  to={ctaHref}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#14532D] text-white text-xs sm:text-sm font-semibold shadow-sm transition-colors"
                >
                  <span>{activeSlide.ctaText}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <a
                  href={ctaHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#14532D] text-white text-xs sm:text-sm font-semibold shadow-sm transition-colors"
                >
                  <span>{activeSlide.ctaText}</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
              )}
            </div>
          )}
        </div>

        {/* Previous / Next Controls */}
        {safeLength > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous slide"
              className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/90 hover:bg-white border border-slate-200 text-slate-700 hover:text-[#15803D] items-center justify-center shadow-sm transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Next slide"
              className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/90 hover:bg-white border border-slate-200 text-slate-700 hover:text-[#15803D] items-center justify-center shadow-sm transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Pagination Dots */}
      {safeLength > 1 && (
        <div
          className="absolute bottom-3.5 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center gap-2"
          role="tablist"
          aria-label="Wishlist slide indicators"
        >
          {slides.map((slide, idx) => (
            <button
              key={slide._id || idx}
              type="button"
              role="tab"
              aria-selected={idx === boundedIndex}
              aria-label={`Go to slide ${idx + 1}: ${slide.title}`}
              onClick={() => setActiveIndex(idx)}
              className={`h-2 rounded-full transition-all ${
                idx === boundedIndex
                  ? 'w-6 bg-[#15803D]'
                  : 'w-2 bg-slate-400/60 hover:bg-slate-600/70'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
