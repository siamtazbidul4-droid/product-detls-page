import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from './app/hooks.ts';
import { AuthModal } from './components/auth/AuthModal.tsx';
import { CartDrawer } from './components/layout/CartDrawer.tsx';
import { StorefrontFooter } from './components/layout/StorefrontFooter.tsx';
import { StorefrontHeader } from './components/layout/StorefrontHeader.tsx';
import { ToastContainer } from './components/toast/ToastContainer.tsx';
import { fetchCurrentUser } from './features/auth/authSlice.ts';
import { syncServerCart } from './features/cart/cartSlice.ts';
import { apiRequest, ApiError } from './lib/api.ts';
import { AccountPage } from './pages/AccountPage.tsx';
import { AuthActionPage } from './pages/AuthActionPage.tsx';
import { CartPage } from './pages/CartPage.tsx';
import { CatalogPage } from './pages/CatalogPage.tsx';
import { CheckoutPage } from './pages/CheckoutPage.tsx';
import { ContactPage } from './pages/ContactPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { OrderDetailPage } from './pages/OrderDetailPage.tsx';
import { OrderSuccessPage } from './pages/OrderSuccessPage.tsx';
import { PolicyPage } from './pages/PolicyPage.tsx';
import { ProductDetailPage } from './pages/ProductDetailPage.tsx';
import { TrackOrderPage } from './pages/TrackOrderPage.tsx';
import { AdminCategoriesBrandsPage } from './pages/admin/AdminCategoriesBrandsPage.tsx';
import { AdminCmsPage } from './pages/admin/AdminCmsPage.tsx';
import { AdminInventoryPage } from './pages/admin/AdminInventoryPage.tsx';
import { AdminLayout } from './pages/admin/AdminLayout.tsx';
import { AdminMarketingPage } from './pages/admin/AdminMarketingPage.tsx';
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage.tsx';
import { AdminOverviewPage } from './pages/admin/AdminOverviewPage.tsx';
import { AdminPaymentsReportsPage } from './pages/admin/AdminPaymentsReportsPage.tsx';
import { AdminProductsPage } from './pages/admin/AdminProductsPage.tsx';
import { AdminReviewsPage } from './pages/admin/AdminReviewsPage.tsx';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage.tsx';
import { AdminStaffCustomersPage } from './pages/admin/AdminStaffCustomersPage.tsx';
import type {
  Category,
  HomepageConfig,
  PromotionalPlacement,
  StoreSettings,
} from './types/domain.ts';

