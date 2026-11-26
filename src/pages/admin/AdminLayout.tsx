import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Boxes,
  CheckCheck,
  CreditCard,
  LayoutDashboard,
  Megaphone,
  Menu,
  MessageSquareText,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Star,
  Tag,
  Users,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { hasPermission, isStaffRole, type Permission } from '../../../shared/rbac.ts';
import { useAppDispatch, useAppSelector } from '../../app/hooks.ts';
import { SeoHead } from '../../components/ui/SeoHead.tsx';
import { openAuthModal } from '../../features/auth/authSlice.ts';
import { apiRequest } from '../../lib/api.ts';
import type { AdminNotificationItem } from '../../types/domain.ts';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission: Permission;
  end?: boolean;
}

const ADMIN_NAV_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, permission: 'dashboard:view', end: true },
  { to: '/admin/products', label: 'Products', icon: Package, permission: 'catalog:read' },
  { to: '/admin/taxonomy', label: 'Categories & Brands', icon: Tag, permission: 'catalog:write' },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes, permission: 'inventory:read' },
  { to: '/admin/orders', label: 'Orders & Returns', icon: ShoppingBag, permission: 'orders:read' },
  { to: '/admin/reviews', label: 'Reviews Queue', icon: Star, permission: 'reviews:moderate' },
  { to: '/admin/marketing', label: 'Coupons & Offers', icon: Megaphone, permission: 'coupons:write' },
  { to: '/admin/cms', label: 'Homepage & Promos', icon: MessageSquareText, permission: 'cms:write' },
  { to: '/admin/payments', label: 'Payments & Reports', icon: CreditCard, permission: 'payments:read' },
  { to: '/admin/staff', label: 'Customers, Staff & Logs', icon: Users, permission: 'customers:read' },
  { to: '/admin/settings', label: 'Store Settings', icon: Settings, permission: 'settings:write' },
];

export function AdminLayout() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, initialized } = useAppSelector((s) => s.auth);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const canReadOrders = Boolean(user && isStaffRole(user.role) && hasPermission(user.role, 'orders:read'));

  const loadNotifications = useCallback(() => {
    if (!canReadOrders) return;
    apiRequest<{ notifications: AdminNotificationItem[]; unreadCount: number }>(
      '/api/orders/admin/notifications'
    )
      .then((res) => {
        setNotifications(res.notifications || []);
        setUnreadCount(res.unreadCount || 0);
      })
      .catch(() => {
        // Silent graceful degradation if backend database is offline
      });
  }, [canReadOrders]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications, location.pathname]);

  const handleMarkRead = async (item: AdminNotificationItem) => {
    setNotificationsOpen(false);
    if (!item.isRead) {
      setNotifications((prev) =>
        prev.map((n) => (n._id === item._id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await apiRequest(`/api/orders/admin/notifications/${item._id}/read`, {
          method: 'PATCH',
        });
      } catch {
        // Ignore transient mark-read failure
      }
    }
    navigate('/admin/orders');
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await apiRequest('/api/orders/admin/notifications/read-all', { method: 'POST' });
    } catch {
      // Ignore transient mark-all failure
    }
  };

  if (initialized && (!user || !isStaffRole(user.role))) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <SeoHead title="Admin Access Required" />
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm space-y-4">
          <ShieldCheck className="w-12 h-12 text-emerald-600 mx-auto" />
          <h1 className="text-xl font-extrabold text-slate-900">
            NOVARA Admin Operations
          </h1>
          <p className="text-sm text-slate-600">
            {user
              ? `Signed in as ${user.email} (${user.role}). Staff RBAC permissions are required to enter the Admin Panel.`
              : 'Sign in with a verified staff or Super Admin account to manage NOVARA COMMERCE.'}
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {!user && (
              <button
                type="button"
                onClick={() => dispatch(openAuthModal({ mode: 'login', returnTo: location.pathname }))}
                className="px-5 py-2.5 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-semibold"
              >
                Staff Sign In
              </button>
            )}
            <Link
              to="/"
              className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold"
            >
              Return to Storefront
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-emerald-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  const visibleNav = ADMIN_NAV_ITEMS.filter((item) => hasPermission(user.role, item.permission));
  const currentTitle =
    visibleNav.find((n) =>
      n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)
    )?.label || 'Admin Operations';

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      <SeoHead title={`${currentTitle} — Admin`} />

      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0B1A2B] text-slate-200 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <Link to="/admin" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#16A34A] text-white flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-white tracking-tight">NOVARA ADMIN</p>
              <p className="text-[10px] text-emerald-400 uppercase tracking-wider">
                {user.role.replace(/_/g, ' ')}
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 text-slate-400 hover:text-white"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#16A34A] text-white font-semibold'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <Link
            to="/"
            className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Storefront
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open admin menu"
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-extrabold text-slate-900">{currentTitle}</h1>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                NOVARA COMMERCE · Bangladesh Retail Operations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {canReadOrders && (
              <div className="relative">
                <button
                  type="button"
                  aria-label="Admin notifications"
                  aria-expanded={notificationsOpen}
                  onClick={() => {
                    const next = !notificationsOpen;
                    setNotificationsOpen(next);
                    if (next) loadNotifications();
                  }}
                  className="relative p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setNotificationsOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-40 overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-900">
                          Order Notifications ({unreadCount} unread)
                        </span>
                        {unreadCount > 0 && (
                          <button
                            type="button"
                            onClick={handleMarkAllRead}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            Mark all read
                          </button>
                        )}
                      </div>
                      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                        {notifications.length === 0 ? (
                          <p className="p-6 text-center text-xs text-slate-500">
                            No notifications yet.
                          </p>
                        ) : (
                          notifications.map((item) => (
                            <button
                              key={item._id}
                              type="button"
                              onClick={() => void handleMarkRead(item)}
                              className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                                item.isRead ? 'bg-white' : 'bg-emerald-50/40'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-slate-900">
                                  {item.title}
                                </span>
                                {!item.isRead && (
                                  <span className="w-2 h-2 rounded-full bg-[#16A34A] shrink-0" />
                                )}
                              </div>
                              <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">
                                {item.message}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-1">
                                {new Date(item.createdAt).toLocaleString()}
                              </p>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-900">{user.name}</p>
              <p className="text-[11px] text-slate-500">{user.email}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
