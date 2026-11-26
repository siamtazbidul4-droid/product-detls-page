import { useState } from 'react';
import {
  ArrowRight,
  Award,
  Camera,
  ChevronDown,
  ChevronUp,
  Heart,
  LayoutDashboard,
  LogIn,
  LogOut,
  MapPin,
  Package,
  Settings,
  Star,
  TicketPercent,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { sanitizeHref } from '../../../shared/security.ts';
import { useAppDispatch, useAppSelector } from '../../app/hooks.ts';
import { logoutUser, openAuthModal } from '../../features/auth/authSlice.ts';
import { restoreGuestCartOnLogout } from '../../features/cart/cartSlice.ts';
import { pushToast } from '../../features/toast/toastSlice.ts';
import type { PromotionalPlacement } from '../../types/domain.ts';
import { SafeImage } from '../ui/SafeImage.tsx';

export type CustomerDashboardTab =
  | 'dashboard'
  | 'orders'
  | 'wishlist'
  | 'reviews'
  | 'addresses'
  | 'coupons'
  | 'settings';

interface CustomerDashboardSidebarProps {
  activeTab: CustomerDashboardTab;
  wishlistCount: number;
  sidebarPromo?: PromotionalPlacement | null;
}

export function CustomerDashboardSidebar({
  activeTab,
  wishlistCount,
  sidebarPromo,
}: CustomerDashboardSidebarProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: Array<{
    id: CustomerDashboardTab;
    label: string;
    to: string;
    icon: typeof LayoutDashboard;
    requiresAuth?: boolean;
    badge?: number;
  }> = [
    { id: 'dashboard', label: 'My Dashboard', to: '/account', icon: LayoutDashboard, requiresAuth: true },
    { id: 'orders', label: 'My Orders', to: '/account/orders', icon: Package, requiresAuth: true },
    {
      id: 'wishlist',
      label: 'My Wishlist',
      to: '/account/wishlist',
      icon: Heart,
      badge: wishlistCount > 0 ? wishlistCount : undefined,
    },
    { id: 'reviews', label: 'My Reviews', to: '/account/reviews', icon: Star, requiresAuth: true },
    { id: 'addresses', label: 'My Addresses', to: '/account/addresses', icon: MapPin, requiresAuth: true },
    { id: 'coupons', label: 'My Coupons', to: '/account/coupons', icon: TicketPercent, requiresAuth: true },
    { id: 'settings', label: 'Account Settings', to: '/account/settings', icon: Settings, requiresAuth: true },
  ];

  const handleNavClick = (item: (typeof navItems)[number]) => {
    setMobileMenuOpen(false);
    if (item.requiresAuth && !user) {
      dispatch(openAuthModal({ mode: 'login', returnTo: item.to }));
      return;
    }
    navigate(item.to);
  };

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    await dispatch(logoutUser());
    dispatch(restoreGuestCartOnLogout());
    dispatch(pushToast({ variant: 'info', message: 'You have been signed out.' }));
    navigate('/');
  };

  const initials = (user?.name || 'Guest').slice(0, 2).toUpperCase();
  const sidebarPromoHref = sanitizeHref(sidebarPromo?.destinationUrl);

  return (
    <aside className="w-full lg:w-[264px] shrink-0 space-y-4">
      <div className="bg-white rounded-2xl border border-[#DCE8DF] shadow-[0_8px_24px_rgba(11,59,34,0.06)] overflow-hidden">
        {/* Deep Forest-Green Customer Profile Header */}
        <div className="bg-gradient-to-br from-[#0B3B22] via-[#11502E] to-[#166534] text-white p-5">
          <div className="flex items-center gap-3.5">
            <div className="relative shrink-0">
              <div className="w-14 h-14 rounded-full bg-white/15 border-2 border-white/50 overflow-hidden flex items-center justify-center text-lg font-extrabold tracking-tight text-white shadow-sm">
                {user?.avatarUrl ? (
                  <SafeImage
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              {user && (
                <button
                  type="button"
                  onClick={() => navigate('/account/settings')}
                  aria-label="Update profile photo"
                  className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-white text-[#0B3B22] hover:bg-emerald-50 flex items-center justify-center shadow-sm"
                >
                  <Camera className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-bold text-base leading-tight truncate text-white">
                {user ? user.name : 'Guest Shopper'}
              </p>
              <p className="text-xs text-emerald-100/85 truncate mt-0.5">
                {user ? user.email : 'Sign in to sync wishlist'}
              </p>
              <div className="mt-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-200/30 text-[11px] font-semibold text-amber-200">
                  <Award className="w-3 h-3 text-amber-300" />
                  <span>{user ? user.membershipTier || 'Verified Member' : 'Guest Wishlist'}</span>
                </span>
              </div>
            </div>
          </div>

          {!user && (
            <button
              type="button"
              onClick={() => dispatch(openAuthModal({ mode: 'login', returnTo: '/account/wishlist' }))}
              className="mt-4 w-full py-2 px-3 rounded-xl bg-white text-[#0B3B22] hover:bg-emerald-50 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In & Sync Wishlist</span>
            </button>
          )}
        </div>

        {/* Mobile Toggle Bar */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-expanded={mobileMenuOpen}
          className="lg:hidden w-full flex items-center justify-between px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 bg-slate-50/70"
        >
          <span>Customer Menu</span>
          {mobileMenuOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {/* Vertical Dashboard Menu */}
        <nav
          aria-label="Customer dashboard navigation"
          className={`${mobileMenuOpen ? 'block' : 'hidden'} lg:block p-2.5 space-y-1`}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item)}
                className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl text-sm transition-colors text-left ${
                  isActive
                    ? 'bg-[#EAF7EE] text-[#14532D] font-bold border-l-4 border-[#15803D]'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-[#15803D]' : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && (
                  <span className="px-2 py-0.5 rounded-full bg-[#15803D] text-white text-[10px] font-bold tabular-nums">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {user && (
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors text-left border-t border-slate-100 mt-1.5 pt-3"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Logout</span>
            </button>
          )}
        </nav>
      </div>

      {/* Optional Admin-Controlled Sidebar Promo Card */}
      {sidebarPromo && sidebarPromoHref && (
        <div className="bg-gradient-to-br from-[#EAF7EE] to-[#F7FBF8] border border-[#CFE4D5] rounded-2xl p-5 text-center space-y-3 shadow-xs">
          {sidebarPromo.imageUrl && (
            <div className="w-14 h-14 mx-auto rounded-xl overflow-hidden bg-white border border-[#DCE8DF] p-1">
              <SafeImage
                src={sidebarPromo.imageUrl}
                alt={sidebarPromo.altText || sidebarPromo.title}
                className="w-full h-full object-contain"
              />
            </div>
          )}
          <div className="space-y-1">
            <p className="text-sm font-extrabold text-[#0F2A1A]">{sidebarPromo.title}</p>
            {sidebarPromo.subtitle && (
              <p className="text-xs text-slate-600 leading-relaxed">{sidebarPromo.subtitle}</p>
            )}
          </div>
          {sidebarPromoHref.startsWith('/') ? (
            <Link
              to={sidebarPromoHref}
              className="inline-flex items-center justify-center gap-1.5 w-full py-2 px-4 rounded-xl bg-[#15803D] hover:bg-[#14532D] text-white text-xs font-semibold transition-colors"
            >
              <span>{sidebarPromo.ctaText || 'Explore Now'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <a
              href={sidebarPromoHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 w-full py-2 px-4 rounded-xl bg-[#15803D] hover:bg-[#14532D] text-white text-xs font-semibold transition-colors"
            >
              <span>{sidebarPromo.ctaText || 'Explore Now'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}
    </aside>
  );
}