export default function App() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const user = useAppSelector((s) => s.auth.user);

  const [categories, setCategories] = useState<Category[]>([]);
  const [homepage, setHomepage] = useState<HomepageConfig | null>(null);
  const [activePromotions, setActivePromotions] = useState<PromotionalPlacement[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [dbUnavailable, setDbUnavailable] = useState(false);

  useEffect(() => {
    void dispatch(fetchCurrentUser());

    Promise.all([
      apiRequest<{
        homepage: HomepageConfig | null;
        activePromotions: PromotionalPlacement[];
        storeSettings: StoreSettings;
      }>('/api/cms/public/homepage'),
      apiRequest<{ categories: Category[] }>('/api/catalog/categories'),
    ])
      .then(([cmsRes, catRes]) => {
        setHomepage(cmsRes.homepage);
        setActivePromotions(cmsRes.activePromotions || []);
        setStoreSettings(cmsRes.storeSettings || null);
        setCategories(catRes.categories || []);
        setDbUnavailable(false);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 503) {
          setDbUnavailable(true);
        }
      });
  }, [dispatch]);

  useEffect(() => {
    if (user) {
      void dispatch(syncServerCart());
    }
  }, [user, dispatch]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <>
      {isAdminRoute ? (
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminOverviewPage />} />
            <Route path="products" element={<AdminProductsPage />} />
            <Route path="taxonomy" element={<AdminCategoriesBrandsPage />} />
            <Route path="inventory" element={<AdminInventoryPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="reviews" element={<AdminReviewsPage />} />
            <Route path="marketing" element={<AdminMarketingPage />} />
            <Route path="cms" element={<AdminCmsPage />} />
            <Route path="payments" element={<AdminPaymentsReportsPage />} />
            <Route path="staff" element={<AdminStaffCustomersPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>
        </Routes>
      ) : (
        <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
          <StorefrontHeader
            categories={categories}
            homepage={homepage}
            storeSettings={storeSettings}
          />
          <main className="flex-1">
            <Routes>
              <Route
                path="/"
                element={
                  <HomePage
                    categories={categories}
                    homepage={homepage}
                    activePromotions={activePromotions}
                    dbUnavailable={dbUnavailable}
                  />
                }
              />
              <Route path="/shop" element={<CatalogPage categories={categories} />} />
              <Route path="/deals" element={<CatalogPage categories={categories} defaultOnSale />} />
              <Route path="/brand/:brandSlug" element={<CatalogPage categories={categories} />} />
              <Route path="/category/:slug" element={<CatalogPage categories={categories} />} />
              <Route path="/search" element={<CatalogPage categories={categories} />} />
              <Route path="/product/:slug" element={<ProductDetailPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/checkout" element={<CheckoutPage storeSettings={storeSettings} />} />
              <Route path="/order-success/:orderNumber" element={<OrderSuccessPage />} />
              <Route path="/checkout/success/:orderNumber" element={<OrderSuccessPage />} />
              <Route path="/track-order" element={<TrackOrderPage />} />
              <Route path="/contact" element={<ContactPage storeSettings={storeSettings} />} />
              <Route
                path="/about"
                element={<PolicyPage type="about" storeSettings={storeSettings} />}
              />
              <Route
                path="/policies/about"
                element={<PolicyPage type="about" storeSettings={storeSettings} />}
              />
              <Route
                path="/policies/return"
                element={<PolicyPage type="return" storeSettings={storeSettings} />}
              />
              <Route
                path="/policies/shipping"
                element={<PolicyPage type="shipping" storeSettings={storeSettings} />}
              />
              <Route
                path="/policies/privacy"
                element={<PolicyPage type="privacy" storeSettings={storeSettings} />}
              />
              <Route
                path="/policies/terms"
                element={<PolicyPage type="terms" storeSettings={storeSettings} />}
              />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/account/settings" element={<AccountPage />} />
              <Route path="/account/orders" element={<AccountPage />} />
              <Route path="/account/orders/:orderNumber" element={<OrderDetailPage />} />
              <Route path="/account/addresses" element={<AccountPage />} />
              <Route path="/account/wishlist" element={<AccountPage />} />
              <Route path="/account/reviews" element={<AccountPage />} />
              <Route path="/account/coupons" element={<AccountPage />} />
              <Route path="/wishlist" element={<AccountPage />} />
              <Route path="/verify-email" element={<AuthActionPage mode="verify-email" />} />
              <Route path="/reset-password" element={<AuthActionPage mode="reset-password" />} />
              <Route
                path="*"
                element={
                  <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
                    <p className="text-4xl font-extrabold text-emerald-700 font-mono">404</p>
                    <h1 className="text-2xl font-extrabold text-slate-900">Page Not Found</h1>
                    <p className="text-sm text-slate-600">
                      The requested page does not exist on NOVARA COMMERCE.
                    </p>
                    <Link
                      to="/"
                      className="inline-block px-5 py-2.5 rounded-xl bg-[#16A34A] text-white text-sm font-semibold"
                    >
                      Back to Storefront
                    </Link>
                  </div>
                }
              />
            </Routes>
          </main>
          <StorefrontFooter storeSettings={storeSettings} />
        </div>
      )}

      <CartDrawer />
      <AuthModal />
      <ToastContainer />
    </>
  );
}
