import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Heart,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Package,
  Phone,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Truck,
  User,
  X,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { isStaffRole } from '../../../shared/rbac.ts';
import { useAppDispatch, useAppSelector } from '../../app/hooks.ts';
import { openAuthModal, logoutUser } from '../../features/auth/authSlice.ts';
import { restoreGuestCartOnLogout, setCartDrawerOpen } from '../../features/cart/cartSlice.ts';
import { pushToast } from '../../features/toast/toastSlice.ts';
import { apiRequest, formatBdt } from '../../lib/api.ts';
import type { Category, HomepageConfig, StoreSettings } from '../../types/domain.ts';
import { SafeImage } from '../ui/SafeImage.tsx';

interface SearchSuggestion {
  id: string;
  name: string;
  slug: string;
  imageUrl: string;
  effectivePrice: number;
  originalPrice: number | null;
  discountPercent: number;
}

interface StorefrontHeaderProps {
  categories: Category[];
  homepage?: HomepageConfig | null;
  storeSettings?: StoreSettings | null;
}

export function StorefrontHeader({ categories, homepage, storeSettings }: StorefrontHeaderProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAppSelector((s) => s.auth.user);
  const cartItems = useAppSelector((s) => s.cart.items);
  const guestWishlistIds = useAppSelector((s) => s.wishlist.guestIds);
  const uniqueCartLines = cartItems.length;
  const wishlistCount = user ? user.wishlist?.length || 0 : guestWishlistIds.length;

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [popularSearches, setPopularSearches] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchError, setSearchError] = useState(false);

  const [accountPopupOpen, setAccountPopupOpen] = useState(false);
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const catMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAccountPopupOpen(false);
    setCatMenuOpen(false);
    setMobileMenuOpen(false);
    setDropdownOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (searchContainerRef.current && !searchContainerRef.current.contains(target)) {
        setDropdownOpen(false);
      }
      if (accountRef.current && !accountRef.current.contains(target)) {
        setAccountPopupOpen(false);
      }
      if (catMenuRef.current && !catMenuRef.current.contains(target)) {
        setCatMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Debounced bounded autocomplete search
  useEffect(() => {
    if (!dropdownOpen) return;
    const trimmed = query.trim();
    const timer = window.setTimeout(async () => {
      try {
        setSearchError(false);
        const res = await apiRequest<{ suggestions: SearchSuggestion[]; popularSearches?: string[] }>(
          `/api/catalog/search/suggestions?q=${encodeURIComponent(trimmed)}&limit=8`
        );
        setSuggestions(res.suggestions || []);
        if (res.popularSearches) setPopularSearches(res.popularSearches);
        setActiveIndex(-1);
      } catch {
        setSearchError(true);
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [query, dropdownOpen]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      navigate('/shop');
      return;
    }
    setDropdownOpen(false);
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setDropdownOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDropdownOpen(true);
      setActiveIndex((prev) => Math.min(suggestions.length - 1, prev + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(-1, prev - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0 && suggestions[activeIndex]) {
      e.preventDefault();
      const target = suggestions[activeIndex];
      setDropdownOpen(false);
      navigate(`/product/${target.slug}`);
    }
  };

  const handleProtectedAccountNav = (dest: string) => {
    setAccountPopupOpen(false);
    if (!user) {
      dispatch(openAuthModal({ mode: 'login', returnTo: dest }));
      return;
    }
    navigate(dest);
  };

  const handleLogout = async () => {
    setAccountPopupOpen(false);
    await dispatch(logoutUser());
    dispatch(restoreGuestCartOnLogout());
    dispatch(pushToast({ variant: 'info', message: 'You have been signed out.' }));
    navigate('/');
  };

  const announcementItems = homepage?.announcementItems?.length
    ? homepage.announcementItems
    : [
        { icon: 'truck', text: 'Free Shipping on Orders Over ৳999' },
        { icon: 'rotate', text: '7 Days Easy Return' },
        { icon: 'shield', text: 'Secure Payment' },
      ];

  const announcementPhone =
    homepage?.announcementPhone || storeSettings?.supportPhone || '+880 1700 000000';

  const parentCategories = categories.filter((c) => !c.parentId);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      {/* Top Dark Utility Bar (Matches Reference Image) */}
      <div className="bg-[#0B1A2B] text-white text-xs">
        <div className="max-w-7xl mx-auto px-4 h-9 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 md:gap-6 overflow-x-auto no-scrollbar">
            {announcementItems.map((item, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  idx > 0 ? 'hidden sm:flex border-l border-slate-700 pl-4 md:pl-6' : ''
                }`}
              >
                {item.icon === 'truck' && <Truck className="w-3.5 h-3.5 text-emerald-400" />}
                {item.icon === 'rotate' && <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />}
                {item.icon === 'shield' && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                <span className="text-slate-200 font-medium">{item.text}</span>
              </div>
            ))}
          </div>

          {announcementPhone && (
            <Link
              to="/contact"
              className="flex items-center gap-1.5 text-slate-200 hover:text-white whitespace-nowrap shrink-0 font-medium"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              <span className="tabular-nums">{announcementPhone}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Main White Header Row */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4 lg:gap-8">
        {/* Brand Wordmark */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 shrink">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="lg:hidden p-1.5 sm:p-2 rounded-lg text-slate-700 hover:bg-slate-100 shrink-0"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <Link to="/" className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#16A34A] flex items-center justify-center text-white shadow-xs shrink-0">
              <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[15px] sm:text-xl font-extrabold tracking-tight leading-none whitespace-nowrap">
                <span className="text-slate-900">NOVARA</span>
                <span className="text-[#16A34A]"> COMMERCE</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5 hidden sm:block">
                {storeSettings?.tagline || 'Shop Smart, Live Better'}
              </p>
            </div>
          </Link>
        </div>

        {/* Bounded Cross-Lingual Search Bar */}
        <div ref={searchContainerRef} className="relative flex-1 max-w-2xl hidden md:block">
          <form onSubmit={handleSearchSubmit} className="flex items-center">
            <input
              type="search"
              value={query}
              onFocus={() => setDropdownOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setDropdownOpen(true);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search products in English or বাংলা (e.g. মোটিভেশনাল বই, Smartphone)..."
              aria-label="Search for products"
              aria-expanded={dropdownOpen}
              aria-autocomplete="list"
              className="w-full h-10 pl-4 pr-3 rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 focus:bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
            />
            <button
              type="submit"
              aria-label="Submit search"
              className="h-10 px-4 rounded-r-lg bg-[#16A34A] hover:bg-emerald-700 text-white flex items-center justify-center transition-colors shrink-0"
            >
              <Search className="w-4 h-4" />
            </button>
          </form>

          {dropdownOpen && (
            <div
              role="listbox"
              aria-label="Search suggestions"
              className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-96 overflow-y-auto"
            >
              {searchError ? (
                <div className="p-4 text-sm text-slate-500">
                  Live suggestions unavailable right now. Press Enter to search the catalog.
                </div>
              ) : query.trim().length === 0 ? (
                <div className="p-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">
                    Popular Searches
                  </p>
                  <div className="flex flex-wrap gap-2 px-2 pb-1">
                    {(popularSearches.length > 0
                      ? popularSearches
                      : ['Smartphone', 'মোটিভেশনাল বই', 'Earbuds', 'Backpack']
                    ).map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => {
                          setQuery(term);
                          setDropdownOpen(false);
                          navigate(`/search?q=${encodeURIComponent(term)}`);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-xs font-medium text-slate-700 transition-colors"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              ) : suggestions.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">
                  No quick matches for "{query}". Press Enter to run full search.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {suggestions.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={activeIndex === idx}
                      onClick={() => {
                        setDropdownOpen(false);
                        navigate(`/product/${item.slug}`);
                      }}
                      className={`w-full flex items-center gap-3 p-2.5 text-left transition-colors ${
                        activeIndex === idx ? 'bg-emerald-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-11 h-11 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                        <SafeImage
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-contain p-1"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">{item.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-bold text-emerald-600 tabular-nums">
                            {formatBdt(item.effectivePrice)}
                          </span>
                          {item.originalPrice && item.originalPrice > item.effectivePrice && (
                            <span className="text-xs text-slate-400 line-through tabular-nums">
                              {formatBdt(item.originalPrice)}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
                    }}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 text-center"
                  >
                    View all results for "{query}" →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Account Popup + Wishlist + Redux Cart */}
        <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
          {/* Account Icon Popup */}
          <div ref={accountRef} className="relative">
            <button
              type="button"
              onClick={() => setAccountPopupOpen((v) => !v)}
              aria-expanded={accountPopupOpen}
              aria-label="Account menu"
              className="flex items-center gap-2 px-1 sm:px-2.5 py-1 sm:py-1.5 rounded-lg hover:bg-slate-100 transition-colors text-left"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center text-slate-700 border border-slate-200">
                {user?.avatarUrl ? (
                  <SafeImage
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-4 h-4" />
                )}
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-bold text-slate-900 leading-tight max-w-[110px] truncate">
                  {user ? user.name : 'Account'}
                </p>
                <p className="text-[11px] text-slate-500 leading-tight">
                  {user ? user.role.replace('_', ' ') : 'Login / Register'}
                </p>
              </div>
            </button>

            {accountPopupOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-2"
              >
                {user ? (
                  <div className="px-4 py-2.5 border-b border-slate-100">
                    <p className="text-sm font-bold text-slate-900 truncate">{user.name}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  </div>
                ) : (
                  <div className="px-4 py-3 border-b border-slate-100 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAccountPopupOpen(false);
                        dispatch(openAuthModal({ mode: 'login' }));
                      }}
                      className="w-full py-2 px-3 rounded-lg bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountPopupOpen(false);
                        dispatch(openAuthModal({ mode: 'register' }));
                      }}
                      className="w-full py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
                    >
                      Create Customer Account
                    </button>
                  </div>
                )}

                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => handleProtectedAccountNav('/account')}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                  >
                    <LayoutDashboard className="w-4 h-4 text-slate-400" />
                    <span>My Dashboard</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProtectedAccountNav('/account/orders')}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                  >
                    <Package className="w-4 h-4 text-slate-400" />
                    <span>My Orders / History</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountPopupOpen(false);
                      navigate('/account/wishlist');
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                  >
                    <Heart className="w-4 h-4 text-slate-400" />
                    <span>My Wishlist</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProtectedAccountNav('/account/addresses')}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                  >
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <span>Saved Addresses</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProtectedAccountNav('/account/settings')}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    <span>Account Settings</span>
                  </button>

                  {user && isStaffRole(user.role) && (
                    <Link
                      to="/admin"
                      onClick={() => setAccountPopupOpen(false)}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      <span>Admin Operations Panel</span>
                    </Link>
                  )}

                  {user && (
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 text-left border-t border-slate-100 mt-1 pt-2"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Wishlist Icon */}
          <button
            type="button"
            onClick={() => navigate('/account/wishlist')}
            aria-label={`Wishlist (${wishlistCount} items)`}
            className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-700 transition-colors"
          >
            <Heart className="w-4 h-4" />
            {wishlistCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {wishlistCount}
              </span>
            )}
          </button>

          {/* Redux Cart Icon (Badge reflects unique cart lines!) */}
          <button
            type="button"
            onClick={() => dispatch(setCartDrawerOpen(true))}
            aria-label={`Shopping cart (${uniqueCartLines} items)`}
            data-testid="header-cart-button"
            className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-700 transition-colors"
          >
            <ShoppingCart className="w-4 h-4" />
            {uniqueCartLines > 0 && (
              <span
                data-testid="cart-badge-count"
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums"
              >
                {uniqueCartLines}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Category Navigation Bar (Matches Reference Image) */}
      <div className="border-t border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between gap-6">
          <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
            <div ref={catMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setCatMenuOpen((v) => !v)}
                aria-expanded={catMenuOpen}
                className="h-9 px-4 rounded-lg bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Menu className="w-4 h-4" />
                <span>All Categories</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {catMenuOpen && (
                <div className="fixed left-4 sm:left-auto mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-2">
                  {parentCategories.length === 0 ? (
                    <Link
                      to="/shop"
                      onClick={() => setCatMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Browse All Products
                    </Link>
                  ) : (
                    parentCategories.map((cat) => (
                      <Link
                        key={cat._id}
                        to={`/category/${cat.slug}`}
                        onClick={() => setCatMenuOpen(false)}
                        className="flex items-center justify-between px-4 py-2 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        <span>{cat.name}</span>
                        {cat.nameBn && <span className="text-xs text-slate-400">{cat.nameBn}</span>}
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>

            <nav aria-label="Primary" className="hidden lg:flex items-center gap-6 text-sm font-medium">
              <Link
                to="/"
                className={`whitespace-nowrap shrink-0 px-3 py-1 rounded-md transition-colors ${
                  location.pathname === '/'
                    ? 'bg-emerald-50 text-emerald-700 font-semibold'
                    : 'text-slate-700 hover:text-emerald-700'
                }`}
              >
                Home
              </Link>
              <Link
                to="/shop"
                className={`whitespace-nowrap shrink-0 transition-colors ${
                  location.pathname === '/shop'
                    ? 'text-emerald-700 font-semibold'
                    : 'text-slate-700 hover:text-emerald-700'
                }`}
              >
                Shop
              </Link>
              <Link
                to="/shop?onSale=true"
                className="text-slate-700 hover:text-emerald-700 whitespace-nowrap shrink-0 transition-colors"
              >
                Deals
              </Link>
              <Link
                to="/policies/about"
                className="text-slate-700 hover:text-emerald-700 whitespace-nowrap shrink-0 transition-colors"
              >
                About Us
              </Link>
              <Link
                to="/track-order"
                className="text-slate-700 hover:text-emerald-700 whitespace-nowrap shrink-0 transition-colors"
              >
                Track Order
              </Link>
              <Link
                to="/contact"
                className="text-slate-700 hover:text-emerald-700 whitespace-nowrap shrink-0 transition-colors"
              >
                Contact Us
              </Link>
            </nav>
          </div>

          {user && isStaffRole(user.role) && (
            <Link
              to="/admin"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap shrink-0"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Admin Panel</span>
            </Link>
          )}
        </div>
      </div>

      {/* Mobile Search + Drawer */}
      <div className="md:hidden px-4 pb-3 bg-white border-t border-slate-100">
        <form onSubmit={handleSearchSubmit} className="flex items-center pt-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products..."
            aria-label="Mobile search"
            className="w-full h-9 pl-3 pr-2 rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 text-sm"
          />
          <button
            type="submit"
            aria-label="Search"
            className="h-9 px-3.5 rounded-r-lg bg-[#16A34A] text-white"
          >
            <Search className="w-4 h-4" />
          </button>
        </form>
      </div>

      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-2">
          <Link to="/" className="block py-2 text-sm font-medium text-slate-800">
            Home
          </Link>
          <Link to="/shop" className="block py-2 text-sm font-medium text-slate-800">
            Shop All
          </Link>
          <Link to="/shop?onSale=true" className="block py-2 text-sm font-medium text-slate-800">
            Deals & Flash Sales
          </Link>
          <Link to="/policies/about" className="block py-2 text-sm font-medium text-slate-800">
            About Us
          </Link>
          <Link to="/track-order" className="block py-2 text-sm font-medium text-slate-800">
            Track Order
          </Link>
          <Link to="/contact" className="block py-2 text-sm font-medium text-slate-800">
            Contact Us
          </Link>
          {user && isStaffRole(user.role) && (
            <Link to="/admin" className="block py-2 text-sm font-semibold text-emerald-700">
              Admin Operations Panel
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
