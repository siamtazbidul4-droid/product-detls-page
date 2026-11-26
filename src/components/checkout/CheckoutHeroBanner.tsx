import { ChevronRight, Home, Lock, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CheckoutBannerConfig } from '../../types/domain.ts';
import { SafeImage } from '../ui/SafeImage.tsx';

interface CheckoutHeroBannerProps {
  banner?: CheckoutBannerConfig | null;
}

export function CheckoutHeroBanner({ banner }: CheckoutHeroBannerProps) {
  const config: CheckoutBannerConfig = banner || {
    enabled: true,
    badgeText: 'Secure Checkout',
    heading: 'Checkout',
    subtitle: 'Complete your order quickly and securely',
    desktopImageUrl: '',
    mobileImageUrl: '',
    altText: 'Secure Checkout Banner',
  };

  if (config.enabled === false) {
    return null;
  }

  const hasDesktopImg = Boolean(config.desktopImageUrl);
  const hasMobileImg = Boolean(config.mobileImageUrl);
  const headingTrimmed = (config.heading || 'Checkout').trim();
  const isDefaultCheckoutHeading = headingTrimmed.toLowerCase() === 'checkout';

  return (
    <section
      aria-label="Checkout banner"
      className="relative overflow-hidden bg-gradient-to-r from-[#0B4619] via-[#13722B] to-[#23A43B] text-white"
    >
      {/* Ambient background graphics */}
      {hasDesktopImg && (
        <SafeImage
          src={config.desktopImageUrl}
          alt={config.altText || headingTrimmed}
          className={`absolute inset-0 w-full h-full object-cover ${
            hasMobileImg ? 'hidden sm:block' : 'block'
          }`}
        />
      )}
      {hasMobileImg && (
        <SafeImage
          src={config.mobileImageUrl}
          alt={config.altText || headingTrimmed}
          className="absolute inset-0 w-full h-full object-cover sm:hidden"
        />
      )}

      {/* Atmospheric gradient & readability scrim */}
      <div
        className={`absolute inset-0 ${
          hasDesktopImg || hasMobileImg
            ? 'bg-gradient-to-r from-[#062E14]/90 via-[#0E4F1F]/75 to-[#16A34A]/45'
            : 'bg-[radial-gradient(ellipse_at_top_right,rgba(134,239,172,0.28),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(5,46,22,0.7),transparent_60%)]'
        }`}
      />
      <div className="pointer-events-none absolute -right-24 -top-24 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute left-1/3 -bottom-24 w-80 h-80 rounded-full bg-lime-300/15 blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-4 py-8 sm:py-11 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        {/* Left Copy */}
        <div className="space-y-3 max-w-xl">
          {config.badgeText && (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#16A34A] border border-white/25 text-xs font-bold tracking-wide text-white shadow-sm">
              <ShieldCheck className="w-3.5 h-3.5 text-lime-200" />
              <span>{config.badgeText}</span>
            </span>
          )}

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-none text-white">
            {isDefaultCheckoutHeading ? (
              <>
                Che<span className="text-[#86EFAC]">ckout</span>
              </>
            ) : (
              headingTrimmed
            )}
          </h1>

          {config.subtitle && (
            <p className="text-sm sm:text-base text-emerald-50/90 font-medium">
              {config.subtitle}
            </p>
          )}

          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-emerald-100/90 pt-1">
            <Link to="/" className="inline-flex items-center gap-1 hover:text-white transition-colors">
              <Home className="w-3.5 h-3.5" />
              <span>Home</span>
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-emerald-200/70" />
            <span className="font-semibold text-white">Checkout</span>
          </nav>
        </div>

        {/* Right Security Shield & Bags Graphic (shown when no custom photo overrides it, or complementary visual) */}
        {!hasDesktopImg && (
          <div className="hidden md:flex items-center justify-center shrink-0 pr-4" aria-hidden="true">
            <div className="relative w-56 h-36 flex items-center justify-center">
              {/* Soft podium disc */}
              <div className="absolute bottom-1 w-48 h-9 rounded-full bg-gradient-to-b from-lime-200/40 to-emerald-900/50 border border-white/25 blur-[0.5px]" />
              {/* Shield + Lock SVG */}
              <svg
                viewBox="0 0 220 150"
                className="relative w-56 h-36 drop-shadow-[0_14px_24px_rgba(0,0,0,0.28)]"
                fill="none"
              >
                {/* Green Shield */}
                <path
                  d="M78 16L122 30V69C122 97 103 119 78 128C53 119 34 97 34 69V30L78 16Z"
                  fill="url(#shieldGrad)"
                  stroke="#ECFDF5"
                  strokeWidth="3.5"
                />
                {/* Padlock inside shield */}
                <rect x="64" y="66" width="28" height="24" rx="5" fill="#FFFFFF" />
                <path
                  d="M70 66V58C70 53.5817 73.5817 50 78 50C82.4183 50 86 53.5817 86 58V66"
                  stroke="#FFFFFF"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                />
                <circle cx="78" cy="76" r="2.8" fill="#16A34A" />
                <path d="M78 78V83" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" />

                {/* Shopping Bags Trio */}
                <rect x="114" y="54" width="38" height="58" rx="5" fill="#FFFFFF" />
                <path d="M125 54C125 46 141 46 141 54" stroke="#CBD5E1" strokeWidth="3" strokeLinecap="round" />
                <rect x="144" y="42" width="40" height="72" rx="5" fill="#FACC15" />
                <path d="M155 42C155 33 173 33 173 42" stroke="#FEF08A" strokeWidth="3" strokeLinecap="round" />
                <rect x="172" y="64" width="32" height="48" rx="5" fill="#FB923C" />
                <path d="M180 64C180 57 196 57 196 64" stroke="#FED7AA" strokeWidth="3" strokeLinecap="round" />

                <defs>
                  <linearGradient id="shieldGrad" x1="34" y1="16" x2="122" y2="128" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#4ADE80" />
                    <stop offset="1" stopColor="#15803D" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center">
                <Lock className="w-3.5 h-3.5 text-lime-200" />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
